// Toca o vídeo dentro do próprio player do site (em vez de abrir o arquivo numa aba/site
// externo) pra não expor o botão de download nem o "Salvar vídeo como" do clique direito.
// Isso impede o jeito fácil de baixar — não existe forma 100% à prova de download de um
// vídeo que roda no navegador, mas isso tira o botão óbvio de quem só quer assistir.
export default function VideoPickerModal({ codigo, descricao, videos, tocando, onSelecionar, onClose }) {
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card modal-card-wide">
        <div className="modal-head">
          <div>
            <p className="overline">{codigo}</p>
            <h2>{descricao || "Vídeos da operação"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Fechar">
            ×
          </button>
        </div>

        {tocando ? (
          <div className="video-player-wrap">
            <video
              key={tocando.url}
              src={tocando.url}
              controls
              autoPlay
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
            />
            {videos.length > 1 && (
              <button type="button" className="button button-outline" onClick={() => onSelecionar(null)}>
                ← Ver lista de vídeos
              </button>
            )}
          </div>
        ) : (
          <ul className="video-picker-list">
            {videos.map((v, i) => (
              <li key={i}>
                <button type="button" onClick={() => onSelecionar(v)}>
                  <span className="play-button" aria-hidden="true">
                    ▶
                  </span>
                  <span>{v.nome || `Vídeo ${i + 1}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
