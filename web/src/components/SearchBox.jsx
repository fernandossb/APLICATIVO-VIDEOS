export default function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="search-box">
      <span aria-hidden="true">🔍</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}
