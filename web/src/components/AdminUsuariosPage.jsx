import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

async function chamarFuncao(method, corpo) {
  const { data: sessaoAtual } = await supabase.auth.getSession();
  const token = sessaoAtual.session?.access_token;
  const res = await fetch("/api/admin-usuarios", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await res.json();
  if (!res.ok) throw new Error(dados.error || "Erro desconhecido.");
  return dados;
}

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [status, setStatus] = useState("");
  const [novoUsuario, setNovoUsuario] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoRole, setNovoRole] = useState("usuario");

  const carregar = async () => {
    try {
      const { usuarios } = await chamarFuncao("GET");
      setUsuarios(usuarios);
    } catch (err) {
      setStatus(`Erro ao carregar usuários: ${err.message}`);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const handleCriar = async (e) => {
    e.preventDefault();
    setStatus("Criando...");
    try {
      await chamarFuncao("POST", { usuario: novoUsuario, senha: novaSenha, role: novoRole });
      setNovoUsuario("");
      setNovaSenha("");
      setNovoRole("usuario");
      await carregar();
      setStatus("Usuário criado.");
    } catch (err) {
      setStatus(`Erro ao criar: ${err.message}`);
    }
  };

  const handleExcluir = async (u) => {
    if (!window.confirm(`Excluir o acesso de "${u.usuario}"? Isso não pode ser desfeito.`)) return;
    setStatus("Excluindo...");
    try {
      await chamarFuncao("DELETE", { id: u.id });
      await carregar();
      setStatus("Usuário excluído.");
    } catch (err) {
      setStatus(`Erro ao excluir: ${err.message}`);
    }
  };

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Administração</p>
          <h1>Usuários</h1>
        </div>
        <div className="topbar-actions">{status && <span className="status-pill">{status}</span>}</div>
      </header>

      <section className="content-panel">
        <form className="admin-novo-usuario" onSubmit={handleCriar}>
          <h3 className="sub" style={{ marginTop: 0 }}>
            Novo usuário
          </h3>
          <div className="field-grid-edit">
            <label>
              Usuário
              <input
                value={novoUsuario}
                onChange={(e) => setNovoUsuario(e.target.value)}
                placeholder="nome.sobrenome"
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
                minLength={6}
              />
            </label>
            <label>
              Perfil
              <select value={novoRole} onChange={(e) => setNovoRole(e.target.value)}>
                <option value="usuario">Usuário</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
          </div>
          <button type="submit" className="button button-primary" style={{ marginTop: 12 }}>
            + Criar usuário
          </button>
        </form>

        <h3 className="sub">Usuários existentes</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Criado em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.usuario}</td>
                  <td>{u.role === "admin" ? "Administrador" : "Usuário"}</td>
                  <td className="muted">{new Date(u.criadoEm).toLocaleDateString("pt-BR")}</td>
                  <td>
                    <button
                      type="button"
                      className="icon-button tiny"
                      title="Excluir usuário"
                      onClick={() => handleExcluir(u)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">Nenhum usuário ainda.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
