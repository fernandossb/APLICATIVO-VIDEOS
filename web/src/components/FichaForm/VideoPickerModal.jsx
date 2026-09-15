export default function VideoPickerModal({ codigo, descricao, status, videos, mensagem, onClose }) {
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

        {status === "carregando" && <div className="empty-state">Buscando vídeos na pasta do OneDrive...</div>}

        {status === "erro" && (
          <div className="empty-state">
            Não consegui buscar os vídeos agora.
            <br />
            {mensagem}
          </div>
        )}

        {status === "pronto" && videos.length === 0 && (
          <div className="empty-state">Nenhum vídeo com o código {codigo} encontrado na pasta do OneDrive.</div>
        )}

        {status === "pronto" && videos.length > 0 && (
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
        )}
      </div>
    </div>
  );
}
