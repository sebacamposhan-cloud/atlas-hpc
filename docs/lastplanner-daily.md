# Last Planner 4 — superficies y programación diaria

Implementación incremental sobre el asistente y el visor existentes. No se añade navegación ni otro Last Planner. La aplicación actual usa módulos JavaScript nativos; no se ha introducido React, TypeScript ni dependencias de ejecución adicionales.

## Cambios funcionales

- Cuatro pasos conservados. El paso Planificación contiene una franja lunes–domingo, un editor de equipo y un día activo. Fechas y semana proceden del período de la actividad.
- Varios equipos y empresas por día, personas variables, jornada completa/parcial u horas con duración de referencia explícita. Sábado y domingo admiten programación explícita dentro del período.
- Agregar, editar, quitar, copiar al día siguiente y repetir en días seleccionados o toda la semana. Copiar actualiza el mismo equipo/fecha; pide confirmación si ya hay asignaciones de destino. No duplica ese equipo.
- Navegación entre semanas del período. Cambiar fechas conserva las asignaciones; las que quedan fuera deben corregirse o quitarse mediante una acción confirmada antes de guardar.
- Una edición pendiente de equipo debe aplicarse o cancelarse antes de guardar o cambiar de paso. Cambiar de día pide confirmación si se descartaría esa edición.
- Catálogo mínimo de equipos reutilizado desde las asignaciones persistidas: identificador normalizado empresa/equipo, especialidad y responsable. Las empresas proceden de Subcontratos y registros existentes. La asistencia real ofrece los nombres de equipos programados como sugerencias, sin convertir programación en asistencia.
- Consulta de personal por fecha/equipo en las vistas y en Revisión; filtros de empresa participante y equipo. Coincidencias equipo/fecha se muestran como posibles conflictos, no como conflictos confirmados sin horarios.

## Visor y superficies

- Botones de tramos con orientación Norte, Sur, Este y Oeste (o diagonal/pendiente), estado seleccionado accesible y resaltado azul inmediato sobre la geometría real.
- Se reutilizan los identificadores de superficies, el editor de recintos y la capa existente. Al tocar una ubicación que ya tiene muros seleccionados no se reemplazan por un recinto completo.
- Brújula discreta tanto en selección como al consultar una actividad guardada. Se transforma con la matriz actual del SVG; se actualiza ante cambios de vista o transformación.
- Referencias HPC conservadas: N hacia A, S hacia W, E hacia 12 (cordillera), O hacia 1 (mar). Calibración por piso/fuente a partir de AA, AW, A1 y A12, con versión/origen existentes. Si no hay calibración válida, se informa expresamente.
- Un tramo de contorno sigue siendo una referencia pendiente de verificación física, no un muro BIM inventado. No se agregan alturas ni m² supuestos. Cantidades manuales y selecciones existentes se conservan.

## Productividad

- Capacidad = suma de las capacidades de cada asignación diaria, usando su rendimiento específico o la referencia de la actividad. Jornadas parciales y horas no se contabilizan como días completos.
- Se distinguen persona-jornada, persona-hora, cuadrilla-jornada y cuadrilla-hora. Una cuadrilla exige número explícito, composición documentada y confirmación del supervisor; el número de personas por sí solo no prueba esa composición.
- Se muestran recursos programados, producción estimada (o parcial/no disponible), compromiso, diferencia y recursos adicionales estimados cuando la referencia es homogénea. No se sobrescribe la dotación del supervisor.
- Una entrada manual queda identificada como «Estimación provisional del supervisor», con autor, fecha, valor y unidad. Los datos técnicos quedan en opciones avanzadas. Se conserva la referencia anterior de registros versión 1.
- Rendimiento observado: cantidad verificada / horas reales asignadas a la actividad cerrada. Se incluyen también horas asignadas sin un registro productivo asociado, evitando inflar el rendimiento al omitir jornadas improductivas. Se excluyen ejecuciones sustituidas, datos sin verificar y horas incompletas.
- El historial se reconstruye desde los registros existentes, sin duplicarlos en otra tabla. Compara partida confirmada, unidad, contratista real, equipos y condiciones registradas. Un resultado conjunto de varias empresas no se atribuye arbitrariamente a una sola.
- Se muestra tamaño de muestra y promedio ponderado. Con al menos tres antecedentes comparables puede aplicarse explícitamente una referencia observada por persona-hora; conserva IDs de actividades, rango, muestra y origen. No se convierte en un estándar aprobado ni reemplaza automáticamente referencias oficiales.

## Persistencia y datos

`planificacion` conserva `schedule` y `estimateReference` junto a la clasificación/productividad existente. Cada asignación tiene fecha, empresa, equipo, personas, fracción de jornada y, cuando corresponda, horas, duración de referencia, cuadrillas y rendimiento específico.

Se mantienen IndexedDB, cola de operaciones, Nube, permisos y RPC existentes. El mensaje de guardado local sigue distinguiéndose de la confirmación remota. La publicación congela también esta información; las modificaciones posteriores requieren la revisión autorizada existente.

Los compromisos de varias semanas mantienen el modelo actual de tramos vinculados: cantidades distribuidas por el supervisor y recursos filtrados a las fechas de cada tramo. El saldo reprogramado conserva el antecedente pero comienza sin asignaciones: no se trasladan trabajadores de fechas pasadas ni se altera el resultado original.

### Migración para una instalación existente

Ejecutar **`supabase/lastplanner-daily.sql`** en SQL Editor antes de desplegar. Es aditiva y repetible: añade validación de estructura, fechas, identificadores, duplicados, personas, horas y rendimientos específicos mediante un trigger en `atlas_lp_records`. No crea tablas ni elimina registros. La instalación completa `supabase/lastplanner-cycle.sql` ya incluye esta validación.

Después de fusionar la PR, publicar manualmente la última versión en Render. Este trabajo no ejecuta migraciones ni despliega en producción.

## Archivos

- Nuevos: `dist/lastplanner-daily.mjs`, `dist/lastplanner-daily-ui.mjs`, `supabase/lastplanner-daily.sql`, `lastplanner-daily-test.mjs`, `lastplanner-daily-sql-test.mjs`, este informe.
- Integración: `dist/lastplanner-resources.mjs`, `dist/lastplanner-workflow.mjs`, `dist/lastplanner-cycle-model.mjs`, `dist/lastplanner-wizard.mjs`.
- Geometría/interfaz: `dist/lastplanner-spatial.mjs`, `dist/lastplanner-intelligence.mjs`, `dist/lastplanner.mjs`, `dist/lastplanner-cycle.css`.
- Entrega/regresión: `supabase/lastplanner-cycle.sql`, `scripts/prepare-offline.mjs`, `dist/sw.js`, `render.yaml`, pruebas contextual/wizard de navegador e inteligencia.

## Verificación

- Cadena de Render: 38 comprobaciones aprobadas, incluidas regresiones de planos, pisos, puertas, protocolos, observaciones, Last Planner y Nube.
- Reglas diarias: cambio de mes/año, duplicados, fechas inválidas, dotación variable, jornadas parciales, unidades incompatibles, cuadrillas, distribución semanal, saldo y productividad verificada.
- PostgreSQL PGlite: migración diaria repetible, persistencia/edición y rechazo de registros inválidos. Suite SQL existente: 20 escenarios de RPC, RLS, concurrencia, publicación, cierre y saldo.
- Navegador Chromium: asistente/contextual en 320, 375, 390, 430, 768 y 1280 px. Selecciones reales de recintos/muros, sincronización plano/listado, brújula, siete días, dotación variable, copia, fin de semana, edición pendiente, cambio de semanas, guardado y recuperación. Sin desbordamiento de página; solo la franja puede desplazarse en el ancho mínimo.
- Prueba de ciclo completo: publicación, restricciones, dos muros, asistencia, ejecución 90/120, verificación del incumplimiento, saldo 30, Nube entre navegadores, edición sin red/conflictos y migración IndexedDB.
- Capturas generadas en `/tmp/atlas-wizard-<ancho>-<paso>.png` y `/tmp/atlas-contextual-<ancho>.png` durante QA; no contienen datos de producción.
- No hay compilación TypeScript en el frontend actual. Se ejecutaron verificaciones sintácticas Node y las comprobaciones reales del repositorio.

## Límites reales

No hay calendario de feriados/excepciones ni disponibilidad nominativa/horarios de equipos en los datos actuales: el supervisor programa explícitamente los días y jornadas; no se infiere asistencia, disponibilidad ni solapamiento confirmado. No se ha probado Safari en un iPhone físico: la prueba móvil utiliza Chromium con eventos táctiles.

Los planos 2D no verifican por sí solos alturas, existencia física ni composición de muros/cielos. Se mantienen las verificaciones y restricciones existentes. No se inventaron rendimientos aprobados. La productividad histórica por cuadrilla requiere composición y horas reales por cuadrilla que el seguimiento actual no documenta suficientemente; el historial calculado utiliza horas-persona verificables. La muestra observada y su rango no representan un intervalo estadístico de confianza ni un modelo predictivo validado.

La persistencia remota se probó contra PostgreSQL aislado y la API real del proyecto, no contra el Supabase de producción. La migración y la publicación en Render permanecen pendientes de aplicación.
