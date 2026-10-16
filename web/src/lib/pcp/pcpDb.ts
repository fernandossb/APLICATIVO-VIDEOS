/**
 * Banco de dados local do PCP & Compras usando IndexedDB nativo.
 *
 * Permite que todo o motor de planejamento, cálculo de estoque, consumo,
 * ordens e compras funcione no navegador (Vite) de forma 100% autônoma,
 * persistente e ultra-rápida (milhares de linhas lidas/gravadas em milissegundos),
 * sem limites de 5MB de localStorage e sem depender de backend externo.
 */

import { listarFaccoes } from "./ordens.ts";
import type { DadosEnvio, ResultadoEnvio } from "./enviar.ts";

const DB_NAME = "costuraflow_pcp_db";
const DB_VERSION = 1;

interface StoreMap {
  programacao: Record<string, unknown>;
  consumo: Record<string, unknown>;
  estoque_materiais: Record<string, unknown>;
  planejamento: Record<string, unknown>;
  produtos: Record<string, unknown>;
  colecoes: { nome: string; lancamento: string };
  ordens_pendentes: Record<string, unknown>;
  pedidos: Record<string, unknown>;
  pedidos_itens: Record<string, unknown>;
  importacoes: Record<string, unknown>;
  config: { chave: string; valor: string };
  historico: Record<string, unknown>;
}

type StoreName = keyof StoreMap;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("programacao")) {
        db.createObjectStore("programacao", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("consumo")) {
        db.createObjectStore("consumo", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("estoque_materiais")) {
        db.createObjectStore("estoque_materiais", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("planejamento")) {
        db.createObjectStore("planejamento", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("produtos")) {
        db.createObjectStore("produtos", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("colecoes")) {
        db.createObjectStore("colecoes", { keyPath: "nome" });
      }
      if (!db.objectStoreNames.contains("ordens_pendentes")) {
        db.createObjectStore("ordens_pendentes", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("pedidos")) {
        db.createObjectStore("pedidos", { keyPath: "numero" });
      }
      if (!db.objectStoreNames.contains("pedidos_itens")) {
        db.createObjectStore("pedidos_itens", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("importacoes")) {
        db.createObjectStore("importacoes", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("config")) {
        db.createObjectStore("config", { keyPath: "chave" });
      }
      if (!db.objectStoreNames.contains("historico")) {
        db.createObjectStore("historico", { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function putInStore<T>(storeName: StoreName, items: T[]): Promise<void> {
  if (items.length === 0) return;
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearStore(storeName: StoreName): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const pcpDb = {
  /**
   * Obtém o plano completo para cálculo no cliente.
   */
  async obterPlano() {
    const [programacao, consumo, materiais, complementos, planejamento, colecoes, ordens] = await Promise.all([
      getAllFromStore<any>("programacao"),
      getAllFromStore<any>("consumo"),
      getAllFromStore<any>("estoque_materiais"),
      getAllFromStore<any>("produtos"),
      getAllFromStore<any>("planejamento"),
      getAllFromStore<any>("colecoes"),
      getAllFromStore<any>("ordens_pendentes"),
    ]);

    const faccoesEncontradas = ordens.map((o: any) => o.faccao).filter(Boolean);
    const faccoes = listarFaccoes(faccoesEncontradas);

    return {
      ok: true,
      podeEditar: true,
      programacao: programacao.map((p: any) => ({
        ...p,
        ativo: p.ativo !== false,
        rowRevision: p.rowRevision || 1,
      })),
      consumo,
      materiais,
      complementos: complementos.map((c: any) => ({
        ...c,
        ativo: c.ativo !== false,
      })),
      planejamento,
      colecoes,
      faccoes,
    };
  },

  /**
   * Salva alterações de lotes feitas na tela de programação.
   */
  async salvarLotes(alteracoes: Array<{ id: string; lote: number }>) {
    const db = await getDb();
    const tx = db.transaction(["programacao", "historico"], "readwrite");
    const progStore = tx.objectStore("programacao");
    const histStore = tx.objectStore("historico");

    let gravadas = 0;
    const carimbo = new Date().toISOString();

    for (const { id, lote } of alteracoes) {
      const itemReq = progStore.get(id);
      await new Promise<void>((res) => {
        itemReq.onsuccess = () => {
          const item = itemReq.result;
          if (item) {
            const loteAnterior = item.lote || 0;
            item.lote = lote;
            item.rowRevision = (item.rowRevision || 0) + 1;
            item.updatedAt = carimbo;
            progStore.put(item);
            histStore.put({
              referencia: item.referencia,
              cor: item.cor,
              tam: item.tam,
              campo: "lote",
              de: loteAnterior,
              para: lote,
              origem: "tela_programacao",
              data: carimbo,
            });
            gravadas++;
          }
          res();
        };
      });
    }

    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    return { ok: true, gravadas, conflitos: [] };
  },

  /**
   * Salva produto cadastrado ou editado no modal.
   */
  async salvarProduto(form: any) {
    const db = await getDb();
    const tx = db.transaction(["programacao", "planejamento", "colecoes"], "readwrite");
    const progStore = tx.objectStore("programacao");
    const planStore = tx.objectStore("planejamento");
    const colStore = tx.objectStore("colecoes");

    const carimbo = new Date().toISOString();

    // Salva coleção se nova
    if (form.colecaoNome) {
      colStore.put({
        nome: form.colecaoNome.trim().toUpperCase(),
        lancamento: form.lancamento || "",
      });
    }

    // Salva curvas no planejamento
    const planKey = `${form.referencia}|${form.cor}`.toUpperCase();
    planStore.put({
      id: planKey,
      referencia: form.referencia,
      cor: form.cor,
      linha: form.linha || "",
      projecaoTotal: Number(form.projecaoTotal) || 0,
      leadTime: Number(form.leadTime) || 30,
      curva: form.curvaProducao || [],
      curvaVenda: form.curvaVenda || [],
      curvaFaturamento: form.curvaFaturamento || [],
    });

    // Salva ou atualiza cada tamanho na grade
    let salvos = 0;
    for (const g of form.grade || []) {
      const id = `${form.referencia}-${g.tam}-${form.cor}`.toUpperCase();
      progStore.put({
        id,
        referencia: form.referencia,
        tam: g.tam,
        cor: form.cor,
        corNome: form.corNome || "",
        descricao: form.descricao || "",
        colecao: form.colecao || "",
        colecaoNome: form.colecaoNome || "",
        faccao: form.faccao || "",
        lancamento: form.lancamento || "",
        deadline: form.deadline || "",
        leadTime: Number(form.leadTime) || 30,
        capacidade: Number(form.capacidade) || 1,
        unidade: Number(form.unidade) || 1,
        precoCostura: Number(form.precoCostura) || 0,
        obsProduto: form.obsProduto || "",
        ativo: form.ativo !== false,
        gradePadrao: Number(g.gradePadrao) || 0,
        lote: Number(g.lote) || 0,
        estoque: Number(g.estoque) || 0,
        processo: Number(g.processo) || 0,
        carteira: Number(g.carteira) || 0,
        vendaAcm: Number(g.vendaAcm) || 0,
        projVenda: (Number(form.projecaoTotal) || 0) * ((Number(g.gradePadrao) || 0) / 100),
        rowRevision: 1,
        updatedAt: carimbo,
      });
      salvos++;
    }

    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    return { ok: true, tamanhos: salvos, removidos: 0 };
  },

  /**
   * Exclui linhas selecionadas da programação.
   */
  async excluirLinhas(ids: string[]) {
    const db = await getDb();
    const tx = db.transaction("programacao", "readwrite");
    const store = tx.objectStore("programacao");
    for (const id of ids) {
      store.delete(id);
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    return { ok: true, excluidas: ids.length };
  },

  /**
   * Altera status ativo/inativo de uma linha.
   */
  async alternarAtivo(id: string, ativo: boolean) {
    const db = await getDb();
    const tx = db.transaction("programacao", "readwrite");
    const store = tx.objectStore("programacao");
    const req = store.get(id);

    await new Promise<void>((res, rej) => {
      req.onsuccess = () => {
        const item = req.result;
        if (item) {
          item.ativo = ativo;
          item.rowRevision = (item.rowRevision || 0) + 1;
          store.put(item);
        }
        res();
      };
      req.onerror = () => rej(req.error);
    });

    return { ok: true };
  },

  /**
   * Obtém dados para módulos de consulta (Estoque, Consumo, Relatórios).
   */
  async obterModulos() {
    const [materiais, consumo, importacoes] = await Promise.all([
      getAllFromStore<any>("estoque_materiais"),
      getAllFromStore<any>("consumo"),
      getAllFromStore<any>("importacoes"),
    ]);

    const produtosComConsumo = new Set(consumo.map((c: any) => `${c.produto}|${c.corProduto}`)).size;

    return {
      ok: true,
      materiais,
      consumo,
      importacoes: importacoes.sort((a, b) => (b.id || 0) - (a.id || 0)),
      totais: {
        materiais: materiais.length,
        consumo: consumo.length,
        produtosComConsumo,
      },
    };
  },

  /**
   * Obtém dados para a fila de prioridades (pedidos x estoque).
   */
  async obterPrioridades() {
    const [pedidos, pedidosItens, programacao, produtos] = await Promise.all([
      getAllFromStore<any>("pedidos"),
      getAllFromStore<any>("pedidos_itens"),
      getAllFromStore<any>("programacao"),
      getAllFromStore<any>("produtos"),
    ]);

    const normalizarNum = (num: any) => String(num ?? "").trim().toUpperCase();
    const pedidosMap = new Map<string, any>();
    for (const p of pedidos) {
      const chaveExata = normalizarNum(p.numero);
      pedidosMap.set(chaveExata, p);
      const chaveSemZeros = chaveExata.replace(/^0+/, "");
      if (chaveSemZeros && !pedidosMap.has(chaveSemZeros)) {
        pedidosMap.set(chaveSemZeros, p);
      }
    }

    const pedidosCombinados = pedidosItens
      .filter((pi: any) => (Number(pi.qtdePedida) || 0) > (Number(pi.qtdeExpedida) || 0))
      .map((pi: any) => {
        const numNorm = normalizarNum(pi.numero);
        const p = pedidosMap.get(numNorm) || pedidosMap.get(numNorm.replace(/^0+/, "")) || {};
        return {
          numero: String(pi.numero || "").trim(),
          referencia: String(pi.referencia || "").trim().toUpperCase(),
          cor: String(pi.cor || "").trim().toUpperCase(),
          tam: String(pi.tam || "").trim().toUpperCase(),
          qtdePedida: Number(pi.qtdePedida) || 0,
          qtdeExpedida: Number(pi.qtdeExpedida) || 0,
          dtEntrega: p.dtEntrega || "",
          dtEmissao: p.dtEmissao || "",
          descStatus: p.descStatus || p.status || "",
        };
      });

    // Saldo unificado de estoque: considera 721 (programacao) e 2024 (produtos acabados)
    const estoqueMap = new Map<string, number>();
    for (const l of programacao) {
      const qtd = Number(l.estoque) || 0;
      if (qtd > 0) {
        const k = `${String(l.referencia).trim().toUpperCase()}|${String(l.cor).trim().toUpperCase()}|${String(l.tam).trim().toUpperCase()}`;
        estoqueMap.set(k, qtd);
      }
    }
    for (const prod of produtos) {
      const qtd = Number(prod.quantidade) || 0;
      if (qtd > 0) {
        const k = `${String(prod.referencia).trim().toUpperCase()}|${String(prod.cor).trim().toUpperCase()}|${String(prod.tam).trim().toUpperCase()}`;
        const atual = estoqueMap.get(k) || 0;
        estoqueMap.set(k, Math.max(atual, qtd));
      }
    }

    const estoque = Array.from(estoqueMap.entries()).map(([k, saldo]) => {
      const [referencia, cor, tam] = k.split("|");
      return { referencia, cor, tam, estoque: saldo };
    });

    return {
      ok: true,
      pedidos: pedidosCombinados,
      estoque,
    };
  },

  /**
   * Obtém ordens pendentes e itens de pedidos para acompanhamento de retorno.
   */
  async obterOrdens() {
    const [ordens, pedidos, pedidosItens] = await Promise.all([
      getAllFromStore<any>("ordens_pendentes"),
      getAllFromStore<any>("pedidos"),
      getAllFromStore<any>("pedidos_itens"),
    ]);

    const normalizarNum = (num: any) => String(num ?? "").trim().toUpperCase();
    const pedidosMap = new Map<string, any>();
    for (const p of pedidos) {
      const chaveExata = normalizarNum(p.numero);
      pedidosMap.set(chaveExata, p);
      const chaveSemZeros = chaveExata.replace(/^0+/, "");
      if (chaveSemZeros && !pedidosMap.has(chaveSemZeros)) {
        pedidosMap.set(chaveSemZeros, p);
      }
    }

    const pedidosPendentes = pedidosItens
      .filter((pi: any) => (Number(pi.qtdePedida) || 0) > (Number(pi.qtdeExpedida) || 0))
      .map((pi: any) => {
        const numNorm = normalizarNum(pi.numero);
        const p = pedidosMap.get(numNorm) || pedidosMap.get(numNorm.replace(/^0+/, "")) || {};
        return {
          numero: String(pi.numero || "").trim(),
          referencia: String(pi.referencia || "").trim().toUpperCase(),
          cor: String(pi.cor || "").trim().toUpperCase(),
          tam: String(pi.tam || "").trim().toUpperCase(),
          qtdePedida: Number(pi.qtdePedida) || 0,
          qtdeExpedida: Number(pi.qtdeExpedida) || 0,
          dtEntrega: p.dtEntrega || "",
        };
      });

    return {
      ok: true,
      ordens: ordens.filter((o: any) => (Number(o.quantPendente) || 0) > 0),
      pedidos: pedidosPendentes,
    };
  },

  /**
   * Obtém coleções cadastradas cruzando produtos e tabela colecoes.
   */
  async obterColecoes() {
    const [produtos, colecoes] = await Promise.all([
      getAllFromStore<any>("produtos"),
      getAllFromStore<any>("colecoes"),
    ]);

    const produtosPorColecao = new Map<string, Set<string>>();
    for (const p of produtos) {
      const col = (p.colecaoNome || p.colecao || "").trim().toUpperCase();
      if (!col) continue;
      if (!produtosPorColecao.has(col)) {
        produtosPorColecao.set(col, new Set());
      }
      produtosPorColecao.get(col)!.add(`${p.referencia}|${p.cor}`);
    }

    const colecoesMap = new Map<string, any>();
    for (const c of colecoes) {
      if (c.nome) colecoesMap.set(c.nome.trim().toUpperCase(), c);
    }

    const todosNomes = new Set([...produtosPorColecao.keys(), ...colecoesMap.keys()]);
    const lista = [...todosNomes].map((nome) => {
      const guardada = colecoesMap.get(nome) || {};
      const prods = produtosPorColecao.get(nome)?.size || 0;
      return {
        nome,
        produtos: prods,
        lancamento: guardada.lancamento || "",
        arquivo: guardada.arquivo || "",
        origem: guardada.origem || (guardada.lancamento ? "manual" : ""),
        atualizadoPor: guardada.atualizadoPor || "",
        atualizadoEm: guardada.atualizadoEm || "",
      };
    });

    lista.sort((a, b) => b.produtos - a.produtos || a.nome.localeCompare(b.nome));

    return {
      ok: true,
      podeEditar: true,
      colecoes: lista,
    };
  },

  /**
   * Salva uma coleção específica.
   */
  async salvarColecao(nome: string, lancamento: string, arquivo: string, atualizadoPor = "Usuário") {
    const nomeNorm = nome.trim().toUpperCase();
    const item = {
      nome: nomeNorm,
      lancamento: lancamento.trim(),
      arquivo: arquivo.trim(),
      origem: "manual",
      atualizadoPor,
      atualizadoEm: new Date().toISOString(),
    };
    await putInStore("colecoes", [item]);
    return { ok: true };
  },

  /**
   * Salva lista de datas de lançamento de coleções.
   */
  async salvarColecoes(colecoes: Array<{ nome: string; lancamento: string; arquivo?: string }>) {
    const carimbo = new Date().toISOString();
    const itens = colecoes.map((c) => ({
      nome: c.nome.trim().toUpperCase(),
      lancamento: c.lancamento.trim(),
      arquivo: (c.arquivo || "").trim(),
      origem: "manual",
      atualizadoPor: "Usuário",
      atualizadoEm: carimbo,
    }));
    await putInStore("colecoes", itens);
    return { ok: true, gravadas: colecoes.length };
  },

  /**
   * Retorna produtos e coleções para recorte de relatórios (ex: 721).
   */
  async obterColecoesProdutos() {
    const [produtos, colecoes] = await Promise.all([
      getAllFromStore<any>("produtos"),
      getAllFromStore<any>("colecoes"),
    ]);

    const prods = produtos
      .filter((p: any) => p.colecaoNome || p.colecao)
      .map((p: any) => ({
        referencia: p.referencia,
        cor: p.cor,
        colecaoNome: p.colecaoNome || p.colecao,
      }));

    const cols = colecoes
      .filter((c: any) => c.arquivo)
      .map((c: any) => ({
        nome: c.nome,
        arquivo: c.arquivo,
      }));

    return {
      ok: true,
      produtos: prods,
      colecoes: cols,
    };
  },

  /**
   * Obtém contadores e histórico de importações para a tela Importar.
   */
  async obterSituacao() {
    const [prog, prod, mat, cons, ped, pedItens, imp] = await Promise.all([
      getAllFromStore<any>("programacao"),
      getAllFromStore<any>("produtos"),
      getAllFromStore<any>("estoque_materiais"),
      getAllFromStore<any>("consumo"),
      getAllFromStore<any>("pedidos"),
      getAllFromStore<any>("pedidos_itens"),
      getAllFromStore<any>("importacoes"),
    ]);

    return {
      ok: true,
      contagens: {
        programacao: prog.length,
        produtos: prod.length,
        materiais: mat.length,
        consumo: cons.length,
        pedidos: ped.length,
        pedidosItens: pedItens.length,
      },
      importacoes: imp.sort((a, b) => (b.id || 0) - (a.id || 0)),
    };
  },

  /**
   * Obtém histórico de auditoria de alterações de um item.
   */
  async obterHistorico(id: string) {
    const hist = await getAllFromStore<any>("historico");
    const partes = id.split("-");
    const ref = partes[0];
    return hist.filter((h: any) => h.referencia === ref);
  },

  /**
   * Grava dados de importação de arquivos do SISPLAN diretamente no IndexedDB.
   */
  async salvarImportacao(dados: DadosEnvio, aoProgredir?: (enviados: number, total: number) => void): Promise<ResultadoEnvio> {
    const itens = (dados.itens || []) as any[];
    const db = await getDb();
    const carimbo = new Date().toISOString();
    let gravadas = 0;

    if (dados.tipo === "MOVIMENTO") {
      const tx = db.transaction("programacao", "readwrite");
      const store = tx.objectStore("programacao");

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const id = `${item.referencia}-${item.tam}-${item.cor}`.toUpperCase();

        const req = store.get(id);
        await new Promise<void>((res) => {
          req.onsuccess = () => {
            const existente = req.result || {};
            store.put({
              ...existente,
              id,
              referencia: item.referencia,
              tam: item.tam,
              cor: item.cor,
              estoque: Number(item.estoque) || 0,
              processo: Number(item.processo) || 0,
              carteira: Number(item.carteira) || 0,
              vendaAcm: Number(item.vendaAcm) || 0,
              updatedAt: carimbo,
            });
            gravadas++;
            res();
          };
        });

        if (aoProgredir && i % 100 === 0) aoProgredir(i, itens.length);
      }
    } else if (dados.tipo === "ESTOQUE_MATERIAL") {
      await clearStore("estoque_materiais");
      const tx = db.transaction("estoque_materiais", "readwrite");
      const store = tx.objectStore("estoque_materiais");

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const id = `${item.codigoMaterial}|${item.codigoCor}`.toUpperCase();
        store.put({ ...item, id, updatedAt: carimbo });
        gravadas++;
        if (aoProgredir && i % 100 === 0) aoProgredir(i, itens.length);
      }
    } else if (dados.tipo === "ESTOQUE_PRODUTO") {
      await clearStore("produtos");
      const tx = db.transaction(["produtos", "colecoes"], "readwrite");
      const prodStore = tx.objectStore("produtos");
      const colStore = tx.objectStore("colecoes");

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const id = `${item.referencia}|${item.cor}|${item.tam}`.toUpperCase();
        prodStore.put({ ...item, id, updatedAt: carimbo });

        if (item.colecaoNome) {
          colStore.put({
            nome: item.colecaoNome.trim().toUpperCase(),
            lancamento: "",
          });
        }
        gravadas++;
        if (aoProgredir && i % 100 === 0) aoProgredir(i, itens.length);
      }
    } else if (dados.tipo === "CONSUMO") {
      if (dados.consolidado) {
        await clearStore("consumo");
      }
      const tx = db.transaction("consumo", "readwrite");
      const store = tx.objectStore("consumo");

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const id = `${item.produto}|${item.corProduto}|${item.codigo}|${item.faixa || "F0"}|${item.corMaterial || "0"}`.toUpperCase();
        store.put({ ...item, id, updatedAt: carimbo });
        gravadas++;
        if (aoProgredir && i % 100 === 0) aoProgredir(i, itens.length);
      }
    } else if (dados.tipo === "PLANILHA") {
      const tx = db.transaction("programacao", "readwrite");
      const store = tx.objectStore("programacao");

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const id = `${item.referencia}-${item.tam}-${item.cor}`.toUpperCase();

        const req = store.get(id);
        await new Promise<void>((res) => {
          req.onsuccess = () => {
            const existente = req.result || {};
            store.put({
              ...existente,
              id,
              referencia: item.referencia,
              tam: item.tam,
              cor: item.cor,
              projVenda: Number(item.projVenda) || existente.projVenda || 0,
              lancamento: item.lancamento || existente.lancamento || "",
              deadline: item.deadline || existente.deadline || "",
              lote: Number(item.lote) || existente.lote || 0,
              faccao: item.faccao || existente.faccao || "",
              capacidade: Number(item.capacidade) || existente.capacidade || 1,
              unidade: Number(item.unidade) || existente.unidade || 1,
              precoCostura: Number(item.precoCostura) || existente.precoCostura || 0,
              obsProduto: item.obsProduto || existente.obsProduto || "",
              curvaProducao: item.curvaProducao || existente.curvaProducao || "basico",
              updatedAt: carimbo,
            });
            gravadas++;
            res();
          };
        });

        if (aoProgredir && i % 100 === 0) aoProgredir(i, itens.length);
      }
    } else if (dados.tipo === "PLANEJAMENTO") {
      const tx = db.transaction("planejamento", "readwrite");
      const store = tx.objectStore("planejamento");

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const id = `${item.referencia}|${item.cor}`.toUpperCase();
        store.put({ ...item, id, updatedAt: carimbo });
        gravadas++;
        if (aoProgredir && i % 100 === 0) aoProgredir(i, itens.length);
      }
    } else if (dados.tipo === "PEDIDOS") {
      await clearStore("pedidos");
      const tx = db.transaction("pedidos", "readwrite");
      const store = tx.objectStore("pedidos");

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        store.put({ ...item, updatedAt: carimbo });
        gravadas++;
        if (aoProgredir && i % 100 === 0) aoProgredir(i, itens.length);
      }
    } else if (dados.tipo === "PRODUTOS_PEDIDO") {
      await clearStore("pedidos_itens");
      const tx = db.transaction("pedidos_itens", "readwrite");
      const store = tx.objectStore("pedidos_itens");

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const id = `${item.numero}|${item.referencia}|${item.cor}|${item.tam}`.toUpperCase();
        store.put({ ...item, id, updatedAt: carimbo });
        gravadas++;
        if (aoProgredir && i % 100 === 0) aoProgredir(i, itens.length);
      }
    } else if (dados.tipo === "ORDENS_PENDENTES") {
      await clearStore("ordens_pendentes");
      const tx = db.transaction("ordens_pendentes", "readwrite");
      const store = tx.objectStore("ordens_pendentes");

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        const id = `${item.op}|${item.referencia}|${item.cor}|${item.tam}`.toUpperCase();
        store.put({ ...item, id, updatedAt: carimbo });
        gravadas++;
        if (aoProgredir && i % 100 === 0) aoProgredir(i, itens.length);
      }
    }

    // Registra importação no histórico
    const txImp = db.transaction("importacoes", "readwrite");
    txImp.objectStore("importacoes").put({
      tipo: dados.tipo,
      variacao: dados.variacao || "",
      arquivo: dados.arquivo || "",
      dataArquivo: dados.dataArquivo || "",
      linhasLidas: dados.resumo?.lidas || itens.length,
      linhasAproveitadas: gravadas,
      usuario: "Sistema",
      importadoEm: carimbo,
    });

    aoProgredir?.(itens.length, itens.length);
    return { gravadas, removidas: 0, blocos: 1 };
  },

  /**
   * Preenche a base com dados de demonstração reais para teste imediato.
   */
  async carregarDemonstracao() {
    const hoje = new Date().toISOString().slice(0, 10);

    const progs = [
      {
        id: "146RF-P-000001",
        referencia: "146RF",
        tam: "P",
        cor: "000001",
        corNome: "BRANCO",
        descricao: "CUECA BOXER MICROFIBRA",
        colecao: "72",
        colecaoNome: "BASICO 2026",
        projVenda: 1200,
        gradePadrao: 20,
        curvaProducao: "basico",
        lancamento: "2026-02-01",
        deadline: "2026-11-30",
        leadTime: 30,
        estoque: 140,
        processo: 200,
        carteira: 180,
        vendaAcm: 450,
        lote: 300,
        faccao: "FACCAO SAO JOSE",
        capacidade: 500,
        unidade: 1,
        precoCostura: 4.5,
        ativo: true,
      },
      {
        id: "146RF-M-000001",
        referencia: "146RF",
        tam: "M",
        cor: "000001",
        corNome: "BRANCO",
        descricao: "CUECA BOXER MICROFIBRA",
        colecao: "72",
        colecaoNome: "BASICO 2026",
        projVenda: 2400,
        gradePadrao: 40,
        curvaProducao: "basico",
        lancamento: "2026-02-01",
        deadline: "2026-11-30",
        leadTime: 30,
        estoque: 80,
        processo: 400,
        carteira: 520,
        vendaAcm: 920,
        lote: 600,
        faccao: "FACCAO SAO JOSE",
        capacidade: 500,
        unidade: 1,
        precoCostura: 4.5,
        ativo: true,
      },
      {
        id: "146RF-G-000001",
        referencia: "146RF",
        tam: "G",
        cor: "000001",
        corNome: "BRANCO",
        descricao: "CUECA BOXER MICROFIBRA",
        colecao: "72",
        colecaoNome: "BASICO 2026",
        projVenda: 1800,
        gradePadrao: 30,
        curvaProducao: "basico",
        lancamento: "2026-02-01",
        deadline: "2026-11-30",
        leadTime: 30,
        estoque: 40,
        processo: 300,
        carteira: 380,
        vendaAcm: 680,
        lote: 450,
        faccao: "FACCAO SAO JOSE",
        capacidade: 500,
        unidade: 1,
        precoCostura: 4.5,
        ativo: true,
      },
      {
        id: "146RF-GG-000001",
        referencia: "146RF",
        tam: "GG",
        cor: "000001",
        corNome: "BRANCO",
        descricao: "CUECA BOXER MICROFIBRA",
        colecao: "72",
        colecaoNome: "BASICO 2026",
        projVenda: 600,
        gradePadrao: 10,
        curvaProducao: "basico",
        lancamento: "2026-02-01",
        deadline: "2026-11-30",
        leadTime: 30,
        estoque: 15,
        processo: 100,
        carteira: 140,
        vendaAcm: 210,
        lote: 150,
        faccao: "FACCAO SAO JOSE",
        capacidade: 500,
        unidade: 1,
        precoCostura: 4.5,
        ativo: true,
      },
      {
        id: "202A1-M-242008",
        referencia: "202A1",
        tam: "M",
        cor: "242008",
        corNome: "AZUL MARINHO",
        descricao: "CAMISETA SLIM ALGODAO",
        colecao: "85",
        colecaoNome: "INVERNO 2026",
        projVenda: 1500,
        gradePadrao: 50,
        curvaProducao: "moda",
        lancamento: "2026-03-15",
        deadline: "2026-08-30",
        leadTime: 45,
        estoque: 20,
        processo: 150,
        carteira: 400,
        vendaAcm: 600,
        lote: 400,
        faccao: "FACCAO DO VALE",
        capacidade: 350,
        unidade: 1,
        precoCostura: 7.2,
        ativo: true,
      },
    ];

    const consumo = [
      {
        id: "146RF|000001|TEC01|F0|0",
        produto: "146RF",
        corProduto: "000001",
        codigo: "TEC01",
        descricao: "MICROFIBRA DE POLIAMIDA 180G",
        materialTipo: "TECIDO",
        corMaterial: "000001",
        corMaterialNome: "BRANCO",
        consumo: 0.18,
        unid: "KG",
        faixa: "F0",
        aplicacao: "CORPO",
      },
      {
        id: "146RF|000001|ELA01|F0|0",
        produto: "146RF",
        corProduto: "000001",
        codigo: "ELA01",
        descricao: "ELASTICO PERSONALIZADO 35MM",
        materialTipo: "ELASTICO",
        corMaterial: "000001",
        corMaterialNome: "BRANCO",
        consumo: 0.72,
        unid: "M",
        faixa: "F0",
        aplicacao: "CINTURA",
      },
    ];

    const materiais = [
      {
        id: "TEC01|000001",
        codigoMaterial: "TEC01",
        codigoCor: "000001",
        descricao: "MICROFIBRA DE POLIAMIDA 180G",
        nomeCor: "BRANCO",
        unidade: "KG",
        quantidade: 450,
        reservado: 270,
        disponivel: 180,
        descGrupo: "TECIDO",
        linhasSomadas: 1,
        depositos: "ALMOX-01",
      },
      {
        id: "ELA01|000001",
        codigoMaterial: "ELA01",
        codigoCor: "000001",
        descricao: "ELASTICO PERSONALIZADO 35MM",
        nomeCor: "BRANCO",
        unidade: "M",
        quantidade: 1200,
        reservado: 1080,
        disponivel: 120,
        descGrupo: "ELASTICO",
        linhasSomadas: 1,
        depositos: "ALMOX-01",
      },
    ];

    const colecoes = [
      { nome: "BASICO 2026", lancamento: "2026-02-01" },
      { nome: "INVERNO 2026", lancamento: "2026-03-15" },
    ];

    const ordens = [
      {
        id: "OP-1029|146RF|000001|M",
        op: "1029",
        referencia: "146RF",
        cor: "000001",
        corNome: "BRANCO",
        tam: "M",
        descricao: "CUECA BOXER MICROFIBRA",
        faccao: "FACCAO SAO JOSE",
        colecao: "BASICO 2026",
        quantPendente: 400,
        dtSaida: "2026-09-10",
        dtRetorno: "2026-10-25",
        diasPendente: 35,
        status: "EM COSTURA",
        setor: "COSTURA",
      },
    ];

    const pedidos = [
      {
        numero: "PED-8841",
        dtEntrega: "2026-10-20",
        dtEmissao: "2026-09-01",
        descStatus: "LIBERADO",
      },
    ];

    const pedidosItens = [
      {
        id: "PED-8841|146RF|000001|M",
        numero: "PED-8841",
        referencia: "146RF",
        cor: "000001",
        tam: "M",
        qtdePedida: 350,
        qtdeExpedida: 0,
      },
    ];

    await clearStore("programacao");
    await clearStore("consumo");
    await clearStore("estoque_materiais");
    await clearStore("colecoes");
    await clearStore("ordens_pendentes");
    await clearStore("pedidos");
    await clearStore("pedidos_itens");

    await putInStore("programacao", progs);
    await putInStore("consumo", consumo);
    await putInStore("estoque_materiais", materiais);
    await putInStore("colecoes", colecoes);
    await putInStore("ordens_pendentes", ordens);
    await putInStore("pedidos", pedidos);
    await putInStore("pedidos_itens", pedidosItens);
    await putInStore("importacoes", [
      {
        tipo: "MOVIMENTO",
        variacao: "DEMONSTRACAO",
        arquivo: "dados-demo.csv",
        dataArquivo: hoje,
        linhasLidas: progs.length,
        linhasAproveitadas: progs.length,
        usuario: "Demonstração",
        importadoEm: new Date().toISOString(),
      },
    ]);
  },
};
