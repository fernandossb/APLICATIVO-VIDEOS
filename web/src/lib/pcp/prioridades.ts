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
  cliente?: string;
  referencia: string;
  descricao?: string;
  cor: string;
  descCor?: string;
  tam: string;
  qtdePedida: number;
  qtdeExpedida: number;
  dtFatura?: string;
  dtEntrega?: string;
  dtEmissao?: string;
  descStatus?: string;
  cidade?: string;
  estado?: string;
}

export interface EstoqueDisponivel {
  referencia: string;
  cor: string;
  tam: string;
  /** Pecas prontas, do 721 ou 2020/2024. */
  estoque: number;
}

export interface LinhaPrioridade {
  numero: string;
  cliente: string;
  dtFatura: string;
  dtEntrega: string;
  dtEmissao: string;
  descStatus: string;
  referencia: string;
  descricao: string;
  cor: string;
  descCor: string;
  tam: string;
  /** Quantidade aberta (pedida menos já expedida). */
  aberta: number;
  /** Quanto dessa quantidade o estoque atual cobriu. */
  cobertoPorEstoque: number;
  /** O que sobra para a produção fazer. */
  faltaProduzir: number;
  /** Status do pedido como um todo: se faltou qualquer peça, o pedido está PENDURADO. */
  statusPedido: "PENDURADO" | "COBERTO";
  /** Status deste item específico no pedido. */
  statusLinha: "PENDURADO" | "COBERTO";
  /** Data de fatura a partir da qual o estoque deste produto esgotou na carteira. */
  dtFaturaPrimeiraFalta?: string;
  /** Dias até a data da fatura / entrega. Negativo = atrasado. */
  diasAteEntrega: number | null;
  atrasado: boolean;
  cidade?: string;
  estado?: string;
}

export interface RupturaProduto {
  referencia: string;
  descricao: string;
  cor: string;
  descCor: string;
  tam: string;
  dtFaturaPrimeiraFalta: string;
  primeiroPedidoAfetado: string;
  clientePrimeiroAfetado: string;
  estoqueInicial: number;
  faltaTotal: number;
  demandaTotal: number;
}

function chave(referencia: string, cor: string, tam: string): string {
  return `${String(referencia || "").trim().toUpperCase()}|${String(cor || "").trim().toUpperCase()}|${String(tam || "").trim().toUpperCase()}`;
}

/**
 * Dias entre hoje e a data de referência (fatura ou entrega).
 */
export function diasAteEntrega(dataIso: string, hoje: Date): number | null {
  if (!dataIso) return null;
  const alvo = new Date(`${dataIso}T00:00:00`);
  if (Number.isNaN(alvo.getTime())) return null;
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo.getTime() - base.getTime()) / 86400000);
}

export function montarPrioridades(
  pedidos: PedidoAberto[],
  estoque: EstoqueDisponivel[],
  hoje: Date = new Date(),
): LinhaPrioridade[] {
  // 1. Saldo de estoque inicial por SKU (721 e produto acabado 2020/2024)
  const disponivel = new Map<string, number>();
  const estoqueInicialPorSku = new Map<string, number>();
  for (const e of estoque) {
    const k = chave(e.referencia, e.cor, e.tam);
    const saldo = (disponivel.get(k) ?? 0) + Math.max(0, e.estoque);
    disponivel.set(k, saldo);
    estoqueInicialPorSku.set(k, saldo);
  }

  // 2. Agrupar itens por pedido para simular PEDIDO A PEDIDO
  const itensPorPedido = new Map<string, (PedidoAberto & { aberta: number })[]>();
  const pedidosMeta = new Map<
    string,
    {
      numero: string;
      cliente: string;
      dtFatura: string;
      dtEntrega: string;
      dtEmissao: string;
      descStatus: string;
      cidade: string;
      estado: string;
    }
  >();

  for (const p of pedidos) {
    const aberta = Math.max(0, (Number(p.qtdePedida) || 0) - (Number(p.qtdeExpedida) || 0));
    if (aberta <= 0) continue;

    const num = String(p.numero || "").trim();
    if (!itensPorPedido.has(num)) {
      itensPorPedido.set(num, []);
      pedidosMeta.set(num, {
        numero: num,
        cliente: String(p.cliente || "").trim(),
        dtFatura: String(p.dtFatura || p.dtEntrega || p.dtEmissao || "").trim(),
        dtEntrega: String(p.dtEntrega || "").trim(),
        dtEmissao: String(p.dtEmissao || "").trim(),
        descStatus: String(p.descStatus || "").trim(),
        cidade: String(p.cidade || "").trim(),
        estado: String(p.estado || "").trim(),
      });
    }
    itensPorPedido.get(num)!.push({
      ...p,
      aberta,
    });
  }

  // 3. ORDENAR OS PEDIDOS POR DATA DE FATURA (dtFatura)
  // Conforme solicitado: quem tem fatura primeiro é atendido antes pelo estoque
  const pedidosOrdenados = Array.from(pedidosMeta.values()).sort((a, b) => {
    if (!a.dtFatura && !b.dtFatura) return a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });
    if (!a.dtFatura) return 1;
    if (!b.dtFatura) return -1;
    if (a.dtFatura !== b.dtFatura) return a.dtFatura.localeCompare(b.dtFatura);
    return a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });
  });

  // 4. Simulação sequencial com desconto cumulativo de estoque:
  // Quando for simular o próximo pedido, o estoque já estará reduzido pelo atendimento anterior.
  // Também rastreamos a primeira data de fatura em que cada produto acusou falta.
  const primeiraFaltaPorSku = new Map<string, string>();
  const linhasResultado: LinhaPrioridade[] = [];

  for (const meta of pedidosOrdenados) {
    const itens = itensPorPedido.get(meta.numero) || [];
    let pedidoTemFalta = false;

    const itensProcessados: {
      item: PedidoAberto & { aberta: number };
      coberto: number;
      falta: number;
      dias: number | null;
      atrasado: boolean;
    }[] = [];

    for (const item of itens) {
      const k = chave(item.referencia, item.cor, item.tam);
      const saldo = disponivel.get(k) ?? 0;
      const coberto = Math.min(saldo, item.aberta);
      const falta = item.aberta - coberto;

      // Abate imediatamente o estoque do item
      disponivel.set(k, saldo - coberto);

      if (falta > 0) {
        pedidoTemFalta = true;
        if (!primeiraFaltaPorSku.has(k)) {
          primeiraFaltaPorSku.set(k, meta.dtFatura);
        }
      }

      const dataBase = meta.dtFatura || meta.dtEntrega;
      const dias = diasAteEntrega(dataBase, hoje);

      itensProcessados.push({
        item,
        coberto,
        falta,
        dias,
        atrasado: dias !== null && dias < 0,
      });
    }

    const statusPedido: "PENDURADO" | "COBERTO" = pedidoTemFalta ? "PENDURADO" : "COBERTO";

    for (const proc of itensProcessados) {
      const k = chave(proc.item.referencia, proc.item.cor, proc.item.tam);
      linhasResultado.push({
        numero: meta.numero,
        cliente: meta.cliente,
        dtFatura: meta.dtFatura,
        dtEntrega: meta.dtEntrega,
        dtEmissao: meta.dtEmissao,
        descStatus: meta.descStatus,
        referencia: proc.item.referencia,
        descricao: proc.item.descricao || "",
        cor: proc.item.cor,
        descCor: proc.item.descCor || "",
        tam: proc.item.tam,
        aberta: proc.item.aberta,
        cobertoPorEstoque: proc.coberto,
        faltaProduzir: proc.falta,
        statusPedido,
        statusLinha: proc.falta > 0 ? "PENDURADO" : "COBERTO",
        dtFaturaPrimeiraFalta: primeiraFaltaPorSku.get(k),
        diasAteEntrega: proc.dias,
        atrasado: proc.atrasado,
        cidade: meta.cidade,
        estado: meta.estado,
      });
    }
  }

  return linhasResultado;
}

/**
 * Calcula a lista consolidada de rupturas por produto e a data a partir da qual cada um falta.
 */
export function extrairRupturasProdutos(linhas: LinhaPrioridade[]): RupturaProduto[] {
  const mapa = new Map<string, RupturaProduto>();

  for (const l of linhas) {
    if (l.faltaProduzir <= 0) continue;
    const k = chave(l.referencia, l.cor, l.tam);
    if (!mapa.has(k)) {
      mapa.set(k, {
        referencia: l.referencia,
        descricao: l.descricao,
        cor: l.cor,
        descCor: l.descCor,
        tam: l.tam,
        dtFaturaPrimeiraFalta: l.dtFaturaPrimeiraFalta || l.dtFatura,
        primeiroPedidoAfetado: l.numero,
        clientePrimeiroAfetado: l.cliente,
        estoqueInicial: 0,
        faltaTotal: 0,
        demandaTotal: 0,
      });
    }
    const r = mapa.get(k)!;
    r.faltaTotal += l.faltaProduzir;
    r.demandaTotal += l.aberta;
  }

  return Array.from(mapa.values()).sort((a, b) => {
    if (a.dtFaturaPrimeiraFalta !== b.dtFaturaPrimeiraFalta) {
      return a.dtFaturaPrimeiraFalta.localeCompare(b.dtFaturaPrimeiraFalta);
    }
    return b.faltaTotal - a.faltaTotal;
  });
}
