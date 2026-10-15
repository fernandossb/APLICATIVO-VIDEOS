import { useCallback, useEffect, useState } from "react";
import { usePcp } from "../../lib/pcp/PcpContext";
import { enviarParaBanco } from "../../lib/pcp/enviar";
import { lerPlanilhaPcp } from "../../lib/pcp/planilha";
import { filtrarPorColecao } from "../../lib/pcp/filtro721";
import { buscarComCache, limparCache } from "../../lib/pcp/buscar";
import { pcpDb } from "../../lib/pcp/pcpDb";
import {
  escolherPasta,
  lerBytes,
  navegadorSuporta,
  reautorizarPasta,
  recuperarPasta,
  varrerPasta,
} from "../../lib/pcp/pasta";
import {
  identificarRelatorio,
  lerConsumo,
  lerCsv,
  lerEstoqueMaterial,
  lerEstoqueProduto,
  lerMovimento,
  lerPedidos,
  lerProdutosPedido,
  lerOrdensPendentes,
} from "../../lib/pcp/relatorios";

const ROTULOS = {
  MOVIMENTO: "Estoque, produção e venda (721)",
  ESTOQUE_MATERIAL: "Estoque de matéria-prima (2120)",
  ESTOQUE_PRODUTO: "Produto acabado (2024)",
  CONSUMO: "Consumo por produto (2252)",
  PEDIDOS: "Pedidos emitidos",
  PRODUTOS_PEDIDO: "Produtos dos pedidos (carteira)",
  ORDENS_PENDENTES: "Ordens de produção pendentes",
};

const ORDEM_IMPORTACAO = [
  "ESTOQUE_PRODUTO",
  "MOVIMENTO",
  "ESTOQUE_MATERIAL",
  "CONSUMO",
  "PEDIDOS",
  "PRODUTOS_PEDIDO",
  "ORDENS_PENDENTES",
];

function inteiro(valor) {
  return Math.round(Number(valor) || 0).toLocaleString("pt-BR");
}

function dataHora(valor) {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleString("pt-BR");
}

export default function PcpImportarPage() {
  const { carregarPlano } = usePcp();
  const [suportado, setSuportado] = useState(true);
  const [pasta, setPasta] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [leituras, setLeituras] = useState([]);
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [situacao, setSituacao] = useState(null);
  const [progresso, setProgresso] = useState(null);
  const [resumoPlanilha, setResumoPlanilha] = useState("");

  const carregarSituacao = useCallback(async () => {
    try {
      const res = await pcpDb.obterSituacao();
      if (res?.ok) setSituacao(res);
    } catch {
      // Falha silenciosa caso o banco esteja vazio
    }
  }, []);

  useEffect(() => {
    carregarSituacao();
    setSuportado(navegadorSuporta());
    recuperarPasta()
      .then(async (handle) => {
        if (!handle) return;
        setPasta(handle);
        setGrupos(await varrerPasta(handle));
      })
      .catch(() => {});
  }, [carregarSituacao]);

  const abrirPasta = useCallback(async () => {
    setErro("");
    try {
      const handle = await escolherPasta();
      if (!handle) return;
      setPasta(handle);
      setLeituras([]);
      setOcupado("Procurando relatórios...");
      setGrupos(await varrerPasta(handle));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir a pasta.");
    } finally {
      setOcupado("");
    }
  }, []);

  const reler = useCallback(async () => {
    if (!pasta) return;
    setErro("");
    setOcupado("Procurando relatórios...");
    try {
      if (!(await reautorizarPasta(pasta))) {
        setErro("A permissão para ler a pasta foi negada.");
        return;
      }
      setGrupos(await varrerPasta(pasta));
      setLeituras([]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao reler a pasta.");
    } finally {
      setOcupado("");
    }
  }, [pasta]);

  const analisar = useCallback(async (grupo, arquivo) => {
    setErro("");
    setOcupado(`Lendo ${arquivo.nome}...`);
    const inicio = performance.now();
    try {
      const bytes = await lerBytes(arquivo);
      const csv = lerCsv(bytes);
      const tipo = identificarRelatorio(csv) ?? grupo.tipo;

      let resumo = { lidas: csv.linhas.length, aproveitadas: 0, descartadas: 0, avisos: [] };
      let amostra = [];
      let itens = [];
      let consolidado = false;

      if (tipo === "MOVIMENTO") {
        const r = lerMovimento(bytes, grupo.variacao);
        resumo = r.resumo;
        itens = r.itens;
        amostra = r.itens.slice(0, 4).map(
          (i) => `${i.referencia} ${i.cor} ${i.tam} — est: ${i.estoque}, proc: ${i.processo}, venda: ${i.vendaAcm}`,
        );
      } else if (tipo === "ESTOQUE_MATERIAL") {
        const r = lerEstoqueMaterial(bytes);
        resumo = r.resumo;
        itens = r.itens;
        amostra = r.itens.slice(0, 4).map(
          (i) => `${i.codigoMaterial} ${i.nomeCor} — ${inteiro(i.disponivel)} ${i.unidade} disponível`,
        );
      } else if (tipo === "ESTOQUE_PRODUTO") {
        const r = lerEstoqueProduto(bytes);
        resumo = r.resumo;
        itens = r.itens;
        amostra = r.itens.slice(0, 4).map((i) => `${i.referencia} ${i.cor} ${i.tam} — ${i.colecaoNome}`);
      } else if (tipo === "CONSUMO") {
        const r = lerConsumo(bytes, arquivo.nome);
        resumo = r.resumo;
        itens = r.itens;
        consolidado = r.consolidado === true;
        amostra = r.itens
          .slice(0, 4)
          .map((i) => `${i.produto}/${i.corProduto}: ${i.codigo} — ${i.consumo} ${i.unid} (faixa ${i.faixa})`);
      } else if (tipo === "PEDIDOS") {
        const r = lerPedidos(bytes);
        resumo = r.resumo;
        itens = r.itens;
        amostra = r.itens.slice(0, 4).map((i) => `Pedido ${i.numero} — ${i.descStatus || i.status}, entrega ${i.dtEntrega || "sem data"}`);
      } else if (tipo === "PRODUTOS_PEDIDO") {
        const r = lerProdutosPedido(bytes);
        resumo = r.resumo;
        itens = r.itens;
        amostra = r.itens
          .slice(0, 4)
          .map((i) => `Pedido ${i.numero}: ${i.referencia} ${i.cor} ${i.tam} — ped: ${i.qtdePedida}, exp: ${i.qtdeExpedida}`);
      } else if (tipo === "ORDENS_PENDENTES") {
        const r = lerOrdensPendentes(bytes);
        resumo = r.resumo;
        itens = r.itens;
        amostra = r.itens
          .slice(0, 4)
          .map(
            (i) =>
              `OP ${i.op}: ${i.referencia} ${i.cor} ${i.tam} — ${i.quantPendente} pendente, retorno: ${i.dtRetorno || "sem data"} (${i.faccao})`,
          );
      } else {
        resumo.avisos.push("Não reconheci este relatório pelas colunas.");
      }

      const leitura = {
        caminho: grupo.caminho,
        tipo,
        variacao: grupo.variacao,
        arquivo: arquivo.nome,
        data: arquivo.data,
        resumo,
        amostra,
        itens,
        consolidado,
        milissegundos: Math.round(performance.now() - inicio),
      };
      setLeituras((atuais) => [leitura, ...atuais.filter((l) => l.caminho !== grupo.caminho)]);
      return leitura;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
      return null;
    } finally {
      setOcupado("");
    }
  }, []);

  const enviar = useCallback(
    async (leitura) => {
      if (!leitura.tipo) {
        setErro("Não é possível gravar um relatório não reconhecido.");
        return false;
      }
      setErro("");
      setOcupado(`Gravando ${leitura.arquivo}...`);
      try {
        let itens = leitura.itens;
        let recorte = "";
        if (leitura.tipo === "MOVIMENTO") {
          const mapa = await pcpDb.obterColecoesProdutos();
          const r = filtrarPorColecao(
            leitura.itens,
            leitura.arquivo,
            mapa.colecoes ?? [],
            mapa.produtos ?? [],
          );
          if (!r.semRecorte) {
            itens = r.itens;
            recorte = `${r.descartadas} linha(s) de outras coleções ficaram de fora.`;
            if (itens.length === 0) {
              setErro("Nenhuma linha deste arquivo pertence à coleção que o escolheu.");
              return false;
            }
          }
        }

        const resultado = await enviarParaBanco(
          {
            tipo: leitura.tipo,
            variacao: leitura.variacao,
            arquivo: leitura.arquivo,
            dataArquivo: leitura.data,
            consolidado: leitura.consolidado === true,
            itens,
            resumo: {
              lidas: leitura.resumo.lidas,
              aproveitadas: itens.length,
              avisos: recorte ? [...leitura.resumo.avisos, recorte] : leitura.resumo.avisos,
            },
          },
          (enviados, total) => setProgresso({ caminho: leitura.caminho, enviados, total }),
        );

        setLeituras((atuais) =>
          atuais.map((l) =>
            l.caminho === leitura.caminho
              ? { ...l, enviado: { gravadas: resultado.gravadas, removidas: resultado.removidas } }
              : l,
          ),
        );

        limparCache();
        await carregarSituacao();
        await carregarPlano();
        return true;
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao gravar no banco.");
        return false;
      } finally {
        setProgresso(null);
        setOcupado("");
      }
    },
    [carregarSituacao, carregarPlano],
  );

  const importarPlanilha = useCallback(
    async (arquivo) => {
      setErro("");
      setResumoPlanilha("");
      setOcupado(`Lendo ${arquivo.name}...`);
      try {
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        const { programacao, planejamento, avisos } = await lerPlanilhaPcp(bytes);

        if (programacao.length === 0 && planejamento.length === 0) {
          setErro("Não encontrei as abas PROGRAMACAO e LEAD TIME nesta planilha.");
          return;
        }

        setOcupado("Gravando o planejamento...");
        let gravadas = 0;
        if (programacao.length > 0) {
          const r = await enviarParaBanco(
            {
              tipo: "PLANILHA",
              variacao: "",
              arquivo: arquivo.name,
              dataArquivo: "",
              itens: programacao,
              resumo: { lidas: programacao.length, aproveitadas: programacao.length, avisos },
            },
            (enviados, total) => setProgresso({ caminho: "planilha", enviados, total }),
          );
          gravadas += r.gravadas;
        }
        if (planejamento.length > 0) {
          const r = await enviarParaBanco(
            {
              tipo: "PLANEJAMENTO",
              variacao: "",
              arquivo: arquivo.name,
              dataArquivo: "",
              itens: planejamento,
              resumo: { lidas: planejamento.length, aproveitadas: planejamento.length, avisos: [] },
            },
            (enviados, total) => setProgresso({ caminho: "planilha", enviados, total }),
          );
          gravadas += r.gravadas;
        }

        setResumoPlanilha(
          `${programacao.length} linha(s) de programação e ${planejamento.length} produto(s) gravados.` +
            (avisos.length ? ` Avisos: ${avisos.join(" ")}` : ""),
        );

        limparCache();
        await carregarSituacao();
        await carregarPlano();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao ler a planilha.");
      } finally {
        setProgresso(null);
        setOcupado("");
      }
    },
    [carregarSituacao, carregarPlano],
  );

  const lerEGravarTodos = useCallback(async () => {
    setErro("");
    setAviso("");
    const fila = [...grupos]
      .filter((g) => g.maisRecente)
      .sort((a, b) => {
        const pa = ORDEM_IMPORTACAO.indexOf(a.tipo);
        const pb = ORDEM_IMPORTACAO.indexOf(b.tipo);
        return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
      });

    let gravados = 0;
    const falharam = [];
    for (const grupo of fila) {
      const leitura = await analisar(grupo, grupo.maisRecente);
      if (!leitura || !leitura.tipo) {
        falharam.push(`${grupo.maisRecente.nome} (não reconhecido)`);
        continue;
      }
      if (await enviar(leitura)) gravados += 1;
      else falharam.push(grupo.maisRecente.nome);
    }

    setAviso(
      falharam.length === 0
        ? `${gravados} relatório(s) lidos e gravados com sucesso.`
        : `${gravados} gravado(s). Ficou faltando: ${falharam.join(", ")}.`,
    );
  }, [grupos, analisar, enviar]);

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Planejamento e Controle de Produção</p>
          <h1>Importar Relatórios SISPLAN</h1>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={abrirPasta}
            disabled={!suportado || ocupado !== ""}
          >
            📁 {pasta ? "Trocar pasta" : "Escolher pasta"}
          </button>
          <label className="button button-outline" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
            📊 Importar planilha (.xlsx)
            <input
              type="file"
              accept=".xlsx"
              disabled={ocupado !== ""}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) importarPlanilha(f);
              }}
              style={{ display: "none" }}
            />
          </label>
          {pasta && (
            <>
              <button
                type="button"
                className="button button-outline"
                onClick={reler}
                disabled={ocupado !== ""}
              >
                🔄 Procurar
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={lerEGravarTodos}
                disabled={ocupado !== "" || grupos.length === 0}
              >
                ⚡ Ler e gravar todos
              </button>
            </>
          )}
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
      {ocupado && (
        <div className="faixa-aviso ok" style={{ margin: "16px 24px 0" }}>
          <span>⏳ {ocupado}</span>
        </div>
      )}
      {resumoPlanilha && (
        <div className="faixa-aviso ok" style={{ margin: "16px 24px 0" }}>
          <span>{resumoPlanilha}</span>
          <button type="button" className="button button-outline" onClick={() => setResumoPlanilha("")}>
            Fechar
          </button>
        </div>
      )}

      <section className="content-panel" style={{ margin: "16px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 24 }}>
          <div className="chart-card" style={{ padding: 18 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>💾 O que já está no banco local</h3>
            {situacao ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Programação</span>
                  <strong style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                    {inteiro(situacao.contagens.programacao)}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Produtos</span>
                  <strong style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                    {inteiro(situacao.contagens.produtos)}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Materiais</span>
                  <strong style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                    {inteiro(situacao.contagens.materiais)}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Consumo</span>
                  <strong style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                    {inteiro(situacao.contagens.consumo)}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Pedidos emitidos</span>
                  <strong style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                    {inteiro(situacao.contagens.pedidos)}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Itens em carteira</span>
                  <strong style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                    {inteiro(situacao.contagens.pedidosItens)}
                  </strong>
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Consultando banco local...</div>
            )}
          </div>

          <div className="chart-card" style={{ padding: 18 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>🕒 Últimas cargas registradas</h3>
            {situacao && situacao.importacoes?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                {situacao.importacoes.slice(0, 4).map((imp, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: "1px solid var(--line)",
                      paddingBottom: 6,
                    }}
                  >
                    <div>
                      <strong>{imp.arquivo || imp.tipo}</strong>
                      <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
                        {dataHora(imp.importadoEm)}
                      </span>
                    </div>
                    <span className="status-pill success" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {inteiro(imp.linhasAproveitadas)} lidas
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Nenhuma importação registrada ainda.</div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Arquivos e Relatórios Encontrados</h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            {pasta
              ? `Pasta ativa: ${pasta.name} — ${grupos.length} relatório(s) detectado(s)`
              : "Clique em Escolher pasta para selecionar o diretório com os CSVs do ERP."}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {grupos.length === 0 ? (
            <div className="chart-card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
              {pasta
                ? "Nenhum arquivo .csv encontrado nesta pasta nem nas subpastas."
                : "Selecione a pasta dos relatórios para começar."}
            </div>
          ) : (
            grupos.map((grupo) => {
              const leitura = leituras.find((l) => l.caminho === grupo.caminho);
              return (
                <div
                  key={grupo.caminho}
                  className="chart-card"
                  style={{
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    borderLeft: leitura?.enviado
                      ? "4px solid var(--success, #10b981)"
                      : "4px solid var(--line)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <strong style={{ fontSize: 15, display: "block" }}>
                        {grupo.tipo ? ROTULOS[grupo.tipo] : "Tipo não identificado"}
                      </strong>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        Pasta: {grupo.pasta} · {grupo.arquivos.length} arquivo(s)
                        {grupo.maisRecente ? ` · Mais recente: ${grupo.maisRecente.nome}` : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        className="button button-outline"
                        onClick={() => grupo.maisRecente && analisar(grupo, grupo.maisRecente)}
                        disabled={!grupo.maisRecente || ocupado !== ""}
                      >
                        Ler
                      </button>
                      {leitura && !leitura.enviado && (
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => enviar(leitura)}
                          disabled={ocupado !== "" || leitura.resumo.aproveitadas === 0}
                        >
                          Gravar {inteiro(leitura.resumo.aproveitadas)}
                        </button>
                      )}
                      {leitura?.enviado && (
                        <span className="status-pill success">Gravado</span>
                      )}
                    </div>
                  </div>

                  {leitura && (
                    <div style={{ background: "var(--card-hover, rgba(0,0,0,0.03))", padding: 12, borderRadius: 6 }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 16,
                          fontSize: 12,
                          color: "var(--muted)",
                          marginBottom: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>{inteiro(leitura.resumo.lidas)} lidas</span>
                        <span style={{ color: "var(--success, #10b981)", fontWeight: 600 }}>
                          {inteiro(leitura.resumo.aproveitadas)} aproveitadas
                        </span>
                        <span>{inteiro(leitura.resumo.descartadas)} descartadas</span>
                        <span>{leitura.milissegundos} ms</span>
                        {leitura.enviado && (
                          <span style={{ color: "var(--primary, #3b82f6)", fontWeight: 600 }}>
                            {inteiro(leitura.enviado.gravadas)} gravadas no banco local
                          </span>
                        )}
                      </div>

                      {progresso?.caminho === grupo.caminho && progresso.total > 0 && (
                        <div
                          style={{
                            height: 6,
                            background: "var(--line)",
                            borderRadius: 3,
                            overflow: "hidden",
                            margin: "6px 0",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              background: "var(--primary, #3b82f6)",
                              width: `${Math.round((progresso.enviados / progresso.total) * 100)}%`,
                              transition: "width 0.15s ease",
                            }}
                          />
                        </div>
                      )}

                      {leitura.resumo.avisos.map((a, idx) => (
                        <div key={idx} style={{ color: "var(--amber, #f59e0b)", fontSize: 12, marginTop: 4 }}>
                          ⚠️ {a}
                        </div>
                      ))}

                      {leitura.amostra.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8, fontSize: 11, fontFamily: "monospace", color: "var(--muted)" }}>
                          {leitura.amostra.map((linha, idx) => (
                            <span key={idx}>• {linha}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
