import { useEffect, useMemo, useRef, useState } from "react";
import { montarPrioridades, extrairRupturasProdutos } from "../../lib/pcp/prioridades";
import { buscarComCache } from "../../lib/pcp/buscar";
import StatCard from "../../components/charts/StatCard";

const ALTURA_LINHA = 48;
const RESERVA = 25;

function inteiro(valor) {
  return Math.round(valor || 0).toLocaleString("pt-BR");
}

function dataBr(iso) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

function prazoTexto(dias) {
  if (dias === null || dias === undefined) return "sem data";
  if (dias < 0) return `${Math.abs(dias)}d atrasado`;
  if (dias === 0) return "hoje";
  return `em ${dias}d`;
}

export default function PcpPrioridadesPage() {
  const [pedidos, setPedidos] = useState([]);
  const [estoque, setEstoque] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");

  // Modos de filtro: "pendurados" (padrão), "cobertos", "todos"
  const [modoFiltro, setModoFiltro] = useState("pendurados");
  // Se verdadeiro, filtra apenas linhas que individualmente têm faltaProduzir > 0
  const [apenasItensFaltantes, setApenasItensFaltantes] = useState(false);

  // Painel de Ruptura de Estoque (Calendário de Desabastecimento por Produto)
  const [exibirRupturas, setExibirRupturas] = useState(false);
  const [filtroSkuRuptura, setFiltroSkuRuptura] = useState(null);

  const wrapRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaJanela, setAlturaJanela] = useState(600);
  const pendenteRolagemRef = useRef(null);

  const carregarDados = () => {
    setCarregando(true);
    setErro("");
    buscarComCache("/api/prioridades")
      .then((corpo) => {
        setPedidos(corpo.pedidos ?? []);
        setEstoque(corpo.estoque ?? []);
      })
      .catch((e) => {
        setErro(e instanceof Error ? e.message : "Falha ao carregar dados.");
      })
      .finally(() => {
        setCarregando(false);
      });
  };

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const medir = () => setAlturaJanela(el.clientHeight || 600);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [carregando, exibirRupturas]);

  function aoRolar(e) {
    const pos = e.currentTarget.scrollTop;
    if (pendenteRolagemRef.current !== null) return;
    pendenteRolagemRef.current = requestAnimationFrame(() => {
      setScrollTop(pos);
      pendenteRolagemRef.current = null;
    });
  }

  // Simulação completa: agrupada por pedido, ordenada por DT_FATURA, abatendo estoque acumulado
  const fila = useMemo(() => montarPrioridades(pedidos, estoque), [pedidos, estoque]);

  // Calendário de Rupturas compilado a partir da simulação cronológica
  const rupturas = useMemo(() => extrairRupturasProdutos(fila), [fila]);

  // Resumo estatístico
  const resumo = useMemo(() => {
    let aProduzir = 0;
    let cobertoEstoqueTotal = 0;
    let pecasAbertasTotal = 0;
    const pedidosPendentesSet = new Set();
    const pedidosCobertosSet = new Set();
    const pedidosTotaisSet = new Set();

    for (const l of fila) {
      pedidosTotaisSet.add(l.numero);
      pecasAbertasTotal += l.aberta;
      cobertoEstoqueTotal += l.cobertoPorEstoque;
      aProduzir += l.faltaProduzir;

      if (l.statusPedido === "PENDURADO") {
        pedidosPendentesSet.add(l.numero);
      } else {
        pedidosCobertosSet.add(l.numero);
      }
    }

    const primeiraDataFalta = rupturas[0]?.dtFaturaFalta || null;
    const primeiroPedidoFalta = rupturas[0]?.primeiroPedido || "";
    const primeiroClienteFalta = rupturas[0]?.primeiroCliente || "";

    return {
      aProduzir,
      cobertoEstoqueTotal,
      pecasAbertasTotal,
      pedidosPendentes: pedidosPendentesSet.size,
      pedidosCobertos: pedidosCobertosSet.size,
      pedidosTotais: pedidosTotaisSet.size,
      skusComFalta: rupturas.length,
      primeiraDataFalta,
      primeiroPedidoFalta,
      primeiroClienteFalta,
    };
  }, [fila, rupturas]);

  // Filtragem da lista de exibição
  const filtrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return fila.filter((l) => {
      // Filtro de SKU selecionado no painel de rupturas
      if (filtroSkuRuptura && l.sku !== filtroSkuRuptura) return false;

      // Filtro de status do pedido
      if (modoFiltro === "pendurados" && l.statusPedido !== "PENDURADO") return false;
      if (modoFiltro === "cobertos" && l.statusPedido !== "COBERTO") return false;

      // Filtro secundário: apenas linhas com falta > 0
      if (apenasItensFaltantes && l.faltaProduzir <= 0) return false;

      // Filtro de busca textual
      if (!termo) return true;
      const alvo = `${l.numero} ${l.cliente} ${l.cidade} ${l.estado} ${l.referencia} ${l.descricao} ${l.cor} ${l.descCor} ${l.tam} ${l.descStatus}`.toLowerCase();
      return alvo.includes(termo);
    });
  }, [fila, busca, modoFiltro, apenasItensFaltantes, filtroSkuRuptura]);

  const primeiroIndice = Math.max(0, Math.floor(scrollTop / ALTURA_LINHA) - RESERVA);
  const ultimoIndice = Math.min(filtrada.length, Math.ceil((scrollTop + alturaJanela) / ALTURA_LINHA) + RESERVA);
  const janela = filtrada.slice(primeiroIndice, ultimoIndice);
  const alturaAntes = primeiroIndice * ALTURA_LINHA;
  const alturaDepois = (filtrada.length - ultimoIndice) * ALTURA_LINHA;

  function resetarRolagem() {
    setScrollTop(0);
    if (wrapRef.current) wrapRef.current.scrollTop = 0;
  }

  function exportar() {
    if (filtrada.length === 0) return;
    const cabecalho = [
      "Ordem Fatura",
      "Pedido",
      "Cliente",
      "Cidade",
      "Estado",
      "Data Fatura",
      "Data Entrega",
      "Situacao Pedido",
      "Referencia",
      "Descricao",
      "Cor",
      "Desc Cor",
      "Tamanho",
      "Qtd Aberta",
      "Coberto Estoque",
      "Falta Produzir",
      "Data Inicio Ruptura",
      "Status ERP",
    ];
    const corpo = filtrada.map((l) =>
      [
        l.ordemFila,
        l.numero,
        l.cliente || "",
        l.cidade || "",
        l.estado || "",
        dataBr(l.dtFatura),
        dataBr(l.dtEntrega),
        l.statusPedido,
        l.referencia,
        l.descricao || "",
        l.cor,
        l.descCor || "",
        l.tam,
        Math.round(l.aberta),
        Math.round(l.cobertoPorEstoque),
        Math.round(l.faltaProduzir),
        l.dtFaturaPrimeiraFalta ? dataBr(l.dtFaturaPrimeiraFalta) : "Sem falta",
        l.descStatus || "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const url = URL.createObjectURL(
      new Blob([[cabecalho.join(";"), ...corpo].join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `prioridades-faturamento-estoque-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="workspace">
      <header className="topbar no-print">
        <div className="sheet-header-inline">
          <p className="overline">PCP · Simulação de Faturamento por Estoque</p>
          <h1>Fila de Produção & Prioridades</h1>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className={`button ${exibirRupturas ? "button-primary" : "button-outline"}`}
            onClick={() => setExibirRupturas((v) => !v)}
            title="Visualizar a partir de que data cada produto vai faltar"
          >
            📅 Calendário de Rupturas ({inteiro(rupturas.length)})
          </button>
          <button type="button" className="button button-outline" onClick={exportar} disabled={filtrada.length === 0}>
            📥 Exportar CSV
          </button>
          <button type="button" className="button button-outline" onClick={() => window.print()} disabled={filtrada.length === 0}>
            🖨 Imprimir
          </button>
          <button
            type="button"
            className="button button-outline button-icon"
            onClick={carregarDados}
            title="Recarregar dados"
          >
            🔄
          </button>
          <span className="status-pill">{inteiro(filtrada.length)} itens na visualização</span>
        </div>
      </header>

      <section
        className="content-panel"
        style={{
          display: "flex",
          flexDirection: "column",
          margin: "14px 20px 16px",
        }}
      >
        {erro && (
          <div className="faixa-aviso erro no-print" style={{ marginBottom: 14 }}>
            <span>{erro}</span>
          </div>
        )}

        {/* Dashboard com Destaque nas Datas e Pedidos Pendurados */}
        {!carregando && fila.length > 0 && (
          <div className="dashboard-stats" style={{ marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
            <StatCard
              icon="⚡"
              label="1º Desabastecimento de Estoque"
              value={resumo.primeiraDataFalta ? dataBr(resumo.primeiraDataFalta) : "Estoque 100% OK"}
              tone={resumo.primeiraDataFalta ? "danger" : "success"}
              sub={
                resumo.primeiroPedidoFalta
                  ? `Começa no Pedido #${resumo.primeiroPedidoFalta} (${resumo.primeiroClienteFalta || "Cliente"})`
                  : "Nenhum produto em falta na carteira"
              }
            />
            <StatCard
              icon="🚨"
              label="Pedidos Pendurados por Falta"
              value={`${inteiro(resumo.pedidosPendentes)} pedidos`}
              tone={resumo.pedidosPendentes > 0 ? "warning" : "success"}
              sub="Aguardando corte/costura para faturar"
            />
            <StatCard
              icon="📦"
              label="Peças a Produzir"
              value={`${inteiro(resumo.aProduzir)} pçs`}
              tone="info"
              sub={`Em ${inteiro(resumo.skusComFalta)} produtos desabastecidos`}
            />
            <StatCard
              icon="✅"
              label="Pedidos Prontos / Cobertos"
              value={`${inteiro(resumo.pedidosCobertos)} pedidos`}
              tone="success"
              sub={`${inteiro(resumo.cobertoEstoqueTotal)} peças prontas p/ faturar`}
            />
          </div>
        )}

        {/* Painel Expansível de Calendário de Rupturas de Estoque */}
        {exibirRupturas && (
          <div
            className="no-print"
            style={{
              marginBottom: 16,
              background: "#fff",
              border: "2px solid #ef4444",
              borderRadius: "var(--radius)",
              padding: "16px 20px",
              boxShadow: "0 4px 12px rgba(239, 68, 68, 0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: "#991b1b", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>📅</span> Calendário de Rupturas: A partir de quando falta cada produto
                </h3>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                  Simulação cronológica com base na <strong>Data de Fatura (DT_FATURA)</strong>. Mostra a data exata em que o estoque se esgotou para cada produto.
                </p>
              </div>
              <button
                type="button"
                className="button button-ghost tiny"
                onClick={() => setExibirRupturas(false)}
                style={{ fontWeight: 700 }}
              >
                ✕ Fechar Painel
              </button>
            </div>

            {rupturas.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#166534", fontWeight: 700 }}>
                🎉 Maravilha! Não há nenhuma ruptura prevista. O estoque pronto cobre 100% dos pedidos da carteira.
              </div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 2 }}>
                    <tr style={{ borderBottom: "1px solid var(--line)", textAlign: "left", height: 32 }}>
                      <th style={{ padding: "4px 10px", width: 140 }}>Falta a partir de</th>
                      <th style={{ padding: "4px 10px", width: 180 }}>Referência / Descrição</th>
                      <th style={{ padding: "4px 10px", width: 140 }}>Cor</th>
                      <th style={{ padding: "4px 8px", width: 50, textAlign: "center" }}>Tam</th>
                      <th style={{ padding: "4px 10px", width: 100, textAlign: "right" }}>Falta Total</th>
                      <th style={{ padding: "4px 10px", width: 120, textAlign: "center" }}>Pedidos Afetados</th>
                      <th style={{ padding: "4px 10px" }}>1º Pedido que sofreu falta</th>
                      <th style={{ padding: "4px 10px", width: 110, textAlign: "center" }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rupturas.map((r) => {
                      const selecionado = filtroSkuRuptura === r.sku;
                      return (
                        <tr
                          key={r.sku}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            background: selecionado ? "#fee2e2" : undefined,
                            height: 34,
                          }}
                        >
                          <td style={{ padding: "4px 10px" }}>
                            <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 6px", borderRadius: 4, fontWeight: 800 }}>
                              {dataBr(r.dtFaturaFalta)}
                            </span>
                          </td>
                          <td style={{ padding: "4px 10px" }}>
                            <strong>{r.referencia}</strong> <span className="muted">{r.descricao ? `· ${r.descricao}` : ""}</span>
                          </td>
                          <td style={{ padding: "4px 10px" }}>
                            {r.cor} <span className="muted">{r.descCor ? `· ${r.descCor}` : ""}</span>
                          </td>
                          <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 700 }}>
                            {r.tam}
                          </td>
                          <td style={{ padding: "4px 10px", textAlign: "right", fontWeight: 800, color: "#dc2626" }}>
                            -{inteiro(r.faltaTotal)} pçs
                          </td>
                          <td style={{ padding: "4px 10px", textAlign: "center", fontWeight: 600 }}>
                            {r.pedidosAfetados} pedido(s)
                          </td>
                          <td style={{ padding: "4px 10px" }}>
                            <strong style={{ color: "var(--teal)" }}>#{r.primeiroPedido}</strong>
                            <span className="muted" style={{ marginLeft: 6 }}>{r.primeiroCliente}</span>
                          </td>
                          <td style={{ padding: "4px 10px", textAlign: "center" }}>
                            <button
                              type="button"
                              className={`button tiny ${selecionado ? "button-primary" : "button-outline"}`}
                              onClick={() => {
                                if (selecionado) {
                                  setFiltroSkuRuptura(null);
                                } else {
                                  setFiltroSkuRuptura(r.sku);
                                  setModoFiltro("todos");
                                  resetarRolagem();
                                }
                              }}
                              style={{ padding: "2px 8px", fontSize: 11 }}
                            >
                              {selecionado ? "✕ Limpar" : "🔍 Filtrar"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Barra de Filtros e Busca */}
        <div
          className="filter-panel no-print"
          style={{
            padding: "10px 14px",
            marginBottom: 12,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
          }}
        >
          {/* Alternador de Foco Principal */}
          <div style={{ display: "flex", borderRadius: 6, border: "1px solid var(--line)", overflow: "hidden" }}>
            <button
              type="button"
              className={`button tiny ${modoFiltro === "pendurados" ? "button-primary" : "button-ghost"}`}
              onClick={() => {
                setModoFiltro("pendurados");
                resetarRolagem();
              }}
              style={{ borderRadius: 0, fontWeight: 700 }}
              title="Pedidos que não podem ser faturados por falta de pelo menos uma peça no estoque"
            >
              🚨 Pedidos Pendurados ({inteiro(resumo.pedidosPendentes)})
            </button>
            <button
              type="button"
              className={`button tiny ${modoFiltro === "cobertos" ? "button-primary" : "button-ghost"}`}
              onClick={() => {
                setModoFiltro("cobertos");
                resetarRolagem();
              }}
              style={{ borderRadius: 0, fontWeight: 600 }}
              title="Pedidos com 100% dos itens cobertos pelo estoque pronto"
            >
              ✅ Cobertos / Prontos ({inteiro(resumo.pedidosCobertos)})
            </button>
            <button
              type="button"
              className={`button tiny ${modoFiltro === "todos" ? "button-primary" : "button-ghost"}`}
              onClick={() => {
                setModoFiltro("todos");
                resetarRolagem();
              }}
              style={{ borderRadius: 0 }}
              title="Todos os pedidos da carteira em ordem de faturamento"
            >
              📋 Todos ({inteiro(resumo.pedidosTotais)})
            </button>
          </div>

          {/* Opção secundária para enxugar e focar apenas nas linhas com falta */}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12.5 }}>
            <input
              type="checkbox"
              checked={apenasItensFaltantes}
              onChange={(e) => {
                setApenasItensFaltantes(e.target.checked);
                resetarRolagem();
              }}
            />
            <span>Apenas linhas faltantes</span>
          </label>

          {/* Tag de SKU ativo do calendário de rupturas */}
          {filtroSkuRuptura && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#fee2e2",
                color: "#991b1b",
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <span>Filtrando produto: {filtroSkuRuptura}</span>
              <button
                type="button"
                onClick={() => setFiltroSkuRuptura(null)}
                style={{ background: "none", border: "none", color: "#991b1b", cursor: "pointer", fontWeight: 800 }}
                title="Limpar filtro de produto"
              >
                ✕
              </button>
            </div>
          )}

          {/* Input de Busca */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 260 }}>
            <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>BUSCA:</span>
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                resetarRolagem();
              }}
              placeholder="Nº Pedido, cliente, cidade, referência, descrição ou cor..."
              style={{ height: 32, padding: "4px 10px", fontSize: 13, flex: 1 }}
            />
          </label>
        </div>

        {/* Tabela de Pedidos com Altura Fixa Estável e Ordenação por Fatura */}
        <div
          className="table-scroll"
          ref={wrapRef}
          onScroll={aoRolar}
          style={{
            height: "calc(100vh - 290px)",
            minHeight: 460,
            overflow: "auto",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            background: "#fff",
          }}
        >
          {carregando ? (
            <div className="empty-state" style={{ padding: 48, textAlign: "center" }}>
              Simulando faturamento e descontando estoque acumulado...
            </div>
          ) : filtrada.length === 0 ? (
            <div className="empty-state" style={{ padding: 48, textAlign: "center" }}>
              <strong>Nenhum item na fila para este filtro.</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {fila.length === 0
                  ? "Importe os relatórios de PEDIDOS (2710) e PRODUTOS DO PEDIDO na tela Importar."
                  : modoFiltro === "pendurados"
                    ? "Excelente notícia! Nenhum pedido está pendurado por falta de peça; todos os pedidos estão cobertos pelo estoque acabado."
                    : "Nenhum resultado corresponde ao termo pesquisado."}
              </p>
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                minWidth: 1230,
                borderCollapse: "collapse",
                tableLayout: "fixed",
                fontSize: 12,
              }}
            >
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 50 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 95 }} />
                <col style={{ width: 175 }} />
              </colgroup>
              <thead>
                <tr
                  style={{
                    background: "var(--sheet-header-bg, #f1f5f9)",
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    height: 38,
                    borderBottom: "2px solid var(--line)",
                  }}
                >
                  <th style={{ textAlign: "center", padding: "0 4px" }}>#</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Pedido / Cliente</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Data Fatura 📅</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Entrega / Prazo</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Produto / Referência</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Cor</th>
                  <th style={{ textAlign: "center", padding: "0 4px" }}>Tam</th>
                  <th style={{ textAlign: "right", padding: "0 8px" }}>Qtd Aberta</th>
                  <th style={{ textAlign: "right", padding: "0 8px" }}>Em Estoque</th>
                  <th style={{ textAlign: "right", padding: "0 8px", color: "var(--danger)" }}>Falta Produzir</th>
                  <th style={{ textAlign: "left", padding: "0 8px" }}>Situação do Pedido</th>
                </tr>
              </thead>
              <tbody>
                {alturaAntes > 0 && (
                  <tr aria-hidden="true" style={{ height: alturaAntes }}>
                    <td colSpan={11} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
                {janela.map((l, i) => {
                  const precisaProduzir = l.faltaProduzir > 0;
                  const pedidoPendurado = l.statusPedido === "PENDURADO";

                  return (
                    <tr
                      key={`${l.numero}|${l.referencia}|${l.cor}|${l.tam}`}
                      style={{
                        height: ALTURA_LINHA,
                        borderBottom: "1px solid var(--line)",
                        background: precisaProduzir
                          ? "#fff5f5"
                          : !pedidoPendurado
                            ? "#f0fdf4"
                            : undefined,
                      }}
                    >
                      <td style={{ textAlign: "center", color: "var(--muted)", padding: "0 4px", fontSize: 11 }}>
                        {primeiroIndice + i + 1}
                      </td>

                      {/* Pedido e Cliente */}
                      <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <strong style={{ color: "var(--teal)", fontSize: 13 }}>#{l.numero}</strong>
                          <span
                            className="muted"
                            style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                            title={`${l.cliente || "Cliente s/ nome"} ${l.cidade ? `(${l.cidade}/${l.estado})` : ""}`}
                          >
                            {l.cliente || "Cliente sem nome"}
                            {l.cidade ? ` · ${l.cidade}/${l.estado}` : ""}
                          </span>
                        </div>
                      </td>

                      {/* Data de Fatura (Principal Ordenador da Fila) */}
                      <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <strong style={{ fontSize: 12.5 }}>{dataBr(l.dtFatura)}</strong>
                          <span className="muted" style={{ fontSize: 10.5 }}>
                            {prazoTexto(l.diasAteFatura)}
                          </span>
                        </div>
                      </td>

                      {/* Data de Entrega */}
                      <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span>{dataBr(l.dtEntrega)}</span>
                          <span
                            style={{
                              fontSize: 10.5,
                              color: l.atrasado && precisaProduzir ? "var(--danger)" : "var(--muted)",
                              fontWeight: l.atrasado && precisaProduzir ? 700 : 400,
                            }}
                          >
                            {prazoTexto(l.diasAteEntrega)}
                          </span>
                        </div>
                      </td>

                      {/* Referência e Descrição */}
                      <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <strong style={{ color: "#1e293b" }}>{l.referencia}</strong>
                          <span
                            className="muted"
                            style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                            title={l.descricao}
                          >
                            {l.descricao || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Cor */}
                      <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span>{l.cor}</span>
                          <span
                            className="muted"
                            style={{ fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                            title={l.descCor}
                          >
                            {l.descCor || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Tam */}
                      <td style={{ textAlign: "center", fontWeight: 700, padding: "0 4px" }}>
                        {l.tam}
                      </td>

                      {/* Qtd Aberta */}
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "0 8px" }}>
                        {inteiro(l.aberta)}
                      </td>

                      {/* Coberto Estoque */}
                      <td
                        style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          padding: "0 8px",
                          color: l.cobertoPorEstoque > 0 ? "var(--success, #16a34a)" : "var(--muted)",
                          fontWeight: l.cobertoPorEstoque > 0 ? 600 : 400,
                        }}
                      >
                        {inteiro(l.cobertoPorEstoque)}
                      </td>

                      {/* Falta Produzir */}
                      <td
                        style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          padding: "0 8px",
                        }}
                      >
                        {precisaProduzir ? (
                          <span
                            style={{
                              background: "#fee2e2",
                              color: "#991b1b",
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontWeight: 800,
                            }}
                          >
                            -{inteiro(l.faltaProduzir)}
                          </span>
                        ) : (
                          <span style={{ color: "#16a34a", fontSize: 11, fontWeight: 600 }}>
                            ✓ Coberto
                          </span>
                        )}
                      </td>

                      {/* Situação do Pedido e Data da Falta */}
                      <td style={{ padding: "0 8px", overflowWrap: "break-word", wordBreak: "break-word" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {pedidoPendurado ? (
                            <span
                              className="status-pill danger"
                              title={l.motivoFaltaPedido}
                              style={{ padding: "2px 8px", fontSize: 11 }}
                            >
                              🚨 PENDURADO
                            </span>
                          ) : (
                            <span
                              className="status-pill success"
                              style={{ padding: "2px 8px", fontSize: 11 }}
                            >
                              ✅ PRONTO P/ FATURAR
                            </span>
                          )}
                          {l.dtFaturaPrimeiraFalta && precisaProduzir && (
                            <span
                              style={{
                                fontSize: 10.5,
                                color: "#991b1b",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                              }}
                              title={`Estoque deste produto esgotou no atendimento do faturamento em ${dataBr(l.dtFaturaPrimeiraFalta)}`}
                            >
                              Falta desde {dataBr(l.dtFaturaPrimeiraFalta)}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {alturaDepois > 0 && (
                  <tr aria-hidden="true" style={{ height: alturaDepois }}>
                    <td colSpan={11} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
