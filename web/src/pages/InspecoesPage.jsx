import { useEffect, useMemo, useState } from "react";
import { inspecoesStore } from "../lib/storage";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { embutirImagemUnica, nomeDoArquivoNoBucket, rehospedarImagemUnica } from "../lib/imagens";
import { calcPercentuais, formatPercentual } from "../lib/qualidadeMetrics";
import { causasDefeito, emptyInspecao, statusInspecao } from "../data/constants";
import ImageSlot from "../components/FichaForm/ImageSlot";
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
  return Array.from(new Set(lista.map((i) => i[campo]).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

export default function InspecoesPage() {
  const [inspecoes, setInspecoes] = useState([]);
  const [inspecao, setInspecao] = useState(emptyInspecao());
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  const refresh = async () => {
    try {
      setInspecoes(await inspecoesStore.list());
    } catch (err) {
      setStatus(`Erro ao listar inspeções: ${err.message}`);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const setField = (key) => (e) => setInspecao({ ...inspecao, [key]: e.target.value });

  const handleNew = () => {
    setInspecao(emptyInspecao());
    setStatus("");
  };

  const handleOpen = (item) => {
    setInspecao(item);
    setStatus("");
  };

  const handleSave = async () => {
    setStatus("Salvando...");
    try {
      const { record, persistedTo } = await inspecoesStore.save(inspecao);
      setInspecao(record);
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

  const handleRemove = async () => {
    if (!inspecao.id) return;
    try {
      if (supabaseConfigured) {
        const nome = nomeDoArquivoNoBucket(inspecao.fotoUrl);
        if (nome) await supabase.storage.from("imagens").remove([nome]);
      }
      await inspecoesStore.remove(inspecao.id);
      await refresh();
      handleNew();
    } catch (err) {
      setStatus(`Erro ao excluir: ${err.message}`);
    }
  };

  const handleExportar = async (item) => {
    setStatus("Preparando exportação...");
    try {
      const comFoto = { ...item, fotoUrl: await embutirImagemUnica(item.fotoUrl) };
      baixarJson(`inspecao-${item.referencia || item.id}.json`, comFoto);
      setStatus("");
    } catch (err) {
      setStatus(`Erro ao exportar: ${err.message}`);
    }
  };

  const handleExportarTodas = async () => {
    if (inspecoes.length === 0) {
      setStatus("Nenhuma inspeção para exportar.");
      return;
    }
    setStatus("Preparando exportação...");
    try {
      const todasComFoto = await Promise.all(
        inspecoes.map(async (i) => ({ ...i, fotoUrl: await embutirImagemUnica(i.fotoUrl) }))
      );
      baixarJson(`inspecoes-backup-${new Date().toISOString().slice(0, 10)}.json`, todasComFoto);
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
        resto.fotoUrl = await rehospedarImagemUnica(resto.fotoUrl);
        await inspecoesStore.save(resto);
        importadas++;
      }
      await refresh();
      setStatus(`${importadas} inspeção(ões) importada(s).`);
    } catch (err) {
      setStatus(`Erro ao importar: ${err.message}`);
    }
  };

  const toggleCausaAdicional = (causa) => {
    const atual = inspecao.causasAdicionais || [];
    const novo = atual.includes(causa) ? atual.filter((c) => c !== causa) : [...atual, causa];
    setInspecao({ ...inspecao, causasAdicionais: novo });
  };

  const percentuais = calcPercentuais(inspecao);

  const fornecedores = useMemo(() => unicos(inspecoes, "fornecedor"), [inspecoes]);

  const inspecoesFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return inspecoes.filter((i) => {
      if (termo) {
        const combina = [i.fornecedor, i.produto, i.referencia, i.inspetora, i.op].some((campo) =>
          String(campo || "").toLowerCase().includes(termo)
        );
        if (!combina) return false;
      }
      if (filtroFornecedor && i.fornecedor !== filtroFornecedor) return false;
      if (filtroStatus && i.status !== filtroStatus) return false;
      return true;
    });
  }, [inspecoes, busca, filtroFornecedor, filtroStatus]);

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-head">
          <strong>Inspeções</strong>
          <span className="count-pill">{inspecoes.length}</span>
        </div>

        <button type="button" className="button button-primary full-width" onClick={handleNew}>
          + Nova inspeção
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

        <SearchBox value={busca} onChange={setBusca} placeholder="Buscar por fornecedor, produto, OP..." />

        <div className="sidebar-filters">
          <select value={filtroFornecedor} onChange={(e) => setFiltroFornecedor(e.target.value)}>
            <option value="">Todos os fornecedores</option>
            {fornecedores.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {statusInspecao.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {!supabaseConfigured && (
          <p className="hint">Modo local: as inspeções ficam salvas neste navegador até o Supabase ser configurado.</p>
        )}

        <div className="file-list">
          {inspecoesFiltradas.map((i) => (
            <div key={i.id} className={`file-card${i.id === inspecao.id ? " active" : ""}`}>
              <button type="button" className="file-card-main" onClick={() => handleOpen(i)}>
                <div className="file-title">
                  {i.fornecedor || "(sem fornecedor)"} · {i.produto || "—"}
                </div>
                <div className="file-meta">
                  {i.dataInspecao || "sem data"} · {i.status}
                </div>
              </button>
              <div className="file-card-actions">
                <button
                  type="button"
                  className="icon-button tiny icon-button-neutral"
                  title="Exportar esta inspeção"
                  onClick={() => handleExportar(i)}
                >
                  ⬇
                </button>
              </div>
            </div>
          ))}
          {inspecoesFiltradas.length === 0 && <p className="muted">Nenhuma inspeção encontrada.</p>}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="sheet-header-inline">
            <p className="overline">Inspeção de qualidade</p>
            <h1>
              {inspecao.fornecedor || "Nova inspeção"}
              {inspecao.produto ? ` — ${inspecao.produto}` : ""}
            </h1>
          </div>
          <div className="topbar-actions">
            {status && <span className="status-pill">{status}</span>}
            {inspecao.id && (
              <button type="button" className="icon-button" onClick={handleRemove} title="Remover inspeção">
                ×
              </button>
            )}
            <button type="button" className="button button-primary" onClick={handleSave}>
              Salvar
            </button>
          </div>
        </header>

        <section className="content-panel">
          <div className="tab-panel">
            <div className="field-grid-edit">
              <label>
                Data da inspeção
                <input type="date" value={inspecao.dataInspecao} onChange={setField("dataInspecao")} />
              </label>
              <label>
                Inspetora
                <input value={inspecao.inspetora} onChange={setField("inspetora")} />
              </label>
              <label>
                Fornecedor
                <input value={inspecao.fornecedor} onChange={setField("fornecedor")} placeholder="Nome da facção" />
              </label>
              <label>
                OP
                <input value={inspecao.op} onChange={setField("op")} placeholder="Ordem de produção" />
              </label>
              <label>
                Produto
                <input value={inspecao.produto} onChange={setField("produto")} />
              </label>
              <label>
                Referência
                <input value={inspecao.referencia} onChange={setField("referencia")} placeholder="Ex.: CMMA01E1" />
              </label>
              <label>
                Cor
                <input value={inspecao.cor} onChange={setField("cor")} />
              </label>
              <label>
                Tamanho
                <input value={inspecao.tamanho} onChange={setField("tamanho")} />
              </label>
            </div>

            <h3 className="sub">Quantidades</h3>
            <div className="field-grid-edit quantities">
              <label>
                Qtd. inspecionada
                <input value={inspecao.qtdInspecionada} onChange={setField("qtdInspecionada")} />
              </label>
              <label>
                Qtd. aprovada
                <input value={inspecao.qtdAprovada} onChange={setField("qtdAprovada")} />
              </label>
              <label>
                Qtd. com defeito
                <input value={inspecao.qtdDefeito} onChange={setField("qtdDefeito")} />
              </label>
              <label>
                Qtd. reprocesso
                <input value={inspecao.qtdReprocesso} onChange={setField("qtdReprocesso")} />
              </label>
            </div>

            <div className="percentage-grid">
              <div>
                <span>% aprovação</span>
                <strong>{formatPercentual(percentuais.percentualAprovacao)}</strong>
              </div>
              <div>
                <span>% defeito</span>
                <strong>{formatPercentual(percentuais.percentualDefeito)}</strong>
              </div>
              <div>
                <span>% reprocesso</span>
                <strong>{formatPercentual(percentuais.percentualReprocesso)}</strong>
              </div>
            </div>

            <h3 className="sub">Causas</h3>
            <label>
              Causa principal
              <select value={inspecao.causaPrincipal} onChange={setField("causaPrincipal")}>
                <option value="">Selecione...</option>
                {causasDefeito.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <span className="field-label" style={{ marginTop: 14, display: "block" }}>
              Causas adicionais
            </span>
            <div className="chip-grid">
              {causasDefeito.map((c) => {
                const marcado = (inspecao.causasAdicionais || []).includes(c);
                return (
                  <label className="check-chip" key={c}>
                    <input type="checkbox" checked={marcado} onChange={() => toggleCausaAdicional(c)} />
                    <span className={marcado ? "checked" : ""}>{c}</span>
                  </label>
                );
              })}
            </div>

            <label className="full-width" style={{ marginTop: 20 }}>
              Observações
              <textarea rows={3} value={inspecao.observacoes} onChange={setField("observacoes")} />
            </label>

            <div className="field-grid-edit" style={{ marginTop: 8 }}>
              <label>
                Status
                <select value={inspecao.status} onChange={setField("status")}>
                  {statusInspecao.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <h3 className="sub">Foto</h3>
            <ImageSlot value={inspecao.fotoUrl} onChange={(v) => setInspecao({ ...inspecao, fotoUrl: v })} label="Foto da peça" />
          </div>
        </section>
      </main>
    </>
  );
}
