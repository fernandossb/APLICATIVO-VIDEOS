-- Expõe o tamanho total do banco (em bytes) para o indicador de capacidade
-- no site. "security definer" é necessário porque medir o tamanho do banco
-- exige um privilégio que o usuário comum não tem — a função só devolve um
-- número, nunca dados de nenhuma tabela.
create or replace function public.tamanho_banco_bytes()
returns bigint
language sql
security definer
set search_path = public
as $$
  select pg_database_size(current_database());
$$;

grant execute on function public.tamanho_banco_bytes() to authenticated;
