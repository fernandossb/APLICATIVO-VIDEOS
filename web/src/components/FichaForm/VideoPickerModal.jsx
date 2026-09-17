import { useState } from "react";

// Toca o vídeo dentro do próprio player do site (em vez de abrir o arquivo numa aba/site
// externo) pra não expor o botão de download nem o "Salvar vídeo como" do clique direito.
// Isso impede o jeito fácil de baixar — não existe forma 100% à prova de download de um
// vídeo que roda no navegador, mas isso tira o botão óbvio de quem só quer assistir.
//
// Nem todo link cadastrado é um arquivo de vídeo direto: um link "compartilhar" do OneDrive/
// SharePoint é uma página, não o vídeo puro, e a tag <video> não consegue tocar isso. Por isso
// tenta <video> primeiro (com a proteção de download) e, se falhar, cai pra um <iframe> (mostra
// a própria página/player do OneDrive — nesse caso não dá pra garantir que o download some, já
// que quem controla os controles ali é o OneDrive, não o nosso site).
function VideoPlayer({ url }) {
  const [falhouVideo, setFalhouVideo] = useState(false);

  return (
    <div className="video-embed">
      {!falhouVideo ? (
        <video
          key={url}
          className="video-embed-media"
          src={url}
          controls
          autoPlay
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onError={() => setFalhouVideo(true)}
        />
      ) : (
        <iframe
          className="video-embed-media"
          src={url}
          title="Vídeo da operação"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      )}
      <a className="video-fallback-link" href={url} target="_blank" rel="noreferrer">
        O vídeo não aparece? Abrir em outra aba ↗
      </a>
    </div>
  );
}

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
            <VideoPlayer url={tocando.url} />
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
