import { defaultStatusItens, gruposTecido } from "../../data/constants";
import ImageSlot from "./ImageSlot";

export default function CapaTab({ ficha, update }) {
  const statusItens = ficha.statusItens?.length ? ficha.statusItens : defaultStatusItens();

  const setField = (key) => (e) => update({ [key]: e.target.value });

  const setStatusItem = (index, patch) =>
    update({ statusItens: statusItens.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  const addStatusItem = () =>
    update({ statusItens: [...statusItens, { item: "", tamanho: "", quantidade: "", entrega: "" }] });

  const removeStatusItem = (index) => update({ statusItens: statusItens.filter((_, i) => i !== index) });

  return (
    <div className="tab-panel">
      <div className="field-grid-edit">
        <label>
          Referência
          <input value={ficha.referencia} onChange={setField("referencia")} placeholder="Ex.: CMMA01E1" />
        </label>
        <label>
          Descrição
          <input value={ficha.descricao} onChange={setField("descricao")} placeholder="Ex.: Camiseta manga curta" />
        </label>
        <label>
          Coleção
          <input value={ficha.colecao} onChange={setField("colecao")} placeholder="Ex.: Verão 2027" />
        </label>
        <label>
          Estilista
          <input value={ficha.estilista} onChange={setField("estilista")} />
        </label>
        <label>
          Modelista
          <input value={ficha.modelista} onChange={setField("modelista")} />
        </label>
        <label>
          Engenharia
          <input value={ficha.engenharia} onChange={setField("engenharia")} />
        </label>
        <label>
          Pilotista
          <input value={ficha.pilotista} onChange={setField("pilotista")} />
        </label>
        <label>
          Grade
          <input value={ficha.grade} onChange={setField("grade")} placeholder="Ex.: P.M.G.GG" />
        </label>
        <label>
          Data de liberação
          <input type="date" value={ficha.dataLiberacao} onChange={setField("dataLiberacao")} />
        </label>
        <label>
          Grupo de tecido
          <select value={ficha.grupoTecido || "G1"} onChange={setField("grupoTecido")}>
            {gruposTecido.map((g) => (
              <option key={g.key} value={g.key}>
                {g.key} ({g.percentual}%)
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="full-width">
        Composição
        <textarea
          rows={2}
          value={ficha.composicao}
          onChange={setField("composicao")}
          placeholder="Ex.: LISA: 93% algodão | 7% elastano — MESCLA: 80% algodão | 13% poliéster | 7% elastano"
        />
      </label>

      <h3 className="sub">Itens e entregas</h3>
      <div className="edit-table">
        <div className="edit-table-head">
          <span>Item</span>
          <span>Tamanho</span>
          <span>Qtd.</span>
          <span>Entrega</span>
          <span />
        </div>
        {statusItens.map((row, i) => (
          <div className="edit-table-row" key={i}>
            <input value={row.item} onChange={(e) => setStatusItem(i, { item: e.target.value })} />
            <input value={row.tamanho} onChange={(e) => setStatusItem(i, { tamanho: e.target.value })} />
            <input value={row.quantidade} onChange={(e) => setStatusItem(i, { quantidade: e.target.value })} />
            <input value={row.entrega} onChange={(e) => setStatusItem(i, { entrega: e.target.value })} />
            <button type="button" className="icon-button tiny" onClick={() => removeStatusItem(i)} title="Remover">
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="button button-outline" onClick={addStatusItem}>
        + Adicionar item
      </button>

      <h3 className="sub">Desenho técnico</h3>
      <ImageSlot value={ficha.desenhoTecnico} onChange={(v) => update({ desenhoTecnico: v })} label="Desenho técnico" />
    </div>
  );
}
