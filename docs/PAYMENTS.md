# Estados de pago

Control de obra → Estados de pago abre un acceso individual adicional. Las cuentas autorizadas comparten los registros. Roles `editor` (crear/editar) y `approver` (también aprobar o modificar aprobados). Montos enteros CLP; retención es un monto, no un porcentaje. Los impuestos no se calculan automáticamente.

## Configuración en Render

1. Requiere servicio con **disco persistente** montado en `/var/data` (el plan gratuito actual no ofrece ese disco). Alternativamente se necesita adaptar este módulo a una base externa antes de activarlo.
2. En Environment añadir `PAYMENTS_DB_PATH=/var/data/payments.sqlite`.
3. Crear un hash por persona en un equipo seguro usando Node 24: `node scripts/payment-user.mjs nombre editor < /ruta/privada/password.txt` (o `approver`). El archivo privado debe contener una contraseña de al menos 12 caracteres; eliminarlo de forma adecuada después. Nunca guardarlo en el repositorio. Guardar únicamente `{username,role,hash}` por persona en un array JSON en la variable secreta `PAYMENTS_USERS_JSON` de Render. Roles válidos: `editor`, `approver`. Usar contraseñas largas y únicas. No publicar ese JSON ni enviar contraseñas al chat.
4. Publicar main. Sin ambas variables, la API responde 503 y no guarda datos en disco efímero. Cambiar/quitar usuarios requiere reiniciar el servicio y cierra todas las sesiones. No hay autorregistro ni recuperación por correo.
5. Configurar respaldo externo del disco/base y verificar restauración antes del uso real financiero. La base contiene registros e historial de cada versión; no hay borrado desde la interfaz.

La clave general de Atlas sigue siendo necesaria; cada persona se identifica además en pagos. Sesiones de una hora, conservadas solo en memoria del servidor y de la pestaña; reiniciar, cerrar pestaña o recargar exige entrar otra vez. Sin modo offline para pagos. La API exige sesión para leer y escribir. Los hashes y la base están fuera de `dist`; no se incluyen en el paquete offline. Las sesiones no se guardan en localStorage. El historial conserva autor, fecha y versión en servidor; todavía no tiene pantalla de consulta.
