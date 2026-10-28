# Catálogo compartido de precios

Estados de pago consulta `/api/payments/prices` con sesión personal. El servidor lee `atlas_price_items` de Supabase con JWT del usuario, paginando de 1.000 en 1.000 para no truncar el catálogo al límite de PostgREST. No se usan precios guardados en IndexedDB ni se solicita Excel a cada dispositivo. El selector busca código y descripción y muestra unidad/precio unitario; el monto de pago se ingresa explícitamente.

## Fuente y carga inicial

La fuente vigente indicada por el usuario es HPC-GEN-GEN-PRE-01-Rev01.xlsx, hoja Formulario n°11A: 4.044 partidas con unidad, sin duplicados ITEM, excluyendo 10 partidas marcadas eliminadas. BA=precio unitario, AZ=cantidad real a ejecutar, BB=importe. Se conserva fila de fuente. No se restringe a partidas ni cantidades del nivel −1.

Comparación de valores guardados contra HPC-5-GEN-GEN-PRE-01-RevE_UT-SSMSO_Sacyr.xlsx: 4.038 partidas, 22 exclusivas Rev01, 16 exclusivas RevE, 201 códigos con diferencias en descripción, unidad, precio, cantidad o total. La comparación numérica es exacta sobre valores cacheados de Excel: revisar diferencias pequeñas de redondeo antes de considerarlas cambios de presupuesto. RevE incorpora columnas adicionales BC–BG de revisión/observaciones; no se mezclan con el precio vigente.

El SQL de carga con los precios y la comparación CSV se entregan privadamente al usuario; no se versionan importes en GitHub. Ejecutar el archivo `cargar-precios-rev01.sql` en SQL Editor de Supabase una sola vez. La operación es transaccional, reemplaza únicamente el catálogo y no modifica estados de pago. Crea RLS con lectura solo para editor/approver; las cuentas autenticadas no tienen escritura directa al catálogo. Verificar resultado 4044 y acceso de las dos cuentas antes del uso real. Esta carga requiere ejecución por el propietario del proyecto; no se ha realizado desde Codex.

Las 16 partidas exclusivas de RevE permanecen en la comparación para revisión; no se agregan al catálogo vigente por inferencia. La asignación de partidas a cada subcontratista no está documentada: el selector muestra el catálogo completo.
