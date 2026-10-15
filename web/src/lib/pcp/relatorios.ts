/**
 * Leitura dos relatorios do SISPLAN.
 *
 * Tudo aqui e funcao pura: recebe os bytes de um arquivo e devolve dados
 * prontos. Nao usa DOM, nao usa rede e nao usa nada do Cloudflare, entao roda
 * igual no navegador, no Worker e no `node --test`.
 *
 * Particularidades dos arquivos, medidas nos exports reais de 24-08-2026:
 *  - codificacao Windows-1252 (ANSI), nao UTF-8
 *  - separador `;` e decimal com virgula
 *  - o relatorio 721 traz ~97% de linhas zeradas
 *  - o relatorio 2252 nao diz em nenhuma coluna a qual cor de produto pertence:
 *    isso so existe no nome do arquivo, no padrao `PRODUTO-COR.csv`
 */

export type TipoRelatorio =
  | "MOVIMENTO"
  | "ESTOQUE_MATERIAL"
  | "ESTOQUE_PRODUTO"
  | "CONSUMO"
  | "PEDIDOS"
  | "PRODUTOS_PEDIDO"
  | "ORDENS_PENDENTES";

export interface Csv {
  cabecalho: string[];
  linhas: string[][];
  indice(nome: string): number;
}

export interface Resumo {
  lidas: number;
  aproveitadas: number;
  descartadas: number;
  avisos: string[];
}

export interface Movimento {
  colecao: string;
  referencia: string;
  cor: string;
  tam: string;
  estoque: number;
  processo: number;
  carteira: number;
  vendaAcm: number;
}

export interface MaterialEstoque {
  codigoMaterial: string;
  codigoCor: string;
  descricao: string;
  nomeCor: string;
  unidade: string;
  quantidade: number;
  reservado: number;
  disponivel: number;
  grupo: string;
  descGrupo: string;
  /** Quantas linhas do relatorio foram somadas nesta, uma por deposito. */
  linhasSomadas: number;
  /** Depositos de onde o saldo veio, para conferencia. */
  depositos: string;
}

export interface ProdutoAcabado {
  referencia: string;
  descricao: string;
  colecao: string;
  colecaoNome: string;
  cor: string;
  corNome: string;
  tam: string;
  quantidade: number;
  ativo: boolean;
  dtEntrada: string;
  dias: number;
  linha: string;
  marca: string;
}

export interface ItemConsumo {
  produto: string;
  corProduto: string;
  codigo: string;
  descricao: string;
  materialTipo: string;
  corMaterial: string;
  corMaterialNome: string;
  consumo: number;
  unid: string;
  faixa: string;
  aplicacao: string;
}

/** Marca usada pelo SISPLAN para dizer que o material nao entra nesta cor. */
const NAO_USA = "*****";

/** Valores de CORES_C que significam "material sem variacao de cor". */
const SEM_COR = new Set(["", "0", "-", "000000"]);

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Os exports do SISPLAN sao Windows-1252. Ler como UTF-8 transforma
 * "PECA" acentuado em texto quebrado, entao a decodificacao e explicita.
 */
export function decodificarCsv(bytes: ArrayBuffer | Uint8Array): string {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const comBom = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  if (comBom) {
    return new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "");
  }
  const comoUtf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  // O caractere de substituicao denuncia que o arquivo nao era UTF-8.
  if (!comoUtf8.includes("�")) return comoUtf8;
  return new TextDecoder("windows-1252").decode(buffer);
}

export function detectarSeparador(cabecalho: string): string {
  const pontoEVirgula = (cabecalho.match(/;/g) || []).length;
  const virgula = (cabecalho.match(/,/g) || []).length;
  return pontoEVirgula >= virgula ? ";" : ",";
}

export function separarLinha(linha: string, separador: string): string[] {
  const saida: string[] = [];
  let celula = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (c === '"' && linha[i + 1] === '"') {
      celula += '"';
      i += 1;
    } else if (c === '"') {
      aspas = !aspas;
    } else if (c === separador && !aspas) {
      saida.push(celula);
      celula = "";
    } else {
      celula += c;
    }
  }
  saida.push(celula);
  return saida.map((valor) => valor.trim());
}

/**
 * Separa o texto inteiro em registros, respeitando aspas que atravessam
 * quebras de linha.
 *
 * O PEDIDOS-2710 tem um campo de observacao livre (`Obs`/`ObsPed`) que o
 * SISPLAN exporta com `\n` de verdade dentro das aspas — texto como:
 *
 *   "...;"* ACEITA PEDIDO PARCIAL *\n\nFATURAR E 14/09/26\n...";...
 *
 * Dividir por `\n` antes de olhar as aspas (como `separarLinha` faz por
 * linha) quebraria esse pedido em varias linhas soltas, deslocando toda
 * coluna depois da observacao. Aqui a leitura e caractere a caractere no
 * texto inteiro, e so vira quebra de registro o `\n`/`\r\n` que estiver
 * *fora* de aspas.
 *
 * IMPORTANTE — aspa solta nao pode engolir o arquivo. O ESTOQUE MATERIA
 * PRIMA-2120 traz aspas avulsas no meio de campos (`...;";0;0000;GERAL;";`),
 * que NAO sao aspas de verdade do CSV, e sim sujeira do proprio SISPLAN.
 * Um leitor que so alterna um `aspas = !aspas` a cada `"` entra em "modo
 * aspas" nessa sujeira e nunca mais sai: o resto do arquivo inteiro vira
 * UM campo so. Foi exatamente isso que aconteceu — uma linha do banco ficou
 * com 230 KB de CSV cru dentro do codigo do material, e a tela de Estoque
 * mostrava essa parede de texto no lugar da tabela.
 *
 * A regra abaixo e a que os leitores de CSV tolerantes usam: `"` so abre
 * campo se vier no COMECO dele, e so fecha se o proximo caractere for
 * separador, quebra de linha ou fim do texto. Fora disso e caractere comum.
 * Assim o 2710 continua lendo observacao com quebra de linha dentro de
 * aspas, e a sujeira do 2120 fica contida no campo dela.
 */
/**
 * Ha uma aspa que fecha este campo daqui pra frente? Serve para decidir se um
 * `"` no comeco de campo abre mesmo um campo com aspas ou e sujeira solta.
 *
 * A busca e limitada (`LIMITE`) de proposito: o campo legitimo com aspas e
 * quebra de linha dentro (a observacao do 2710) tem algumas centenas de
 * caracteres. Sem limite, um arquivo de 57 MB cheio de aspas soltas faria
 * esta varredura rodar do inicio ao fim a cada aspa.
 */
function temFechamento(texto: string, inicio: number, separador: string): boolean {
  const LIMITE = 8192;
  const fim = Math.min(texto.length, inicio + LIMITE);
  for (let j = inicio; j < fim; j += 1) {
    if (texto[j] !== '"') continue;
    if (texto[j + 1] === '"') {
      j += 1; // aspa escapada, nao fecha
      continue;
    }
    const depois = texto[j + 1];
    if (depois === undefined || depois === separador || depois === "\n" || depois === "\r") return true;
  }
  return false;
}

function dividirRegistros(texto: string, separador: string): string[][] {
  const registros: string[][] = [];
  let campo = "";
  let registro: string[] = [];
  let aspas = false;

  const fecharCampo = () => {
    registro.push(campo.trim());
    campo = "";
  };
  const fecharRegistro = () => {
    fecharCampo();
    if (registro.length > 1 || registro[0] !== "") registros.push(registro);
    registro = [];
  };

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === '"' && aspas && texto[i + 1] === '"') {
      // Aspas duplicadas dentro de campo com aspas: uma aspa literal.
      campo += '"';
      i += 1;
    } else if (c === '"' && aspas) {
      const proximo = texto[i + 1];
      // So fecha se o campo realmente acabou aqui; senao e aspa solta.
      if (proximo === undefined || proximo === separador || proximo === "\n" || proximo === "\r") aspas = false;
      else campo += c;
    } else if (c === '"' && !aspas && campo === "") {
      const proximo = texto[i + 1];
      // `";` / `"` no fim da linha: aspa solta, nao campo com aspas. E, mesmo
      // com conteudo depois, so abre se existir uma aspa que feche de fato.
      if (proximo === undefined || proximo === separador || proximo === "\n" || proximo === "\r") campo += c;
      else if (temFechamento(texto, i + 1, separador)) aspas = true;
      else campo += c;
    } else if (c === separador && !aspas) {
      fecharCampo();
    } else if ((c === "\n" || c === "\r") && !aspas) {
      if (c === "\r" && texto[i + 1] === "\n") i += 1;
      fecharRegistro();
    } else {
      // Inclui a aspa solta no meio do campo, que vira caractere comum.
      campo += c;
    }
  }
  if (campo !== "" || registro.length > 0) fecharRegistro();
  return registros;
}

export function lerCsv(bytes: ArrayBuffer | Uint8Array): Csv {
  const texto = decodificarCsv(bytes);
  const primeiraLinha = texto.slice(0, texto.search(/\r?\n/) + 1 || texto.length).split(/\r?\n/)[0] ?? "";
  if (primeiraLinha.trim() === "") {
    return { cabecalho: [], linhas: [], indice: () => -1 };
  }
  const separador = detectarSeparador(primeiraLinha);
  const registros = dividirRegistros(texto, separador);
  if (registros.length === 0) {
    return { cabecalho: [], linhas: [], indice: () => -1 };
  }
  const cabecalho = registros[0].map((c) => c.toUpperCase());
  const mapa = new Map<string, number>();
  cabecalho.forEach((nome, i) => {
    if (!mapa.has(nome)) mapa.set(nome, i);
  });
  return {
    cabecalho,
    linhas: registros.slice(1),
    indice: (nome: string) => mapa.get(nome.toUpperCase()) ?? -1,
  };
}

/** Numero no padrao brasileiro: "1.234,56" e "0,2162". */
export function numeroBr(valor: string | number | undefined | null): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor ?? "").trim();
  if (texto === "") return 0;
  const limpo = texto.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

function celula(linha: string[], posicao: number): string {
  if (posicao < 0) return "";
  return (linha[posicao] ?? "").trim().replace(/^"|"$/g, "");
}

function primeiroIndice(csv: Csv, nomes: string[]): number {
  for (const nome of nomes) {
    const i = csv.indice(nome);
    if (i >= 0) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Identificacao
// ---------------------------------------------------------------------------

/** Descobre o tipo do relatorio pelas colunas, sem depender do nome da pasta. */
export function identificarRelatorio(csv: Csv): TipoRelatorio | null {
  const tem = (nome: string) => csv.indice(nome) >= 0;
  /* Antes do ESTOQUE_PRODUTO de proposito: o 3011 tambem tem DESCCOL, e sem
     esta linha cairia na regra de baixo se um dia ganhar uma coluna DESCCOR. */
  if (tem("FAC_NUMERO") && tem("FAC_QUANT_PEND")) return "ORDENS_PENDENTES";
  if (tem("QTDE_ESTOQUE") && tem("PRODUCAO_PENDENTE")) return "MOVIMENTO";
  if (tem("CORES_C") && tem("CONSUMO")) return "CONSUMO";
  if (tem("QTDE_RES") && tem("MAT_LOTE")) return "ESTOQUE_MATERIAL";
  if (tem("DESCCOL") && tem("DESCCOR")) return "ESTOQUE_PRODUTO";
  if (tem("CODCLI") && tem("DT_EMISSAO")) return "PEDIDOS";
  if (tem("QTDE. PED.") && tem("QTDE. EXP.")) return "PRODUTOS_PEDIDO";
  return null;
}

/**
 * A data do arquivo. Aceita o padrao atual `24-08-2026.csv` e tambem
 * `2026-08-24.csv`, que e o formato sugerido por ordenar sozinho.
 */
export function dataDoNome(nomeArquivo: string): string | null {
  const nome = nomeArquivo.replace(/\.csv$/i, "");
  const iso = nome.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = nome.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

/**
 * Produto e cor do arquivo de consumo. O SISPLAN nao poe a cor do produto em
 * nenhuma coluna do 2252, entao o nome do arquivo e a unica fonte.
 */
export function produtoCorDoNome(nomeArquivo: string): { produto: string; cor: string } | null {
  const nome = nomeArquivo.replace(/\.csv$/i, "").trim();
  const separado = nome.match(/^(.+?)-([^-]+)$/);
  if (!separado) return null;
  return { produto: separado[1].toUpperCase(), cor: separado[2].toUpperCase() };
}

// ---------------------------------------------------------------------------
// 721 - estoque, producao e venda por item
// ---------------------------------------------------------------------------

/**
 * Guarda so as linhas com algum movimento. Nos arquivos reais isso derruba
 * 102.590 linhas para cerca de 3.500.
 */
export function lerMovimento(bytes: ArrayBuffer | Uint8Array, colecao = ""): { itens: Movimento[]; resumo: Resumo } {
  const csv = lerCsv(bytes);
  const iCodigo = primeiroIndice(csv, ["CODIGO", "REFERENCIA", "PRODUTO"]);
  const iCor = primeiroIndice(csv, ["COR", "CODIGOCOR"]);
  const iTam = primeiroIndice(csv, ["TAM", "TAMANHO"]);
  const iEstoque = primeiroIndice(csv, ["QTDE_ESTOQUE", "ESTOQUE"]);
  const iProcesso = primeiroIndice(csv, ["PRODUCAO_PENDENTE", "PROCESSO"]);
  const iCarteira = primeiroIndice(csv, ["QTDE_VENDA", "CARTEIRA"]);
  const iVenda = primeiroIndice(csv, ["QTDE_VENDIDA", "VENDA_ACM"]);

  const itens: Movimento[] = [];
  const avisos: string[] = [];
  if (iCodigo < 0 || iTam < 0) {
    avisos.push("O arquivo nao tem as colunas CODIGO e TAM; nada foi importado.");
    return { itens, resumo: { lidas: csv.linhas.length, aproveitadas: 0, descartadas: csv.linhas.length, avisos } };
  }

  for (const linha of csv.linhas) {
    const estoque = numeroBr(celula(linha, iEstoque));
    const processo = numeroBr(celula(linha, iProcesso));
    const carteira = numeroBr(celula(linha, iCarteira));
    const vendaAcm = numeroBr(celula(linha, iVenda));
    if (estoque === 0 && processo === 0 && carteira === 0 && vendaAcm === 0) continue;

    const referencia = celula(linha, iCodigo).toUpperCase();
    if (!referencia) continue;
    itens.push({
      colecao,
      referencia,
      cor: celula(linha, iCor).toUpperCase(),
      tam: celula(linha, iTam).toUpperCase(),
      estoque,
      processo,
      carteira,
      vendaAcm,
    });
  }

  return {
    itens,
    resumo: {
      lidas: csv.linhas.length,
      aproveitadas: itens.length,
      descartadas: csv.linhas.length - itens.length,
      avisos,
    },
  };
}

// ---------------------------------------------------------------------------
// 2120 - estoque de materia-prima
// ---------------------------------------------------------------------------

/**
 * O 2120 traz uma linha por material + cor + **deposito**, e as vezes por lote.
 * O mesmo tecido chega a aparecer em 217 linhas. Guardar so a ultima destruiria
 * o saldo: o THERMO FINE branco cairia de 2.386 KG para 4,25 KG. Por isso as
 * quantidades sao somadas por material e cor.
 *
 * Somar todos os depositos e o padrao. Se algum deposito nao valer como estoque
 * disponivel, o filtro entra aqui.
 */
export function lerEstoqueMaterial(bytes: ArrayBuffer | Uint8Array): { itens: MaterialEstoque[]; resumo: Resumo } {
  const csv = lerCsv(bytes);
  const iCodigo = csv.indice("CODIGO");
  const iMaterial = csv.indice("MATERIAL");
  const iCor = csv.indice("COR");
  const iDescCor = csv.indice("DESC_COR");
  const iUnidade = csv.indice("UNIDADE");
  const iQtde = csv.indice("QTDE");
  const iReservado = csv.indice("QTDE_RES");
  const iDisponivel = csv.indice("SALDO_MENOS_RES");
  const iGrupo = csv.indice("GRUPO");
  const iDescGrupo = csv.indice("DESC_GRUPO");
  const iDeposito = csv.indice("DESDEP");

  const porChave = new Map<string, MaterialEstoque>();
  const depositos = new Map<string, Set<string>>();
  let comSaldo = 0;

  for (const linha of csv.linhas) {
    const codigoMaterial = celula(linha, iCodigo).toUpperCase();
    if (!codigoMaterial) continue;
    const quantidade = numeroBr(celula(linha, iQtde));
    const reservado = numeroBr(celula(linha, iReservado));
    // Sem saldo e sem reserva o material nao muda nenhuma decisao de PCP.
    if (quantidade === 0 && reservado === 0) continue;
    comSaldo += 1;

    const codigoCor = celula(linha, iCor).toUpperCase();
    const chave = `${codigoMaterial}|${codigoCor}`;
    const disponivelBruto = celula(linha, iDisponivel);
    const disponivel = disponivelBruto === "" ? quantidade - reservado : numeroBr(disponivelBruto);

    const existente = porChave.get(chave);
    if (existente) {
      existente.quantidade += quantidade;
      existente.reservado += reservado;
      existente.disponivel += disponivel;
      existente.linhasSomadas += 1;
    } else {
      porChave.set(chave, {
        codigoMaterial,
        codigoCor,
        descricao: celula(linha, iMaterial),
        nomeCor: celula(linha, iDescCor),
        unidade: celula(linha, iUnidade) || "UN",
        quantidade,
        reservado,
        disponivel,
        grupo: celula(linha, iGrupo),
        descGrupo: celula(linha, iDescGrupo),
        linhasSomadas: 1,
        depositos: "",
      });
    }

    const nomeDeposito = celula(linha, iDeposito);
    if (nomeDeposito) {
      if (!depositos.has(chave)) depositos.set(chave, new Set());
      depositos.get(chave)!.add(nomeDeposito);
    }
  }

  const itens = [...porChave.entries()].map(([chave, item]) => ({
    ...item,
    depositos: [...(depositos.get(chave) ?? [])].sort().join(", "),
  }));

  const somados = comSaldo - itens.length;
  const avisos: string[] = [];
  if (somados > 0) {
    avisos.push(`${somados} linha(s) de deposito somadas em ${itens.length} material(is).`);
  }

  return {
    itens,
    resumo: {
      lidas: csv.linhas.length,
      aproveitadas: itens.length,
      descartadas: csv.linhas.length - comSaldo,
      avisos,
    },
  };
}

// ---------------------------------------------------------------------------
// 2024 - estoque de produto acabado (unica fonte da colecao)
// ---------------------------------------------------------------------------

export function lerEstoqueProduto(bytes: ArrayBuffer | Uint8Array): { itens: ProdutoAcabado[]; resumo: Resumo } {
  const csv = lerCsv(bytes);
  const iCodigo = csv.indice("CODIGO");
  const iDescricao = csv.indice("DESCRICAO");
  const iCol = csv.indice("COL");
  const iDescCol = csv.indice("DESCCOL");
  const iCor = csv.indice("COR");
  const iDescCor = csv.indice("DESCCOR");
  const iTam = csv.indice("TAM");
  const iQtde = csv.indice("QTDE");
  const iAtivo = csv.indice("ATIVO");
  const iDtEntrada = csv.indice("DT_ENTRADA");
  const iDias = csv.indice("DIAS");
  const iLinha = csv.indice("DESC_LINHA");
  const iMarca = csv.indice("DESCMARC");

  const itens: ProdutoAcabado[] = [];
  for (const linha of csv.linhas) {
    const referencia = celula(linha, iCodigo).toUpperCase();
    if (!referencia) continue;
    const ativo = celula(linha, iAtivo).toUpperCase();
    itens.push({
      referencia,
      descricao: celula(linha, iDescricao),
      colecao: celula(linha, iCol),
      colecaoNome: celula(linha, iDescCol),
      cor: celula(linha, iCor).toUpperCase(),
      corNome: celula(linha, iDescCor),
      tam: celula(linha, iTam).toUpperCase(),
      quantidade: numeroBr(celula(linha, iQtde)),
      ativo: ativo !== "N" && ativo !== "0" && ativo !== "NAO",
      dtEntrada: celula(linha, iDtEntrada),
      dias: numeroBr(celula(linha, iDias)),
      linha: celula(linha, iLinha),
      marca: celula(linha, iMarca),
    });
  }

  return {
    itens,
    resumo: {
      lidas: csv.linhas.length,
      aproveitadas: itens.length,
      descartadas: csv.linhas.length - itens.length,
      avisos: [],
    },
  };
}

// ---------------------------------------------------------------------------
// 2252 - consumo por produto e cor
// ---------------------------------------------------------------------------

/**
 * A cor do insumo ja vem resolvida na coluna CORES_C, para a cor de produto a
 * que o arquivo pertence. As colunas CORES_P / CORES_I / DESC_CORES_I repetem
 * as 24 cores do produto em listas paralelas e servem so para o nome da cor.
 *
 * `nomeArquivo` precisa seguir o padrao `PRODUTO-COR.csv`, porque nenhuma
 * coluna do arquivo diz de qual cor de produto ele e.
 */
/**
 * Uma entrada de `CORES_I`/`CORES_C`, ja separada das vizinhas.
 *
 * O SISPLAN separa por "|", mas o NOME da cor pode conter "|" — cor de duas
 * tonalidades vem como "PRETO | BRANCO". Dividir no pipe cru quebrava o
 * alinhamento com `CORES_P` e trocava a cor do insumo de lugar, em silencio.
 *
 * A regra que funciona: uma entrada NOVA sempre comeca com `codigo -` (ou so
 * `-`, ou `***** -`). Pedaco que nao casa com isso e continuacao do nome
 * anterior. Conferido nas 3.356 linhas do arquivo real: reconstroi exatamente
 * a mesma quantidade de cores que `CORES_P` lista, em todas.
 */
const INICIO_ENTRADA_COR = /^\s*(?:-\s*$|[A-Za-z0-9._*]+\s*-)/;

/**
 * Abre o codigo de faixa nos tamanhos que ele representa.
 *
 * `FAIXA` as vezes nao e um tamanho, e sim um GRUPO: `F1`, `F2`, `EX`. Quem
 * diz os tamanhos de verdade e `DescFaixa` — `EX` vira `EX1`, `EX2`, `EX3`,
 * numa linha do CSV para cada um. Como `faixaAtendeTam` compara com o tamanho
 * da grade, `F1` nunca casava com `P` e o material simplesmente sumia da
 * conta: ~390 das 3.356 linhas do arquivo real, materiais que nunca entravam
 * na demanda.
 *
 * `F0` fica como esta: ja significa "todos os tamanhos" para `faixaAtendeTam`,
 * e abrir em 16 linhas so incharia o banco sem mudar o resultado.
 */
export function abrirFaixa(faixa: string, descFaixa: string): string[] {
  const codigo = String(faixa ?? "").trim().toUpperCase();
  const tamanhos = String(descFaixa ?? "")
    .split(/\s+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  if (!codigo) return tamanhos.length > 0 ? tamanhos : ["F0"];
  // F0 e afins ja valem para tudo; nao precisa abrir.
  if (FAIXA_VALE_TUDO.has(codigo.toLowerCase())) return [codigo];
  // Sem DescFaixa nao ha o que abrir.
  if (tamanhos.length === 0) return [codigo];
  /*
   * O codigo estar entre os tamanhos significa que ele JA e um tamanho
   * ("M" com DescFaixa "M"). Nao estando, e um grupo — e vale tanto para
   * "F1" com oito tamanhos quanto para "EX" com um so ("EX1"), que era o
   * caso que escapava quando eu olhava so a quantidade.
   */
  return tamanhos.includes(codigo) ? [codigo] : tamanhos;
}

/** Espelha `FAIXA_TODOS` de `lib/calc.ts` — la e que a regra e aplicada. */
const FAIXA_VALE_TUDO = new Set(["f0", "-t-", "t", "todos", "unico", "u", ""]);

export function dividirEntradasCores(texto: string): string[] {
  const partes = String(texto ?? "").split("|");
  const saida: string[] = [];
  for (const parte of partes) {
    if (saida.length === 0 || INICIO_ENTRADA_COR.test(parte)) saida.push(parte);
    else saida[saida.length - 1] += `|${parte}`;
  }
  return saida;
}

/** Separa `5502100001-BRANCO` em codigo e nome. */
export function separarCorInsumo(entrada: string): { codigo: string; nome: string } {
  const texto = String(entrada ?? "").trim();
  const corte = texto.indexOf("-");
  if (corte < 0) return { codigo: texto.toUpperCase(), nome: "" };
  return {
    codigo: texto.slice(0, corte).trim().toUpperCase(),
    nome: texto.slice(corte + 1).trim(),
  };
}

/**
 * Consumo no formato consolidado: um arquivo so, com o produto na linha e as
 * cores dele espalhadas nas colunas `CORES_P` / `CORES_I`.
 *
 * Antes vinha um arquivo por produto E cor, e a cor so existia no nome do
 * arquivo. Agora cada linha vale para varias cores de uma vez, e a cor do
 * insumo de cada uma sai da posicao correspondente em `CORES_I`. Uma linha do
 * CSV vira, portanto, varios itens — um por cor em que o material entra.
 */
function lerConsumoConsolidado(csv: Csv): { itens: ItemConsumo[]; resumo: Resumo; consolidado: true } {
  const iProduto = csv.indice("PRODUTO");
  const iCodigo = csv.indice("CODIGO");
  const iDescricao = csv.indice("DESCRICAO");
  const iConsumo = csv.indice("CONSUMO");
  const iUnid = csv.indice("UNID");
  const iFaixa = csv.indice("FAIXA");
  const iAplicacao = csv.indice("APLICACAO");
  const iGrupo = csv.indice("GRUPO");
  const iCoresP = csv.indice("CORES_P");
  const iCoresI = csv.indice("CORES_I");
  const iDescFaixa = csv.indice("DESCFAIXA");

  const itens: ItemConsumo[] = [];
  const avisos: string[] = [];
  let naoUsados = 0;
  let semAlinhamento = 0;
  let faixasAbertas = 0;

  for (const linha of csv.linhas) {
    const codigo = celula(linha, iCodigo).toUpperCase();
    const produto = celula(linha, iProduto).toUpperCase();
    if (!codigo || !produto) continue;

    const cores = celula(linha, iCoresP).split(/\s+/).filter(Boolean);
    if (cores.length === 0) continue;

    const entradas = dividirEntradasCores(celula(linha, iCoresI));
    /*
     * Se as contas nao baterem, nao da para saber qual cor do insumo pertence
     * a qual cor do produto — e chutar aqui viraria demanda de material
     * errada, sem ninguem perceber. Melhor perder a linha e avisar.
     */
    if (entradas.length !== cores.length) {
      semAlinhamento += 1;
      continue;
    }

    const descricao = celula(linha, iDescricao);
    const materialTipo = celula(linha, iGrupo).toUpperCase();
    const consumo = numeroBr(celula(linha, iConsumo));
    const unid = celula(linha, iUnid) || "UN";
    const aplicacao = celula(linha, iAplicacao);
    const faixas = abrirFaixa(celula(linha, iFaixa), celula(linha, iDescFaixa));
    if (faixas.length > 1) faixasAbertas += 1;

    for (let i = 0; i < cores.length; i += 1) {
      const { codigo: corCodigo, nome: corNome } = separarCorInsumo(entradas[i]);
      if (corCodigo === NAO_USA) {
        // O material nao entra nesta cor do produto.
        naoUsados += 1;
        continue;
      }
      itens.push({
        produto,
        corProduto: cores[i].toUpperCase(),
        codigo,
        descricao,
        materialTipo,
        corMaterial: SEM_COR.has(corCodigo) ? "" : corCodigo,
        corMaterialNome: corNome,
        consumo,
        unid,
        /*
         * Grupo de tamanhos vira uma LISTA numa linha so ("P M G GG"), nao
         * uma linha por tamanho. `faixaAtendeTam` entende a lista na hora de
         * comparar. Expandir aqui triplicava a tabela (11 mil -> 31 mil) e,
         * como cada importacao apaga e reinsere tudo, era o que mais pesava na
         * cota de escrita do D1.
         */
        faixa: faixas.join(" "),
        aplicacao,
      });
    }
  }

  if (naoUsados > 0) avisos.push(`${naoUsados} combinacao(oes) material/cor marcadas como nao usadas.`);
  if (faixasAbertas > 0) {
    avisos.push(`${faixasAbertas} linha(s) tinham faixa de grupo (F1, F2, EX) e foram abertas nos tamanhos reais.`);
  }
  if (semAlinhamento > 0) {
    avisos.push(
      `${semAlinhamento} linha(s) foram ignoradas: a lista de cores do insumo nao casou com a de cores do produto.`,
    );
  }

  return {
    itens,
    resumo: {
      lidas: csv.linhas.length,
      aproveitadas: itens.length,
      /*
       * Aqui uma linha do CSV vira varios itens (uma por cor e tamanho), entao
       * "descartadas" conta LINHAS puladas, nao a diferenca para os itens —
       * essa subtracao daria negativo e nao significaria nada.
       */
      descartadas: semAlinhamento,
      avisos,
    },
    /*
     * Diz ao importador que esta carga cobre TODOS os produtos, nao um so. Sem
     * isso ele apagaria apenas o produto/cor do primeiro item antes de
     * inserir — regra do formato antigo, um arquivo por produto e cor — e os
     * outros 800 produto/cor seriam duplicados a cada reimportacao.
     */
    consolidado: true,
  };
}

export function lerConsumo(
  bytes: ArrayBuffer | Uint8Array,
  nomeArquivo: string,
): { itens: ItemConsumo[]; resumo: Resumo; consolidado?: boolean } {
  const csv = lerCsv(bytes);
  const avisos: string[] = [];

  /*
   * Escolhe o formato pelo CONTEUDO, nao pelo nome: o arquivo consolidado se
   * chama "CONSUMOS-2252.csv", que por azar casa com o padrao PRODUTO-COR
   * ("CONSUMOS" / "2252") e seria lido como se fosse do produto CONSUMOS.
   * Mais de um produto na coluna PRODUTO so acontece no consolidado.
   */
  const iProdutoCsv = csv.indice("PRODUTO");
  const produtosDistintos = new Set<string>();
  for (const linha of csv.linhas) {
    const p = celula(linha, iProdutoCsv).toUpperCase();
    if (p) produtosDistintos.add(p);
    if (produtosDistintos.size > 1) break;
  }
  const doNome = produtoCorDoNome(nomeArquivo);
  const ehConsolidado =
    produtosDistintos.size > 1 || !doNome || (doNome && !produtosDistintos.has(doNome.produto));
  if (ehConsolidado) return lerConsumoConsolidado(csv);

  if (!doNome) {
    avisos.push(
      `O nome "${nomeArquivo}" nao segue o padrao PRODUTO-COR.csv, entao nao da para saber de qual cor de produto e este consumo.`,
    );
    return { itens: [], resumo: { lidas: csv.linhas.length, aproveitadas: 0, descartadas: csv.linhas.length, avisos } };
  }

  const iProduto = csv.indice("PRODUTO");
  const iCodigo = csv.indice("CODIGO");
  const iDescricao = csv.indice("DESCRICAO");
  const iConsumo = csv.indice("CONSUMO");
  const iUnid = csv.indice("UNID");
  const iFaixa = csv.indice("FAIXA");
  const iAplicacao = csv.indice("APLICACAO");
  const iGrupo = csv.indice("GRUPO");
  const iCoresC = csv.indice("CORES_C");
  const iCoresP = csv.indice("CORES_P");
  const iDescCoresI = csv.indice("DESC_CORES_I");

  const itens: ItemConsumo[] = [];
  let naoUsados = 0;

  for (const linha of csv.linhas) {
    const codigo = celula(linha, iCodigo).toUpperCase();
    if (!codigo) continue;

    const corResolvida = celula(linha, iCoresC).toUpperCase();
    if (corResolvida === NAO_USA) {
      // O SISPLAN marca assim os materiais que nao entram nesta cor.
      naoUsados += 1;
      continue;
    }

    // O nome da cor do insumo vem da posicao da cor do produto nas listas.
    let corMaterialNome = "";
    if (iCoresP >= 0 && iDescCoresI >= 0) {
      const cores = celula(linha, iCoresP).split(/\s+/).filter(Boolean);
      const posicao = cores.indexOf(doNome.cor);
      if (posicao >= 0) {
        const nomes = celula(linha, iDescCoresI).split("|");
        corMaterialNome = (nomes[posicao] ?? "").trim();
      }
    }

    const produtoLinha = celula(linha, iProduto).toUpperCase();
    if (produtoLinha && produtoLinha !== doNome.produto) {
      avisos.push(
        `O arquivo se chama ${nomeArquivo} mas a coluna PRODUTO traz ${produtoLinha}. O nome do arquivo foi mantido.`,
      );
    }

    itens.push({
      produto: doNome.produto,
      corProduto: doNome.cor,
      codigo,
      descricao: celula(linha, iDescricao),
      materialTipo: celula(linha, iGrupo).toUpperCase(),
      corMaterial: SEM_COR.has(corResolvida) ? "" : corResolvida,
      corMaterialNome,
      consumo: numeroBr(celula(linha, iConsumo)),
      unid: celula(linha, iUnid) || "UN",
      faixa: celula(linha, iFaixa).toUpperCase() || "F0",
      aplicacao: celula(linha, iAplicacao),
    });
  }

  if (naoUsados > 0) {
    avisos.push(`${naoUsados} material(is) marcados como nao usados na cor ${doNome.cor}.`);
  }

  return {
    itens,
    resumo: {
      lidas: csv.linhas.length,
      aproveitadas: itens.length,
      descartadas: csv.linhas.length - itens.length,
      avisos,
    },
  };
}

// ---------------------------------------------------------------------------
// 2710 (PEDIDOS) - pedidos emitidos, um arquivo diario com todos os pedidos
// ---------------------------------------------------------------------------

export interface Pedido {
  numero: string;
  status: string;
  descStatus: string;
  dtEmissao: string;
  dtEntrega: string;
}

export interface ItemPedido {
  numero: string;
  referencia: string;
  cor: string;
  tam: string;
  qtdePedida: number;
  qtdeExpedida: number;
}

/** Datas do 2710 vem em "dd/mm/aaaa", nao no formato ISO do resto do sistema. */
function dataBrParaIso(texto: string): string {
  const m = texto.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/**
 * O cabecalho do pedido: numero, situacao e datas. Junto com o 2710 de
 * PRODUTOS (`lerProdutosPedido`), passa a ser a fonte da carteira (o que foi
 * pedido e ainda nao foi entregue), no lugar do QTDE_VENDA do 721.
 *
 * So um pedido que aparecer aqui conta na carteira: um item de
 * PRODUTOS-2710 cujo numero de pedido nao existir neste arquivo e ignorado.
 */
export function lerPedidos(bytes: ArrayBuffer | Uint8Array): { itens: Pedido[]; resumo: Resumo } {
  const csv = lerCsv(bytes);
  const iNumero = primeiroIndice(csv, ["NUMERO", "NÚMERO"]);
  const iStatus = csv.indice("STATUS");
  const iDescStatus = csv.indice("DESC_STATUS");
  const iDtEmissao = csv.indice("DT_EMISSAO");
  const iDtEntrega = csv.indice("DT_ENTREGA");

  const itens: Pedido[] = [];
  for (const linha of csv.linhas) {
    const numeroPedido = celula(linha, iNumero);
    if (!numeroPedido) continue;
    itens.push({
      numero: numeroPedido,
      status: celula(linha, iStatus),
      descStatus: celula(linha, iDescStatus),
      dtEmissao: dataBrParaIso(celula(linha, iDtEmissao)),
      dtEntrega: dataBrParaIso(celula(linha, iDtEntrega)),
    });
  }

  return {
    itens,
    resumo: {
      lidas: csv.linhas.length,
      aproveitadas: itens.length,
      descartadas: csv.linhas.length - itens.length,
      avisos: [],
    },
  };
}

// ---------------------------------------------------------------------------
// 2710 (PRODUTOS) - itens dos pedidos: produto, cor, tamanho e quantidade
// ---------------------------------------------------------------------------

/**
 * Um produto dentro de um pedido. O que falta entregar e
 * `qtdePedida - qtdeExpedida`; o Worker soma isso por referencia+cor+tam,
 * restrito aos numeros de pedido que existirem em `lerPedidos`.
 */
export function lerProdutosPedido(bytes: ArrayBuffer | Uint8Array): { itens: ItemPedido[]; resumo: Resumo } {
  const csv = lerCsv(bytes);
  const iNumero = primeiroIndice(csv, ["NÚMERO", "NUMERO"]);
  const iCodigo = primeiroIndice(csv, ["CÓDIGO", "CODIGO"]);
  const iCor = csv.indice("COR");
  const iTam = csv.indice("TAM");
  const iQtdePed = primeiroIndice(csv, ["QTDE. PED.", "QTDE.PED."]);
  const iQtdeExp = primeiroIndice(csv, ["QTDE. EXP.", "QTDE.EXP."]);

  const itens: ItemPedido[] = [];
  for (const linha of csv.linhas) {
    const referencia = celula(linha, iCodigo).toUpperCase();
    const numeroPedido = celula(linha, iNumero);
    if (!referencia || !numeroPedido) continue;
    itens.push({
      numero: numeroPedido,
      referencia,
      cor: celula(linha, iCor).toUpperCase(),
      tam: celula(linha, iTam).toUpperCase(),
      qtdePedida: numeroBr(celula(linha, iQtdePed)),
      qtdeExpedida: numeroBr(celula(linha, iQtdeExp)),
    });
  }

  return {
    itens,
    resumo: {
      lidas: csv.linhas.length,
      aproveitadas: itens.length,
      descartadas: csv.linhas.length - itens.length,
      avisos: [],
    },
  };
}

// ---------------------------------------------------------------------------
// 3011 (PENDENTES) - ordens de producao que ainda nao voltaram da faccao
// ---------------------------------------------------------------------------

/**
 * Uma linha de ordem de producao pendente. O relatorio tem 187 colunas; aqui
 * so entram as que o acompanhamento usa. Uma OP (`fac_numero`) tem varias
 * linhas, uma por cor e tamanho.
 *
 * `cliente_nome` e quem esta produzindo — a propria SGR quando a producao e
 * interna, ou a faccao. Nao e cliente de venda, apesar do nome da coluna.
 */
export interface OrdemPendente {
  op: string;
  referencia: string;
  cor: string;
  corNome: string;
  tam: string;
  descricao: string;
  faccao: string;
  colecao: string;
  quantPendente: number;
  /** Quando saiu para a faccao. */
  dtSaida: string;
  /** Quando deveria voltar. */
  dtRetorno: string;
  /** Ha quantos dias esta pendente, como o proprio ERP calcula. */
  diasPendente: number;
  status: string;
  setor: string;
}

export function lerOrdensPendentes(bytes: ArrayBuffer | Uint8Array): {
  itens: OrdemPendente[];
  resumo: Resumo;
} {
  const csv = lerCsv(bytes);
  const iOp = csv.indice("FAC_NUMERO");
  const iRef = csv.indice("FAC_CODIGO");
  const iCor = csv.indice("FAC_COR");
  const iCorNome = csv.indice("COR_DESCOR");
  const iTam = csv.indice("FAC_TAM");
  const iDescricao = csv.indice("PRODUTO_DESCRICAO");
  const iFaccao = csv.indice("CLIENTE_NOME");
  const iColecao = csv.indice("DESCCOL");
  const iPendente = csv.indice("FAC_QUANT_PEND");
  const iDtSaida = csv.indice("FAC_DT_S");
  const iDtRetorno = primeiroIndice(csv, ["FAC_MAX_DT_R", "FAC_DT_R"]);
  const iDias = csv.indice("OF1_DIAS_PEND");
  const iStatus = csv.indice("DESC_STATUS");
  const iSetor = csv.indice("CADFLUXO_DESCRICAO");

  const itens: OrdemPendente[] = [];
  let semPendencia = 0;
  for (const linha of csv.linhas) {
    const op = celula(linha, iOp);
    const referencia = celula(linha, iRef).toUpperCase();
    if (!op || !referencia) continue;
    const quantPendente = numeroBr(celula(linha, iPendente));
    // Linha sem saldo pendente ja voltou: nao e acompanhamento, e historico.
    if (quantPendente <= 0) {
      semPendencia += 1;
      continue;
    }
    itens.push({
      op,
      referencia,
      cor: celula(linha, iCor).toUpperCase(),
      corNome: celula(linha, iCorNome),
      tam: celula(linha, iTam).toUpperCase(),
      descricao: celula(linha, iDescricao),
      faccao: celula(linha, iFaccao),
      colecao: celula(linha, iColecao),
      quantPendente,
      dtSaida: dataBrParaIso(celula(linha, iDtSaida)),
      dtRetorno: dataBrParaIso(celula(linha, iDtRetorno)),
      diasPendente: numeroBr(celula(linha, iDias)),
      status: celula(linha, iStatus),
      setor: celula(linha, iSetor),
    });
  }

  return {
    itens,
    resumo: {
      lidas: csv.linhas.length,
      aproveitadas: itens.length,
      descartadas: csv.linhas.length - itens.length,
      avisos: semPendencia > 0 ? [`${semPendencia} linha(s) sem saldo pendente foram ignoradas.`] : [],
    },
  };
}
