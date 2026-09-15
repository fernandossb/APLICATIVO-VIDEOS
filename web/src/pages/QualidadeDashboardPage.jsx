import { useEffect, useMemo, useState } from "react";
import { inspecoesStore } from "../lib/storage";
import { causasDefeito, filtrosDashboardVazios, statusInspecao } from "../data/constants";
import {
  agregarPor,
  evolucaoDiaria,
  filtrarInspecoes,
  formatNumero,
  formatPercentual,
  rankingFornecedores,
  resumoGeral,
} from "../lib/qualidadeMetrics";
import StatCard from "../components/charts/StatCard";
import BarList from "../components/charts/BarList";
import DonutChart from "../components/charts/DonutChart";
import TrendChart from "../components/charts/TrendChart";
import ComparisonChart from "../components/charts/ComparisonChart";

function unicos(lista, campo) {
  return Array.from(new Set(lista.map((i) => i[campo]).filter(Boolean)));
}

export default function QualidadeDashboardPage({ active }) {
  const [todas, setTodas] = useState([]);
  const [filtros, setFiltros] = useState(filtrosDashboardVazios);

  useEffect(() => {
    if (active) inspecoesStore.list().then(setTodas);
  }, [active]);

  const setFiltro = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });

  const inspecoes = useMemo(() => filtrarInspecoes(todas, filtros), [todas, filtros]);
  const resumo = useMemo(() => resumoGeral(inspecoes), [inspecoes]);
  const porFornecedor = useMemo(() => agregarPor(inspecoes, "fornecedor").slice(0, 8), [inspecoes]);
  const porCausa = useMemo(() => agregarPor(inspecoes, "causaPrincipal").slice(0, 8), [inspecoes]);
  const porProduto = useMemo(() => agregarPor(inspecoes, "produto").slice(0, 8), [inspecoes]);
  const porInspetora = useMemo(() => agregarPor(inspecoes, "inspetora").slice(0, 8), [inspecoes]);
  const evolucao = useMemo(() => evolucaoDiaria(inspecoes), [inspecoes]);
  const ranking = useMemo(() => rankingFornecedores(inspecoes), [inspecoes]);

  const fornecedores = unicos(todas, "fornecedor");
  const inspetoras = unicos(todas, "inspetora");

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="sheet-header-inline">
          <p className="overline">Indicadores e rankings</p>
          <h1>Dashboard de qualidade</h1>
        </div>
        <span className="status-pill">{inspecoes.length} inspeções</span>
      </header>

      <section className="content-panel">
        <div className="filter-panel">
          <div className="filter-title">
            <span aria-hidden="true">🔍</span>
            <strong>Filtros do dashboard</strong>
          </div>
          <div className="filter-grid">
            <label className="field compact-field">
              <span>Data inicial</span>
              <input type="date" value={filtros.dataInicial} onChange={setFiltro("dataInicial")} />
            </label>
            <label className="field compact-field">
              <span>Data final</span>
              <input type="date" value={filtros.dataFinal} onChange={setFiltro("dataFinal")} />
            </label>
            <label className="field compact-field">
              <span>Fornecedor</span>
              <select value={filtros.fornecedor} onChange={setFiltro("fornecedor")}>
                <option value="">Todos</option>
                {fornecedores.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact-field">
              <span>Inspetora</span>
              <select value={filtros.inspetora} onChange={setFiltro("inspetora")}>
                <option value="">Todas</option>
                {inspetoras.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact-field">
              <span>Produto</span>
              <input value={filtros.produto} onChange={setFiltro("produto")} />
            </label>
            <label className="field compact-field">
              <span>Causa</span>
              <select value={filtros.causa} onChange={setFiltro("causa")}>
                <option value="">Todas</option>
                {causasDefeito.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact-field">
              <span>Status</span>
              <select value={filtros.status} onChange={setFiltro("status")}>
                <option value="">Todos</option>
                {statusInspecao.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="text-button" onClick={() => setFiltros(filtrosDashboardVazios)}>
            Limpar filtros
          </button>
        </div>

        {todas.length === 0 ? (
          <p className="muted">Nenhuma inspeção registrada ainda — os indicadores aparecem aqui assim que a primeira for salva em Inspeções.</p>
        ) : (
          <>
            <section className="stats-grid dashboard-stats">
              <StatCard icon="📋" label="Peças inspecionadas" value={formatNumero(resumo.totalInspecionado)} tone="info" />
              <StatCard icon="✅" label="Peças aprovadas" value={formatNumero(resumo.totalAprovado)} tone="success" />
              <StatCard icon="🔁" label="Peças reprocessadas" value={formatNumero(resumo.totalReprocesso)} tone="danger" />
              <StatCard icon="📉" label="% geral de reprocesso" value={formatPercentual(resumo.percentualGeralReprocesso)} tone="danger" />
              <StatCard icon="🏭" label="Fornecedor com maior índice" value={resumo.fornecedorMaiorIndice} tone="warning" />
              <StatCard icon="⚠️" label="Principal causa" value={resumo.principalCausa} tone="warning" />
              <StatCard icon="🏅" label="Inspetora destaque" value={resumo.inspetoraDestaque} tone="info" />
            </section>

            <section className="chart-grid">
              <article className="chart-panel">
                <h2>Reprocesso por fornecedor</h2>
                <BarList data={porFornecedor} valueLabel={(d) => `${formatNumero(d.value)} peças · ${formatPercentual(d.taxa)}`} />
              </article>
              <article className="chart-panel">
                <h2>Causas de reprocesso</h2>
                <DonutChart data={porCausa} />
              </article>
              <article className="chart-panel">
                <h2>Evolução do reprocesso por dia</h2>
                <TrendChart data={evolucao} />
              </article>
              <article className="chart-panel">
                <h2>Comparativo inspecionada, aprovada e reprocessada</h2>
                <ComparisonChart summary={resumo} />
              </article>
              <article className="chart-panel">
                <h2>Reprocesso por produto</h2>
                <BarList data={porProduto} valueLabel={(d) => `${formatNumero(d.value)} peças`} />
              </article>
              <article className="chart-panel">
                <h2>Reprocesso por inspetora</h2>
                <BarList data={porInspetora} valueLabel={(d) => `${formatNumero(d.value)} peças`} />
              </article>
            </section>

            <section className="ranking-panel">
              <div className="section-title">
                <h2>Fornecedores que precisam de ajuda</h2>
                <p>Ranking ponderado por volume reprocessado, percentual, frequência e repetição da causa.</p>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Posição</th>
                      <th>Fornecedor</th>
                      <th>Total inspecionado</th>
                      <th>Total reprocessado</th>
                      <th>% reprocesso</th>
                      <th>Principal causa</th>
                      <th>Sugestão de ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r) => (
                      <tr key={r.fornecedor}>
                        <td>
                          <strong>#{r.posicao}</strong>
                        </td>
                        <td>{r.fornecedor}</td>
                        <td>{formatNumero(r.totalInspecionado)}</td>
                        <td>{formatNumero(r.totalReprocessado)}</td>
                        <td>{formatPercentual(r.percentualReprocesso)}</td>
                        <td>{r.principalCausa}</td>
                        <td>{r.sugestao}</td>
                      </tr>
                    ))}
                    {!ranking.length && (
                      <tr>
                        <td colSpan={7}>
                          <div className="empty-state">Sem dados suficientes para gerar o ranking.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ranking-panel compact-ranking">
              <div className="section-title">
                <h2>Ranking das principais causas</h2>
                <p>Causas que mais geraram peças para reprocesso no período filtrado.</p>
              </div>
              <div className="ranking-list">
                {porCausa.map((c, i) => (
                  <div className="ranking-row" key={c.label}>
                    <span>#{i + 1}</span>
                    <strong>{c.label}</strong>
                    <small>
                      {formatNumero(c.value)} peças · {c.count} ocorrências
                    </small>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
