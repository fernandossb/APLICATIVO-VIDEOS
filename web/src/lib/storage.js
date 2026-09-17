import { supabase, supabaseConfigured } from "./supabase";

function localKeyFor(table) {
  return `costuraflow.${table}`;
}

function readLocal(table) {
  try {
    return JSON.parse(localStorage.getItem(localKeyFor(table)) || "{}");
  } catch {
    return {};
  }
}

function writeLocal(table, all) {
  localStorage.setItem(localKeyFor(table), JSON.stringify(all));
}

function createStore(table, toColumns = () => ({})) {
  async function save(record) {
    const id = record.id || crypto.randomUUID();
    const toSave = { ...record, id, atualizadoEm: new Date().toISOString() };
    if (!toSave.criadoEm) toSave.criadoEm = toSave.atualizadoEm;

    if (supabaseConfigured) {
      const { error } = await supabase.from(table).upsert({
        id,
        ...toColumns(toSave),
        dados: toSave,
        atualizado_em: toSave.atualizadoEm,
      });
      if (error) throw error;
      return { record: toSave, persistedTo: "supabase" };
    }

    const all = readLocal(table);
    all[id] = toSave;
    writeLocal(table, all);
    return { record: toSave, persistedTo: "local" };
  }

  async function load(id) {
    if (supabaseConfigured) {
      const { data, error } = await supabase.from(table).select("dados").eq("id", id).single();
      if (error) throw error;
      return data?.dados ?? null;
    }
    const all = readLocal(table);
    return all[id] ?? null;
  }

  async function list() {
    if (supabaseConfigured) {
      const { data, error } = await supabase
        .from(table)
        .select("id, dados, atualizado_em, criado_em")
        .order("atualizado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row.dados,
        id: row.id,
        atualizadoEm: row.atualizado_em,
        criadoEm: row.criado_em,
      }));
    }

    const all = readLocal(table);
    return Object.values(all).sort((a, b) => (b.atualizadoEm || "").localeCompare(a.atualizadoEm || ""));
  }

  async function remove(id) {
    if (supabaseConfigured) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      return;
    }
    const all = readLocal(table);
    delete all[id];
    writeLocal(table, all);
  }

  return { save, load, list, remove };
}

export const fichasStore = createStore("fichas", (f) => ({ referencia: f.referencia ?? null }));
export const operacoesStore = createStore("operacoes", (o) => ({ codigo: o.codigo ?? null }));
export const inspecoesStore = createStore("inspecoes");
