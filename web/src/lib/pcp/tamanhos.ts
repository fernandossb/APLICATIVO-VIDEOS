/**
 * Ordem dos tamanhos da confeccao.
 *
 * O SISPLAN devolve o tamanho como texto, entao qualquer ordenacao alfabetica
 * ou numerica simples embaralha a grade: "GG" vem antes de "P", e "10" vem
 * antes de "2". A ordem correta e a da grade, e ela e sempre a mesma:
 *
 *   PP, P, M, G, GG, EX1, EX2, EX3       (adulto)
 *   RN, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16 (infantil)
 *
 * Os arquivos reais tambem trazem tamanho unico (`U`), a linha de total da
 * planilha (`-T-`) e faixas de meia (`26-29`, `30-33`, `34-37`, ...).
 *
 * Funcao pura: roda no navegador, no Worker e no `node --test`.
 */

/** Peso de cada tamanho nomeado. Menor vem primeiro. */
const NOMEADOS: Record<string, number> = {
  // Tamanho unico e a linha de total ficam sempre no topo.
  "-T-": 0,
  T: 0,
  U: 1,
  UN: 1,
  UNI: 1,
  UNICO: 1,
  F0: 1,

  // Infantil que nao e numero.
  RN: 10,
  BB: 11,
  M0: 12,

  // Adulto.
  PPP: 20,
  PP: 21,
  P: 22,
  M: 23,
  G: 24,
  GG: 25,
  XG: 26,
  XGG: 27,
  EG: 28,
  EGG: 29,

  // Tamanhos especiais, que na confeccao vem depois do GG.
  EX1: 40,
  EX2: 41,
  EX3: 42,
  EX4: 43,
  EX5: 44,
  EX6: 45,
  EXG: 46,
};

/** Tamanhos numericos entram depois dos nomeados, na ordem do numero. */
const BASE_NUMERICA = 100;
/** Tamanho que o sistema nao conhece vai para o fim, em ordem alfabetica. */
const DESCONHECIDO = 100000;

export function normalizarTamanho(tam: unknown): string {
  return String(tam ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Peso de ordenacao do tamanho. Quanto menor, mais cedo na grade.
 *
 * Faixas como `10-12` entram logo depois do `10`, porque e assim que aparecem
 * na grade: primeiro o tamanho fechado, depois a faixa que comeca nele.
 */
export function ordemTamanho(tam: unknown): number {
  const limpo = normalizarTamanho(tam);
  if (limpo === "") return DESCONHECIDO;

  const nomeado = NOMEADOS[limpo];
  if (nomeado !== undefined) return nomeado;

  if (/^\d+$/.test(limpo)) return BASE_NUMERICA + Number(limpo);

  const faixa = limpo.match(/^(\d+)\s*[-\/aA]\s*(\d+)$/);
  if (faixa) return BASE_NUMERICA + Number(faixa[1]) + 0.5;

  return DESCONHECIDO;
}

/** Comparador para `Array.prototype.sort`, com desempate alfabetico. */
export function compararTamanho(a: unknown, b: unknown): number {
  const pesoA = ordemTamanho(a);
  const pesoB = ordemTamanho(b);
  if (pesoA !== pesoB) return pesoA - pesoB;
  return normalizarTamanho(a).localeCompare(normalizarTamanho(b), "pt-BR", { numeric: true });
}

/** Ordena a grade de uma referencia/cor sem alterar o array recebido. */
export function ordenarPorTamanho<T>(itens: T[], tamDe: (item: T) => unknown): T[] {
  return [...itens].sort((a, b) => compararTamanho(tamDe(a), tamDe(b)));
}
