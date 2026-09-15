import * as XLSX from "xlsx";
import fs from "node:fs";

const path =
  "G:/Ficha Técnica/10 - INVERNO 2027/3 - Masculino/LIBERADOS PRODUÇÃO/CMMA01E1.xlsx";

// XLSX.readFile() mishandles accented Windows paths; read the buffer ourselves instead.
const buffer = fs.readFileSync(path);
const wb = XLSX.read(buffer, { type: "buffer" });
console.log("SHEETS:", wb.SheetNames.join(" | "));

const printSheet = (name, maxRows) => {
  const ws = wb.Sheets[name];
  if (!ws) {
    console.log(`\n=== ${name}: NOT FOUND ===`);
    return;
  }
  console.log(`\n=== ${name} (first ${maxRows} non-empty rows) ===`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  let printed = 0;
  for (let i = 0; i < rows.length && printed < maxRows; i++) {
    const row = rows[i];
    const hasContent = row.some((c) => String(c).trim() !== "");
    if (!hasContent) continue;
    printed++;
    console.log(i + 1, JSON.stringify(row));
  }
};

for (const name of wb.SheetNames) {
  const isRoteiro = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .includes("ROTEIRO");
  printSheet(name, isRoteiro ? 60 : 40);
}
