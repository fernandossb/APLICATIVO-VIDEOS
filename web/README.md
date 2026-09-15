# CosturaFlow — web

Formulário de ficha técnica direto no navegador, sem Excel. Primeira peça do CosturaFlow 2.0 (veja o plano de projeto para o resto do escopo).

## Rodar localmente

```powershell
npm install
npm run dev
```

Abre em `http://localhost:5173`.

Sem nenhuma configuração adicional, o app já funciona: as fichas ficam salvas no `localStorage` do navegador (modo local). Dá para criar, editar e testar todas as abas sem depender de nada externo.

## Ligar o banco de dados de verdade (Supabase)

Enquanto não configurado, o app roda em modo local (item acima). Para salvar de vez, em um banco compartilhado por todo mundo:

1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e um novo projeto.
2. No painel do projeto, abra **SQL Editor** e rode o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql).
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
4. Copie `.env.example` para `.env` e cole os dois valores:

   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=xxxxx
   ```

5. Reinicie `npm run dev`. O aviso de "modo local" some e os salvamentos passam a ir para o Supabase.

O `schema.sql` cria a tabela `fichas` com uma coluna `jsonb` guardando a ficha inteira — simples de manter agora, e ainda assim consultável (índice GIN já incluído). As políticas de acesso (RLS) hoje liberam qualquer usuário autenticado; ficam mais finas quando o login por perfil (plano, item 05) entrar.

## Vídeo por código, sem cadastrar link (caminho atual)

Ninguém cola link de vídeo. Rode o script sempre que subir vídeo novo na pasta do OneDrive:

```powershell
cd web
.\scripts\sincronizar-videos-onedrive.ps1
```

Na primeira vez ele instala o módulo oficial **Microsoft Graph PowerShell** e abre o navegador para você entrar com a
sua própria conta Microsoft — não precisa registrar aplicativo nem ser administrador do Microsoft 365, só precisa
conseguir abrir a pasta `vídeos de produção` normalmente. O script gera, para cada vídeo, um link "qualquer pessoa
com o link" (correto, sem pedir login depois) e salva tudo em `video-links.json`.

Depois, em **Banco de Operações**, clique em **"+ Importar vídeos (JSON)"** e escolha esse arquivo — ele liga cada
vídeo ao código certo de uma vez só, e avisa se algum código do arquivo ainda não existe no Banco de Operações. No
Roteiro da ficha, o botão ▶ mostra a lista (numerada "Vídeo 1", "Vídeo 2"...) para a pessoa escolher qual assistir.

### Caminho mais automático (opcional, se um dia tiver ajuda do TI)

Existe também `netlify/functions/videos-por-codigo.mjs`, pronta para buscar os vídeos **ao vivo** a cada clique — sem
nem precisar rodar o script acima. Ela só entra em ação sozinha se alguém com acesso de administrador do Microsoft
365 registrar um aplicativo no Azure/Entra e preencher `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` e `GRAPH_CLIENT_SECRET`
no `.env` (veja os comentários dentro do próprio arquivo `.env.example`). Enquanto essas variáveis não existirem, o
▶ usa automaticamente a lista importada pelo script acima — nada quebra, é só uma camada a mais para o futuro.

## O que já está aqui

- Capa, Variantes, Modelagem (tabela de medidas + desenhos), Insumos (por grupo, com coluna por variante de cor), Comentários (por departamento) e Roteiro de Produção (com estágios, grupo de tecido G1/G2/G3 e busca automática de vídeo por código).
- Banco de Operações com tempo por grupo de tecido (G1 100% / G2 95% / G3 90%, tempo = tempoG1 ÷ percentual) — fórmula e nomes conferidos direto na planilha real (`scripts/inspect-banco-operacoes.mjs`).
- Dashboard de Qualidade com filtros, indicadores, gráficos e ranking ponderado de fornecedores — modelo de dados e fórmulas conferidos no próprio código-fonte público do site de inspeção anterior.
- Campos e nomes das fichas vieram da leitura real de uma ficha em Excel (`scripts/inspect-ficha.mjs`, usa a biblioteca `xlsx` da própria SheetJS via CDN deles — a versão do npm público tem vulnerabilidade sem correção).

## O que ainda falta (fora do escopo deste primeiro corte)

- Login e permissão por perfil (fase 01/05).
- Migração das fichas que já existem em `G:\Ficha Técnica`.
