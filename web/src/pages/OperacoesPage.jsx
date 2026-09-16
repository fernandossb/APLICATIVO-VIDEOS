import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { operacoesStore, fichasStore } from "../lib/storage";
import { supabaseConfigured } from "../lib/supabase";
import { metodosTempo, statusOperacaoOpcoes, tempoPorGrupoTecido } from "../data/constants";
import SearchBox from "../components/SearchBox";
import ColumnFilterButton from "../components/ColumnFilterButton";

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

// Um valor por coluna, usado tanto para montar as opções do filtro quanto para aplicá-lo.
const colunaValor = {
  codigo: (op) => op.codigo,
  grupoMaquina: (op) => op.grupoMaquina,
  descricao: (op) => op.descricao,
  tempoG1: (op) => op.tempoG1,
  tempoG2: (op) => tempoPorGrupoTecido(op.tempoG1, "G2").toFixed(4),
  tempoG3: (op) => tempoPorGrupoTecido(op.tempoG1, "G3").toFixed(4),
  metodo: (op) => op.metodo,
  statusVideo: (op) => op.statusVideo || "Pendente",
  statusGSD: (op) => op.statusGSD || "Pendente",
  atualizadoEm: (op) => formatDataHora(op.atualizadoEm),
};

function ThFiltravel({ children, className, colKey, operacoes, columnFilters, onFilterChange }) {
  return (
    <th className={className}>
      <div className="th-cell">
        <span>{children}</span>
        <ColumnFilterButton
          values={operacoes.map(colunaValor[colKey])}
          active={columnFilters[colKey] ?? null}
          onChange={(valor) => onFilterChange(colKey, valor)}
        />
      </div>
    </th>
  );
}

const OperacaoRow = memo(function OperacaoRow({ op, selecionado, onSelect, onChange, onCommit }) {
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
    <tr
      className={`${op.codigo.trim() ? "" : "draft-row"}${selecionado ? " row-selected" : ""}`}
      onClick={() => onSelect(op.id)}
    >
      <td className="col-select">
        <input
          type="radio"
          checked={selecionado}
          onChange={() => onSelect(op.id)}
          aria-label={`Selecionar operação ${op.codigo || "nova"}`}
        />
      </td>
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
    </tr>
  );
});

export default function OperacoesPage() {
  const [operacoes, setOperacoes] = useState([]);
  const [rascunhoIds, setRascunhoIds] = useState(() => new Set());
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [columnFilters, setColumnFilters] = useState({});
  const [selecionadoId, setSelecionadoId] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);
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

  const handleNovaLinha = () => {
    const nova = { ...emptyOperacao(), id: crypto.randomUUID() };
    setOperacoes((lista) => [nova, ...lista]);
    setRascunhoIds((set) => new Set(set).add(nova.id));
    setSelecionadoId(nova.id);
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

  // Excluir passa por aqui: primeiro verifica se o código está em uso em alguma
  // ficha técnica (roteiro) antes de liberar a exclusão de verdade.
  const handleExcluirClick = async () => {
    const op = operacoes.find((o) => o.id === selecionadoId);
    if (!op) return;
    const codigo = op.codigo.trim();

    if (!codigo) {
      setConfirmacao({ op, usadoEm: [] });
      return;
    }

    setStatus("Verificando uso em fichas técnicas...");
    try {
      const fichas = await fichasStore.list();
      const usadoEm = fichas.filter((f) =>
        (f.roteiro || []).some((r) => r.tipo === "operacao" && r.codigo === codigo)
      );
      setConfirmacao({ op, usadoEm });
      setStatus("");
    } catch (err) {
      setStatus(`Erro ao verificar uso: ${err.message}`);
    }
  };

  const confirmarExclusao = async () => {
    const op = confirmacao.op;
    setConfirmacao(null);
    setSelecionadoId((atual) => (atual === op.id ? null : atual));
    setOperacoes((lista) => lista.filter((o) => o.id !== op.id));
    setRascunhoIds((set) => {
      if (!set.has(op.id)) return set;
      const copia = new Set(set);
      copia.delete(op.id);
      return copia;
    });
    try {
      await operacoesStore.remove(op.id);
      setStatus("Operação excluída.");
    } catch (err) {
      setStatus(`Erro ao excluir: ${err.message}`);
    }
  };

  const handleFilterChange = useCallback((colKey, valor) => {
    setColumnFilters((atual) => {
      const copia = { ...atual };
      if (valor == null) delete copia[colKey];
      else copia[colKey] = valor;
      return copia;
    });
  }, []);

  const linhasOrdenadas = useMemo(() => {
    const rascunhos = operacoes.filter((op) => rascunhoIds.has(op.id));
    const restantes = operacoes
      .filter((op) => !rascunhoIds.has(op.id))
      .sort((a, b) => compararCodigos(a.codigo, b.codigo));
    return [...rascunhos, ...restantes];
  }, [operacoes, rascunhoIds]);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhasOrdenadas.filter((op) => {
      if (rascunhoIds.has(op.id)) return true;

      if (termo) {
        const combina = [op.codigo, op.descricao, op.grupoMaquina].some((campo) =>
          String(campo || "").toLowerCase().includes(termo)
        );
        if (!combina) return false;
      }

      for (const [colKey, permitidos] of Object.entries(columnFilters)) {
        const valor = String(colunaValor[colKey](op) ?? "").trim();
        if (!permitidos.has(valor)) return false;
      }

      return true;
    });
  }, [linhasOrdenadas, busca, rascunhoIds, columnFilters]);

  const thProps = { operacoes, columnFilters, onFilterChange: handleFilterChange };

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
            <button
              type="button"
              className="button button-danger-outline"
              disabled={!selecionadoId}
              onClick={handleExcluirClick}
              title={selecionadoId ? "Excluir a operação selecionada" : "Selecione uma linha para excluir"}
            >
              Excluir selecionada
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
                <th className="col-select" />
                <ThFiltravel colKey="codigo" className="col-code" {...thProps}>
                  Código
                </ThFiltravel>
                <ThFiltravel colKey="grupoMaquina" className="col-group" {...thProps}>
                  Máquina
                </ThFiltravel>
                <ThFiltravel colKey="descricao" className="col-desc" {...thProps}>
                  Descrição da operação
                </ThFiltravel>
                <ThFiltravel colKey="tempoG1" className="col-time" {...thProps}>
                  Tempo G1
                </ThFiltravel>
                <ThFiltravel colKey="tempoG2" className="col-time" {...thProps}>
                  Tempo G2
                </ThFiltravel>
                <ThFiltravel colKey="tempoG3" className="col-time" {...thProps}>
                  Tempo G3
                </ThFiltravel>
                <ThFiltravel colKey="metodo" className="col-method" {...thProps}>
                  Método
                </ThFiltravel>
                <ThFiltravel colKey="statusVideo" className="col-status" {...thProps}>
                  Vídeo
                </ThFiltravel>
                <ThFiltravel colKey="statusGSD" className="col-status" {...thProps}>
                  GSD
                </ThFiltravel>
                <ThFiltravel colKey="atualizadoEm" className="col-date" {...thProps}>
                  Data de alteração
                </ThFiltravel>
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
                <OperacaoRow
                  key={op.id}
                  op={op}
                  selecionado={op.id === selecionadoId}
                  onSelect={setSelecionadoId}
                  onChange={alterarLinha}
                  onCommit={salvarLinha}
                />
              ))}
            </tbody>
          </table>
        </div>

        <p className="hint">
          Clique numa linha para selecioná-la e use "Excluir selecionada" no topo — a exclusão só é permitida se a
          operação não estiver em uso no roteiro de nenhuma ficha técnica. Clique no ▾ do título de qualquer coluna
          para filtrar pelos valores dela, como numa planilha do Excel. Ninguém cadastra link vídeo por vídeo. Rode{" "}
          <code>scripts/sincronizar-videos-onedrive.ps1</code> (uma vez, e de novo quando subir vídeo novo) — ele
          gera o link certo de cada vídeo automaticamente e salva um arquivo. Clique em{" "}
          <strong>"+ Importar vídeos (JSON)"</strong> acima e escolha esse arquivo para ligar os vídeos aos códigos de
          uma vez só — a coluna Vídeo muda para "Concluído" sozinha nos códigos importados. Código, máquina,
          descrição, tempo e método usados nas fichas técnicas vêm direto desta tabela.
        </p>
      </section>

      {confirmacao && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setConfirmacao(null)} />
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <p className="overline">{confirmacao.op.codigo || "Rascunho"}</p>
                <h2>{confirmacao.usadoEm.length > 0 ? "Não é possível excluir" : "Excluir operação?"}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setConfirmacao(null)} title="Fechar">
                ×
              </button>
            </div>
            <div className="modal-body">
              {confirmacao.usadoEm.length > 0 ? (
                <>
                  <p>
                    Esta operação está no roteiro d{confirmacao.usadoEm.length === 1 ? "esta ficha técnica" : "estas fichas técnicas"}:
                  </p>
                  <ul className="modal-list">
                    {confirmacao.usadoEm.map((f) => (
                      <li key={f.id}>
                        {f.referencia || "(sem referência)"}
                        {f.descricao ? ` — ${f.descricao}` : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="hint">Remova a operação do roteiro dessas fichas antes de excluir do catálogo.</p>
                </>
              ) : (
                <p>
                  Tem certeza que deseja excluir a operação <strong>{confirmacao.op.codigo || "sem código"}</strong>
                  {confirmacao.op.descricao ? ` — ${confirmacao.op.descricao}` : ""}? Essa ação não pode ser desfeita.
                </p>
              )}
            </div>
            <div className="modal-foot">
              {confirmacao.usadoEm.length === 0 ? (
                <>
                  <button type="button" className="button button-outline" onClick={() => setConfirmacao(null)}>
                    Cancelar
                  </button>
                  <button type="button" className="button button-primary" onClick={confirmarExclusao}>
                    Excluir
                  </button>
                </>
              ) : (
                <button type="button" className="button button-outline" onClick={() => setConfirmacao(null)}>
                  Entendi
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
