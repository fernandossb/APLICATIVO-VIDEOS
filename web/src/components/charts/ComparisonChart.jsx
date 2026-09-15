import { formatNumero } from "../../lib/qualidadeMetrics";

export default function ComparisonChart({ summary }) {
  const itens = [
    { label: "Inspecionada", value: summary.totalInspecionado, cor: "#2563eb" },
    { label: "Aprovada", value: summary.totalAprovado, cor: "#16a34a" },
    { label: "Reprocessada", value: summary.totalReprocesso, cor: "#dc2626" },
  ];
  const max = Math.max(...itens.map((i) => i.value), 1);

  return (
    <div className="bar-list">
      {itens.map((i) => (
        <div className="bar-row" key={i.label}>
          <div className="bar-label">
            <strong>{i.label}</strong>
            <span>{formatNumero(i.value)} peças</span>
          </div>
          <div className="bar-track" aria-hidden="true">
            <span style={{ width: `${Math.max((i.value / max) * 100, 5)}%`, background: i.cor }} />
          </div>
        </div>
      ))}
    </div>
  );
}
