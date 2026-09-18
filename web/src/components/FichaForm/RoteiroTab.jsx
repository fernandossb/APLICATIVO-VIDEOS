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
  const temVideo = (info?.videos?.length || 0) > 0;
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
          <button
            type="button"
            className="play-button"
            onClick={onPlay}
            disabled={!temVideo}
            title={temVideo ? "Assistir vídeo desta operação" : "Nenhum vídeo cadastrado para este código"}
          >
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

export default function RoteiroTab({ ficha, update, catalogoFixo }) {
  const roteiro = ficha.roteiro || [];
  const grupoTecido = ficha.grupoTecido || "G1";
  const [catalogo, setCatalogo] = useState(catalogoFixo || []);
  const [picker, setPicker] = useState(null);

  // Toca o vídeo direto (dentro do próprio site) quando só tem um; com mais de um,
  // mostra a lista pra escolher primeiro. Os vídeos vêm do cadastro da operação (link
  // colado à mão, importado do OneDrive ou achado ao vivo pelo "Verificar vídeos" —
  // tanto faz a origem, todos caem no mesmo campo).
  const handlePlay = (codigo, descricao, videos) => {
    const lista = videos || [];
    setPicker({ codigo, descricao, videos: lista, tocando: lista.length === 1 ? lista[0] : null });
  };

  useEffect(() => {
    // Na cópia de impressão o catálogo já vem pronto por fora (catalogoFixo),
    // evitando a corrida entre esta busca assíncrona e o window.print() disparado
    // logo em seguida — sem isso, a impressão saía com tudo "não cadastrada".
    if (catalogoFixo) return;
    operacoesStore.list().then(setCatalogo);
  }, [catalogoFixo]);

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
                    handlePlay(row.codigo, porCodigo[row.codigo]?.descricao, porCodigo[row.codigo]?.videos)
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
        ficha. O tempo mostrado já considera o grupo de tecido escolhido na Capa ({grupoTecido}). O botão ▶ abre
        direto o vídeo cadastrado para aquele código, ou mostra a lista se houver mais de um (cadastre os links
        editando a operação no Banco de Operações).
      </p>

      {picker && (
        <VideoPickerModal
          codigo={picker.codigo}
          descricao={picker.descricao}
          videos={picker.videos}
          tocando={picker.tocando}
          onSelecionar={(v) => setPicker({ ...picker, tocando: v })}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
