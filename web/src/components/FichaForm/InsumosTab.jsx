import { useState } from "react";
import { gruposInsumosSugeridos } from "../../data/constants";

export default function InsumosTab({ ficha, update }) {
  const grupos = ficha.gruposInsumos || [];
  const variantes = ficha.variantes || [];
  const [novoGrupo, setNovoGrupo] = useState("");

  const setGrupos = (novos) => update({ gruposInsumos: novos });

  const addGrupo = (e) => {
    e.preventDefault();
    const nome = novoGrupo.trim();
    if (!nome) return;
    setGrupos([...grupos, { nome, itens: [] }]);
    setNovoGrupo("");
  };
  const removeGrupo = (gi) => setGrupos(grupos.filter((_, i) => i !== gi));

  const addItem = (gi) =>
    setGrupos(
      grupos.map((g, i) =>
        i === gi
          ? { ...g, itens: [...g.itens, { descricao: "", referencia: "", aplicacao: "", consumo: "", porVariante: {} }] }
          : g
      )
    );
  const setItem = (gi, ii, patch) =>
    setGrupos(
      grupos.map((g, i) =>
        i === gi ? { ...g, itens: g.itens.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : g
      )
    );
  const removeItem = (gi, ii) =>
    setGrupos(grupos.map((g, i) => (i === gi ? { ...g, itens: g.itens.filter((_, j) => j !== ii) } : g)));

  return (
    <div className="tab-panel">
      {grupos.map((grupo, gi) => (
        <div className="insumos-group" key={gi}>
          <div className="insumos-group-head">
            <h3 className="sub">{grupo.nome}</h3>
            <button type="button" className="icon-button tiny" onClick={() => removeGrupo(gi)} title="Remover grupo">
              ×
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Referência</th>
                  <th>Aplicação</th>
                  <th>Consumo</th>
                  {variantes.map((v) => (
                    <th key={v.codigo || v.nomeCor}>{v.nomeCor || v.codigo}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {grupo.itens.map((item, ii) => (
                  <tr key={ii}>
                    <td>
                      <input value={item.descricao} onChange={(e) => setItem(gi, ii, { descricao: e.target.value })} />
                    </td>
                    <td>
                      <input value={item.referencia} onChange={(e) => setItem(gi, ii, { referencia: e.target.value })} />
                    </td>
                    <td>
                      <input value={item.aplicacao} onChange={(e) => setItem(gi, ii, { aplicacao: e.target.value })} />
                    </td>
                    <td>
                      <input value={item.consumo} onChange={(e) => setItem(gi, ii, { consumo: e.target.value })} />
                    </td>
                    {variantes.map((v) => {
                      const key = v.codigo || v.nomeCor;
                      return (
                        <td key={key}>
                          <input
                            value={item.porVariante?.[key] ?? ""}
                            onChange={(e) =>
                              setItem(gi, ii, { porVariante: { ...item.porVariante, [key]: e.target.value } })
                            }
                          />
                        </td>
                      );
                    })}
                    <td>
                      <button type="button" className="icon-button tiny" onClick={() => removeItem(gi, ii)} title="Remover item">
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="button button-outline" onClick={() => addItem(gi)}>
            + Adicionar item
          </button>
        </div>
      ))}
      <form className="inline-add-form" onSubmit={addGrupo}>
        <input
          list="grupos-insumos-sugeridos"
          value={novoGrupo}
          onChange={(e) => setNovoGrupo(e.target.value)}
          placeholder="Nome do novo grupo (ex.: Tecidos)"
        />
        <datalist id="grupos-insumos-sugeridos">
          {gruposInsumosSugeridos.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <button type="submit" className="button button-primary">
          + Adicionar grupo de insumos
        </button>
      </form>
      {variantes.length === 0 && (
        <p className="hint">Cadastre as variantes de cor na aba Variantes para ver uma coluna de consumo por cor aqui.</p>
      )}
    </div>
  );
}
