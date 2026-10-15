/**
 * Fila de prioridade da producao, montada a partir do 2710 (pedidos e produtos
 * do pedido). Funcao pura, sem DOM e sem Cloudflare, de proposito, para rodar
 * no `node --test` — mesma regra do `lib/relatorios.ts`.
 *
 * A ordem e por DATA DE ENTREGA: o que vence primeiro vai para o topo, e o que
 * ja passou da data vem antes de tudo. Pedido sem data de entrega vai para o
 * fim, nunca para o inicio: sem data nao da para afirmar que e urgente, e
 * empurrar para cima o que nao tem prazo atrasaria quem tem prazo de verdade.
 *
 * O estoque e descontado NA ORDEM DA FILA, nao por linha isolada. Duas
 * entregas do mesmo produto disputam a mesma prateleira: se ha 100 pecas em
 * estoque e dois pedidos de 80, o primeiro leva 80 e o segundo so encontra 20
 * — precisa produzir 60. Descontar o estoque cheio nos dois diria que nao
 * falta nada, e a fabrica descobriria o furo no dia da segunda entrega.
 */

/**
 * Data de lancamento que vale para uma linha.
 *
 * A data e da COLECAO, nao do produto: o 721 e extraido por colecao, filtrado
 * no ERP a partir do dia em que ela lancou. Mas existe produto que entra depois
 * do lancamento da colecao (lancamento escalonado), e esse tem data propria no
 * cadastro. Por isso a do produto ganha da colecao — nunca o contrario, senao
 * reimportar o 721 apagaria a data especifica que alguem cadastrou na mao.
 */
export function lancamentoDaLinha(
  lancamentoDoProduto: string | null | undefined,
  colecaoNome: string | null | undefined,
  lancamentoPorColecao: Map<string, string>,
): string {
  const doProduto = (lancamentoDoProduto ?? "").trim();
  if (doProduto) return doProduto;
  const colecao = (colecaoNome ?? "").trim().toUpperCase();
  if (!colecao) return "";
  return lancamentoPorColecao.get(colecao) ?? "";
}

export interface PedidoAberto {
  numero: string;
  /** ISO `AAAA-MM-DD`, ou "" quando o pedido nao traz data. */
  dtEntrega: string;
  dtEmissao: string;
  descStatus: string;
  referencia: string;
  cor: string;
  tam: string;
  qtdePedida: number;
  qtdeExpedida: number;
}

export interface EstoqueDisponivel {
  referencia: string;
  cor: string;
  tam: string;
  /** Pecas prontas, do 721. */
  estoque: number;
}

export interface LinhaPrioridade {
  numero: string;
  dtEntrega: string;
  dtEmissao: string;
  descStatus: string;
  referencia: string;
  cor: string;
  tam: string;
  /** Pedido menos ja expedido: o que ainda falta entregar. */
  aberta: number;
  /** Quanto dessa quantidade o estoque atual cobre. */
  cobertoPorEstoque: number;
  /** O que sobra para a producao fazer. */
  faltaProduzir: number;
  /** Dias ate a entrega. Negativo = atrasado. `null` = pedido sem data. */
  diasAteEntrega: number | null;
  atrasado: boolean;
}

function chave(referencia: string, cor: string, tam: string): string {
  return `${referencia}|${cor}|${tam}`;
}

/**
 * Dias entre hoje e a data de entrega. Recebe `hoje` de fora para o teste
 * poder fixar a data — sem isso o resultado mudaria a cada dia que passa.
 */
export function diasAteEntrega(dtEntrega: string, hoje: Date): number | null {
  if (!dtEntrega) return null;
  const alvo = new Date(`${dtEntrega}T00:00:00`);
  if (Number.isNaN(alvo.getTime())) return null;
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo.getTime() - base.getTime()) / 86400000);
}

export function montarPrioridades(
  pedidos: PedidoAberto[],
  estoque: EstoqueDisponivel[],
  hoje: Date = new Date(),
): LinhaPrioridade[] {
  // Saldo de estoque que ainda nao foi prometido a ninguem nesta fila.
  const disponivel = new Map<string, number>();
  for (const e of estoque) {
    const k = chave(e.referencia, e.cor, e.tam);
    disponivel.set(k, (disponivel.get(k) ?? 0) + Math.max(0, e.estoque));
  }

  const abertos = pedidos
    .map((p) => ({ ...p, aberta: Math.max(0, p.qtdePedida - p.qtdeExpedida) }))
    .filter((p) => p.aberta > 0);

  abertos.sort((a, b) => {
    // Sem data vai para o fim; entre duas sem data, ordena por numero.
    if (!a.dtEntrega && !b.dtEntrega) return a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });
    if (!a.dtEntrega) return 1;
    if (!b.dtEntrega) return -1;
    if (a.dtEntrega !== b.dtEntrega) return a.dtEntrega.localeCompare(b.dtEntrega);
    return a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });
  });

  return abertos.map((p) => {
    const k = chave(p.referencia, p.cor, p.tam);
    const saldo = disponivel.get(k) ?? 0;
    const coberto = Math.min(saldo, p.aberta);
    disponivel.set(k, saldo - coberto);
    const dias = diasAteEntrega(p.dtEntrega, hoje);
    return {
      numero: p.numero,
      dtEntrega: p.dtEntrega,
      dtEmissao: p.dtEmissao,
      descStatus: p.descStatus,
      referencia: p.referencia,
      cor: p.cor,
      tam: p.tam,
      aberta: p.aberta,
      cobertoPorEstoque: coberto,
      faltaProduzir: p.aberta - coberto,
      diasAteEntrega: dias,
      atrasado: dias !== null && dias < 0,
    };
  });
}
