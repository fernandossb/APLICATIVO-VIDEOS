import { useEffect, useMemo, useRef, useState } from "react";
import { montarPrioridades } from "../../lib/pcp/prioridades";
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

function prazo(linha) {
  if (linha.diasAteEntrega === null) return "sem data";
  if (linha.diasAteEntrega < 0) return `${Math.abs(linha.diasAteEntrega)} dia(s) atrasado`;
  if (linha.diasAteEntrega === 0) return "entrega hoje";
  return `em ${linha.diasAteEntrega} dia(s)`;
}

export default function PcpPrioridadesPage() {
  const [pedidos, setPedidos] = useState([]);
  const [estoque, setEstoque] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [soFalta, setSoFalta] = useState(false);

  const wrapRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaJanela, setAlturaJanela] = useState(500);
  const pendenteRolagemRef = useRef(null);
  const posicaoRolagemRef = useRef(0);
  const ultimoAplicadoRef = useRef(0);

  const carregarDados = () => {
    setCarregando(true);
    buscarComCache("/api/prioridades")
      .then((corpo) => {
        setPedidos(corpo.pedidos ?? []);
        setEstoque(corpo.estoque ?? []);
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

  const fila = useMemo(() => montarPrioridades(pedidos, estoque), [pedidos, estoque]);

  const filtrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return fila.filter((l) => {
      if (soFalta && l.faltaProduzir <= 0) return false;
      if (!termo) return true;
      return `${l.numero} ${l.referencia} ${l.cor} ${l.tam} ${l.descStatus}`.toLowerCase().includes(termo);
    });
  }, [fila, busca, soFalta]);

  const resumo = useMemo(() => {
    let atrasados = 0;
    let aProduzir = 0;
    let pecasAtrasadas = 0;
    const pedidosUnicos = new Set();
    for (const l of filtrada) {
      pedidosUnicos.add(l.numero);
      aProduzir += l.faltaProduzir;
      if (l.atrasado) {
        atrasados += 1;
        pecasAtrasadas += l.faltaProduzir;
      }
    }
    return { atrasados, aProduzir, pecasAtrasadas, pedidos: pedidosUnicos.size };
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
      "Pedido",
      "Entrega",
      "Prazo",
      "Referencia",
      "Cor",
      "Tam",
      "Em aberto",
      "Em estoque",
      "Falta produzir",
      "Status",
    ];
    const corpo = filtrada.map((l, i) =>
      [
        i + 1,
        l.numero,
        dataBr(l.dtEntrega),
        prazo(l),
        l.referencia,
        l.cor,
        l.tam,
        Math.round(l.aberta),
        Math.round(l.cobertoPorEstoque),
        Math.round(l.faltaProduzir),
        l.descStatus,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const url = URL.createObjectURL(
      new Blob([[cabecalho.join(";"), ...corpo].join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `prioridades-producao-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="workspace">
      <header className="topbar no-print">
        <div className="sheet-header-inline">
          <p className="overline">PCP · Fila de Corte e Costura</p>
          <h1>Prioridades de Produção</h1>
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
          <span className="status-pill">{inteiro(filtrada.length)} itens</span>
        </div>
      </header>

      <section className="content-panel">
        {erro && (
          <div className="faixa-aviso erro no-print" style={{ marginBottom: 16 }}>
            <span>{erro}</span>
          </div>
        )}

        {/* Resumo da Fila */}
        {!carregando && fila.length > 0 && (
          <div className="dashboard-stats" style={{ marginBottom: 20 }}>
            <StatCard
              icon="⚠️"
              label="Itens atrasados"
              value={inteiro(resumo.atrasados)}
              tone="danger"
            />
            <StatCard
              icon="⏱️"
              label="Peças atrasadas"
              value={`${inteiro(resumo.pecasAtrasadas)} pçs`}
              tone="warning"
            />
            <StatCard
              icon="📦"
              label="Total a produzir na fila"
              value={`${inteiro(resumo.aProduzir)} pçs`}
              tone="info"
            />
            <StatCard
              icon="📋"
              label="Pedidos em aberto"
              value={inteiro(resumo.pedidos)}
              tone="success"
            />
          </div>
        )}

        {/* Barra de Filtros */}
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
              placeholder="Pedido, referência, cor ou status..."
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Exibir:</span>
            <select
              value={soFalta ? "falta" : "todos"}
              onChange={(e) => {
                setSoFalta(e.target.value === "falta");
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              style={{ width: "auto" }}
            >
              <option value="todos">Tudo em aberto</option>
              <option value="falta">Apenas o que falta produzir</option>
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
            <div className="empty-state">Carregando fila de prioridades...</div>
          ) : filtrada.length === 0 ? (
            <div className="empty-state" style={{ padding: 40, textAlign: "center" }}>
              <strong>Nenhum item na fila.</strong>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                {fila.length === 0
                  ? "Importe os relatórios de PEDIDOS e PRODUTOS DO PEDIDO (2710) na tela Importar."
                  : "Nenhum item corresponde ao filtro informado."}
              </p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg)", position: "sticky", top: 0, zIndex: 10 }}>
                  <th style={{ width: 50, textAlign: "center" }}>#</th>
                  <th style={{ width: 100 }}>Pedido</th>
                  <th style={{ width: 100 }}>Entrega</th>
                  <th style={{ width: 130 }}>Prazo</th>
                  <th style={{ width: 110 }}>Referência</th>
                  <th style={{ width: 90 }}>Cor</th>
                  <th style={{ width: 60, textAlign: "center" }}>Tam</th>
                  <th style={{ width: 100, textAlign: "right" }}>Em aberto</th>
                  <th style={{ width: 100, textAlign: "right" }}>Em estoque</th>
                  <th style={{ width: 110, textAlign: "right" }}>Falta produzir</th>
                  <th style={{ minWidth: 160, overflowWrap: "break-word" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {alturaAntes > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={11} style={{ height: alturaAntes, padding: 0, border: 0 }} />
                  </tr>
                )}
                {janela.map((l, i) => (
                  <tr
                    key={`${l.numero}|${l.referencia}|${l.cor}|${l.tam}`}
                    style={l.atrasado ? { background: "var(--red-soft, #fee2e2)" } : undefined}
                  >
                    <td style={{ textAlign: "center", color: "var(--muted)" }}>{primeiroIndice + i + 1}</td>
                    <td>
                      <strong style={{ color: "var(--teal)" }}>{l.numero}</strong>
                    </td>
                    <td>{dataBr(l.dtEntrega)}</td>
                    <td style={{ color: l.atrasado ? "var(--danger)" : "inherit", fontWeight: l.atrasado ? 700 : 400 }}>
                      {prazo(l)}
                    </td>
                    <td>
                      <strong>{l.referencia}</strong>
                    </td>
                    <td>{l.cor}</td>
                    <td style={{ textAlign: "center", fontWeight: 700 }}>{l.tam}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inteiro(l.aberta)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inteiro(l.cobertoPorEstoque)}</td>
                    <td
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 700,
                        color: l.faltaProduzir > 0 ? "var(--danger)" : "var(--teal)",
                      }}
                    >
                      {inteiro(l.faltaProduzir)}
                    </td>
                    <td style={{ overflowWrap: "break-word", whiteSpace: "normal" }}>
                      <span className="status-pill" style={{ fontSize: 11 }}>{l.descStatus || "—"}</span>
                    </td>
                  </tr>
                ))}
                {alturaDepois > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={11} style={{ height: alturaDepois, padding: 0, border: 0 }} />
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
