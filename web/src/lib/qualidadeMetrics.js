export function toNumber(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

export function calcPercentuais(insp) {
  const inspecionada = toNumber(insp.qtdInspecionada);
  const aprovada = toNumber(insp.qtdAprovada);
  const defeito = toNumber(insp.qtdDefeito);
  const reprocesso = toNumber(insp.qtdReprocesso);
  return {
    percentualAprovacao: inspecionada ? round1((aprovada / inspecionada) * 100) : 0,
    percentualDefeito: inspecionada ? round1((defeito / inspecionada) * 100) : 0,
    percentualReprocesso: inspecionada ? round1((reprocesso / inspecionada) * 100) : 0,
  };
}

export function formatNumero(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

export function formatPercentual(n) {
  const v = Number(n || 0);
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: v % 1 ? 1 : 0 })}%`;
}

export function formatDataCurta(iso) {
  const partes = String(iso || "").split("-");
  if (partes.length !== 3) return "Sem data";
  const [, mes, dia] = partes;
  return `${dia}/${mes}`;
}

function contemTexto(valor, busca) {
  return String(valor || "").toLowerCase().includes(String(busca || "").toLowerCase());
}

export function filtrarInspecoes(lista, filtros) {
  return lista.filter((i) => {
    if (filtros.dataInicial && i.dataInspecao < filtros.dataInicial) return false;
    if (filtros.dataFinal && i.dataInspecao > filtros.dataFinal) return false;
    if (filtros.inspetora && i.inspetora !== filtros.inspetora) return false;
    if (filtros.fornecedor && i.fornecedor !== filtros.fornecedor) return false;
    if (filtros.produto && !contemTexto(i.produto, filtros.produto)) return false;
    if (filtros.causa && i.causaPrincipal !== filtros.causa) return false;
    if (filtros.status && i.status !== filtros.status) return false;
    return true;
  });
}

function somar(itens, campo) {
  return itens.reduce((soma, item) => soma + toNumber(item[campo]), 0);
}

function agruparPor(lista, campo) {
  const grupos = new Map();
  for (const item of lista) {
    const chave = item[campo] || "Não informado";
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
  }
  return Array.from(grupos, ([chave, itens]) => ({ chave, itens }));
}

export function agregarPor(lista, campo, campoValor = "qtdReprocesso") {
  return agruparPor(lista, campo)
    .map(({ chave, itens }) => ({
      label: chave,
      value: somar(itens, campoValor),
      count: itens.length,
      inspecionado: somar(itens, "qtdInspecionada"),
      reprocesso: somar(itens, "qtdReprocesso"),
      taxa: taxaPercentual(somar(itens, "qtdReprocesso"), somar(itens, "qtdInspecionada")),
    }))
    .sort((a, b) => b.value - a.value);
}

function taxaPercentual(parte, total) {
  return total ? round1((parte / total) * 100) : 0;
}

export function resumoGeral(lista) {
  const totais = lista.reduce(
    (acc, i) => {
      acc.totalInspecionado += toNumber(i.qtdInspecionada);
      acc.totalAprovado += toNumber(i.qtdAprovada);
      acc.totalDefeito += toNumber(i.qtdDefeito);
      acc.totalReprocesso += toNumber(i.qtdReprocesso);
      return acc;
    },
    { totalInspecionado: 0, totalAprovado: 0, totalDefeito: 0, totalReprocesso: 0 }
  );

  const porFornecedor = agruparPor(lista, "fornecedor")
    .map(({ chave, itens }) => ({
      label: chave,
      taxa: taxaPercentual(somar(itens, "qtdReprocesso"), somar(itens, "qtdInspecionada")),
      inspecionado: somar(itens, "qtdInspecionada"),
    }))
    .filter((f) => f.inspecionado > 0)
    .sort((a, b) => b.taxa - a.taxa)[0];

  const principalCausa = agregarPor(lista, "causaPrincipal", "qtdReprocesso")[0];
  const inspetoraDestaque = agregarPor(lista, "inspetora", "qtdInspecionada")[0];

  return {
    ...totais,
    percentualGeralReprocesso: taxaPercentual(totais.totalReprocesso, totais.totalInspecionado),
    fornecedorMaiorIndice: porFornecedor?.label || "Sem dados",
    principalCausa: principalCausa?.label || "Sem dados",
    inspetoraDestaque: inspetoraDestaque?.label || "Sem dados",
  };
}

export function evolucaoDiaria(lista) {
  return agruparPor(lista, "dataInspecao")
    .map(({ chave, itens }) => ({
      label: formatDataCurta(chave),
      data: chave,
      value: somar(itens, "qtdReprocesso"),
      inspecionado: somar(itens, "qtdInspecionada"),
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

export function sugestaoPorCausa(causa) {
  const texto = String(causa || "").toLowerCase();
  if (texto.includes("costura")) return "Treinar costura";
  if (texto.includes("medida")) return "Revisar medidas";
  if (texto.includes("acabamento") || texto.includes("debrum")) return "Acompanhar acabamento";
  if (texto.includes("elástico")) return "Verificar aplicação de elástico";
  if (texto.includes("carimbo")) return "Revisar processo de carimbo";
  if (texto.includes("transfer")) return "Revisar aplicação de transfer";
  return "Acompanhar de perto nas próximas OPs";
}

export function rankingFornecedores(lista) {
  return agruparPor(lista, "fornecedor")
    .map(({ chave, itens }) => {
      const inspecionado = somar(itens, "qtdInspecionada");
      const reprocessado = somar(itens, "qtdReprocesso");
      const percentual = taxaPercentual(reprocessado, inspecionado);
      const causas = agregarPor(itens, "causaPrincipal", "qtdReprocesso");
      const principalCausa = causas[0]?.label || "Sem dados";
      const ocorrenciasCausa = causas[0]?.count || 0;
      const frequencia = itens.filter((i) => toNumber(i.qtdReprocesso) > 0).length;
      const score = reprocessado * 0.4 + percentual * 8 + frequencia * 14 + ocorrenciasCausa * 8 + Math.log10(inspecionado + 1) * 10;
      return {
        fornecedor: chave,
        totalInspecionado: inspecionado,
        totalReprocessado: reprocessado,
        percentualReprocesso: percentual,
        principalCausa,
        sugestao: sugestaoPorCausa(principalCausa),
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((item, i) => ({ ...item, posicao: i + 1 }));
}
