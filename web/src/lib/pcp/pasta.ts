/**
 * Acesso a pasta de relatorios pelo navegador.
 *
 * Usa a File System Access API do Chrome/Edge: o usuario escolhe a pasta uma
 * vez, a permissao fica guardada e nas proximas visitas o site abre direto.
 * Nada e enviado para a nuvem aqui — a leitura e a filtragem acontecem na
 * maquina do usuario, e so o resultado filtrado sobe para o banco.
 *
 * As funcoes puras (`escolherMaisRecente`, `classificarPasta`) ficam separadas
 * das que tocam o navegador, para poderem ser testadas no Node.
 */

import { dataDoNome, type TipoRelatorio } from "./relatorios.ts";

export interface ArquivoEncontrado {
  nome: string;
  caminho: string;
  data: string | null;
  handle: FileSystemFileHandle;
}

export interface GrupoRelatorio {
  pasta: string;
  caminho: string;
  tipo: TipoRelatorio | null;
  /** Rotulo que separa arquivos do mesmo tipo, como o nome da colecao. */
  variacao: string;
  maisRecente: ArquivoEncontrado | null;
  arquivos: ArquivoEncontrado[];
}

const BANCO_LOCAL = "pcp-pasta";
const LOJA = "handles";
const CHAVE = "relatorios";

// ---------------------------------------------------------------------------
// Parte pura
// ---------------------------------------------------------------------------

/**
 * Escolhe o arquivo mais novo de uma pasta.
 * Prefere a data no nome; sem data reconhecivel, cai para ordem alfabetica.
 */
export function escolherMaisRecente<T extends { nome: string; data: string | null }>(arquivos: T[]): T | null {
  if (arquivos.length === 0) return null;
  const comData = arquivos.filter((a) => a.data !== null);
  const base = comData.length > 0 ? comData : arquivos;
  return [...base].sort((a, b) => {
    if (a.data && b.data) return b.data.localeCompare(a.data);
    return b.nome.localeCompare(a.nome, "pt-BR");
  })[0];
}

/**
 * Descobre o tipo de relatorio pelo nome da pasta. E um palpite: o tipo real e
 * confirmado pelas colunas do arquivo, em `identificarRelatorio`.
 */
export function classificarPasta(nomePasta: string): TipoRelatorio | null {
  const nome = nomePasta
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.CSV$/i, "")
    .toUpperCase();

  /*
   * O numero do relatorio vem primeiro porque e o unico pedaco do nome que o
   * SISPLAN garante: "ESTOQUE-2020" e "ESTOQUE MATERIA PRIMA-2120" comecam
   * igual, e so o codigo separa os dois. Vale tanto para pasta quanto para
   * arquivo solto — os relatorios podem ficar dos dois jeitos.
   */
  if (nome.includes("2252")) return "CONSUMO";
  if (nome.includes("2120")) return "ESTOQUE_MATERIAL";
  if (nome.includes("2020") || nome.includes("2024")) return "ESTOQUE_PRODUTO";
  if (nome.includes("3011")) return "ORDENS_PENDENTES";
  if (nome.includes("2710")) {
    // O 2710 tem duas faces: o cabecalho dos pedidos e os itens de cada um.
    return nome.includes("PRODUTO") ? "PRODUTOS_PEDIDO" : "PEDIDOS";
  }
  if (nome.includes("721")) return "MOVIMENTO";

  // Sem o numero, cai no nome. Ordem importa pelos mesmos motivos de cima.
  if (nome.includes("CONSUMO")) return "CONSUMO";
  if (nome.includes("MATERIA PRIMA") || nome.includes("MATERIA-PRIMA")) return "ESTOQUE_MATERIAL";
  if (nome.includes("ESTOQUE PRODUTO")) return "ESTOQUE_PRODUTO";
  if (nome.includes("PENDENTES")) return "ORDENS_PENDENTES";
  if (nome.includes("PRODUTOS") && nome.includes("PEDIDO")) return "PRODUTOS_PEDIDO";
  if (nome.includes("PEDIDOS")) return "PEDIDOS";
  /*
   * "RELATORIO" sozinho NAO vale mais como 721. A pasta raiz costuma se chamar
   * "RELATORIOS", e essa regra fazia todo arquivo solto nela ser rotulado 721
   * — inclusive o 2120 e o 2710. Hoje o 721 e reconhecido pelo numero, por
   * "VENDA" ou por "COLECOES", que sao especificos dele.
   */
  if (nome.includes("VENDA") || nome.includes("COLECOES") || nome.includes("COLECAO")) return "MOVIMENTO";
  return null;
}

// ---------------------------------------------------------------------------
// Parte que depende do navegador
// ---------------------------------------------------------------------------

export function navegadorSuporta(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function escolherPasta(): Promise<FileSystemDirectoryHandle | null> {
  if (!navegadorSuporta()) {
    throw new Error(
      "Este navegador nao consegue abrir pastas. Use o Google Chrome ou o Microsoft Edge, ou envie os arquivos manualmente.",
    );
  }
  try {
    const handle = await (
      window as unknown as {
        showDirectoryPicker(opcoes?: { mode?: string; id?: string }): Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker({ mode: "read", id: "pcp-relatorios" });
    await guardarPasta(handle);
    return handle;
  } catch (erro) {
    // O usuario fechar a janela de escolha nao e um erro para mostrar na tela.
    if (erro instanceof DOMException && erro.name === "AbortError") return null;
    throw erro;
  }
}

function abrirBancoLocal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO_LOCAL, 1);
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(LOJA)) pedido.result.createObjectStore(LOJA);
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

export async function guardarPasta(handle: FileSystemDirectoryHandle): Promise<void> {
  const banco = await abrirBancoLocal();
  await new Promise<void>((resolve, reject) => {
    const transacao = banco.transaction(LOJA, "readwrite");
    transacao.objectStore(LOJA).put(handle, CHAVE);
    transacao.oncomplete = () => resolve();
    transacao.onerror = () => reject(transacao.error);
  });
  banco.close();
}

/**
 * A pasta guardada, INDEPENDENTE de a permissao ainda valer.
 *
 * O navegador esquece a permissao a cada recarga da pagina: `queryPermission`
 * volta "prompt", e so um clique do usuario pode reconceder. Quem precisa
 * pedir de volta precisa do handle mesmo sem permissao — `recuperarPasta`
 * devolve `null` nesse caso e nao serviria.
 */
export async function recuperarPastaGuardada(): Promise<FileSystemDirectoryHandle | null> {
  if (!navegadorSuporta()) return null;
  const banco = await abrirBancoLocal();
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const pedido = banco.transaction(LOJA, "readonly").objectStore(LOJA).get(CHAVE);
    pedido.onsuccess = () => resolve((pedido.result as FileSystemDirectoryHandle) ?? null);
    pedido.onerror = () => reject(pedido.error);
  });
  banco.close();
  return handle;
}

/** Recupera a pasta escolhida em uma visita anterior, se a permissao continuar valida. */
export async function recuperarPasta(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await recuperarPastaGuardada();
  if (!handle) return null;

  const comPermissao = handle as unknown as {
    queryPermission(opcoes: { mode: string }): Promise<PermissionState>;
  };
  const estado = await comPermissao.queryPermission({ mode: "read" });
  return estado === "granted" ? handle : null;
}

/** Pede de novo a permissao da pasta guardada. Precisa partir de um clique. */
export async function reautorizarPasta(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const comPermissao = handle as unknown as {
    requestPermission(opcoes: { mode: string }): Promise<PermissionState>;
  };
  return (await comPermissao.requestPermission({ mode: "read" })) === "granted";
}

export async function esquecerPasta(): Promise<void> {
  const banco = await abrirBancoLocal();
  await new Promise<void>((resolve, reject) => {
    const transacao = banco.transaction(LOJA, "readwrite");
    transacao.objectStore(LOJA).delete(CHAVE);
    transacao.oncomplete = () => resolve();
    transacao.onerror = () => reject(transacao.error);
  });
  banco.close();
}

/**
 * Percorre a pasta escolhida e monta a lista de relatorios disponiveis.
 * Cada subpasta com CSV vira um grupo, e o arquivo mais recente e destacado.
 */
export async function varrerPasta(raiz: FileSystemDirectoryHandle): Promise<GrupoRelatorio[]> {
  const grupos: GrupoRelatorio[] = [];

  async function percorrer(pasta: FileSystemDirectoryHandle, caminho: string, profundidade: number): Promise<void> {
    if (profundidade > 4) return;
    const arquivos: ArquivoEncontrado[] = [];
    const subpastas: Array<{ handle: FileSystemDirectoryHandle; nome: string }> = [];

    for await (const [nome, entrada] of pasta as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (entrada.kind === "directory") {
        subpastas.push({ handle: entrada as FileSystemDirectoryHandle, nome });
      } else if (nome.toLowerCase().endsWith(".csv")) {
        arquivos.push({
          nome,
          caminho: caminho ? `${caminho}/${nome}` : nome,
          data: dataDoNome(nome),
          handle: entrada as FileSystemFileHandle,
        });
      }
    }

    if (arquivos.length > 0) {
      const partes = caminho.split("/").filter(Boolean);
      const pastaPrincipal = partes[0] ?? pasta.name;
      const tipoDaPasta = classificarPasta(pastaPrincipal) ?? classificarPasta(pasta.name);

      /*
       * Agrupa por tipo do ARQUIVO, nao da pasta. Antes tudo que estava na
       * mesma pasta virava um grupo so, com o tipo tirado do nome dela — e os
       * relatorios agora ficam soltos na raiz (`PEDIDOS-2710.csv`,
       * `PENDENTES-3011.csv`...), onde o nome da pasta nao diz nada. O
       * resultado era um grupo unico, rotulado errado, mostrando um arquivo so.
       *
       * O tipo da pasta continua valendo como reserva, para o 721, cujos
       * arquivos se chamam pela data de lancamento e nao pelo relatorio.
       */
      const porTipo = new Map<string, ArquivoEncontrado[]>();
      for (const arquivo of arquivos) {
        const tipo = classificarPasta(arquivo.nome) ?? tipoDaPasta;
        const chave = tipo ?? "";
        const lista = porTipo.get(chave);
        if (lista) lista.push(arquivo);
        else porTipo.set(chave, [arquivo]);
      }

      for (const [chave, doTipo] of porTipo) {
        const tipo = (chave || null) as TipoRelatorio | null;
        /*
         * O 721 vira um grupo por ARQUIVO: cada um e de uma colecao, extraido
         * a partir do lancamento dela, e todos precisam ser importados. Nos
         * outros relatorios os arquivos sao versoes do mesmo dado, e so a mais
         * recente interessa.
         */
        const separarPorArquivo = tipo === "MOVIMENTO" && doTipo.length > 1;
        const blocos = separarPorArquivo ? doTipo.map((a) => [a]) : [doTipo];

        for (const bloco of blocos) {
          const ordenados = [...bloco].sort((a, b) => (b.data ?? b.nome).localeCompare(a.data ?? a.nome));
          const escolhido = escolherMaisRecente(ordenados);
          const base = caminho || pasta.name;
          grupos.push({
            pasta: pasta.name,
            /*
             * O `caminho` e a IDENTIDADE do grupo na tela de Importar — e por
             * ele que cada cartao acha a propria leitura. Como uma pasta agora
             * rende varios grupos (um por tipo de relatorio), usar so o nome
             * dela dava a mesma identidade para todos: ler um relatorio fazia
             * os outros cartoes mostrarem aquela leitura. O arquivo escolhido
             * desempata, e ele e sempre diferente entre os grupos.
             */
            caminho: escolhido ? `${base}/${escolhido.nome}` : base,
            tipo,
            // Subpasta dentro do relatorio vira a variacao, como o nome da colecao.
            variacao: partes.length > 1 ? partes.slice(1).join(" / ") : "",
            maisRecente: escolhido,
            arquivos: ordenados,
          });
        }
      }
    }

    for (const sub of subpastas) {
      await percorrer(sub.handle, caminho ? `${caminho}/${sub.nome}` : sub.nome, profundidade + 1);
    }
  }

  await percorrer(raiz, "", 0);
  return grupos;
}

export async function lerBytes(arquivo: ArquivoEncontrado): Promise<Uint8Array> {
  const file = await arquivo.handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}
