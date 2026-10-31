-- Additive validation for daily planning, stored inside the existing activity JSON.
-- Run after lastplanner-cycle.sql (or the existing Last Planner 4 migration).
begin;
create or replace function public.atlas_lp_validate_daily() returns trigger
language plpgsql set search_path='' as $$
declare assignments jsonb; item jsonb; expected_team text; seen text[]:=array[]::text[];
begin
 if new.tipo<>'actividades' then return new;end if;
 assignments:=new.data->'planificacion'->'schedule';
 if assignments is null then return new;end if;
 if jsonb_typeof(assignments)<>'array' or jsonb_array_length(assignments)>5000 then raise exception 'Invalid daily schedule';end if;
 for item in select value from jsonb_array_elements(assignments) loop
  if jsonb_typeof(item)<>'object' or coalesce(btrim(item->>'contractor'),'')='' or coalesce(btrim(item->>'teamName'),'')='' then raise exception 'Daily assignment requires contractor and team';end if;
  expected_team:=lower(btrim(item->>'contractor'))||'|'||lower(btrim(item->>'teamName'));
  if coalesce(item->>'teamId','')<>expected_team or coalesce(item->>'id','')<>coalesce(item->>'date','')||'|'||expected_team or item->>'id'=any(seen) then raise exception 'Duplicate or invalid daily assignment identifier';end if;
  seen:=array_append(seen,item->>'id');
  if coalesce(item->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or (item->>'date')::date < (new.data->>'inicioPlan')::date or (item->>'date')::date > (new.data->>'finPlan')::date then raise exception 'Daily assignment outside planned period';end if;
  if coalesce(jsonb_typeof(item->'people'),'')<>'number' or not ((item->>'people')::numeric between 1 and 9007199254740991) or trunc((item->>'people')::numeric)<>(item->>'people')::numeric or coalesce(jsonb_typeof(item->'fraction'),'')<>'number' or not ((item->>'fraction')::numeric>0 and (item->>'fraction')::numeric<=1) then raise exception 'Invalid planned people or workday fraction';end if;
  if item->'crews' is not null and item->'crews'<>'null'::jsonb and (jsonb_typeof(item->'crews')<>'number' or (item->>'crews')::numeric<1 or trunc((item->>'crews')::numeric)<>(item->>'crews')::numeric) then raise exception 'Invalid planned crews';end if;
  if item->'productivity' is not null and (jsonb_typeof(item->'productivity')<>'object' or coalesce(jsonb_typeof(item->'productivity'->'rate'),'')<>'number' or not ((item->'productivity'->>'rate')::numeric>0) or coalesce(item->'productivity'->>'unit','')='') then raise exception 'Invalid team productivity';end if;
  if item->'hours' is not null and item->'hours'<>'null'::jsonb then
   if jsonb_typeof(item->'hours')<>'number' or not ((item->>'hours')::numeric>0 and (item->>'hours')::numeric<=24) or coalesce(jsonb_typeof(item->'referenceHours'),'')<>'number' or not ((item->>'referenceHours')::numeric>0 and (item->>'referenceHours')::numeric<=24) then raise exception 'Invalid scheduled hours';end if;
  end if;
 end loop;
 return new;
end;$$;
drop trigger if exists atlas_lp_daily_check on public.atlas_lp_records;
create trigger atlas_lp_daily_check before insert or update on public.atlas_lp_records for each row execute function public.atlas_lp_validate_daily();
revoke all on function public.atlas_lp_validate_daily() from public;
commit;
