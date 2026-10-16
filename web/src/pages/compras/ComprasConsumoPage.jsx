import { useEffect, useMemo, useRef, useState } from "react";
import { pcpDb } from "../../lib/pcp/pcpDb";
import { compararTamanho } from "../../lib/pcp/tamanhos";
import StatCard from "../../components/charts/StatCard";

const ALTURA_LINHA = 40;
const RESERVA = 35;

const CONSUMO_SEM_FILTRO = {
  produto: "",
  corProduto: "todas",
  material: "",
  corInsumo: "todas",
  faixa: "todas",
  grupo: "todos",
};

function inteiro(valor) {
  return Math.round(Number(valor) || 0).toLocaleString("pt-BR");
}

function decimal(valor, casas = 4) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function passaConsumo(c, f, ignorar) {
  const usa = (campo) => ignorar !== campo;
  if (usa("produto")) {
    const termo = f.produto.trim().toLowerCase();
    if (termo && !c.produto.toLowerCase().includes(termo)) return false;
  }
  if (usa("corProduto") && f.corProduto !== "todas" && c.corProduto !== f.corProduto) return false;
  if (usa("material")) {
    const termo = f.material.trim().toLowerCase();
    if (termo && !`${c.codigo} ${c.descricao}`.toLowerCase().includes(termo)) return false;
  }
  if (usa("corInsumo") && f.corInsumo !== "todas" && (c.corMaterial || "sem cor") !== f.corInsumo) return false;
  if (usa("faixa") && f.faixa !== "todas" && c.faixa !== f.faixa) return false;
  if (usa("grupo") && f.grupo !== "todos" && c.materialTipo !== f.grupo) return false;
  return true;
}

function opcoesConsumo(linhas, filtros, campo, valorDe, selecionado) {
  const conjunto = new Set();
  for (const c of linhas) {
    if (!passaConsumo(c, filtros, campo)) continue;
    const valor = valorDe(c);
    if (valor) conjunto.add(valor);
  }
  if (selecionado && selecionado !== "todas" && selecionado !== "todos") conjunto.add(selecionado);
  return [...conjunto];
}

export default function ComprasConsumoPage() {
  const [consumo, setConsumo] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtros, setFiltros] = useState(CONSUMO_SEM_FILTRO);

  const wrapRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaJanela, setAlturaJanela] = useState(600);
  const pendenteRolagemRef = useRef(null);

  const carregar = async () => {
    try {
      setCarregando(true);
      setErro("");
      const corpo = await pcpDb.obterModulos();
      setConsumo(corpo.consumo ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar consumo.");
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
    const medir = () => setAlturaJanela(el.clientHeight || 600);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (pendenteRolagemRef.current !== null) cancelAnimationFrame(pendenteRolagemRef.current);
    };
  }, []);

  function aoRolar(e) {
    const pos = e.currentTarget.scrollTop;
    if (pendenteRolagemRef.current !== null) return;
    pendenteRolagemRef.current = requestAnimationFrame(() => {
      setScrollTop(pos);
      pendenteRolagemRef.current = null;
    });
  }

  function mudarFiltro(campo, valor) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
    setScrollTop(0);
    if (wrapRef.current) wrapRef.current.scrollTop = 0;
  }

  const produtos = useMemo(
    () => opcoesConsumo(consumo, filtros, "produto", (c) => c.produto).sort().slice(0, 400),
    [consumo, filtros],
  );
  const coresProduto = useMemo(
    () => opcoesConsumo(consumo, filtros, "corProduto", (c) => c.corProduto, filtros.corProduto).sort(),
    [consumo, filtros],
  );
  const materiaisConsumo = useMemo(
    () =>
      opcoesConsumo(consumo, filtros, "material", (c) => `${c.codigo} - ${c.descricao}`)
        .sort()
        .slice(0, 400),
    [consumo, filtros],
  );
  const coresInsumo = useMemo(
    () =>
      opcoesConsumo(consumo, filtros, "corInsumo", (c) => c.corMaterial || "sem cor", filtros.corInsumo).sort(),
    [consumo, filtros],
  );
  const faixas = useMemo(
    () => opcoesConsumo(consumo, filtros, "faixa", (c) => c.faixa, filtros.faixa).sort(compararTamanho),
    [consumo, filtros],
  );
  const grupos = useMemo(
    () => opcoesConsumo(consumo, filtros, "grupo", (c) => c.materialTipo, filtros.grupo).sort(),
    [consumo, filtros],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return consumo.filter((c) => {
      if (!passaConsumo(c, filtros)) return false;
      if (termo) {
        const texto = `${c.produto} ${c.corProduto} ${c.codigo} ${c.descricao} ${c.corMaterial}`.toLowerCase();
        if (!texto.includes(termo)) return false;
      }
      return true;
    });
  }, [consumo, filtros, busca]);

  const stats = useMemo(() => {
    const produtosUnicos = new Set(consumo.map((c) => `${c.produto}|${c.corProduto}`)).size;
    const materiaisUnicos = new Set(consumo.map((c) => c.codigo)).size;
    return {
      totalLinhas: consumo.length,
      produtosUnicos,
      materiaisUnicos,
      mostrando: filtrados.length,
    };
  }, [consumo, filtrados]);

  const primeiroIndice = Math.max(0, Math.floor(scrollTop / ALTURA_LINHA) - RESERVA);
  const ultimoIndice = Math.min(filtrados.length, Math.ceil((scrollTop + alturaJanela) / ALTURA_LINHA) + RESERVA);
  const janela = filtrados.slice(primeiroIndice, ultimoIndice);
  const alturaAntes = primeiroIndice * ALTURA_LINHA;
  const alturaDepois = (filtrados.length - ultimoIndice) * ALTURA_LINHA;

  function exportarCsv() {
    if (filtrados.length === 0) return;
    const colunas = [
      "Produto",
      "Cor Produto",
      "Cód Material",
      "Descrição Material",
      "Cor Insumo",
      "Consumo",
      "Unidade",
      "Faixa",
      "Aplicação",
    ];
    const corpo = filtrados.map((c) =>
      [
        c.produto,
        c.corProduto,
        c.codigo,
        c.descricao,
        c.corMaterial || "sem cor",
        decimal(c.consumo, 4),
        c.unid,
        c.faixa,
        c.aplicacao || "",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(";"),
    );
    const url = URL.createObjectURL(
      new Blob([[colunas.join(";"), ...corpo].join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `consumo-produtos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Compras · Estrutura Técnica</p>
          <h1>Consumo por Produto (2252)</h1>
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
          <span className="status-pill">{inteiro(stats.mostrando)} linhas</span>
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

      <section
        className="content-panel"
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "16px 24px",
          maxWidth: "100%",
          width: "100%",
          margin: 0,
        }}
      >
        {/* Indicadores */}
        <div className="metric-strip" style={{ marginBottom: 20 }}>
          <StatCard
            title="Estruturas cadastradas"
            value={inteiro(stats.produtosUnicos)}
            subtitle="Produtos com ficha de consumo"
            tone="default"
          />
          <StatCard
            title="Materiais consumidos"
            value={inteiro(stats.materiaisUnicos)}
            subtitle="Insumos distintos na produção"
            tone="default"
          />
          <StatCard
            title="Total de vínculos"
            value={inteiro(stats.totalLinhas)}
            subtitle="Linhas de consumo no banco"
            tone="default"
          />
          <StatCard
            title="Linhas filtradas"
            value={inteiro(stats.mostrando)}
            subtitle="Exibidas na tabela abaixo"
            tone={stats.mostrando > 0 ? "success" : "default"}
          />
        </div>

        {/* Filtros Cruzados */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: "var(--card-hover, rgba(0,0,0,0.02))",
            padding: "14px 16px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                type="text"
                placeholder="Busca rápida..."
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setScrollTop(0);
                }}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--line)" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Produto:</span>
              <input
                list="consumo-produtos-lista"
                value={filtros.produto}
                onChange={(e) => mudarFiltro("produto", e.target.value.toUpperCase())}
                placeholder="Ex.: 146RF"
                style={{ width: 120, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line)" }}
              />
              <datalist id="consumo-produtos-lista">
                {produtos.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Cor Prod.:</span>
              <select
                value={filtros.corProduto}
                onChange={(e) => mudarFiltro("corProduto", e.target.value)}
                style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line)" }}
              >
                <option value="todas">Todas ({coresProduto.length})</option>
                {coresProduto.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Material:</span>
              <input
                list="consumo-materiais-lista"
                value={filtros.material}
                onChange={(e) => mudarFiltro("material", e.target.value)}
                placeholder="Cód / Descrição"
                style={{ width: 140, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line)" }}
              />
              <datalist id="consumo-materiais-lista">
                {materiaisConsumo.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Cor Insumo:</span>
              <select
                value={filtros.corInsumo}
                onChange={(e) => mudarFiltro("corInsumo", e.target.value)}
                style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line)" }}
              >
                <option value="todas">Todas ({coresInsumo.length})</option>
                {coresInsumo.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Faixa:</span>
              <select
                value={filtros.faixa}
                onChange={(e) => mudarFiltro("faixa", e.target.value)}
                style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line)" }}
              >
                <option value="todas">Todas</option>
                {faixas.map((t) => (
                  <option key={t} value={t}>
                    {t === "F0" ? "F0 (todos)" : t}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Grupo:</span>
              <select
                value={filtros.grupo}
                onChange={(e) => mudarFiltro("grupo", e.target.value)}
                style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line)" }}
              >
                <option value="todos">Todos</option>
                {grupos.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="button button-outline tiny"
              onClick={() => {
                setFiltros(CONSUMO_SEM_FILTRO);
                setBusca("");
                setScrollTop(0);
                if (wrapRef.current) wrapRef.current.scrollTop = 0;
              }}
            >
              Limpar filtros
            </button>
          </div>
        </div>

        {/* Tabela de Consumo */}
        <div
          className="table-scroll"
          ref={wrapRef}
          onScroll={aoRolar}
          style={{ height: "calc(100vh - 290px)", minHeight: 460, overflow: "auto" }}
        >
          {carregando ? (
            <div className="vazio-central" style={{ padding: 48, textAlign: "center" }}>
              Carregando estruturas de consumo...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="vazio-central" style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>
              <strong>Nenhuma linha de consumo encontrada.</strong>
              <p style={{ marginTop: 8 }}>
                Importe os relatórios da pasta CONSUMOS-2252 na aba <strong>Importar</strong>.
              </p>
            </div>
          ) : (
            <table
              className="module-table"
              style={{
                width: "100%",
                minWidth: 1200,
                tableLayout: "fixed",
                borderCollapse: "collapse",
              }}
            >
              <colgroup>
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 330 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 65 }} />
                <col style={{ width: 75 }} />
                <col style={{ width: 150 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ width: 100, textAlign: "left", padding: "10px 12px" }}>Produto</th>
                  <th style={{ width: 100, textAlign: "left", padding: "10px 12px" }}>Cor Prod.</th>
                  <th style={{ width: 110, textAlign: "left", padding: "10px 12px" }}>Material</th>
                  <th style={{ width: 330, textAlign: "left", padding: "10px 12px" }}>Descrição do Material</th>
                  <th style={{ width: 150, textAlign: "left", padding: "10px 12px" }}>Cor Insumo</th>
                  <th className="num" style={{ width: 120, textAlign: "right", padding: "10px 12px" }}>
                    Consumo Unit.
                  </th>
                  <th style={{ width: 65, textAlign: "center", padding: "10px 8px" }}>Un.</th>
                  <th style={{ width: 75, textAlign: "center", padding: "10px 8px" }}>Faixa</th>
                  <th style={{ width: 150, textAlign: "left", padding: "10px 12px" }}>Aplicação</th>
                </tr>
              </thead>
              <tbody>
                {alturaAntes > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={9} style={{ height: alturaAntes, padding: 0, border: 0 }} />
                  </tr>
                )}
                {janela.map((c, i) => (
                  <tr
                    key={`${c.produto}|${c.corProduto}|${c.codigo}|${c.faixa}|${i}`}
                    style={{ height: ALTURA_LINHA, borderBottom: "1px solid var(--line)" }}
                  >
                    <td
                      style={{
                        padding: "6px 12px",
                        fontFamily: "monospace",
                        fontSize: 13,
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                      }}
                    >
                      <strong>{c.produto}</strong>
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                        whiteSpace: "normal",
                      }}
                    >
                      {c.corProduto}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        fontFamily: "monospace",
                        fontSize: 13,
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                      }}
                    >
                      {c.codigo}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                        whiteSpace: "normal",
                        lineHeight: 1.3,
                      }}
                      title={c.descricao}
                    >
                      {c.descricao}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                        whiteSpace: "normal",
                      }}
                      title={c.corMaterialNome}
                    >
                      {c.corMaterial || "sem cor"}
                    </td>
                    <td
                      className="num"
                      style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
                    >
                      {decimal(c.consumo, 4)}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
                      {c.unid}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 12, fontWeight: 600 }}>
                      {c.faixa}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        color: "var(--muted)",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                      }}
                      title={c.aplicacao}
                    >
                      {c.aplicacao || "—"}
                    </td>
                  </tr>
                ))}
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
