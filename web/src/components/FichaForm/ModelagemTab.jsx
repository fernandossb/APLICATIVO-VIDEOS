import { useState } from "react";
import ImageSlot from "./ImageSlot";
import AutoGrowTextarea from "../AutoGrowTextarea";

export default function ModelagemTab({ ficha, update }) {
  const medidas = ficha.medidas || { tamanhos: ["P", "M", "G", "GG"], linhas: [] };
  const imagens = ficha.imagensModelagem || {};
  const [novoTamanho, setNovoTamanho] = useState("");

  const setMedidas = (patch) => update({ medidas: { ...medidas, ...patch } });
  const setImagem = (key) => (v) => update({ imagensModelagem: { ...imagens, [key]: v } });

  const addLinha = () => setMedidas({ linhas: [...medidas.linhas, { medida: "", valores: {} }] });
  const setLinha = (i, patch) =>
    setMedidas({ linhas: medidas.linhas.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });
  const removeLinha = (i) => setMedidas({ linhas: medidas.linhas.filter((_, idx) => idx !== i) });
  const setValor = (i, tamanho, valor) =>
    setLinha(i, { valores: { ...medidas.linhas[i].valores, [tamanho]: valor } });

  const addTamanho = (e) => {
    e.preventDefault();
    const nome = novoTamanho.trim();
    if (nome && !medidas.tamanhos.includes(nome)) setMedidas({ tamanhos: [...medidas.tamanhos, nome] });
    setNovoTamanho("");
  };
  const removeTamanho = (t) => setMedidas({ tamanhos: medidas.tamanhos.filter((x) => x !== t) });

  return (
    <div className="tab-panel">
      <h3 className="sub">Tabela de medidas (peça pronta)</h3>
      <div className="table-wrap">
        <table className="measure-table">
          <thead>
            <tr>
              <th className="col-medida">Medida</th>
              {medidas.tamanhos.map((t) => (
                <th key={t} className="col-tamanho">
                  {t}{" "}
                  <button type="button" className="icon-button tiny" onClick={() => removeTamanho(t)} title="Remover tamanho">
                    ×
                  </button>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {medidas.linhas.map((linha, i) => (
              <tr key={i}>
                <td className="col-medida">
                  <AutoGrowTextarea
                    value={linha.medida}
                    onChange={(e) => setLinha(i, { medida: e.target.value })}
                    placeholder="Ex.: Comprimento (ombro até fim da frente)"
                  />
                </td>
                {medidas.tamanhos.map((t) => (
                  <td key={t} className="col-tamanho">
                    <input value={linha.valores[t] ?? ""} onChange={(e) => setValor(i, t, e.target.value)} />
                  </td>
                ))}
                <td>
                  <button type="button" className="icon-button tiny" onClick={() => removeLinha(i)} title="Remover medida">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="inline-add-form" onSubmit={addTamanho}>
        <input value={novoTamanho} onChange={(e) => setNovoTamanho(e.target.value)} placeholder="Novo tamanho (ex.: EX1)" />
        <button type="submit" className="button button-outline">
          + Adicionar tamanho
        </button>
      </form>

      <button type="button" className="button button-outline" onClick={addLinha}>
        + Adicionar medida
      </button>

      <h3 className="sub">Desenhos e diagramas</h3>
      <div className="image-grid image-grid-full">
        <div>
          <span className="field-label">Desenho com medidas</span>
          <ImageSlot value={imagens.desenhoMedidas} onChange={setImagem("desenhoMedidas")} />
        </div>
        <div>
          <span className="field-label">Método de medir</span>
          <ImageSlot value={imagens.metodoDeMedir} onChange={setImagem("metodoDeMedir")} />
        </div>
        <div>
          <span className="field-label">Localização de etiquetas</span>
          <ImageSlot value={imagens.localizacaoEtiquetas} onChange={setImagem("localizacaoEtiquetas")} />
        </div>
        <div>
          <span className="field-label">Peça explodida</span>
          <ImageSlot value={imagens.pecaExplodida} onChange={setImagem("pecaExplodida")} />
        </div>
      </div>
    </div>
  );
}
