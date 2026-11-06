-- Fila de consultas de OP. Somente o solicitante lê sua resposta.
create table if not exists public.consultas_op (
  id uuid primary key default gen_random_uuid(),
  usuario uuid not null default auth.uid(),
  numero text not null check (numero ~ '^[0-9]{1,10}$'),
  estado text not null default 'pendente' check (estado in ('pendente','processando','concluido','erro')),
  resultado jsonb,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz
);
alter table public.consultas_op enable row level security;
create policy consultas_op_inserir on public.consultas_op for insert to authenticated
  with check (usuario = auth.uid() and estado = 'pendente' and resultado is null and iniciado_em is null and criado_em >= now() - interval '1 minute');
create policy consultas_op_ler on public.consultas_op for select to authenticated using (usuario = auth.uid());
grant select, insert on public.consultas_op to authenticated;

create or replace function public.conector_proxima_op() returns setof public.consultas_op
language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt()->>'email' is distinct from 'fernando.borsatti@costuraflow.local' then raise exception 'Acesso negado'; end if;
  delete from consultas_op where criado_em < now() - interval '1 day';
  return query update consultas_op set estado = 'processando', iniciado_em = now()
  where id = (select c.id from consultas_op c where c.criado_em > now() - interval '2 minutes'
    and (c.estado = 'pendente' or (c.estado = 'processando' and c.iniciado_em < now() - interval '30 seconds'))
    order by c.criado_em for update skip locked limit 1) returning *;
end $$;
create or replace function public.conector_responder_op(p_id uuid, p_resultado jsonb, p_erro boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt()->>'email' is distinct from 'fernando.borsatti@costuraflow.local' then raise exception 'Acesso negado'; end if;
  update consultas_op set estado = case when p_erro then 'erro' else 'concluido' end, resultado = p_resultado
  where id = p_id and estado = 'processando';
end $$;
revoke all on function public.conector_proxima_op() from public, anon;
revoke all on function public.conector_responder_op(uuid,jsonb,boolean) from public, anon;
grant execute on function public.conector_proxima_op() to authenticated;
grant execute on function public.conector_responder_op(uuid,jsonb,boolean) to authenticated;

