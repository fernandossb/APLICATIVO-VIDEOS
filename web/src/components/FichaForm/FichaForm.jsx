import { useState } from "react";
import CapaTab from "./CapaTab";
import VariantesTab from "./VariantesTab";
import ModelagemTab from "./ModelagemTab";
import InsumosTab from "./InsumosTab";
import ComentariosTab from "./ComentariosTab";
import RoteiroTab from "./RoteiroTab";

const TABS = [
  { key: "capa", label: "Capa", Component: CapaTab },
  { key: "variantes", label: "Variantes", Component: VariantesTab },
  { key: "modelagem", label: "Modelagem", Component: ModelagemTab },
  { key: "insumos", label: "Insumos", Component: InsumosTab },
  { key: "roteiro", label: "Roteiro", Component: RoteiroTab },
  { key: "comentarios", label: "Comentários", Component: ComentariosTab },
];

export default function FichaForm({ ficha, onChange, onSave, status }) {
  const [tab, setTab] = useState("capa");
  const Active = TABS.find((t) => t.key === tab).Component;

  const update = (patch) => onChange({ ...ficha, ...patch });

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
    </>
  );
}
