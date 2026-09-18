import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CapaTab from "./CapaTab";
import VariantesTab from "./VariantesTab";
import ModelagemTab from "./ModelagemTab";
import InsumosTab from "./InsumosTab";
import ComentariosTab from "./ComentariosTab";
import RoteiroTab from "./RoteiroTab";
import ImprimirFichaModal from "./ImprimirFichaModal";

const TABS = [
  { key: "capa", label: "Capa", Component: CapaTab },
  { key: "variantes", label: "Variantes", Component: VariantesTab },
  { key: "modelagem", label: "Modelagem", Component: ModelagemTab },
  { key: "insumos", label: "Insumos", Component: InsumosTab },
  { key: "roteiro", label: "Roteiro", Component: RoteiroTab },
  { key: "comentarios", label: "Comentários", Component: ComentariosTab },
];

const semEdicao = () => {};

export default function FichaForm({ ficha, onChange, onSave, status }) {
  const [tab, setTab] = useState("capa");
  const [modalImprimir, setModalImprimir] = useState(false);
  const [abasImpressao, setAbasImpressao] = useState(null);
  const Active = TABS.find((t) => t.key === tab).Component;

  const update = (patch) => onChange({ ...ficha, ...patch });

  // dispara a janela de impressão do navegador assim que a "cópia" pra impressão
  // (todas as abas escolhidas, uma embaixo da outra) termina de renderizar
  useEffect(() => {
    if (!abasImpressao) return;
    const limpar = () => setAbasImpressao(null);
    window.addEventListener("afterprint", limpar);
    window.print();
    return () => window.removeEventListener("afterprint", limpar);
  }, [abasImpressao]);

  return (
    <>
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Ficha técnica</p>
          <h1>
            {ficha.referencia || "Nova ficha"}
            {ficha.descricao ? ` — ${ficha.descricao}` : ""}
          </h1>
        </div>
        <div className="topbar-actions">
          {status && <span className="status-pill">{status}</span>}
          <button type="button" className="button button-outline" onClick={() => setModalImprimir(true)}>
            🖨 Imprimir / PDF
          </button>
          <button type="button" className="button button-primary" onClick={onSave}>
            Salvar
          </button>
        </div>
      </header>

      <nav className="tech-nav">
        {TABS.map((t) => (
          <a
            key={t.key}
            href="#"
            className={tab === t.key ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              setTab(t.key);
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <section className="content-panel">
        <Active ficha={ficha} update={update} />
      </section>

      {abasImpressao &&
        createPortal(
          // Fica fora da árvore do app-shell de propósito (direto no body): assim o CSS de
          // impressão só precisa esconder o app-shell inteiro e mostrar isto aqui, sem o
          // truque de "visibility" que o Chrome não renderiza direito ao gerar PDF.
          <div className="print-view">
            <h1 className="print-title">
              {ficha.referencia || "Ficha técnica"}
              {ficha.descricao ? ` — ${ficha.descricao}` : ""}
            </h1>
            {abasImpressao.map((chave) => {
              const t = TABS.find((tt) => tt.key === chave);
              if (!t) return null;
              const TabImpressa = t.Component;
              return (
                <section className="print-tab-section" key={chave}>
                  <h2>{t.label}</h2>
                  <TabImpressa ficha={ficha} update={semEdicao} />
                </section>
              );
            })}
          </div>,
          document.body
        )}

      {modalImprimir && (
        <ImprimirFichaModal
          tabs={TABS}
          onFechar={() => setModalImprimir(false)}
          onImprimir={(chaves) => {
            setModalImprimir(false);
            setAbasImpressao(chaves);
          }}
        />
      )}
    </>
  );
}
