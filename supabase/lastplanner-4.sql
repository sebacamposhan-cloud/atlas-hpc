-- Last Planner 4: actualización aditiva sobre lastplanner-cycle.sql ya instalado.
-- Conserva registros, políticas y permisos existentes.
begin;
create or replace function public.atlas_lp_plan(a jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg(k,coalesce(a->k,'null'::jsonb)) from unnest(array['actividad','level','sector','frente','responsable','especialidad','contratista','inicioPlan','finPlan','semana','cantidad','unidad','origenCantidad','medicion','planificacion','recintos','alcances','grupo','origen']) k where k<>'planificacion' or (a->'planificacion' is not null and a->'planificacion'<>'null'::jsonb)
$$;

create or replace function public.guardar_lote_atlas_lp(p_id uuid,p_accion text,p_huella text,p_ops jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 actor uuid:=auth.uid();correo text:=auth.jwt()->>'email';permiso text;
 operation public.atlas_lp_operaciones%rowtype;op jsonb;oldrow public.atlas_lp_records%rowtype;
 old jsonb;d jsonb;tipo text;clave text;expected integer;nueva integer;result jsonb:='[]'::jsonb;
 allowed_columns text[];entry jsonb;prior_entry jsonb;s jsonb;r jsonb;planned numeric;done numeric;total numeric;count_all integer;count_ids integer;target jsonb;
begin
 permiso:=case p_accion when 'migration' then 'revision' when 'meeting' then 'attendance' when 'reprogram' then 'draft' else p_accion end;
 if actor is null or not coalesce(public.atlas_lp_can(permiso),false) then raise exception 'Unauthorized';end if;
 if p_id is null or p_huella !~ '^[a-f0-9]{64}$' or p_accion not in ('draft','publish','execution','attendance','restriction','evidence','verify','close','revision','reprogram','migration','meeting')
 or jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) not between 1 and 500 then raise exception 'Invalid operation';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into operation from public.atlas_lp_operaciones where id=p_id;
 if found then
  if operation.actor is distinct from actor or operation.huella is distinct from p_huella then raise exception 'Operation identity conflict';end if;
  return operation.resultado;
 end if;
 select count(*),count(distinct (value->>'table',value->>'id')) into count_all,count_ids from jsonb_array_elements(p_ops);
 if count_all<>count_ids then raise exception 'Duplicate records';end if;
 -- Stable lock order and CAS make an entire weekly emission/reprogramming atomic across devices.
 for op in select value from jsonb_array_elements(p_ops) order by value->>'table',value->>'id' loop
  tipo:=op->>'table';clave:=op->>'id';d:=op->'data';expected:=(op->>'expectedRemote')::integer;
  if tipo not in ('actividades','restricciones','asistencias','semanas','evidencias','reuniones') or clave is null or length(clave) not between 1 and 512 or expected<0
  or jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>2000000 or d->>'id' is distinct from clave or (d->>'version')::integer<1 then raise exception 'Invalid record';end if;
  if not (tipo=any(case p_accion when 'draft' then array['actividades','restricciones']::text[] when 'publish' then array['actividades','semanas']::text[] when 'execution' then array['actividades']::text[] when 'attendance' then array['asistencias']::text[] when 'restriction' then array['actividades','restricciones']::text[] when 'evidence' then array['evidencias']::text[] when 'verify' then array['actividades']::text[] when 'close' then array['actividades','semanas']::text[] when 'revision' then array['actividades']::text[] when 'reprogram' then array['actividades','restricciones']::text[] when 'meeting' then array['reuniones']::text[] when 'migration' then array['actividades','reuniones','restricciones','asistencias','semanas','evidencias']::text[] else array[]::text[] end)) then raise exception 'Action does not permit this collection';end if;
  perform pg_advisory_xact_lock(hashtextextended(tipo||':'||clave,1));
  select * into oldrow from public.atlas_lp_records c where c.tipo=tipo and c.id=clave for update;
  old:=oldrow.data;
  if coalesce(oldrow.version,0)<>expected then raise exception using errcode='40001',message='Version conflict';end if;
  if old is not null and (d->>'version')::integer<>(old->>'version')::integer+1 then raise exception 'Invalid internal version';end if;
  if old is not null and public.atlas_lp_prefix(d->'historial',jsonb_array_length(coalesce(old->'historial','[]'::jsonb))) is distinct from coalesce(old->'historial','[]'::jsonb) then raise exception 'Immutable history';end if;
  if p_accion<>'migration' and (jsonb_array_length(d->'historial')<>coalesce(jsonb_array_length(old->'historial'),0)+1 or d->'historial'->-1->>'actor' is distinct from actor::text or d->'historial'->-1->>'autor' is distinct from correo or d->>'actualizada' is distinct from d->'historial'->-1->>'at') then raise exception 'Operation requires authenticated audit';end if;
  if old is not null and (d->>'creada' is distinct from old->>'creada' or d->>'autor' is distinct from old->>'autor') then raise exception 'Immutable original author';end if;
  if tipo='actividades' then
   if old is not null then
    allowed_columns:=case p_accion when 'draft' then array['actividad','level','sector','frente','responsable','especialidad','contratista','inicioPlan','finPlan','semana','cantidad','unidad','origenCantidad','medicion','planificacion','recintos','alcances','grupo','origen','observaciones','notas','rendimientoPlan','dotacion','restrictionIds','legacyIncomplete','archivada','version','actualizada','historial']::text[] when 'publish' then array['fase','compromisoOriginal','publicada','version','actualizada','historial']::text[] when 'execution' then array['estado','inicioReal','finReal','cantidadEjecutada','ejecuciones','version','actualizada','historial']::text[] when 'restriction' then array['restrictionIds','version','actualizada','historial']::text[] when 'verify' then array['ejecuciones','verificacion','estado','causa','causaNota','version','actualizada','historial']::text[] when 'close' then array['fase','version','actualizada','historial']::text[] when 'revision' then array['actividad','level','sector','frente','responsable','especialidad','contratista','inicioPlan','finPlan','semana','cantidad','unidad','origenCantidad','medicion','planificacion','recintos','alcances','grupo','origen','observaciones','notas','rendimientoPlan','dotacion','revisiones','legacyIncomplete','version','actualizada','historial']::text[] when 'reprogram' then array['saldoReprogramado','reprogramada','version','actualizada','historial']::text[] else array['version','actualizada','historial']::text[] end;
    if d-allowed_columns is distinct from old-allowed_columns then raise exception 'Action cannot change unrelated activity fields';end if;
   elsif p_accion<>'migration' and (d->>'fase' is distinct from 'borrador' or jsonb_array_length(d->'ejecuciones')<>0 or d->'verificacion'->>'resultado' is distinct from 'Pendiente de verificación' or d->'ejecucionHistorica' is not null or d->'legacyOriginal' is not null or coalesce((d->>'legacyIncomplete')::boolean,false)) then raise exception 'New draft cannot invent previous execution';end if;
   if (d->>'schema')::integer<>2 or jsonb_typeof(d->'alcances') is distinct from 'array' or jsonb_typeof(d->'ejecuciones') is distinct from 'array' then raise exception 'Invalid activity';end if;
   if not coalesce((d->>'legacyIncomplete')::boolean,false) then
    if d->>'cantidad' is null or (d->>'cantidad')::numeric<=0 or coalesce(d->>'unidad','')='' or to_char((d->>'inicioPlan')::date,'IYYY-"W"IW') is distinct from d->>'semana'
    or to_char((d->>'finPlan')::date,'IYYY-"W"IW') is distinct from d->>'semana' or (d->>'finPlan')::date<(d->>'inicioPlan')::date then raise exception 'Week must match planned dates';end if;
   elsif old is null and p_accion<>'migration' then raise exception 'Incomplete legacy record only permitted during migration';end if;
   if old is not null and old->>'fase'<>'borrador' then
    if d->'compromisoOriginal' is distinct from old->'compromisoOriginal' then raise exception 'Immutable published commitment';end if;
    if public.atlas_lp_plan(d) is distinct from public.atlas_lp_plan(old) and p_accion<>'revision' then raise exception 'Published plan requires authorized revision';end if;
    if old->>'fase'='cerrada' and p_accion<>'reprogram' then raise exception 'Immutable closed week';end if;
    if old->'verificacion'->>'resultado'<>'Pendiente de verificación' and p_accion not in ('close','reprogram') then raise exception 'Immutable final review';end if;
   end if;
   if old is null and d->>'fase'<>'borrador' and p_accion<>'migration' then raise exception 'Publish the draft first';end if;
   if p_accion in ('execution','verify','revision') and (old->>'fase' is distinct from 'publicada' or old->'verificacion'->>'resultado' is distinct from 'Pendiente de verificación') then raise exception 'Operation requires an open published activity';end if;
   if p_accion='draft' and old is not null and old->>'fase'<>'borrador' then raise exception 'Only drafts can be edited';end if;
   if p_accion='close' and d->>'fase' is distinct from 'cerrada' then raise exception 'Close must freeze the activity';end if;
   if old->>'fase'='borrador' and d->>'fase'='publicada' then
    if p_accion<>'publish' or (d->'compromisoOriginal')-array['publicada','autor','actor'] is distinct from public.atlas_lp_plan(old) or jsonb_array_length(d->'alcances')=0 or exists(select 1 from jsonb_array_elements(d->'alcances') lp_scope_item(value) where lp_scope_item.value->>'locationOnly'='true') then raise exception 'Publication must freeze the complete original draft';end if;
    if d->'compromisoOriginal'->>'actor' is distinct from actor::text or d->'compromisoOriginal'->>'autor' is distinct from correo then raise exception 'Publication requires authenticated author';end if;
   end if;
   if old is not null and d->'verificacion' is distinct from old->'verificacion' and p_accion<>'verify' then raise exception 'Unauthorized review';end if;
   if old is not null and p_accion<>'verify' and public.atlas_lp_prefix(d->'ejecuciones',jsonb_array_length(old->'ejecuciones')) is distinct from old->'ejecuciones' then raise exception 'Immutable execution entries';end if;
   if old is not null and p_accion='verify' then
    if jsonb_array_length(d->'ejecuciones')<>jsonb_array_length(old->'ejecuciones') then raise exception 'Review cannot add execution entries';end if;
    for entry in select value from jsonb_array_elements(d->'ejecuciones') loop
     select value into prior_entry from jsonb_array_elements(old->'ejecuciones') where value->>'id'=entry->>'id';
     if entry-'validacion' is distinct from prior_entry-'validacion' then raise exception 'Review cannot change measured quantities';end if;
     if entry->'validacion' is distinct from prior_entry->'validacion' and (entry->'validacion'->>'estado' is distinct from 'Validada' or not coalesce((entry->'validacion'->>'ubicacion')::boolean,false) or not coalesce((entry->'validacion'->>'cantidad')::boolean,false) or not coalesce((entry->'validacion'->>'restricciones')::boolean,false) or length(coalesce(entry->'validacion'->>'nota',''))=0 or entry->'validacion'->>'actor' is distinct from actor::text) then raise exception 'Verification requires checked records and authenticated author';end if;
    end loop;
   end if;
   select count(*),count(distinct value->>'id') into count_all,count_ids from jsonb_array_elements(d->'ejecuciones');if count_all<>count_ids then raise exception 'Duplicate execution entry';end if;
   total:=coalesce((d->'ejecucionHistorica'->>'cantidad')::numeric,0);
   for entry in select value from jsonb_array_elements(d->'ejecuciones') e where not exists(select 1 from jsonb_array_elements(d->'ejecuciones') n where n->>'sustituye'=e->>'id') loop
    if (entry->>'cantidad')::numeric<0 or entry->>'unidad' is distinct from d->>'unidad' then raise exception 'Invalid measured quantity or unit';end if;
    total:=total+(entry->>'cantidad')::numeric;
    select coalesce(sum((value->>'cantidad')::numeric),0) into done from jsonb_array_elements(entry->'alcances');if abs(done-(entry->>'cantidad')::numeric)>0.000001 then raise exception 'Surface quantities must equal execution quantity';end if;
    for s in select value from jsonb_array_elements(entry->'alcances') loop
     if not exists(select 1 from jsonb_array_elements(d->'alcances') p where p->>'id'=s->>'scopeId') or (s->>'avance')::numeric not between 0 and 1 then raise exception 'Surface outside original activity';end if;
    end loop;
    if p_accion='execution' and not exists(select 1 from jsonb_array_elements(coalesce(old->'ejecuciones','[]'::jsonb)) e where e->>'id'=entry->>'id') then
     if (entry->>'finReal')::date>(now() at time zone 'America/Santiago')::date or (entry->>'finReal')::date<(entry->>'inicioReal')::date then raise exception 'Invalid actual dates';end if;
     if entry->'validacion'->>'estado'<>'Pendiente' then raise exception 'Execution must wait for verification';end if;
     if (entry->>'cantidad')::numeric>0 and jsonb_array_length(entry->'asistenciaIds')=0 then raise exception 'Attendance required';end if;
     for s in select value from jsonb_array_elements(entry->'asistenciaIds') loop
      if not exists(select 1 from public.atlas_lp_records a where a.tipo='asistencias' and a.id=s#>>'{}' and a.data->>'estado'='Presente' and a.data->'activityIds' ? clave and a.data->>'fecha' between entry->>'inicioReal' and entry->>'finReal') then raise exception 'Attendance does not belong to this activity and date';end if;
     end loop;
    end if;
   end loop;
   if d->>'cantidad' is not null and total>(d->>'cantidad')::numeric+0.000001 then raise exception 'Execution exceeds commitment';end if;
   if p_accion='execution' and exists(select 1 from public.atlas_lp_records r where r.tipo='restricciones' and d->'restrictionIds' ? r.id and coalesce((r.data->>'critica')::boolean,false) and r.data->>'estado' not in ('Liberada','Cerrada')) then raise exception 'Critical restriction must be released before execution';end if;
   if p_accion='revision' and (jsonb_array_length(d->'revisiones')<>coalesce(jsonb_array_length(old->'revisiones'),0)+1 or length(coalesce(d->'revisiones'->-1->>'motivo',''))=0) then raise exception 'Authorized revision requires reason and previous values';end if;
   if p_accion='revision' and (public.atlas_lp_prefix(d->'revisiones',jsonb_array_length(old->'revisiones')) is distinct from old->'revisiones' or d->'revisiones'->-1->'antes' is distinct from public.atlas_lp_plan(old) or d->'revisiones'->-1->'despues' is distinct from public.atlas_lp_plan(d) or d->'revisiones'->-1->>'actor' is distinct from actor::text) then raise exception 'Revision must retain previous and new plan values';end if;
   if p_accion='revision' and coalesce(old->>'unidad','')<>'' and d->>'unidad' is distinct from old->>'unidad' then raise exception 'The published unit is immutable';end if;
   if p_accion='verify' and d->'verificacion'->>'resultado'='Cumplida' and old->'verificacion'->>'resultado' is distinct from 'Cumplida' then
    if exists(select 1 from public.atlas_lp_records r where r.tipo='restricciones' and d->'restrictionIds' ? r.id and coalesce((r.data->>'critica')::boolean,false) and r.data->>'estado' not in ('Liberada','Cerrada')) then raise exception 'Critical restrictions are pending';end if;
    planned:=(d->'compromisoOriginal'->>'cantidad')::numeric;done:=0;
    if planned is null or planned<=0 then raise exception 'Original quantity must be known';end if;
    for entry in select value from jsonb_array_elements(d->'ejecuciones') e where not exists(select 1 from jsonb_array_elements(d->'ejecuciones') n where n->>'sustituye'=e->>'id') loop
     if entry->'validacion'->>'estado'<>'Validada' or entry->>'inicioReal'<d->'compromisoOriginal'->>'inicioPlan' or entry->>'finReal'>d->'compromisoOriginal'->>'finPlan' then raise exception 'Original deadline and verified execution required';end if;
     done:=done+(entry->>'cantidad')::numeric;
    end loop;
    if done+0.000001<planned then raise exception 'Partial execution never fulfills PPC';end if;
    for s in select value from jsonb_array_elements(d->'compromisoOriginal'->'alcances') loop
     if not exists(select 1 from jsonb_array_elements(d->'ejecuciones') e cross join lateral jsonb_array_elements(e->'alcances') x where e->'validacion'->>'estado'='Validada' and x->>'scopeId'=s->>'id' and (x->>'avance')::numeric>=1 and not exists(select 1 from jsonb_array_elements(d->'ejecuciones') n where n->>'sustituye'=e->>'id')) then raise exception 'All original surfaces must be verified';end if;
    end loop;
    if not exists(select 1 from public.atlas_lp_records e where e.tipo='evidencias' and e.data->>'activityId'=clave) then raise exception 'Evidence required';end if;
   end if;
   if p_accion='verify' and d->'verificacion'->>'resultado'='Incumplida' and (length(coalesce(d->'verificacion'->>'causa',''))=0 or length(coalesce(d->'verificacion'->>'nota',''))=0) then raise exception 'Non fulfillment requires its cause';end if;
   if p_accion='verify' and d->'verificacion'->>'resultado'='Incumplida' and (now() at time zone 'America/Santiago')::date<=(d->'compromisoOriginal'->>'finPlan')::date then raise exception 'Original deadline is still open';end if;
   if p_accion='reprogram' and old is not null and d->>'saldoReprogramado' is distinct from old->>'saldoReprogramado' then
    if old->'verificacion'->>'resultado'<>'Incumplida' or old->>'saldoReprogramado' is not null then raise exception 'Balance already reprogrammed or not reviewed';end if;
    select value->'data' into target from jsonb_array_elements(p_ops) where value->>'table'='actividades' and value->>'id'=d->>'saldoReprogramado';
    if target is null or target->>'origen' is distinct from clave or abs((target->>'cantidad')::numeric-((d->>'cantidad')::numeric-total))>0.000001 or target->>'semana'<=d->>'semana' then raise exception 'Invalid reprogrammed balance';end if;
   end if;
  elsif tipo='asistencias' then
   if p_accion not in ('attendance','migration') or d->>'estado' not in ('Presente','Ausente') or (d->>'horas')::numeric not between 0 and 24 or (d->>'fecha')::date>(now() at time zone 'America/Santiago')::date then raise exception 'Invalid attendance';end if;
   select coalesce(sum(value::numeric),0) into total from jsonb_each_text(coalesce(d->'asignacionHoras','{}'::jsonb));if total>(d->>'horas')::numeric then raise exception 'Assigned hours exceed attendance';end if;
   if old is not null and (d->>'personId' is distinct from old->>'personId' or d->>'fecha' is distinct from old->>'fecha' or d->>'turno' is distinct from old->>'turno') then raise exception 'Immutable attendance identity';end if;
   if d->>'estado'='Ausente' and (d->>'horas')::numeric<>0 or exists(select 1 from jsonb_each_text(coalesce(d->'asignacionHoras','{}'::jsonb)) where value::numeric<0) then raise exception 'Invalid attendance hours';end if;
  elsif tipo='restricciones' then
   if p_accion not in ('draft','restriction','reprogram','migration') or d->>'estado' not in ('Identificada','En gestión','Bloqueando ejecución','Liberada','Cerrada') then raise exception 'Invalid restriction operation';end if;
   if old is not null and p_accion='reprogram' and d-'activityIds'-'version'-'actualizada'-'historial' is distinct from old-'activityIds'-'version'-'actualizada'-'historial' then raise exception 'Reprogramming only links the existing restriction';end if;
   if old is null and p_accion<>'migration' and (d->>'estado' is distinct from 'Identificada' or length(coalesce(d->>'descripcion',''))=0 or length(coalesce(d->>'responsable',''))=0 or length(coalesce(d->>'accion',''))=0 or d->>'compromiso' is null) then raise exception 'Incomplete new restriction';end if;
   if old is not null and p_accion='draft' then raise exception 'Planning cannot overwrite an existing restriction';end if;
   if old is not null and d->>'estado' is distinct from old->>'estado' and not ((old->>'estado' in ('Identificada','En gestión') and d->>'estado' in ('En gestión','Bloqueando ejecución','Liberada')) or (old->>'estado'='Bloqueando ejecución' and d->>'estado' in ('En gestión','Liberada')) or (old->>'estado'='Liberada' and d->>'estado' in ('Cerrada','En gestión')) or (old->>'estado'='Cerrada' and d->>'estado'='En gestión')) then raise exception 'Invalid restriction transition';end if;
  elsif tipo='evidencias' then
   if p_accion not in ('evidence','migration') or old is not null then raise exception 'Immutable evidence';end if;
   if p_accion='evidence' and not exists(select 1 from storage.objects where bucket_id='atlas-lp' and name=clave) then raise exception 'Upload real evidence bytes before metadata';end if;
  elsif tipo='reuniones' then
   if p_accion not in ('meeting','migration') then raise exception 'Invalid meeting operation';end if;
  elsif tipo='semanas' then
   if p_accion not in ('publish','close','migration') or coalesce((old->>'cerrada')::boolean,false) then raise exception 'Immutable closed plan';end if;
   if old is not null and public.atlas_lp_prefix(d->'publicaciones',jsonb_array_length(old->'publicaciones')) is distinct from old->'publicaciones' then raise exception 'Immutable plan emissions';end if;
   if old is not null and (d->>'semana' is distinct from old->>'semana' or d->>'level' is distinct from old->>'level') then raise exception 'Immutable weekly period and floor';end if;
   if old is not null and not ((d->'activityIds') @> (old->'activityIds')) then raise exception 'Cannot remove commitments from weekly PPC';end if;
   if p_accion='close' and (d->'activityIds' is distinct from old->'activityIds' or d->'publicaciones' is distinct from old->'publicaciones' or not coalesce((d->>'cerrada')::boolean,false)) then raise exception 'Close preserves the original weekly plan';end if;
   if p_accion='close' then
    if (now() at time zone 'America/Santiago')::date<=to_date(d->>'semana'||'-7','IYYY-"W"IW-ID') then raise exception 'Close after the operating week ends';end if;
    for s in select value from jsonb_array_elements(d->'activityIds') loop
     select coalesce((select value->'data' from jsonb_array_elements(p_ops) where value->>'table'='actividades' and value->>'id'=s#>>'{}'),(select r.data from public.atlas_lp_records r where r.tipo='actividades' and r.id=s#>>'{}')) into target;
     if target is null or target->'verificacion'->>'resultado'='Pendiente de verificación' then raise exception 'Review every commitment before closing';end if;
    end loop;
   end if;
  end if;
  nueva:=coalesce(oldrow.version,0)+1;
  insert into public.atlas_lp_records(tipo,id,version,data,updated_by) values(tipo,clave,nueva,d,actor)
   on conflict on constraint atlas_lp_records_pkey do update set version=excluded.version,data=excluded.data,updated_by=excluded.updated_by,updated_at=now();
  insert into public.atlas_lp_historial(operacion,tipo,registro,version,actor,email,antes,data) values(p_id,tipo,clave,nueva,actor,correo,old,d);
  result:=result||jsonb_build_array(jsonb_build_object('tipo',tipo,'id',clave,'version',nueva));
 end loop;
 -- Check relationships after writing every member of the atomic batch.
 for op in select value from jsonb_array_elements(p_ops) loop
  tipo:=op->>'table';d:=op->'data';clave:=op->>'id';
  if tipo='actividades' then
   if p_accion='draft' and d->'grupo' is not null and d->'grupo'<>'null'::jsonb then
    select coalesce(sum((a.data->>'cantidad')::numeric),0),count(*) into done,count_all from public.atlas_lp_records a where a.tipo='actividades' and a.data->'grupo'->>'id'=d->'grupo'->>'id';
    if count_all<>(d->'grupo'->>'total')::integer or abs(done-(d->'grupo'->>'cantidadTotal')::numeric)>0.000001 then raise exception 'Weekly segments must preserve group total';end if;
   end if;
   for s in select value from jsonb_array_elements(d->'restrictionIds') loop
    if not exists(select 1 from public.atlas_lp_records r where r.tipo='restricciones' and r.id=s#>>'{}' and r.data->'activityIds' ? clave) then raise exception 'Central restriction link is missing';end if;
   end loop;
   if p_accion='publish' and not exists(select 1 from jsonb_array_elements(p_ops) p cross join lateral jsonb_array_elements(p->'data'->'publicaciones'->-1->'compromisos') c where p->>'table'='semanas' and p->'data'->>'level'=d->>'level' and p->'data'->>'semana'=d->>'semana' and p->'data'->'activityIds' ? clave and c->>'id'=clave and c->'plan'=d->'compromisoOriginal' and not coalesce((p->'data'->>'cerrada')::boolean,false)) then raise exception 'Publication requires its immutable weekly emission';end if;
   if p_accion='close' and not exists(select 1 from jsonb_array_elements(p_ops) p where p->>'table'='semanas' and p->'data'->'activityIds' ? clave and coalesce((p->'data'->>'cerrada')::boolean,false)) then raise exception 'Closing activities requires atomic weekly closure';end if;
  elsif tipo='restricciones' then
   for s in select value from jsonb_array_elements(d->'activityIds') loop
    if not exists(select 1 from public.atlas_lp_records a where a.tipo='actividades' and a.id=s#>>'{}' and a.data->'restrictionIds' ? clave) then raise exception 'Restriction activity link is missing';end if;
   end loop;
  elsif tipo='asistencias' then
   select h.antes into old from public.atlas_lp_historial h where h.operacion=p_id and h.tipo=tipo and h.registro=clave;
   if p_accion<>'migration' and exists(select 1 from public.atlas_lp_records a where a.tipo='actividades' and old->'activityIds' ? a.id and a.data->>'fase'='cerrada') then
    if d-array['activityIds','asignacionHoras','version','actualizada','historial'] is distinct from old-array['activityIds','asignacionHoras','version','actualizada','historial'] then raise exception 'Attendance of a closed week is immutable';end if;
    if exists(select 1 from public.atlas_lp_records a where a.tipo='actividades' and old->'activityIds' ? a.id and a.data->>'fase'='cerrada' and d->'asignacionHoras'->a.id is distinct from old->'asignacionHoras'->a.id) then raise exception 'Closed attendance hours are immutable';end if;
   end if;
   for s in select value from jsonb_array_elements(d->'activityIds') loop
    if not exists(select 1 from public.atlas_lp_records a where a.tipo='actividades' and a.id=s#>>'{}' and (p_accion='migration' or a.data->>'fase'='publicada' or (a.data->>'fase'='cerrada' and old->'activityIds' ? a.id))) then raise exception 'Attendance activity must be published';end if;
   end loop;
  elsif tipo='evidencias' then
   if not exists(select 1 from public.atlas_lp_records a where a.tipo='actividades' and a.id=d->>'activityId' and (p_accion='migration' or (a.data->>'fase'<>'cerrada' and a.data->'verificacion'->>'resultado'='Pendiente de verificación'))) then raise exception 'Evidence activity is missing or closed';end if;
  elsif tipo='semanas' then
   for s in select value from jsonb_array_elements(d->'activityIds') loop
    if not exists(select 1 from public.atlas_lp_records a where a.tipo='actividades' and a.id=s#>>'{}' and a.data->>'level'=d->>'level' and a.data->>'semana'=d->>'semana' and a.data->>'fase'<>'borrador') then raise exception 'Weekly plan contains an unrelated or unpublished activity';end if;
   end loop;
   if p_accion='close' then
    if jsonb_array_length(d->'cierre'->'resultados')<>jsonb_array_length(d->'activityIds') then raise exception 'Weekly closure must retain every actual result';end if;
    for s in select value from jsonb_array_elements(d->'cierre'->'resultados') loop
     if not exists(select 1 from public.atlas_lp_records a where a.tipo='actividades' and a.id=s->>'id' and a.data->'verificacion'=s->'resultado' and a.data->'compromisoOriginal'=s->'original' and d->'activityIds' ? a.id) then raise exception 'Closure snapshot differs from actual results';end if;
    end loop;
   end if;
  end if;
 end loop;
 insert into public.atlas_lp_operaciones(id,actor,huella,resultado) values(p_id,actor,p_huella,result);
 return result;
end;
$$;
commit;
