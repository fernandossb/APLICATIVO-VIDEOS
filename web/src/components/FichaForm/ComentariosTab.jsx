import { useEffect, useState } from "react";
import { departamentosComentario } from "../../data/constants";
import AutoGrowTextarea from "../AutoGrowTextarea";
import { emailParaUsuario, getSession } from "../../lib/auth";

export default function ComentariosTab({ ficha, update }) {
  const comentarios = ficha.comentarios || { modelagem: [], engenharia: [], pilotagem: [], marketing: [] };

  const [usuario, setUsuario] = useState("");
  useEffect(() => {
    getSession().then((s) => setUsuario(s?.user?.email ? emailParaUsuario(s.user.email) : ""));
  }, []);

  const setDept = (key, rows) => update({ comentarios: { ...comentarios, [key]: rows } });
  const addRow = (key) =>
    setDept(key, [...(comentarios[key] || []), { data: "", comentario: "", responsavel: usuario }]);
  const setRow = (key, i, patch) =>
    setDept(key, comentarios[key].map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (key, i) => setDept(key, comentarios[key].filter((_, idx) => idx !== i));

  return (
    <div className="tab-panel">
      {departamentosComentario.map(({ key, label }) => (
        <div key={key} className="comment-block">
          <h3 className="sub">{label}</h3>
          <div className="edit-table comment-table">
            <div className="edit-table-head">
              <span>Data</span>
              <span>Comentário</span>
              <span>Responsável</span>
              <span />
            </div>
            {(comentarios[key] || []).map((row, i) => (
              <div className="edit-table-row" key={i}>
                <input type="date" value={row.data} onChange={(e) => setRow(key, i, { data: e.target.value })} />
                <AutoGrowTextarea
                  value={row.comentario}
                  onChange={(e) => setRow(key, i, { comentario: e.target.value })}
                />
                <AutoGrowTextarea
                  value={row.responsavel || usuario}
                  readOnly={!!usuario}
                  className={usuario ? "readonly-field" : ""}
                  title={usuario ? "Preenchido automaticamente com o usuário logado" : undefined}
                  onChange={(e) => setRow(key, i, { responsavel: e.target.value })}
                />
                <button type="button" className="icon-button tiny" onClick={() => removeRow(key, i)} title="Remover">
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="button button-outline" onClick={() => addRow(key)}>
            + Comentário
          </button>
        </div>
      ))}
    </div>
  );
}
