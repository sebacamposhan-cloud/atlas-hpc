-- Atlas · Inicio de sesión con usuario (además del correo).
-- Ejecutar en Supabase → SQL Editor → New query → pegar todo → Run. Se puede volver a ejecutar.
-- El usuario de cada cuenta va en app_metadata.usuario, que solo puede cambiar un administrador (no la propia persona).
-- El servidor de Atlas llama a esta función con la clave anon, que no sale del servidor, para saber a qué correo
-- corresponde un usuario; luego entra con ese correo y la contraseña. Solo responde por cuentas con rol de Atlas.

create or replace function public.atlas_correo_de_usuario(p_usuario text) returns text language sql stable security definer set search_path = '' as $$
 select u.email::text from auth.users u
 where lower(u.raw_app_meta_data->>'usuario') = lower(trim(p_usuario))
   and u.raw_app_meta_data->>'campo_role' in ('editor','lector')
 order by u.created_at
 limit 1
$$;
revoke all on function public.atlas_correo_de_usuario(text) from public, authenticated;
grant execute on function public.atlas_correo_de_usuario(text) to anon, service_role;

-- Dar acceso a Atlas: rol ('editor' edita, 'lector' solo mira) y usuario corto, sin espacios ni @. Cambia correo y usuario:
--   update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"campo_role":"editor","usuario":"mauro"}'::jsonb
--   where email = 'correo@ejemplo.cl';
-- Ver quién tiene acceso:
--   select email, raw_app_meta_data->>'usuario' as usuario, raw_app_meta_data->>'campo_role' as rol, last_sign_in_at from auth.users order by email;
-- Quitar el acceso (la cuenta queda, pero no entra a Atlas):
--   update auth.users set raw_app_meta_data = raw_app_meta_data - 'campo_role' where email = 'correo@ejemplo.cl';
