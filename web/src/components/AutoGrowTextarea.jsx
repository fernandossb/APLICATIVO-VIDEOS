function ajustarAltura(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

// Textarea que cresce sozinha conforme o texto, pra descrição nunca ficar cortada.
export default function AutoGrowTextarea({ value, onChange, className, ...props }) {
  return (
    <textarea
      {...props}
      ref={ajustarAltura}
      className={`autogrow-textarea${className ? ` ${className}` : ""}`}
      value={value}
      onChange={(e) => {
        onChange(e);
        ajustarAltura(e.target);
      }}
      rows={1}
    />
  );
}
