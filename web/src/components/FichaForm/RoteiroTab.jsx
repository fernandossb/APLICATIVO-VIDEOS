import { useEffect, useMemo, useState } from "react";
import { operacoesStore } from "../../lib/storage";
import { tempoPorGrupoTecido } from "../../data/constants";
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
      <td className="from-catalog col-desc">
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

  // Resumo por setor: cada "estágio" no roteiro vira uma seção, somando o
  // tempo das operações que vêm logo depois dele até o próximo estágio.
  function resumoPorSetor() {
    const setores = [];
    let atual = null;
    for (const row of roteiro) {
      if (row.tipo === "estagio") {
        atual = { nome: row.nome?.trim() || "(sem nome)", tempo: 0 };
        setores.push(atual);
      } else if (row.tipo === "operacao") {
        if (!atual) {
          atual = { nome: "Sem estágio", tempo: 0 };
          setores.push(atual);
        }
        atual.tempo += tempoDaOperacao(row.codigo);
      }
    }
    return setores;
  }

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

  const linhasComIndice = roteiro.map((row, i) => ({ row, i }));
  const resumoSetores = resumoPorSetor();

  return (
    <div className="tab-panel">
      <div className="flow-toolbar">
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
      </div>

      <div className="table-wrap route-table-wrap">
        <table className="route-table">
          <thead>
            <tr>
              <th className="col-code">Código</th>
              <th className="col-group">Máquina</th>
              <th className="col-desc">Descrição da operação</th>
              <th>Observação</th>
              <th className="col-time">Tempo ({grupoTecido})</th>
              <th>Método</th>
              <th className="col-video">Vídeo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhasComIndice.map(({ row, i }) =>
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

      <div className="resumo-setores">
        <h3 className="sub">Resumo por setor</h3>
        {resumoSetores.length === 0 ? (
          <p className="muted">Adicione estágios e operações no roteiro para ver o resumo aqui.</p>
        ) : (
          <div className="resumo-setores-lista">
            {resumoSetores.map((s, i) => (
              <div className="resumo-setor-item" key={i}>
                <span>{s.nome}</span>
                <strong>{s.tempo.toFixed(3)} min</strong>
              </div>
            ))}
          </div>
        )}
        <div className="resumo-setor-total">
          <span>Total do roteiro ({grupoTecido})</span>
          <strong>{totalTempo.toFixed(3)} min</strong>
        </div>
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
