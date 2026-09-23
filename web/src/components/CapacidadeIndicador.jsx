import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";

const LIMITE_BANCO_BYTES = 500 * 1024 * 1024; // plano gratuito Supabase
const LIMITE_STORAGE_BYTES = 1024 * 1024 * 1024; // plano gratuito Supabase
const BUCKET = "imagens";

function formatarMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function nivelPorPercentual(pct) {
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warning";
  return "success";
}

async function tamanhoTotalStorage(bucket) {
  let total = 0;
  let offset = 0;
  const pagina = 200;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list("", { limit: pagina, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) total += item.metadata?.size || 0;
    if (data.length < pagina) break;
    offset += pagina;
  }
  return total;
}

export default function CapacidadeIndicador() {
  const [banco, setBanco] = useState(null);
  const [storage, setStorage] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelado = false;

    async function carregar() {
      try {
        const [{ data: bancoBytes, error: erroBanco }, storageBytes] = await Promise.all([
          supabase.rpc("tamanho_banco_bytes"),
          tamanhoTotalStorage(BUCKET),
        ]);
        if (erroBanco) throw erroBanco;
        if (!cancelado) {
          setBanco(bancoBytes);
          setStorage(storageBytes);
        }
      } catch (err) {
        if (!cancelado) setErro(err.message);
      }
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  if (!supabaseConfigured) return null;

  if (erro) {
    return (
      <div className="capacidade-indicador">
        <p className="capacidade-erro" title={erro}>
          Capacidade indisponível
        </p>
      </div>
    );
  }

  if (banco == null || storage == null) {
    return (
      <div className="capacidade-indicador">
        <p className="capacidade-carregando">Verificando capacidade...</p>
      </div>
    );
  }

  const pctBanco = Math.min(100, (banco / LIMITE_BANCO_BYTES) * 100);
  const pctStorage = Math.min(100, (storage / LIMITE_STORAGE_BYTES) * 100);

  return (
    <div className="capacidade-indicador">
      <span className="capacidade-titulo">Capacidade (Supabase)</span>

      <div className="capacidade-item">
        <div className="capacidade-item-head">
          <span>Banco de dados</span>
          <span>
            {formatarMB(banco)} / {formatarMB(LIMITE_BANCO_BYTES)} MB
          </span>
        </div>
        <div className="capacidade-barra">
          <div
            className={`capacidade-barra-fill capacidade-${nivelPorPercentual(pctBanco)}`}
            style={{ width: `${pctBanco}%` }}
          />
        </div>
      </div>

      <div className="capacidade-item">
        <div className="capacidade-item-head">
          <span>Arquivos</span>
          <span>
            {formatarMB(storage)} / {formatarMB(LIMITE_STORAGE_BYTES)} MB
          </span>
        </div>
        <div className="capacidade-barra">
          <div
            className={`capacidade-barra-fill capacidade-${nivelPorPercentual(pctStorage)}`}
            style={{ width: `${pctStorage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
