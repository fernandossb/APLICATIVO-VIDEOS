import { supabase, supabaseConfigured } from "./supabase";

// Login por usuário (nome.sobrenome), não e-mail. Por baixo, o Supabase Auth
// continua exigindo um e-mail — usamos um domínio interno que nunca recebe
// mensagem de verdade, só serve pra identificar a conta.
const DOMINIO = "costuraflow.local";

export function usuarioParaEmail(usuario) {
  return `${String(usuario || "").trim().toLowerCase()}@${DOMINIO}`;
}

export function emailParaUsuario(email) {
  return String(email || "").split(`@${DOMINIO}`)[0];
}

export function getSession() {
  if (!supabaseConfigured) return Promise.resolve(null);
  return supabase.auth.getSession().then(({ data }) => data.session);
}

export function onAuthStateChange(callback) {
  if (!supabaseConfigured) return { unsubscribe() {} };
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}

export function signIn(usuario, senha) {
  return supabase.auth.signInWithPassword({ email: usuarioParaEmail(usuario), password: senha });
}

export function signOut() {
  return supabase.auth.signOut();
}

export function ehAdmin(sessao) {
  return sessao?.user?.app_metadata?.role === "admin";
}
