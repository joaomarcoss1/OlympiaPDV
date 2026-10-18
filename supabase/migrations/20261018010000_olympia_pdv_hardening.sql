-- Reforço de permissões do Olympia PDV.

-- Visitantes sem login não acessam nada.
revoke all on public.pdv_records, public.pdv_members, public.pdv_counters from anon;
revoke execute on function public.pdv_is_member() from public, anon;
grant execute on function public.pdv_is_member() to authenticated;

-- Contas logadas: só o necessário. Exclusão é lógica (deleted = true), nunca DELETE/TRUNCATE.
revoke all on public.pdv_records, public.pdv_members, public.pdv_counters from authenticated;
grant select, insert, update on public.pdv_records to authenticated;
grant select on public.pdv_members to authenticated;
-- pdv_counters e escrita em pdv_members: somente pelas funções (security definer).
