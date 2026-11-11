-- Atlas · Avance de las planillas de la oficina técnica guardado en la nube (un registro por piso, tipo 'planilla').
-- Ejecutar en Supabase → SQL Editor → New query → pegar todo → Run, después de supabase/campo.sql y supabase/contornos.sql.
-- Se puede volver a ejecutar sin perder datos: solo amplía los tipos aceptados y la validación de guardar_atlas_campo.
-- No crea tablas. Cada carga queda además en atlas_campo_historial, con quién la subió y cuándo.
begin;
alter table public.atlas_campo drop constraint if exists atlas_campo_tipo_check;
alter table public.atlas_campo add constraint atlas_campo_tipo_check check (tipo in ('proyecto','observacion','contorno','planilla'));

create or replace function public.guardar_atlas_campo(p_tipo text, p_id text, p_version integer, p_data jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 previa integer; nueva integer; momento timestamptz := now(); correo text := auth.jwt()->>'email';
begin
 if auth.uid() is null or public.atlas_campo_rol() is distinct from 'editor' then raise exception 'Unauthorized'; end if;
 if p_tipo is null or p_tipo not in ('proyecto','observacion','contorno','planilla') or p_id is null or p_id !~ '^[A-Za-z0-9_-]{1,100}$' or p_version is null or p_version < 0 then raise exception 'Invalid fields'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 2000000 then raise exception 'Invalid data'; end if;
 if p_tipo = 'proyecto' and (jsonb_typeof(p_data->'doc') is distinct from 'object' or p_data->'doc'->>'id' is distinct from p_id) then raise exception 'Invalid project'; end if;
 if p_tipo = 'observacion' and (jsonb_typeof(p_data->'obs') is distinct from 'object' or p_data->'obs'->>'id' is distinct from p_id or jsonb_typeof(p_data->'historial') is distinct from 'array') then raise exception 'Invalid observation'; end if;
 -- Contorno: piso y código del recinto; la corrección (partes del contorno) o la marca «eliminado» para volver al original.
 if p_tipo = 'contorno' and (coalesce(p_data->>'nivel','') !~ '^(N-1|N0[1-3])$' or coalesce(p_data->>'code','') = '' or octet_length(p_data::text) > 300000
   or not ((jsonb_typeof(p_data->'recinto') = 'object' and p_data->'recinto'->>'code' = p_data->>'code' and jsonb_typeof(p_data->'recinto'->'parts') = 'array') or p_data->>'eliminado' = 'true')) then raise exception 'Invalid contour'; end if;
 -- Planilla de avance: una por piso (id «avance-<piso>»), con sus recintos, sus hojas, la fecha de carga y quién la cargó.
 if p_tipo = 'planilla' and (coalesce(p_data->>'nivel','') !~ '^(N-1|N0[1-3])$' or p_id is distinct from 'avance-' || (p_data->>'nivel')
   or jsonb_typeof(p_data->'recintos') is distinct from 'object' or jsonb_typeof(p_data->'hojas') is distinct from 'array'
   or coalesce(p_data->>'cargada','') = '' or coalesce(p_data->>'por','') = '') then raise exception 'Invalid progress sheet'; end if;
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
commit;
