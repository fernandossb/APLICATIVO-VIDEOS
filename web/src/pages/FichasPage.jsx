import { useEffect, useMemo, useState } from "react";
import FichaForm from "../components/FichaForm/FichaForm";
import { fichasStore } from "../lib/storage";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { embutirImagensDaFicha, nomesDeImagensDaFicha, rehospedarImagensDaFicha } from "../lib/imagens";
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

function unicos(lista, campo) {
  return Array.from(new Set(lista.map((f) => f[campo]).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

export default function FichasPage() {
  const [fichas, setFichas] = useState([]);
  const [ficha, setFicha] = useState(emptyFicha());
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroColecao, setFiltroColecao] = useState("");

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
      const comImagens = await embutirImagensDaFicha(f);
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
      const todasComImagens = await Promise.all(fichas.map(embutirImagensDaFicha));
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
        const comImagensRehospedadas = await rehospedarImagensDaFicha(resto);
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
        const nomes = nomesDeImagensDaFicha(f);
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

  const colecoes = useMemo(() => unicos(fichas, "colecao"), [fichas]);

  const fichasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return fichas.filter((f) => {
      if (termo) {
        const combina = [f.referencia, f.descricao, f.colecao].some((campo) =>
          String(campo || "").toLowerCase().includes(termo)
        );
        if (!combina) return false;
      }
      if (filtroColecao && f.colecao !== filtroColecao) return false;
      return true;
    });
  }, [fichas, busca, filtroColecao]);

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

        <div className="sidebar-filters">
          <select value={filtroColecao} onChange={(e) => setFiltroColecao(e.target.value)}>
            <option value="">Todas as coleções</option>
            {colecoes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

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
