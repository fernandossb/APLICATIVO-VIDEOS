import { useState } from "react";
import { signIn } from "../lib/auth";

export default function LoginScreen() {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const { error } = await signIn(usuario, senha);
    setEnviando(false);
    if (error) setErro("Usuário ou senha inválidos.");
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand-mark login-brand-mark">CF</div>
        <h1>CosturaFlow</h1>
        <p className="muted">Entre com seu usuário para acessar</p>

        <label className="login-field">
          Usuário
          <input
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="nome.sobrenome"
            autoComplete="username"
            required
            autoFocus
          />
        </label>
        <label className="login-field">
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {erro && <p className="login-erro">{erro}</p>}

        <button type="submit" className="button button-primary full-width" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
