export default function BarList({ data, valueLabel }) {
  if (!data.length) return <div className="empty-state">Sem dados para exibir.</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bar-list">
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <div className="bar-label">
            <strong>{d.label}</strong>
            <span>{valueLabel(d)}</span>
          </div>
          <div className="bar-track" aria-hidden="true">
            <span style={{ width: `${Math.max((d.value / max) * 100, 5)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
