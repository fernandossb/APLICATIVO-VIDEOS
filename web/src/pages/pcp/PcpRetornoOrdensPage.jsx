import { useEffect, useMemo, useRef, useState } from "react";
import { montarAcompanhamento } from "../../lib/pcp/ordens";
import { buscarComCache } from "../../lib/pcp/buscar";
import StatCard from "../../components/charts/StatCard";

const ALTURA_LINHA = 40;
const RESERVA = 35;

function inteiro(valor) {
  return Math.round(valor || 0).toLocaleString("pt-BR");
}

function dataBr(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

function folgaRotulo(linha) {
  if (linha.folgaDias === null) return "sem pedido";
  if (linha.folgaDias < 0) return `${Math.abs(linha.folgaDias)} dia(s) atrasado`;
  if (linha.folgaDias === 0) return "no limite";
  return `${linha.folgaDias} dia(s) folga`;
}

function badgeRisco(risco) {
  if (risco === "critico") return <span className="status-pill danger">Crítico</span>;
  if (risco === "atencao") return <span className="status-pill warning">Atenção</span>;
  if (risco === "normal") return <span className="status-pill success">No prazo</span>;
  return <span className="status-pill">Sem pedido</span>;
}

export default function PcpRetornoOrdensPage() {
  const [ordens, setOrdens] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroRisco, setFiltroRisco] = useState("todos");
  const [filtroFaccao, setFiltroFaccao] = useState("todas");

  const wrapRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaJanela, setAlturaJanela] = useState(600);
  const pendenteRolagemRef = useRef(null);

  const carregarDados = () => {
    setCarregando(true);
    buscarComCache("/api/ordens")
      .then((corpo) => {
        setOrdens(corpo.ordens ?? []);
        setPedidos(corpo.pedidos ?? []);
      })
      .catch((e) => {
        setErro(e instanceof Error ? e.message : "Falha ao carregar.");
      })
      .finally(() => {
        setCarregando(false);
      });
  };

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const medir = () => setAlturaJanela(el.clientHeight || 600);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [carregando]);

  function aoRolar(e) {
    const pos = e.currentTarget.scrollTop;
    if (pendenteRolagemRef.current !== null) return;
    pendenteRolagemRef.current = requestAnimationFrame(() => {
      setScrollTop(pos);
      pendenteRolagemRef.current = null;
    });
  }

  const fila = useMemo(() => montarAcompanhamento(ordens, pedidos), [ordens, pedidos]);

  const faccoes = useMemo(
    () => [...new Set(fila.map((o) => o.faccao).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [fila],
  );

  const filtrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return fila.filter((o) => {
      if (filtroRisco !== "todos" && o.risco !== filtroRisco) return false;
      if (filtroFaccao !== "todas" && o.faccao !== filtroFaccao) return false;
      if (!termo) return true;
      return `${o.op} ${o.referencia} ${o.cor} ${o.corNome} ${o.descricao} ${o.faccao} ${o.pedidoMaisUrgente}`
        .toLowerCase()
        .includes(termo);
    });
  }, [fila, busca, filtroRisco, filtroFaccao]);

  const resumo = useMemo(() => {
    let criticas = 0;
    let atrasadas = 0;
    let pecas = 0;
    let comPedido = 0;
    for (const o of filtrada) {
      pecas += o.quantPendente;
      if (o.risco === "critico") criticas += 1;
      if (o.atrasadoRetorno) atrasadas += 1;
      if (o.risco !== "sem-pedido") comPedido += 1;
    }
    return { criticas, atrasadas, pecas, comPedido };
  }, [filtrada]);

  const primeiroIndice = Math.max(0, Math.floor(scrollTop / ALTURA_LINHA) - RESERVA);
  const ultimoIndice = Math.min(filtrada.length, Math.ceil((scrollTop + alturaJanela) / ALTURA_LINHA) + RESERVA);
  const janela = filtrada.slice(primeiroIndice, ultimoIndice);
  const alturaAntes = primeiroIndice * ALTURA_LINHA;
  const alturaDepois = (filtrada.length - ultimoIndice) * ALTURA_LINHA;

  function exportar() {
    if (filtrada.length === 0) return;
    const cabecalho = [
      "Ordem",
      "OP",
      "Referencia",
      "Cor",
      "Tamanhos",
      "Pendente",
      "Faccao",
      "Saida",
      "Retorno previsto",
      "Dias pendente",
      "Pedido mais urgente",
      "Entrega",
      "Folga",
      "Em pedido",
      "Risco",
    ];
    const corpo = filtrada.map((o, i) =>
      [
        i + 1,
        o.op,
        o.referencia,
        o.corNome || o.cor,
        o.tamanhos,
        Math.round(o.quantPendente),
        o.faccao,
        dataBr(o.dtSaida),
        dataBr(o.dtRetorno),
        o.diasPendente,
        o.pedidoMaisUrgente || "—",
        dataBr(o.dtEntregaPedidoMaisUrgente),
        folgaRotulo(o),
        Math.round(o.quantComprometida),
        o.risco,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const url = URL.createObjectURL(
      new Blob([[cabecalho.join(";"), ...corpo].join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `retorno-ordens-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="workspace">
      <header className="topbar no-print">
        <div className="sheet-header-inline">
          <p className="overline">PCP · Monitoramento de Facções</p>
          <h1>Retorno de Ordens de Produção (OPs)</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="button button-outline" onClick={exportar} disabled={filtrada.length === 0}>
            📥 Exportar CSV
          </button>
          <button type="button" className="button button-outline" onClick={() => window.print()} disabled={filtrada.length === 0}>
            🖨 Imprimir
          </button>
          <button
            type="button"
            className="button button-outline button-icon"
            onClick={carregarDados}
            title="Recarregar"
          >
            🔄
          </button>
          <span className="status-pill">{inteiro(filtrada.length)} OPs exibidas</span>
        </div>
      </header>

      <section
        className="content-panel"
        style={{
          display: "flex",
          flexDirection: "column",
          margin: "14px 20px 16px",
        }}
      >
        {erro && (
          <div className="faixa-aviso erro no-print" style={{ marginBottom: 14 }}>
            <span>{erro}</span>
          </div>
        )}

        {/* Estatísticas */}
        {!carregando && fila.length > 0 && (
          <div className="dashboard-stats" style={{ marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
            <StatCard
              icon="🚨"
              label="OPs com risco crítico"
              value={inteiro(resumo.criticas)}
              tone="danger"
            />
            <StatCard
              icon="⏰"
              label="Retorno vencido na facção"
              value={inteiro(resumo.atrasadas)}
              tone="warning"
            />
            <StatCard
              icon="📦"
              label="Total de peças pendentes"
              value={`${inteiro(resumo.pecas)} pçs`}
              tone="info"
            />
            <StatCard
              icon="🛒"
              label="OPs com pedidos vinculados"
              value={inteiro(resumo.comPedido)}
              tone="success"
            />
          </div>
        )}

        {/* Filtros */}
        <div
          className="filter-panel"
          style={{
            padding: "8px 14px",
            marginBottom: 12,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 240 }}>
            <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>BUSCA:</span>
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              placeholder="OP, produto, cor ou facção..."
              style={{ height: 32, padding: "4px 10px", fontSize: 13 }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>RISCO:</span>
            <select
              value={filtroRisco}
              onChange={(e) => {
                setFiltroRisco(e.target.value);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              style={{ width: "auto", height: 32, padding: "2px 8px", fontSize: 12.5 }}
            >
              <option value="todos">Todos os riscos</option>
              <option value="critico">🚨 Apenas críticos</option>
              <option value="atencao">⚠️ Apenas atenção</option>
              <option value="normal">✅ Apenas no prazo</option>
              <option value="sem-pedido">Apenas sem pedido</option>
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>FACÇÃO:</span>
            <select
              value={filtroFaccao}
              onChange={(e) => {
                setFiltroFaccao(e.target.value);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              style={{ width: "auto", height: 32, padding: "2px 8px", fontSize: 12.5 }}
            >
              <option value="todas">Todas as facções ({faccoes.length})</option>
              {faccoes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Tabela com Scroll Responsivo e Windowing Estável */}
        <div
          className="table-scroll"
          ref={wrapRef}
          onScroll={aoRolar}
          style={{
            height: "calc(100vh - 290px)",
            minHeight: 460,
            overflow: "auto",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            background: "#fff",
          }}
        >
          {carregando ? (
            <div className="empty-state" style={{ padding: 48, textAlign: "center" }}>
              Carregando ordens de produção pendentes...
            </div>
          ) : filtrada.length === 0 ? (
            <div className="empty-state" style={{ padding: 48, textAlign: "center" }}>
              <strong>Nenhuma OP pendente encontrada.</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {fila.length === 0
                  ? "Importe o relatório de ORDENS PENDENTES (3011) na tela Importar."
                  : "Nenhuma ordem corresponde aos filtros selecionados."}
              </p>
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                minWidth: 1240,
                borderCollapse: "collapse",
                tableLayout: "fixed",
                fontSize: 12.5,
              }}
            >
              <colgroup>
                <col style={{ width: 80 }} />
                <col style={{ width: 105 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 85 }} />
                <col style={{ width: 95 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 95 }} />
                <col style={{ width: 105 }} />
                <col style={{ width: 70 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 115 }} />
                <col style={{ width: 95 }} />
              </colgroup>
              <thead>
                <tr
                  style={{
                    background: "var(--sheet-header-bg, #f1f5f9)",
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    height: 38,
                    borderBottom: "2px solid var(--line)",
                  }}
                >
                  <th style={{ textAlign: "left", padding: "0 8px" }}>OP</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Referência</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Cor</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Grade</th>
                  <th style={{ textAlign: "right", padding: "0 8px" }}>Pendente</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Facção</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Saída</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Retorno prev.</th>
                  <th style={{ textAlign: "right", padding: "0 8px" }}>Dias</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Pedido urg.</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Entrega</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Folga</th>
                  <th style={{ textAlign: "center", padding: "0 4px" }}>Risco</th>
                </tr>
              </thead>
              <tbody>
                {alturaAntes > 0 && (
                  <tr aria-hidden="true" style={{ height: alturaAntes }}>
                    <td colSpan={13} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
                {janela.map((o) => (
                  <tr
                    key={o.op}
                    style={{
                      height: ALTURA_LINHA,
                      borderBottom: "1px solid var(--line)",
                      background:
                        o.risco === "critico"
                          ? "#fef2f2"
                          : o.atrasadoRetorno
                            ? "#fffbeb"
                            : undefined,
                    }}
                  >
                    <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                      <strong style={{ color: "var(--teal)" }}>{o.op}</strong>
                    </td>
                    <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                      <strong>{o.referencia}</strong>
                    </td>
                    <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }} title={o.corNome}>
                      {o.corNome || o.cor}
                    </td>
                    <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {o.tamanhos}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, padding: "0 8px" }}>
                      {inteiro(o.quantPendente)}
                    </td>
                    <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }} title={o.faccao}>
                      {o.faccao || "Sem facção"}
                    </td>
                    <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {dataBr(o.dtSaida)}
                    </td>
                    <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {dataBr(o.dtRetorno)}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "0 8px" }}>
                      {o.diasPendente}
                    </td>
                    <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {o.pedidoMaisUrgente ? <strong>{o.pedidoMaisUrgente}</strong> : <span className="muted">—</span>}
                    </td>
                    <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {dataBr(o.dtEntregaPedidoMaisUrgente)}
                    </td>
                    <td
                      style={{
                        padding: "0 8px",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                        lineHeight: 1.25,
                        fontWeight: o.folgaDias !== null && o.folgaDias < 0 ? 700 : 400,
                        color: o.folgaDias !== null && o.folgaDias < 0 ? "var(--danger)" : "inherit",
                      }}
                    >
                      {folgaRotulo(o)}
                    </td>
                    <td style={{ textAlign: "center", padding: "0 4px" }}>{badgeRisco(o.risco)}</td>
                  </tr>
                ))}
                {alturaDepois > 0 && (
                  <tr aria-hidden="true" style={{ height: alturaDepois }}>
                    <td colSpan={13} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
