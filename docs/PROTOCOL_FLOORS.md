# Protocolos según el piso activo

Control de obra → Protocolos de la matriz abre por defecto **Abiertos** del piso elegido. Los totales de cabecera y estados, las especialidades, los tipos de protocolo, sus registros y el análisis de críticos usan ese mismo piso. Cambiar el estado permite consultar cerrados/nulos de ese piso. Limpiar filtros y volver desde otro piso no amplían la consulta al edificio completo.

| Piso Atlas | NIVEL del Excel | Registros del piso, todos los estados | Abiertos exclusivos | Abiertos compartidos | Abiertos mostrados | Críticos al 27-10-2026 |
|---|---|---:|---:|---:|---:|---:|
| −1 | S01 | 2736 | 297 | 27 | 324 | 120 |
| 1 | N01 | 2260 | 230 | 29 | 259 | 134 |
| 2 | N02 | 1496 | 221 | 44 | 265 | 117 |
| 3 | N03 | 1405 | 203 | 15 | 218 | 101 |

Fuente: Matriz Control De Protocolos REV1 - HPC.xlsx, corte 26-10-2026. Los estados siguen siendo los de esa instantánea; la fecha de evaluación de antigüedad es configurable. Crítico significa abierto sin fecha de cierre y con más de un año calendario desde su elaboración. No representa avance físico instalado.

## Referencias compartidas

Se normalizan mayúsculas, espacios y ceros iniciales: `S 0 1` → `S01`. Los niveles de un campo compuesto se interpretan solo como referencias explícitas. `S01-N01` pertenece a ambos pisos y se señala como **Compartido**. `N01-N09` no se atribuye automáticamente a N02…N08: el Excel no determina si el guion significa rango continuo o referencias a extremos. `N3P`, `Varios`, campos vacíos y otras denominaciones no se asignan a ninguno de los cuatro pisos.

Los registros que únicamente refieren N05, N06, N07, N08, etc. quedan fuera de las vistas de estos pisos. Un protocolo compartido que sí menciona el piso activo conserva su referencia completa en el listado. Un registro aparece una sola vez dentro del piso, aunque contenga referencias repetidas. No deben sumarse los cuatro totales como si fueran un total de registros únicos del edificio: los compartidos pueden aparecer en más de un piso.

## Integración y conservación

`dist/protocol-scope.mjs` centraliza la correspondencia y la selección. El importador agrega en cada tipo del catálogo los conteos correlacionados por nivel, estado y especialidad (`facets`). Permite calcular los contadores y desplegables sin cargar los 20.233 registros ni leer el Excel en el navegador. Solo se descarga el detalle del tipo elegido. Los conteos derivados se contrastan con todas las filas fuente en las pruebas.

Las 154 colecciones de registros, el índice original de abiertos, el Excel y las bases SQLite permanecen sin cambios. Solo se amplía el catálogo derivado. La comprobación global del Excel sigue accesible en el desplegable de fuente, claramente identificada como global. Los estados de avance, las geometrías y los marcados no se modifican.

Las preferencias de matriz y críticos se guardan por piso. Las preferencias globales antiguas se ignoran para evitar restaurar, por ejemplo, un filtro N08 en S01. Al abrir la matriz se vuelve a Abiertos; los demás criterios compatibles pueden conservarse dentro de su piso. Los enlaces desde un gráfico crítico llegan a la fila fuente conservando su ámbito.

## Pruebas

- `node protocol-scope-test.mjs`: mapeo de los cuatro pisos, espacios/ceros, referencias compuestas, no inferencia de niveles intermedios, reconstrucción de todos los conteos desde 20.233 filas, filtros de estado y totales críticos.
- `python protocol-import-test.py`: importación reproducible y aislamiento ante fuente inválida; original sin cambios.
- `node protocol-matrix-test.mjs` y `node critical-protocol-test.mjs`: evidencia original, filtros, fechas y criterio crítico.
- `protocol-floor-browser-test.mjs`: cuatro pisos en 1440×1000 y 390×844; selección de tipos, filas, contadores, gráficos, limpieza y separación de preferencias entre pisos.
- `protocol-matrix-browser-test.mjs` y `critical-protocol-browser-test.mjs`: detalle, estados/fechas, paginación, enlace a fila exacta, errores recuperables, respuestas tardías y recarga offline. Incluye cambiar el estado mientras el detalle aún carga.
- Comando de build de Render con la nueva prueba de ámbito incluida.

Navegador: `PLAYWRIGHT_MODULE=/workspace/atlas-browser-tools/node_modules/playwright-core/index.mjs node <archivo-browser-test.mjs>` con Chromium instalado.
