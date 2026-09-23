import { useState } from "react";

export default function ImprimirFichaModal({ tabs, onImprimir, onFechar }) {
  const [selecionadas, setSelecionadas] = useState(tabs.map((t) => t.key));

  const toggle = (key) => {
    setSelecionadas((atual) => (atual.includes(key) ? atual.filter((k) => k !== key) : [...atual, key]));
  };

  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onFechar} />
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <p className="overline">Ficha técnica</p>
            <h2>Imprimir / gerar PDF</h2>
          </div>
          <button type="button" className="icon-button" onClick={onFechar} title="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p>Escolha quais abas entram na impressão:</p>
          <div className="chip-grid">
            {tabs.map((t) => (
              <label className="check-chip" key={t.key}>
                <input type="checkbox" checked={selecionadas.includes(t.key)} onChange={() => toggle(t.key)} />
                <span className={selecionadas.includes(t.key) ? "checked" : ""}>{t.label}</span>
              </label>
            ))}
          </div>
          <p className="hint">
            Ao continuar, abre a janela de impressão do navegador — escolha uma impressora ou "Salvar como PDF" como
            destino.
          </p>
        </div>
        <div className="modal-foot">
          <button type="button" className="button button-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={selecionadas.length === 0}
            onClick={() => onImprimir(selecionadas)}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
