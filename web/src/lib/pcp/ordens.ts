/**
 * Acompanhamento de retorno das ordens de producao (3011).
 *
 * A pergunta que esta tela responde nao e "qual OP esta mais atrasada", e sim
 * **qual OP precisa voltar primeiro para o pedido do cliente nao furar**. Sao
 * coisas diferentes: uma OP 40 dias atrasada de um produto que ninguem pediu
 * pesa menos que uma OP de 5 dias cujo produto tem entrega marcada para
 * depois de amanha.
 *
 * Por isso a fila e ordenada pela ENTREGA DO PEDIDO que depende daquela OP, e
 * nao pela data de retorno dela. A data de retorno entra como desempate e para
 * classificar o risco.
 *
 * Funcao pura, sem DOM e sem Cloudflare, para rodar no `node --test`.
 */

/**
 * Limpa o nome da faccao como ele vem do 3011.
 *
 * O ERP gruda o documento no nome, e em duas posicoes diferentes:
 * `30.329.523 CALINE VICENTE FERREIRA PETRY` (CNPJ na frente) e
 * `ANDREIA VOGEL 01033137022` (CPF atras). Nenhum dos dois serve para escolher
 * a faccao numa lista.
 */
export function limparNomeFaccao(nome: string): string {
  return String(nome ?? "")
    .trim()
    // Documento colado na frente: "30.329.523 NOME".
    .replace(/^[\d][\d.\-/]*\s+/, "")
    // Documento colado atras: "NOME 01033137022". Pede 8+ digitos para nao
    // comer numero que faca parte do nome ("CONFECCOES 2").
    .replace(/\s+\d[\d.\-/]{7,}$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * A lista de faccoes que o cadastro de produto sugere.
 *
 * Tira as de conserto: sao retrabalho, um fluxo interno do 3011, e nao
 * destino de producao — sugerir "CONSERTO FULANA" para programar um produto so
 * atrapalharia. Como o conserto e sempre um espelho de uma faccao que ja
 * existe na lista, nada se perde ao remove-las.
 */
export function listarFaccoes(nomes: string[]): string[] {
  const limpas = new Set<string>();
  for (const bruto of nomes) {
    const texto = String(bruto ?? "").trim();
    if (!texto) continue;
    if (/^CONSERTO\b/i.test(texto)) continue;
    const limpo = limparNomeFaccao(texto);
    if (limpo) limpas.add(limpo);
  }
  return [...limpas].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export interface LinhaOrdem {
  op: string;
  referencia: string;
  cor: string;
  corNome: string;
  tam: string;
  descricao: string;
  faccao: string;
  colecao: string;
  quantPendente: number;
  dtSaida: string;
  dtRetorno: string;
  diasPendente: number;
  status: string;
  setor: string;
}

export interface ItemPedidoAberto {
  numero: string;
  referencia: string;
  cor: string;
  tam: string;
  qtdePedida: number;
  qtdeExpedida: number;
  dtEntrega: string;
}

/**
 * `critico`  - tem pedido e a OP nao volta a tempo (ou ja passou do retorno)
 * `atencao`  - tem pedido e volta em cima da hora (folga de ate 3 dias)
 * `normal`   - tem pedido e volta com folga
 * `sem-pedido` - nenhum pedido em aberto depende desta OP hoje
 */
export type RiscoOrdem = "critico" | "atencao" | "normal" | "sem-pedido";

export interface OrdemAcompanhada {
  op: string;
  referencia: string;
  cor: string;
  corNome: string;
  descricao: string;
  faccao: string;
  colecao: string;
  status: string;
  setor: string;
  tamanhos: string;
  quantPendente: number;
  dtSaida: string;
  /** A mais proxima entre os tamanhos da OP. */
  dtRetorno: string;
  diasPendente: number;
  /** Retorno ja venceu. */
  atrasadoRetorno: boolean;
  /** Pedido em aberto mais urgente que depende do produto desta OP. */
  pedidoMaisUrgente: string;
  entregaMaisUrgente: string;
  /** Pecas em pedido aberto do produto desta OP (demanda, nao reserva). */
  qtdeEmPedido: number;
  diasAteEntrega: number | null;
  /** Dias entre o retorno previsto e a entrega. Negativo = nao chega a tempo. */
  folgaDias: number | null;
  risco: RiscoOrdem;
}

function chave(referencia: string, cor: string, tam: string): string {
  return `${referencia}|${cor}|${tam}`;
}

function diasEntre(de: string, ate: string): number | null {
  if (!de || !ate) return null;
  const a = new Date(`${de}T00:00:00`);
  const b = new Date(`${ate}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function hojeIso(hoje: Date): string {
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${hoje.getFullYear()}-${mes}-${dia}`;
}

export function montarAcompanhamento(
  linhas: LinhaOrdem[],
  pedidos: ItemPedidoAberto[],
  hoje: Date = new Date(),
): OrdemAcompanhada[] {
  /*
   * Demanda em aberto por produto/cor/tamanho, junto com a entrega mais
   * proxima que precisa dela. Um produto pode estar em varios pedidos: o que
   * manda a urgencia e sempre o de entrega mais cedo.
   */
  const demanda = new Map<string, { qtde: number; entrega: string; pedido: string }>();
  for (const p of pedidos) {
    const aberta = Math.max(0, p.qtdePedida - p.qtdeExpedida);
    if (aberta <= 0) continue;
    const k = chave(p.referencia, p.cor, p.tam);
    const atual = demanda.get(k);
    if (!atual) {
      demanda.set(k, { qtde: aberta, entrega: p.dtEntrega, pedido: p.numero });
      continue;
    }
    atual.qtde += aberta;
    // Sem data nunca ganha de uma data real.
    const trocar = p.dtEntrega && (!atual.entrega || p.dtEntrega < atual.entrega);
    if (trocar) {
      atual.entrega = p.dtEntrega;
      atual.pedido = p.numero;
    }
  }

  // Uma OP e sempre uma referencia e uma cor; os tamanhos sao as linhas dela.
  const porOp = new Map<string, LinhaOrdem[]>();
  for (const l of linhas) {
    const lista = porOp.get(l.op);
    if (lista) lista.push(l);
    else porOp.set(l.op, [l]);
  }

  const hojeTexto = hojeIso(hoje);
  const saida: OrdemAcompanhada[] = [];

  for (const [op, doOp] of porOp) {
    const primeira = doOp[0];
    let quantPendente = 0;
    let dtRetorno = "";
    let dtSaida = "";
    let diasPendente = 0;
    let qtdeEmPedido = 0;
    let entregaMaisUrgente = "";
    let pedidoMaisUrgente = "";

    for (const l of doOp) {
      quantPendente += l.quantPendente;
      diasPendente = Math.max(diasPendente, l.diasPendente);
      if (l.dtRetorno && (!dtRetorno || l.dtRetorno < dtRetorno)) dtRetorno = l.dtRetorno;
      if (l.dtSaida && (!dtSaida || l.dtSaida < dtSaida)) dtSaida = l.dtSaida;

      const d = demanda.get(chave(l.referencia, l.cor, l.tam));
      if (!d) continue;
      qtdeEmPedido += d.qtde;
      if (d.entrega && (!entregaMaisUrgente || d.entrega < entregaMaisUrgente)) {
        entregaMaisUrgente = d.entrega;
        pedidoMaisUrgente = d.pedido;
      }
    }

    const temPedido = qtdeEmPedido > 0;
    const diasAteEntrega = entregaMaisUrgente ? diasEntre(hojeTexto, entregaMaisUrgente) : null;
    const folgaDias = dtRetorno && entregaMaisUrgente ? diasEntre(dtRetorno, entregaMaisUrgente) : null;
    const atrasadoRetorno = Boolean(dtRetorno) && dtRetorno < hojeTexto;

    let risco: RiscoOrdem;
    if (!temPedido) risco = "sem-pedido";
    else if (atrasadoRetorno || (folgaDias !== null && folgaDias < 0)) risco = "critico";
    else if (folgaDias !== null && folgaDias <= 3) risco = "atencao";
    else risco = "normal";

    saida.push({
      op,
      referencia: primeira.referencia,
      cor: primeira.cor,
      corNome: primeira.corNome,
      descricao: primeira.descricao,
      faccao: primeira.faccao,
      colecao: primeira.colecao,
      status: primeira.status,
      setor: primeira.setor,
      tamanhos: [...new Set(doOp.map((l) => l.tam).filter(Boolean))].join(", "),
      quantPendente,
      dtSaida,
      dtRetorno,
      diasPendente,
      atrasadoRetorno,
      pedidoMaisUrgente,
      entregaMaisUrgente,
      qtdeEmPedido,
      diasAteEntrega,
      folgaDias,
      risco,
    });
  }

  /*
   * Ordem: quem tem pedido vem antes de quem nao tem — essa e a regra que o
   * usuario pediu ("produtos que vao sair antes e estao pendentes em
   * pedidos"). Dentro de quem tem pedido, a entrega mais proxima manda. Quem
   * nao tem pedido fica no fim, ordenado pelo proprio retorno, para continuar
   * sendo acompanhado sem competir com o que tem cliente esperando.
   */
  saida.sort((a, b) => {
    const aTem = a.risco !== "sem-pedido";
    const bTem = b.risco !== "sem-pedido";
    if (aTem !== bTem) return aTem ? -1 : 1;

    if (aTem && bTem) {
      if (a.entregaMaisUrgente !== b.entregaMaisUrgente) {
        if (!a.entregaMaisUrgente) return 1;
        if (!b.entregaMaisUrgente) return -1;
        return a.entregaMaisUrgente.localeCompare(b.entregaMaisUrgente);
      }
    }

    if (a.dtRetorno !== b.dtRetorno) {
      if (!a.dtRetorno) return 1;
      if (!b.dtRetorno) return -1;
      return a.dtRetorno.localeCompare(b.dtRetorno);
    }
    return a.op.localeCompare(b.op, "pt-BR", { numeric: true });
  });

  return saida;
}
