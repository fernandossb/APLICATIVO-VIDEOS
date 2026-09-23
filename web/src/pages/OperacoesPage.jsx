import { memo, useCallback, useEffect, useRef, useState } from "react";
import { operacoesStore, fichasStore } from "../lib/storage";
import { supabaseConfigured } from "../lib/supabase";
import { obterLinkPastaVideos, salvarLinkPastaVideos } from "../lib/configuracoes";
import { metodosTempo, statusOperacaoOpcoes, tempoPorGrupoTecido } from "../data/constants";
import ColumnFilterButton from "../components/ColumnFilterButton";

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

function baixarJson(nomeArquivo, dado) {
  const blob = new Blob([JSON.stringify(dado, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

// Até 3 palavras-chave, em qualquer ordem, todas precisam aparecer na descrição.
function combinaPalavrasChave(texto, termoBusca) {
  const palavras = termoBusca.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 3);
  if (palavras.length === 0) return true;
  const alvo = String(texto || "").toLowerCase();
  return palavras.every((p) => alvo.includes(p));
}

// Um valor por coluna, usado para montar as opções do filtro e para aplicá-lo.
const colunaValor = {
  codigo: (op) => op.codigo,
  grupoMaquina: (op) => op.grupoMaquina,
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

function DescricaoFiltro({ valor, onChange }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [aberto]);

  return (
    <span className="col-filter" ref={ref}>
      <button
        type="button"
        className={`col-filter-trigger${valor ? " active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setAberto((a) => !a);
        }}
        title="Buscar na descrição"
      >
        ▾
      </button>
      {aberto && (
        <div className="col-filter-dropdown" onClick={(e) => e.stopPropagation()}>
          <input
            value={valor}
            onChange={(e) => onChange(e.target.value)}
            placeholder="até 3 palavras-chave..."
            autoFocus
          />
        </div>
      )}
    </span>
  );
}

// O link da pasta de vídeos fica salvo no Supabase (não no .env) — assim dá pra trocar
// direto pela tela, sem precisar mexer no .env local nem publicar o site de novo.
function PastaVideosBotao() {
  const [link, setLink] = useState("");
  const [rascunho, setRascunho] = useState("");
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    obterLinkPastaVideos()
      .then((v) => {
        setLink(v);
        setRascunho(v);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [aberto]);

  const handleSalvar = async () => {
    setErro("");
    setSalvando(true);
    try {
      const novo = rascunho.trim();
      await salvarLinkPastaVideos(novo);
      setLink(novo);
      setAberto(false);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <span className="col-filter" ref={ref}>
      <button
        type="button"
        className="button button-outline button-icon icon-btn-tooltip"
        data-tooltip="Abrir ou alterar a pasta de vídeos"
        onClick={(e) => {
          e.stopPropagation();
          setAberto((a) => !a);
        }}
      >
        📁
      </button>
      {aberto && (
        <div className="col-filter-dropdown pasta-videos-dropdown" onClick={(e) => e.stopPropagation()}>
          <label className="field-label">Link da pasta de vídeos</label>
          <input
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            placeholder="https://...sharepoint.com/:f:/..."
            autoFocus
          />
          {erro && <p className="login-erro">{erro}</p>}
          <div className="pasta-videos-actions">
            <button type="button" onClick={handleSalvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            {link && (
              <a href={link} target="_blank" rel="noreferrer" onClick={() => setAberto(false)}>
                Abrir pasta ↗
              </a>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

const OperacaoRow = memo(function OperacaoRow({ op, selecionado, onSelect }) {
  const statusVideo = op.statusVideo || "Pendente";
  const statusGSD = op.statusGSD || "Pendente";

  return (
    <tr className={selecionado ? "row-selected" : ""} onClick={() => onSelect(op.id)}>
      <td className="col-select">
        <input
          type="radio"
          checked={selecionado}
          onChange={() => onSelect(op.id)}
          aria-label={`Selecionar operação ${op.codigo}`}
        />
      </td>
      <td className="col-code">{op.codigo}</td>
      <td className="col-group">{op.grupoMaquina}</td>
      <td className="col-desc">{op.descricao}</td>
      <td className="col-time">{op.tempoG1}</td>
      <td className="col-time computed">{tempoPorGrupoTecido(op.tempoG1, "G2").toFixed(4)}</td>
      <td className="col-time computed">{tempoPorGrupoTecido(op.tempoG1, "G3").toFixed(4)}</td>
      <td className="col-method">{op.metodo}</td>
      <td className="col-status">
        <span className={`status-pill-inline ${statusVideo === "Concluído" ? "status-success" : "status-warning"}`}>
          {statusVideo}
        </span>
        {op.videos?.length > 0 && (
          <span className="status-count" title={`${op.videos.length} vídeo(s) importado(s)`}>
            {op.videos.length}
          </span>
        )}
      </td>
      <td className="col-status">
        <span className={`status-pill-inline ${statusGSD === "Concluído" ? "status-success" : "status-warning"}`}>
          {statusGSD}
        </span>
      </td>
      <td className="col-date muted">{formatDataHora(op.atualizadoEm)}</td>
    </tr>
  );
});

function EditarOperacaoModal({ operacao, onSalvar, onFechar }) {
  const [form, setForm] = useState(operacao);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const ehNova = !operacao.id;

  const setCampo = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const videos = form.videos || [];
  const setVideoUrl = (i, url) => {
    const novos = [...videos];
    novos[i] = { ...novos[i], url };
    setForm({ ...form, videos: novos });
  };
  const addVideo = () => setForm({ ...form, videos: [...videos, { url: "" }] });
  const removeVideo = (i) => setForm({ ...form, videos: videos.filter((_, idx) => idx !== i) });

  const handleSalvar = async (e) => {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      await onSalvar(form);
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  };

  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onFechar} />
      <form className="modal-card modal-card-wide" onSubmit={handleSalvar}>
        <div className="modal-head">
          <div>
            <p className="overline">{ehNova ? "Banco de operações" : form.codigo}</p>
            <h2>{ehNova ? "Nova operação" : "Alterar operação"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onFechar} title="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="field-grid-edit">
            <label>
              Código
              <input value={form.codigo} onChange={setCampo("codigo")} placeholder="10004" required autoFocus />
            </label>
            <label>
              Máquina
              <input value={form.grupoMaquina} onChange={setCampo("grupoMaquina")} placeholder="OVR4F" />
            </label>
            <label className="full-width">
              Descrição
              <input value={form.descricao} onChange={setCampo("descricao")} placeholder="Descrição da operação" />
            </label>
            <label>
              Tempo G1
              <input value={form.tempoG1} onChange={setCampo("tempoG1")} placeholder="0.000" />
            </label>
            <label>
              Método
              <select value={form.metodo} onChange={setCampo("metodo")}>
                {metodosTempo.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status vídeo
              <select value={form.statusVideo || "Pendente"} onChange={setCampo("statusVideo")}>
                {statusOperacaoOpcoes.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status GSD
              <select value={form.statusGSD || "Pendente"} onChange={setCampo("statusGSD")}>
                {statusOperacaoOpcoes.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <span className="field-label">Vídeos</span>
          <div className="video-links-edit">
            {videos.length === 0 && (
              <p className="hint">
                Nenhum vídeo cadastrado ainda — clique em "Adicionar vídeo" e cole o link do YouTube (recomendado,
                sobe o vídeo como "Não listado") ou de outra fonte.
              </p>
            )}
            {videos.map((v, i) => (
              <div className="video-link-row" key={i}>
                <input
                  value={v.url}
                  onChange={(e) => setVideoUrl(i, e.target.value)}
                  placeholder="Link do YouTube (ou outro link de vídeo)"
                />
                <button
                  type="button"
                  className="icon-button tiny"
                  onClick={() => removeVideo(i)}
                  title="Remover vídeo"
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="button button-outline" onClick={addVideo}>
              + Adicionar vídeo
            </button>
          </div>

          {erro && <p className="login-erro">{erro}</p>}
        </div>
        <div className="modal-foot">
          <button type="button" className="button button-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="button button-primary" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function OperacoesPage() {
  const [operacoes, setOperacoes] = useState([]);
  const [status, setStatus] = useState("");
  const [columnFilters, setColumnFilters] = useState({});
  const [filtroDescricao, setFiltroDescricao] = useState("");
  const [selecionadoId, setSelecionadoId] = useState(null);
  const [modalEdicao, setModalEdicao] = useState(null);
  const [confirmacao, setConfirmacao] = useState(null);
  const [ondeUsa, setOndeUsa] = useState(null);
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

  const abrirNova = () => setModalEdicao(emptyOperacao());
  const abrirAlterar = () => {
    const op = operacoes.find((o) => o.id === selecionadoId);
    if (op) setModalEdicao(op);
  };

  const handleSalvarModal = async (form) => {
    const codigo = form.codigo.trim();
    if (!codigo) throw new Error("Informe o código.");

    const duplicado = operacoesRef.current.find((op) => op.codigo === codigo && op.id !== form.id);
    if (duplicado) throw new Error(`Já existe uma operação com o código ${codigo}.`);

    // linhas com o link em branco (ex.: clicou em "Adicionar vídeo" e não colou nada) não vão salvas;
    // quando existe pelo menos um vídeo de verdade, o status vídeo já vira "Concluído" sozinho
    const videos = (form.videos || []).map((v) => ({ ...v, url: v.url.trim() })).filter((v) => v.url);
    const statusVideo = videos.length > 0 ? "Concluído" : form.statusVideo || "Pendente";

    const ehNova = !form.id;
    const paraSalvar = ehNova ? { ...form, criadoEm: new Date().toISOString() } : form;
    const { record, persistedTo } = await operacoesStore.save({ ...paraSalvar, codigo, videos, statusVideo });

    setOperacoes((lista) => (ehNova ? [...lista, record] : lista.map((op) => (op.id === record.id ? record : op))));
    setSelecionadoId(record.id);
    setModalEdicao(null);
    setStatus(
      persistedTo === "supabase" ? "Salvo." : "Salvo neste navegador — configure o Supabase (README) para salvar de vez."
    );
  };

  const handleExportarTodas = () => {
    if (operacoes.length === 0) {
      setStatus("Nenhuma operação para exportar.");
      return;
    }
    baixarJson(`banco-operacoes-backup-${new Date().toISOString().slice(0, 10)}.json`, operacoes);
  };

  const handleExportarSelecionada = () => {
    const op = operacoes.find((o) => o.id === selecionadoId);
    if (!op) return;
    baixarJson(`operacao-${op.codigo || op.id}.json`, op);
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
        const codigo = String(resto.codigo || "").trim();
        const existente = codigo ? operacoesRef.current.find((op) => op.codigo === codigo) : null;
        await operacoesStore.save(existente ? { ...resto, id: existente.id } : resto);
        importadas++;
      }
      await operacoesStore.list().then(setOperacoes);
      setStatus(`${importadas} operação(ões) importada(s).`);
    } catch (err) {
      setStatus(`Erro ao importar: ${err.message}`);
    }
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
        ? ` ${naoEncontrados.length} código(s) do arquivo não existem no Banco de Operações ainda.`
        : "";
      setStatus(`${atualizadas} operação(ões) atualizada(s) com vídeo.${aviso}`);
    } catch (err) {
      setStatus(`Erro ao importar: ${err.message}`);
    }
  };

  // Usa a mesma busca ao vivo no OneDrive que o botão ▶ do roteiro já usa —
  // só entra em ação de verdade quando as variáveis GRAPH_* estiverem
  // configuradas (README); sem isso, avisa uma vez e para.
  const handleVerificarVideos = async () => {
    setStatus("Verificando vídeos no OneDrive...");
    try {
      let atualizadas = 0;
      for (const op of operacoesRef.current) {
        const codigo = op.codigo.trim();
        if (!codigo || op.statusVideo === "Concluído") continue;

        const res = await fetch(`/api/videos-por-codigo?codigo=${encodeURIComponent(codigo)}`);
        const dados = await res.json();

        if (!res.ok) {
          if (res.status === 501) {
            setStatus(dados.error);
            return;
          }
          continue;
        }

        if (dados.videos?.length) {
          const { record } = await operacoesStore.save({ ...op, videos: dados.videos, statusVideo: "Concluído" });
          setOperacoes((lista) => lista.map((o) => (o.id === record.id ? record : o)));
          atualizadas++;
        }
      }
      setStatus(`${atualizadas} operação(ões) com vídeo encontrado no OneDrive.`);
    } catch (err) {
      setStatus(`Erro ao verificar vídeos: ${err.message}`);
    }
  };

  // Excluir passa por aqui: primeiro verifica se o código está em uso em alguma
  // ficha técnica (roteiro) antes de liberar a exclusão de verdade.
  const handleExcluirClick = async () => {
    const op = operacoes.find((o) => o.id === selecionadoId);
    if (!op) return;
    const codigo = op.codigo.trim();

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

  // Mesma busca do fluxo de exclusão, mas só pra consulta: lista os fluxos
  // (roteiros de ficha técnica) que usam a operação selecionada.
  const handleOndeUsaClick = async () => {
    const op = operacoes.find((o) => o.id === selecionadoId);
    if (!op) return;
    const codigo = op.codigo.trim();

    setStatus("Verificando uso em fichas técnicas...");
    try {
      const fichas = await fichasStore.list();
      const usadoEm = fichas.filter((f) =>
        (f.roteiro || []).some((r) => r.tipo === "operacao" && r.codigo === codigo)
      );
      setOndeUsa({ op, usadoEm });
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
    try {
      await operacoesStore.remove(op.id);
      setStatus("Operação excluída.");
    } catch (err) {
      setStatus(`Erro ao excluir: ${err.message}`);
    }
  };

  // Clicar numa linha já selecionada desmarca ela — sem isso, depois de
  // selecionar a primeira vez não haveria como voltar ao botão "Nova operação".
  const handleSelecionar = useCallback((id) => {
    setSelecionadoId((atual) => (atual === id ? null : id));
  }, []);

  const handleFilterChange = useCallback((colKey, valor) => {
    setColumnFilters((atual) => {
      const copia = { ...atual };
      if (valor == null) delete copia[colKey];
      else copia[colKey] = valor;
      return copia;
    });
  }, []);

  // Tabela: linha nova entra só no final, e fica nessa posição pra sempre —
  // edições não reordenam nada. Por isso ordena pela data de criação, não
  // pelo código nem pela última alteração.
  const linhasOrdenadas = [...operacoes].sort((a, b) => (a.criadoEm || "").localeCompare(b.criadoEm || ""));

  const linhasFiltradas = linhasOrdenadas.filter((op) => {
    if (!combinaPalavrasChave(op.descricao, filtroDescricao)) return false;
    for (const [colKey, permitidos] of Object.entries(columnFilters)) {
      const valor = String(colunaValor[colKey](op) ?? "").trim();
      if (!permitidos.has(valor)) return false;
    }
    return true;
  });

  const thProps = { operacoes, columnFilters, onFilterChange: handleFilterChange };

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Engenharia</p>
          <h1>Banco de operações</h1>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="button button-primary button-icon icon-btn-tooltip"
            data-tooltip={selecionadoId ? "Alterar operação selecionada" : "Nova operação"}
            onClick={selecionadoId ? abrirAlterar : abrirNova}
          >
            {selecionadoId ? "✎" : "➕"}
          </button>
          <button
            type="button"
            className="button button-danger-outline button-icon icon-btn-tooltip"
            disabled={!selecionadoId}
            onClick={handleExcluirClick}
            data-tooltip="Excluir operação selecionada"
          >
            🗑
          </button>
          <button
            type="button"
            className="button button-outline button-icon icon-btn-tooltip"
            disabled={!selecionadoId}
            onClick={handleOndeUsaClick}
            data-tooltip="Onde usa: ver os fluxos que usam a operação selecionada"
          >
            🔎
          </button>
          <button
            type="button"
            className="button button-outline button-icon icon-btn-tooltip"
            disabled={!selecionadoId}
            onClick={handleExportarSelecionada}
            data-tooltip="Exportar operação selecionada"
          >
            ⬇
          </button>
          <button
            type="button"
            className="button button-outline button-icon icon-btn-tooltip"
            onClick={handleExportarTodas}
            data-tooltip="Exportar todas as operações"
          >
            ⬇⬇
          </button>
          <label className="button button-outline button-icon icon-btn-tooltip" data-tooltip="Importar operações (JSON)">
            ⬆
            <input type="file" accept="application/json" onChange={handleImportar} hidden />
          </label>
          <label
            className="button button-outline button-icon icon-btn-tooltip"
            data-tooltip="Importar vídeos sincronizados (JSON)"
          >
            🎬
            <input type="file" accept="application/json" onChange={handleImportarVideos} hidden />
          </label>
          <button
            type="button"
            className="button button-outline button-icon icon-btn-tooltip"
            onClick={handleVerificarVideos}
            data-tooltip="Verificar vídeos no OneDrive"
          >
            🔄
          </button>
          <PastaVideosBotao />
          {status && <span className="status-pill">{status}</span>}
          <span className="count-pill">{operacoes.length}</span>
        </div>
      </header>

      <section className="content-panel content-panel-wide">
        {!supabaseConfigured && (
          <p className="hint">Modo local: as operações ficam salvas neste navegador até o Supabase ser configurado.</p>
        )}

        <div className="table-wrap banco-table-wrap tabela-compacta">
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
                <th className="col-desc">
                  <div className="th-cell">
                    <span>Descrição da operação</span>
                    <DescricaoFiltro valor={filtroDescricao} onChange={setFiltroDescricao} />
                  </div>
                </th>
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
                <OperacaoRow key={op.id} op={op} selecionado={op.id === selecionadoId} onSelect={handleSelecionar} />
              ))}
            </tbody>
          </table>
        </div>

        <p className="hint">
          Clique numa linha para selecioná-la (clique de novo para desmarcar) — o botão de lápis no topo abre a tela pra alterar os campos dela. A
          exclusão só é permitida se a operação não estiver em uso no roteiro de nenhuma ficha técnica. Clique no ▾ do
          título de qualquer coluna para filtrar; na Descrição, digite até 3 palavras-chave. Passe o mouse sobre os
          botões do topo por um instante para ver o que cada um faz.
        </p>
      </section>

      {modalEdicao && (
        <EditarOperacaoModal operacao={modalEdicao} onSalvar={handleSalvarModal} onFechar={() => setModalEdicao(null)} />
      )}

      {ondeUsa && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setOndeUsa(null)} />
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <p className="overline">{ondeUsa.op.codigo}</p>
                <h2>Onde usa</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setOndeUsa(null)} title="Fechar">
                ×
              </button>
            </div>
            <div className="modal-body">
              {ondeUsa.usadoEm.length > 0 ? (
                <>
                  <p>
                    Esta operação está no roteiro d
                    {ondeUsa.usadoEm.length === 1 ? "esta ficha técnica" : "estas fichas técnicas"}:
                  </p>
                  <ul className="modal-list">
                    {ondeUsa.usadoEm.map((f) => (
                      <li key={f.id}>
                        {f.referencia || "(sem referência)"}
                        {f.descricao ? ` — ${f.descricao}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Nenhuma ficha técnica usa esta operação no roteiro ainda.</p>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="button button-outline" onClick={() => setOndeUsa(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmacao && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setConfirmacao(null)} />
          <div className="modal-card">
            <div className="modal-head">
              <div>
                <p className="overline">{confirmacao.op.codigo}</p>
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
                    Esta operação está no roteiro d
                    {confirmacao.usadoEm.length === 1 ? "esta ficha técnica" : "estas fichas técnicas"}:
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
                  Tem certeza que deseja excluir a operação <strong>{confirmacao.op.codigo}</strong>
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
