import { useEffect, useMemo, useRef, useState } from "react";
import { usePcp } from "../../lib/pcp/PcpContext";
import { alertasDaLinha, sugerirLote } from "../../lib/pcp/calc";
import { compararTamanho } from "../../lib/pcp/tamanhos";
import FiltroColuna from "../../components/pcp/FiltroColuna";
import ProdutoDialog from "../../components/pcp/ProdutoDialog";

const ALTURA_LINHA = 24;
const RESERVA = 10;

function inteiro(valor) {
  return Math.round(valor || 0).toLocaleString("pt-BR");
}

function decimal(valor, casas = 2) {
  return Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function dinheiro(valor) {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function somar(linhas, campo) {
  return linhas.reduce((total, linha) => {
    const valor = Number(linha[campo]);
    return total + (Number.isFinite(valor) ? valor : 0);
  }, 0);
}

function porcento(valor) {
  return `${Math.round((valor || 0) * 100)}%`;
}

function semanas(valor) {
  if (!Number.isFinite(valor) || valor <= 0) return "0";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function Status({ linha }) {
  if (!linha.temEstrutura) {
    return (
      <span
        className="status sem-dado"
        title={`Sem estrutura de consumo para ${linha.referencia}/${linha.cor}. Importe o arquivo ${linha.referencia}-${linha.cor}.csv da pasta CONSUMOS-2252.`}
      >
        SEM ESTRUTURA
      </span>
    );
  }
  if (linha.insumosAtendem === null) {
    return (
      <span className="status sem-dado" title="Sem lote programado não há material a consumir. Informe o lote para avaliar.">
        SEM LOTE
      </span>
    );
  }
  const faltando = linha.insumos.filter((i) => !i.atende).map((i) => i.descricao || i.codigo);
  return linha.insumosAtendem ? (
    <span className="status yes" title="Todos os insumos atendem o plano completo.">
      SIM
    </span>
  ) : (
    <span className="status no" title={`Faltam: ${faltando.join(", ")}`}>
      NÃO
    </span>
  );
}

function LoteInput({ linha, podeEditar, editado, aoEditar }) {
  const [valorLocal, setValorLocal] = useState(String(linha.lote));
  const pendenteRef = useRef(null);

  useEffect(() => {
    if (pendenteRef.current === null) setValorLocal(String(linha.lote));
  }, [linha.lote, linha.id]);

  useEffect(() => {
    return () => {
      if (pendenteRef.current !== null) clearTimeout(pendenteRef.current);
    };
  }, []);

  function mudar(e) {
    const texto = e.target.value;
    setValorLocal(texto);
    if (pendenteRef.current !== null) clearTimeout(pendenteRef.current);
    pendenteRef.current = setTimeout(() => {
      pendenteRef.current = null;
      aoEditar(linha.id, Number(texto) || 0);
    }, 300);
  }

  return (
    <input
      type="number"
      min={0}
      className="lote-input"
      value={valorLocal}
      disabled={!podeEditar}
      onClick={(e) => e.stopPropagation()}
      onChange={mudar}
      style={editado ? { borderColor: "var(--teal)", background: "var(--teal-soft)" } : undefined}
    />
  );
}

function agruparComSubtotal(linhas) {
  const saida = [];
  let chaveAtual = "";
  let rotuloAtual = "";
  let bloco = [];

  const fechar = () => {
    if (bloco.length) saida.push({ tipo: "subtotal", rotulo: rotuloAtual, linhas: bloco });
  };

  for (const linha of linhas) {
    const chave = `${linha.referencia}|${linha.cor}`;
    if (chaveAtual && chave !== chaveAtual) {
      fechar();
      bloco = [];
    }
    chaveAtual = chave;
    rotuloAtual = `${linha.referencia} / ${linha.corNome || linha.cor}`;
    bloco.push(linha);
    saida.push({ tipo: "linha", linha });
  }
  fechar();
  return saida;
}

const COLUNAS = [
  { chave: "referencia", titulo: "Referência", largura: 104 },
  { chave: "tam", titulo: "Tam", largura: 56 },
  { chave: "cor", titulo: "Cor", largura: 92 },
  { chave: "projVenda", titulo: "Proj. venda", num: true, largura: 88 },
  { chave: "vendaDiaria", titulo: "Venda diária", num: true, largura: 92 },
  { chave: "estoqueMinimo", titulo: "Est. mínimo", num: true, largura: 88 },
  { chave: "estoqueMaximo", titulo: "Est. máximo", num: true, largura: 94 },
  { chave: "diasEstoque", titulo: "Dias estoque", num: true, largura: 96 },
  { chave: "producaoProjetada", titulo: "Prod. projetada", num: true, largura: 112 },
  { chave: "estoque", titulo: "Estoque", num: true, largura: 78 },
  { chave: "processo", titulo: "Processo", num: true, largura: 82 },
  { chave: "carteira", titulo: "Cart. total", num: true, largura: 82 },
  { chave: "saldo", titulo: "Saldo", num: true, largura: 78 },
  { chave: "vendaAcm", titulo: "Venda acm.", num: true, largura: 88 },
  { chave: "estoqueDisponivel", titulo: "Est. disponível", num: true, largura: 106 },
  { chave: "pontoReposicao", titulo: "Ponto repos.", num: true, largura: 96 },
  { chave: "pctProd", titulo: "% prod.", num: true, largura: 74 },
  { chave: "lote", titulo: "Lote", largura: 96 },
  { chave: "saldoComLote", titulo: "Saldo c/ lote", num: true, largura: 94 },
  { chave: "mixSaldo", titulo: "Mix saldo", num: true, largura: 80 },
  { chave: "mixVenda", titulo: "Mix venda", num: true, largura: 80 },
  { chave: "pctVendido", titulo: "% vendido", num: true, largura: 82 },
  { chave: "faltaProduzir", titulo: "Falta produzir", num: true, largura: 104 },
  { chave: "faccao", titulo: "Facção", largura: 96 },
  { chave: "capacidade", titulo: "Cap. semanal", num: true, largura: 96 },
  { chave: "semanas", titulo: "Semanas prod.", num: true, largura: 104 },
  { chave: "totalProgramado", titulo: "Total programado", num: true, largura: 124 },
];

const CRITERIOS_INICIAIS = {
  situacao: "todos",
  colecao: "todas",
  referencia: "",
  cor: "todas",
  faccao: "todas",
  status: "todos",
  material: "",
  corInsumo: "",
};

function linhaAtiva(l) {
  return l.grupoAtivo && l.ativo !== false;
}

function passaNosFiltros(l, c, ignorar) {
  const usa = (campo) => ignorar !== campo;

  if (usa("situacao")) {
    if (c.situacao === "ativos" && !linhaAtiva(l)) return false;
    if (c.situacao === "inativos" && linhaAtiva(l)) return false;
  }
  if (usa("colecao") && c.colecao !== "todas" && l.colecaoNome !== c.colecao) return false;
  if (usa("referencia") && c.referencia && !l.referencia.toUpperCase().includes(c.referencia.toUpperCase())) return false;
  if (usa("cor") && c.cor !== "todas" && l.cor !== c.cor) return false;
  if (usa("faccao") && c.faccao !== "todas" && l.faccao !== c.faccao) return false;
  if (usa("status") && c.status !== "todos") {
    if (c.status === "nao" && (l.insumosAtendem === true || l.insumosAtendem === null || !l.temEstrutura)) return false;
    if (c.status === "sim" && l.insumosAtendem !== true) return false;
    if (c.status === "sem-estrutura" && l.temEstrutura) return false;
    if (c.status === "sem-lote" && (l.insumosAtendem !== null || !l.temEstrutura)) return false;
    if (c.status === "abaixo-minimo" && !l.abaixoMinimo) return false;
  }
  if (usa("material") && c.material) {
    const termo = c.material.toLowerCase();
    const tem = l.insumos.some((i) => `${i.codigo} ${i.descricao}`.toLowerCase().includes(termo));
    if (!tem) return false;
  }
  if (usa("corInsumo") && c.corInsumo) {
    const termo = c.corInsumo.toLowerCase();
    const tem = l.insumos.some((i) => `${i.corMaterial} ${i.corMaterialNome}`.toLowerCase().includes(termo));
    if (!tem) return false;
  }
  return true;
}

export default function PcpProgramacaoPage() {
  const {
    linhas,
    plano,
    lotesEditados,
    salvando,
    conflitos,
    editarLote,
    salvarLotes,
    desfazer,
    salvarProduto,
    excluirLinhas,
    alternarAtivo,
    carregarPlano,
    irPara,
  } = usePcp();

  const [criterios, setCriterios] = useState(CRITERIOS_INICIAIS);
  const [ordem, setOrdem] = useState({ campo: "referencia", direcao: "asc" });
  const [selecionada, setSelecionada] = useState(null);
  const [mostrarInspector, setMostrarInspector] = useState(true);
  const [modoExclusao, setModoExclusao] = useState(false);
  const [marcadas, setMarcadas] = useState(new Set());
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [produtoEditado, setProdutoEditado] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [colunasOcultas, setColunasOcultas] = useState(new Set());
  const [seletorColunasAberto, setSeletorColunasAberto] = useState(false);
  const [maisFiltrosAberto, setMaisFiltrosAberto] = useState(false);

  const wrapRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaJanela, setAlturaJanela] = useState(600);
  const pendenteRolagemRef = useRef(null);
  const posicaoRolagemRef = useRef(0);
  const ultimoAplicadoRef = useRef(0);

  const mudar = (campo, valor) => {
    setCriterios((c) => ({ ...c, [campo]: valor }));
    setScrollTop(0);
    if (wrapRef.current) wrapRef.current.scrollTop = 0;
  };

  const colecoes = useMemo(
    () => [...new Set(linhas.map((l) => l.colecaoNome).filter(Boolean))].sort(),
    [linhas],
  );

  const cores = useMemo(() => {
    const s = new Set();
    for (const l of linhas) {
      if (passaNosFiltros(l, criterios, "cor")) s.add(l.cor);
    }
    return [...s].sort();
  }, [linhas, criterios]);

  const faccoes = useMemo(() => {
    const s = new Set();
    for (const l of linhas) {
      if (l.faccao && passaNosFiltros(l, criterios, "faccao")) s.add(l.faccao);
    }
    return [...s].sort();
  }, [linhas, criterios]);

  const materiais = useMemo(() => {
    const s = new Set();
    for (const l of linhas) {
      for (const i of l.insumos) if (i.codigo) s.add(`${i.codigo} - ${i.descricao}`);
    }
    return [...s].sort();
  }, [linhas]);

  const coresInsumo = useMemo(() => {
    const s = new Set();
    for (const l of linhas) {
      for (const i of l.insumos) if (i.corMaterial) s.add(i.corMaterial);
    }
    return [...s].sort();
  }, [linhas]);

  const filtradas = useMemo(() => {
    const base = linhas.filter((l) => passaNosFiltros(l, criterios));
    return base.sort((a, b) => {
      const dir = ordem.direcao === "asc" ? 1 : -1;
      if (ordem.campo === "tam") return compararTamanho(a.tam, b.tam) * dir;
      const va = a[ordem.campo];
      const vb = b[ordem.campo];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR") * dir;
    });
  }, [linhas, criterios, ordem]);

  const entradas = useMemo(() => agruparComSubtotal(filtradas), [filtradas]);
  const detalhe = linhas.find((l) => l.id === selecionada) ?? null;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const medir = () => setAlturaJanela(el.clientHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function aoRolar(e) {
    const pos = e.currentTarget.scrollTop;
    posicaoRolagemRef.current = pos;
    const agora = Date.now();
    if (agora - ultimoAplicadoRef.current >= 16) {
      ultimoAplicadoRef.current = agora;
      if (pendenteRolagemRef.current !== null) {
        clearTimeout(pendenteRolagemRef.current);
        pendenteRolagemRef.current = null;
      }
      setScrollTop(pos);
      return;
    }
    if (pendenteRolagemRef.current !== null) clearTimeout(pendenteRolagemRef.current);
    pendenteRolagemRef.current = setTimeout(() => {
      pendenteRolagemRef.current = null;
      ultimoAplicadoRef.current = Date.now();
      setScrollTop(posicaoRolagemRef.current);
    }, 16);
  }

  const primeiroIndice = Math.max(0, Math.floor(scrollTop / ALTURA_LINHA) - RESERVA);
  const ultimoIndice = Math.min(entradas.length, Math.ceil((scrollTop + alturaJanela) / ALTURA_LINHA) + RESERVA);
  const entradasVisiveis = entradas.slice(primeiroIndice, ultimoIndice);
  const alturaAntes = primeiroIndice * ALTURA_LINHA;
  const alturaDepois = (entradas.length - ultimoIndice) * ALTURA_LINHA;

  const totais = useMemo(
    () => ({
      projVenda: somar(filtradas, "projVenda"),
      vendaDiaria: somar(filtradas, "vendaDiaria"),
      producaoProjetada: somar(filtradas, "producaoProjetada"),
      estoque: somar(filtradas, "estoque"),
      processo: somar(filtradas, "processo"),
      carteira: somar(filtradas, "carteira"),
      saldo: somar(filtradas, "saldo"),
      vendaAcm: somar(filtradas, "vendaAcm"),
      estoqueDisponivel: somar(filtradas, "estoqueDisponivel"),
      lote: somar(filtradas, "lote"),
      saldoComLote: somar(filtradas, "saldoComLote"),
      faltaProduzir: somar(filtradas, "faltaProduzir"),
      semanas: somar(filtradas.filter((l) => l.grupoLider), "semanas"),
      valorProgramado: somar(filtradas.filter((l) => l.grupoLider), "totalProgramado"),
      produtos: new Set(filtradas.map((l) => l.grupoKey)).size,
    }),
    [filtradas],
  );

  function ordenarPor(campo) {
    setOrdem((a) => (a.campo === campo ? { campo, direcao: a.direcao === "asc" ? "desc" : "asc" } : { campo, direcao: "asc" }));
    setScrollTop(0);
    if (wrapRef.current) wrapRef.current.scrollTop = 0;
  }

  function exportarCsv() {
    const cabecalho = [
      "referencia",
      "colecao",
      "tam",
      "cor",
      "estoque",
      "processo",
      "carteira",
      "saldo",
      "lote",
      "faccao",
      "cap_semanal",
      "semanas_producao",
      "insumos",
    ];
    const corpo = filtradas.map((l) =>
      [
        l.referencia,
        l.colecaoNome,
        l.tam,
        l.cor,
        Math.round(l.estoque),
        Math.round(l.processo),
        Math.round(l.carteira),
        Math.round(l.saldo),
        Math.round(l.lote),
        l.faccao,
        Math.round(l.capacidade),
        l.semanas.toFixed(1).replace(".", ","),
        !l.temEstrutura ? "SEM ESTRUTURA" : l.insumosAtendem === null ? "SEM LOTE" : l.insumosAtendem ? "SIM" : "NAO",
      ].join(";"),
    );
    const url = URL.createObjectURL(new Blob([[cabecalho.join(";"), ...corpo].join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `programacao-pcp-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const abrirCadastro = (linhasDoProduto) => {
    setProdutoEditado(linhasDoProduto);
    setDialogoAberto(true);
  };

  const totalColunas = COLUNAS.length + 2 + (modoExclusao ? 1 : 0);

  if (linhas.length === 0) {
    return (
      <main className="workspace">
        <header className="topbar">
          <div className="sheet-header-inline">
            <p className="overline">PCP</p>
            <h1>Programação de Produção</h1>
          </div>
        </header>
        <section className="content-panel">
          <div className="empty-state" style={{ padding: "48px 24px", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Nenhuma programação cadastrada ainda</h3>
            <p className="muted" style={{ maxWidth: 520, margin: "0 auto 20px" }}>
              Importe os relatórios diários do SISPLAN na aba Importar para gerar a programação mestra.
            </p>
            <button type="button" className="button button-primary" onClick={() => irPara("pcp-importar")}>
              Ir para Importar
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="workspace" style={{ padding: 0 }}>
      <header className="topbar" style={{ padding: "10px 20px" }}>
        <div className="sheet-header-inline">
          <p className="overline">PCP · Engenharia & Produção</p>
          <h1>Programação de Produção</h1>
        </div>
        <div className="topbar-actions">
          {lotesEditados.size > 0 && (
            <button
              type="button"
              className="button button-primary"
              onClick={salvarLotes}
              disabled={salvando}
            >
              {salvando ? "Salvando..." : `💾 Salvar ${lotesEditados.size} lote(s)`}
            </button>
          )}
          {lotesEditados.size > 0 && (
            <button type="button" className="button button-outline" onClick={desfazer}>
              Desfazer
            </button>
          )}
          <button
            type="button"
            className="button button-primary"
            onClick={() => abrirCadastro(selecionada ? linhas.filter((l) => l.grupoKey === detalhe?.grupoKey) : [])}
          >
            {selecionada ? "✎ Editar produto" : "➕ Novo produto"}
          </button>
          <button
            type="button"
            className={`button ${modoExclusao ? "button-danger" : "button-outline"}`}
            onClick={() => {
              setModoExclusao((v) => !v);
              setMarcadas(new Set());
            }}
          >
            {modoExclusao ? "Cancelar exclusão" : "🗑 Excluir linhas"}
          </button>
          <button type="button" className="button button-outline" onClick={exportarCsv}>
            📥 CSV
          </button>
          <button
            type="button"
            className={`button button-outline ${mostrarInspector ? "active" : ""}`}
            onClick={() => setMostrarInspector((v) => !v)}
            title="Mostrar/ocultar painel lateral de detalhes"
          >
            📋 Detalhes
          </button>
          <button
            type="button"
            className="button button-outline button-icon"
            onClick={carregarPlano}
            title="Recarregar dados"
          >
            🔄
          </button>
          <span className="status-pill">{inteiro(filtradas.length)} linhas</span>
        </div>
      </header>

      {/* Barra de Filtros Rápida */}
      <div
        className="filter-panel"
        style={{
          padding: "8px 20px",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>SITUAÇÃO:</span>
          <select
            value={criterios.situacao}
            onChange={(e) => mudar("situacao", e.target.value)}
            style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
          >
            <option value="todos">Todos (ativos e inativos)</option>
            <option value="ativos">Só ativos</option>
            <option value="inativos">Só inativos</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>COLEÇÃO:</span>
          <select
            value={criterios.colecao}
            onChange={(e) => mudar("colecao", e.target.value)}
            style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
          >
            <option value="todas">Todas as coleções</option>
            {colecoes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>REF:</span>
          <input
            value={criterios.referencia}
            placeholder="Buscar ref..."
            onChange={(e) => mudar("referencia", e.target.value)}
            style={{ width: 110, padding: "4px 8px", fontSize: 12 }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>COR:</span>
          <select
            value={criterios.cor}
            onChange={(e) => mudar("cor", e.target.value)}
            style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
          >
            <option value="todas">Todas ({cores.length})</option>
            {cores.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>FACÇÃO:</span>
          <select
            value={criterios.faccao}
            onChange={(e) => mudar("faccao", e.target.value)}
            style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
          >
            <option value="todas">Todas ({faccoes.length})</option>
            {faccoes.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>INSUMOS:</span>
          <select
            value={criterios.status}
            onChange={(e) => mudar("status", e.target.value)}
            style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
          >
            <option value="todos">Todos os status</option>
            <option value="nao">Não atende</option>
            <option value="sim">Atende</option>
            <option value="sem-estrutura">Sem estrutura</option>
            <option value="sem-lote">Sem lote</option>
            <option value="abaixo-minimo">Abaixo do mínimo</option>
          </select>
        </div>

        <button
          type="button"
          className="button button-outline tiny"
          onClick={() => setCriterios(CRITERIOS_INICIAIS)}
          title="Limpar todos os filtros"
        >
          Limpar filtros
        </button>

        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
          {lotesEditados.size > 0 ? (
            <strong style={{ color: "var(--amber)" }}>{lotesEditados.size} alteração(ões) não salva(s)</strong>
          ) : (
            "Nenhuma alteração pendente"
          )}
        </span>
      </div>

      {modoExclusao && (
        <div
          style={{
            background: "var(--danger)",
            color: "#fff",
            padding: "8px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            <strong>{marcadas.size}</strong> linha(s) marcada(s) para exclusão permanente.
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="button button-outline tiny"
              style={{ color: "#fff", borderColor: "#fff" }}
              onClick={() => setMarcadas(new Set(filtradas.map((l) => l.id)))}
            >
              Marcar todas
            </button>
            <button
              type="button"
              className="button button-outline tiny"
              style={{ color: "#fff", borderColor: "#fff" }}
              onClick={() => setMarcadas(new Set())}
            >
              Desmarcar
            </button>
            <button
              type="button"
              className="button button-primary tiny"
              style={{ background: "#fff", color: "var(--danger)" }}
              disabled={marcadas.size === 0}
              onClick={() => {
                const alvo = linhas.filter((l) => marcadas.has(l.id));
                excluirLinhas(alvo);
                setModoExclusao(false);
                setMarcadas(new Set());
              }}
            >
              Confirmar exclusão
            </button>
          </div>
        </div>
      )}

      {/* Grid Principal: Tabela Mestra à esquerda, Inspector à direita */}
      <div
        className="content-grid"
        style={{
          display: "grid",
          gridTemplateColumns: mostrarInspector ? "1fr 340px" : "1fr",
          height: "calc(100vh - 120px)",
          overflow: "hidden",
        }}
      >
        {/* TABELA MESTRA DE PROGRAMAÇÃO (Preservada como pedido explícito) */}
        <div className="table-wrap" ref={wrapRef} onScroll={aoRolar} style={{ height: "100%", overflow: "auto" }}>
          <table
            className={`planning-table${modoExclusao ? " com-selecao" : ""}`}
            style={{ minWidth: modoExclusao ? 2722 : 2680 }}
          >
            <colgroup>
              {modoExclusao && <col style={{ width: 42 }} />}
              {COLUNAS.slice(0, 3).map((coluna) => (
                <col key={coluna.chave} style={{ width: coluna.largura }} />
              ))}
              <col style={{ width: 66 }} />
              <col style={{ width: 138 }} />
              {COLUNAS.slice(3).map((coluna) => (
                <col key={coluna.chave} style={{ width: coluna.largura }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {modoExclusao && (
                  <th style={{ width: 42 }}>
                    <input
                      type="checkbox"
                      checked={marcadas.size > 0 && marcadas.size === filtradas.length}
                      onChange={(e) =>
                        setMarcadas(e.target.checked ? new Set(filtradas.map((l) => l.id)) : new Set())
                      }
                    />
                  </th>
                )}
                {COLUNAS.slice(0, 3).map((coluna, indice) => (
                  <th
                    key={coluna.chave}
                    className={`freeze-${indice + 1}${coluna.num ? " num" : ""}`}
                    onClick={() => ordenarPor(coluna.chave)}
                    style={{ cursor: "pointer", width: coluna.largura }}
                  >
                    {coluna.titulo}
                    {ordem.campo === coluna.chave ? (ordem.direcao === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
                <th style={{ width: 66 }}>Ativo</th>
                <th style={{ width: 138 }}>Insumos atende?</th>
                {COLUNAS.slice(3).map((coluna) => (
                  <th
                    key={coluna.chave}
                    className={coluna.num ? "num" : undefined}
                    onClick={() => ordenarPor(coluna.chave)}
                    style={{ cursor: "pointer", width: coluna.largura }}
                  >
                    {coluna.titulo}
                    {ordem.campo === coluna.chave ? (ordem.direcao === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alturaAntes > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={totalColunas} style={{ height: alturaAntes, padding: 0, border: 0 }} />
                </tr>
              )}
              {entradasVisiveis.map((entrada, idx) =>
                entrada.tipo === "subtotal" ? (
                  <tr key={`sub-${entrada.rotulo}-${idx}`} className="subtotal-row">
                    {modoExclusao && <td />}
                    <td className="freeze-group" colSpan={3}>
                      Total {entrada.rotulo}
                    </td>
                    <td colSpan={2} />
                    <td className="num">{inteiro(somar(entrada.linhas, "projVenda"))}</td>
                    <td className="num">{decimal(somar(entrada.linhas, "vendaDiaria"), 1)}</td>
                    <td colSpan={3} />
                    <td className="num">{inteiro(somar(entrada.linhas, "producaoProjetada"))}</td>
                    <td className="num">{inteiro(somar(entrada.linhas, "estoque"))}</td>
                    <td className="num">{inteiro(somar(entrada.linhas, "processo"))}</td>
                    <td className="num">{inteiro(somar(entrada.linhas, "carteira"))}</td>
                    <td className="num">{inteiro(somar(entrada.linhas, "saldo"))}</td>
                    <td className="num">{inteiro(somar(entrada.linhas, "vendaAcm"))}</td>
                    <td className="num">{inteiro(somar(entrada.linhas, "estoqueDisponivel"))}</td>
                    <td colSpan={2} />
                    <td className="num">{inteiro(somar(entrada.linhas, "lote"))}</td>
                    <td className="num">{inteiro(somar(entrada.linhas, "saldoComLote"))}</td>
                    <td className="num">{porcento(somar(entrada.linhas, "mixSaldo"))}</td>
                    <td className="num">{porcento(somar(entrada.linhas, "mixVenda"))}</td>
                    <td className="num">{porcento(entrada.linhas[0]?.pctVendido ?? 0)}</td>
                    <td className="num">{inteiro(somar(entrada.linhas, "faltaProduzir"))}</td>
                    <td>{entrada.linhas[0]?.faccao}</td>
                    <td className="num">{inteiro(entrada.linhas[0]?.capacidade ?? 0)}</td>
                    <td className="num">{semanas(entrada.linhas[0]?.semanas ?? 0)}</td>
                    <td className="num">{dinheiro(entrada.linhas[0]?.totalProgramado ?? 0)}</td>
                  </tr>
                ) : (
                  (() => {
                    const linha = entrada.linha;
                    const editado = lotesEditados.has(linha.id);
                    return (
                      <tr
                        key={linha.id}
                        className={`${linha.id === selecionada ? "selected" : ""}${
                          linhaAtiva(linha) ? "" : " inactive-row"
                        }`}
                        onClick={() => setSelecionada(linha.id)}
                      >
                        {modoExclusao && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={marcadas.has(linha.id)}
                              onChange={(e) =>
                                setMarcadas((atual) => {
                                  const proximo = new Set(atual);
                                  if (e.target.checked) proximo.add(linha.id);
                                  else proximo.delete(linha.id);
                                  return proximo;
                                })
                              }
                            />
                          </td>
                        )}
                        <td className="freeze-1">
                          <span className="strong-text">{linha.referencia}</span>
                        </td>
                        <td className="freeze-2">{linha.tam}</td>
                        <td className="freeze-3">
                          <span className="color-code" title={linha.corNome || linha.cor}>
                            {linha.cor}
                          </span>
                        </td>
                        <td className="active-cell">
                          <button
                            type="button"
                            className={`active-state ${linhaAtiva(linha) ? "on" : "off"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              alternarAtivo(linha);
                            }}
                            title="Alternar ativo/inativo"
                          >
                            {linhaAtiva(linha) ? "ON" : "OFF"}
                          </button>
                        </td>
                        <td>
                          <Status linha={linha} />
                        </td>
                        <td className="num">{inteiro(linha.projVenda)}</td>
                        <td className="num">{decimal(linha.vendaDiaria, 2)}</td>
                        <td className={`num${linha.abaixoMinimo ? " cond-abaixo-minimo" : ""}`}>
                          {inteiro(linha.estoqueMinimo)}
                        </td>
                        <td className={`num${linha.acimaMaximo ? " cond-acima-maximo" : ""}`}>
                          {inteiro(linha.estoqueMaximo)}
                        </td>
                        <td className={`num${linha.deadlineEstourado ? " negative" : ""}`}>
                          {inteiro(linha.diasEstoque)}
                        </td>
                        <td className={`num${linha.producaoAtrasada ? " cond-producao-atrasada" : ""}`}>
                          {inteiro(linha.producaoProjetada)}
                        </td>
                        <td className="num">{inteiro(linha.estoque)}</td>
                        <td className="num">{inteiro(linha.processo)}</td>
                        <td className="num">{inteiro(linha.carteira)}</td>
                        <td className={`num ${linha.saldo < 0 ? "negative" : "positive"}`}>{inteiro(linha.saldo)}</td>
                        <td className="num">{inteiro(linha.vendaAcm)}</td>
                        <td className={`num${linha.estoqueDisponivel <= 0 ? " cond-sem-estoque-disp" : ""}`}>
                          {inteiro(linha.estoqueDisponivel)}
                        </td>
                        <td className="num">{inteiro(linha.pontoReposicao)}</td>
                        <td className={`num${linha.pctProd >= 0.9 ? " cond-prod-alto" : ""}`}>
                          {porcento(linha.pctProd)}
                        </td>
                        <td>
                          <LoteInput linha={linha} podeEditar={true} editado={editado} aoEditar={editarLote} />
                        </td>
                        <td className="num">{inteiro(linha.saldoComLote)}</td>
                        <td className="num">{porcento(linha.mixSaldo)}</td>
                        <td className="num">{porcento(linha.mixVenda)}</td>
                        <td className="num">{porcento(linha.pctVendido)}</td>
                        <td className={`num${linha.faltaProduzir < 0 ? " negative" : ""}`}>
                          {inteiro(linha.faltaProduzir)}
                        </td>
                        <td>{linha.faccao}</td>
                        <td className="num">{inteiro(linha.capacidade)}</td>
                        <td className={`num${linha.semanasAteDeadline !== null && linha.semanas > linha.semanasAteDeadline ? " negative" : ""}`}>
                          {semanas(linha.semanas)}
                        </td>
                        <td className="num">{dinheiro(linha.totalProgramado)}</td>
                      </tr>
                    );
                  })()
                )
              )}
              {alturaDepois > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={totalColunas} style={{ height: alturaDepois, padding: 0, border: 0 }} />
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                {modoExclusao && <td />}
                <td className="freeze-group" colSpan={3}>
                  Totais filtrados
                </td>
                <td colSpan={2} />
                <td className="num">{inteiro(totais.projVenda)}</td>
                <td className="num">{decimal(totais.vendaDiaria, 1)}</td>
                <td colSpan={3} />
                <td className="num">{inteiro(totais.producaoProjetada)}</td>
                <td className="num">{inteiro(totais.estoque)}</td>
                <td className="num">{inteiro(totais.processo)}</td>
                <td className="num">{inteiro(totais.carteira)}</td>
                <td className={`num ${totais.saldo < 0 ? "negative" : "positive"}`}>{inteiro(totais.saldo)}</td>
                <td className="num">{inteiro(totais.vendaAcm)}</td>
                <td className="num">{inteiro(totais.estoqueDisponivel)}</td>
                <td colSpan={2} />
                <td className="num">{inteiro(totais.lote)}</td>
                <td className="num">{inteiro(totais.saldoComLote)}</td>
                <td colSpan={3} />
                <td className="num">{inteiro(totais.faltaProduzir)}</td>
                <td colSpan={2} />
                <td className="num">{semanas(totais.semanas)}</td>
                <td className="num">{dinheiro(totais.valorProgramado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* PAINEL LATERAL DE DETALHES (INSPECTOR) */}
        {mostrarInspector && (
          <aside className="inspector" style={{ background: "var(--surface)", borderLeft: "1px solid var(--line)", overflowY: "auto", padding: 16 }}>
            {!detalhe ? (
              <div className="empty-state" style={{ padding: 24, textAlign: "center" }}>
                <strong>Selecione uma linha</strong>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  Clique em qualquer linha da tabela para ver a estrutura de consumo, facção e alertas.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16 }}>
                      {detalhe.referencia} | {detalhe.tam} | {detalhe.corNome || detalhe.cor}
                    </h2>
                    <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                      {detalhe.descricao || "Sem descrição"} · Coleção: {detalhe.colecaoNome || "—"}
                    </p>
                  </div>
                  <button type="button" className="icon-button tiny" onClick={() => setSelecionada(null)}>
                    ✕
                  </button>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", color: "var(--muted)" }}>Resumo</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                    <div>Venda diária: <strong>{decimal(detalhe.vendaDiaria, 2)}</strong></div>
                    <div>Estoque disp.: <strong>{inteiro(detalhe.estoqueDisponivel)}</strong></div>
                    <div>Est. mínimo: <strong>{inteiro(detalhe.estoqueMinimo)}</strong></div>
                    <div>Saldo: <strong className={detalhe.saldo < 0 ? "negative" : "positive"}>{inteiro(detalhe.saldo)}</strong></div>
                    <div>Lote sugerido: <strong>{inteiro(sugerirLote(detalhe))}</strong></div>
                    <div>Ponto repos.: <strong>{inteiro(detalhe.pontoReposicao)}</strong></div>
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", color: "var(--muted)" }}>Facção: {detalhe.faccao || "não definida"}</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                    <div>Cap. semanal: <strong>{inteiro(detalhe.capacidade)}</strong></div>
                    <div>Semanas item: <strong>{semanas(detalhe.semanas)}</strong></div>
                    <div>Semanas facção: <strong>{semanas(detalhe.semanasFaccao)}</strong></div>
                    <div>Deadline: <strong>{detalhe.deadline || "—"}</strong></div>
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", color: "var(--muted)" }}>Insumos desta linha</h4>
                  {detalhe.insumos.length === 0 ? (
                    <p className="muted" style={{ fontSize: 12 }}>Sem consumo cadastrado.</p>
                  ) : (
                    <div className="table-scroll" style={{ maxHeight: 200 }}>
                      <table style={{ fontSize: 11 }}>
                        <thead>
                          <tr>
                            <th>Insumo</th>
                            <th>Nec.</th>
                            <th>Disp.</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detalhe.insumos.map((item, i) => (
                            <tr key={i}>
                              <td style={{ overflowWrap: "break-word" }}>{item.descricao || item.codigo}</td>
                              <td style={{ textAlign: "right" }}>{decimal(item.necessario)} {item.unid}</td>
                              <td style={{ textAlign: "right", color: item.atendeLinha ? "inherit" : "var(--danger)" }}>
                                {decimal(item.disponivel)}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span className={`status ${item.atende ? "yes" : "no"}`}>
                                  {item.atende ? "SIM" : "NÃO"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {dialogoAberto && (
        <ProdutoDialog
          aberto={dialogoAberto}
          base={produtoEditado}
          planejamento={plano?.planejamento || []}
          produtosConhecidos={plano?.complementos || []}
          colecoes={colecoes}
          faccoes={faccoes}
          aoFechar={() => setDialogoAberto(false)}
          aoSalvar={salvarProduto}
        />
      )}
    </main>
  );
}
