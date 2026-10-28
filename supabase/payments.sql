-- Run once in Supabase SQL Editor. No service-role key is used by Atlas.
create table if not exists public.atlas_payments(id uuid primary key, version integer not null, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.atlas_payment_audit(id bigint generated always as identity primary key, payment_id uuid not null, actor uuid not null, at timestamptz not null default now(), data jsonb not null);
alter table public.atlas_payments enable row level security;
alter table public.atlas_payment_audit enable row level security;
revoke all on public.atlas_payments,public.atlas_payment_audit from anon,authenticated;
grant select on public.atlas_payments,public.atlas_payment_audit to authenticated;
drop policy if exists payment_read on public.atlas_payments;
create policy payment_read on public.atlas_payments for select to authenticated using (auth.jwt()->'app_metadata'->>'payments_role' in ('editor','approver'));
drop policy if exists payment_audit_read on public.atlas_payment_audit;
create policy payment_audit_read on public.atlas_payment_audit for select to authenticated using (auth.jwt()->'app_metadata'->>'payments_role' in ('editor','approver'));
create or replace function public.save_atlas_payment(payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 role text := auth.jwt()->'app_metadata'->>'payments_role';
 pid uuid := coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 previous jsonb; item jsonb; total numeric := 0; retention numeric; result jsonb;
begin
 if auth.uid() is null or role is null or role not in ('editor','approver') then raise exception 'Unauthorized'; end if;
 if length(trim(coalesce(payload->>'contractor',''))) not between 1 and 500 or coalesce(payload->>'period','') !~ '^\d{4}-(0[1-9]|1[0-2])$' or jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'Invalid fields'; end if;
 if jsonb_array_length(payload->'items') not between 1 and 100 or coalesce(payload->>'status','') not in ('Borrador','En revisión','Aprobado','Rechazado') then raise exception 'Invalid items or state'; end if;
 for item in select * from jsonb_array_elements(payload->'items') loop
  if length(trim(coalesce(item->>'description',''))) not between 1 and 500 or coalesce(item->>'amount','') !~ '^\d+$' then raise exception 'Invalid item'; end if;
  total := total+(item->>'amount')::numeric;
 end loop;
 if coalesce(payload->>'retention','') !~ '^\d+$' then raise exception 'Invalid retention'; end if;
 retention := (payload->>'retention')::numeric;
 if total>9007199254740991 or retention>total then raise exception 'Invalid total'; end if;
 select data into previous from public.atlas_payments where id=pid for update;
 if payload->>'id' is not null and previous is null then raise exception 'Unknown payment'; end if;
 if previous is not null and (payload->>'version')::integer is distinct from (previous->>'version')::integer then raise exception using errcode='40001',message='Version conflict'; end if;
 if (payload->>'status'='Aprobado' or previous->>'status'='Aprobado') and role<>'approver' then raise exception 'Approver required'; end if;
 result := jsonb_build_object('id',pid,'version',coalesce((previous->>'version')::integer,0)+1,'contractor',trim(payload->>'contractor'),'period',payload->>'period','items',payload->'items','amount',total,'retention',retention,'net',total-retention,'status',payload->>'status','by',auth.jwt()->>'email','at',now());
 insert into public.atlas_payments values(pid,(result->>'version')::integer,result,now()) on conflict(id) do update set version=excluded.version,data=excluded.data,updated_at=excluded.updated_at;
 insert into public.atlas_payment_audit(payment_id,actor,data) values(pid,auth.uid(),result);
 return result;
end;
$$;
revoke all on function public.save_atlas_payment(jsonb) from public,anon;
grant execute on function public.save_atlas_payment(jsonb) to authenticated;
