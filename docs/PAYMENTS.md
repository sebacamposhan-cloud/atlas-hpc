# Estados de pago (retirado)

El 28 de octubre de 2026, por decisión del jefe de producción, Estados de pago se eliminó de Atlas. Los estados de pago son información sensible y sujeta a cambios de negociación, y no deben estar en una app donde entra todo el personal de terreno.

## Qué se retiró

- La tarjeta «Estados de pago» de Control de obra.
- La página `payments.html` y sus módulos (`payments.mjs`, `payment-plan.mjs`, `payment-calculation.mjs`).
- La API `/api/payments` del servidor (`server/payments.mjs`, `server/payments-supabase.mjs`, `server/payment-contractors.mjs`). Ahora responde «Ruta no disponible».
- El script `scripts/payment-user.mjs`, las pruebas de pagos, los SQL `supabase/payments.sql` y `supabase/price-catalog-setup.sql`, y las guías `PAYMENTS_SUPABASE.md`, `PRICE_CATALOG.md` y `PAYMENT_PLANS.md`.

Todo sigue en el historial de git, en el commit anterior a este retiro.

- **Datos en Supabase (17 de noviembre de 2026).** Se borraron las tablas `atlas_payments` y `atlas_payment_audit`, que estaban vacías, y `atlas_price_items`, que tenía 4044 precios copiados de la hoja Formulario n°11A de `HPC-GEN-GEN-PRE-01-Rev01.xlsx`. También se borraron las funciones `save_atlas_payment` e `import_atlas_prices`. El catálogo se puede reconstruir desde ese Excel.

## Qué no se tocó

- **Cuentas.** Las cuentas personales siguen sirviendo para la Nube (permiso `campo_role`). El permiso `payments_role` se quitó de la única cuenta que lo tenía el 17 de noviembre de 2026.
- **Render.** Si existen las variables `PAYMENTS_DB_PATH` o `PAYMENTS_USERS_JSON`, ya no se usan y se pueden borrar. `SUPABASE_URL` y `SUPABASE_ANON_KEY` se mantienen, porque las usa la Nube.
