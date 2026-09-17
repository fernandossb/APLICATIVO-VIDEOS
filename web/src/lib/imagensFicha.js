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

// Percorre todos os campos de imagem de uma ficha (desenho técnico, imagens
// de modelagem, imagem de cada variante) e aplica uma transformação
// assíncrona em cada um. Usado tanto para "embutir" a imagem no export
// quanto para "re-hospedar" ela no import.
async function transformarImagens(ficha, transformar) {
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

// Antes de exportar: troca cada link do Storage pela imagem de verdade em
// base64, pra o .json ficar autossuficiente (sobrevive mesmo se a ficha for
// excluída do site depois, o que apaga os arquivos do Storage).
export function embutirImagens(ficha) {
  return transformarImagens(ficha, async (valor) => {
    if (typeof valor === "string" && valor.startsWith("http") && valor.includes(`/${BUCKET}/`)) {
      try {
        return await urlParaDataUrl(valor);
      } catch {
        return valor;
      }
    }
    return valor;
  });
}

// Ao importar: sobe cada imagem embutida (base64) de volta pro Storage e
// troca pelo link novo. Em modo local (sem Supabase) não faz nada — a
// imagem já fica em base64 do mesmo jeito que o app usa localmente.
export function rehospedarImagens(ficha) {
  if (!supabaseConfigured) return Promise.resolve(ficha);
  return transformarImagens(ficha, async (valor) => {
    if (typeof valor === "string" && valor.startsWith("data:image")) {
      try {
        return await uploadImagem(valor);
      } catch {
        return valor;
      }
    }
    return valor;
  });
}
