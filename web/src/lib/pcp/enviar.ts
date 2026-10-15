/**
 * Envio dos dados filtrados para o banco de dados (IndexedDB local ou Worker).
 */

import type { TipoRelatorio } from "./relatorios.ts";
import { pcpDb } from "./pcpDb.ts";
import { limparCache } from "./buscar.ts";

/** Tipos aceitos pela rota de importacao, incluindo os que vem da planilha. */
export type TipoEnvio = TipoRelatorio | "PLANILHA" | "PLANEJAMENTO";

/** Tamanho do bloco. */
export const TAMANHO_BLOCO = 200;

export interface DadosEnvio {
  tipo: TipoEnvio;
  variacao: string;
  arquivo: string;
  dataArquivo: string | null;
  itens: unknown[];
  resumo: { lidas: number; aproveitadas: number; avisos: string[] };
  /** CONSUMO na planilha unica: a carga substitui a tabela inteira. */
  consolidado?: boolean;
}

export interface ResultadoEnvio {
  gravadas: number;
  removidas: number;
  blocos: number;
}

/** Divide uma lista em blocos de tamanho fixo. */
export function dividirEmBlocos<T>(itens: T[], tamanho: number = TAMANHO_BLOCO): T[][] {
  if (tamanho < 1) throw new Error("O tamanho do bloco precisa ser pelo menos 1.");
  const blocos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) blocos.push(itens.slice(i, i + tamanho));
  return blocos.length > 0 ? blocos : [[]];
}

export async function enviarParaBanco(
  dados: DadosEnvio,
  aoProgredir?: (enviados: number, total: number) => void,
): Promise<ResultadoEnvio> {
  // Salva diretamente no IndexedDB local de forma ultra-rápida e robusta
  const resultado = await pcpDb.salvarImportacao(dados, aoProgredir);
  limparCache();
  return resultado;
}
