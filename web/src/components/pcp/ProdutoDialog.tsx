import { useEffect, useMemo, useRef, useState } from "react";
import type { LinhaCalculada, PlanejamentoProduto } from "@/lib/pcp/calc";
import { compararTamanho } from "@/lib/pcp/tamanhos";

export interface ProdutoConhecido {
  referencia: string;
  cor: string;
  tam: string;
  colecao: string;
  colecaoNome: string;
  corNome: string;
  descricao: string;
  ativo: boolean;
}

export interface TamanhoGrade {
  id: string;
  tam: string;
  gradePadrao: number;
  estoque: number;
  processo: number;
  carteira: number;
  lote: number;
}

export interface FormProduto {
  referencia: string;
  colecao: string;
  colecaoNome: string;
  cor: string;
  corNome: string;
  descricao: string;
  faccao: string;
  lancamento: string;
  deadline: string;
  leadTime: number;
  capacidade: number;
  unidade: number;
  precoCostura: number;
  obsProduto: string;
  ativo: boolean;
  projecaoTotal: number;
  curva: number[];
  curvaVenda: number[];
  curvaFaturamento: number[];
  grade: TamanhoGrade[];
}

const GRADE_PADRAO = ["P", "M", "G", "GG"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function doze(valores: number[] | undefined | null): number[] {
  const base = Array.isArray(valores) ? valores : [];
  return Array.from({ length: 12 }, (_, i) => Number(base[i]) || 0);
}

function curvaVazia(valores: number[]): boolean {
  return valores.every((v) => !v);
}

function gradeIntocada(grade: TamanhoGrade[]): boolean {
  if (grade.length !== GRADE_PADRAO.length) return false;
  return grade.every(
    (t, i) =>
      t.tam === GRADE_PADRAO[i] &&
      t.gradePadrao === 1 &&
      t.estoque === 0 &&
      t.processo === 0 &&
      t.carteira === 0 &&
      t.lote === 0,
  );
}

function vazio(): FormProduto {
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    referencia: "",
    colecao: "",
    colecaoNome: "",
    cor: "",
    corNome: "",
    descricao: "",
    faccao: "",
    lancamento: hoje,
    deadline: hoje,
    leadTime: 30,
    capacidade: 0,
    unidade: 1,
    precoCostura: 0,
    obsProduto: "",
    ativo: true,
    projecaoTotal: 0,
    curva: doze([]),
    curvaVenda: doze([]),
    curvaFaturamento: doze([]),
    grade: GRADE_PADRAO.map((tam) => ({ id: "", tam, gradePadrao: 1, estoque: 0, processo: 0, carteira: 0, lote: 0 })),
  };
}

export function distribuirProjecao(total: number, pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const arredondado = Math.round(Number(total) || 0);
  const somaPesos = pesos.reduce((t, p) => t + Math.max(0, Number(p) || 0), 0);
  const efetivo = somaPesos > 0 ? somaPesos : pesos.length;
  let distribuido = 0;
  return pesos.map((peso, indice) => {
    if (indice === pesos.length - 1) return arredondado - distribuido;
    const parte = Math.round((arredondado * (somaPesos > 0 ? Math.max(0, Number(peso) || 0) : 1)) / efetivo);
    distribuido += parte;
    return parte;
  });
}

function Curva({
  titulo,
  ajuda,
  valores,
  aoMudar,
}: {
  titulo: string;
  ajuda: string;
  valores: number[];
  aoMudar: (valores: number[]) => void;
}) {
  const total = valores.reduce((t, v) => t + (Number(v) || 0), 0);
  const maior = valores.reduce((t, v) => Math.max(t, Number(v) || 0), 0);

  return (
    <div className="curva-bloco">
      <div className="curva-head">
        <strong>{titulo}</strong>
        <span>{ajuda}</span>
        <span className="curva-total">
          soma {Math.round(total * 100)}% | maior {Math.round(maior * 100)}%
        </span>
      </div>
      <div className="curva-meses">
        {MESES.map((mes, indice) => (
          <label key={mes}>
            {mes}
            <input
              type="number"
              min={0}
              step="0.01"
              value={Number(((valores[indice] ?? 0) * 100).toFixed(2))}
              onChange={(e) => {
                const proximo = [...valores];
                proximo[indice] = (Number(e.target.value) || 0) / 100;
                aoMudar(proximo);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ProdutoDialog({
  aberto,
  base,
  planejamento,
  produtosConhecidos,
  colecoes,
  faccoes,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  base: LinhaCalculada[];
  planejamento: PlanejamentoProduto[];
  produtosConhecidos: ProdutoConhecido[];
  colecoes: string[];
  faccoes: string[];
  aoFechar: () => void;
  aoSalvar: (form: FormProduto) => Promise<void>;
}) {
  const editando = base.length > 0;
  const [form, setForm] = useState<FormProduto>(vazio());
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [avisoAutomatico, setAvisoAutomatico] = useState("");
  const chaveJaPesquisadaRef = useRef("");

  useEffect(() => {
    if (!aberto) return;
    setErro("");
    setAvisoAutomatico("");
    chaveJaPesquisadaRef.current = "";
    if (!editando) {
      setForm(vazio());
      return;
    }
    const primeira = base[0];
    const plano = planejamento.find((p) => p.referencia === primeira.referencia && p.cor === primeira.cor);
    setForm({
      referencia: primeira.referencia,
      colecao: primeira.colecao,
      colecaoNome: primeira.colecaoNome,
      cor: primeira.cor,
      corNome: primeira.corNome,
      descricao: primeira.descricao,
      faccao: primeira.faccao,
      lancamento: primeira.lancamento,
      deadline: primeira.deadline,
      leadTime: plano?.leadTime || primeira.leadTime,
      capacidade: primeira.capacidade,
      unidade: primeira.unidade,
      precoCostura: primeira.precoCostura,
      obsProduto: primeira.obsProduto ?? "",
      ativo: primeira.ativo !== false,
      projecaoTotal: plano?.projecaoTotal || base.reduce((t, l) => t + l.projVenda, 0),
      curva: doze(plano?.curva),
      curvaVenda: doze(plano?.curvaVenda),
      curvaFaturamento: doze(plano?.curvaFaturamento),
      grade: [...base]
        .sort((a, b) => compararTamanho(a.tam, b.tam))
        .map((l) => ({
          id: l.id,
          tam: l.tam,
          gradePadrao: l.gradePadrao || l.projVenda || 1,
          estoque: l.estoque,
          processo: l.processo,
          carteira: l.carteira,
          lote: l.lote,
        })),
    });
  }, [aberto, editando, base, planejamento]);

  useEffect(() => {
    if (editando) return;
    const referencia = form.referencia.trim().toUpperCase();
    const cor = form.cor.trim().toUpperCase();
    if (!referencia || !cor) {
      chaveJaPesquisadaRef.current = "";
      setAvisoAutomatico("");
      return;
    }
    const chave = `${referencia}|${cor}`;
    if (chaveJaPesquisadaRef.current === chave) return;

    const doRelatorio = produtosConhecidos.filter((p) => p.referencia === referencia && p.cor === cor);
    const doPlanejamento = planejamento.find((p) => p.referencia === referencia && p.cor === cor);
    if (doRelatorio.length === 0 && !doPlanejamento) return;
    chaveJaPesquisadaRef.current = chave;

    const fontes: string[] = [];
    if (doRelatorio.length > 0) fontes.push("no relatório de produto acabado (2024)");
    if (doPlanejamento) fontes.push("na planilha de planejamento (LEAD TIME)");
    setAvisoAutomatico(
      `Encontramos ${referencia}/${cor} ${fontes.join(" e ")}. Preenchemos abaixo o que estava em branco — ajuste como desejar.`,
    );

    setForm((f) => {
      const primeiro = doRelatorio[0];
      const tamanhosConhecidos = [...new Set(doRelatorio.map((p) => p.tam).filter(Boolean))].sort(compararTamanho);

      return {
        ...f,
        colecao: f.colecao || primeiro?.colecao || f.colecao,
        colecaoNome: f.colecaoNome || primeiro?.colecaoNome || f.colecaoNome,
        corNome: f.corNome || primeiro?.corNome || f.corNome,
        descricao: f.descricao || primeiro?.descricao || f.descricao,
        ativo: primeiro ? doRelatorio.some((p) => p.ativo !== false) : f.ativo,
        projecaoTotal: f.projecaoTotal || doPlanejamento?.projecaoTotal || f.projecaoTotal,
        leadTime: f.leadTime === 30 && doPlanejamento?.leadTime ? doPlanejamento.leadTime : f.leadTime,
        curva: curvaVazia(f.curva) && doPlanejamento ? doze(doPlanejamento.curva) : f.curva,
        curvaVenda: curvaVazia(f.curvaVenda) && doPlanejamento ? doze(doPlanejamento.curvaVenda) : f.curvaVenda,
        curvaFaturamento:
          curvaVazia(f.curvaFaturamento) && doPlanejamento ? doze(doPlanejamento.curvaFaturamento) : f.curvaFaturamento,
        grade:
          gradeIntocada(f.grade) && tamanhosConhecidos.length > 0
            ? tamanhosConhecidos.map((tam) => ({ id: "", tam, gradePadrao: 1, estoque: 0, processo: 0, carteira: 0, lote: 0 }))
            : f.grade,
      };
    });
  }, [editando, form.referencia, form.cor, produtosConhecidos, planejamento]);

  const projecoes = useMemo(
    () => distribuirProjecao(form.projecaoTotal, form.grade.map((t) => t.gradePadrao)),
    [form.projecaoTotal, form.grade],
  );

  if (!aberto) return null;

  function alterar<C extends keyof FormProduto>(campo: C, valor: FormProduto[C]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function alterarTamanho(indice: number, campo: keyof TamanhoGrade, valor: string) {
    setForm((f) => {
      const grade = [...f.grade];
      const alvo = { ...grade[indice] };
      if (campo === "tam") alvo.tam = valor.toUpperCase();
      else (alvo[campo] as number) = Number(valor) || 0;
      grade[indice] = alvo;
      return { ...f, grade };
    });
  }

  function ordenarGrade() {
    setForm((f) => ({ ...f, grade: [...f.grade].sort((a, b) => compararTamanho(a.tam, b.tam)) }));
  }

  function adicionarTamanho() {
    setForm((f) => ({
      ...f,
      grade: [...f.grade, { id: "", tam: "", gradePadrao: 1, estoque: 0, processo: 0, carteira: 0, lote: 0 }],
    }));
  }

  function removerTamanho(indice: number) {
    setForm((f) => ({ ...f, grade: f.grade.filter((_, i) => i !== indice) }));
  }

  async function salvar() {
    setErro("");
    if (!form.referencia.trim() || !form.cor.trim()) {
      setErro("Informe a referência e a cor do produto.");
      return;
    }
    const tamanhos = form.grade.map((t) => t.tam.trim().toUpperCase()).filter(Boolean);
    if (tamanhos.length === 0) {
      setErro("Informe pelo menos um tamanho na grade.");
      return;
    }
    const repetido = tamanhos.find((t, i) => tamanhos.indexOf(t) !== i);
    if (repetido) {
      setErro(`O tamanho ${repetido} está repetido na grade.`);
      return;
    }

    setSalvando(true);
    try {
      await aoSalvar({ ...form, grade: [...form.grade].sort((a, b) => compararTamanho(a.tam, b.tam)) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar o produto.");
    } finally {
      setSalvando(false);
    }
  }

  const totalDistribuido = projecoes.reduce((t, v) => t + v, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editando ? "Editar produto" : "Cadastrar produto"}
      className="modal"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "grid",
        placeItems: "center",
        padding: "16px",
        background: "rgba(13, 27, 29, 0.65)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div
        className="modal-card modal-card-wide product-card"
        style={{
          maxWidth: 860,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 100000,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
        }}
      >
        <header className="modal-header">
          <div>
            <h2>{editando ? `Editar produto ${form.referencia}/${form.cor}` : "Cadastrar produto"}</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {editando
                ? "Altere os dados do produto. A grade define quantos tamanhos entram na Programação."
                : "Preencha os dados e informe a grade de tamanhos que entrará na Programação."}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={aoFechar} aria-label="Fechar">
            ✕
          </button>
        </header>

        {erro && (
          <div className="faixa-aviso erro" style={{ margin: "12px 18px 0" }} role="alert">
            <span>{erro}</span>
          </div>
        )}
        {!erro && avisoAutomatico && (
          <div className="faixa-aviso ok" style={{ margin: "12px 18px 0" }} role="status">
            <span>{avisoAutomatico}</span>
            <button type="button" className="button button-outline tiny" onClick={() => setAvisoAutomatico("")}>
              Fechar
            </button>
          </div>
        )}

        <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto", padding: "18px 24px" }}>
          <div className="field-grid-edit" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <label>
              Referência
              <input
                value={form.referencia}
                disabled={editando}
                onChange={(e) => alterar("referencia", e.target.value.toUpperCase())}
                placeholder="Ex.: 367C1"
              />
            </label>
            <label>
              Código da cor
              <input
                value={form.cor}
                disabled={editando}
                onChange={(e) => alterar("cor", e.target.value.toUpperCase())}
                placeholder="Ex.: 181001"
              />
            </label>
            <label>
              Descrição da cor
              <input
                value={form.corNome}
                onChange={(e) => alterar("corNome", e.target.value.toUpperCase())}
                placeholder="Ex.: BRANCO"
              />
            </label>
            <label>
              Descrição do produto
              <input value={form.descricao} onChange={(e) => alterar("descricao", e.target.value)} placeholder="Ex.: CAMISETA" />
            </label>

            <label>
              Coleção
              <select value={form.colecaoNome} onChange={(e) => alterar("colecaoNome", e.target.value)}>
                <option value="">-- sem coleção --</option>
                {!!form.colecaoNome && !colecoes.includes(form.colecaoNome) && (
                  <option value={form.colecaoNome}>{form.colecaoNome} (fora do relatório)</option>
                )}
                {colecoes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lançamento
              <input type="date" value={form.lancamento} onChange={(e) => alterar("lancamento", e.target.value)} />
            </label>
            <label>
              Deadline
              <input type="date" value={form.deadline} onChange={(e) => alterar("deadline", e.target.value)} />
            </label>

            <label>
              Lead time (dias)
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.leadTime}
                onChange={(e) => alterar("leadTime", Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Facção
              <input list="lista-faccoes" value={form.faccao} onChange={(e) => alterar("faccao", e.target.value.toUpperCase())} />
              <datalist id="lista-faccoes">
                {faccoes.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>
            <label>
              Capacidade semanal da facção
              <input
                type="number"
                min={0}
                value={form.capacidade}
                onChange={(e) => alterar("capacidade", Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Unidade (peças por pack)
              <input
                type="number"
                min={1}
                value={form.unidade}
                onChange={(e) => alterar("unidade", Number(e.target.value) || 1)}
              />
            </label>

            <label>
              Preço costura
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.precoCostura}
                onChange={(e) => alterar("precoCostura", Number(e.target.value) || 0)}
              />
            </label>
            <label style={{ gridColumn: "span 2" }}>
              Observação do produto
              <input value={form.obsProduto} onChange={(e) => alterar("obsProduto", e.target.value)} />
            </label>
            <label className="inline-check" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
              <input type="checkbox" checked={form.ativo} onChange={(e) => alterar("ativo", e.target.checked)} style={{ width: "auto" }} />
              <strong>Produto ativo</strong>
            </label>
          </div>

          <section className="product-grade" style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            <div className="product-grade-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15 }}>Grade de projeção por tamanho</h3>
                <span className="muted" style={{ fontSize: 12 }}>
                  {totalDistribuido.toLocaleString("pt-BR")} peça(s) distribuída(s) em {form.grade.length} tamanho(s).
                </span>
              </div>
              <button type="button" className="button button-outline tiny" onClick={adicionarTamanho}>
                + Adicionar tamanho
              </button>
            </div>

            <div className="table-scroll" style={{ maxHeight: 220 }}>
              <table className="grade-table" style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Tamanho</th>
                    <th>Grade padrão</th>
                    <th>Proj. tamanho</th>
                    <th>Estoque</th>
                    <th>Processo</th>
                    <th>Carteira</th>
                    <th>Lote</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {form.grade.map((tamanho, indice) => (
                    <tr key={indice}>
                      <td>
                        <input
                          className="grade-size"
                          value={tamanho.tam}
                          onChange={(e) => alterarTamanho(indice, "tam", e.target.value)}
                          onBlur={ordenarGrade}
                          placeholder="P"
                          style={{ textAlign: "center", fontWeight: 700 }}
                        />
                      </td>
                      <td>
                        <input
                          className="num-input"
                          type="number"
                          min={0}
                          step="0.01"
                          value={tamanho.gradePadrao}
                          onChange={(e) => alterarTamanho(indice, "gradePadrao", e.target.value)}
                          style={{ textAlign: "right" }}
                        />
                      </td>
                      <td>
                        <input className="num-input" value={(projecoes[indice] ?? 0).toLocaleString("pt-BR")} readOnly style={{ textAlign: "right", background: "var(--surface-soft)" }} />
                      </td>
                      <td>
                        <input
                          className="num-input"
                          type="number"
                          value={tamanho.estoque}
                          onChange={(e) => alterarTamanho(indice, "estoque", e.target.value)}
                          style={{ textAlign: "right" }}
                        />
                      </td>
                      <td>
                        <input
                          className="num-input"
                          type="number"
                          value={tamanho.processo}
                          onChange={(e) => alterarTamanho(indice, "processo", e.target.value)}
                          style={{ textAlign: "right" }}
                        />
                      </td>
                      <td>
                        <input
                          className="num-input"
                          type="number"
                          value={tamanho.carteira}
                          onChange={(e) => alterarTamanho(indice, "carteira", e.target.value)}
                          style={{ textAlign: "right" }}
                        />
                      </td>
                      <td>
                        <input
                          className="num-input"
                          type="number"
                          min={0}
                          value={tamanho.lote}
                          onChange={(e) => alterarTamanho(indice, "lote", e.target.value)}
                          style={{ textAlign: "right" }}
                        />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="icon-button tiny"
                          onClick={() => removerTamanho(indice)}
                          title="Remover tamanho"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="product-grade" style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Curvas mensais do produto</h3>
            <p className="muted" style={{ margin: "0 0 14px", fontSize: 12 }}>
              Valores em porcentagem (Janeiro a Dezembro). É a curva de PRODUÇÃO que calcula a coluna Prod. projetada da Programação.
            </p>

            <Curva
              titulo="Produção"
              ajuda="Acumulada: em qual mês a produção atinge 100%."
              valores={form.curva}
              aoMudar={(v) => alterar("curva", v)}
            />
            <Curva
              titulo="Venda"
              ajuda="Quanto da projeção se vende em cada mês."
              valores={form.curvaVenda}
              aoMudar={(v) => alterar("curvaVenda", v)}
            />
            <Curva
              titulo="Faturamento"
              ajuda="Quanto do faturamento cai em cada mês."
              valores={form.curvaFaturamento}
              aoMudar={(v) => alterar("curvaFaturamento", v)}
            />
          </section>
        </div>

        <footer className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 24px", borderTop: "1px solid var(--line)" }}>
          <button type="button" className="button button-outline" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="button button-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar produto"}
          </button>
        </footer>
      </div>
    </div>
  );
}
