import { useEffect, useMemo, useState } from "react";
import FichaForm from "../components/FichaForm/FichaForm";
import { fichasStore } from "../lib/storage";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { embutirImagens, rehospedarImagens } from "../lib/imagensFicha";
import { emptyFicha } from "../data/constants";
import SearchBox from "../components/SearchBox";

function baixarJson(nomeArquivo, dado) {
  const blob = new Blob([JSON.stringify(dado, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

// Acha os arquivos do Storage usados por uma ficha, pra apagar junto quando
// a ficha for excluída (senão a foto fica órfã, ocupando espaço à toa).
function extrairNomesDeImagens(ficha) {
  const candidatos = [
    ficha.desenhoTecnico,
    ficha.imagensModelagem?.desenhoMedidas,
    ficha.imagensModelagem?.metodoDeMedir,
    ficha.imagensModelagem?.localizacaoEtiquetas,
    ficha.imagensModelagem?.pecaExplodida,
    ...(ficha.variantes || []).map((v) => v.imagem),
  ];
  return candidatos
    .filter((url) => typeof url === "string" && url.includes("/imagens/"))
    .map((url) => url.split("/imagens/")[1])
    .filter(Boolean);
}

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

  const handleExportar = async (f) => {
    setStatus("Preparando exportação...");
    try {
      const comImagens = await embutirImagens(f);
      baixarJson(`ficha-${f.referencia || f.id}.json`, comImagens);
      setStatus("");
    } catch (err) {
      setStatus(`Erro ao exportar: ${err.message}`);
    }
  };

  const handleExportarTodas = async () => {
    if (fichas.length === 0) {
      setStatus("Nenhuma ficha para exportar.");
      return;
    }
    setStatus("Preparando exportação...");
    try {
      const todasComImagens = await Promise.all(fichas.map(embutirImagens));
      baixarJson(`fichas-tecnicas-backup-${new Date().toISOString().slice(0, 10)}.json`, todasComImagens);
      setStatus("");
    } catch (err) {
      setStatus(`Erro ao exportar: ${err.message}`);
    }
  };

  const handleImportar = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;

    setStatus("Importando...");
    try {
      const conteudo = JSON.parse(await arquivo.text());
      const lista = Array.isArray(conteudo) ? conteudo : [conteudo];

      let importadas = 0;
      for (const item of lista) {
        const { id, ...resto } = item;
        const comImagensRehospedadas = await rehospedarImagens(resto);
        await fichasStore.save(comImagensRehospedadas);
        importadas++;
      }
      await refresh();
      setStatus(`${importadas} ficha(s) importada(s).`);
    } catch (err) {
      setStatus(`Erro ao importar: ${err.message}`);
    }
  };

  const handleExcluir = async (f) => {
    const ok = window.confirm(
      `Excluir a ficha "${f.referencia || "(sem referência)"}"? Isso não pode ser desfeito — exporte antes se quiser guardar uma cópia.`
    );
    if (!ok) return;

    setStatus("Excluindo...");
    try {
      if (supabaseConfigured) {
        const nomes = extrairNomesDeImagens(f);
        if (nomes.length) await supabase.storage.from("imagens").remove(nomes);
      }
      await fichasStore.remove(f.id);
      if (ficha.id === f.id) setFicha(emptyFicha());
      await refresh();
      setStatus("Ficha excluída.");
    } catch (err) {
      setStatus(`Erro ao excluir: ${err.message}`);
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

        <div className="sidebar-actions">
          <button type="button" className="button button-outline" onClick={handleExportarTodas}>
            Exportar todas
          </button>
          <label className="button button-outline" style={{ cursor: "pointer" }}>
            Importar (JSON)
            <input type="file" accept="application/json" onChange={handleImportar} hidden />
          </label>
        </div>

        <SearchBox value={busca} onChange={setBusca} placeholder="Buscar ficha técnica..." />

        {!supabaseConfigured && (
          <p className="hint">Modo local: as fichas ficam salvas neste navegador até o Supabase ser configurado.</p>
        )}

        <div className="file-list">
          {fichasFiltradas.map((f) => (
            <div key={f.id} className={`file-card${f.id === ficha.id ? " active" : ""}`}>
              <button type="button" className="file-card-main" onClick={() => handleOpen(f.id)}>
                <div className="file-title">{f.referencia || "(sem referência)"}</div>
                <div className="file-meta">{f.descricao || "—"}</div>
              </button>
              <div className="file-card-actions">
                <button
                  type="button"
                  className="icon-button tiny icon-button-neutral"
                  title="Exportar esta ficha"
                  onClick={() => handleExportar(f)}
                >
                  ⬇
                </button>
                <button
                  type="button"
                  className="icon-button tiny"
                  title="Excluir esta ficha"
                  onClick={() => handleExcluir(f)}
                >
                  ×
                </button>
              </div>
            </div>
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
