import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { calcularPlano } from "./calc.ts";
import { lancamentoDaLinha } from "./prioridades.ts";
import { buscarComCache, limparCache } from "./buscar.ts";
import { pcpDb } from "./pcpDb.ts";

const PcpContext = createContext(null);

export function PcpProvider({ children, aoNavegar }) {
  const [plano, setPlano] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [lotesEditados, setLotesEditados] = useState(new Map());
  const [salvando, setSalvando] = useState(false);
  const [conflitos, setConflitos] = useState([]);
  const [subRelatorio, setSubRelatorio] = useState(null);
  const precisaRecarregarRef = useRef(false);

  const carregarPlano = useCallback(async () => {
    try {
      setCarregando(true);
      setErro("");
      const corpo = await buscarComCache("/api/plano");
      setPlano(corpo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o plano do PCP.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarPlano();
  }, [carregarPlano]);

  const linhas = useMemo(() => {
    if (!plano) return [];

    const porChave = new Map();
    const colecaoPorReferencia = new Map();
    for (const c of plano.complementos ?? []) {
      porChave.set(`${c.referencia}|${c.cor}|${c.tam}`, c);
      porChave.set(`${c.referencia}|${c.cor}|`, c);
      if (c.colecaoNome && !colecaoPorReferencia.has(c.referencia)) {
        colecaoPorReferencia.set(c.referencia, c);
      }
    }

    const lancamentoPorColecao = new Map();
    for (const c of plano.colecoes ?? []) {
      if (c.lancamento) lancamentoPorColecao.set(c.nome.trim().toUpperCase(), c.lancamento);
    }

    const base = plano.programacao.map((linha) => {
      const complemento =
        porChave.get(`${linha.referencia}|${linha.cor}|${linha.tam}`) ??
        porChave.get(`${linha.referencia}|${linha.cor}|`);
      const doTamanho = porChave.get(`${linha.referencia}|${linha.cor}|${linha.tam}`);
      const porReferencia = colecaoPorReferencia.get(linha.referencia);
      const colecaoDaLinha =
        complemento?.colecaoNome || porReferencia?.colecaoNome || linha.colecaoNome || "";

      return {
        ...linha,
        lote: lotesEditados.get(linha.id) ?? linha.lote,
        colecao: complemento?.colecao || porReferencia?.colecao || linha.colecao || "",
        colecaoNome: colecaoDaLinha,
        corNome: linha.corNome || complemento?.corNome || "",
        descricao: linha.descricao || complemento?.descricao || "",
        lancamento: lancamentoDaLinha(linha.lancamento, colecaoDaLinha, lancamentoPorColecao),
        ativo: linha.ativo !== false,
        ativoRelatorio: doTamanho ? doTamanho.ativo !== false : undefined,
      };
    });

    return calcularPlano(base, {
      consumo: plano.consumo || [],
      materiais: plano.materiais || [],
      planejamento: plano.planejamento || [],
    });
  }, [plano, lotesEditados]);

  const editarLote = useCallback((id, lote) => {
    setLotesEditados((atual) => {
      const proximo = new Map(atual);
      proximo.set(id, Number.isFinite(lote) && lote >= 0 ? lote : 0);
      return proximo;
    });
  }, []);

  const desfazer = useCallback(() => {
    setLotesEditados(new Map());
    setConflitos([]);
  }, []);

  const salvarLotes = useCallback(async () => {
    if (!plano || lotesEditados.size === 0) return;
    setSalvando(true);
    setErro("");
    setAviso("");
    setConflitos([]);
    try {
      const alteracoes = [...lotesEditados.entries()].map(([id, lote]) => ({ id, lote }));
      const corpo = await pcpDb.salvarLotes(alteracoes);
      limparCache("/api/plano");
      setLotesEditados(new Map());
      setAviso(`${corpo.gravadas || 0} lote(s) gravado(s) com sucesso.`);
      await carregarPlano();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar os lotes.");
    } finally {
      setSalvando(false);
    }
  }, [plano, lotesEditados, carregarPlano]);

  const limparLotes = useCallback(
    async (ids) => {
      if (!plano || ids.length === 0) return;
      const alteracoes = ids.map((id) => ({ id, lote: 0 }));
      await pcpDb.salvarLotes(alteracoes);
      limparCache("/api/plano");
      await carregarPlano();
    },
    [plano, carregarPlano],
  );

  const salvarProduto = useCallback(
    async (form) => {
      const corpo = await pcpDb.salvarProduto(form);
      limparCache("/api/plano");
      setAviso(`Produto ${form.referencia}/${form.cor} salvo com sucesso.`);
      await carregarPlano();
      return corpo;
    },
    [carregarPlano],
  );

  const excluirLinhas = useCallback(
    async (linhasParaExcluir) => {
      if (linhasParaExcluir.length === 0) return;
      const rotulo =
        linhasParaExcluir.length === 1
          ? `a linha ${`${linhasParaExcluir[0].referencia} ${linhasParaExcluir[0].tam} ${linhasParaExcluir[0].cor}`.trim()}`
          : `${linhasParaExcluir.length} linhas`;
      if (!window.confirm(`Excluir ${rotulo}? Não é possível desfazer.`)) return;

      try {
        await pcpDb.excluirLinhas(linhasParaExcluir.map((l) => l.id));
        limparCache("/api/plano");
        setAviso(`${linhasParaExcluir.length} linha(s) excluída(s).`);
        await carregarPlano();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao excluir.");
      }
    },
    [carregarPlano],
  );

  const alternarAtivo = useCallback(async (linha) => {
    const proximoAtivo = linha.ativo === false;
    try {
      await pcpDb.alternarAtivo(linha.id, proximoAtivo);
      precisaRecarregarRef.current = true;
      setPlano((atual) => {
        if (!atual) return atual;
        return {
          ...atual,
          programacao: atual.programacao.map((l) =>
            l.id === linha.id ? { ...l, ativo: proximoAtivo } : l,
          ),
        };
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao alterar flag ativo.");
    }
  }, []);

  const carregarDemonstracao = useCallback(async () => {
    try {
      setCarregando(true);
      await pcpDb.carregarDemonstracao();
      limparCache();
      setAviso("Dados de demonstração carregados com sucesso!");
      await carregarPlano();
    } catch (e) {
      setErro("Falha ao carregar dados de demonstração.");
    } finally {
      setCarregando(false);
    }
  }, [carregarPlano]);

  const irPara = useCallback((chave) => {
    if (aoNavegar) aoNavegar(chave);
  }, [aoNavegar]);

  const value = {
    plano,
    linhas,
    carregando,
    erro,
    setErro,
    aviso,
    setAviso,
    lotesEditados,
    salvando,
    conflitos,
    subRelatorio,
    setSubRelatorio,
    editarLote,
    desfazer,
    salvarLotes,
    limparLotes,
    salvarProduto,
    excluirLinhas,
    alternarAtivo,
    carregarPlano,
    carregarDemonstracao,
    irPara,
  };

  return <PcpContext.Provider value={value}>{children}</PcpContext.Provider>;
}

export function usePcp() {
  const context = useContext(PcpContext);
  if (!context) {
    throw new Error("usePcp deve ser usado dentro de um PcpProvider");
  }
  return context;
}
