import { useEffect, useMemo, useRef, useState } from "react";
import { montarAcompanhamento } from "../../lib/pcp/ordens";
import { buscarComCache } from "../../lib/pcp/buscar";
import StatCard from "../../components/charts/StatCard";

const ALTURA_LINHA = 28;
const RESERVA = 10;

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
  const [alturaJanela, setAlturaJanela] = useState(500);
  const pendenteRolagemRef = useRef(null);
  const posicaoRolagemRef = useRef(0);
  const ultimoAplicadoRef = useRef(0);

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
    const medir = () => setAlturaJanela(el.clientHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [carregando]);

  function aoRolar(e) {
    const pos = e.currentTarget.scrollTop;
    posicaoRolagemRef.current = pos;
    const agora = Date.now();
    if (agora - ultimoAplicadoRef.current >= 16) {
      ultimoAplicadoRef.current = agora;
      if (pendenteRolagemRef.current !== null) {
        clearTimeout(pendenteRolagemRef.current);
        pendenteRolagemRef.current = null;
      }
      setScrollTop(pos);
      return;
    }
    if (pendenteRolagemRef.current !== null) clearTimeout(pendenteRolagemRef.current);
    pendenteRolagemRef.current = setTimeout(() => {
      ultimoAplicadoRef.current = Date.now();
      setScrollTop(posicaoRolagemRef.current);
      pendenteRolagemRef.current = null;
    }, 16);
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
          <span className="status-pill">{inteiro(filtrada.length)} OPs</span>
        </div>
      </header>

      <section className="content-panel">
        {erro && (
          <div className="faixa-aviso erro no-print" style={{ marginBottom: 16 }}>
            <span>{erro}</span>
          </div>
        )}

        {/* Estatísticas */}
        {!carregando && fila.length > 0 && (
          <div className="dashboard-stats" style={{ marginBottom: 20 }}>
            <StatCard
              icon="🚨"
              label="OPs críticas"
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
            padding: "10px 16px",
            marginBottom: 16,
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 260 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Buscar:</span>
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              placeholder="OP, produto, cor ou facção..."
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Risco:</span>
            <select
              value={filtroRisco}
              onChange={(e) => {
                setFiltroRisco(e.target.value);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              style={{ width: "auto" }}
            >
              <option value="todos">Todos os riscos</option>
              <option value="critico">Apenas críticos</option>
              <option value="atencao">Apenas atenção</option>
              <option value="normal">Apenas no prazo</option>
              <option value="sem-pedido">Apenas sem pedido</option>
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Facção:</span>
            <select
              value={filtroFaccao}
              onChange={(e) => {
                setFiltroFaccao(e.target.value);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              style={{ width: "auto" }}
            >
              <option value="todas">Todas ({faccoes.length})</option>
              {faccoes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Tabela com Scroll Responsivo e Windowing */}
        <div
          className="table-scroll"
          ref={wrapRef}
          onScroll={aoRolar}
          style={{ maxHeight: "calc(100vh - 270px)", border: "1px solid var(--line)", borderRadius: "var(--radius)" }}
        >
          {carregando ? (
            <div className="empty-state">Carregando ordens de produção pendentes...</div>
          ) : filtrada.length === 0 ? (
            <div className="empty-state" style={{ padding: 40, textAlign: "center" }}>
              <strong>Nenhuma OP pendente encontrada.</strong>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                {fila.length === 0
                  ? "Importe o relatório de ORDENS PENDENTES (3011) na tela Importar."
                  : "Nenhuma ordem corresponde aos filtros selecionados."}
              </p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg)", position: "sticky", top: 0, zIndex: 10 }}>
                  <th style={{ width: 80 }}>OP</th>
                  <th style={{ width: 100 }}>Referência</th>
                  <th style={{ width: 140 }}>Cor</th>
                  <th style={{ width: 90 }}>Grade</th>
                  <th style={{ width: 90, textAlign: "right" }}>Pendente</th>
                  <th style={{ minWidth: 160, overflowWrap: "break-word" }}>Facção</th>
                  <th style={{ width: 95 }}>Saída</th>
                  <th style={{ width: 105 }}>Retorno prev.</th>
                  <th style={{ width: 80, textAlign: "right" }}>Dias</th>
                  <th style={{ width: 110 }}>Pedido urg.</th>
                  <th style={{ width: 100 }}>Entrega</th>
                  <th style={{ width: 120 }}>Folga</th>
                  <th style={{ width: 100, textAlign: "center" }}>Risco</th>
                </tr>
              </thead>
              <tbody>
                {alturaAntes > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={13} style={{ height: alturaAntes, padding: 0, border: 0 }} />
                  </tr>
                )}
                {janela.map((o) => (
                  <tr
                    key={o.op}
                    style={
                      o.risco === "critico"
                        ? { background: "var(--red-soft, #fee2e2)" }
                        : o.atrasadoRetorno
                          ? { background: "var(--amber-soft, #fef3c7)" }
                          : undefined
                    }
                  >
                    <td>
                      <strong style={{ color: "var(--teal)" }}>{o.op}</strong>
                    </td>
                    <td>
                      <strong>{o.referencia}</strong>
                    </td>
                    <td style={{ overflowWrap: "break-word" }}>{o.corNome || o.cor}</td>
                    <td>{o.tamanhos}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      {inteiro(o.quantPendente)}
                    </td>
                    <td style={{ overflowWrap: "break-word" }}>{o.faccao || "Sem facção"}</td>
                    <td>{dataBr(o.dtSaida)}</td>
                    <td>{dataBr(o.dtRetorno)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{o.diasPendente}</td>
                    <td>
                      {o.pedidoMaisUrgente ? <strong>{o.pedidoMaisUrgente}</strong> : <span className="muted">—</span>}
                    </td>
                    <td>{dataBr(o.dtEntregaPedidoMaisUrgente)}</td>
                    <td style={{ fontWeight: o.folgaDias !== null && o.folgaDias < 0 ? 700 : 400, color: o.folgaDias !== null && o.folgaDias < 0 ? "var(--danger)" : "inherit" }}>
                      {folgaRotulo(o)}
                    </td>
                    <td style={{ textAlign: "center" }}>{badgeRisco(o.risco)}</td>
                  </tr>
                ))}
                {alturaDepois > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={13} style={{ height: alturaDepois, padding: 0, border: 0 }} />
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
