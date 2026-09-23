-- Configurações simples do site (chave/valor), editáveis direto pela tela —
-- por exemplo o link da pasta de vídeos no OneDrive, sem precisar mexer no
-- .env nem publicar de novo pra trocar o link.
create table if not exists public.configuracoes (
  chave text primary key,
  valor text,
  atualizado_em timestamptz default now()
);

alter table public.configuracoes enable row level security;

drop policy if exists "configuracoes_select_authenticated" on public.configuracoes;
drop policy if exists "configuracoes_insert_authenticated" on public.configuracoes;
drop policy if exists "configuracoes_update_authenticated" on public.configuracoes;

create policy "configuracoes_select_authenticated" on public.configuracoes
  for select using (auth.role() = 'authenticated');

create policy "configuracoes_insert_authenticated" on public.configuracoes
  for insert with check (auth.role() = 'authenticated');

create policy "configuracoes_update_authenticated" on public.configuracoes
  for update using (auth.role() = 'authenticated');
