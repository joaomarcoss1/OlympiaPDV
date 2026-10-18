-- Olympia PDV — estrutura no Supabase.
-- Cole este arquivo inteiro no SQL Editor do projeto e clique em Run (uma única vez).

-- Contas (Supabase Auth) que podem acessar os dados da loja.
create table if not exists public.pdv_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Todos os registros do PDV (produtos, vendas, clientes, caixa…), um por linha.
create table if not exists public.pdv_records (
  collection text not null,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  client_id text,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists pdv_records_updated_at_idx on public.pdv_records (updated_at);

-- Contadores compartilhados entre os caixas (ex.: número do pedido).
create table if not exists public.pdv_counters (
  name text primary key,
  value bigint not null default 0
);

create or replace function public.pdv_is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.pdv_members where user_id = auth.uid())
$$;

alter table public.pdv_members enable row level security;
alter table public.pdv_records enable row level security;
alter table public.pdv_counters enable row level security;

drop policy if exists "membro ve a propria linha" on public.pdv_members;
create policy "membro ve a propria linha" on public.pdv_members
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "membros leem registros" on public.pdv_records;
create policy "membros leem registros" on public.pdv_records
  for select to authenticated using ((select public.pdv_is_member()));
drop policy if exists "membros inserem registros" on public.pdv_records;
create policy "membros inserem registros" on public.pdv_records
  for insert to authenticated with check ((select public.pdv_is_member()));
drop policy if exists "membros alteram registros" on public.pdv_records;
create policy "membros alteram registros" on public.pdv_records
  for update to authenticated using ((select public.pdv_is_member())) with check ((select public.pdv_is_member()));
-- pdv_counters: sem políticas; acesso só pelas funções abaixo.

-- A primeira conta que entrar vira dona da loja. Depois disso, só membros adicionam outras contas.
create or replace function public.pdv_claim()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  lock table public.pdv_members in exclusive mode;
  if not exists (select 1 from public.pdv_members) then
    insert into public.pdv_members (user_id) values (auth.uid());
  end if;
  return public.pdv_is_member();
end;
$$;

create or replace function public.pdv_add_member(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.pdv_is_member() then
    raise exception 'sem permissão';
  end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    return false;
  end if;
  insert into public.pdv_members (user_id) values (v_id) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.pdv_next(p_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  if not public.pdv_is_member() then
    raise exception 'sem permissão';
  end if;
  insert into public.pdv_counters (name, value) values (p_name, 1)
  on conflict (name) do update set value = public.pdv_counters.value + 1
  returning value into v;
  return v;
end;
$$;

create or replace function public.pdv_counter_at_least(p_name text, p_value bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.pdv_is_member() then
    raise exception 'sem permissão';
  end if;
  insert into public.pdv_counters (name, value) values (p_name, p_value)
  on conflict (name) do update set value = greatest(public.pdv_counters.value, excluded.value);
end;
$$;

-- Salva um produto somando as variações de estoque (p_deltas: {"<variantId>": +/-qtd})
-- ao saldo que está no servidor, para dois caixas vendendo ao mesmo tempo não se sobrescreverem.
create or replace function public.pdv_save_product(p_id text, p_data jsonb, p_deltas jsonb, p_client text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur jsonb;
  vars jsonb;
  merged jsonb;
begin
  if not public.pdv_is_member() then
    raise exception 'sem permissão';
  end if;
  select data into cur from public.pdv_records
    where collection = 'products' and id = p_id and not deleted
    for update;
  if cur is null then
    merged := p_data;
  else
    select coalesce(jsonb_agg(
      case
        when sv.v is not null then nv.v || jsonb_build_object(
          'stock', coalesce((sv.v ->> 'stock')::int, 0) + coalesce((p_deltas ->> (nv.v ->> 'id'))::int, 0))
        else nv.v
      end order by nv.ord), '[]'::jsonb)
    into vars
    from jsonb_array_elements(p_data -> 'variants') with ordinality as nv (v, ord)
    left join lateral (
      select x as v from jsonb_array_elements(cur -> 'variants') as x where x ->> 'id' = nv.v ->> 'id' limit 1
    ) sv on true;
    merged := jsonb_set(p_data, '{variants}', vars);
  end if;
  insert into public.pdv_records (collection, id, data, deleted, client_id, updated_at)
  values ('products', p_id, merged, false, p_client, now())
  on conflict (collection, id) do update
    set data = excluded.data, deleted = false, client_id = excluded.client_id, updated_at = now();
  return merged;
end;
$$;

revoke all on function public.pdv_claim() from public, anon;
revoke all on function public.pdv_add_member(text) from public, anon;
revoke all on function public.pdv_next(text) from public, anon;
revoke all on function public.pdv_counter_at_least(text, bigint) from public, anon;
revoke all on function public.pdv_save_product(text, jsonb, jsonb, text) from public, anon;
grant execute on function public.pdv_claim() to authenticated;
grant execute on function public.pdv_add_member(text) to authenticated;
grant execute on function public.pdv_next(text) to authenticated;
grant execute on function public.pdv_counter_at_least(text, bigint) to authenticated;
grant execute on function public.pdv_save_product(text, jsonb, jsonb, text) to authenticated;

-- Atualização em tempo real entre os caixas.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pdv_records'
  ) then
    alter publication supabase_realtime add table public.pdv_records;
  end if;
end;
$$;
