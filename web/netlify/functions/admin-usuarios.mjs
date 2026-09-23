import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOMINIO = "costuraflow.local";

function clienteAdmin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function usuarioAdminAutenticado(req, supabaseAdmin) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  if (data.user.app_metadata?.role !== "admin") return null;
  return data.user;
}

function paraUsuario(u) {
  return {
    id: u.id,
    usuario: (u.email || "").split(`@${DOMINIO}`)[0],
    role: u.app_metadata?.role || "usuario",
    criadoEm: u.created_at,
  };
}

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return Response.json(
      { error: "Configuração ausente no servidor: falta SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente do Netlify." },
      { status: 501 }
    );
  }

  const supabaseAdmin = clienteAdmin();
  const chamador = await usuarioAdminAutenticado(req, supabaseAdmin);
  if (!chamador) {
    return Response.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }

  try {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      return Response.json({ usuarios: data.users.map(paraUsuario) });
    }

    if (req.method === "POST") {
      const { usuario, senha, role } = await req.json();
      const nome = String(usuario || "").trim().toLowerCase();
      if (!nome || !senha) {
        return Response.json({ error: "Informe usuário e senha." }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: `${nome}@${DOMINIO}`,
        password: senha,
        email_confirm: true,
        app_metadata: { role: role === "admin" ? "admin" : "usuario" },
      });
      if (error) throw error;
      return Response.json({ usuario: paraUsuario(data.user) });
    }

    if (req.method === "DELETE") {
      const { id } = await req.json();
      if (!id) return Response.json({ error: "Informe o id do usuário." }, { status: 400 });
      if (id === chamador.id) {
        return Response.json({ error: "Você não pode excluir seu próprio usuário." }, { status: 400 });
      }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Método não suportado." }, { status: 405 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/admin-usuarios" };
