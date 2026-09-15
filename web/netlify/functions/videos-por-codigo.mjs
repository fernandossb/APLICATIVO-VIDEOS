const TENANT_ID = process.env.GRAPH_TENANT_ID;
const CLIENT_ID = process.env.GRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const DRIVE_USER = process.env.GRAPH_DRIVE_USER;
const FOLDER_PATH = process.env.GRAPH_VIDEOS_FOLDER_PATH || "vídeos de produção";

const CACHE_MS = 60_000;
let cachedToken = null;
let cachedTokenExpiry = 0;
let cachedItems = null;
let cachedItemsAt = 0;

async function getAccessToken() {
  const agora = Date.now();
  if (cachedToken && agora < cachedTokenExpiry - 60_000) return cachedToken;

  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) throw new Error(`Falha ao autenticar no Microsoft Graph (${res.status}): ${await res.text()}`);

  const dados = await res.json();
  cachedToken = dados.access_token;
  cachedTokenExpiry = agora + dados.expires_in * 1000;
  return cachedToken;
}

async function listarArquivos(token) {
  const agora = Date.now();
  if (cachedItems && agora - cachedItemsAt < CACHE_MS) return cachedItems;

  const caminho = encodeURIComponent(FOLDER_PATH);
  let url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(DRIVE_USER)}` +
    `/drive/root:/${caminho}:/children?$select=name&$top=200`;

  const itens = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Falha ao listar a pasta de vídeos (${res.status}): ${await res.text()}`);
    const dados = await res.json();
    itens.push(...(dados.value || []));
    url = dados["@odata.nextLink"] || null;
  }

  cachedItems = itens;
  cachedItemsAt = agora;
  return itens;
}

async function obterLinkDownload(token, nomeArquivo) {
  const caminho = encodeURIComponent(`${FOLDER_PATH}/${nomeArquivo}`);
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(DRIVE_USER)}` +
    `/drive/root:/${caminho}?$select=@microsoft.graph.downloadUrl`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Falha ao gerar link do vídeo (${res.status}): ${await res.text()}`);
  const dados = await res.json();
  return dados["@microsoft.graph.downloadUrl"];
}

function codigoDoArquivo(nome) {
  const m = String(nome || "").match(/^\s*(\d{2,})\b/);
  return m ? m[1] : null;
}

export default async (req) => {
  const url = new URL(req.url);
  const codigo = (url.searchParams.get("codigo") || "").trim();

  if (!codigo) {
    return Response.json({ error: "Informe o código da operação." }, { status: 400 });
  }
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !DRIVE_USER) {
    return Response.json(
      { error: "Integração com o OneDrive ainda não configurada (faltam variáveis GRAPH_*)." },
      { status: 501 }
    );
  }

  try {
    const token = await getAccessToken();
    const arquivos = await listarArquivos(token);
    const encontrados = arquivos.filter((item) => codigoDoArquivo(item.name) === codigo);

    const videos = await Promise.all(
      encontrados.map(async (item, i) => ({
        nome: `Vídeo ${i + 1}`,
        arquivo: item.name,
        url: await obterLinkDownload(token, item.name),
      }))
    );

    return Response.json({ codigo, videos });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/videos-por-codigo" };
