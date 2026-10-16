import { useEffect, useMemo, useRef, useState } from "react";
import { montarPrioridades } from "../../lib/pcp/prioridades";
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
  // Foco padrão em pedidos com produção pendente (estoque já abatido)
  const [soFalta, setSoFalta] = useState(true);

  const wrapRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaJanela, setAlturaJanela] = useState(600);
  const pendenteRolagemRef = useRef(null);

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
    let cobertoEstoqueTotal = 0;
    const pedidosComPendencia = new Set();
    const pedidosTotais = new Set();

    for (const l of fila) {
      pedidosTotais.add(l.numero);
      cobertoEstoqueTotal += l.cobertoPorEstoque;
      if (l.faltaProduzir > 0) {
        pedidosComPendencia.add(l.numero);
        aProduzir += l.faltaProduzir;
        if (l.atrasado) {
          atrasados += 1;
          pecasAtrasadas += l.faltaProduzir;
        }
      }
    }
    return {
      atrasados,
      aProduzir,
      pecasAtrasadas,
      cobertoEstoqueTotal,
      pedidosPendentes: pedidosComPendencia.size,
      pedidosTotais: pedidosTotais.size,
    };
  }, [fila]);

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
          <span className="status-pill">{inteiro(filtrada.length)} itens exibidos</span>
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

        {/* Resumo da Fila com destaque nas necessidades reais */}
        {!carregando && fila.length > 0 && (
          <div className="dashboard-stats" style={{ marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
            <StatCard
              icon="⚡"
              label="Total a produzir na fila"
              value={`${inteiro(resumo.aProduzir)} pçs`}
              tone="info"
            />
            <StatCard
              icon="📋"
              label="Pedidos precisando de produção"
              value={inteiro(resumo.pedidosPendentes)}
              tone="warning"
            />
            <StatCard
              icon="⚠️"
              label="Peças com entrega atrasada"
              value={`${inteiro(resumo.pecasAtrasadas)} pçs`}
              tone="danger"
            />
            <StatCard
              icon="✅"
              label="Atendido com estoque pronto"
              value={`${inteiro(resumo.cobertoEstoqueTotal)} pçs`}
              tone="success"
            />
          </div>
        )}

        {/* Barra de Filtros com botões de alternância rápida */}
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
          {/* Alternador de foco */}
          <div style={{ display: "flex", borderRadius: 6, border: "1px solid var(--line)", overflow: "hidden" }}>
            <button
              type="button"
              className={`button tiny ${soFalta ? "button-primary" : "button-ghost"}`}
              onClick={() => {
                setSoFalta(true);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              style={{ borderRadius: 0, fontWeight: 700 }}
            >
              🔥 Com produção pendente
            </button>
            <button
              type="button"
              className={`button tiny ${!soFalta ? "button-primary" : "button-ghost"}`}
              onClick={() => {
                setSoFalta(false);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              style={{ borderRadius: 0 }}
            >
              📋 Todos da carteira ({inteiro(fila.length)})
            </button>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 240 }}>
            <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>BUSCA:</span>
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              placeholder="Pedido, referência, cor ou status..."
              style={{ height: 32, padding: "4px 10px", fontSize: 13 }}
            />
          </label>
        </div>

        {/* Tabela com Largura Fixa Estável, Sem Tremer e 100% Altura */}
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
              Carregando fila de prioridades...
            </div>
          ) : filtrada.length === 0 ? (
            <div className="empty-state" style={{ padding: 48, textAlign: "center" }}>
              <strong>Nenhum item na fila para este filtro.</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {fila.length === 0
                  ? "Importe os relatórios de PEDIDOS e PRODUTOS DO PEDIDO (2710) na tela Importar."
                  : soFalta
                    ? "Excelente! Todos os pedidos da carteira já estão 100% cobertos pelo estoque pronto."
                    : "Nenhum item encontrado com o termo buscado."}
              </p>
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                minWidth: 1100,
                borderCollapse: "collapse",
                tableLayout: "fixed",
                fontSize: 12.5,
              }}
            >
              <colgroup>
                <col style={{ width: 46 }} />
                <col style={{ width: 105 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 135 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 95 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 170 }} />
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
                  <th style={{ textAlign: "center", padding: "0 4px" }}>#</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Pedido</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Entrega</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Prazo / Urgência</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Referência</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Cor</th>
                  <th style={{ textAlign: "center", padding: "0 4px" }}>Tam</th>
                  <th style={{ textAlign: "right", padding: "0 8px" }}>Qtd Pedido</th>
                  <th style={{ textAlign: "right", padding: "0 8px" }}>Em Estoque</th>
                  <th style={{ textAlign: "right", padding: "0 8px", color: "var(--danger)" }}>Falta Produzir</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Status ERP</th>
                </tr>
              </thead>
              <tbody>
                {alturaAntes > 0 && (
                  <tr aria-hidden="true" style={{ height: alturaAntes }}>
                    <td colSpan={11} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
                {janela.map((l, i) => {
                  const precisaProduzir = l.faltaProduzir > 0;
                  return (
                    <tr
                      key={`${l.numero}|${l.referencia}|${l.cor}|${l.tam}`}
                      style={{
                        height: ALTURA_LINHA,
                        borderBottom: "1px solid var(--line)",
                        background: l.atrasado && precisaProduzir
                          ? "#fef2f2"
                          : !precisaProduzir
                            ? "#f0fdf4"
                            : undefined,
                      }}
                    >
                      <td style={{ textAlign: "center", color: "var(--muted)", padding: "0 4px" }}>
                        {primeiroIndice + i + 1}
                      </td>
                      <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                        <strong style={{ color: "var(--teal)" }}>{l.numero}</strong>
                      </td>
                      <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                        {dataBr(l.dtEntrega)}
                      </td>
                      <td
                        style={{
                          padding: "0 8px",
                          color: l.atrasado && precisaProduzir ? "var(--danger)" : "inherit",
                          fontWeight: l.atrasado && precisaProduzir ? 700 : 400,
                          overflowWrap: "break-word",
                          wordBreak: "break-word",
                          lineHeight: 1.25,
                        }}
                      >
                        {prazo(l)}
                      </td>
                      <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                        <strong>{l.referencia}</strong>
                      </td>
                      <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                        {l.cor}
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 700, padding: "0 4px" }}>
                        {l.tam}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "0 8px" }}>
                        {inteiro(l.aberta)}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          padding: "0 8px",
                          color: l.cobertoPorEstoque > 0 ? "var(--success, #16a34a)" : "var(--muted)",
                          fontWeight: l.cobertoPorEstoque > 0 ? 600 : 400,
                        }}
                      >
                        {inteiro(l.cobertoPorEstoque)}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 800,
                          padding: "0 8px",
                          color: precisaProduzir ? "var(--danger)" : "var(--teal)",
                        }}
                      >
                        {precisaProduzir ? (
                          <span style={{ background: "#fee2e2", padding: "2px 6px", borderRadius: 4 }}>
                            {inteiro(l.faltaProduzir)}
                          </span>
                        ) : (
                          <span style={{ color: "#16a34a", fontSize: 11 }}>coberto ✓</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "0 8px",
                          overflowWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                        title={l.descStatus}
                      >
                        <span className="status-pill" style={{ fontSize: 11, maxWidth: "100%", overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "normal", display: "inline-block", padding: "2px 8px" }}>
                          {l.descStatus || "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {alturaDepois > 0 && (
                  <tr aria-hidden="true" style={{ height: alturaDepois }}>
                    <td colSpan={11} style={{ padding: 0, border: 0 }} />
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
