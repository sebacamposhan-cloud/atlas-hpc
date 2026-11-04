-- Atlas · Jerarquía de obra en Last Planner: perfil de cada persona (cargo, nivel, área, jefe directo, pisos, activo),
-- tareas o metas que bajan por la cadena de mando, enlazadas por su tarea de origen (padre), y su avance.
-- Ejecutar en Supabase → SQL Editor → New query → pegar todo → Run, DESPUÉS de campo.sql y lastplanner-cycle.sql
-- (y de lastplanner-4.sql o lastplanner-daily.sql si se usaron). Es aditiva y se puede volver a ejecutar sin perder datos.
-- Si más adelante se vuelve a ejecutar lastplanner-cycle.sql, ejecutar este archivo otra vez después: reinstala el tope
-- de permisos por nivel en atlas_lp_can.
-- Sin filas en atlas_personas todo sigue como hoy: quien no tiene perfil no ve tareas y conserva sus permisos.
-- No usa la clave service_role: las lecturas pasan por RLS y las escrituras por guardar_meta_atlas.
begin;

-- Personas: una fila por cuenta de Atlas. La carga la administración (ver atlas_jer_cargar más abajo).
create table if not exists public.atlas_personas(
 user_id uuid primary key references auth.users(id) on delete cascade,
 nombre text not null default '' check(length(nombre)<=160),
 cargo text not null default '' check(length(cargo)<=120),
 nivel smallint check(nivel between 0 and 4),
 area text not null default 'linea' check(area in ('linea','planificacion','calidad')),
 jefe uuid references public.atlas_personas(user_id),
 pisos text[] not null default '{}',
 empresa text check(empresa is null or length(empresa)<=160),
 activo boolean not null default true,
 updated_at timestamptz not null default now(),
 constraint atlas_personas_nivel_area check((area='linea')=(nivel is not null)),
 constraint atlas_personas_jefe_propio check(jefe is distinct from user_id));
create index if not exists atlas_personas_jefe on public.atlas_personas(jefe);

-- Tareas (metas). Las columnas sueltas sirven para RLS e índices; el registro completo va en data, como en Last Planner.
create table if not exists public.atlas_metas(
 id uuid primary key,
 version integer not null check(version>0),
 padre uuid references public.atlas_metas(id),
 asignada_a uuid not null references public.atlas_personas(user_id),
 asignada_por uuid not null references public.atlas_personas(user_id),
 estado text not null check(estado in ('asignada','en_curso','hecha','confirmada','devuelta','anulada')),
 piso text,
 actividad text,
 data jsonb not null,
 updated_at timestamptz not null default now(),
 updated_by uuid not null);
create index if not exists atlas_metas_asignada_a on public.atlas_metas(asignada_a);
create index if not exists atlas_metas_asignada_por on public.atlas_metas(asignada_por);
create index if not exists atlas_metas_padre on public.atlas_metas(padre);
-- Historial inalterable: valor anterior y nuevo de cada cambio, con la cuenta que lo hizo.
create table if not exists public.atlas_metas_historial(
 id bigint generated always as identity primary key, operacion uuid not null, meta uuid not null, version integer not null, accion text not null,
 actor uuid not null, email text, asignada_a uuid not null, asignada_por uuid not null, at timestamptz not null default now(), antes jsonb, data jsonb not null);
create index if not exists atlas_metas_historial_meta on public.atlas_metas_historial(meta,version);
-- Recibos de operación: un reintento sin señal no duplica el cambio.
create table if not exists public.atlas_metas_operaciones(id uuid primary key, actor uuid not null, huella text not null, resultado jsonb not null, at timestamptz not null default now());

alter table public.atlas_personas enable row level security;
alter table public.atlas_metas enable row level security;
alter table public.atlas_metas_historial enable row level security;
alter table public.atlas_metas_operaciones enable row level security;
revoke all on public.atlas_personas,public.atlas_metas,public.atlas_metas_historial,public.atlas_metas_operaciones from anon,authenticated;
grant select on public.atlas_personas,public.atlas_metas,public.atlas_metas_historial,public.atlas_metas_operaciones to authenticated;

-- ── Decisiones de esta versión (las mismas constantes que dist/jerarquia-model.mjs) ──
-- Cada nivel asigna solo a sus reportes directos. Para permitir saltar niveles, cambiar false por true y ejecutar de nuevo.
create or replace function public.atlas_jer_salta_niveles() returns boolean language sql immutable set search_path='' as $$ select false $$;
-- Tope de permisos de Last Planner por nivel o área. Se cruza con los permisos de la cuenta (nunca da más).
create or replace function public.atlas_jer_permisos(p_nivel integer,p_area text) returns text[] language sql immutable set search_path='' as $$
 select case
  when p_area='planificacion' then array['draft','publish','execution','attendance','restriction','evidence','verify','close','revision']
  when p_area='calidad' then array['verify','evidence','restriction']
  when p_nivel in (1,2,3) then array['draft','publish','execution','attendance','restriction','evidence','verify','close','revision']
  when p_nivel=4 then array['execution','attendance','restriction','evidence']
  else array[]::text[] end
$$;

-- ── Cadena de mando ──
-- Quienes dependen de alguien, en cualquier nivel más abajo. «union» corta un ciclo aunque se cargara por error.
create or replace function public.atlas_jer_equipo(p_jefe uuid) returns setof uuid language sql stable security definer set search_path='' as $$
 with recursive abajo(id) as (
  select user_id from public.atlas_personas where jefe=p_jefe and user_id<>p_jefe
  union select p.user_id from public.atlas_personas p join abajo on p.jefe=abajo.id where p.user_id<>p_jefe)
 select id from abajo
$$;
-- Jefes hacia arriba de una persona.
create or replace function public.atlas_jer_superiores(p_persona uuid) returns setof uuid language sql stable security definer set search_path='' as $$
 with recursive arriba(id) as (
  select jefe from public.atlas_personas where user_id=p_persona and jefe is not null
  union select p.jefe from public.atlas_personas p join arriba on p.user_id=arriba.id where p.jefe is not null and p.jefe<>p_persona)
 select id from arriba
$$;
create or replace function public.atlas_jer_activo() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.atlas_personas where user_id=auth.uid() and activo)
$$;
-- Gerencia (nivel 0), Planificación y Calidad ven todo.
create or replace function public.atlas_jer_ve_todo() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.atlas_personas where user_id=auth.uid() and activo and (area<>'linea' or nivel=0))
$$;
-- Perfiles visibles: el propio, los de su equipo y los de sus jefes (para saber quién le asignó). O todos, si ve todo.
create or replace function public.atlas_jer_ve_persona(p_persona uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.atlas_jer_activo() and (public.atlas_jer_ve_todo() or p_persona=auth.uid()
  or p_persona in (select public.atlas_jer_equipo(auth.uid())) or p_persona in (select public.atlas_jer_superiores(auth.uid())))
$$;
-- Tareas visibles: las propias, las que asignó, las de quienes dependen de la persona. O todas, si ve todo.
create or replace function public.atlas_jer_ve_meta(p_a uuid,p_por uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.atlas_jer_activo() and (public.atlas_jer_ve_todo() or auth.uid() in (p_a,p_por)
  or exists(select 1 from public.atlas_jer_equipo(auth.uid()) e(id) where e.id in (p_a,p_por)))
$$;
-- Quien asignó la tarea, o cualquiera más arriba en su cadena, la confirma, devuelve, edita o anula.
create or replace function public.atlas_jer_gestiona(p_por uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_por=auth.uid() or p_por in (select public.atlas_jer_equipo(auth.uid()))
$$;
-- Asignar: niveles 1 a 3 de la cadena, solo a sus reportes directos activos (o a su equipo si se permite saltar niveles).
create or replace function public.atlas_jer_puede_asignar(p_destino uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.atlas_personas yo, public.atlas_personas d
  where yo.user_id=auth.uid() and yo.activo and yo.area='linea' and yo.nivel in (1,2,3)
  and d.user_id=p_destino and d.activo and d.area='linea' and d.user_id<>yo.user_id
  and (d.jefe=yo.user_id or (public.atlas_jer_salta_niveles() and d.user_id in (select public.atlas_jer_equipo(yo.user_id)))))
$$;
-- Tope por nivel: sin perfil activo no cambia nada.
create or replace function public.atlas_jer_tope(p_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select p_permission=any(public.atlas_jer_permisos(p.nivel,p.area)) from public.atlas_personas p where p.user_id=auth.uid() and p.activo),true)
$$;

-- Se reutiliza atlas_lp_can de lastplanner-cycle.sql, igual que antes, más el tope de su nivel. Así lo respetan
-- guardar_lote_atlas_lp, la subida de evidencias y guardar_meta_atlas.
create or replace function public.atlas_lp_can(p_permission text) returns boolean language sql stable set search_path='' as $$
 select auth.uid() is not null and auth.jwt()->'app_metadata'->>'campo_role'='editor'
 and (auth.jwt()->'app_metadata'->'lastplanner_permissions' is null
      or auth.jwt()->'app_metadata'->'lastplanner_permissions'='null'::jsonb
      or (jsonb_typeof(auth.jwt()->'app_metadata'->'lastplanner_permissions')='array' and (auth.jwt()->'app_metadata'->'lastplanner_permissions') ? p_permission))
 and public.atlas_jer_tope(p_permission)
$$;
revoke all on function public.atlas_lp_can(text) from public,anon;
grant execute on function public.atlas_lp_can(text) to authenticated;

-- La cadena no puede cerrarse en ciclo y el jefe directo de terreno está en un nivel más alto.
create or replace function public.atlas_jer_validar_persona() returns trigger language plpgsql set search_path='' as $$
declare j public.atlas_personas%rowtype;
begin
 if new.jefe is not null then
  select * into j from public.atlas_personas where user_id=new.jefe;
  if exists(select 1 from public.atlas_jer_superiores(new.jefe) s(id) where s.id=new.user_id) then raise exception 'La cadena de mando no puede formar un ciclo';end if;
  if new.area='linea' and (j.area<>'linea' or j.nivel>=new.nivel) then raise exception 'El jefe directo debe estar en la cadena de terreno y en un nivel más alto';end if;
 end if;
 new.pisos:=coalesce((select array_agg(distinct btrim(x) order by btrim(x)) from unnest(new.pisos) x where btrim(x)<>''),'{}');
 new.updated_at:=now();
 return new;
end $$;
drop trigger if exists atlas_personas_validar on public.atlas_personas;
create trigger atlas_personas_validar before insert or update on public.atlas_personas for each row execute function public.atlas_jer_validar_persona();

-- ── Guardar una tarea ──
-- p_accion: asignar, editar, avanzar (marcar avance), hecha, confirmar, devolver, reasignar o anular.
-- p_meta es el registro completo y p_expected la versión que tenía el equipo (control de versión, error 40001).
create or replace function public.guardar_meta_atlas(p_id uuid,p_accion text,p_huella text,p_meta jsonb,p_expected integer)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 actor uuid:=auth.uid();correo text:=auth.jwt()->>'email';
 operation public.atlas_metas_operaciones%rowtype;oldrow public.atlas_metas%rowtype;padre_row public.atlas_metas%rowtype;destino public.atlas_personas%rowtype;
 d jsonb:=p_meta;old jsonb;lp jsonb;clave uuid;nueva integer;libres text[];result jsonb;
 abiertas text[]:=array['asignada','en_curso','devuelta'];
 uuid_re text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
 if actor is null or not public.atlas_jer_activo() or not coalesce(public.atlas_lp_can(case p_accion when 'avanzar' then 'execution' when 'hecha' then 'execution' when 'confirmar' then 'verify' when 'devolver' then 'verify' else 'draft' end),false) then raise exception 'Unauthorized';end if;
 if p_id is null or p_huella is null or p_huella !~ '^[a-f0-9]{64}$' or p_accion is null or p_accion not in ('asignar','editar','avanzar','hecha','confirmar','devolver','reasignar','anular')
  or jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>1000000 or coalesce(d->>'id','') !~* uuid_re or p_expected is null or p_expected<0 then raise exception 'Invalid operation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into operation from public.atlas_metas_operaciones where id=p_id;
 if found then
  if operation.actor is distinct from actor or operation.huella is distinct from p_huella then raise exception 'Operation identity conflict';end if;
  return operation.resultado;
 end if;
 clave:=(d->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('meta:'||clave::text,1));
 select * into oldrow from public.atlas_metas where id=clave for update;
 old:=oldrow.data;
 if coalesce(oldrow.version,0)<>p_expected then raise exception using errcode='40001',message='Version conflict';end if;
 -- Estructura y auditoría, como en Last Planner: versión siguiente e historial que solo crece, firmado por la sesión.
 if jsonb_typeof(d->'version') is distinct from 'number' or (d->>'version')::integer<>coalesce(oldrow.version,0)+1 then raise exception 'Invalid internal version';end if;
 if jsonb_typeof(d->'historial') is distinct from 'array' or jsonb_array_length(d->'historial')<>coalesce(jsonb_array_length(old->'historial'),0)+1
  or (old is not null and public.atlas_lp_prefix(d->'historial',jsonb_array_length(old->'historial')) is distinct from old->'historial')
  or d->'historial'->-1->>'actor' is distinct from actor::text or d->'historial'->-1->>'autor' is distinct from correo or d->>'actualizada' is distinct from d->'historial'->-1->>'at' then raise exception 'Operation requires authenticated audit';end if;
 if old is not null and (d->>'creada' is distinct from old->>'creada' or d->>'autor' is distinct from old->>'autor') then raise exception 'Immutable original author';end if;
 if coalesce(d->>'estado','') not in ('asignada','en_curso','hecha','confirmada','devuelta','anulada') or coalesce(d->>'asignadaA','') !~* uuid_re or coalesce(d->>'asignadaPor','') !~* uuid_re
  or length(btrim(coalesce(d->>'titulo','')))<3 or length(d->>'titulo')>200 or jsonb_typeof(d->'alcances') is distinct from 'array' or jsonb_array_length(d->'alcances')>600
  or jsonb_typeof(d->'marcas') is distinct from 'object' or jsonb_typeof(d->'avanceManual') is distinct from 'number' or (d->>'avanceManual')::numeric not between 0 and 1
  or (nullif(d->>'padre','') is not null and d->>'padre' !~* uuid_re) or d->>'padre'=d->>'id' then raise exception 'Invalid task';end if;
 if exists(select 1 from jsonb_each(d->'marcas') m where jsonb_typeof(m.value->'avance') is distinct from 'number' or (m.value->>'avance')::numeric not between 0 and 1
  or not exists(select 1 from jsonb_array_elements(d->'alcances') s where s->>'id'=m.key)) then raise exception 'Marks outside the assigned front';end if;
 if d->>'estado' in ('devuelta','anulada') and length(btrim(coalesce(d->>'motivo','')))=0 then raise exception 'Reason required';end if;

 if p_accion='asignar' then
  if old is not null then raise exception 'Task already exists';end if;
  if d->>'estado'<>'asignada' or (d->>'asignadaPor')::uuid<>actor or d->'marcas'<>'{}'::jsonb or (d->>'avanceManual')::numeric<>0 then raise exception 'A new task starts assigned by the session';end if;
  if not public.atlas_jer_puede_asignar((d->>'asignadaA')::uuid) then raise exception 'Unauthorized: assignment outside the chain of command';end if;
  if nullif(d->>'padre','') is not null then
   select * into padre_row from public.atlas_metas where id=(d->>'padre')::uuid;
   if not found or padre_row.asignada_a<>actor or not (padre_row.estado=any(abiertas)) or (padre_row.piso is not null and padre_row.piso is distinct from d->>'piso') then raise exception 'The parent task must be open and assigned to the session';end if;
  end if;
 else
  if old is null then raise exception 'Task not found';end if;
  libres:=case p_accion when 'editar' then array['titulo','detalle','fechaLimite','alcances','marcas'] when 'avanzar' then array['marcas','avanceManual','estado']
   when 'hecha' then array['estado','nota'] when 'confirmar' then array['estado','nota'] when 'devolver' then array['estado','motivo']
   when 'reasignar' then array['asignadaA','asignadaPor','estado','motivo'] else array['estado','motivo'] end||array['version','actualizada','historial'];
  if (d-libres) is distinct from (old-libres) then raise exception 'Action cannot change unrelated task fields';end if;
  if p_accion='editar' then
   if not public.atlas_jer_gestiona(oldrow.asignada_por) or not (oldrow.estado=any(abiertas)) or not ((d->'marcas') <@ (old->'marcas')) then raise exception 'Unauthorized edit';end if;
  elsif p_accion in ('avanzar','hecha') then
   if oldrow.asignada_a<>actor or not (oldrow.estado=any(abiertas)) or d->>'estado' is distinct from (case p_accion when 'avanzar' then 'en_curso' else 'hecha' end) then raise exception 'Only the assignee marks an open task';end if;
   if exists(select 1 from jsonb_each(d->'marcas') m where m.value is distinct from old->'marcas'->m.key and (m.value->>'actor' is distinct from actor::text or m.value->>'at' is distinct from d->>'actualizada')) then raise exception 'Marks require authenticated audit';end if;
  elsif p_accion in ('confirmar','devolver') then
   if not public.atlas_jer_gestiona(oldrow.asignada_por) or oldrow.estado<>'hecha' or d->>'estado' is distinct from (case p_accion when 'confirmar' then 'confirmada' else 'devuelta' end) then raise exception 'Unauthorized review';end if;
  elsif p_accion='reasignar' then
   if not (public.atlas_jer_gestiona(oldrow.asignada_por) or oldrow.asignada_a in (select public.atlas_jer_equipo(actor))) or not (oldrow.estado=any(abiertas)) or d->>'estado'<>'asignada'
    or (d->>'asignadaPor')::uuid<>actor or (d->>'asignadaA')::uuid=oldrow.asignada_a or not public.atlas_jer_puede_asignar((d->>'asignadaA')::uuid) then raise exception 'Unauthorized reassignment';end if;
  else
   if not public.atlas_jer_gestiona(oldrow.asignada_por) or oldrow.estado in ('confirmada','anulada') or d->>'estado'<>'anulada' then raise exception 'Unauthorized cancellation';end if;
  end if;
 end if;
 -- La persona que recibe trabaja en ese piso (un capataz con pisos en su perfil solo recibe tareas de esos pisos).
 if p_accion in ('asignar','reasignar') then
  select * into destino from public.atlas_personas where user_id=(d->>'asignadaA')::uuid;
  if cardinality(destino.pisos)>0 and (d->>'piso' is null or not (d->>'piso'=any(destino.pisos))) then raise exception 'The person does not work on that floor';end if;
 end if;
 -- El frente queda dentro de la actividad de Last Planner a la que se enlaza.
 if p_accion in ('asignar','editar') and nullif(d->>'actividadId','') is not null then
  select r.data into lp from public.atlas_lp_records r where r.tipo='actividades' and r.id=d->>'actividadId';
  if lp is null or lp->>'level' is distinct from d->>'piso' then raise exception 'Last Planner activity missing or on another floor';end if;
  if exists(select 1 from jsonb_array_elements(d->'alcances') s where not exists(select 1 from jsonb_array_elements(lp->'alcances') a where a->>'id'=coalesce(s->>'plannedScopeId',s->>'id'))) then raise exception 'Front outside the Last Planner activity';end if;
 end if;
 nueva:=coalesce(oldrow.version,0)+1;
 insert into public.atlas_metas(id,version,padre,asignada_a,asignada_por,estado,piso,actividad,data,updated_by)
  values(clave,nueva,nullif(d->>'padre','')::uuid,(d->>'asignadaA')::uuid,(d->>'asignadaPor')::uuid,d->>'estado',d->>'piso',nullif(d->>'actividadId',''),d,actor)
  on conflict(id) do update set version=excluded.version,asignada_a=excluded.asignada_a,asignada_por=excluded.asignada_por,estado=excluded.estado,data=excluded.data,updated_by=excluded.updated_by,updated_at=now();
 insert into public.atlas_metas_historial(operacion,meta,version,accion,actor,email,asignada_a,asignada_por,antes,data)
  values(p_id,clave,nueva,p_accion,actor,correo,(d->>'asignadaA')::uuid,(d->>'asignadaPor')::uuid,old,d);
 result:=jsonb_build_object('id',clave,'version',nueva,'estado',d->>'estado');
 insert into public.atlas_metas_operaciones(id,actor,huella,resultado) values(p_id,actor,p_huella,result);
 return result;
end;
$$;

-- Lecturas: cada persona ve lo suyo, lo de su equipo, o todo si su nivel o área lo permite.
drop policy if exists atlas_personas_leer on public.atlas_personas;
create policy atlas_personas_leer on public.atlas_personas for select to authenticated using(auth.jwt()->'app_metadata'->>'campo_role' in ('editor','lector') and public.atlas_jer_ve_persona(user_id));
drop policy if exists atlas_metas_leer on public.atlas_metas;
create policy atlas_metas_leer on public.atlas_metas for select to authenticated using(auth.jwt()->'app_metadata'->>'campo_role' in ('editor','lector') and public.atlas_jer_ve_meta(asignada_a,asignada_por));
drop policy if exists atlas_metas_historial_leer on public.atlas_metas_historial;
create policy atlas_metas_historial_leer on public.atlas_metas_historial for select to authenticated using(auth.jwt()->'app_metadata'->>'campo_role' in ('editor','lector') and public.atlas_jer_ve_meta(asignada_a,asignada_por));
drop policy if exists atlas_metas_operaciones_leer on public.atlas_metas_operaciones;
create policy atlas_metas_operaciones_leer on public.atlas_metas_operaciones for select to authenticated using(auth.uid()=actor);

-- ── Administración (solo desde el SQL Editor; las cuentas de Atlas no pueden ejecutarlas) ──
-- Cargar o actualizar una persona por correo. El jefe debe estar cargado antes (de arriba hacia abajo).
--   select public.atlas_jer_cargar('correo@empresa.cl','Nombre','Jefe de terreno',2,'linea','correo-del-jefe@empresa.cl',array['N01','N02']);
create or replace function public.atlas_jer_cargar(p_email text,p_nombre text,p_cargo text,p_nivel integer,p_area text,p_jefe_email text default null,p_pisos text[] default '{}',p_empresa text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid;j uuid;
begin
 select id into u from auth.users where lower(email)=lower(btrim(p_email));
 if u is null then raise exception 'No existe la cuenta %',p_email;end if;
 if nullif(btrim(coalesce(p_jefe_email,'')),'') is not null then
  select id into j from auth.users where lower(email)=lower(btrim(p_jefe_email));
  if j is null then raise exception 'No existe la cuenta del jefe %',p_jefe_email;end if;
 end if;
 insert into public.atlas_personas(user_id,nombre,cargo,nivel,area,jefe,pisos,empresa,activo)
  values(u,btrim(coalesce(p_nombre,'')),btrim(coalesce(p_cargo,'')),p_nivel,coalesce(p_area,'linea'),j,coalesce(p_pisos,'{}'),nullif(btrim(coalesce(p_empresa,'')),''),true)
  on conflict(user_id) do update set nombre=excluded.nombre,cargo=excluded.cargo,nivel=excluded.nivel,area=excluded.area,jefe=excluded.jefe,pisos=excluded.pisos,empresa=excluded.empresa,activo=true;
 return u;
end $$;
-- Quien deja la obra: queda inactivo (no se borra, sus tareas quedan para que su jefe las reasigne).
create or replace function public.atlas_jer_desactivar(p_email text) returns uuid language sql security definer set search_path='' as $$
 update public.atlas_personas set activo=false where user_id=(select id from auth.users where lower(email)=lower(btrim(p_email))) returning user_id
$$;

revoke all on function public.atlas_jer_salta_niveles(),public.atlas_jer_permisos(integer,text),public.atlas_jer_equipo(uuid),public.atlas_jer_superiores(uuid),
 public.atlas_jer_activo(),public.atlas_jer_ve_todo(),public.atlas_jer_gestiona(uuid),public.atlas_jer_puede_asignar(uuid),public.atlas_jer_validar_persona(),
 public.atlas_jer_cargar(text,text,text,integer,text,text,text[],text),public.atlas_jer_desactivar(text) from public,anon,authenticated;
revoke all on function public.atlas_jer_ve_persona(uuid),public.atlas_jer_ve_meta(uuid,uuid),public.atlas_jer_tope(text),public.guardar_meta_atlas(uuid,text,text,jsonb,integer) from public,anon;
-- Las políticas y atlas_lp_can se evalúan con la cuenta que consulta.
grant execute on function public.atlas_jer_ve_persona(uuid),public.atlas_jer_ve_meta(uuid,uuid),public.atlas_jer_tope(text),public.guardar_meta_atlas(uuid,text,text,jsonb,integer) to authenticated;
commit;

-- Ver la jerarquía cargada:
--   select u.email, p.nombre, p.cargo, p.nivel, p.area, (select email from auth.users where id=p.jefe) as jefe, p.pisos, p.activo
--   from public.atlas_personas p join auth.users u on u.id=p.user_id order by p.area, p.nivel nulls last, p.nombre;
