import { useRef, useState } from "react";

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

export default function FiltroColuna({
  titulo,
  valor,
  neutro,
  opcoes,
  aoMudar,
  textoLivre,
  sugestoes,
  placeholder,
}: {
  titulo: string;
  valor: string;
  /** Valor que significa "sem filtro" (`todas`, `todos`, ou vazio). */
  neutro: string;
  /** Lista fechada. Quando ausente, o filtro e campo de texto. */
  opcoes?: OpcaoFiltro[];
  aoMudar: (valor: string) => void;
  textoLivre?: boolean;
  sugestoes?: string[];
  placeholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const botaoRef = useRef<HTMLButtonElement>(null);
  const ativo = valor !== neutro && valor !== "";

  function abrir(e: React.MouseEvent) {
    e.stopPropagation();
    if (!aberto && botaoRef.current) {
      const r = botaoRef.current.getBoundingClientRect();
      const largura = 220;
      const left = Math.min(r.left, window.innerWidth - largura - 12);
      setPos({ top: r.bottom + 4, left: Math.max(8, left) });
    }
    setAberto((v) => !v);
  }

  return (
    <span className="filtro-coluna" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        ref={botaoRef}
        className={`filtro-funil${ativo ? " ativo" : ""}`}
        onClick={abrir}
        aria-label={`Filtrar por ${titulo}`}
        title={ativo ? `${titulo}: ${valor}` : `Filtrar por ${titulo}`}
      >
        ▼
      </button>
      {aberto && (
        <>
          <div className="filtro-fundo" onClick={() => setAberto(false)} />
          <div className="filtro-painel" style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 100 }} role="menu">
            <div className="filtro-painel-titulo">
              <strong>{titulo}</strong>
              {ativo && (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    aoMudar(neutro);
                    setAberto(false);
                  }}
                >
                  Limpar
                </button>
              )}
            </div>
            {textoLivre ? (
              <input
                autoFocus
                value={valor}
                list={sugestoes ? `sug-${titulo.replace(/\s/g, "")}` : undefined}
                placeholder={placeholder}
                onChange={(e) => aoMudar(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") setAberto(false);
                }}
              />
            ) : (
              <div className="filtro-opcoes">
                {(opcoes ?? []).map((o) => (
                  <button
                    type="button"
                    key={o.valor}
                    className={`filtro-opcao${o.valor === valor ? " marcada" : ""}`}
                    onClick={() => {
                      aoMudar(o.valor);
                      setAberto(false);
                    }}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
            )}
            {textoLivre && sugestoes && (
              <datalist id={`sug-${titulo.replace(/\s/g, "")}`}>
                {sugestoes.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </div>
        </>
      )}
    </span>
  );
}
