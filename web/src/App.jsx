import { useEffect, useState } from "react";
import FichasPage from "./pages/FichasPage";
import OperacoesPage from "./pages/OperacoesPage";
import QualidadeDashboardPage from "./pages/QualidadeDashboardPage";
import InspecoesPage from "./pages/InspecoesPage";
import LoginScreen from "./components/LoginScreen";
import CapacidadeIndicador from "./components/CapacidadeIndicador";
import { getSession, onAuthStateChange, signOut } from "./lib/auth";
import { supabaseConfigured } from "./lib/supabase";
import { NAV } from "./data/constants";

const PAGES = {
  "ficha-tecnica": FichasPage,
  "banco-operacoes": OperacoesPage,
  "qualidade-dashboard": QualidadeDashboardPage,
  "qualidade-inspecoes": InspecoesPage,
};

export default function App() {
  const [view, setView] = useState("ficha-tecnica");
  const [sessao, setSessao] = useState(supabaseConfigured ? undefined : null);

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

  return (
    <div className="app-shell">
      <nav className="nav-rail">
        <div className="nav-brand">
          <div className="brand-mark">CF</div>
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
                onClick={() => setView(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}

        <div className="nav-footer">
          <CapacidadeIndicador />
          {sessao && (
            <div className="nav-user">
              <span title={sessao.user.email}>{sessao.user.email}</span>
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
