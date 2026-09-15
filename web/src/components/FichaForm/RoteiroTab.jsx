import { useEffect, useMemo, useState } from "react";
import { operacoesStore } from "../../lib/storage";
import { tempoPorGrupoTecido } from "../../data/constants";
import SearchBox from "../SearchBox";
import VideoPickerModal from "./VideoPickerModal";

function RowActions({ onUp, onDown, onRemove }) {
  return (
    <span className="row-actions">
      <button type="button" className="icon-button tiny" onClick={onUp} title="Subir">
        ↑
      </button>
      <button type="button" className="icon-button tiny" onClick={onDown} title="Descer">
        ↓
      </button>
      <button type="button" className="icon-button tiny" onClick={onRemove} title="Remover">
        ×
      </button>
    </span>
  );
}

function OperacaoRow({ row, info, tempo, onChangeCodigo, onChangeObservacao, onUp, onDown, onRemove, onPlay }) {
  const naoCadastrada = row.codigo && !info;
  return (
    <tr className={naoCadastrada ? "code-missing" : ""}>
      <td>
        <input list="operacoes-catalogo" value={row.codigo} onChange={onChangeCodigo} placeholder="10004" />
      </td>
      <td className="from-catalog">{info?.grupoMaquina || (naoCadastrada ? "—" : "")}</td>
      <td className="from-catalog">
        {info?.descricao || (naoCadastrada ? "não cadastrada no Banco de Operações" : "")}
      </td>
      <td>
        <input value={row.observacao} onChange={onChangeObservacao} />
      </td>
      <td className="from-catalog">{info ? tempo.toFixed(4) : naoCadastrada ? "—" : ""}</td>
      <td className="from-catalog">{info?.metodo || ""}</td>
      <td className="col-video">
        {row.codigo ? (
          <button type="button" className="play-button" onClick={onPlay} title="Buscar vídeos desta operação">
            ▶
          </button>
        ) : (
          ""
        )}
      </td>
      <td>
        <RowActions onUp={onUp} onDown={onDown} onRemove={onRemove} />
      </td>
    </tr>
  );
}

export default function RoteiroTab({ ficha, update }) {
  const roteiro = ficha.roteiro || [];
  const grupoTecido = ficha.grupoTecido || "G1";
  const [catalogo, setCatalogo] = useState([]);
  const [busca, setBusca] = useState("");
  const [picker, setPicker] = useState(null);

  const buscarVideos = async (codigo, descricao, videosImportados) => {
    setPicker({ codigo, descricao, status: "carregando", videos: [] });

    // Tenta a busca ao vivo no OneDrive (se a integração com o Graph estiver configurada);
    // se não estiver, cai para a lista trazida pela importação do sincronizar-videos-onedrive.ps1.
    try {
      const res = await fetch(`/api/videos-por-codigo?codigo=${encodeURIComponent(codigo)}`);
      const ehJson = (res.headers.get("content-type") || "").includes("application/json");
      if (ehJson) {
        const dados = await res.json();
        if (res.ok) {
          setPicker({ codigo, descricao, status: "pronto", videos: dados.videos || [] });
          return;
        }
      }
    } catch {
      // segue para a lista importada abaixo
    }

    setPicker({ codigo, descricao, status: "pronto", videos: videosImportados || [] });
  };

  useEffect(() => {
    operacoesStore.list().then(setCatalogo);
  }, []);

  const porCodigo = useMemo(() => {
    const map = {};
    for (const op of catalogo) map[op.codigo] = op;
    return map;
  }, [catalogo]);

  const tempoDaOperacao = (codigo) => tempoPorGrupoTecido(porCodigo[codigo]?.tempoG1, grupoTecido);

  const setRows = (rows) => update({ roteiro: rows });
  const setRow = (i, patch) => setRows(roteiro.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i) => setRows(roteiro.filter((_, idx) => idx !== i));
  const addOperacao = () => setRows([...roteiro, { tipo: "operacao", codigo: "", observacao: "" }]);
  const addEstagio = () => setRows([...roteiro, { tipo: "estagio", nome: "" }]);
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= roteiro.length) return;
    const copy = [...roteiro];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setRows(copy);
  };

  const totalTempo = roteiro
    .filter((r) => r.tipo === "operacao")
    .reduce((sum, r) => sum + tempoDaOperacao(r.codigo), 0);

  const semCadastro = roteiro.filter((r) => r.tipo === "operacao" && r.codigo && !porCodigo[r.codigo]).length;

  const termo = busca.trim().toLowerCase();
  const linhasComIndice = roteiro.map((row, i) => ({ row, i }));
  const linhasExibidas = termo
    ? linhasComIndice.filter(({ row }) => {
        if (row.tipo !== "operacao") return false;
        const info = porCodigo[row.codigo];
        return [row.codigo, row.observacao, info?.descricao, info?.grupoMaquina].some((campo) =>
          String(campo || "").toLowerCase().includes(termo)
        );
      })
    : linhasComIndice;

  return (
    <div className="tab-panel">
      <div className="flow-toolbar">
        <div>
          <span>Tempo total do roteiro ({grupoTecido})</span>
          <strong>{totalTempo.toFixed(3)} min</strong>
        </div>
        <div className="toolbar-metrics">
          <span>
            <strong>{roteiro.filter((r) => r.tipo === "operacao").length}</strong> operações
          </span>
          {semCadastro > 0 && (
            <span className="warning">
              <strong>{semCadastro}</strong> sem cadastro
            </span>
          )}
        </div>
        <SearchBox value={busca} onChange={setBusca} placeholder="Buscar no roteiro..." />
      </div>

      <div className="table-wrap route-table-wrap">
        <table className="route-table">
          <thead>
            <tr>
              <th className="col-code">Código</th>
              <th className="col-group">Máquina</th>
              <th>Descrição da operação</th>
              <th>Observação</th>
              <th className="col-time">Tempo ({grupoTecido})</th>
              <th>Método</th>
              <th className="col-video">Vídeo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {termo && linhasExibidas.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">Nenhuma operação encontrada para "{busca}".</div>
                </td>
              </tr>
            )}
            {linhasExibidas.map(({ row, i }) =>
              row.tipo === "estagio" ? (
                <tr className="stage-row" key={i}>
                  <td colSpan={7}>
                    <input
                      value={row.nome}
                      onChange={(e) => setRow(i, { nome: e.target.value })}
                      placeholder="Nome do estágio (ex.: CORTE, COSTURA, INSPEÇÃO DE QUALIDADE)"
                    />
                  </td>
                  <td>
                    <RowActions onUp={() => move(i, -1)} onDown={() => move(i, 1)} onRemove={() => removeRow(i)} />
                  </td>
                </tr>
              ) : (
                <OperacaoRow
                  key={i}
                  row={row}
                  info={porCodigo[row.codigo]}
                  tempo={tempoDaOperacao(row.codigo)}
                  onChangeCodigo={(e) => setRow(i, { codigo: e.target.value })}
                  onChangeObservacao={(e) => setRow(i, { observacao: e.target.value })}
                  onUp={() => move(i, -1)}
                  onDown={() => move(i, 1)}
                  onRemove={() => removeRow(i)}
                  onPlay={() =>
                    buscarVideos(row.codigo, porCodigo[row.codigo]?.descricao, porCodigo[row.codigo]?.videos)
                  }
                />
              )
            )}
          </tbody>
        </table>
      </div>
      <datalist id="operacoes-catalogo">
        {catalogo.map((op) => (
          <option key={op.id} value={op.codigo}>
            {op.descricao}
          </option>
        ))}
      </datalist>

      <div className="button-row">
        <button type="button" className="button button-outline" onClick={addOperacao}>
          + Operação
        </button>
        <button type="button" className="button button-outline" onClick={addEstagio}>
          + Estágio
        </button>
      </div>
      <p className="hint">
        Máquina, descrição e método vêm do Banco de Operações pelo código — só a observação é específica desta
        ficha. O tempo mostrado já considera o grupo de tecido escolhido na Capa ({grupoTecido}). O botão ▶ mostra os
        vídeos já importados do OneDrive para aquele código (veja "Importar vídeos" no Banco de Operações).
      </p>

      {picker && (
        <VideoPickerModal
          codigo={picker.codigo}
          descricao={picker.descricao}
          status={picker.status}
          videos={picker.videos}
          mensagem={picker.mensagem}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
