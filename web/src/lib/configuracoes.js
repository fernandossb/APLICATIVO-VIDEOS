import { supabase, supabaseConfigured } from "./supabase";

const CHAVE_PASTA_VIDEOS = "videos_folder_url";
const LOCAL_KEY = "costuraflow:videos_folder_url";

export async function obterLinkPastaVideos() {
  if (supabaseConfigured) {
    const { data, error } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", CHAVE_PASTA_VIDEOS)
      .maybeSingle();
    if (error) throw error;
    return data?.valor || "";
  }
  return localStorage.getItem(LOCAL_KEY) || "";
}

export async function salvarLinkPastaVideos(url) {
  if (supabaseConfigured) {
    const { error } = await supabase
      .from("configuracoes")
      .upsert({ chave: CHAVE_PASTA_VIDEOS, valor: url, atualizado_em: new Date().toISOString() });
    if (error) throw error;
    return;
  }
  localStorage.setItem(LOCAL_KEY, url);
}
