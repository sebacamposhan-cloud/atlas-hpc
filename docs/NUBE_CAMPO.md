# Nube de proyectos y observaciones en terreno

Los **proyectos** (recintos pintados por estado, con cortes) y las **observaciones en terreno con fotos** se guardan primero en el equipo (IndexedDB) y, con la sesión de **Nube** iniciada, se sincronizan con Supabase. Así no se pierden al cerrar la app, al actualizar el código ni al cambiar de celular, y todos los equipos ven lo mismo.

Usa un proyecto Supabase con cuentas personales (es el mismo proyecto que usaba el antiguo módulo Estados de pago, retirado el 28 de octubre de 2026). No usa la clave `service_role`.

## Activación (una vez)

1. **Supabase → SQL Editor → New query**. Pegar el contenido completo de [`supabase/campo.sql`](../supabase/campo.sql) y apretar **Run**. Si Supabase advierte de operaciones destructivas, es por los `drop policy if exists`: confirmar. Debe terminar en *Success. No rows returned*. Se puede volver a ejecutar sin perder datos.
2. **Cuentas:** cada persona necesita un usuario en **Authentication → Users → Add user → Create new user** (correo y contraseña, *Auto Confirm User*). Si ya tenía cuenta de Atlas en ese proyecto, sirve la misma. Las contraseñas se entregan por un medio privado, nunca por el chat ni en el repositorio.
3. **Permiso:** en SQL Editor, por cada persona (cambiar el correo):

   ```sql
   update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"campo_role":"editor"}'::jsonb where email = 'correo@ejemplo.cl';
   ```

   `editor` registra y edita; `lector` solo ve (por ejemplo, para revisar sin modificar). Quien ya tenía sesión abierta debe cerrarla y volver a entrar para tomar el permiso.
4. **Render → Environment:** `SUPABASE_URL` (Project URL) y `SUPABASE_ANON_KEY` (clave *anon public*, legacy). Si ya estaban configuradas, se mantienen. Nunca la clave `service_role` ni la contraseña de la base.
5. Fusionar la rama y hacer **Manual Deploy** en Render.

## Uso

- Botón **Nube** en la cabecera (en el celular, el ícono de nube). **Entrar** con correo y contraseña personales.
- Punto de estado: verde sincronizado, azul sincronizando, amarillo sin red (se guarda en el equipo y se sube al volver la señal), rojo error (el detalle aparece al tocar el botón), gris sin sesión.
- Se sincroniza solo: unos segundos después de cada cambio, al volver la conexión, al volver a la app y cada 3 minutos con la app abierta. **Sincronizar ahora** fuerza una vuelta.
- La sesión se renueva sola mientras se use la app. **Cerrar sesión** deja lo guardado en el equipo.

## Reglas

- **Versión por registro:** cada proyecto u observación se guarda con la versión que tenía el equipo; si otro equipo se adelantó, Supabase lo rechaza y se resuelve sin perder datos:
  - **Proyecto cambiado en dos equipos:** queda la versión de la nube y lo de este equipo se guarda como «(copia de este equipo)», que también se sube.
  - **Observación cambiada en dos equipos:** se juntan el historial y las fotos de ambos; los datos (estado, descripción, responsable…) son los de la actualización más reciente. El historial muestra todos los cambios.
- **Fotos:** se suben (foto y miniatura) antes que su observación y no se reemplazan ni se borran en la nube. Quitar una foto de una observación la saca del registro, pero el archivo queda en Storage como evidencia.
- **Historial en la nube:** `atlas_campo_historial` guarda cada versión subida, con quién y cuándo.
- **Solo lectura:** una cuenta `lector` baja todo; lo que cambie en su equipo no se sube.

## Límites

- Plan Free de Supabase: 500 MB de base y 1 GB de Storage. Una foto ocupa del orden de 0,2–0,5 MB (más su miniatura): alcanza para unas 2.000–3.000 fotos.
- La sesión (token de acceso y de renovación) queda en el almacenamiento del navegador del equipo. En equipos compartidos, cerrar sesión al terminar.
- Lo creado antes de iniciar sesión se sube en la primera sincronización. El respaldo JSON sigue disponible.

## Archivos

- `supabase/campo.sql`: tablas, RLS, función de guardado con versión y bucket de fotos.
- `server/campo.mjs`: rutas `/api/campo` (sesión, lectura, guardado y fotos) que reenvían a Supabase con la sesión de cada usuario.
- `dist/nube-sync.mjs`: reglas de sincronización (huellas, conflictos, fotos).
- `dist/nube.mjs` y `dist/nube.css`: botón, sesión y disparadores.
- `nube-test.mjs`: dos equipos y una cuenta lectora contra un Supabase simulado (no ejercita el SQL real).
