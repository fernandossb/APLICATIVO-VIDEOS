import { useEffect, useMemo, useState } from "react";
import { usePcp } from "../../lib/pcp/PcpContext";
import { recuperarPasta, recuperarPastaGuardada, reautorizarPasta } from "../../lib/pcp/pasta";
import { dataDoNome } from "../../lib/pcp/relatorios";
import { pcpDb } from "../../lib/pcp/pcpDb";
import { limparCache } from "../../lib/pcp/buscar";

const PASTA_721 = ["RELATORIO-721", "RELATÓRIO-721", "RELATORIO 721", "VENDA-721"];

function semAcento(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function inteiro(valor) {
  return Math.round(Number(valor) || 0).toLocaleString("pt-BR");
}

export default function PcpColecoesPage() {
  const { carregarPlano } = usePcp();
  const [linhas, setLinhas] = useState([]);
  const [podeEditar, setPodeEditar] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState("");
  const [arquivos, setArquivos] = useState([]);
  const [avisoPasta, setAvisoPasta] = useState("");
  const [precisaLiberar, setPrecisaLiberar] = useState(false);

  async function carregar() {
    try {
      setCarregando(true);
      setErro("");
      const corpo = await pcpDb.obterColecoes();
      setLinhas(corpo.colecoes ?? []);
      setPodeEditar(corpo.podeEditar ?? true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as coleções.");
    } finally {
      setCarregando(false);
    }
  }

  async function carregarArquivos(pedirPermissao = false) {
    try {
      let raiz = await recuperarPasta();
      if (!raiz) {
        const guardada = await recuperarPastaGuardada();
        if (guardada && pedirPermissao) {
          if (await reautorizarPasta(guardada)) raiz = guardada;
        }
        if (!raiz) {
          setPrecisaLiberar(Boolean(guardada));
          setAvisoPasta(
            guardada
              ? "A pasta dos relatórios está guardada, mas o navegador pede sua autorização a cada recarga."
              : "Abra a tela Importar e selecione a pasta dos relatórios para listar os arquivos aqui.",
          );
          return;
        }
      }
      setPrecisaLiberar(false);

      let pasta721 = null;
      for await (const [nome, entrada] of raiz) {
        if (entrada.kind !== "directory") continue;
        if (PASTA_721.some((p) => semAcento(nome) === semAcento(p))) {
          pasta721 = entrada;
          break;
        }
      }
      if (!pasta721) {
        setAvisoPasta("Não achei a pasta RELATORIO-721 dentro da pasta dos relatórios.");
        return;
      }
      const achados = [];
      for await (const [nome, entrada] of pasta721) {
        if (entrada.kind === "file" && nome.toLowerCase().endsWith(".csv")) achados.push(nome);
      }
      achados.sort((a, b) => (dataDoNome(b) ?? b).localeCompare(dataDoNome(a) ?? a));
      setArquivos(achados);
      setAvisoPasta(achados.length === 0 ? "A pasta RELATORIO-721 está vazia." : "");
    } catch {
      setAvisoPasta("Não consegui ler a pasta. Reabra a tela Importar e autorize novamente.");
    }
  }

  useEffect(() => {
    carregar();
    carregarArquivos();
  }, []);

  async function gravar(nome, lancamento, arquivo) {
    setSalvando(nome);
    setErro("");
    try {
      await pcpDb.salvarColecao(nome, lancamento, arquivo);
      limparCache("/api/colecoes");
      limparCache("/api/plano");
      setLinhas((atual) =>
        atual.map((l) => (l.nome === nome ? { ...l, lancamento, arquivo, origem: "manual" } : l)),
      );
      setAviso(`Coleção ${nome} atualizada.`);
      await carregarPlano();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gravar.");
    } finally {
      setSalvando("");
    }
  }

  const resumo = useMemo(() => {
    const semData = linhas.filter((l) => !l.lancamento);
    return {
      total: linhas.length,
      semData: semData.length,
      produtosSemData: semData.reduce((t, l) => t + (l.produtos || 0), 0),
    };
  }, [linhas]);

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Planejamento e Controle de Produção</p>
          <h1>Coleções e Lançamentos</h1>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="button button-outline button-icon"
            onClick={carregar}
            title="Recarregar"
          >
            🔄
          </button>
          <span className="status-pill">{inteiro(resumo.total)} coleções</span>
        </div>
      </header>

      {erro && (
        <div className="faixa-aviso erro" role="alert" style={{ margin: "16px 24px 0" }}>
          <span>{erro}</span>
          <button type="button" className="button button-outline" onClick={() => setErro("")}>
            Fechar
          </button>
        </div>
      )}
      {aviso && (
        <div className="faixa-aviso ok" style={{ margin: "16px 24px 0" }}>
          <span>{aviso}</span>
          <button type="button" className="button button-outline" onClick={() => setAviso("")}>
            Fechar
          </button>
        </div>
      )}

      <section
        className="content-panel"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: "16px 24px",
          maxWidth: "100%",
          width: "100%",
          margin: 0,
          overflow: "hidden",
        }}
      >
        <div className="module-head" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, margin: "0 0 6px" }}>Datas de Lançamento por Coleção</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 13, maxWidth: 840, lineHeight: 1.5 }}>
              A venda diária é calculada a partir da data de lançamento. Sem data definida, a venda diária fica zerada —
              e zera também o estoque mínimo, estoque máximo, dias de estoque e o ponto de reposição.
              Salve os arquivos 721 na pasta <strong>RELATORIO-721</strong> nomeados com a data (ex.: <strong>26-08-2026.csv</strong>)
              para preenchimento automático.
            </p>
          </div>
        </div>

        {avisoPasta && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 18px",
              background: "var(--amber-muted, rgba(245, 158, 11, 0.08))",
              borderRadius: 8,
              border: "1px solid var(--amber, #f59e0b)",
              marginBottom: 16,
            }}
          >
            <span style={{ color: "var(--amber, #f59e0b)", fontWeight: 600, fontSize: 13 }}>
              ⚠️ {avisoPasta}
            </span>
            {precisaLiberar && (
              <button
                type="button"
                className="button button-primary"
                onClick={() => carregarArquivos(true)}
              >
                Liberar acesso à pasta
              </button>
            )}
          </div>
        )}

        {resumo.semData > 0 && !carregando && (
          <div
            style={{
              padding: "12px 18px",
              background: "var(--amber-muted, rgba(245, 158, 11, 0.08))",
              borderRadius: 8,
              border: "1px solid var(--amber, #f59e0b)",
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <strong style={{ color: "var(--amber, #f59e0b)" }}>
              {inteiro(resumo.produtosSemData)} produto(s) em {inteiro(resumo.semData)} coleção(ões) sem data de lançamento.
            </strong>
            <span style={{ color: "var(--muted)" }}> A venda diária deles não pode ser projetada.</span>
          </div>
        )}

        <div className="table-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {carregando ? (
            <div className="vazio-central" style={{ padding: 48, textAlign: "center" }}>
              Carregando coleções...
            </div>
          ) : linhas.length === 0 ? (
            <div className="vazio-central" style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>
              <strong>Nenhuma coleção no banco ainda.</strong>
              <p style={{ marginTop: 8 }}>
                Importe o relatório de estoque de produto (2024) na aba <strong>Importar</strong> para carregar as coleções.
              </p>
            </div>
          ) : (
            <table
              className="module-table"
              style={{
                width: "100%",
                minWidth: 960,
                tableLayout: "fixed",
                borderCollapse: "collapse",
              }}
            >
              <colgroup>
                <col style={{ width: 260 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 230 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 160 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ width: 260, textAlign: "left", padding: "10px 12px" }}>Coleção</th>
                  <th className="num" style={{ width: 110, textAlign: "right", padding: "10px 12px" }}>
                    Produtos
                  </th>
                  <th style={{ width: 230, textAlign: "left", padding: "10px 12px" }}>Arquivo 721</th>
                  <th style={{ width: 170, textAlign: "left", padding: "10px 12px" }}>Lançamento</th>
                  <th style={{ width: 120, textAlign: "left", padding: "10px 12px" }}>Origem</th>
                  <th style={{ width: 160, textAlign: "left", padding: "10px 12px" }}>Quem definiu</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr
                    key={l.nome}
                    className={!l.lancamento ? "inactive-row" : undefined}
                    style={{ borderBottom: "1px solid var(--line)" }}
                  >
                    <td
                      style={{
                        padding: "8px 12px",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                        whiteSpace: "normal",
                      }}
                      title={l.nome}
                    >
                      <strong>{l.nome}</strong>
                    </td>
                    <td className="num" style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {inteiro(l.produtos)}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <select
                        className="lote-input"
                        style={{ width: "100%", maxWidth: 210, textAlign: "left", padding: "4px 8px" }}
                        value={l.arquivo || ""}
                        disabled={!podeEditar || salvando === l.nome}
                        onChange={(e) => {
                          const arquivo = e.target.value;
                          const daData = dataDoNome(arquivo);
                          const lancamento = l.lancamento || daData || "";
                          setLinhas((atual) =>
                            atual.map((x) => (x.nome === l.nome ? { ...x, arquivo, lancamento } : x)),
                          );
                          gravar(l.nome, lancamento, arquivo);
                        }}
                      >
                        <option value="">-- nenhum --</option>
                        {Boolean(l.arquivo) && !arquivos.includes(l.arquivo) && (
                          <option value={l.arquivo}>{l.arquivo} (fora da pasta)</option>
                        )}
                        {arquivos.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <input
                        type="date"
                        className="lote-input"
                        style={{ width: "100%", maxWidth: 150, textAlign: "center", padding: "4px 8px" }}
                        value={l.lancamento || ""}
                        disabled={!podeEditar || salvando === l.nome}
                        onChange={(e) =>
                          setLinhas((atual) =>
                            atual.map((x) => (x.nome === l.nome ? { ...x, lancamento: e.target.value } : x)),
                          )
                        }
                        onBlur={(e) => {
                          gravar(l.nome, e.target.value, l.arquivo || "");
                        }}
                      />
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--muted)" }}>
                      {l.origem === "manual" ? "Digitada" : l.origem === "importacao" ? "Do arquivo" : "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        color: "var(--muted)",
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                      }}
                      title={l.atualizadoPor}
                    >
                      {l.atualizadoPor || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
