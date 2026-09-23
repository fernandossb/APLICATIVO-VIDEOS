create extension if not exists pgcrypto;

create table if not exists public.fichas (
  id uuid primary key default gen_random_uuid(),
  referencia text not null default '',
  dados jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists fichas_referencia_idx on public.fichas (referencia);
create index if not exists fichas_dados_gin_idx on public.fichas using gin (dados);

alter table public.fichas enable row level security;

-- Ponto de partida: qualquer usuário autenticado pode ler e escrever tudo.
-- Trocar por políticas por setor quando os perfis de acesso (plano, item 05) forem implementados.
create policy "fichas_select_authenticated" on public.fichas
  for select using (auth.role() = 'authenticated');

create policy "fichas_insert_authenticated" on public.fichas
  for insert with check (auth.role() = 'authenticated');

create policy "fichas_update_authenticated" on public.fichas
  for update using (auth.role() = 'authenticated');

create policy "fichas_delete_authenticated" on public.fichas
  for delete using (auth.role() = 'authenticated');

create table if not exists public.operacoes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null default '',
  dados jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Um codigo de operacao so pode existir uma vez no catalogo (linhas com codigo vazio ficam de fora da checagem).
create unique index if not exists operacoes_codigo_unq on public.operacoes (codigo) where codigo <> '';
create index if not exists operacoes_dados_gin_idx on public.operacoes using gin (dados);

alter table public.operacoes enable row level security;

create policy "operacoes_select_authenticated" on public.operacoes
  for select using (auth.role() = 'authenticated');

create policy "operacoes_insert_authenticated" on public.operacoes
  for insert with check (auth.role() = 'authenticated');

create policy "operacoes_update_authenticated" on public.operacoes
  for update using (auth.role() = 'authenticated');

create policy "operacoes_delete_authenticated" on public.operacoes
  for delete using (auth.role() = 'authenticated');

create table if not exists public.inspecoes (
  id uuid primary key default gen_random_uuid(),
  dados jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists inspecoes_dados_gin_idx on public.inspecoes using gin (dados);

alter table public.inspecoes enable row level security;

-- Ponto de partida: qualquer usuario autenticado le e escreve.
-- Quando o login por perfil (plano, item 05) entrar, restringir escrita a Inspetora/Qualidade
-- e leitura de dashboard a Gestor/PCP/Qualidade.
create policy "inspecoes_select_authenticated" on public.inspecoes
  for select using (auth.role() = 'authenticated');

create policy "inspecoes_insert_authenticated" on public.inspecoes
  for insert with check (auth.role() = 'authenticated');

create policy "inspecoes_update_authenticated" on public.inspecoes
  for update using (auth.role() = 'authenticated');

create policy "inspecoes_delete_authenticated" on public.inspecoes
  for delete using (auth.role() = 'authenticated');
