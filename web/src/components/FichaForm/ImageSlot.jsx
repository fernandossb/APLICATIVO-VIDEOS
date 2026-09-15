export default function ImageSlot({ value, onChange, label, compact }) {
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className={`image-slot${compact ? " compact" : ""}`}>
      {value ? (
        <div className="image-slot-preview">
          <img src={value} alt={label || "imagem"} />
          <button type="button" className="button button-outline" onClick={() => onChange(null)}>
            Remover
          </button>
        </div>
      ) : (
        <label className="image-slot-empty">
          <input type="file" accept="image/*" onChange={handleFile} hidden />
          <span>+ Enviar imagem</span>
        </label>
      )}
    </div>
  );
}
