import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { operacoesStore } from "../lib/storage";
import { supabaseConfigured } from "../lib/supabase";
import { metodosTempo, statusOperacaoOpcoes, tempoPorGrupoTecido } from "../data/constants";
import SearchBox from "../components/SearchBox";

const videosFolderUrl = import.meta.env.VITE_VIDEOS_FOLDER_URL;

const emptyOperacao = () => ({
  id: null,
  codigo: "",
  grupoMaquina: "",
  descricao: "",
  tempoG1: "",
  metodo: "GSD",
  statusVideo: "Pendente",
  statusGSD: "Pendente",
  videos: [],
});

function formatDataHora(iso) {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compararCodigos(a, b) {
  const na = Number(a);
  const nb = Number(b);
  const aNumerico = a !== "" && Number.isFinite(na);
  const bNumerico = b !== "" && Number.isFinite(nb);
  if (aNumerico && bNumerico) return na - nb;
  if (aNumerico) return -1;
  if (bNumerico) return 1;
  return String(a).localeCompare(String(b));
}

const OperacaoRow = memo(function OperacaoRow({ op, onChange, onCommit, onRemove }) {
  const setTextField = (key) => (e) => onChange({ ...op, [key]: e.target.value });
  const setSelectField = (key) => (e) => {
    const atualizado = { ...op, [key]: e.target.value };
    onChange(atualizado);
    onCommit(atualizado);
  };
  const commitAtual = () => onCommit(op);
  const statusVideo = op.statusVideo || "Pendente";
  const statusGSD = op.statusGSD || "Pendente";

  return (
    <tr className={op.codigo.trim() ? "" : "draft-row"}>
      <td className="col-code">
        <input value={op.codigo} onChange={setTextField("codigo")} onBlur={commitAtual} placeholder="10004" />
      </td>
      <td className="col-group">
        <input value={op.grupoMaquina} onChange={setTextField("grupoMaquina")} onBlur={commitAtual} placeholder="OVR4F" />
      </td>
      <td className="col-desc">
        <input
          value={op.descricao}
          onChange={setTextField("descricao")}
          onBlur={commitAtual}
          placeholder="Descrição da operação"
        />
      </td>
      <td className="col-time">
        <input value={op.tempoG1} onChange={setTextField("tempoG1")} onBlur={commitAtual} placeholder="0.000" />
      </td>
      <td className="col-time computed">{tempoPorGrupoTecido(op.tempoG1, "G2").toFixed(4)}</td>
      <td className="col-time computed">{tempoPorGrupoTecido(op.tempoG1, "G3").toFixed(4)}</td>
      <td className="col-method">
        <select value={op.metodo} onChange={setSelectField("metodo")}>
          {metodosTempo.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </td>
      <td className="col-status">
        <select
          value={statusVideo}
          onChange={setSelectField("statusVideo")}
          className={`status-select ${statusVideo === "Concluído" ? "status-success" : "status-warning"}`}
        >
          {statusOperacaoOpcoes.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {op.videos?.length > 0 && (
          <span className="status-count" title={`${op.videos.length} vídeo(s) importado(s)`}>
            {op.videos.length}
          </span>
        )}
      </td>
      <td className="col-status">
        <select
          value={statusGSD}
          onChange={setSelectField("statusGSD")}
          className={`status-select ${statusGSD === "Concluído" ? "status-success" : "status-warning"}`}
        >
          {statusOperacaoOpcoes.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </td>
      <td className="col-date muted">{formatDataHora(op.atualizadoEm)}</td>
      <td className="col-actions">
        <button type="button" className="icon-button tiny" onClick={() => onRemove(op.id)} title="Remover esta operação do catálogo">
          ×
        </button>
      </td>
    </tr>
  );
});

export default function OperacoesPage() {
  const [operacoes, setOperacoes] = useState([]);
  const [rascunhoIds, setRascunhoIds] = useState(() => new Set());
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const operacoesRef = useRef([]);

  useEffect(() => {
    operacoesRef.current = operacoes;
  }, [operacoes]);

  useEffect(() => {
    operacoesStore
      .list()
      .then(setOperacoes)
      .catch((err) => setStatus(`Erro ao listar operações: ${err.message}`));
  }, []);

  const alterarLinha = useCallback((atualizado) => {
    setOperacoes((lista) => lista.map((op) => (op.id === atualizado.id ? atualizado : op)));
  }, []);

  const salvarLinha = useCallback(async (registroAtual) => {
    const codigo = registroAtual.codigo.trim();
    if (!codigo) return;

    const duplicado = operacoesRef.current.find((op) => op.codigo === codigo && op.id !== registroAtual.id);
    if (duplicado) {
      setStatus(`Já existe uma operação com o código ${codigo}.`);
      return;
    }

    setStatus("Salvando...");
    try {
      const { record, persistedTo } = await operacoesStore.save({ ...registroAtual, codigo });
      setOperacoes((lista) => lista.map((op) => (op.id === record.id ? record : op)));
      setRascunhoIds((set) => {
        if (!set.has(record.id)) return set;
        const copia = new Set(set);
        copia.delete(record.id);
        return copia;
      });
      setStatus(
        persistedTo === "supabase" ? "Salvo." : "Salvo neste navegador — configure o Supabase (README) para salvar de vez."
      );
    } catch (err) {
      setStatus(`Erro ao salvar: ${err.message}`);
    }
  }, []);

  const removerLinha = useCallback(async (id) => {
    setOperacoes((lista) => lista.filter((op) => op.id !== id));
    setRascunhoIds((set) => {
      if (!set.has(id)) return set;
      const copia = new Set(set);
      copia.delete(id);
      return copia;
    });
    try {
      await operacoesStore.remove(id);
    } catch (err) {
      setStatus(`Erro ao remover: ${err.message}`);
    }
  }, []);

  const handleNovaLinha = () => {
    const nova = { ...emptyOperacao(), id: crypto.randomUUID() };
    setOperacoes((lista) => [nova, ...lista]);
    setRascunhoIds((set) => new Set(set).add(nova.id));
    setStatus("");
  };

  const handleImportarVideos = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;

    setStatus("Importando vídeos...");
    try {
      const texto = await arquivo.text();
      const lista = JSON.parse(texto);
      const porCodigo = new Map(lista.map((item) => [String(item.codigo), item.videos || []]));

      let atualizadas = 0;
      const naoEncontrados = [];
      for (const [codigo, videos] of porCodigo) {
        const existente = operacoesRef.current.find((op) => op.codigo === codigo);
        if (!existente) {
          naoEncontrados.push(codigo);
          continue;
        }
        const { record } = await operacoesStore.save({
          ...existente,
          videos,
          statusVideo: videos.length ? "Concluído" : existente.statusVideo,
        });
        setOperacoes((lista) => lista.map((op) => (op.id === record.id ? record : op)));
        atualizadas++;
      }

      const aviso = naoEncontrados.length
        ? ` ${naoEncontrados.length} código(s) do arquivo não existem no Banco de Operações ainda: ${naoEncontrados
            .slice(0, 5)
            .join(", ")}${naoEncontrados.length > 5 ? "..." : ""}.`
        : "";
      setStatus(`${atualizadas} operação(ões) atualizada(s) com vídeo.${aviso}`);
    } catch (err) {
      setStatus(`Erro ao importar: ${err.message}`);
    }
  };

  const linhasOrdenadas = useMemo(() => {
    const rascunhos = operacoes.filter((op) => rascunhoIds.has(op.id));
    const restantes = operacoes
      .filter((op) => !rascunhoIds.has(op.id))
      .sort((a, b) => compararCodigos(a.codigo, b.codigo));
    return [...rascunhos, ...restantes];
  }, [operacoes, rascunhoIds]);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return linhasOrdenadas;
    return linhasOrdenadas.filter(
      (op) =>
        rascunhoIds.has(op.id) ||
        [op.codigo, op.descricao, op.grupoMaquina].some((campo) => String(campo || "").toLowerCase().includes(termo))
    );
  }, [linhasOrdenadas, busca, rascunhoIds]);

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Engenharia</p>
          <h1>Banco de operações</h1>
        </div>
        <div className="topbar-actions">
          {status && <span className="status-pill">{status}</span>}
          <span className="count-pill">{operacoes.length}</span>
        </div>
      </header>

      <section className="content-panel content-panel-wide">
        <div className="flow-toolbar">
          <div className="toolbar-actions">
            <button type="button" className="button button-primary" onClick={handleNovaLinha}>
              + Nova operação
            </button>
            <label className="button button-outline" style={{ cursor: "pointer" }}>
              + Importar vídeos (JSON)
              <input type="file" accept="application/json" onChange={handleImportarVideos} hidden />
            </label>
            {videosFolderUrl && (
              <a href={videosFolderUrl} target="_blank" rel="noreferrer" className="button button-outline">
                abrir pasta de vídeos ↗
              </a>
            )}
          </div>
          <SearchBox value={busca} onChange={setBusca} placeholder="Buscar código, descrição ou máquina..." />
        </div>

        {!supabaseConfigured && (
          <p className="hint">Modo local: as operações ficam salvas neste navegador até o Supabase ser configurado.</p>
        )}

        <div className="table-wrap banco-table-wrap">
          <table>
            <thead>
              <tr>
                <th className="col-code">Código</th>
                <th className="col-group">Máquina</th>
                <th className="col-desc">Descrição da operação</th>
                <th className="col-time">Tempo G1</th>
                <th className="col-time">Tempo G2</th>
                <th className="col-time">Tempo G3</th>
                <th className="col-method">Método</th>
                <th className="col-status">Vídeo</th>
                <th className="col-status">GSD</th>
                <th className="col-date">Data de alteração</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="empty-state">
                      {operacoes.length === 0 ? "Nenhuma operação cadastrada ainda." : "Nenhuma operação encontrada."}
                    </div>
                  </td>
                </tr>
              )}
              {linhasFiltradas.map((op) => (
                <OperacaoRow key={op.id} op={op} onChange={alterarLinha} onCommit={salvarLinha} onRemove={removerLinha} />
              ))}
            </tbody>
          </table>
        </div>

        <p className="hint">
          Ninguém cadastra link vídeo por vídeo. Rode <code>scripts/sincronizar-videos-onedrive.ps1</code> (uma vez, e
          de novo quando subir vídeo novo) — ele gera o link certo de cada vídeo automaticamente e salva um arquivo.
          Clique em <strong>"+ Importar vídeos (JSON)"</strong> acima e escolha esse arquivo para ligar os vídeos aos
          códigos de uma vez só — a coluna Vídeo muda para "Concluído" sozinha nos códigos importados. Código,
          máquina, descrição, tempo e método usados nas fichas técnicas vêm direto desta tabela.
        </p>
      </section>
    </main>
  );
}
