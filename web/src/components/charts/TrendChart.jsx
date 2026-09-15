export default function TrendChart({ data }) {
  if (!data.length) return <div className="empty-state">Sem dados no período.</div>;

  const width = 480;
  const height = 180;
  const padding = 26;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    ...d,
    x: padding + i * stepX,
    y: height - padding - (d.value / max) * (height - padding * 2),
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${height - padding} L${points[0].x},${height - padding} Z`;

  return (
    <div className="trend-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-svg">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e2e8f0" />
        <path d={areaPath} fill="rgba(220,38,38,0.12)" stroke="none" />
        <path d={linePath} fill="none" stroke="#dc2626" strokeWidth="2" />
        {points.map((p) => (
          <circle key={p.data} cx={p.x} cy={p.y} r="3.2" fill="#dc2626" />
        ))}
      </svg>
      <div className="trend-axis">
        {points.map((p) => (
          <span key={p.data}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}
