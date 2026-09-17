import { supabase, supabaseConfigured } from "./supabase";

export function getSession() {
  if (!supabaseConfigured) return Promise.resolve(null);
  return supabase.auth.getSession().then(({ data }) => data.session);
}

export function onAuthStateChange(callback) {
  if (!supabaseConfigured) return { unsubscribe() {} };
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}

export function signIn(email, senha) {
  return supabase.auth.signInWithPassword({ email, password: senha });
}

export function signOut() {
  return supabase.auth.signOut();
}
