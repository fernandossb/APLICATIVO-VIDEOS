import { useEffect, useMemo, useState } from "react";
import { pcpDb } from "../../lib/pcp/pcpDb";
import StatCard from "../../components/charts/StatCard";

function inteiro(valor) {
  return Math.round(Number(valor) || 0).toLocaleString("pt-BR");
}

function dataHora(valor) {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleString("pt-BR");
}

export default function ComprasRelatoriosPage() {
  const [importacoes, setImportacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");

  const carregar = async () => {
    try {
      setCarregando(true);
      setErro("");
      const corpo = await pcpDb.obterModulos();
      setImportacoes(corpo.importacoes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar histórico de relatórios.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return importacoes;
    return importacoes.filter((imp) => {
      const texto = `${imp.tipo} ${imp.arquivo} ${imp.usuario} ${imp.avisos}`.toLowerCase();
      return texto.includes(termo);
    });
  }, [importacoes, busca]);

  const stats = useMemo(() => {
    let lidasTotais = 0;
    let aproveitadasTotais = 0;
    for (const imp of filtradas) {
      lidasTotais += Number(imp.linhasLidas) || 0;
      aproveitadasTotais += Number(imp.linhasAproveitadas) || 0;
    }
    return {
      cargas: filtradas.length,
      lidasTotais,
      aproveitadasTotais,
    };
  }, [filtradas]);

  function exportarCsv() {
    if (filtradas.length === 0) return;
    const colunas = [
      "Tipo",
      "Variação",
      "Arquivo",
      "Data Arquivo",
      "Linhas Lidas",
      "Linhas Aproveitadas",
      "Avisos",
      "Usuário",
      "Importado Em",
    ];
    const corpo = filtradas.map((imp) =>
      [
        imp.tipo,
        imp.variacao || "",
        imp.arquivo || "",
        imp.dataArquivo || "",
        inteiro(imp.linhasLidas),
        inteiro(imp.linhasAproveitadas),
        imp.avisos || "",
        imp.usuario || "",
        dataHora(imp.importadoEm),
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(";"),
    );
    const url = URL.createObjectURL(
      new Blob([[colunas.join(";"), ...corpo].join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `historico-cargas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Compras & PCP · Auditoria de Dados</p>
          <h1>Relatórios e Cargas Importadas</h1>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={exportarCsv}
            disabled={filtradas.length === 0}
          >
            📥 Exportar CSV
          </button>
          <button
            type="button"
            className="button button-outline button-icon"
            onClick={carregar}
            title="Recarregar histórico"
          >
            🔄
          </button>
          <span className="status-pill">{inteiro(stats.cargas)} cargas</span>
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
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: "16px 24px",
          maxWidth: "100%",
          width: "100%",
          margin: 0,
          overflow: "hidden",
        }}
      >
        {/* Indicadores */}
        <div className="metric-strip" style={{ marginBottom: 20 }}>
          <StatCard
            title="Total de cargas"
            value={inteiro(stats.cargas)}
            subtitle="Importações registradas no banco local"
            tone="default"
          />
          <StatCard
            title="Linhas aproveitadas"
            value={inteiro(stats.aproveitadasTotais)}
            subtitle="Registros válidos gravados"
            tone="success"
          />
          <StatCard
            title="Linhas lidas no ERP"
            value={inteiro(stats.lidasTotais)}
            subtitle="Volume total processado nos CSVs"
            tone="default"
          />
        </div>

        {/* Busca */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--card-hover, rgba(0,0,0,0.02))",
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            marginBottom: 16,
          }}
        >
          <input
            type="text"
            placeholder="Buscar por tipo de relatório, nome do arquivo ou usuário..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--line)" }}
          />
          {busca && (
            <button
              type="button"
              className="button button-outline tiny"
              onClick={() => setBusca("")}
            >
              Limpar
            </button>
          )}
        </div>

        {/* Tabela de Relatórios */}
        <div className="table-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {carregando ? (
            <div className="vazio-central" style={{ padding: 48, textAlign: "center" }}>
              Carregando histórico de importações...
            </div>
          ) : filtradas.length === 0 ? (
            <div className="vazio-central" style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>
              <strong>Nenhuma carga registrada no banco.</strong>
              <p style={{ marginTop: 8 }}>
                Importe os relatórios na aba <strong>Importar</strong> para gerar os registros de auditoria.
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
                <col style={{ width: 180 }} />
                <col style={{ width: 250 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 280 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 150 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ width: 180, textAlign: "left", padding: "10px 12px" }}>Tipo de Relatório</th>
                  <th style={{ width: 250, textAlign: "left", padding: "10px 12px" }}>Arquivo Importado</th>
                  <th style={{ width: 120, textAlign: "center", padding: "10px 8px" }}>Data Arquivo</th>
                  <th className="num" style={{ width: 100, textAlign: "right", padding: "10px 12px" }}>
                    Linhas Lidas
                  </th>
                  <th className="num" style={{ width: 110, textAlign: "right", padding: "10px 12px" }}>
                    Aproveitadas
                  </th>
                  <th style={{ width: 280, textAlign: "left", padding: "10px 12px" }}>Avisos / Ocorrências</th>
                  <th style={{ width: 110, textAlign: "left", padding: "10px 12px" }}>Usuário</th>
                  <th style={{ width: 150, textAlign: "left", padding: "10px 12px" }}>Data / Hora</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((imp, i) => (
                  <tr key={`${imp.tipo}|${imp.importadoEm}|${i}`} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td
                      style={{
                        padding: "8px 12px",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                      }}
                    >
                      <strong>{imp.tipo}</strong>
                      {imp.variacao ? (
                        <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
                          {imp.variacao}
                        </span>
                      ) : null}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                        whiteSpace: "normal",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                      title={imp.arquivo}
                    >
                      {imp.arquivo || "—"}
                    </td>
                    <td style={{ padding: "8px 8px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
                      {imp.dataArquivo || "—"}
                    </td>
                    <td
                      className="num"
                      style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    >
                      {inteiro(imp.linhasLidas)}
                    </td>
                    <td
                      className="num"
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
                        color: "var(--success, #10b981)",
                      }}
                    >
                      {inteiro(imp.linhasAproveitadas)}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                        whiteSpace: "normal",
                        fontSize: 12,
                        color: imp.avisos ? "var(--amber, #f59e0b)" : "var(--muted)",
                      }}
                      title={imp.avisos}
                    >
                      {imp.avisos || "—"}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 13, overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {imp.usuario || "Sistema"}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--muted)" }}>
                      {dataHora(imp.importadoEm)}
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
