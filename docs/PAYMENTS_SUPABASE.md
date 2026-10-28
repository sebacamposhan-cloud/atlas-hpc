# Activación en Supabase manteniendo Render Free

La integración usa Supabase Auth y Postgres del proyecto. No necesita disco Render ni una clave service_role. El nivel gratuito tiene cuotas y puede pausar proyectos inactivos; revisar condiciones en Supabase. El módulo necesita conexión y una cuenta autorizada. Los pagos locales anteriores no se migran automáticamente.

1. Crear un proyecto en https://supabase.com/dashboard con el plan Free. Elegir región y guardar la contraseña de base en un gestor privado.
2. Abrir SQL Editor → New query, pegar el contenido de `supabase/payments.sql` y ejecutar una vez. Crea tablas con RLS, lectura solo autorizada y función de guardado con permisos, versiones e historial.
3. En Authentication → Providers / Sign In desactivar el registro público por email. En Authentication → Users → Add user crear las personas autorizadas con email y contraseña individual. Entregar contraseñas por un medio privado.
4. Asignar el rol desde SQL Editor, sustituyendo únicamente el correo:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb)
 || '{"payments_role":"approver"}'::jsonb
where email = 'correo-del-aprobador@empresa.cl';
```

Para usuarios que editan pero no aprueban usar `editor`. No usar `user_metadata` para permisos. Verificar que el UPDATE modificó exactamente una cuenta. Salir y volver a entrar después de cambiar roles; un JWT ya emitido puede conservar permisos hasta su vencimiento. Configurar expiración de JWT de una hora o menos. Para baja urgente revocar sesiones además de retirar el rol.

5. En Project Settings → API / API Keys copiar Project URL y la clave **anon pública (legacy)**. No usar contraseña de base ni clave service_role/secret.
6. En Render → atlas-hpc → Environment → Edit → Add variable, agregar:
   - `SUPABASE_URL`: URL https://identificador.supabase.co
   - `SUPABASE_ANON_KEY`: clave anon pública del mismo proyecto.
7. Si se habían creado `PAYMENTS_DB_PATH` o `PAYMENTS_USERS_JSON`, retirarlas tras respaldar cualquier dato previo. Supabase tiene prioridad cuando está configurado.
8. Fusionar la PR en main y hacer Manual Deploy → Deploy latest commit. Mantener el servicio Free. Abrir Control de obra → Estados de pago e ingresar con correo y contraseña personales.

## Verificación antes de datos reales

Probar dos cuentas editor/aprobador: el editor no puede aprobar ni modificar un aprobado; una cuenta sin rol no puede consultar. Guardar borrador, recargar y consultar desde otro equipo; verificar historial en atlas_payment_audit. Probar conflicto de versión entre dos pestañas. Revisar las políticas RLS desde Supabase. Exportar/resguardar la base y probar restauración conforme a las opciones del plan antes de usar registros financieros reales.

Las pruebas automatizadas del adaptador usan Supabase simulado. El SQL y las políticas deben ejecutarse y verificarse en el proyecto real antes de activación. El sistema guarda montos CLP enteros, sin cálculo de IVA ni validación tributaria. El historial está en servidor, aún sin pantalla propia. No hay migración de contraseñas locales: las personas se crean en Auth.
