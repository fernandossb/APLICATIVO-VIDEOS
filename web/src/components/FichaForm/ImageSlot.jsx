import { useState } from "react";
import { supabase, supabaseConfigured } from "../../lib/supabase";

const BUCKET = "imagens";

async function comprimirImagem(file, maxDim = 1400, qualidade = 0.75) {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, largura, altura);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", qualidade));
}

function paraDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// Best-effort: se a imagem antiga era do nosso bucket, apaga pra não acumular
// arquivo órfão. Nunca deve travar o fluxo principal se falhar.
async function tentarRemoverAntiga(urlAntiga) {
  if (!supabaseConfigured || !urlAntiga || !urlAntiga.includes(`/${BUCKET}/`)) return;
  try {
    const nome = urlAntiga.split(`/${BUCKET}/`)[1];
    if (nome) await supabase.storage.from(BUCKET).remove([nome]);
  } catch {
    // best-effort
  }
}

export default function ImageSlot({ value, onChange, label, compact }) {
  const [enviando, setEnviando] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setEnviando(true);
    try {
      const comprimida = await comprimirImagem(file);

      if (supabaseConfigured) {
        await tentarRemoverAntiga(value);
        const nome = `${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from(BUCKET).upload(nome, comprimida, { contentType: "image/jpeg" });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(nome);
        onChange(data.publicUrl);
      } else {
        onChange(await paraDataUrl(comprimida));
      }
    } catch (err) {
      alert(`Erro ao enviar imagem: ${err.message}`);
    } finally {
      setEnviando(false);
    }
  };

  const handleRemover = async () => {
    await tentarRemoverAntiga(value);
    onChange(null);
  };

  return (
    <div className={`image-slot${compact ? " compact" : ""}`}>
      {value ? (
        <div className="image-slot-preview">
          <img src={value} alt={label || "imagem"} />
          <button type="button" className="button button-outline" onClick={handleRemover}>
            Remover
          </button>
        </div>
      ) : (
        <label className="image-slot-empty">
          <input type="file" accept="image/*" onChange={handleFile} hidden disabled={enviando} />
          <span>{enviando ? "Enviando..." : "+ Enviar imagem"}</span>
        </label>
      )}
    </div>
  );
}
