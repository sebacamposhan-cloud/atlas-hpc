# Inicio de sesión de Atlas

Atlas se abre con una cuenta personal de Supabase (las mismas cuentas que usaba **Nube**). Al iniciar sesión, la nube queda activa sola: proyectos, observaciones con fotos y Last Planner se sincronizan sin otro paso. Reemplaza la clave compartida de Render (`atlas` + contraseña), que se elimina.

- **Pantalla:** `/login.html`. Se entra con **usuario o correo** y contraseña. «Recordar mi sesión» (marcado) mantiene la sesión 30 días en ese equipo, renovándose con el uso; sin marcar, se cierra al cerrar el navegador.
- **Sin sesión** el servidor solo entrega el inicio de sesión: las páginas redirigen a `/login.html` y vuelven a la misma dirección después de entrar; archivos y API responden 401.
- **Sin señal** sigue funcionando quien ya entró en ese equipo. Entrar por primera vez necesita conexión.
- **Cerrar sesión** (cabecera) intenta subir lo pendiente y deja lo guardado en el equipo.
- **¿Olvidaste tu contraseña?** solo indica que la restablece la administración (ver abajo).

## Configuración (una vez)

### 1. Supabase: ingreso con usuario

**SQL Editor → New query**, pegar [`supabase/login-usuario.sql`](../supabase/login-usuario.sql) completo y **Run**. Debe terminar en *Success*. Sin este paso se puede entrar igual, pero solo con el correo.

### 2. Supabase: cuentas

Las cuentas de Nube sirven tal cual: **mismo correo y misma contraseña**. La clave de Render no es una cuenta y desaparece.

Ver quién tiene cuenta y acceso (SQL Editor):

```sql
select email, raw_app_meta_data->>'usuario' as usuario, raw_app_meta_data->>'campo_role' as rol, last_sign_in_at
from auth.users order by email;
```

- **Cuenta nueva:** Authentication → Users → **Add user → Create new user**, correo y contraseña, marcar *Auto Confirm User*.
- **Rol y usuario** (por cada persona; `editor` edita, `lector` solo mira; usuario corto, sin espacios ni @):

  ```sql
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"campo_role":"editor","usuario":"mauro"}'::jsonb
  where email = 'correo@ejemplo.cl';
  ```

- **Cambiar una contraseña olvidada** (administración, por un medio privado; nunca en el chat ni en el repositorio):

  ```sql
  update auth.users set encrypted_password = extensions.crypt('NuevaContraseña', extensions.gen_salt('bf'))
  where email = 'correo@ejemplo.cl';
  ```

- **Quitar el acceso:** `update auth.users set raw_app_meta_data = raw_app_meta_data - 'campo_role' where email = '…';`
- **Recomendado:** Authentication → Sign In / Providers → desactivar *Allow new users to sign up*. Las cuentas las crea solo la administración (una cuenta sin rol no entra a Atlas de todos modos).

### 3. Render (Environment del servicio atlas-hpc)

1. **Antes de desplegar:** agregar `ATLAS_SESSION_SECRET` con **Generate** (valor aleatorio largo; firma la cookie de sesión). Comprobar que existan `SUPABASE_URL` y `SUPABASE_ANON_KEY` (ya los usa la nube). Guardar con *Save only*.
2. Fusionar el PR y **Manual Deploy → Deploy latest commit**. Sin `ATLAS_SESSION_SECRET` el servidor nuevo no arranca y Render mantiene la versión anterior.
3. Con la versión nueva funcionando, borrar `ATLAS_ACCESS_USER` y `ATLAS_ACCESS_PASSWORD` (ya no se usan).

El servicio de Render no aplica `render.yaml` (tiene su propio comando de build en el panel); `render.yaml` solo documenta las variables.

### 4. Equipos que ya tenían Atlas

La copia guardada en el equipo sigue abriendo la versión anterior hasta actualizarse. Si ese equipo tenía sesión en **Nube**, se actualiza solo al volver la señal (la nube renueva la sesión y con ella la cookie). Si no la tenía: en la versión anterior, botón **Nube → Entrar**, o borrar los datos del sitio en el navegador y volver a abrir Atlas.

## Archivos

- `server/sesion.mjs`: cookie firmada (`atlas_sesion`, HttpOnly) y rutas públicas.
- `server/campo.mjs`: `/api/campo/login` (usuario o correo), `/refresh` (renueva la cookie) y `/logout` (la borra).
- `server/groq-server.mjs`: sin sesión, redirección a `/login.html` o 401; `/api/sesion` para la página.
- `dist/login.html`, `login.css`, `login.mjs`, `dist/login/`: pantalla de inicio de sesión.
- `dist/sesion-guardia.js`: sin sesión en el equipo, la app abre el inicio de sesión (también sin conexión).
- `supabase/login-usuario.sql`: traduce el usuario al correo de la cuenta.
- Desarrollo local: sin `ATLAS_SESSION_SECRET` no se pide inicio de sesión (como antes sin contraseña).
