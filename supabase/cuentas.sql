-- Atlas · Cuentas nuevas desde el SQL Editor (administración).
-- Crea la cuenta con el correo ya confirmado y una contraseña temporal, o, si ya existe, solo actualiza su rol,
-- usuario y nombre (la contraseña no se toca). Quien entra con la contraseña temporal (variable ATLAS_CLAVE_TEMPORAL
-- en Render) debe elegir una personal antes de abrir Atlas. Ver docs/LOGIN.md.
--
-- Uso, una línea por persona (los datos reales van solo en el SQL Editor, nunca en este repositorio):
--   select public.atlas_crear_cuenta('correo@empresa.cl', 'Nombre y apellido', 'editor', 'contraseña-temporal');
-- Rol: 'editor' (edita) o 'lector' (solo mira). Quinto dato opcional: usuario corto para entrar sin el correo.
-- Se puede correr varias veces: no duplica cuentas.

create or replace function public.atlas_crear_cuenta(p_email text, p_nombre text, p_rol text default 'editor', p_clave text default null, p_usuario text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
 e text := lower(btrim(coalesce(p_email, '')));
 nombre text := btrim(coalesce(p_nombre, ''));
 usuario text := lower(btrim(coalesce(p_usuario, '')));
 u uuid;
begin
 if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Correo inválido: %', p_email; end if;
 if p_rol is null or p_rol not in ('editor', 'lector') then raise exception 'Rol inválido para %: usa editor o lector', e; end if;
 if usuario <> '' and usuario !~ '^[a-z0-9._-]{2,40}$' then raise exception 'Usuario inválido para %: sin espacios ni @', e; end if;
 select id into u from auth.users where lower(email) = e;
 if u is null then
  if coalesce(length(p_clave), 0) < 6 then raise exception 'Falta la contraseña temporal (mínimo 6 caracteres) para %', e; end if;
  u := gen_random_uuid();
  -- Los textos vacíos (no NULL) en los tokens evitan errores del servicio de cuentas al iniciar sesión.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', e,
   extensions.crypt(p_clave, extensions.gen_salt('bf')), now(),
   jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')), '{}'::jsonb, now(), now(),
   '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), u, u::text, jsonb_build_object('sub', u::text, 'email', e, 'email_verified', true), 'email', now(), now(), now());
 end if;
 update auth.users set
  raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('campo_role', p_rol)
   || case when usuario = '' then '{}'::jsonb else jsonb_build_object('usuario', usuario) end,
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
   || case when nombre = '' then '{}'::jsonb else jsonb_build_object('nombre', nombre) end,
  updated_at = now()
 where id = u;
 return u;
end $$;
-- Solo la administración (SQL Editor): nadie la puede llamar desde Atlas ni desde la API.
revoke all on function public.atlas_crear_cuenta(text, text, text, text, text) from public, anon, authenticated;
