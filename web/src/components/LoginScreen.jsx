import { useState } from "react";
import logoUp from "../assets/logo-up.webp";
import { signIn, signUp } from "../lib/auth";

export default function LoginScreen() {
  const [modo, setModo] = useState("login"); // "login" | "cadastro"
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro("");
    setSucesso("");

    const usuarioLimpo = usuario.trim().toLowerCase();

    if (!usuarioLimpo) {
      setErro("Informe um nome de usuário.");
      return;
    }

    if (modo === "cadastro") {
      if (senha.length < 6) {
        setErro("A senha deve ter no mínimo 6 caracteres.");
        return;
      }
      if (senha !== confirmarSenha) {
        setErro("As senhas não coincidem.");
        return;
      }

      setEnviando(true);
      const { data, error } = await signUp(usuarioLimpo, senha);
      setEnviando(false);

      if (error) {
        if (error.message.includes("already registered") || error.message.includes("unique")) {
          setErro("Este usuário já está cadastrado.");
        } else {
          setErro(`Erro ao cadastrar: ${error.message}`);
        }
        return;
      }

      // Se a sessão já foi iniciada automaticamente pelo Supabase
      if (data?.session) {
        return;
      }

      // Se o Supabase exigir confirmação de e-mail, tenta autenticar diretamente
      const resLogin = await signIn(usuarioLimpo, senha);
      if (resLogin.error) {
        setSucesso("Usuário cadastrado com sucesso! Se não conseguir entrar, certifique-se de desmarcar 'Confirm email' no painel do Supabase (Authentication > Providers > Email).");
        setModo("login");
        setSenha("");
        setConfirmarSenha("");
      }
    } else {
      setEnviando(true);
      const { error } = await signIn(usuarioLimpo, senha);
      setEnviando(false);

      if (error) {
        setErro("Usuário ou senha inválidos.");
      }
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logoUp} alt="UP" className="brand-logo login-brand-logo" />
        <h1>CosturaFlow</h1>
        <p className="muted">
          {modo === "login" ? "Entre com seu usuário para acessar" : "Criar uma nova conta de acesso"}
        </p>

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
            autoComplete={modo === "login" ? "current-password" : "new-password"}
            required
            placeholder={modo === "cadastro" ? "Mínimo 6 caracteres" : ""}
          />
        </label>

        {modo === "cadastro" && (
          <label className="login-field">
            Confirmar Senha
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              autoComplete="new-password"
              required
              placeholder="Repita a senha"
            />
          </label>
        )}

        {erro && <p className="login-erro">{erro}</p>}
        {sucesso && <p className="login-sucesso">{sucesso}</p>}

        <button type="submit" className="button button-primary full-width" disabled={enviando}>
          {enviando
            ? modo === "login"
              ? "Entrando..."
              : "Cadastrando..."
            : modo === "login"
              ? "Entrar"
              : "Cadastrar e Entrar"}
        </button>

        <button
          type="button"
          className="text-button login-switch"
          onClick={() => {
            setModo(modo === "login" ? "cadastro" : "login");
            setErro("");
            setSucesso("");
          }}
        >
          {modo === "login" ? "Não tem usuário? Criar novo cadastro" : "Já possui usuário? Voltar para o login"}
        </button>
      </form>
    </div>
  );
}
