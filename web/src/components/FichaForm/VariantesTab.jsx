import ImageSlot from "./ImageSlot";

export default function VariantesTab({ ficha, update }) {
  const variantes = ficha.variantes || [];

  const setVariant = (i, patch) =>
    update({ variantes: variantes.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) });

  const addVariant = () => update({ variantes: [...variantes, { codigo: "", nomeCor: "", imagem: null }] });
  const removeVariant = (i) => update({ variantes: variantes.filter((_, idx) => idx !== i) });

  return (
    <div className="tab-panel">
      <h3 className="sub">Variantes e cores</h3>
      <p className="hint">O código de cada variante é usado para casar consumo por cor na aba Insumos.</p>
      <div className="color-grid-edit">
        {variantes.map((v, i) => (
          <div className="color-chip-edit" key={i}>
            <ImageSlot value={v.imagem} onChange={(img) => setVariant(i, { imagem: img })} label={v.nomeCor} compact />
            <div className="color-chip-fields">
              <input placeholder="Código (ex.: PT08)" value={v.codigo} onChange={(e) => setVariant(i, { codigo: e.target.value })} />
              <input placeholder="Cor (ex.: PRETO)" value={v.nomeCor} onChange={(e) => setVariant(i, { nomeCor: e.target.value })} />
            </div>
            <button type="button" className="icon-button tiny" onClick={() => removeVariant(i)} title="Remover">
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="button button-outline" onClick={addVariant}>
        + Adicionar variante
      </button>
    </div>
  );
}
