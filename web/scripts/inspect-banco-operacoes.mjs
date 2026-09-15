import * as XLSX from "xlsx";
import fs from "node:fs";

const path = "G:/Métodos e Processos/BDF/BANCO DE OPERAÇÕES.xlsx";
const buffer = fs.readFileSync(path);
const wb = XLSX.read(buffer, { type: "buffer" });
console.log("SHEETS:", wb.SheetNames.join(" | "));

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  console.log(`\n=== ${name} (${rows.length} linhas totais, mostrando ate 50 nao vazias) ===`);
  let printed = 0;
  for (let i = 0; i < rows.length && printed < 50; i++) {
    const row = rows[i];
    const hasContent = row.some((c) => String(c).trim() !== "");
    if (!hasContent) continue;
    printed++;
    console.log(i + 1, JSON.stringify(row));
  }
}
