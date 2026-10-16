import { useMemo, useRef, useState } from "react";
import { usePcp } from "../../lib/pcp/PcpContext";
import { montarFaltaProjecao } from "../../lib/pcp/compras";
import StatCard from "../../components/charts/StatCard";

function inteiro(valor) {
  return Math.round(Number(valor) || 0).toLocaleString("pt-BR");
}

function decimal(valor, casas = 2) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export default function ComprasFaltaComprarPage() {
  const { linhas, carregando } = usePcp();
  const [colecao, setColecao] = useState("todas");
  const [produto, setProduto] = useState("");
  const [grupo, setGrupo] = useState("todos");
  const [material, setMaterial] = useState("");
  const [soFalta, setSoFalta] = useState(true);
  const wrapRef = useRef(null);

  const colecoes = useMemo(
    () => [...new Set(linhas.map((l) => l.colecaoNome).filter(Boolean))].sort(),
    [linhas],
  );

  const grupos = useMemo(() => {
    const s = new Set();
    for (const l of linhas) {
      for (const i of l.insumos || []) {
        if (i.materialTipo) s.add(i.materialTipo);
      }
    }
    return [...s].sort();
  }, [linhas]);

  const faltantes = useMemo(() => {
    const termoProduto = produto.trim().toUpperCase();
    return montarFaltaProjecao(linhas, (l) => {
      if (colecao !== "todas" && l.colecaoNome !== colecao) return false;
      if (termoProduto && !`${l.referencia} ${l.cor}`.toUpperCase().includes(termoProduto)) return false;
      return true;
    });
  }, [linhas, colecao, produto]);

  const lista = useMemo(() => {
    const termo = material.trim().toLowerCase();
    return faltantes.filter((m) => {
      if (soFalta && m.falta <= 0 && !m.semCadastro) return false;
      if (grupo !== "todos" && m.grupo !== grupo) return false;
      if (termo && !`${m.codigo} ${m.descricao} ${m.corMaterial}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [faltantes, soFalta, grupo, material]);

  const resumo = useMemo(() => {
    let comFalta = 0;
    let semCadastro = 0;
    for (const m of lista) {
      if (m.falta > 0) comFalta += 1;
      if (m.semCadastro) semCadastro += 1;
    }
    return { comFalta, semCadastro, itens: lista.length };
  }, [lista]);

  const semEstrutura = useMemo(() => {
    const termoProduto = produto.trim().toUpperCase();
    const prods = new Set();
    for (const l of linhas) {
      if (l.ativo === false || l.grupoAtivo === false) continue;
      if ((Number(l.faltaProduzir) || 0) <= 0) continue;
      if (colecao !== "todas" && l.colecaoNome !== colecao) continue;
      if (termoProduto && !`${l.referencia} ${l.cor}`.toUpperCase().includes(termoProduto)) continue;
      if (!l.insumos || l.insumos.length === 0) prods.add(`${l.referencia}|${l.cor}`);
    }
    return prods.size;
  }, [linhas, colecao, produto]);

  function exportarCsv() {
    if (lista.length === 0) return;
    const cabecalho = [
      "Material",
      "Descrição",
      "Grupo",
      "Cor",
      "Unidade",
      "Necessário",
      "Em Estoque",
      "Falta Comprar",
      "Produtos",
      "Coleções",
    ];
    const corpo = lista.map((m) =>
      [
        m.codigo,
        m.descricao,
        m.grupo,
        m.corMaterial || "sem cor",
        m.unid,
        decimal(m.necessario, 4),
        decimal(m.disponivel, 4),
        m.semCadastro ? "sem cadastro" : decimal(m.falta, 4),
        m.produtos,
        (m.colecoes || []).join(" / "),
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(";"),
    );
    const url = URL.createObjectURL(
      new Blob([[cabecalho.join(";"), ...corpo].join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `falta-comprar-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Compras · Planejamento de Aquisições</p>
          <h1>Falta Comprar para a Projeção</h1>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={exportarCsv}
            disabled={lista.length === 0}
          >
            📥 Exportar CSV
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={() => window.print()}
            disabled={lista.length === 0}
          >
            🖨 Imprimir
          </button>
          <span className="status-pill">{inteiro(resumo.itens)} materiais</span>
        </div>
      </header>

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
        {/* Indicadores de Compras */}
        <div className="metric-strip" style={{ marginBottom: 20 }}>
          <StatCard
            title="Materiais calculados"
            value={inteiro(resumo.itens)}
            subtitle="Itens com demanda da projeção"
            tone="default"
          />
          <StatCard
            title="Materiais em falta"
            value={inteiro(resumo.comFalta)}
            subtitle="Estoque atual não cobre a demanda"
            tone={resumo.comFalta > 0 ? "danger" : "success"}
          />
          <StatCard
            title="Sem cadastro no estoque"
            value={inteiro(resumo.semCadastro)}
            subtitle="Não constam no relatório 2120"
            tone={resumo.semCadastro > 0 ? "warning" : "default"}
          />
          <StatCard
            title="Produtos sem estrutura"
            value={inteiro(semEstrutura)}
            subtitle="Precisam de ficha de consumo 2252"
            tone={semEstrutura > 0 ? "warning" : "default"}
          />
        </div>

        {/* Alertas Importantes */}
        {semEstrutura > 0 && (
          <div
            style={{
              padding: "12px 18px",
              background: "var(--amber-muted, rgba(245, 158, 11, 0.08))",
              borderRadius: 8,
              border: "1px solid var(--amber, #f59e0b)",
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <strong style={{ color: "var(--amber, #f59e0b)" }}>
              ⚠️ {inteiro(semEstrutura)} produto(s) precisam de produção e não têm estrutura de consumo importada.
            </strong>
            <span style={{ color: "var(--muted)" }}>
              {" "}
              O material deles não pôde ser calculado. Importe os relatórios da pasta CONSUMOS-2252 na aba Importar.
            </span>
          </div>
        )}

        {resumo.semCadastro > 0 && (
          <div
            style={{
              padding: "12px 18px",
              background: "var(--amber-muted, rgba(245, 158, 11, 0.08))",
              borderRadius: 8,
              border: "1px solid var(--amber, #f59e0b)",
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <strong style={{ color: "var(--amber, #f59e0b)" }}>
              ⚠️ {inteiro(resumo.semCadastro)} material(is) sem cadastro no estoque de matéria-prima (2120).
            </strong>
            <span style={{ color: "var(--muted)" }}>
              {" "}
              Não é possível saber o saldo disponível. Importe o relatório 2120 ou confira o código no ERP.
            </span>
          </div>
        )}

        {/* Filtros */}
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Coleção:</span>
            <select
              value={colecao}
              onChange={(e) => setColecao(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--line)" }}
            >
              <option value="todas">Todas ({colecoes.length})</option>
              {colecoes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Produto:</span>
            <input
              value={produto}
              onChange={(e) => setProduto(e.target.value.toUpperCase())}
              placeholder="Ref ou cor..."
              style={{ width: 130, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line)" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Material:</span>
            <input
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="Cód ou descrição..."
              style={{ width: 150, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line)" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Grupo:</span>
            <select
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--line)" }}
            >
              <option value="todos">Todos</option>
              {grupos.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Exibir:</span>
            <select
              value={soFalta ? "falta" : "todos"}
              onChange={(e) => setSoFalta(e.target.value === "falta")}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--line)" }}
            >
              <option value="falta">Apenas o que falta comprar</option>
              <option value="todos">Todo material da projeção</option>
            </select>
          </div>

          {(colecao !== "todas" || produto || material || grupo !== "todos" || !soFalta) && (
            <button
              type="button"
              className="button button-outline tiny"
              onClick={() => {
                setColecao("todas");
                setProduto("");
                setGrupo("todos");
                setMaterial("");
                setSoFalta(true);
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Tabela de Falta Comprar */}
        <div
          className="table-scroll"
          ref={wrapRef}
          style={{ height: "calc(100vh - 290px)", minHeight: 460, overflow: "auto" }}
        >
          {carregando ? (
            <div className="vazio-central" style={{ padding: 48, textAlign: "center" }}>
              Calculando necessidades de compra...
            </div>
          ) : lista.length === 0 ? (
            <div className="vazio-central" style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>
              <strong>Nada para comprar com os filtros atuais.</strong>
              <p style={{ marginTop: 8 }}>
                {linhas.length === 0
                  ? "Importe os relatórios na aba Importar para carregar o plano."
                  : semEstrutura > 0
                    ? "Os produtos que precisam de produção não possuem estrutura de consumo cadastrada."
                    : "Ou o estoque atual já cobre a demanda da projeção, ou os filtros estão muito restritivos."}
              </p>
            </div>
          ) : (
            <table
              className="module-table"
              style={{
                width: "100%",
                minWidth: 1100,
                tableLayout: "fixed",
                borderCollapse: "collapse",
              }}
            >
              <colgroup>
                <col style={{ width: 110 }} />
                <col style={{ width: 330 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 90 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ width: 110, textAlign: "left", padding: "10px 12px" }}>Material</th>
                  <th style={{ width: 330, textAlign: "left", padding: "10px 12px" }}>Descrição</th>
                  <th style={{ width: 120, textAlign: "left", padding: "10px 12px" }}>Grupo</th>
                  <th style={{ width: 130, textAlign: "left", padding: "10px 12px" }}>Cor</th>
                  <th style={{ width: 60, textAlign: "center", padding: "10px 8px" }}>Un.</th>
                  <th className="num" style={{ width: 110, textAlign: "right", padding: "10px 12px" }}>
                    Necessário
                  </th>
                  <th className="num" style={{ width: 110, textAlign: "right", padding: "10px 12px" }}>
                    Em Estoque
                  </th>
                  <th className="num" style={{ width: 120, textAlign: "right", padding: "10px 12px" }}>
                    Falta Comprar
                  </th>
                  <th className="num" style={{ width: 90, textAlign: "right", padding: "10px 12px" }}>
                    Produtos
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr
                    key={`${m.codigo}|${m.corMaterial}`}
                    className={m.semCadastro ? "inactive-row" : undefined}
                    style={{ borderBottom: "1px solid var(--line)" }}
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
                      <strong>{m.codigo}</strong>
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                        whiteSpace: "normal",
                        lineHeight: 1.3,
                      }}
                      title={m.descricao}
                    >
                      {m.descricao}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        color: "var(--muted)",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.grupo}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                        whiteSpace: "normal",
                      }}
                      title={m.corMaterialNome || m.corMaterial}
                    >
                      {m.corMaterial || "sem cor"}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
                      {m.unid}
                    </td>
                    <td
                      className="num"
                      style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    >
                      {decimal(m.necessario)}
                    </td>
                    <td
                      className="num"
                      style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    >
                      {m.semCadastro ? "—" : decimal(m.disponivel)}
                    </td>
                    <td
                      className="num"
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 700,
                        color: m.falta > 0 || m.semCadastro ? "var(--danger, #ef4444)" : "var(--success, #10b981)",
                      }}
                    >
                      {m.semCadastro ? "Sem cadastro" : decimal(m.falta)}
                    </td>
                    <td
                      className="num"
                      style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      title={(m.colecoes || []).join(" / ")}
                    >
                      {inteiro(m.produtos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
