drop policy if exists "public_select_avaliacoes" on public.avaliacoes;
drop policy if exists "public select avaliacoes" on public.avaliacoes;
drop policy if exists "public_insert_avaliacoes" on public.avaliacoes;
drop policy if exists "public insert avaliacoes" on public.avaliacoes;
drop policy if exists "own avaliacoes" on public.avaliacoes;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'avaliacoes'
  loop
    execute format('drop policy %I on public.avaliacoes', r.policyname);
  end loop;
end $$;

revoke all on public.avaliacoes from anon;
revoke all on public.avaliacoes from public;
grant select, insert, update, delete on public.avaliacoes to authenticated;

create policy "own avaliacoes"
  on public.avaliacoes
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
