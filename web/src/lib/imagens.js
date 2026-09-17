import { supabase, supabaseConfigured } from "./supabase";

const BUCKET = "imagens";

function paraDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function urlParaDataUrl(url) {
  const resposta = await fetch(url);
  const blob = await resposta.blob();
  return paraDataUrl(blob);
}

function dataUrlParaBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*);base64/)?.[1] || "image/jpeg";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadImagem(dataUrl) {
  const blob = dataUrlParaBlob(dataUrl);
  const nome = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(nome, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(nome).data.publicUrl;
}

export function nomeDoArquivoNoBucket(url) {
  if (typeof url !== "string" || !url.includes(`/${BUCKET}/`)) return null;
  return url.split(`/${BUCKET}/`)[1] || null;
}

// Antes de exportar: troca um link do Storage pela imagem de verdade em
// base64, pra o .json ficar autossuficiente (sobrevive mesmo se o registro
// for excluído do site depois, o que apaga o arquivo do Storage).
export async function embutirImagemUnica(valor) {
  if (typeof valor === "string" && valor.startsWith("http") && valor.includes(`/${BUCKET}/`)) {
    try {
      return await urlParaDataUrl(valor);
    } catch {
      return valor;
    }
  }
  return valor;
}

// Ao importar: sobe uma imagem embutida (base64) de volta pro Storage e
// devolve o link novo. Em modo local (sem Supabase) não faz nada.
export async function rehospedarImagemUnica(valor) {
  if (!supabaseConfigured) return valor;
  if (typeof valor === "string" && valor.startsWith("data:image")) {
    try {
      return await uploadImagem(valor);
    } catch {
      return valor;
    }
  }
  return valor;
}

// Percorre todos os campos de imagem de uma ficha técnica (desenho técnico,
// imagens de modelagem, imagem de cada variante) e aplica uma transformação
// assíncrona em cada um.
async function transformarImagensDaFicha(ficha, transformar) {
  const nova = { ...ficha };

  if (nova.desenhoTecnico) nova.desenhoTecnico = await transformar(nova.desenhoTecnico);

  if (nova.imagensModelagem) {
    const im = { ...nova.imagensModelagem };
    for (const chave of ["desenhoMedidas", "metodoDeMedir", "localizacaoEtiquetas", "pecaExplodida"]) {
      if (im[chave]) im[chave] = await transformar(im[chave]);
    }
    nova.imagensModelagem = im;
  }

  if (nova.variantes?.length) {
    nova.variantes = await Promise.all(
      nova.variantes.map(async (v) => (v.imagem ? { ...v, imagem: await transformar(v.imagem) } : v))
    );
  }

  return nova;
}

export function embutirImagensDaFicha(ficha) {
  return transformarImagensDaFicha(ficha, embutirImagemUnica);
}

export function rehospedarImagensDaFicha(ficha) {
  return transformarImagensDaFicha(ficha, rehospedarImagemUnica);
}

// Todos os nomes de arquivo do Storage usados por uma ficha, pra apagar
// junto quando ela for excluída (senão a foto fica órfã, ocupando espaço).
export function nomesDeImagensDaFicha(ficha) {
  const candidatos = [
    ficha.desenhoTecnico,
    ficha.imagensModelagem?.desenhoMedidas,
    ficha.imagensModelagem?.metodoDeMedir,
    ficha.imagensModelagem?.localizacaoEtiquetas,
    ficha.imagensModelagem?.pecaExplodida,
    ...(ficha.variantes || []).map((v) => v.imagem),
  ];
  return candidatos.map(nomeDoArquivoNoBucket).filter(Boolean);
}
