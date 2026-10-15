import { useEffect, useMemo, useRef, useState } from "react";
import { pcpDb } from "../../lib/pcp/pcpDb";
import StatCard from "../../components/charts/StatCard";

const ALTURA_LINHA = 28;
const RESERVA = 10;

function inteiro(valor) {
  return Math.round(Number(valor) || 0).toLocaleString("pt-BR");
}

function decimal(valor, casas = 2) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export default function ComprasEstoquePage() {
  const [materiais, setMateriais] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [grupoFiltro, setGrupoFiltro] = useState("todos");
  const [somenteDisponivel, setSomenteDisponivel] = useState(false);

  const wrapRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaJanela, setAlturaJanela] = useState(500);
  const pendenteRolagemRef = useRef(null);
  const posicaoRolagemRef = useRef(0);
  const ultimoAplicadoRef = useRef(0);

  const carregar = async () => {
    try {
      setCarregando(true);
      setErro("");
      const corpo = await pcpDb.obterModulos();
      setMateriais(corpo.materiais ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar estoque de materiais.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const medir = () => setAlturaJanela(el.clientHeight || 500);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (pendenteRolagemRef.current !== null) clearTimeout(pendenteRolagemRef.current);
    };
  }, []);

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

  const grupos = useMemo(() => {
    const g = new Set();
    for (const m of materiais) {
      if (m.descGrupo) g.add(m.descGrupo);
    }
    return [...g].sort();
  }, [materiais]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return materiais.filter((m) => {
      if (grupoFiltro !== "todos" && m.descGrupo !== grupoFiltro) return false;
      if (somenteDisponivel && (Number(m.disponivel) || 0) <= 0) return false;
      if (termo) {
        const texto = `${m.codigoMaterial} ${m.descricao} ${m.codigoCor} ${m.nomeCor} ${m.descGrupo}`.toLowerCase();
        if (!texto.includes(termo)) return false;
      }
      return true;
    });
  }, [materiais, busca, grupoFiltro, somenteDisponivel]);

  const stats = useMemo(() => {
    let comSaldo = 0;
    let zerados = 0;
    let totalQtd = 0;
    for (const m of filtrados) {
      const disp = Number(m.disponivel) || 0;
      if (disp > 0) comSaldo++;
      else zerados++;
      totalQtd += Number(m.quantidade) || 0;
    }
    return {
      totalItens: filtrados.length,
      comSaldo,
      zerados,
      totalQtd,
    };
  }, [filtrados]);

  const primeiroIndice = Math.max(0, Math.floor(scrollTop / ALTURA_LINHA) - RESERVA);
  const ultimoIndice = Math.min(filtrados.length, Math.ceil((scrollTop + alturaJanela) / ALTURA_LINHA) + RESERVA);
  const janela = filtrados.slice(primeiroIndice, ultimoIndice);
  const alturaAntes = primeiroIndice * ALTURA_LINHA;
  const alturaDepois = (filtrados.length - ultimoIndice) * ALTURA_LINHA;

  function exportarCsv() {
    if (filtrados.length === 0) return;
    const colunas = [
      "Código",
      "Material",
      "Cód Cor",
      "Cor",
      "Unidade",
      "Saldo",
      "Reservado",
      "Disponível",
      "Grupo",
      "Depósitos",
    ];
    const corpo = filtrados.map((m) =>
      [
        m.codigoMaterial,
        m.descricao,
        m.codigoCor,
        m.nomeCor,
        m.unidade,
        decimal(m.quantidade),
        decimal(m.reservado),
        decimal(m.disponivel),
        m.descGrupo,
        m.depositos || `${m.linhasSomadas || 1} depósito(s)`,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(";"),
    );
    const url = URL.createObjectURL(
      new Blob([[colunas.join(";"), ...corpo].join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `estoque-materiais-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Compras · Gestão de Materiais</p>
          <h1>Estoque de Matéria-Prima (2120)</h1>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={exportarCsv}
            disabled={filtrados.length === 0}
          >
            📥 Exportar CSV
          </button>
          <button
            type="button"
            className="button button-outline button-icon"
            onClick={carregar}
            title="Recarregar dados"
          >
            🔄
          </button>
          <span className="status-pill">{inteiro(stats.totalItens)} itens</span>
        </div>
      </header>

      {erro && (
        <div className="faixa-aviso erro" role="alert" style={{ margin: "16px 24px 0" }}>
          <span>{erro}</span>
          <button type="button" className="button button-outline" onClick={() => setErro("")}>
            Fechar
          </button>
        </div>
      )}

      <section className="content-panel" style={{ margin: "16px 24px" }}>
        {/* Indicadores Visuais */}
        <div className="metric-strip" style={{ marginBottom: 20 }}>
          <StatCard
            title="Itens no estoque"
            value={inteiro(stats.totalItens)}
            subtitle="Itens após filtros aplicados"
            tone="default"
          />
          <StatCard
            title="Com saldo disponível"
            value={inteiro(stats.comSaldo)}
            subtitle="Materiais prontos para consumo"
            tone="success"
          />
          <StatCard
            title="Zerados ou negativos"
            value={inteiro(stats.zerados)}
            subtitle="Itens sem saldo disponível"
            tone={stats.zerados > 0 ? "danger" : "default"}
          />
          <StatCard
            title="Saldo físico total"
            value={inteiro(stats.totalQtd)}
            subtitle="Soma de todas as quantidades"
            tone="default"
          />
        </div>

        {/* Barra de Filtros */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            background: "var(--card-hover, rgba(0,0,0,0.02))",
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            marginBottom: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <input
              type="text"
              placeholder="Buscar por código, descrição ou cor..."
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--line)" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Grupo:</span>
            <select
              value={grupoFiltro}
              onChange={(e) => {
                setGrupoFiltro(e.target.value);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--line)" }}
            >
              <option value="todos">Todos os grupos ({grupos.length})</option>
              {grupos.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={somenteDisponivel}
              onChange={(e) => setSomenteDisponivel(e.target.checked)}
            />
            <span>Apenas com saldo &gt; 0</span>
          </label>

          {(busca || grupoFiltro !== "todos" || somenteDisponivel) && (
            <button
              type="button"
              className="button button-outline tiny"
              onClick={() => {
                setBusca("");
                setGrupoFiltro("todos");
                setSomenteDisponivel(false);
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Tabela de Estoque */}
        <div
          className="table-scroll"
          ref={wrapRef}
          onScroll={aoRolar}
          style={{ maxHeight: "calc(100vh - 360px)", overflow: "auto" }}
        >
          {carregando ? (
            <div className="vazio-central" style={{ padding: 48, textAlign: "center" }}>
              Carregando estoque de matéria-prima...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="vazio-central" style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>
              <strong>Nenhum material encontrado.</strong>
              <p style={{ marginTop: 8 }}>
                Importe o relatório de matéria-prima (2120) na aba <strong>Importar</strong> ou ajuste os filtros acima.
              </p>
            </div>
          ) : (
            <table className="module-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ width: 100, textAlign: "left", padding: "10px 12px" }}>Código</th>
                  <th style={{ textAlign: "left", padding: "10px 12px" }}>Material / Descrição</th>
                  <th style={{ width: 180, textAlign: "left", padding: "10px 12px" }}>Cor</th>
                  <th style={{ width: 60, textAlign: "center", padding: "10px 8px" }}>Un.</th>
                  <th className="num" style={{ width: 110, textAlign: "right", padding: "10px 12px" }}>
                    Saldo Físico
                  </th>
                  <th className="num" style={{ width: 110, textAlign: "right", padding: "10px 12px" }}>
                    Reservado
                  </th>
                  <th className="num" style={{ width: 120, textAlign: "right", padding: "10px 12px" }}>
                    Disponível
                  </th>
                  <th style={{ width: 160, textAlign: "left", padding: "10px 12px" }}>Grupo</th>
                  <th style={{ width: 130, textAlign: "left", padding: "10px 12px" }}>Depósitos</th>
                </tr>
              </thead>
              <tbody>
                {alturaAntes > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={9} style={{ height: alturaAntes, padding: 0, border: 0 }} />
                  </tr>
                )}
                {janela.map((m) => {
                  const disp = Number(m.disponivel) || 0;
                  return (
                    <tr
                      key={`${m.codigoMaterial}|${m.codigoCor}`}
                      style={{ borderBottom: "1px solid var(--line)" }}
                    >
                      <td style={{ padding: "6px 12px", fontFamily: "monospace", fontSize: 13 }}>
                        <strong>{m.codigoMaterial}</strong>
                      </td>
                      <td
                        style={{
                          padding: "6px 12px",
                          maxWidth: 360,
                          overflowWrap: "break-word",
                          whiteSpace: "normal",
                          lineHeight: 1.35,
                        }}
                        title={m.descricao}
                      >
                        {m.descricao}
                      </td>
                      <td style={{ padding: "6px 12px", fontSize: 13 }} title={m.nomeCor}>
                        <span style={{ fontWeight: 600 }}>{m.codigoCor}</span>
                        {m.nomeCor ? ` — ${m.nomeCor}` : ""}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
                        {m.unidade}
                      </td>
                      <td
                        className="num"
                        style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      >
                        {decimal(m.quantidade)}
                      </td>
                      <td
                        className="num"
                        style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      >
                        {decimal(m.reservado)}
                      </td>
                      <td
                        className="num"
                        style={{
                          padding: "6px 12px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 700,
                          color: disp <= 0 ? "var(--danger, #ef4444)" : "var(--success, #10b981)",
                        }}
                      >
                        {decimal(disp)}
                      </td>
                      <td style={{ padding: "6px 12px", fontSize: 13, color: "var(--muted)" }} title={m.descGrupo}>
                        {m.descGrupo || "—"}
                      </td>
                      <td style={{ padding: "6px 12px", fontSize: 12, color: "var(--muted)" }} title={m.depositos}>
                        {m.linhasSomadas > 1 ? `${m.linhasSomadas} depósitos` : "1 depósito"}
                      </td>
                    </tr>
                  );
                })}
                {alturaDepois > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={9} style={{ height: alturaDepois, padding: 0, border: 0 }} />
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
