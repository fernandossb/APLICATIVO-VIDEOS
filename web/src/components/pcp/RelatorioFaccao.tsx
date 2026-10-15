import { useMemo } from "react";
import type { LinhaCalculada } from "@/lib/pcp/calc";

function inteiro(valor: number): string {
  return Math.round(valor).toLocaleString("pt-BR");
}

function semanas(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return "0";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function RelatorioFaccao({ linhas, aoVoltar }: { linhas: LinhaCalculada[]; aoVoltar: () => void }) {
  const porFaccao = useMemo(() => {
    const mapa = new Map<
      string,
      { label: string; semanas: number; lote: number; produtos: Array<LinhaCalculada> }
    >();
    for (const linha of linhas) {
      if (!linha.grupoLider) continue;
      const chave = linha.faccao || "";
      const atual = mapa.get(chave) ?? { label: linha.faccao || "Sem facção", semanas: 0, lote: 0, produtos: [] };
      atual.semanas += linha.semanas;
      atual.lote += linha.lote;
      atual.produtos.push(linha);
      mapa.set(chave, atual);
    }
    return [...mapa.values()]
      .map((f) => ({ ...f, produtos: [...f.produtos].sort((a, b) => b.semanas - a.semanas) }))
      .sort((a, b) => b.semanas - a.semanas);
  }, [linhas]);

  function imprimir() {
    window.print();
  }

  return (
    <main className="workspace">
      <header className="topbar no-print">
        <div className="sheet-header-inline">
          <p className="overline">PCP · Relatórios</p>
          <h1>Carga por facção</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="button button-outline" onClick={aoVoltar}>
            ← Voltar ao Dashboard
          </button>
          <button type="button" className="button button-primary" onClick={imprimir}>
            🖨 Imprimir
          </button>
        </div>
      </header>

      <section className="content-panel">
        <div className="module-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>Semanas de produção por facção</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Carga calculada com base na capacidade semanal e lotes programados.
            </p>
          </div>
          <span className="status-pill">{inteiro(porFaccao.length)} facção(ões)</span>
        </div>

        {porFaccao.length === 0 ? (
          <div className="empty-state">Nenhuma facção definida no plano atual.</div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {porFaccao.map((f) => (
              <div key={f.label} className="panel" style={{ border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 16, background: "var(--surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{f.label}</strong>
                    <span className="muted" style={{ marginLeft: 12, fontSize: 13 }}>{f.produtos.length} produto(s)</span>
                  </div>
                  <span className="status-pill" style={{ fontSize: 13, fontWeight: 700 }}>
                    {semanas(f.semanas)} semana(s) · Lote total: {inteiro(f.lote)}
                  </span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 120 }}>Referência</th>
                        <th>Cor</th>
                        <th style={{ width: 120, textAlign: "right" }}>Semanas</th>
                        <th style={{ width: 120, textAlign: "right" }}>Lote</th>
                        <th style={{ width: 140 }}>Deadline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.produtos.map((p) => (
                        <tr key={p.grupoKey}>
                          <td style={{ fontWeight: 600 }}>{p.referencia}</td>
                          <td style={{ overflowWrap: "break-word" }}>{p.corNome || p.cor}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{semanas(p.semanas)}</td>
                          <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{inteiro(p.lote)}</td>
                          <td>{p.deadline || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
