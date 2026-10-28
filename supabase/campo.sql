-- Atlas · Proyectos y observaciones en terreno (con fotos) compartidos en la nube.
-- Ejecutar en Supabase → SQL Editor → New query → pegar todo → Run. Se puede volver a ejecutar sin perder datos.
-- Usa las cuentas personales de Supabase Auth de Atlas; el acceso se da con app_metadata.campo_role = 'editor' o 'lector'.
-- No usa la clave service_role: las lecturas pasan por RLS y las escrituras por guardar_atlas_campo, con control de versión.

create table if not exists public.atlas_campo(
 tipo text not null check (tipo in ('proyecto','observacion')),
 id text not null check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
 version integer not null check (version > 0),
 data jsonb not null,
 updated_at timestamptz not null default now(),
 updated_by text,
 primary key (tipo,id));
create index if not exists atlas_campo_updated_at on public.atlas_campo(updated_at);
create table if not exists public.atlas_campo_historial(
 id bigint generated always as identity primary key,
 tipo text not null, registro text not null, version integer not null,
 actor uuid not null, email text, at timestamptz not null default now(), data jsonb not null);
create index if not exists atlas_campo_historial_registro on public.atlas_campo_historial(tipo,registro);
alter table public.atlas_campo enable row level security;
alter table public.atlas_campo_historial enable row level security;
revoke all on public.atlas_campo,public.atlas_campo_historial from anon,authenticated;
grant select on public.atlas_campo,public.atlas_campo_historial to authenticated;

-- Rol de la sesión para proyectos y observaciones: 'editor', 'lector' o null (sin acceso).
create or replace function public.atlas_campo_rol() returns text language sql stable set search_path = '' as $$
 select case when auth.jwt()->'app_metadata'->>'campo_role' in ('editor','lector') then auth.jwt()->'app_metadata'->>'campo_role' end
$$;
revoke all on function public.atlas_campo_rol() from public,anon;
grant execute on function public.atlas_campo_rol() to authenticated;

drop policy if exists campo_leer on public.atlas_campo;
create policy campo_leer on public.atlas_campo for select to authenticated using ((select public.atlas_campo_rol()) is not null);
drop policy if exists campo_historial_leer on public.atlas_campo_historial;
create policy campo_historial_leer on public.atlas_campo_historial for select to authenticated using ((select public.atlas_campo_rol()) is not null);

-- Guarda un proyecto o una observación si nadie lo cambió desde la versión que tiene el equipo (si no, error 40001).
create or replace function public.guardar_atlas_campo(p_tipo text, p_id text, p_version integer, p_data jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 previa integer; nueva integer; momento timestamptz := now(); correo text := auth.jwt()->>'email';
begin
 if auth.uid() is null or public.atlas_campo_rol() is distinct from 'editor' then raise exception 'Unauthorized'; end if;
 if p_tipo is null or p_tipo not in ('proyecto','observacion') or p_id is null or p_id !~ '^[A-Za-z0-9_-]{1,100}$' or p_version is null or p_version < 0 then raise exception 'Invalid fields'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 2000000 then raise exception 'Invalid data'; end if;
 if p_tipo = 'proyecto' and (jsonb_typeof(p_data->'doc') is distinct from 'object' or p_data->'doc'->>'id' is distinct from p_id) then raise exception 'Invalid project'; end if;
 if p_tipo = 'observacion' and (jsonb_typeof(p_data->'obs') is distinct from 'object' or p_data->'obs'->>'id' is distinct from p_id or jsonb_typeof(p_data->'historial') is distinct from 'array') then raise exception 'Invalid observation'; end if;
 select c.version into previa from public.atlas_campo c where c.tipo = p_tipo and c.id = p_id for update;
 if coalesce(previa,0) <> p_version then raise exception using errcode = '40001', message = 'Version conflict'; end if;
 nueva := coalesce(previa,0) + 1;
 if previa is null then
  begin
   insert into public.atlas_campo(tipo,id,version,data,updated_at,updated_by) values(p_tipo,p_id,nueva,p_data,momento,correo);
  exception when unique_violation then raise exception using errcode = '40001', message = 'Version conflict';
  end;
 else
  update public.atlas_campo set version = nueva, data = p_data, updated_at = momento, updated_by = correo where tipo = p_tipo and id = p_id;
 end if;
 insert into public.atlas_campo_historial(tipo,registro,version,actor,email,data) values(p_tipo,p_id,nueva,auth.uid(),correo,p_data);
 return jsonb_build_object('tipo',p_tipo,'id',p_id,'version',nueva,'updated_at',momento,'updated_by',correo);
end;
$$;
revoke all on function public.guardar_atlas_campo(text,text,integer,jsonb) from public,anon;
grant execute on function public.guardar_atlas_campo(text,text,integer,jsonb) to authenticated;

-- Fotos: bucket privado, solo JPEG de hasta 5 MB. Se pueden subir y ver, pero no reemplazar ni borrar (registro de lo que se vio en terreno).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('atlas-campo','atlas-campo',false,5242880,array['image/jpeg']) on conflict (id) do nothing;
drop policy if exists atlas_campo_fotos_leer on storage.objects;
create policy atlas_campo_fotos_leer on storage.objects for select to authenticated using (bucket_id = 'atlas-campo' and (select public.atlas_campo_rol()) is not null);
drop policy if exists atlas_campo_fotos_subir on storage.objects;
create policy atlas_campo_fotos_subir on storage.objects for insert to authenticated with check (bucket_id = 'atlas-campo' and (select public.atlas_campo_rol()) = 'editor' and name ~ '^fotos/[0-9a-f-]{36}(\.mini)?\.jpg$');
