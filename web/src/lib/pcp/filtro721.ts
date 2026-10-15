/**
 * Qual parte do 721 cada arquivo pode gravar.
 *
 * O 721 nao tem coluna de data: quem define o periodo e o filtro usado no ERP
 * na hora de extrair. Como cada colecao lanca num dia diferente, o usuario
 * extrai UM arquivo por colecao, cada um filtrado a partir do lancamento dela.
 * A consequencia e que a VENDA ACUMULADA de um mesmo produto e diferente em
 * cada arquivo — cada uma contada de um marco diferente.
 *
 * Por isso o arquivo do Verao 2027 so pode atualizar produtos do Verao 2027.
 * Sem esse recorte, importar o segundo arquivo sobrescreveria a venda do
 * primeiro com numeros contados do periodo errado, e ninguem perceberia: os
 * numeros continuariam "existindo", so que medindo outra coisa.
 *
 * Funcao pura, sem DOM e sem Cloudflare, para rodar no `node --test`.
 */

export interface ProdutoColecao {
  referencia: string;
  cor: string;
  colecaoNome: string;
}

export interface ColecaoArquivo {
  nome: string;
  arquivo: string;
}

export interface LinhaMovimento {
  referencia: string;
  cor: string;
}

function chave(referencia: string, cor: string): string {
  return `${referencia.trim().toUpperCase()}|${cor.trim().toUpperCase()}`;
}

function limpar(nome: string): string {
  return nome.trim().toUpperCase();
}

/**
 * As colecoes que apontam para este arquivo. Normalmente uma, mas nada impede
 * duas colecoes compartilharem o mesmo 721 se lancaram no mesmo dia.
 */
export function colecoesDoArquivo(arquivo: string, colecoes: ColecaoArquivo[]): string[] {
  const alvo = limpar(arquivo);
  if (!alvo) return [];
  return colecoes.filter((c) => limpar(c.arquivo) === alvo).map((c) => limpar(c.nome));
}

export interface ResultadoFiltro<T> {
  itens: T[];
  /** Linhas deixadas de fora por serem de outra colecao. */
  descartadas: number;
  /** Linhas mantidas por nao existirem no 2024 (colecao desconhecida). */
  semColecao: number;
  /** Nenhuma colecao reivindicou este arquivo: entra inteiro, como antes. */
  semRecorte: boolean;
}

/**
 * Recorta as linhas do 721 para as colecoes que escolheram este arquivo.
 *
 * Duas decisoes que valem explicacao:
 *
 * 1. Arquivo que nenhuma colecao escolheu entra INTEIRO. E o comportamento de
 *    sempre, e o que faz o sistema continuar funcionando para quem ainda nao
 *    montou o cadastro de colecoes — nao da para exigir configuracao para o
 *    basico voltar a funcionar.
 *
 * 2. Produto que nao existe no 2024 (sem colecao conhecida) tambem entra, em
 *    qualquer arquivo. Sao ~1.150 linhas hoje. Excluir seria pior: elas
 *    parariam de receber estoque, processo e carteira, e a linha inteira
 *    envelheceria em silencio. O preco e que a venda acumulada delas fica a do
 *    ultimo arquivo importado — impreciso, mas visivel e nao destrutivo.
 */
export function filtrarPorColecao<T extends LinhaMovimento>(
  itens: T[],
  arquivo: string,
  colecoes: ColecaoArquivo[],
  produtos: ProdutoColecao[],
): ResultadoFiltro<T> {
  const alvos = new Set(colecoesDoArquivo(arquivo, colecoes));
  if (alvos.size === 0) {
    return { itens, descartadas: 0, semColecao: 0, semRecorte: true };
  }

  const colecaoPorProduto = new Map<string, string>();
  for (const p of produtos) {
    if (!p.colecaoNome) continue;
    colecaoPorProduto.set(chave(p.referencia, p.cor), limpar(p.colecaoNome));
  }

  const saida: T[] = [];
  let descartadas = 0;
  let semColecao = 0;

  for (const item of itens) {
    const colecao = colecaoPorProduto.get(chave(item.referencia, item.cor));
    if (colecao === undefined) {
      semColecao += 1;
      saida.push(item);
      continue;
    }
    if (alvos.has(colecao)) saida.push(item);
    else descartadas += 1;
  }

  return { itens: saida, descartadas, semColecao, semRecorte: false };
}
