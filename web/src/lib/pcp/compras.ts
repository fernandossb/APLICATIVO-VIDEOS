/**
 * Material que falta para produzir a PROJECAO inteira.
 *
 * A tela de insumos criticos do dashboard responde outra pergunta: "o material
 * cobre os lotes que ja estao programados?". Esta aqui responde a de compras:
 * "se a gente for produzir tudo que a projecao pede, o que falta comprar?".
 *
 * A diferenca esta na quantidade. La e o `lote`, o que foi programado hoje.
 * Aqui e o `faltaProduzir` — `projecao - (saldo com lote + venda acumulada)`,
 * ou seja, o que ainda precisa ser feito depois de descontar estoque, processo,
 * carteira e o lote ja programado. Material so aparece se alguma coisa ainda
 * precisa ser produzida.
 *
 * Funcao pura, sem DOM e sem Cloudflare, para rodar no `node --test`.
 */

export interface LinhaProjecao {
  referencia: string;
  cor: string;
  corNome?: string;
  tam: string;
  colecaoNome?: string;
  faccao?: string;
  faltaProduzir: number;
  ativo?: boolean;
  grupoAtivo?: boolean;
  insumos: Array<{
    codigo: string;
    descricao: string;
    materialTipo?: string;
    corMaterial: string;
    corMaterialNome?: string;
    consumo: number;
    unid: string;
    disponivel: number;
    semCadastro: boolean;
  }>;
}

export interface MaterialFaltante {
  codigo: string;
  descricao: string;
  grupo: string;
  corMaterial: string;
  corMaterialNome: string;
  unid: string;
  /** Quanto a projecao inteira consome deste material. */
  necessario: number;
  /** Saldo do 2120. */
  disponivel: number;
  /** `necessario - disponivel`, so quando positivo. */
  falta: number;
  /** Nao existe no estoque importado: falta cadastro, nao necessariamente material. */
  semCadastro: boolean;
  /** Produtos que disputam este material, para saber o tamanho do problema. */
  produtos: number;
  /** Colecoes envolvidas, para o filtro da tela. */
  colecoes: string[];
}

function chave(codigo: string, cor: string): string {
  return `${codigo}|${cor}`;
}

/**
 * `filtro` recorta ANTES de somar, de proposito: filtrar por colecao tem que
 * responder "o que falta comprar para esta colecao", e nao mostrar o total de
 * todas as colecoes so porque o material aparece nesta tambem.
 */
export function montarFaltaProjecao(
  linhas: LinhaProjecao[],
  filtro: (linha: LinhaProjecao) => boolean = () => true,
): MaterialFaltante[] {
  const mapa = new Map<
    string,
    MaterialFaltante & { produtosSet: Set<string>; colecoesSet: Set<string> }
  >();

  for (const linha of linhas) {
    // Produto desativado nao entra na conta de compra.
    if (linha.ativo === false || linha.grupoAtivo === false) continue;
    const falta = Number(linha.faltaProduzir) || 0;
    if (falta <= 0) continue;
    if (!filtro(linha)) continue;

    for (const insumo of linha.insumos) {
      const k = chave(insumo.codigo, insumo.corMaterial);
      const atual = mapa.get(k) ?? {
        codigo: insumo.codigo,
        descricao: insumo.descricao,
        grupo: insumo.materialTipo ?? "",
        corMaterial: insumo.corMaterial,
        corMaterialNome: insumo.corMaterialNome ?? "",
        unid: insumo.unid,
        necessario: 0,
        /* O disponivel e do MATERIAL, nao da linha: pegar o primeiro que
           aparecer basta, e somar seria contar o mesmo saldo varias vezes. */
        disponivel: Number(insumo.disponivel) || 0,
        falta: 0,
        semCadastro: insumo.semCadastro,
        produtos: 0,
        colecoes: [],
        produtosSet: new Set<string>(),
        colecoesSet: new Set<string>(),
      };
      atual.necessario += (Number(insumo.consumo) || 0) * falta;
      atual.produtosSet.add(`${linha.referencia}|${linha.cor}`);
      if (linha.colecaoNome) atual.colecoesSet.add(linha.colecaoNome);
      mapa.set(k, atual);
    }
  }

  const saida: MaterialFaltante[] = [];
  for (const item of mapa.values()) {
    const falta = item.necessario - item.disponivel;
    saida.push({
      codigo: item.codigo,
      descricao: item.descricao,
      grupo: item.grupo,
      corMaterial: item.corMaterial,
      corMaterialNome: item.corMaterialNome,
      unid: item.unid,
      necessario: item.necessario,
      disponivel: item.disponivel,
      falta: falta > 0 ? falta : 0,
      semCadastro: item.semCadastro,
      produtos: item.produtosSet.size,
      colecoes: [...item.colecoesSet].sort(),
    });
  }

  /* Maior falta primeiro: e a ordem de quem vai comprar. Material sem cadastro
     no estoque vai junto no topo — falta zero ali significa "nao sei", nao
     "tem o suficiente", e some da lista se ordenado so pela falta. */
  return saida.sort((a, b) => {
    if (a.semCadastro !== b.semCadastro) return a.semCadastro ? -1 : 1;
    if (b.falta !== a.falta) return b.falta - a.falta;
    return a.codigo.localeCompare(b.codigo, "pt-BR");
  });
}
