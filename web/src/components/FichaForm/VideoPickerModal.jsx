import { useState } from "react";

function extrairYoutubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");

    if (host === "youtube.com") {
      if (u.pathname === "/watch" && u.searchParams.get("v")) return u.searchParams.get("v");
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2];
    }
    if (host === "youtu.be") return u.pathname.slice(1);
    return null;
  } catch {
    return null;
  }
}

function extrairVimeoId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^\d+$/.test(id) ? id : null;
    }
    if (host === "player.vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id && /^\d+$/.test(id) ? id : null;
    }
    return null;
  } catch {
    return null;
  }
}

// Reconhece link do YouTube/Vimeo e devolve a URL de embutir — nesses casos o player deles
// toca direto, sem passar pela tentativa de <video>/<iframe> genérica abaixo. Retorna null
// pra qualquer outro link (aí segue o caminho antigo).
function paraEmbedConhecido(url) {
  const ytId = extrairYoutubeId(url);
  if (ytId) return `https://www.youtube.com/embed/${ytId}`;
  const vimeoId = extrairVimeoId(url);
  if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}`;
  return null;
}

// Toca o vídeo dentro do próprio player do site (em vez de abrir o arquivo numa aba/site
// externo) pra não expor o botão de download nem o "Salvar vídeo como" do clique direito.
// Isso impede o jeito fácil de baixar — não existe forma 100% à prova de download de um
// vídeo que roda no navegador, mas isso tira o botão óbvio de quem só quer assistir.
//
// Nem todo link cadastrado é um arquivo de vídeo direto: um link "compartilhar" do OneDrive/
// SharePoint é uma página, não o vídeo puro, e a tag <video> não consegue tocar isso. Por isso,
// pra links assim, tenta <video> primeiro (com a proteção de download) e, se falhar, cai pra um
// <iframe> (mostra a própria página/player do OneDrive — nesse caso não dá pra garantir que o
// download some, já que quem controla os controles ali é o OneDrive, não o nosso site).
function VideoPlayer({ url }) {
  const [falhouVideo, setFalhouVideo] = useState(false);
  const embedConhecido = paraEmbedConhecido(url);

  return (
    <div className="video-embed">
      {embedConhecido ? (
        <iframe
          className="video-embed-media"
          src={embedConhecido}
          title="Vídeo da operação"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : !falhouVideo ? (
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

// Miniatura de um vídeo da lista. Vídeo do YouTube usa a miniatura de verdade (fornecida pelo
// próprio YouTube, sem precisar de chave de API) e clicar abre direto no YouTube — no celular
// isso já entrega o player nativo deles, que faz tela cheia melhor (girando o aparelho ou pelo
// próprio ícone) do que qualquer coisa que a gente force por JavaScript aqui (principalmente no
// iPhone, que não deixa colocar um iframe em tela cheia via código). Qualquer outro link (vídeo
// antigo do OneDrive, por exemplo) cai no ícone genérico e continua tocando embutido no site.
function MiniaturaVideo({ video, indice, onAbrirYoutube, onTocarEmbutido }) {
  const ytId = extrairYoutubeId(video.url);
  const rotulo = video.nome || `Vídeo ${indice + 1}`;

  return (
    <button
      type="button"
      className="video-thumb-card"
      onClick={() => (ytId ? onAbrirYoutube(ytId) : onTocarEmbutido(video))}
    >
      <span className="video-thumb-wrap">
        {ytId ? (
          <img className="video-thumb" src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt="" loading="lazy" />
        ) : (
          <span className="video-thumb video-thumb-generico" aria-hidden="true">
            ▶
          </span>
        )}
        <span className="video-thumb-play" aria-hidden="true">
          ▶
        </span>
      </span>
      <span className="video-thumb-label">{rotulo}</span>
    </button>
  );
}

export default function VideoPickerModal({ codigo, descricao, videos, tocando, onSelecionar, onClose }) {
  const abrirNoYoutube = (id) => {
    window.open(`https://www.youtube.com/watch?v=${id}`, "_blank", "noopener,noreferrer");
  };

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
          <div className="video-picker-grid">
            {videos.map((v, i) => (
              <MiniaturaVideo
                key={i}
                video={v}
                indice={i}
                onAbrirYoutube={abrirNoYoutube}
                onTocarEmbutido={onSelecionar}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
