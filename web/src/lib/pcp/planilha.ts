/**
 * Leitor da PLANILHA PCP (.xlsx) — a planilha que o PCP usa hoje.
 *
 * Traz para o sistema os dados de planejamento que nao existem em nenhum
 * relatorio do SISPLAN: projecao, lead time, curva mensal de producao, faccao,
 * capacidade, preco de costura, lancamento e deadline.
 *
 * Um .xlsx e um ZIP de XML. A descompactacao usa `DecompressionStream`, que ja
 * existe no navegador e no Node, entao nao entra biblioteca nenhuma no projeto.
 *
 * As colunas mudam de posicao entre as planilhas de cada colecao, entao tudo
 * aqui e localizado pelo **nome do cabecalho**, nunca pela letra da coluna.
 */

export interface LinhaPlanilha {
  codTamCor: string;
  referencia: string;
  tam: string;
  cor: string;
  projVenda: number;
  lancamento: string;
  deadline: string;
  lote: number;
  faccao: string;
  capacidade: number;
  unidade: number;
  precoCostura: number;
  obsProduto: string;
}

export interface PlanejamentoProduto {
  referencia: string;
  cor: string;
  linha: string;
  projecaoTotal: number;
  leadTime: number;
  /** Curva de PRODUCAO, 12 posicoes (janeiro a dezembro). */
  curva: number[];
  /** Curva de VENDA, 12 posicoes. */
  curvaVenda: number[];
  /** Curva de FATURAMENTO, 12 posicoes. */
  curvaFaturamento: number[];
}

export interface ResultadoPlanilha {
  programacao: LinhaPlanilha[];
  planejamento: PlanejamentoProduto[];
  avisos: string[];
}

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

interface EntradaZip {
  nome: string;
  comprimido: Uint8Array;
  metodo: number;
}

/** Le o diretorio central do ZIP e devolve as entradas, sem descompactar. */
function lerEntradasZip(bytes: Uint8Array): EntradaZip[] {
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // O fim do diretorio central fica nos ultimos 64 KB, apos um comentario opcional.
  let fim = -1;
  const limite = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= limite; i--) {
    if (visao.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error("Arquivo nao parece um .xlsx valido.");

  let total = visao.getUint16(fim + 10, true);
  let inicio = visao.getUint32(fim + 16, true);

  // ZIP64: quando os campos de 32 bits estouram, o valor real vem do bloco extra.
  if (total === 0xffff || inicio === 0xffffffff) {
    for (let i = fim - 20; i >= 0; i--) {
      if (visao.getUint32(i, true) === 0x07064b50) {
        const zip64 = Number(visao.getBigUint64(i + 8, true));
        total = Number(visao.getBigUint64(zip64 + 32, true));
        inicio = Number(visao.getBigUint64(zip64 + 48, true));
        break;
      }
    }
  }

  const entradas: EntradaZip[] = [];
  let posicao = inicio;
  for (let i = 0; i < total; i++) {
    if (visao.getUint32(posicao, true) !== 0x02014b50) break;
    const metodo = visao.getUint16(posicao + 10, true);
    const tamanhoComprimido = visao.getUint32(posicao + 20, true);
    const tamanhoNome = visao.getUint16(posicao + 28, true);
    const tamanhoExtra = visao.getUint16(posicao + 30, true);
    const tamanhoComentario = visao.getUint16(posicao + 32, true);
    const deslocamento = visao.getUint32(posicao + 42, true);
    const nome = new TextDecoder().decode(bytes.subarray(posicao + 46, posicao + 46 + tamanhoNome));

    // No cabecalho local os campos nome/extra podem ter tamanhos diferentes.
    const nomeLocal = visao.getUint16(deslocamento + 26, true);
    const extraLocal = visao.getUint16(deslocamento + 28, true);
    const dados = deslocamento + 30 + nomeLocal + extraLocal;

    entradas.push({ nome, metodo, comprimido: bytes.subarray(dados, dados + tamanhoComprimido) });
    posicao += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return entradas;
}

async function descomprimir(entrada: EntradaZip): Promise<string> {
  if (entrada.metodo === 0) return new TextDecoder().decode(entrada.comprimido);
  if (entrada.metodo !== 8) throw new Error(`Compressao ${entrada.metodo} nao suportada no .xlsx.`);
  const fluxo = new Blob([entrada.comprimido as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(fluxo).text();
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

function desescapar(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** "AB" -> 28 */
export function indiceColuna(letras: string): number {
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

/** Data serial do Excel para ISO. O Excel conta desde 30/12/1899. */
export function dataDoSerial(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return "";
  const ms = Math.round((valor - 25569) * 86400000);
  const data = new Date(ms);
  if (Number.isNaN(data.getTime())) return "";
  return data.toISOString().slice(0, 10);
}

function numero(valor: string | undefined): number {
  if (valor === undefined || valor === "") return 0;
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

type Linha = Map<number, string>;

function lerLinhas(xml: string, compartilhadas: string[]): Linha[] {
  const linhas: Linha[] = [];
  for (const bruta of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const celulas: Linha = new Map();
    for (const c of bruta[1].matchAll(/<c([^>]*)\/>|<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = c[1] ?? c[2] ?? "";
      const conteudo = c[3] ?? "";
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
      if (!ref) continue;
      const tipo = (attrs.match(/t="([^"]+)"/) || [])[1] ?? "";
      const valor = (conteudo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let texto = "";
      if (tipo === "s" && valor !== undefined) texto = compartilhadas[Number(valor)] ?? "";
      else if (tipo === "inlineStr") texto = desescapar([...conteudo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
      else if (valor !== undefined) texto = desescapar(valor);
      if (texto !== "") celulas.set(indiceColuna(ref), texto);
    }
    if (celulas.size > 0) linhas.push(celulas);
  }
  return linhas;
}

/** Acha a coluna pelo nome do cabecalho, aceitando variacoes de acento e espaco. */
function acharColuna(cabecalho: Linha, ...nomes: string[]): number {
  const normalizar = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  const procurados = nomes.map(normalizar);
  for (const [indice, texto] of cabecalho) {
    if (procurados.includes(normalizar(texto))) return indice;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Leitura da planilha do PCP
// ---------------------------------------------------------------------------

export async function lerPlanilhaPcp(bytes: Uint8Array): Promise<ResultadoPlanilha> {
  const entradas = new Map(lerEntradasZip(bytes).map((e) => [e.nome, e]));
  const avisos: string[] = [];

  const pegar = async (nome: string): Promise<string | null> => {
    const entrada = entradas.get(nome);
    return entrada ? descomprimir(entrada) : null;
  };

  const workbook = await pegar("xl/workbook.xml");
  const rels = await pegar("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw new Error("Nao consegui abrir a planilha: falta o workbook.");

  const alvoPorId = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    alvoPorId.set(m[1], m[2].replace(/^\/?xl\//, "").replace(/^\//, ""));
  }

  const abas = new Map<string, string>();
  for (const m of workbook.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const alvo = alvoPorId.get(m[2]);
    if (alvo) abas.set(desescapar(m[1]).toUpperCase(), `xl/${alvo}`);
  }

  const ssXml = await pegar("xl/sharedStrings.xml");
  const compartilhadas = ssXml
    ? [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        desescapar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
      )
    : [];

  const precoPorReferencia = await lerAbaPrecoFaccao(abas, pegar, compartilhadas);
  const programacao = await lerAbaProgramacao(abas, pegar, compartilhadas, avisos, precoPorReferencia);
  const planejamento = await lerAbaLeadTime(abas, pegar, compartilhadas, avisos);

  return { programacao, planejamento, avisos };
}

async function lerAbaProgramacao(
  abas: Map<string, string>,
  pegar: (nome: string) => Promise<string | null>,
  compartilhadas: string[],
  avisos: string[],
  precoPorReferencia: Map<string, number>,
): Promise<LinhaPlanilha[]> {
  const caminho = abas.get("PROGRAMAÇÃO") ?? abas.get("PROGRAMACAO");
  if (!caminho) {
    avisos.push("A planilha nao tem a aba PROGRAMACAO.");
    return [];
  }
  const xml = await pegar(caminho);
  if (!xml) return [];

  const linhas = lerLinhas(xml, compartilhadas);
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0];
  const cRef = acharColuna(cabecalho, "REFERENCIA", "REF.");
  const cTam = acharColuna(cabecalho, "TAM");
  const cCor = acharColuna(cabecalho, "COR");
  const cCod = acharColuna(cabecalho, "CODTAMCOR");
  const cProj = acharColuna(cabecalho, "PROJ. VENDA", "PROJ.VENDA");
  const cLanc = acharColuna(cabecalho, "LANC.", "LANCAMENTO");
  const cDead = acharColuna(cabecalho, "DEADLINE");
  const cLote = acharColuna(cabecalho, "LOTE");
  const cFaccao = acharColuna(cabecalho, "FACCAO");
  const cCapacidade = acharColuna(cabecalho, "NEGOCIADO / CAPACIDADE", "NEGOCIADO/CAPACIDADE", "CAPACIDADE");
  const cUnidade = acharColuna(cabecalho, "UNIDADE");
  const cPreco = acharColuna(cabecalho, "PRECO COSTURA");
  const cObs = acharColuna(cabecalho, "OBS PRODUTO");

  if (cRef < 0 || cTam < 0 || cCor < 0) {
    avisos.push("A aba PROGRAMACAO nao tem as colunas REFERENCIA, TAM e COR.");
    return [];
  }

  /**
   * Capacidade, unidade e preco de costura ficam na linha "-T-", que e o total
   * do produto/cor. As linhas de tamanho vem vazias nesses campos, entao o
   * valor do total vale para o produto inteiro.
   */
  interface Totais {
    faccao: string;
    capacidade: number;
    unidade: number;
    precoCostura: number;
    obsProduto: string;
  }
  const totaisPorProduto = new Map<string, Totais>();
  for (const linha of linhas.slice(1)) {
    const tam = (linha.get(cTam) ?? "").trim().toUpperCase();
    if (tam !== "-T-") continue;
    const referencia = (linha.get(cRef) ?? "").trim().toUpperCase();
    const cor = (linha.get(cCor) ?? "").trim().toUpperCase();
    if (!referencia || !cor) continue;
    totaisPorProduto.set(`${referencia}|${cor}`, {
      faccao: (linha.get(cFaccao) ?? "").trim().toUpperCase(),
      capacidade: numero(linha.get(cCapacidade)),
      unidade: numero(linha.get(cUnidade)),
      precoCostura: numero(linha.get(cPreco)),
      obsProduto: (linha.get(cObs) ?? "").trim(),
    });
  }

  const saida: LinhaPlanilha[] = [];
  for (const linha of linhas.slice(1)) {
    const referencia = (linha.get(cRef) ?? "").trim().toUpperCase();
    const tam = (linha.get(cTam) ?? "").trim().toUpperCase();
    const cor = (linha.get(cCor) ?? "").trim().toUpperCase();
    if (!referencia || !cor) continue;
    // A linha "-T-" e o total do produto/cor: o sistema recalcula sozinho.
    if (tam === "-T-" || referencia === "TOTAL") continue;

    const total = totaisPorProduto.get(`${referencia}|${cor}`);
    const precoDaTabela = precoPorReferencia.get(referencia) ?? 0;

    saida.push({
      codTamCor: (linha.get(cCod) ?? `${referencia}${tam}${cor}`).trim(),
      referencia,
      tam,
      cor,
      projVenda: numero(linha.get(cProj)),
      lancamento: dataDoSerial(numero(linha.get(cLanc))),
      deadline: dataDoSerial(numero(linha.get(cDead))),
      lote: numero(linha.get(cLote)),
      faccao: (linha.get(cFaccao) ?? "").trim().toUpperCase() || total?.faccao || "",
      capacidade: numero(linha.get(cCapacidade)) || total?.capacidade || 0,
      unidade: numero(linha.get(cUnidade)) || total?.unidade || 1,
      // O preco vem da aba PRECO FACCAO; a linha e o total sao alternativas.
      precoCostura: numero(linha.get(cPreco)) || total?.precoCostura || precoDaTabela,
      obsProduto: (linha.get(cObs) ?? "").trim() || total?.obsProduto || "",
    });
  }
  return saida;
}

async function lerAbaLeadTime(
  abas: Map<string, string>,
  pegar: (nome: string) => Promise<string | null>,
  compartilhadas: string[],
  avisos: string[],
): Promise<PlanejamentoProduto[]> {
  const caminho = abas.get("LEAD TIME") ?? abas.get("LEADTIME");
  if (!caminho) {
    avisos.push("A planilha nao tem a aba LEAD TIME; projecao e curva nao foram importadas.");
    return [];
  }
  const xml = await pegar(caminho);
  if (!xml) return [];

  const linhas = lerLinhas(xml, compartilhadas);
  // O cabecalho da LEAD TIME fica na segunda linha; a primeira traz contadores.
  const cabecalho = linhas.find((l) => acharColuna(l, "REF.") > 0) ?? linhas[1] ?? linhas[0];
  if (!cabecalho) return [];

  const cRef = acharColuna(cabecalho, "REF.", "REFERENCIA");
  const cCor = acharColuna(cabecalho, "COR");
  const cLinha = acharColuna(cabecalho, "LINHA");
  const cProj = acharColuna(cabecalho, "PROJECAO");
  const cLead = acharColuna(cabecalho, "MEDIA ARITMETICA", "LEAD TIME");
  if (cRef < 0 || cCor < 0) {
    avisos.push("A aba LEAD TIME nao tem as colunas REF. e COR.");
    return [];
  }

  const blocos = acharBlocosDeCurva(linhas, avisos);

  const saida: PlanejamentoProduto[] = [];
  for (const linha of linhas) {
    const referencia = (linha.get(cRef) ?? "").trim().toUpperCase();
    const cor = (linha.get(cCor) ?? "").trim().toUpperCase();
    if (!referencia || !cor || referencia === "REF." || referencia === "REFERENCIA") continue;

    // A aba tem tres blocos de 12 meses, um por curva. O rotulo de cada bloco
    // fica na linha de titulo, exatamente na coluna de janeiro.
    const doBloco = (inicio: number): number[] => {
      const valores: number[] = [];
      for (let mes = 0; mes < 12; mes++) valores.push(numero(linha.get(inicio + mes)));
      return valores;
    };
    const curva = doBloco(blocos.producao);
    const curvaVenda = doBloco(blocos.venda);
    const curvaFaturamento = doBloco(blocos.faturamento);

    // A projecao as vezes esta na coluna LINHA, quando a planilha foi remontada.
    const projecaoNaColuna = numero(linha.get(cProj));
    const textoLinha = (linha.get(cLinha) ?? "").trim();
    const projecaoNaLinha = numero(textoLinha);
    const linhaEhNumero = textoLinha !== "" && projecaoNaLinha > 0;

    saida.push({
      referencia,
      cor,
      linha: linhaEhNumero ? "" : textoLinha,
      projecaoTotal: projecaoNaColuna > 0 ? projecaoNaColuna : projecaoNaLinha,
      leadTime: numero(linha.get(cLead)),
      curva,
      curvaVenda,
      curvaFaturamento,
    });
  }
  return saida;
}

/**
 * Posicao de janeiro em cada uma das tres curvas da aba LEAD TIME.
 *
 * A aba tem tres blocos de 12 colunas, com o titulo do bloco na linha acima,
 * na propria coluna de janeiro: PROJECAO DE VENDA, PROJECAO PRODUCAO e
 * PROJECAO DE FATURAMENTO. Nas planilhas de hoje isso cai em 10, 22 e 34, que
 * bate com o VLOOKUP(..., 21 + MES) que a planilha usa para a producao. Os
 * numeros ficam como reserva caso o titulo seja apagado.
 */
function acharBlocosDeCurva(
  linhas: Linha[],
  avisos: string[],
): { venda: number; producao: number; faturamento: number } {
  const padrao = { venda: 10, producao: 22, faturamento: 34 };
  const achados = { ...padrao };
  let encontrou = false;

  for (const linha of linhas.slice(0, 4)) {
    const venda = acharColuna(linha, "PROJECAO DE VENDA", "PROJECAO VENDA");
    const producao = acharColuna(linha, "PROJECAO PRODUCAO", "PROJECAO DE PRODUCAO");
    const faturamento = acharColuna(linha, "PROJECAO DE FATURAMENTO", "PROJECAO FATURAMENTO");
    if (producao > 0 || venda > 0 || faturamento > 0) {
      if (venda > 0) achados.venda = venda;
      if (producao > 0) achados.producao = producao;
      if (faturamento > 0) achados.faturamento = faturamento;
      encontrou = true;
      break;
    }
  }

  if (!encontrou) {
    avisos.push("Nao achei os titulos das curvas na LEAD TIME; usei as colunas padrao (10, 22 e 34).");
  }
  return achados;
}

/**
 * Aba PRECO FACCAO: o preco de costura por referencia. A planilha busca esse
 * valor com VLOOKUP a partir da referencia, entao a tabela e a fonte oficial.
 */
async function lerAbaPrecoFaccao(
  abas: Map<string, string>,
  pegar: (nome: string) => Promise<string | null>,
  compartilhadas: string[],
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  const caminho = abas.get("PREÇO FACÇÃO") ?? abas.get("PRECO FACCAO");
  if (!caminho) return mapa;

  const xml = await pegar(caminho);
  if (!xml) return mapa;

  for (const linha of lerLinhas(xml, compartilhadas)) {
    const referencia = (linha.get(1) ?? "").trim().toUpperCase();
    const preco = numero(linha.get(2));
    if (!referencia || preco <= 0) continue;
    if (!mapa.has(referencia)) mapa.set(referencia, preco);
  }
  return mapa;
}
