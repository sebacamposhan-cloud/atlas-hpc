# Last Planner: ciclo de producción integrado

Control de obra → **Last Planner** utiliza el visor de arquitectura, los recintos y la cuenta personal de Nube de ATLAS. Se amplía el módulo existente; no se agrega una aplicación ni una base local paralela.

## Uso

Antes de registrar, inicia sesión con tu cuenta personal mediante **Nube**. Sin sesión, «Nueva actividad» abre el inicio de sesión y continúa automáticamente al formulario después de entrar. La pantalla explica el acceso junto a los botones; las cuentas lectoras y las operaciones sin permiso permanecen protegidas.

1. **Planificación semanal:** crear un borrador con responsable, especialidad, contratista, fechas, cantidad y unidad. La semana ISO se deriva de las fechas (lunes a domingo); no existe un campo editable «Semana» en el formulario. La cabecera cambia al período guardado. Un trabajo que cruza semanas exige distribuir su cantidad entre tramos vinculados; la suma debe coincidir con el total. «Redistribuir grupo» permite ajustar los tramos mientras todos sean borradores.
2. **Ubicación:** «Seleccionar recintos en plano» habilita un modo de selección sobre el mismo SVG, motor de geometría y mosaicos del visor principal. Admite recintos y pasillos, pisos, múltiples selecciones, zoom, desplazamiento, gestos táctiles, aplicar/cancelar y etiquetas removibles. El formulario conserva sus datos al volver.
3. **Superficies:** elegir recinto, muros, cielos o pavimentos. En muros, tocar un recinto lo acerca y presenta sus tramos de contorno; se pueden seleccionar segmentos individuales o delimitar una intervención parcial. También se pueden dibujar áreas parciales, respetando los límites y huecos. La actividad guarda coordenadas, recinto, piso y referencia a la fuente.
4. Agregar restricciones previas con categoría, acción, responsable, departamento, fecha, ámbito, criticidad e intervención ITO. Se incorporan al mismo registro que se utiliza durante la ejecución.
5. **Publicar planificación semanal:** congela la versión original y genera una emisión auditable. Las modificaciones posteriores requieren permiso de revisión y motivo; conservan valores anteriores, autor y fecha. La unidad publicada se mantiene para poder comparar cantidades. No se cambia retrospectivamente una verificación final.
6. **Ejecución y seguimiento:** abrir la actividad ya publicada. Su checklist conduce a asistencia, avances, comprobación de mediciones, restricciones, evidencias y revisión. Los estados del checklist se calculan desde registros existentes.
7. Registrar personas presentes o ausentes por fecha y turno, con cuadrilla, jornada y asignaciones a una o varias actividades. El identificador personal debe ser estable; se normaliza el RUT con y sin puntos/guion. Las horas asignadas no pueden superar la jornada. La asistencia histórica a reuniones se conserva separada del control laboral.
8. Registrar **cantidades incrementales** ejecutadas, fechas reales, distribución por superficie, avance acumulado y asistencia vinculada. Se pueden delimitar los tramos reales en el mismo visor. Una corrección agrega un registro que sustituye al anterior, con motivo; conserva ambos en el historial.
9. Adjuntar fotos de cámara/galería o documentos a la actividad, recinto o superficie. Los archivos se guardan realmente, con fecha, autor y huella SHA-256; formatos JPEG, PNG, PDF, texto y DOCX, hasta 15 MB por archivo. Las imágenes se procesan mediante la función fotográfica existente.
10. **Revisión y cierre:** comprobar mediciones y registrar el resultado usando los datos diarios. Una cantidad parcial no cumple el compromiso. Al incumplir se exige causa principal y explicación; se admiten causas adicionales. El saldo puede reprogramarse una sola vez hacia una semana posterior. El cierre semanal exige que termine el domingo y que todas las actividades tengan revisión final.
11. **Resumen ejecutivo:** consulta de PPC, avance por unidad, asistencia diaria, dotación, restricciones, bloqueos, causas, responsables y evolución semanal. Incluye filtros por piso, fecha de consulta, especialidad, contratista y responsable. No contiene formularios de captura. Se conservan reporte imprimible con plano, exportación CSV y respaldo JSON con archivos.

## Reglas de cálculo y representación

- `02-11-2026` a `08-11-2026` corresponde a **2026-W45**. Se usa la misma regla ISO en cliente y PostgreSQL, incluidos cambios de año.
- **PPC:** actividades verificadas como cumplidas / todas las actividades publicadas del período. Los borradores no entran; las pendientes de verificación siguen en el denominador y se identifican por separado. Cada emisión conserva su base. Los datos `demo-` anteriores se conservan pero se excluyen de la operación y del PPC real.
- **Avance físico:** cantidades informadas y verificadas se muestran por separado. No se suman m² con ml, unidades u otras magnitudes. `90 / 120 m² = 75 %` físico, con resultado incumplido al vencer el plazo y PPC 0 para ese compromiso.
- Cumplir requiere cantidad original completa, plazo original, todas las superficies verificadas, ausencia de restricciones críticas pendientes y evidencia. Revisar una medición o registrar asistencia no genera cumplimiento automáticamente. Mientras siga vigente el plazo no se puede cerrar definitivamente como incumplida.
- Las restricciones pasan por Identificada, En gestión, Bloqueando ejecución, Liberada y Cerrada mediante transiciones auditadas. Si una PRE empieza a bloquear, se actualiza la misma identidad. Se conserva cada intervalo de bloqueo. Las críticas pendientes impiden iniciar o informar ejecución y muestran la advertencia correspondiente.
- El plano distingue pendiente, parcial, por verificar, verificado y bloqueo. Se superponen las geometrías **realmente registradas** en ejecución; seleccionar una superficie en planificación no la pinta como ejecutada. Un porcentaje sin delimitación real no inventa un límite parcial.
- Para medir se exige contorno con autoridad `validated`/`dwg_corrected` y escala documentada en `ejes.json`. Se calcula área de planta descontando huecos o longitud de segmento. No se infiere la altura de un muro ni el área real de un cielo inclinado. Los m² de pintura sin altura documentada se ingresan manualmente. El origen medido/manual queda guardado.
- Los tramos de muro proceden de los límites disponibles del recinto; no se presentan como elementos BIM individuales inexistentes. Los contornos auxiliares permiten localizar, pero no certifican dimensiones. Una fuente que cambió de SHA-256 no se superpone silenciosamente sobre un plano nuevo; el reporte identifica el cotejo pendiente.

## Activación de Nube y migración

Antes de desplegar esta versión, ejecutar **`supabase/lastplanner-cycle.sql`** en el SQL Editor del **mismo proyecto Supabase de Nube**, después de `supabase/campo.sql`. Es una migración aditiva y repetible: crea sus propias tablas, políticas, RPC y bucket privado; no borra tablas de ATLAS ni modifica los estados de pago.

Reutiliza `SUPABASE_URL`, `SUPABASE_ANON_KEY` y la sesión personal `atlas-nube-sesion`. No se requiere una service-role key ni compartir una contraseña de base de datos. El servicio Node verifica la sesión con Supabase; PostgreSQL aplica permisos y versiones aun al invocar directamente el RPC.

Tablas nuevas:

| Tabla | Contenido |
| --- | --- |
| `atlas_lp_records` | Actividades, emisiones semanales, restricciones, asistencia, evidencia y reuniones, con versiones |
| `atlas_lp_operaciones` | Recibos de operaciones para reintentos idempotentes |
| `atlas_lp_historial` | Auditoría inalterable de valores anteriores/nuevos con actor autenticado |
| Storage privado `atlas-lp` | Bytes de fotos y documentos, sin sobrescritura |

IndexedDB **`atlas-lastplanner` pasa de v1 a v2**, manteniendo las colecciones originales `actividades` y `reuniones`. Agrega restricciones, asistencias, semanas, evidencias, archivos, cola de sincronización y metadatos. Conserva el registro original, versión, autoría, resultados y cantidades históricas. No fabrica jornadas, fotografías ni cantidades desconocidas. Los compromisos anteriores obtienen una emisión histórica consultable. El respaldo anterior también puede importarse.

Cada operación local y sus archivos se guardan en una transacción junto con su envío pendiente. La sincronización se ejecuta desde Nube, respetando el orden de creación y la versión remota. Un envío repetido no duplica actividad, cantidad ni archivo. Ante un conflicto se conserva el lote local y se informa; **no hay fusión automática de cantidades o compromisos**. Descargar el respaldo y cotejar las versiones antes de resolver administrativamente el conflicto. La importación es aditiva y rechaza versiones distintas o archivos alterados sin reemplazar los datos locales. Cada lote admite hasta 500 registros nuevos y 10 MB de metadatos (2 MB por registro), además de sus archivos. Una semana cerrada conserva también la jornada de asistencia y sus horas; puede agregarse una asignación abierta sin alterar esos valores.

Si falta la migración o la configuración de Supabase, la interfaz muestra el error de Nube y conserva lo guardado localmente. El almacenamiento entre equipos solo queda operativo después de ejecutar el SQL y desplegar el servidor de esta versión. Para seleccionar planos sin red se debe descargar previamente el paquete de planos desde «Sin conexión».

### Permisos

Se reutilizan `app_metadata.campo_role`: `lector` consulta y `editor` puede operar. Opcionalmente, una lista `app_metadata.lastplanner_permissions` limita al editor a operaciones concretas:

`draft`, `publish`, `execution`, `attendance`, `restriction`, `evidence`, `verify`, `close`, `revision`.

Sin lista explícita se conservan los permisos del editor existente. La restauración/migración histórica exige `revision`. Después de cambiar metadatos de cuenta, renovar la sesión para recibir los permisos nuevos. No se solicita escribir nuevamente el nombre del usuario.

## Archivos principales

| Grupo | Archivos |
| --- | --- |
| Reglas y compatibilidad | `dist/lastplanner-cycle-model.mjs`, `lastplanner-geometry.mjs`; se conserva `lastplanner-model.mjs` |
| Formularios, cuatro áreas, gráficos y reportes | `dist/lastplanner-workflow.mjs`, `lastplanner-report.mjs`, `lastplanner-cycle.css` |
| Visor existente y geometrías | `dist/app.js`, `lastplanner-spatial.mjs`, `lastplanner-map.mjs`, `lastplanner.mjs`, `workspace.mjs` |
| Persistencia y sesión | `dist/lastplanner-store.mjs`, `lastplanner-cycle-store.mjs`, `lastplanner-session.mjs` |
| Nube | `dist/lastplanner-sync.mjs`, `dist/nube.mjs`, `server/lastplanner.mjs`, `server/groq-server.mjs` |
| Base y distribución sin conexión | `supabase/lastplanner-cycle.sql`, `scripts/prepare-offline.mjs`, `dist/sw.js`, `dist/index.html` |

ATLAS conserva sus módulos ES existentes; este cambio no agrega un framework ni reescribe los demás módulos.

## Verificación

Las pruebas operan con datos de ensayo en contextos aislados. No se envían registros de prueba al proyecto de producción.

```sh
node lastplanner-cycle-test.mjs
node lastplanner-api-test.mjs
```

La prueba PostgreSQL y el recorrido completo de navegador requieren herramientas de desarrollo externas al servidor productivo:

```sh
npm install --prefix /tmp/atlas-lp-test-tools @electric-sql/pglite@0.3.14 playwright-core
PGLITE_MODULE=/tmp/atlas-lp-test-tools/node_modules/@electric-sql/pglite/dist/index.js node lastplanner-sql-test.mjs
PGLITE_MODULE=/tmp/atlas-lp-test-tools/node_modules/@electric-sql/pglite/dist/index.js PLAYWRIGHT_MODULE=/tmp/atlas-lp-test-tools/node_modules/playwright-core/index.mjs CHROMIUM_PATH=/usr/bin/chromium node lastplanner-browser-test.mjs
PGLITE_MODULE=/tmp/atlas-lp-test-tools/node_modules/@electric-sql/pglite/dist/index.js PLAYWRIGHT_MODULE=/tmp/atlas-lp-test-tools/node_modules/playwright-core/index.mjs CHROMIUM_PATH=/usr/bin/chromium node lastplanner-login-browser-test.mjs
```

El proveedor de prueba usa **PostgreSQL real en PGlite** para tablas, RLS, transacciones y el RPC; sustituye los endpoints de Supabase y el transporte de Storage. No certifica la configuración del proyecto Supabase de producción. La interfaz se prueba en Chromium real de escritorio y en viewport móvil táctil 390 × 844; no sustituye una comprobación final en Safari de un iPhone físico.

| Prueba solicitada | Cobertura ejecutada |
| --- | --- |
| 1. Semana automática | W45 del 02–08 de noviembre; cambios de año ISO; sin campo manual |
| 2. Selección espacial | Tres recintos reales del Nivel −1, incluyendo circulación/pasillo, clics sobre el índice geométrico existente |
| 3. Pintura parcial | Un recinto, dos muros; delimitación de un tramo real parcial |
| 4. Persistencia | Guardado, recarga, reapertura, respaldo con archivos y restauración repetible; rechazo de bytes alterados |
| 5. Restricción previa | PRE en borrador y ficha de ejecución; misma identidad al convertirse en bloqueo |
| 6. Bloqueo durante | Humedad asociada a la actividad y al muro seleccionado |
| 7. Asistencia | Una persona en dos actividades, un solo registro; formatos equivalentes de RUT |
| 8. Avance parcial | 90/120, 75%; rechazo de cumplimiento antes de comprobar el 100% |
| 9. Reprogramación | Solo 30 m²; relación con el compromiso e incumplimiento anterior intactos |
| 10. Resumen | Indicadores con datos operativos, cierre, reporte y sincronización entre dos navegadores |
| 11. Móvil | Selección táctil, formularios, checklist, asistencia, evidencia, guardado y cierre |
| 12. Integridad | Batería `buildCommand` de Render, rutas/sesión, migración local v1, y prueba de Puertas en escritorio/móvil |

Las pruebas antiguas `room-progress-browser-test.mjs`, `source-contours-browser-test.mjs` y `floor-explorer-browser-test.mjs` todavía esperan controles anteriores a cambios ya presentes en `main` (`room-progress`, `geometryAuthority`, dos pisos habilitados). Se ejecutaron y fallan por esas expectativas obsoletas; no se cuentan como verificaciones aprobadas. La batería de despliegue, los tests nuevos del ciclo y el navegador de Puertas sí se ejecutan contra la interfaz actual.

Queda aplicar el SQL en el proyecto real y desplegar esta rama mediante la revisión de GitHub/Render. No se han modificado los datos de producción ni se ha desplegado automáticamente.
