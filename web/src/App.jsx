import { useEffect, useState } from "react";
import logoUp from "./assets/logo-up.webp";
import FichasPage from "./pages/FichasPage";
import OperacoesPage from "./pages/OperacoesPage";
import QualidadeDashboardPage from "./pages/QualidadeDashboardPage";
import InspecoesPage from "./pages/InspecoesPage";
import LoginScreen from "./components/LoginScreen";
import CapacidadeIndicador from "./components/CapacidadeIndicador";
import AdminUsuariosPage from "./components/AdminUsuariosPage";
import { getSession, onAuthStateChange, signOut, ehAdmin, emailParaUsuario } from "./lib/auth";
import { supabaseConfigured } from "./lib/supabase";
import { NAV } from "./data/constants";

const PAGES = {
  "ficha-tecnica": FichasPage,
  "banco-operacoes": OperacoesPage,
  "qualidade-dashboard": QualidadeDashboardPage,
  "qualidade-inspecoes": InspecoesPage,
  "admin-usuarios": AdminUsuariosPage,
};

const MOBILE_QUERY = "(max-width: 860px)";

export default function App() {
  const [view, setView] = useState("ficha-tecnica");
  const [sessao, setSessao] = useState(supabaseConfigured ? undefined : null);
  // No celular os painéis (menu + lista da página) começam escondidos, já que não cabem do
  // lado do conteúdo — no computador começam abertos, como sempre foi.
  const [painelAberto, setPainelAberto] = useState(() => !window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    if (!supabaseConfigured) return;
    getSession().then(setSessao);
    const subscription = onAuthStateChange(setSessao);
    return () => subscription.unsubscribe();
  }, []);

  if (sessao === undefined) {
    return <div className="app-loading">Carregando...</div>;
  }

  if (!sessao && supabaseConfigured) {
    return <LoginScreen />;
  }

  const admin = ehAdmin(sessao);

  // No celular, escolher uma seção fecha a gaveta de novo — no computador os painéis já
  // ficam sempre visíveis nessa largura, então isso não faz diferença nenhuma lá.
  const irPara = (key) => {
    setView(key);
    if (window.matchMedia(MOBILE_QUERY).matches) setPainelAberto(false);
  };

  return (
    <div className={`app-shell ${painelAberto ? "paineis-visiveis" : "paineis-ocultos"}`}>
      <button
        type="button"
        className="painel-toggle"
        onClick={() => setPainelAberto((a) => !a)}
        title={painelAberto ? "Ocultar painéis" : "Mostrar painéis"}
      >
        {painelAberto ? "✕" : "☰"}
      </button>

      <nav className="nav-rail">
        <div className="nav-brand">
          <img src={logoUp} alt="UP" className="brand-logo" />
          <div>
            <strong>CosturaFlow</strong>
            <span>Engenharia · Qualidade</span>
          </div>
        </div>

        {NAV.map((group) => (
          <div className="nav-group" key={group.group}>
            <span className="nav-group-label">{group.group}</span>
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`nav-item${view === item.key ? " active" : ""}`}
                onClick={() => irPara(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}

        {admin && (
          <div className="nav-group">
            <span className="nav-group-label">Administração</span>
            <button
              type="button"
              className={`nav-item${view === "admin-usuarios" ? " active" : ""}`}
              onClick={() => irPara("admin-usuarios")}
            >
              Usuários
            </button>
          </div>
        )}

        <div className="nav-footer">
          <CapacidadeIndicador />
          {sessao && (
            <div className="nav-user">
              <span title={sessao.user.email}>{emailParaUsuario(sessao.user.email)}</span>
              <button type="button" onClick={signOut}>
                Sair
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="app-body">
        {Object.entries(PAGES).map(([key, Page]) => (
          <div className="page" key={key} hidden={view !== key}>
            <Page active={view === key} />
          </div>
        ))}
      </div>
    </div>
  );
}
