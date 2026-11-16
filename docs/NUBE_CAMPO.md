# Nube de proyectos y observaciones en terreno

Los **proyectos** (recintos pintados por estado, con cortes), las **observaciones en terreno con fotos** y el **avance por recinto** (lo marcado en el rombo, en la ficha o con el pincel de un proyecto de partida) se guardan primero en el equipo (IndexedDB) y se sincronizan con Supabase usando la sesión con que se entró a Atlas ([LOGIN.md](LOGIN.md)). Así no se pierden al cerrar la app, al actualizar el código ni al cambiar de celular, y todos los equipos ven lo mismo.

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

- Al iniciar sesión en Atlas la nube queda activa. La cabecera muestra su estado: **«Todo subido»**, **«N sin subir»** (en celular, el ícono con el número) o **«Subiendo…»**; una cuenta `lector` ve «Solo lectura». Al tocarlo se abre el detalle: qué falta subir (avances, observaciones, proyectos, fotos), la última sincronización y **«Subir ahora»**.
- Se sincroniza solo: un segundo después de cada cambio (los toques seguidos se juntan), al volver la conexión, al volver a la app, al salir de ella con cambios pendientes y cada 3 minutos con la app abierta. Cada pedido a la nube tiene un límite de tiempo (30 s; 90 s las fotos): con señal débil no queda colgado.
- La sesión se renueva sola mientras se use la app. **Cerrar sesión** (cabecera) intenta subir lo pendiente; si algo no alcanzó a subir, avisa cuántos cambios quedan y pide confirmar. Lo no subido sigue en el equipo y se sube cuando alguien vuelva a entrar en él con señal.
- Una actualización de Atlas espera a que termine la subida en curso.

## Reglas

- **Versión por registro:** cada proyecto u observación se guarda con la versión que tenía el equipo; si otro equipo se adelantó, Supabase lo rechaza y se resuelve sin perder datos:
  - **Proyecto cambiado en dos equipos:** se juntan en uno solo, comparando con lo último sincronizado. Lo cambiado en un solo equipo se conserva, lo borrado en un equipo y no tocado en el otro se borra, y los recintos, estados, cortes y filas se juntan uno a uno (dos recintos nuevos con el mismo número reciben números distintos). Si los dos cambiaron el mismo dato, queda lo guardado más tarde y se avisa. Para proyectos sincronizados antes de esta versión no hay base: las listas se suman y algo borrado en un solo equipo puede volver. Solo si el resultado no es un proyecto válido, lo de este equipo queda como «(copia de este equipo)».
  - **Observación cambiada en dos equipos:** se juntan el historial y las fotos de ambos; los datos (estado, descripción, responsable…) son los de la actualización más reciente. El historial muestra todos los cambios.
  - **Avance del mismo recinto cambiado en dos equipos:** se juntan las partidas de ambos; en cada partida queda la marcada más tarde. Protocolos y firma, del registro más reciente. Una marca deshecha en un equipo mientras el otro la tenía puede volver: se corrige marcando de nuevo.
- **Avance en proyectos de partida:** un proyecto «Avance · <partida>» u «Hoja de ruta» no guarda los estados de las columnas enlazadas a la planilla; los lee del avance de cada recinto. Por eso lo que se pinta ahí viaja como avance (tipo `avance`, id `av_…` que codifica «piso|código»), no como proyecto. Requiere [`supabase/avance-terreno.sql`](../supabase/avance-terreno.sql); sin ese SQL el avance sigue guardándose en el equipo y la nube lo rechaza sin cortar lo demás.
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
- `dist/nube.mjs` y `dist/nube.css`: sesión, «Cerrar sesión» y disparadores de la sincronización.
- `supabase/avance-terreno.sql`: acepta el tipo `avance` y los pisos N04 a N09 en contornos y planillas.
- `nube-test.mjs`: dos equipos y una cuenta lectora contra un Supabase simulado; con `PGLITE_MODULE` ejecuta además los SQL en PostgreSQL (PGlite).
