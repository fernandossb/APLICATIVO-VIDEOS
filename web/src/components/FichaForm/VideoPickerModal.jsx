export default function VideoPickerModal({ codigo, descricao, videos, onClose }) {
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <p className="overline">{codigo}</p>
            <h2>{descricao || "Vídeos da operação"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Fechar">
            ×
          </button>
        </div>

        <ul className="video-picker-list">
          {videos.map((v, i) => (
            <li key={i}>
              <a href={v.url} target="_blank" rel="noreferrer" onClick={onClose}>
                <span className="play-button" aria-hidden="true">
                  ▶
                </span>
                <span>{v.nome || `Vídeo ${i + 1}`}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
