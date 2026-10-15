import type { ReactNode } from "react";

function inteiro(valor: number): string {
  return Math.round(valor).toLocaleString("pt-BR");
}

export interface ItemRelatorioLista {
  label: string;
  detalhe: string;
}

export default function RelatorioLista({
  titulo,
  descricao,
  itens,
  vazio,
  aoVoltar,
}: {
  titulo: string;
  descricao: string;
  itens: ItemRelatorioLista[];
  vazio: string;
  aoVoltar: () => void;
}) {
  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">PCP · Diagnóstico</p>
          <h1>{titulo}</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="button button-outline" onClick={aoVoltar}>
            ← Voltar ao Dashboard
          </button>
          <span className="status-pill">{inteiro(itens.length)} item(ns)</span>
        </div>
      </header>

      <section className="content-panel">
        <div style={{ marginBottom: 16 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            {descricao}
          </p>
        </div>

        {itens.length === 0 ? (
          <div className="empty-state">{vazio}</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "30%", minWidth: 200 }}>Identificação</th>
                  <th>Detalhe / Alerta</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item, i) => (
                  <tr key={`${item.label}-${i}`}>
                    <td style={{ fontWeight: 600, overflowWrap: "break-word" }}>{item.label}</td>
                    <td style={{ overflowWrap: "break-word", color: "var(--danger)" }}>{item.detalhe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
