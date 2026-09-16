-- Bucket público para as imagens das fichas e inspeções (desenho técnico,
-- imagens de modelagem, foto da peça, imagem de variante). As imagens já
-- chegam aqui comprimidas pelo navegador antes do envio.
insert into storage.buckets (id, name, public)
values ('imagens', 'imagens', true)
on conflict (id) do nothing;

-- Ponto de partida: sem login ainda, então libera geral (mesmo critério já
-- usado nas tabelas fichas/operacoes/inspecoes). Trocar por políticas por
-- setor quando o login por perfil entrar.
create policy "imagens_select_public" on storage.objects
  for select using (bucket_id = 'imagens');

create policy "imagens_insert_public" on storage.objects
  for insert with check (bucket_id = 'imagens');

create policy "imagens_delete_public" on storage.objects
  for delete using (bucket_id = 'imagens');
