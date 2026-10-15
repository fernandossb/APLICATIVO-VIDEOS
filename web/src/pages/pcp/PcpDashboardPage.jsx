import { useMemo } from "react";
import { usePcp } from "../../lib/pcp/PcpContext";
import { montarDashboard } from "../../lib/pcp/calc";
import StatCard from "../../components/charts/StatCard";
import RelatorioFaccao from "../../components/pcp/RelatorioFaccao";
import RelatorioLista from "../../components/pcp/RelatorioLista";
import RelatorioLotes from "../../components/pcp/RelatorioLotes";

function inteiro(valor) {
  return Math.round(valor || 0).toLocaleString("pt-BR");
}

function dinheiro(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PcpDashboardPage() {
  const {
    linhas,
    plano,
    carregando,
    erro,
    aviso,
    subRelatorio,
    setSubRelatorio,
    carregarPlano,
    limparLotes,
    carregarDemonstracao,
    irPara,
  } = usePcp();

  const painel = useMemo(() => montarDashboard(linhas), [linhas]);

  if (subRelatorio === "relatorio-faccao") {
    return <RelatorioFaccao linhas={linhas} aoVoltar={() => setSubRelatorio(null)} />;
  }

  if (subRelatorio === "relatorio-lotes") {
    return (
      <RelatorioLotes
        linhas={linhas}
        podeEditar={plano?.podeEditar ?? true}
        aoVoltar={() => setSubRelatorio(null)}
        aoLimparLotes={limparLotes}
      />
    );
  }

  if (subRelatorio === "relatorio-insumos") {
    return (
      <RelatorioLista
        titulo="Insumos críticos"
        descricao="Todo material ligado a produto ativo cujo estoque não cobre o que os produtos ativos que o usam ainda vão consumir."
        itens={montarDashboard(linhas, Infinity).materiais}
        vazio="Nenhum material em falta para o plano atual."
        aoVoltar={() => setSubRelatorio(null)}
      />
    );
  }

  if (subRelatorio === "relatorio-risco") {
    return (
      <RelatorioLista
        titulo="Risco por produto"
        descricao="Referência/tamanho/cor com algum alerta: insumo faltando, estoque fora da faixa, deadline apertado ou sem estrutura."
        itens={montarDashboard(linhas, Infinity).risco}
        vazio="Nenhum risco no plano atual."
        aoVoltar={() => setSubRelatorio(null)}
      />
    );
  }

  const exportarResumo = () => {
    const linhasCsv = [
      ["Indicador", "Valor"],
      ["Insumos não atendem", String(painel.insumosNaoAtendem)],
      ["Abaixo do mínimo", String(painel.abaixoMinimo)],
      ["Lotes programados", String(Math.round(painel.totalLotes))],
      ["Valor programado", dinheiro(painel.valorProgramado)],
      ["Referências", String(painel.referencias)],
    ];
    const csv = linhasCsv.map((l) => l.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `dashboard-pcp-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Planejamento e Controle de Produção</p>
          <h1>Dashboard PCP</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="button button-outline" onClick={exportarResumo}>
            📥 Exportar resumo
          </button>
          <button type="button" className="button button-outline" onClick={() => setSubRelatorio("relatorio-faccao")}>
            🏭 Carga por facção
          </button>
          <button type="button" className="button button-outline" onClick={() => setSubRelatorio("relatorio-lotes")}>
            🖨 Imprimir lotes
          </button>
          <button
            type="button"
            className="button button-outline button-icon"
            onClick={carregarPlano}
            title="Atualizar cálculos"
          >
            🔄
          </button>
          <span className="status-pill">{inteiro(painel.referencias)} linhas</span>
        </div>
      </header>

      <section className="content-panel">
        {erro && (
          <div className="faixa-aviso erro" style={{ marginBottom: 16 }}>
            <span>{erro}</span>
          </div>
        )}
        {aviso && (
          <div className="faixa-aviso ok" style={{ marginBottom: 16 }}>
            <span>{aviso}</span>
          </div>
        )}

        {carregando && !plano ? (
          <div className="app-loading">Carregando plano do PCP...</div>
        ) : linhas.length === 0 ? (
          <div className="empty-state" style={{ padding: "48px 24px", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Nenhuma programação cadastrada ainda</h3>
            <p className="muted" style={{ maxWidth: 520, margin: "0 auto 20px" }}>
              Importe os relatórios diários do SISPLAN (pasta de relatórios) para sincronizar estoque, produção e vendas, ou carregue dados de demonstração para testar as telas.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button type="button" className="button button-primary" onClick={() => irPara("pcp-importar")}>
                📂 Ir para Importar Relatórios
              </button>
              <button type="button" className="button button-outline" onClick={carregarDemonstracao}>
                ✨ Carregar dados de demonstração
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="dashboard-stats" style={{ marginBottom: 24 }}>
              <StatCard
                icon="⚠️"
                label="Insumos não atendem"
                value={inteiro(painel.insumosNaoAtendem)}
                tone="danger"
              />
              <StatCard
                icon="📉"
                label="Abaixo do estoque mínimo"
                value={inteiro(painel.abaixoMinimo)}
                tone="warning"
              />
              <StatCard
                icon="📦"
                label="Lotes programados"
                value={`${inteiro(painel.totalLotes)} peças`}
                tone="info"
              />
              <StatCard
                icon="💰"
                label="Valor programado"
                value={dinheiro(painel.valorProgramado)}
                tone="success"
              />
            </div>

            {painel.semEstrutura > 0 && (
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: "var(--radius)",
                  background: "var(--amber-soft, #fef3c7)",
                  border: "1px solid var(--amber, #d97706)",
                  color: "#92400e",
                  fontWeight: 600,
                  fontSize: 13,
                  marginBottom: 20,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  ⚠️ {inteiro(painel.semEstrutura)} de {inteiro(painel.referencias)} linhas ainda não têm estrutura de consumo importada (relatório 2252).
                </span>
                <button
                  type="button"
                  className="button button-outline tiny"
                  onClick={() => irPara("pcp-importar")}
                >
                  Importar consumo
                </button>
              </div>
            )}

            <div className="chart-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
              {/* Cartão 1: Insumos Críticos */}
              <div className="chart-panel" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 15 }}>Insumos críticos</h3>
                  <button
                    type="button"
                    className="button button-outline tiny"
                    onClick={() => setSubRelatorio("relatorio-insumos")}
                  >
                    Ver todos ({painel.materiais.length})
                  </button>
                </div>
                {painel.materiais.length === 0 ? (
                  <div className="empty-state" style={{ padding: 24, fontSize: 13 }}>
                    Todos os insumos atendem a demanda programada.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {painel.materiais.slice(0, 7).map((m, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 6,
                          background: "var(--bg)",
                          borderLeft: "3px solid var(--danger)",
                        }}
                      >
                        <strong style={{ fontSize: 13, display: "block", overflowWrap: "break-word" }}>{m.label}</strong>
                        <span style={{ fontSize: 12, color: "var(--muted)", overflowWrap: "break-word" }}>{m.detalhe}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cartão 2: Risco por Produto */}
              <div className="chart-panel" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 15 }}>Risco por produto</h3>
                  <button
                    type="button"
                    className="button button-outline tiny"
                    onClick={() => setSubRelatorio("relatorio-risco")}
                  >
                    Ver todos ({painel.risco.length})
                  </button>
                </div>
                {painel.risco.length === 0 ? (
                  <div className="empty-state" style={{ padding: 24, fontSize: 13 }}>
                    Nenhum alerta crítico nos produtos ativos.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {painel.risco.slice(0, 7).map((r, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 6,
                          background: "var(--bg)",
                          borderLeft: "3px solid var(--amber)",
                        }}
                      >
                        <strong style={{ fontSize: 13, display: "block", overflowWrap: "break-word" }}>{r.label}</strong>
                        <span style={{ fontSize: 12, color: "var(--muted)", overflowWrap: "break-word" }}>{r.detalhe}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
