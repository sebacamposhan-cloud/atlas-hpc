create table if not exists public.atlas_price_items(code text primary key,data jsonb not null);
alter table public.atlas_price_items enable row level security;
revoke all on public.atlas_price_items from anon,authenticated;
grant select on public.atlas_price_items to authenticated;
drop policy if exists prices_read on public.atlas_price_items;
create policy prices_read on public.atlas_price_items for select to authenticated using(auth.jwt()->'app_metadata'->>'payments_role' in ('editor','approver'));
create or replace function public.import_atlas_prices(items jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
if coalesce(auth.jwt()->'app_metadata'->>'payments_role','')<>'approver' then raise exception 'Approver required';end if;
if jsonb_typeof(items) is distinct from 'array' then raise exception 'Invalid items';end if;
if jsonb_array_length(items)>100 then raise exception 'Batch too large';end if;
for item in select * from jsonb_array_elements(items) loop
if coalesce(item->>'code','') !~ '^\d+(\.\d+)*$' or length(coalesce(item->>'desc','')) not between 1 and 2000 or length(coalesce(item->>'unit','')) not between 1 and 500 or jsonb_typeof(item->'pu') is distinct from 'number' then raise exception 'Invalid item';end if;
if (item->>'pu')::numeric<0 then raise exception 'Invalid price';end if;
insert into public.atlas_price_items values(item->>'code',item) on conflict(code) do update set data=excluded.data;
end loop;
end;$$;
revoke all on function public.import_atlas_prices(jsonb) from public,anon;
grant execute on function public.import_atlas_prices(jsonb) to authenticated;
