import { useEffect, useMemo, useState } from "react";
import FichaForm from "../components/FichaForm/FichaForm";
import { fichasStore } from "../lib/storage";
import { supabaseConfigured } from "../lib/supabase";
import { emptyFicha } from "../data/constants";
import SearchBox from "../components/SearchBox";

export default function FichasPage() {
  const [fichas, setFichas] = useState([]);
  const [ficha, setFicha] = useState(emptyFicha());
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");

  const refresh = async () => {
    try {
      setFichas(await fichasStore.list());
    } catch (err) {
      setStatus(`Erro ao listar fichas: ${err.message}`);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleNew = () => {
    setFicha(emptyFicha());
    setStatus("");
  };

  const handleOpen = async (id) => {
    const loaded = await fichasStore.load(id);
    if (loaded) {
      setFicha(loaded);
      setStatus("");
    }
  };

  const handleSave = async () => {
    setStatus("Salvando...");
    try {
      const { record, persistedTo } = await fichasStore.save(ficha);
      setFicha(record);
      await refresh();
      setStatus(
        persistedTo === "supabase"
          ? "Salvo no banco de dados."
          : "Salvo neste navegador — configure o Supabase (README) para salvar de vez."
      );
    } catch (err) {
      setStatus(`Erro ao salvar: ${err.message}`);
    }
  };

  const fichasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return fichas;
    return fichas.filter((f) =>
      [f.referencia, f.descricao, f.colecao].some((campo) => String(campo || "").toLowerCase().includes(termo))
    );
  }, [fichas, busca]);

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-head">
          <strong>Fichas técnicas</strong>
          <span className="count-pill">{fichas.length}</span>
        </div>

        <button type="button" className="button button-primary full-width" onClick={handleNew}>
          + Nova ficha
        </button>

        <SearchBox value={busca} onChange={setBusca} placeholder="Buscar ficha técnica..." />

        {!supabaseConfigured && (
          <p className="hint">Modo local: as fichas ficam salvas neste navegador até o Supabase ser configurado.</p>
        )}

        <div className="file-list">
          {fichasFiltradas.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`file-card${f.id === ficha.id ? " active" : ""}`}
              onClick={() => handleOpen(f.id)}
            >
              <div className="file-title">{f.referencia || "(sem referência)"}</div>
              <div className="file-meta">{f.descricao || "—"}</div>
            </button>
          ))}
          {fichasFiltradas.length === 0 && (
            <p className="muted">{fichas.length === 0 ? "Nenhuma ficha ainda." : "Nenhuma ficha encontrada."}</p>
          )}
        </div>
      </aside>

      <main className="workspace">
        <FichaForm ficha={ficha} onChange={setFicha} onSave={handleSave} status={status} />
      </main>
    </>
  );
}
