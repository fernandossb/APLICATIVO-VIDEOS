import { useEffect, useMemo, useRef, useState } from "react";

export default function ColumnFilterButton({ values, active, onChange }) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const opcoes = useMemo(() => {
    const unicos = Array.from(new Set(values.map((v) => String(v ?? "").trim()))).filter((v) => v !== "");
    unicos.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    return unicos;
  }, [values]);

  const termo = busca.trim().toLowerCase();
  const opcoesExibidas = termo ? opcoes.filter((v) => v.toLowerCase().includes(termo)) : opcoes;

  const isActive = active != null;
  const marcado = (v) => !isActive || active.has(v);

  const toggle = (v) => {
    const atual = new Set(isActive ? active : opcoes);
    if (atual.has(v)) atual.delete(v);
    else atual.add(v);
    onChange(atual.size === opcoes.length ? null : atual);
  };

  return (
    <span className="col-filter" ref={ref}>
      <button
        type="button"
        className={`col-filter-trigger${isActive ? " active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Filtrar coluna"
      >
        ▾
      </button>
      {open && (
        <div className="col-filter-dropdown" onClick={(e) => e.stopPropagation()}>
          <input
            className="col-filter-search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar valor..."
            autoFocus
          />
          <div className="col-filter-actions">
            <button type="button" onClick={() => onChange(null)}>
              Selecionar todos
            </button>
            <button type="button" onClick={() => onChange(new Set())}>
              Limpar
            </button>
          </div>
          <ul className="col-filter-list">
            {opcoesExibidas.map((v) => (
              <li key={v}>
                <label>
                  <input type="checkbox" checked={marcado(v)} onChange={() => toggle(v)} />
                  <span>{v}</span>
                </label>
              </li>
            ))}
            {opcoesExibidas.length === 0 && <li className="col-filter-empty">Nenhum valor</li>}
          </ul>
        </div>
      )}
    </span>
  );
}
