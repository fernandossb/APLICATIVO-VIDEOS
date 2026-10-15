/**
 * Busca com cache por versao e integracao com banco local (IndexedDB).
 *
 * Funciona de forma hibrida:
 *  - Se houver servidor /api respondendo, faz requisicoes HTTP com ETag (304 Not Modified).
 *  - No ambiente local/Vite, consulta diretamente o `pcpDb` (IndexedDB local),
 *    garantindo velocidade instantanea, funcionamento offline e persistencia total.
 */

import { pcpDb } from "./pcpDb.ts";

interface Entrada {
  etag: string;
  dados: unknown;
}

const cache = new Map<string, Entrada>();

export async function buscarComCache<T>(url: string): Promise<T> {
  const guardado = cache.get(url);

  // Tentativa no pcpDb local
  if (url === "/api/plano") {
    const dados = (await pcpDb.obterPlano()) as T;
    return dados;
  }
  if (url === "/api/modulos") {
    const dados = (await pcpDb.obterModulos()) as T;
    return dados;
  }
  if (url === "/api/prioridades") {
    const dados = (await pcpDb.obterPrioridades()) as T;
    return dados;
  }
  if (url === "/api/ordens") {
    const dados = (await pcpDb.obterOrdens()) as T;
    return dados;
  }
  if (url === "/api/colecoes") {
    const dados = (await pcpDb.obterColecoes()) as T;
    return dados;
  }
  if (url === "/api/colecoes/produtos") {
    const dados = (await pcpDb.obterColecoesProdutos()) as T;
    return dados;
  }
  if (url === "/api/situacao") {
    const dados = (await pcpDb.obterSituacao()) as T;
    return dados;
  }
  if (url.startsWith("/api/historico")) {
    const id = decodeURIComponent(url.split("id=")[1] || "");
    const dados = (await pcpDb.obterHistorico(id)) as T;
    return dados;
  }

  // Fallback para HTTP fetch caso seja outra URL
  const cabecalhos: Record<string, string> = {};
  if (guardado) cabecalhos["If-None-Match"] = guardado.etag;

  try {
    const resposta = await fetch(url, {
      cache: "no-cache",
      headers: cabecalhos,
    });

    if (resposta.status === 304 && guardado) return guardado.dados as T;

    const corpo = (await resposta.json()) as T & { erro?: string };
    if (!resposta.ok) throw new Error(corpo?.erro ?? "Nao foi possivel carregar.");

    const etag = resposta.headers.get("ETag");
    if (etag) cache.set(url, { etag, dados: corpo });
    else cache.delete(url);

    return corpo;
  } catch (e) {
    if (guardado) return guardado.dados as T;
    throw e;
  }
}

/**
 * Esquece o que esta guardado no cache de memoria.
 */
export function limparCache(url?: string): void {
  if (url) cache.delete(url);
  else cache.clear();
}
