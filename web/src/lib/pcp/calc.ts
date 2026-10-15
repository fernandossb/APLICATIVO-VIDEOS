/**
 * Regras de calculo do PCP.
 *
 * As formulas seguem o MANUAL TECNICO SIMPLIFICADO PLANILHA PCP e foram
 * conferidas contra as formulas reais da planilha. Onde o manual e a planilha
 * divergiam, valeu a planilha, e o comentario diz qual e a formula original.
 *
 * Continua funcao pura: sem DOM, sem rede e sem Cloudflare.
 */

import { compararTamanho } from "./tamanhos.ts";

export interface LinhaPlano {
  id: string;
  referencia: string;
  colecao: string;
  colecaoNome: string;
  tam: string;
  cor: string;
  corNome: string;
  descricao: string;
  projVenda: number;
  /** Peso do tamanho na grade, usado para ratear a projecao. */
  gradePadrao: number;
  curvaProducao: string;
  lancamento: string;
  deadline: string;
  leadTime: number;
  estoque: number;
  processo: number;
  carteira: number;
  vendaAcm: number;
  lote: number;
  faccao: string;
  capacidade: number;
  unidade: number;
  precoCostura: number;
  obsProduto?: string;
  /** Flag manual da tela: produto desativado nao consome material. */
  ativo: boolean;
  /**
   * Coluna ATIVO do relatorio 2024, deste tamanho. `undefined` quando o
   * tamanho ainda nao apareceu em nenhum relatorio: nesse caso o sistema nao
   * tem como saber, e trata como ativo para nao sumir com a linha.
   */
  ativoRelatorio?: boolean;
}

/** Dados de planejamento por referencia+cor, vindos da aba LEAD TIME. */
export interface PlanejamentoProduto {
  referencia: string;
  cor: string;
  linha: string;
  projecaoTotal: number;
  leadTime: number;
  /**
   * Curva de PRODUCAO, 12 posicoes (janeiro a dezembro). E a que manda em
   * PRODUCAO PROJETADA, exatamente como na planilha.
   */
  curva: number[];
  /** Curva de VENDA, 12 posicoes. */
  curvaVenda?: number[];
  /** Curva de FATURAMENTO, 12 posicoes. */
  curvaFaturamento?: number[];
}

export interface ItemConsumoPlano {
  produto: string;
  corProduto: string;
  codigo: string;
  descricao: string;
  materialTipo: string;
  corMaterial: string;
  consumo: number;
  unid: string;
  faixa: string;
}

export interface MaterialPlano {
  codigoMaterial: string;
  codigoCor: string;
  descricao: string;
  nomeCor: string;
  unidade: string;
  disponivel: number;
}

export interface InsumoCalculado extends ItemConsumoPlano {
  necessario: number;
  disponivel: number;
  semCadastro: boolean;
  atendeLinha: boolean;
  demandaPlano: number;
  saldoPlano: number;
  produtosConcorrentes: number;
  atende: boolean;
}

export interface LinhaCalculada extends LinhaPlano {
  codTamCor: string;
  grupoKey: string;
  grupoLider: boolean;
  semLancamento: boolean;

  projecaoTotal: number;
  vendaDiaria: number;
  estoqueMinimo: number;
  estoqueMaximo: number;
  diasEstoque: number;
  producaoProjetada: number;

  saldo: number;
  estoqueDisponivel: number;
  saldoComLote: number;
  pontoReposicao: number;
  pctProd: number;

  mixSaldo: number;
  mixVenda: number;
  pctVendido: number;
  faltaProduzir: number;

  projVendaPecas: number;
  vendaPecas: number;
  saldoPecas: number;
  faltaProduzirPecas: number;
  /**
   * Semanas de producao que a faccao ainda tem deste produto/cor.
   * A capacidade negociada e SEMANAL, entao falta a produzir / capacidade ja e
   * um numero de semanas — nao uma porcentagem de ocupacao.
   */
  semanas: number;
  /** Semanas somadas de tudo que a faccao ainda tem na fila. */
  semanasFaccao: number;
  /** Semanas que faltam ate o deadline. null quando nao ha deadline. */
  semanasAteDeadline: number | null;
  totalProgramado: number;

  /** Producao projetada acumulada ate o mes, pela curva de producao. */
  fatorProducaoMes: number;
  /** Venda projetada do mes, pela curva de venda. */
  vendaProjetadaMes: number;
  /** Faturamento projetado do mes, pela curva de faturamento. */
  faturamentoProjetadoMes: number;

  /** Flag ATIVO do relatorio 2024 para este tamanho. */
  ativoRelatorio: boolean;
  /**
   * O produto/cor tem ao menos um tamanho ativo no relatorio. Quando tem, a
   * grade inteira aparece na tabela, mesmo os tamanhos marcados como inativos.
   */
  grupoAtivo: boolean;

  /** Codigo e cor do tecido principal (coluna B da planilha). */
  tecidoCor: string;
  /** Saldo do tecido depois de descontar o consumo do plano (coluna C). */
  tecidoDescontaLote: number | null;

  insumos: InsumoCalculado[];
  temEstrutura: boolean;
  insumosAtendem: boolean | null;

  // Sinalizadores dos alertas que o manual pede.
  abaixoMinimo: boolean;
  acimaMaximo: boolean;
  deadlineEstourado: boolean;
  producaoAtrasada: boolean;
}

export function num(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export function divSegura(a: unknown, b: unknown): number {
  const divisor = num(b);
  return divisor ? num(a) / divisor : 0;
}

export function soma<T>(itens: T[], fn: (item: T) => unknown): number {
  return itens.reduce((total, item) => total + num(fn(item)), 0);
}

export function normalizarTexto(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function chaveMaterial(codigo: unknown, cor: unknown): string {
  return `${normalizarTexto(codigo)}|${normalizarTexto(cor)}`;
}

export function chaveProduto(referencia: unknown, cor: unknown): string {
  return `${normalizarTexto(referencia)}|${normalizarTexto(cor)}`;
}

function converterData(texto: string): number | null {
  if (!texto) return null;
  const limpo = String(texto).trim();
  const br = limpo.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}T00:00:00` : /^\d{4}-\d{2}-\d{2}$/.test(limpo) ? `${limpo}T00:00:00` : limpo;
  const tempo = new Date(iso).getTime();
  return Number.isFinite(tempo) ? tempo : null;
}

/** Dias corridos desde a data. null quando a data e invalida ou vazia. */
export function diasDesde(texto: string, agora: number = Date.now()): number | null {
  const tempo = converterData(texto);
  if (tempo === null) return null;
  return Math.max(1, Math.floor((agora - tempo) / 86400000));
}

/** Dias corridos ate a data. null quando a data e invalida ou vazia. */
export function diasAte(texto: string, agora: number = Date.now()): number | null {
  const tempo = converterData(texto);
  if (tempo === null) return null;
  return Math.ceil((tempo - agora) / 86400000);
}

/** `F0` e o codigo do SISPLAN para "vale para todos os tamanhos". */
const FAIXA_TODOS = new Set(["f0", "-t-", "t", "todos", "unico", "u", ""]);

export function faixaAtendeTam(faixa: string, tam: string): boolean {
  const alvo = normalizarTexto(tam);
  const limpa = normalizarTexto(faixa);
  if (FAIXA_TODOS.has(limpa)) return true;
  if (limpa === alvo) return true;

  /*
   * Faixa pode ser uma LISTA de tamanhos separados por espaco ("p m g gg").
   * E como o grupo do SISPLAN (F1, F2, EX) fica guardado: uma linha de consumo
   * com todos os tamanhos que ele cobre, em vez de uma linha por tamanho.
   * Gravar expandido triplicava a tabela de consumo — 11 mil viravam 31 mil — e
   * cada importacao apaga e reinsere tudo, o que estourava a cota de escrita
   * do D1. Aqui a expansao acontece na comparacao, que nao custa nada.
   *
   * Testado antes das faixas com " a "/" ate ", para nao quebrar "26 a 29".
   */
  if (/\s/.test(limpa) && !/ a | ate /.test(limpa)) {
    if (limpa.split(/\s+/).filter(Boolean).includes(alvo)) return true;
  }

  const partes = limpa.split(/[-/;,]| a | ate /).map((p) => p.trim()).filter(Boolean);
  if (partes.includes(alvo)) return true;
  if (partes.length === 2) {
    const inicio = Number(partes[0]);
    const fim = Number(partes[1]);
    const valor = Number(alvo);
    if ([inicio, fim, valor].every(Number.isFinite)) {
      return valor >= Math.min(inicio, fim) && valor <= Math.max(inicio, fim);
    }
  }
  return false;
}

function indexarConsumo(consumo: ItemConsumoPlano[]): Map<string, ItemConsumoPlano[]> {
  const mapa = new Map<string, ItemConsumoPlano[]>();
  for (const item of consumo) {
    const chave = chaveProduto(item.produto, item.corProduto);
    const lista = mapa.get(chave) ?? [];
    lista.push(item);
    mapa.set(chave, lista);
  }
  return mapa;
}

function indexarMateriais(materiais: MaterialPlano[]): Map<string, MaterialPlano> {
  const mapa = new Map<string, MaterialPlano>();
  for (const m of materiais) mapa.set(chaveMaterial(m.codigoMaterial, m.codigoCor), m);
  return mapa;
}

function insumosDaLinha(linha: LinhaPlano, indice: Map<string, ItemConsumoPlano[]>): ItemConsumoPlano[] {
  const porCodigo = indice.get(chaveProduto(linha.referencia, linha.cor)) ?? [];
  const porNome = linha.corNome ? indice.get(chaveProduto(linha.referencia, linha.corNome)) ?? [] : [];
  const base = porCodigo.length ? porCodigo : porNome;
  return base.filter((item) => faixaAtendeTam(item.faixa, linha.tam));
}

interface Demanda {
  necessario: number;
  produtos: Set<string>;
  disponivel: number;
  saldo: number;
  semCadastro: boolean;
}

/**
 * Demanda de cada material somando TODO o plano ativo.
 * Sem isso, dois produtos que usam o mesmo tecido apareceriam ambos como "atende".
 *
 * "Ativo" aqui e as duas coisas ao mesmo tempo: o flag manual da linha
 * (`linha.ativo`) e o flag do produto vindo do relatorio 2024
 * (`grupoAtivoPorChave`, referencia+cor). Um material usado so por produto
 * desativado nao pode aparecer como critico — ele nao vai ser produzido.
 */
export function montarDemanda(
  linhas: LinhaPlano[],
  indiceConsumo: Map<string, ItemConsumoPlano[]>,
  indiceMateriais: Map<string, MaterialPlano>,
  grupoAtivoPorChave: Map<string, boolean> = new Map(),
): Map<string, Demanda> {
  const demanda = new Map<string, Demanda>();
  for (const linha of linhas) {
    if (linha.ativo === false) continue;
    if (grupoAtivoPorChave.get(chaveProduto(linha.referencia, linha.cor)) === false) continue;
    const lote = num(linha.lote);
    if (lote <= 0) continue;
    for (const item of insumosDaLinha(linha, indiceConsumo)) {
      const chave = chaveMaterial(item.codigo, item.corMaterial);
      const atual = demanda.get(chave) ?? {
        necessario: 0,
        produtos: new Set<string>(),
        disponivel: 0,
        saldo: 0,
        semCadastro: false,
      };
      atual.necessario += num(item.consumo) * lote;
      atual.produtos.add(chaveProduto(linha.referencia, linha.cor));
      demanda.set(chave, atual);
    }
  }
  for (const [chave, item] of demanda) {
    const material = indiceMateriais.get(chave);
    item.semCadastro = !material;
    item.disponivel = num(material?.disponivel);
    item.saldo = item.disponivel - item.necessario;
  }
  return demanda;
}

export interface ContextoCalculo {
  consumo?: ItemConsumoPlano[];
  materiais?: MaterialPlano[];
  planejamento?: PlanejamentoProduto[];
  agora?: number;
}

export function calcularPlano(linhas: LinhaPlano[], contexto: ContextoCalculo = {}): LinhaCalculada[] {
  const agora = contexto.agora ?? Date.now();
  const mes = new Date(agora).getMonth() + 1;
  const indiceConsumo = indexarConsumo(contexto.consumo ?? []);
  const indiceMateriais = indexarMateriais(contexto.materiais ?? []);

  const planejamento = new Map<string, PlanejamentoProduto>();
  for (const p of contexto.planejamento ?? []) planejamento.set(chaveProduto(p.referencia, p.cor), p);

  // Primeiro passo: os totais por referencia+cor, que a planilha guarda na linha "-T-".
  const grupos = new Map<string, LinhaPlano[]>();
  for (const linha of linhas) {
    const chave = chaveProduto(linha.referencia, linha.cor);
    const lista = grupos.get(chave) ?? [];
    lista.push(linha);
    grupos.set(chave, lista);
  }

  /**
   * Se o produto/cor tem ao menos um tamanho ativo no relatorio 2024 — regra
   * de produto, nao de tamanho. Calculado antes da demanda porque um material
   * so pode ser critico se algum produto ATIVO realmente for produzi-lo.
   */
  const grupoAtivoPorChave = new Map<string, boolean>();
  for (const [chave, grupo] of grupos) {
    grupoAtivoPorChave.set(chave, grupo.some((l) => l.ativoRelatorio !== false));
  }

  const demanda = montarDemanda(linhas, indiceConsumo, indiceMateriais, grupoAtivoPorChave);

  interface Agregado {
    vendaTotal: number;
    saldoComLoteTotal: number;
    loteTotal: number;
    projecaoTotal: number;
    /** Semanas de producao do produto/cor na faccao. */
    semanas: number;
    projVendaPecas: number;
    vendaPecas: number;
    saldoPecas: number;
    faltaProduzirPecas: number;
    /** O produto/cor tem ao menos um tamanho ativo no relatorio 2024. */
    grupoAtivo: boolean;
    lideres: Set<string>;
  }

  const agregados = new Map<string, Agregado>();
  for (const [chave, grupo] of grupos) {
    const plano = planejamento.get(chave);
    const unidade = num(grupo[0]?.unidade) || 1;
    const capacidade = Math.max(...grupo.map((l) => num(l.capacidade)), 0);

    const vendaTotal = soma(grupo, (l) => l.vendaAcm);
    const saldoComLoteTotal = soma(grupo, (l) => num(l.estoque) + num(l.processo) - num(l.carteira) + num(l.lote));
    const loteTotal = soma(grupo, (l) => l.lote);
    // A projecao total vem da aba LEAD TIME; sem ela, soma o que estiver nas linhas.
    const projecaoTotal = plano && plano.projecaoTotal > 0 ? plano.projecaoTotal : soma(grupo, (l) => l.projVenda);

    // AI/AJ/AK da planilha: unidade x total do grupo, nao da linha.
    const projVendaPecas = unidade * projecaoTotal;
    const vendaPecas = unidade * vendaTotal;
    const saldoPecas = unidade * saldoComLoteTotal;
    const faltaProduzirPecas = Math.max(0, projVendaPecas - vendaPecas - saldoPecas);

    const grupoAtivo = grupoAtivoPorChave.get(chave) ?? true;

    agregados.set(chave, {
      vendaTotal,
      saldoComLoteTotal,
      loteTotal,
      projecaoTotal,
      // AF: IF(falta<0, 0, falta/capacidade). A capacidade e semanal, entao o
      // resultado ja e um numero de semanas de producao.
      semanas: divSegura(faltaProduzirPecas, capacidade),
      projVendaPecas,
      vendaPecas,
      saldoPecas,
      faltaProduzirPecas,
      grupoAtivo,
      lideres: new Set(),
    });
  }

  const calculadas: LinhaCalculada[] = linhas.map((linha) => {
    const chave = chaveProduto(linha.referencia, linha.cor);
    const agregado = agregados.get(chave)!;
    const plano = planejamento.get(chave);
    const grupoLider = agregado.lideres.size === 0;
    agregado.lideres.add(linha.id);

    const dias = diasDesde(linha.lancamento, agora);
    const semLancamento = dias === null;
    // K: venda acumulada / dias desde o lancamento
    const vendaDiaria = semLancamento ? 0 : divSegura(linha.vendaAcm, dias);

    // O lead time da linha vem da LEAD TIME quando existe.
    const leadTime = plano && plano.leadTime > 0 ? plano.leadTime : num(linha.leadTime);

    const saldo = num(linha.estoque) + num(linha.processo) - num(linha.carteira);
    const estoqueDisponivel = num(linha.estoque) - num(linha.carteira);
    const saldoComLote = saldo + num(linha.lote);

    // AA: mix de venda do tamanho dentro da referencia/cor
    const mixVenda = divSegura(linha.vendaAcm, agregado.vendaTotal);
    const mixSaldo = divSegura(saldoComLote, agregado.saldoComLoteTotal);

    // H: projecao total da cor x mix de venda do tamanho.
    // Sem venda registrada ainda nao ha mix, entao vale o que estiver na linha.
    const projVenda =
      plano && plano.projecaoTotal > 0 && agregado.vendaTotal > 0
        ? agregado.projecaoTotal * mixVenda
        : num(linha.projVenda);

    // L: maior entre 30 dias de venda e o lead time de venda
    const estoqueMinimo = Math.max(vendaDiaria * 30, vendaDiaria * leadTime);
    // M: (venda diaria x lead time) x 2
    const estoqueMaximo = vendaDiaria * leadTime * 2;
    // N: estoque disponivel / venda diaria
    const diasEstoque = divSegura(estoqueDisponivel, vendaDiaria);

    // O: ROUNDUP(projecao x curva do mes). Sem curva cadastrada, fica zero.
    const fatorCurva = plano ? num(plano.curva?.[mes - 1]) : 0;
    const producaoProjetada = fatorCurva > 0 ? Math.ceil(projVenda * fatorCurva) : 0;

    // As outras duas curvas nao entram em PRODUCAO PROJETADA: servem para o
    // planejamento de venda e de faturamento do mes.
    const fatorVenda = plano ? num(plano.curvaVenda?.[mes - 1]) : 0;
    const fatorFaturamento = plano ? num(plano.curvaFaturamento?.[mes - 1]) : 0;

    const insumos: InsumoCalculado[] = insumosDaLinha(linha, indiceConsumo).map((item) => {
      const chaveMat = chaveMaterial(item.codigo, item.corMaterial);
      const entrada = demanda.get(chaveMat);
      const material = indiceMateriais.get(chaveMat);
      const necessario = num(item.consumo) * num(linha.lote);
      const disponivel = num(material?.disponivel);
      return {
        ...item,
        necessario,
        disponivel,
        semCadastro: !material,
        atendeLinha: disponivel >= necessario,
        demandaPlano: entrada ? entrada.necessario : necessario,
        saldoPlano: entrada ? entrada.saldo : disponivel - necessario,
        produtosConcorrentes: entrada ? entrada.produtos.size : 1,
        atende: entrada ? entrada.saldo >= 0 : disponivel >= necessario,
      };
    });

    const temEstrutura = insumos.length > 0;
    const comLote = num(linha.lote) > 0;
    // B e C da planilha: o tecido principal do produto e o saldo dele apos o plano.
    const tecido = insumos.find((i) => normalizarTexto(i.materialTipo).startsWith("tec"));

    const faltaProduzir = projVenda - (saldoComLote + num(linha.vendaAcm));
    const prazo = diasAte(linha.deadline, agora);

    return {
      ...linha,
      codTamCor: `${linha.referencia}${linha.tam}${linha.cor}`,
      grupoKey: chave,
      grupoLider,
      semLancamento,

      projecaoTotal: agregado.projecaoTotal,
      projVenda,
      leadTime,
      vendaDiaria,
      estoqueMinimo,
      estoqueMaximo,
      diasEstoque,
      producaoProjetada,

      saldo,
      estoqueDisponivel,
      saldoComLote,
      // V: saldo com lote / venda diaria
      pontoReposicao: divSegura(saldoComLote, vendaDiaria),
      // W: ((venda acm - carteira) + estoque + processo + lote) / projecao
      pctProd: divSegura(
        num(linha.vendaAcm) - num(linha.carteira) + num(linha.estoque) + num(linha.processo) + num(linha.lote),
        projVenda,
      ),

      mixSaldo,
      mixVenda,
      // AB: venda total / projecao total da referencia
      pctVendido: divSegura(agregado.vendaTotal, agregado.projecaoTotal),
      // AC: projecao do tamanho - (saldo com lote + venda acumulada)
      faltaProduzir,

      projVendaPecas: agregado.projVendaPecas,
      vendaPecas: agregado.vendaPecas,
      saldoPecas: agregado.saldoPecas,
      faltaProduzirPecas: agregado.faltaProduzirPecas,
      semanas: agregado.semanas,
      // Preenchido no passo seguinte, quando todas as linhas ja existem.
      semanasFaccao: 0,
      semanasAteDeadline: prazo === null ? null : prazo / 7,
      // AN: soma dos lotes do produto x preco de costura
      totalProgramado: agregado.loteTotal * num(linha.precoCostura),

      fatorProducaoMes: fatorCurva,
      vendaProjetadaMes: fatorVenda > 0 ? Math.round(projVenda * fatorVenda) : 0,
      faturamentoProjetadoMes:
        fatorFaturamento > 0 ? projVenda * fatorFaturamento * num(linha.precoCostura) : 0,

      ativoRelatorio: linha.ativoRelatorio !== false,
      grupoAtivo: agregado.grupoAtivo,

      tecidoCor: tecido ? `${tecido.codigo}-${tecido.corMaterial}` : "",
      tecidoDescontaLote: tecido ? tecido.saldoPlano : null,

      insumos,
      temEstrutura,
      insumosAtendem: !temEstrutura || !comLote ? null : insumos.every((i) => i.atende),

      abaixoMinimo: vendaDiaria > 0 && estoqueDisponivel < estoqueMinimo,
      acimaMaximo: estoqueMaximo > 0 && estoqueDisponivel > estoqueMaximo,
      // A planilha pinta de vermelho quando o deadline passa dos dias de estoque.
      deadlineEstourado: prazo !== null && diasEstoque > 0 && prazo > diasEstoque,
      producaoAtrasada: producaoProjetada > 0 && saldoComLote + num(linha.vendaAcm) < producaoProjetada,
    };
  });

  /**
   * Semanas que cada faccao ainda tem na fila: soma das semanas de cada
   * produto/cor. So o lider do grupo entra, senao cada tamanho somaria de novo
   * a mesma semana.
   */
  const semanasPorFaccao = new Map<string, number>();
  for (const linha of calculadas) {
    if (!linha.grupoLider) continue;
    const chave = normalizarTexto(linha.faccao);
    semanasPorFaccao.set(chave, (semanasPorFaccao.get(chave) ?? 0) + linha.semanas);
  }
  for (const linha of calculadas) {
    linha.semanasFaccao = semanasPorFaccao.get(normalizarTexto(linha.faccao)) ?? 0;
  }

  // A grade sai na ordem da confeccao (PP, P, M, G, GG, ...), nunca alfabetica.
  return calculadas.sort(
    (a, b) =>
      a.referencia.localeCompare(b.referencia, "pt-BR", { numeric: true }) ||
      a.cor.localeCompare(b.cor, "pt-BR", { numeric: true }) ||
      compararTamanho(a.tam, b.tam),
  );
}

/** Lote sugerido para cobrir o minimo e a producao projetada da curva. */
export function sugerirLote(linha: LinhaCalculada): number {
  const paraMinimo = Math.max(0, num(linha.estoqueMinimo) - num(linha.saldo));
  const paraProjecao = Math.max(0, num(linha.producaoProjetada) - num(linha.saldo) - num(linha.vendaAcm));
  return Math.ceil(Math.max(paraMinimo, paraProjecao) / 10) * 10;
}

export function alertasDaLinha(linha: LinhaCalculada, agora: number = Date.now()): string[] {
  const alertas: string[] = [];
  if (linha.semLancamento) alertas.push("Sem data de lancamento: a venda diaria nao pode ser calculada.");
  if (!linha.temEstrutura) alertas.push("Produto sem estrutura de consumo importada.");

  for (const item of linha.insumos) {
    if (item.semCadastro) {
      alertas.push(`${item.descricao}: material ${item.codigo} nao existe no estoque importado.`);
    } else if (!item.atende) {
      const falta = item.demandaPlano - item.disponivel;
      const disputa = item.produtosConcorrentes > 1 ? ` (${item.produtosConcorrentes} produtos disputam)` : "";
      alertas.push(`${item.descricao}: faltam ${falta.toFixed(2)} ${item.unid} para o plano${disputa}.`);
    }
  }

  if (linha.abaixoMinimo) alertas.push("Estoque disponivel abaixo do minimo calculado.");
  if (linha.acimaMaximo) alertas.push("Estoque disponivel acima do maximo: risco de sobra no fim da colecao.");
  if (linha.deadlineEstourado) alertas.push("Os dias de estoque nao cobrem o deadline de producao.");
  if (linha.producaoAtrasada) alertas.push("Producao atrasada em relacao a curva do mes.");
  if (linha.faltaProduzir < 0) alertas.push("O lote atual ultrapassa a projecao de venda.");
  // A capacidade e semanal: comparar semanas de producao com semanas de prazo.
  if (linha.semanasAteDeadline !== null && linha.semanas > linha.semanasAteDeadline) {
    alertas.push(
      `A faccao precisa de ${linha.semanas.toFixed(1)} semana(s) para este produto e faltam ${linha.semanasAteDeadline.toFixed(1)} ate o deadline.`,
    );
  }
  if (!linha.grupoAtivo) alertas.push("Nenhum tamanho deste produto esta ativo no relatorio de produto acabado.");
  return alertas;
}

export interface ResumoDashboard {
  insumosNaoAtendem: number;
  abaixoMinimo: number;
  acimaMaximo: number;
  semEstrutura: number;
  totalLotes: number;
  valorProgramado: number;
  referencias: number;
  risco: Array<{ label: string; detalhe: string; score: number }>;
  materiais: Array<{ label: string; detalhe: string; falta: number }>;
  faccoes: Array<{ label: string; detalhe: string; semanas: number }>;
}

/** Agrega o painel sem contar o mesmo grupo referencia/cor duas vezes. */
/**
 * `limite` corta as listas de risco e de materiais criticos — 10 no
 * dashboard, sem limite (`Infinity`) nas telas de relatorio completo que
 * abrem a partir de cada cartao.
 */
export function montarDashboard(linhas: LinhaCalculada[], limite: number = 10): ResumoDashboard {
  const risco = linhas
    .map((linha) => ({
      label: `${linha.referencia} ${linha.tam} ${linha.cor}`,
      score:
        (linha.insumosAtendem === false ? 3 : 0) +
        (linha.abaixoMinimo ? 2 : 0) +
        (linha.deadlineEstourado ? 2 : 0) +
        (linha.producaoAtrasada ? 1 : 0) +
        (linha.temEstrutura ? 0 : 1) +
        (linha.ativo === false ? 1 : 0),
      detalhe: `${
        linha.insumosAtendem === false ? "Insumo nao atende" : linha.temEstrutura ? "Insumos ok" : "Sem estrutura"
      } | saldo ${Math.round(linha.saldo)} | lote ${Math.round(linha.lote)}`,
    }))
    .filter((i) => i.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);

  /**
   * So entra aqui insumo de produto ativo — regra explicita do PCP: um
   * material usado so por produto desligado nao pode aparecer como critico,
   * porque ele nao vai ser produzido. `demandaPlano`/`saldoPlano` ja vem
   * somado so entre produtos ativos (ver `montarDemanda`); o filtro aqui e
   * so pra nao pegar a entrada de fallback (calculo solo) de uma linha
   * inativa quando nenhum produto ativo usa aquele material.
   */
  const porMaterial = new Map<
    string,
    { label: string; falta: number; demanda: number; disponivel: number; unid: string; produtos: number; semCadastro: boolean }
  >();
  for (const linha of linhas) {
    if (!linha.grupoAtivo || linha.ativo === false) continue;
    for (const item of linha.insumos) {
      const chave = chaveMaterial(item.codigo, item.corMaterial);
      if (porMaterial.has(chave)) continue;
      porMaterial.set(chave, {
        label: `${item.codigo} ${item.descricao}`.trim(),
        falta: Math.max(0, item.demandaPlano - item.disponivel),
        demanda: item.demandaPlano,
        disponivel: item.disponivel,
        unid: item.unid,
        produtos: item.produtosConcorrentes,
        semCadastro: item.semCadastro,
      });
    }
  }

  const materiais = [...porMaterial.values()]
    .filter((i) => i.falta > 0 || i.semCadastro)
    .sort((a, b) => b.falta - a.falta)
    .slice(0, limite)
    .map((i) => ({
      label: i.label,
      detalhe: i.semCadastro
        ? `Sem cadastro no estoque | precisa de ${i.demanda.toFixed(2)} ${i.unid}`
        : `Faltam ${i.falta.toFixed(2)} ${i.unid} | precisa ${i.demanda.toFixed(2)}, tem ${i.disponivel.toFixed(2)} | ${i.produtos} produto(s)`,
      falta: i.falta,
    }));

  // A capacidade negociada com a faccao e semanal, entao o que interessa e
  // quantas semanas de producao ela ainda tem na fila, nao um percentual.
  const porFaccao = new Map<string, { label: string; semanas: number; lote: number; produtos: number }>();
  for (const linha of linhas) {
    const chave = linha.faccao || "";
    const atual = porFaccao.get(chave) ?? { label: linha.faccao || "Sem faccao", semanas: 0, lote: 0, produtos: 0 };
    if (linha.grupoLider) {
      atual.semanas += linha.semanas;
      atual.produtos += 1;
    }
    atual.lote += num(linha.lote);
    porFaccao.set(chave, atual);
  }

  const faccoes = [...porFaccao.values()]
    .sort((a, b) => b.semanas - a.semanas)
    .map((i) => ({
      label: i.label,
      detalhe: `${i.semanas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} semana(s) de producao | ${i.produtos} produto(s) | lote ${Math.round(i.lote)}`,
      semanas: i.semanas,
    }));

  // O valor programado e por produto, nao por linha: contar so o lider evita multiplicar.
  const valorProgramado = soma(linhas.filter((l) => l.grupoLider), (l) => l.totalProgramado);

  return {
    insumosNaoAtendem: linhas.filter((l) => l.insumosAtendem === false).length,
    abaixoMinimo: linhas.filter((l) => l.abaixoMinimo).length,
    acimaMaximo: linhas.filter((l) => l.acimaMaximo).length,
    semEstrutura: linhas.filter((l) => !l.temEstrutura).length,
    totalLotes: soma(linhas, (l) => l.lote),
    valorProgramado,
    referencias: linhas.length,
    risco,
    materiais,
    faccoes,
  };
}
