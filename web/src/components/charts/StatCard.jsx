export default function StatCard({ icon, label, value, tone = "info" }) {
  return (
    <article className={`stat-card ${tone}`}>
      {icon && (
        <div className="stat-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}
