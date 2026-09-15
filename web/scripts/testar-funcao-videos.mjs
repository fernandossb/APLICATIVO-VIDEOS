import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Carrega o .env manualmente (sem depender do runtime do Netlify)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
for (const linha of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const handler = (await import("../netlify/functions/videos-por-codigo.mjs")).default;

const codigo = process.argv[2] || "10004";
const req = new Request(`http://local/api/videos-por-codigo?codigo=${encodeURIComponent(codigo)}`);
const res = await handler(req);
const dados = await res.json();
console.log("STATUS:", res.status);
console.log(JSON.stringify(dados, null, 2));
