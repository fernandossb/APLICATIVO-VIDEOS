import { useEffect, useMemo, useState } from "react";
import type { LinhaCalculada } from "@/lib/pcp/calc";

function inteiro(valor: number): string {
  return Math.round(valor).toLocaleString("pt-BR");
}

export default function RelatorioLotes({
  linhas,
  podeEditar,
  aoVoltar,
  aoLimparLotes,
}: {
  linhas: LinhaCalculada[];
  podeEditar: boolean;
  aoVoltar: () => void;
  aoLimparLotes: (ids: string[]) => Promise<void>;
}) {
  const comLote = useMemo(
    () =>
      linhas
        .filter((l) => l.lote > 0)
        .sort(
          (a, b) =>
            a.faccao.localeCompare(b.faccao, "pt-BR") ||
            a.referencia.localeCompare(b.referencia, "pt-BR", { numeric: true }) ||
            a.cor.localeCompare(b.cor, "pt-BR"),
        ),
    [linhas],
  );

  const [limpando, setLimpando] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    function aoTerminarImpressao() {
      if (comLote.length === 0) return;
      if (!window.confirm(`Impressão encerrada. Deseja limpar os ${comLote.length} lote(s) impressos da planilha?`)) return;
      setLimpando(true);
      aoLimparLotes(comLote.map((l) => l.id))
        .then(() => setAviso(`${comLote.length} lote(s) limpos da planilha.`))
        .catch((e) => alert(e instanceof Error ? e.message : "Falha ao limpar lotes."))
        .finally(() => setLimpando(false));
    }

    window.addEventListener("afterprint", aoTerminarImpressao);
    return () => window.removeEventListener("afterprint", aoTerminarImpressao);
  }, [comLote, aoLimparLotes]);

  function imprimir() {
    window.print();
  }

  const totalPecas = comLote.reduce((acc, l) => acc + l.lote, 0);

  return (
    <main className="workspace">
      <header className="topbar no-print">
        <div className="sheet-header-inline">
          <p className="overline">PCP · Produção</p>
          <h1>Impressão de lotes programados</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="button button-outline" onClick={aoVoltar}>
            ← Voltar ao Dashboard
          </button>
          <button type="button" className="button button-primary" onClick={imprimir}>
            🖨 Imprimir lotes
          </button>
        </div>
      </header>

      <section className="content-panel">
        {aviso && (
          <div className="faixa-aviso ok" style={{ marginBottom: 16 }}>
            <span>{aviso}</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>Lotes com corte programado</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Total de {inteiro(totalPecas)} peça(s) programada(s) em {comLote.length} variação(ões).
            </p>
          </div>
          <span className="status-pill">{inteiro(comLote.length)} linhas</span>
        </div>

        {comLote.length === 0 ? (
          <div className="empty-state">Nenhum lote programado no plano atual.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Facção</th>
                  <th style={{ width: 120 }}>Referência</th>
                  <th style={{ width: 80, textAlign: "center" }}>Tam</th>
                  <th style={{ width: 160 }}>Cor</th>
                  <th>Descrição</th>
                  <th style={{ width: 100, textAlign: "right" }}>Lote</th>
                  <th style={{ width: 120 }}>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {comLote.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{l.faccao || "Sem facção"}</td>
                    <td>{l.referencia}</td>
                    <td style={{ textAlign: "center", fontWeight: 700 }}>{l.tam}</td>
                    <td style={{ overflowWrap: "break-word" }}>{l.corNome || l.cor}</td>
                    <td style={{ overflowWrap: "break-word" }}>{l.descricao}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {inteiro(l.lote)}
                    </td>
                    <td>{l.deadline || "—"}</td>
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
