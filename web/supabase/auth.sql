-- Aperta de volta as políticas que tinham sido abertas (using (true)) como
-- solução temporária antes de existir tela de login. Agora que o login
-- existe, só usuário autenticado pode ler/escrever.
alter policy "fichas_select_authenticated" on public.fichas using (auth.role() = 'authenticated');
alter policy "fichas_insert_authenticated" on public.fichas with check (auth.role() = 'authenticated');
alter policy "fichas_update_authenticated" on public.fichas using (auth.role() = 'authenticated');

alter policy "operacoes_select_authenticated" on public.operacoes using (auth.role() = 'authenticated');
alter policy "operacoes_insert_authenticated" on public.operacoes with check (auth.role() = 'authenticated');
alter policy "operacoes_update_authenticated" on public.operacoes using (auth.role() = 'authenticated');
alter policy "operacoes_delete_authenticated" on public.operacoes using (auth.role() = 'authenticated');

alter policy "inspecoes_select_authenticated" on public.inspecoes using (auth.role() = 'authenticated');
alter policy "inspecoes_insert_authenticated" on public.inspecoes with check (auth.role() = 'authenticated');
alter policy "inspecoes_update_authenticated" on public.inspecoes using (auth.role() = 'authenticated');
alter policy "inspecoes_delete_authenticated" on public.inspecoes using (auth.role() = 'authenticated');

-- Os arquivos continuam com leitura pública (o bucket é público e as
-- imagens precisam aparecer em <img> sem mandar login), mas só quem
-- estiver logado pode enviar ou apagar.
drop policy if exists "imagens_insert_public" on storage.objects;
drop policy if exists "imagens_delete_public" on storage.objects;

create policy "imagens_insert_authenticated" on storage.objects
  for insert with check (bucket_id = 'imagens' and auth.role() = 'authenticated');

create policy "imagens_delete_authenticated" on storage.objects
  for delete using (bucket_id = 'imagens' and auth.role() = 'authenticated');
