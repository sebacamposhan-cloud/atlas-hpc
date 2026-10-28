# Estados de pago (retirado)

El 28 de octubre de 2026, por decisión del jefe de producción, Estados de pago se eliminó de Atlas. Los estados de pago son información sensible y sujeta a cambios de negociación, y no deben estar en una app donde entra todo el personal de terreno.

## Qué se retiró

- La tarjeta «Estados de pago» de Control de obra.
- La página `payments.html` y sus módulos (`payments.mjs`, `payment-plan.mjs`, `payment-calculation.mjs`).
- La API `/api/payments` del servidor (`server/payments.mjs`, `server/payments-supabase.mjs`, `server/payment-contractors.mjs`). Ahora responde «Ruta no disponible».
- El script `scripts/payment-user.mjs`, las pruebas de pagos, los SQL `supabase/payments.sql` y `supabase/price-catalog-setup.sql`, y las guías `PAYMENTS_SUPABASE.md`, `PRICE_CATALOG.md` y `PAYMENT_PLANS.md`.

Todo sigue en el historial de git, en el commit anterior a este retiro.

## Qué no se tocó

- **Datos en Supabase.** Las tablas `atlas_payments`, `atlas_payment_audit` y `atlas_price_items`, y las funciones `save_atlas_payment` e `import_atlas_prices`, siguen en el proyecto. Si se quieren eliminar, primero hay que exportarlas y luego borrarlas desde el SQL Editor de Supabase. Lo decide y lo hace el responsable del proyecto.
- **Cuentas.** Las cuentas personales siguen sirviendo para la Nube (permiso `campo_role`). El permiso `payments_role` ya no tiene uso y se puede quitar.
- **Render.** Si existen las variables `PAYMENTS_DB_PATH` o `PAYMENTS_USERS_JSON`, ya no se usan y se pueden borrar. `SUPABASE_URL` y `SUPABASE_ANON_KEY` se mantienen, porque las usa la Nube.
