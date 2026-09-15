export const defaultStatusItens = () => [
  { item: "PROTO", tamanho: "", quantidade: "", entrega: "" },
  { item: "AMOSTRA", tamanho: "", quantidade: "", entrega: "" },
  { item: "PEÇA DE FOTO", tamanho: "", quantidade: "", entrega: "" },
  { item: "APROVAÇÃO", tamanho: "", quantidade: "", entrega: "" },
];

export const emptyFicha = () => ({
  id: null,
  referencia: "",
  descricao: "",
  colecao: "",
  estilista: "",
  modelista: "",
  engenharia: "",
  pilotista: "",
  grade: "",
  dataLiberacao: "",
  composicao: "",
  statusItens: defaultStatusItens(),
  desenhoTecnico: null,
  variantes: [],
  medidas: { tamanhos: ["P", "M", "G", "GG"], linhas: [] },
  imagensModelagem: {
    desenhoMedidas: null,
    metodoDeMedir: null,
    localizacaoEtiquetas: null,
    pecaExplodida: null,
  },
  gruposInsumos: [],
  comentarios: { modelagem: [], engenharia: [], pilotagem: [], marketing: [] },
  grupoTecido: "G1",
  roteiro: [],
  atualizadoEm: null,
});

// Grupos de tecido do Banco de Operações: quanto mais dificil de manusear o tecido,
// menor o percentual e maior o tempo padrao (tempo = tempoG1 / percentual).
export const gruposTecido = [
  { key: "G1", percentual: 100 },
  { key: "G2", percentual: 95 },
  { key: "G3", percentual: 90 },
];

export function tempoPorGrupoTecido(tempoG1, grupoKey) {
  const grupo = gruposTecido.find((g) => g.key === grupoKey) || gruposTecido[0];
  const base = Number(String(tempoG1 ?? "").replace(",", "."));
  if (!Number.isFinite(base)) return 0;
  return base / (grupo.percentual / 100);
}

export const departamentosComentario = [
  { key: "modelagem", label: "Modelagem" },
  { key: "engenharia", label: "Engenharia" },
  { key: "pilotagem", label: "Pilotagem" },
  { key: "marketing", label: "Marketing" },
];

export const metodosTempo = ["GSD", "Estimado", "Manual"];

export const statusOperacaoOpcoes = [
  { value: "Pendente", label: "Pendente", tone: "warning" },
  { value: "Concluído", label: "Concluído", tone: "success" },
];

export const gruposInsumosSugeridos = ["Tecidos", "Aviamentos", "Materiais de Marketing"];

export const statusInspecao = [
  { value: "Aprovado", label: "Aprovado", tone: "success" },
  { value: "Reprovado", label: "Reprovado", tone: "danger" },
  { value: "Reprocesso", label: "Reprocesso", tone: "danger" },
  { value: "Aguardando revisão", label: "Aguardando revisão", tone: "warning" },
];

export const causasDefeito = [
  "Costura torta",
  "Medida fora do padrão",
  "Mancha",
  "Furo",
  "Peça suja",
  "Defeito no elástico",
  "Defeito no debrum",
  "Defeito no transfer",
  "Defeito no carimbo",
  "Falha de acabamento",
  "Peça incompleta",
  "Troca de cor",
  "Troca de tamanho",
  "Etiqueta errada",
  "Outro",
];

export const emptyInspecao = () => ({
  id: null,
  dataInspecao: "",
  inspetora: "",
  fornecedor: "",
  op: "",
  produto: "",
  referencia: "",
  cor: "",
  tamanho: "",
  qtdInspecionada: "",
  qtdAprovada: "",
  qtdDefeito: "",
  qtdReprocesso: "",
  causaPrincipal: "",
  causasAdicionais: [],
  observacoes: "",
  status: "Aguardando revisão",
  fotoUrl: null,
  atualizadoEm: null,
});

export const filtrosDashboardVazios = {
  dataInicial: "",
  dataFinal: "",
  fornecedor: "",
  inspetora: "",
  produto: "",
  causa: "",
  status: "",
};

export const NAV = [
  {
    group: "Engenharia",
    items: [
      { key: "ficha-tecnica", label: "Ficha Técnica" },
      { key: "banco-operacoes", label: "Banco de Operações" },
    ],
  },
  {
    group: "Qualidade",
    items: [
      { key: "qualidade-dashboard", label: "Dashboard" },
      { key: "qualidade-inspecoes", label: "Inspeções" },
    ],
  },
];
