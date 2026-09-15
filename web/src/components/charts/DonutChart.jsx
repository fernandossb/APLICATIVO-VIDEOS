import { formatNumero } from "../../lib/qualidadeMetrics";

const CORES = ["#dc2626", "#2563eb", "#16a34a", "#d97706", "#0891b2", "#64748b", "#b45309", "#0f766e"];
const RAIO = 42;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

export default function DonutChart({ data }) {
  const total = data.reduce((soma, d) => soma + d.value, 0);
  if (!total) return <div className="empty-state">Sem causas registradas.</div>;

  let acumulado = 0;
  const segmentos = data.map((d, i) => {
    const fracao = d.value / total;
    const comprimento = fracao * CIRCUNFERENCIA;
    const offset = acumulado;
    acumulado += comprimento;
    return { ...d, comprimento, offset, cor: CORES[i % CORES.length] };
  });

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 100 100" className="donut-svg">
        <circle cx="50" cy="50" r={RAIO} fill="none" stroke="#eef1f6" strokeWidth="14" />
        {segmentos.map((s) => (
          <circle
            key={s.label}
            cx="50"
            cy="50"
            r={RAIO}
            fill="none"
            stroke={s.cor}
            strokeWidth="14"
            strokeDasharray={`${s.comprimento} ${CIRCUNFERENCIA - s.comprimento}`}
            strokeDashoffset={-s.offset}
            transform="rotate(-90 50 50)"
          />
        ))}
      </svg>
      <ul className="donut-legend">
        {segmentos.map((s) => (
          <li key={s.label}>
            <span className="donut-dot" style={{ background: s.cor }} />
            <span className="donut-legend-label">{s.label}</span>
            <span className="donut-legend-value">{formatNumero(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
