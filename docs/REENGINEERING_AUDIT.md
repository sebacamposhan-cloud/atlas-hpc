# Auditoría de datos, geometría y experiencia — incremento sobre PR #1

Base inspeccionada: `07cecca`, rama `feat/cielos-navigation-association`. Árbol limpio antes de comenzar. Diez suites Node y el recorrido Chromium de Cielos pasaron como línea base. Las tres SQLite dieron integridad correcta y cero errores de claves externas. Los hashes previos están en `audit/baseline-hashes.json`.

Esta entrega cubre el diagnóstico estructural y una primera corrección funcional de datos, prioridad geométrica y leyenda. No completa la reingeniería ni la calibración de Cielos.

## Matriz de causas y acciones

| Problema | Archivos responsables | Evidencia e impacto | Acción de este incremento / continuación |
|---|---|---|---|
| 192 recintos parecen carecer de documentación | `layers.mjs`, `workspace.mjs`, `app.js` | Los 192 tienen rombo, seis campos y PDF. 161 tienen terminaciones cuyo catálogo no asigna asepsia; 29 incluyen código 15, porcelanato + pintura sin subtipo; uno indica N/A en los cuatro muros; uno incluye S/E. | Ficha con causa y fuente por recinto; nombre «Clasificación no determinada»; sin inventar categorías. |
| Guardar una ficha puede derivar asepsia de CIE/PAV | `web-store.mjs` | PATCH calculaba desde los seis campos aunque la regla documentada se refiere a M1–M4. | Derivación compartida limitada a M1–M4 en guardado y capas; regresión del guardado real con un código de pintura colocado en CIE. |
| Ausencia en JSON se presenta como ausencia documental | `disciplines.mjs`, `import-disciplines.py` | 329 observaciones CIE originales; el patrón numérico excluía 75 apariciones adicionales de 62 códigos ARQ exactos (CT., CU., RT., DI.). Solo una contiene códigos de cielo/luminaria cotejados. El importador obtiene texto/área/NCT y añade esos códigos exclusivamente al caso conocido. El texto de otras observaciones sí contiene números; no constituye por sí solo una asignación validada. | Siete estados documentales explícitos. Se incorporan las 75 observaciones omitidas como candidatos de revisión con hash/posición, sin asignarles superficies ni materiales. Extraer más atributos requiere revisar su posición y significado. |
| Contorno auxiliar tiene prioridad sobre técnico validado | `viewer.mjs` | Dos técnicos validados disponibles en el runtime inicial. RT.(-1)-10 tiene IoU 0,873 entre técnico y auxiliar; la banda izquierda quedaba fuera del clic. | Prioridad corrección manual → técnico validado → auxiliar → técnico pendiente sin auxiliar. Mismos anillos para resaltado e índice de clic. |
| Topología de superficies auxiliares inválida | `scripts/selection/build-selection.py`, `selection.json` | Cuatro auxiliares inválidos, 12 pares con intersección positiva entre geometrías válidas; nueve mayores que 1 unidad PDF². No son m². | Informe individual y geometrías pendientes visibles. No se reparan masivamente ni se certifican. Añadir validación posterior a simplificación/redondeo antes de regenerar. |
| Límites se basan en manchas de suelo/mobiliario | `scripts/selection/`, geometrías originales | 262 perímetros de suelo, 27 con huecos de mobiliario rellenados, 41 auxiliares manuales. 84/129 comparaciones técnico/auxiliar tienen IoU <0,9; ninguno de esos desacuerdos prueba cuál es correcto. | Evidencias de casos concretos. Revisión de espacios abiertos y agujeros antes de corregir; conservar originales. |
| Alias pueden consolidar observaciones sin revisión explícita | `app.js`, `initialize()` | 61 alias por mismo código/nombre y distancia de rótulo <5 unidades PDF. La regla no es una tabla de correspondencias aprobadas. | Evidencia por alias en el informe; no cambiar IDs ni fusionar nuevas entidades en este incremento. Siguiente paso: relación explícita y revisión de conflictos. |
| SQLite no es el backend del visor | `migrate-atlas.py`, `prepare-runtime.mjs`, `web-store.mjs` | 772 observaciones consolidadas coinciden exactamente con 443 ARQ +329 CIE. Runtime conserva metadatos ARQ. LocalStorage/IndexedDB son correcciones del dispositivo. | No hay una pérdida SQLite→JSON demostrada en los 772 registros originales. Los 75 candidatos nuevos se publican en una capa de revisión separada; no se consolidan en SQLite como asociaciones aprobadas. Mantener contratos y respaldos; diseñar publicación de revisiones antes de convertir SQLite en autoridad de escritura. |
| Migración de snapshots no actualiza observaciones ya importadas | `migrate-atlas.py` | `INSERT OR IGNORE` conserva datos anteriores; regenerar JSON y volver a migrar no actualiza la fila existente. | Registrar como límite del flujo; no sustituir por UPSERT destructivo. Requiere revisión versionada con historial y conflictos. |
| Cielos no tiene montaje continuo calibrado | `disciplines.json`, `disciplines.mjs`, `calibrate-sheets.py` | `transforms` vacío; ocho láminas independientes. Hay códigos repetidos y ejes candidatos, pero no puntos de control revisados. | Inventario de fuentes/solapes candidatos. No colocar imágenes como supuesto montaje; fase 3 pendiente. |
| Clearance: liberaciones MEP por grupo | PDF complementario y `supplemental-sources.mjs` | Una página, 141.988 trazados, cero palabras extraíbles; marcas C: repetidas y azul. El usuario confirmó que son grupos MEP liberados para cierre, sin unidades. | PDF original con hash accesible en Documentación, opcional offline. Sin asociación automática C:→ARQ. Actualización de liberaciones diferida por prioridad expresa del usuario. |
| Cerrar leyenda apaga colores | `workspace.mjs` | El antiguo handler `hidePaint` ponía `enabled=false`. | Minimizar independiente, indicador compacto de filtros y conteo, botones explícitos para colores y limpiar. |

## Cobertura documental y fuentes

El auditor coteja cada uno de los 443 códigos en su caja de rótulo y los 2.658 códigos de terminación en sus cajas PDF. Todos se encuentran, y las 2.658 entradas coinciden con el catálogo por documento guardado en SQLite. Las 443 derivaciones de asepsia coinciden con M1–M4. Los 443 rombos tienen imagen y seis campos.

Esto comprueba la extracción de códigos y su transporte, no valida automáticamente que todo nombre, superficie o asociación arquitectónica sea correcto. Nombres y superficies se conservan en SQLite/runtime sin diferencias; falta revisar individualmente su asociación visual. La extracción inicial ARQ no tiene aquí un proceso completo de reconstrucción desde cero comparable con el importador CIE. Las cinco etiquetas `:extra` existen en la consolidación web, no en las 438 filas históricas; no se trata de pérdida de registros.

El informe `audit/data-audit.json` contiene los 443 registros con cajas, texto leído, catálogo, fuente/hash, alias y causa individual de los 192 sin categoría. Los conteos permanecen **72 media, 66 baja y 192 no determinada**: la revisión no justifica reclasificar habitaciones ni añadir asepsia alta.

No se añadió una migración SQL redundante: `002_construction.sql` ya tiene fuentes, observaciones, materiales, transformaciones, evidencia, validaciones e historial. No se reescribió ninguna base. Una futura migración debe versionar el vínculo recinto/observación y publicar cambios revisados, no cambiar silenciosamente los payloads existentes.

Los 75 candidatos recuperados se generan con `scripts/extract-cie-review.py` en `dist/cie-review-observations.json`, se verifican contra fuente/hash/posición y se integran al visor junto con las 329 observaciones originales. El original `disciplines.json` y las bases se conservan. La coincidencia exacta permite encontrar el rótulo documental, pero no verifica el vínculo técnico con un recinto maestro. El inventario previo de omisiones está en `audit/cie-extraction-gaps.json`.

## Geometría: evidencia representativa

- **RT.(-1)-10**, `502-41a89a7c:r0013`: [PDF y superposición](audit/geometry-502-41a89a7c-r0013.png). Azul: técnico guardado; rojo: auxiliar. La banda izquierda junto al muro queda excluida por el auxiliar. Ahora se usa el técnico ya marcado como validado; no es una nueva certificación.
- **RT.(-1)-1**, `501-5016771b:r0010`: IoU 0,994; se respeta también el técnico validado. Ambos están en el runtime, por lo que no hace falta una descarga adicional para darles prioridad.
- **Recepción y Pesaje 8.2.4.1.1-1** y oficina contigua: [comparación](audit/geometry-505-49eb24e4-r0029.png). El técnico sigue manchas de mobiliario y el auxiliar introduce una separación recta sin muro físico. Ambos requieren una decisión documental sobre el espacio abierto; no se valida la frontera por proximidad.
- **Comedor 8.2.1.1.1-1**, `505-49eb24e4:r0024`: auxiliar con autointersección. Los otros tres IDs y coordenadas están en `audit/geometry-audit.json`.

Los 158 técnicos son topológicamente válidos, 126 tienen huecos y solo dos están marcados como validados. Los 330 auxiliares tienen cuatro entradas multipolígono y cinco con huecos (seis huecos en total). La validez topológica no demuestra concordancia con muros. El índice ahora no muta las geometrías recibidas, y la elección de autoridad conserva multipolígonos/huecos y correcciones manuales.

El inventario vectorial (`audit/vector-inventory.json`) confirma abundancia de segmentos y rellenos, mayormente sin capas semánticas distinguibles. Recuperar límites es viable como proceso de candidatos + revisión, no como lectura directa de un catálogo de habitaciones. La simplificación a 0,6, eliminación de componentes <3 y huecos ≤8, y redondeo a dos decimales se realizan después de la resta de solapes sin comprobación final de topología. Las cuatro geometrías publicadas inválidas prueban esa carencia; no se afirma haber aislado cuál de esas operaciones produjo cada defecto.

El editor existente conserva historial, reversión y huecos durante edición, pero bloquea la sustitución de auxiliares compuestos; no se implementó edición completa de multipolígonos ni validación de todos los vecinos. Esos trabajos siguen en fase 2.

## Clearance y calibración CIE

Archivo: `dist/source/cielos-s01-clearance.pdf`, SHA256 `e1cd1631d590dd7fc357d8d60b52c74cd2e24c23fe8c59290437a6221e72022c`, página única 842×1191 puntos, sin rotación. [Vista general](audit/clearance-overview.png) y [detalle central](audit/clearance-middle.png).

Visualmente corresponde a una planta general S01 con patios, circulaciones y recintos distribuidos como el conjunto de arquitectura; azul delimita regiones y magenta identifica «BAÑOS PREFABRICADOS». En el detalle se repiten C:81, C:20 y C:85 en regiones diferentes. El PDF no trae definición legible de esas marcas. El usuario aclaró en esta conversación que identifican grupos MEP (sin unidades) y que los mostrados están liberados para tapar a la fecha de entrega. Se registra esta interpretación con procedencia del usuario; el estado es una instantánea, no una autorización permanentemente vigente. No equivalen a códigos jerárquicos ARQ. La actualización de liberaciones queda al final por prioridad expresa del usuario; no se implementa todavía un flujo de aprobación ni se proyectan esos estados sobre recintos por proximidad.

Las ocho fuentes CIE y sus rotaciones/tamaños están inventariadas en `audit/cie-source-facts.json`. `audit/cie-overlap-candidates.json` registra coincidencias textuales entre láminas, por ejemplo 501–502 (5 códigos) y 507–508 (11). Son candidatos de cotejo, no puntos de control geométrico: etiquetas pueden desplazarse entre láminas. El contraste visual confirma una planta general frente a láminas parciales; no se han medido residuos sobre ejes homologados ni calibrado el clearance. Sector 504 y caso 7.1.2.1.2-1 son el siguiente piloto recomendado, con al menos tres controles no colineales revisados y controles adicionales independientes.

## Reproducción

```sh
/workspace/atlas-tools-venv/bin/python scripts/audit-data.py
/workspace/atlas-tools-venv/bin/python scripts/geometry-audit.py
node documentary-evidence-test.mjs
node geometry-authority-test.mjs
PLAYWRIGHT_MODULE=/workspace/atlas-browser-tools/node_modules/playwright-core/index.mjs CHROMIUM_PATH=/usr/bin/chromium node quality-browser-test.mjs
```

Los auditores leen SQLite en modo solo lectura o JSON/PDF y escriben informes, no fuentes ni geometrías. PyMuPDF y Shapely se necesitan solo en desarrollo. La publicación continúa siendo estática.

## Resultado ejecutado

Pasaron las 13 suites Node (nueve originales, modelo de disciplinas y tres nuevas de evidencia, autoridad geométrica y candidatos CIE). Pasaron `cielos-browser-test.mjs` y `quality-browser-test.mjs` en Chromium a 1440×1000 y 390×844 sin errores de página. La segunda prueba realiza clic real sobre la banda recuperada de RT.(-1)-10, confirma estado documental, conservación de 72 colores tras minimizar/zoom/cambio de sección, separación apagar/limpiar y consulta del código recuperado CT.F.(-1)-3 en CIE-504. Se verificaron los hashes de los 36 archivos protegidos iniciales y las tres SQLite sin cambios.

## Criterios de aceptación y continuidad

| Criterio | Cobertura de este incremento | Pendiente |
|---|---|---|
| A — Exactitud | Comparación de fuentes concretas, auditoría topológica total y regresión de autoridad/clic/huecos | Revisión y corrección técnica de todos los contornos, espacios abiertos, vecinos y edición multipolígono |
| B — Datos/rombos | 443 rótulos, 2.658 códigos, fuente/estado visible, transporte SQLite/runtime | Cotejo independiente de todos los nombres y superficies |
| C — Asepsia | Causas individuales de 192, regla M1–M4, sin nuevas categorías | Resolución documental de pintura no especificada |
| D — Filtros | Minimizar y navegar conserva colores/filtro; apagar y limpiar separados | Persistencia de filtros entre sesiones y panel lateral completo |
| E — Cielos general | Auditoría de fuentes, clearance disponible, navegación individual preservada | Montaje geométrico calibrado: **no implementado** |
| F — Caso conocido | Se conserva prueba CIE-504: 12,45 / 2,80 / 213 / L19 | No generalizar a otros recintos |
| G — Integridad | Comparación de hashes y pruebas existentes | Ensayo de respaldos reales de usuarios, no disponibles en este entorno |
| H — UX | Automatización Chromium escritorio/móvil | Safari/iPhone físico y modo avión real |

Orden de continuación: versionar revisión de asociaciones → corregir casos geométricos piloto con evidencia y reversión → calibrar CIE504 y láminas vecinas por ejes → extender montaje solo tras controlar residuos → panel de capas completo y aceptación física. MEP permanece sin fuentes completas; puertas sigue siendo piloto no fiable.
