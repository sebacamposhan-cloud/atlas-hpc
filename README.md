# Pisos

Todos los pisos comparten visor, fichas, búsqueda, edición, exportaciones, respaldos y modo sin conexión. La navegación principal tiene dos apartados: Control de obra y Explorador de planos. La raíz `/` abre cuatro tarjetas en una cuadrícula de 2 × 2: pisos −1, 1, 2 y 3, cada uno con su propio plano. El botón «Pisos» y la navegación «Explorador de planos» permiten regresar a las tarjetas.

| Piso | Dirección | Datos | Fuente |
|---|---|---|---|
| Nivel −1 | `/?nivel=N-1` | `dist/runtime.json` | 9 láminas PDF; rombos, Cielos y Pavimentos |
| Nivel 1 | `/?nivel=N01` | `dist/n01/` | 9 láminas DWG (A-501 a A-508 y A-510; falta A-509): plano por capas, rombos y contornos (`scripts/dwg-plano/`, `scripts/import-dwg.mjs`) |
| Nivel 2 | `/?nivel=N02` | `dist/n02/` | Recintos y monografía de la planta DWG (8 láminas, `scripts/import-n02.mjs`); plano por capas dibujado desde esas láminas (`scripts/dwg-plano/`) |
| Nivel 3 | `/?nivel=N03` | `dist/n03/` | 7 láminas DWG (A-502 a A-508; falta A-501): plano por capas, rombos y contornos (`scripts/dwg-plano/`, `scripts/import-dwg.mjs`) |

- **Capas del dibujo.** En los cuatro niveles (−1, 1, 2 y 3), el botón «Capas» de la barra del plano apaga el relleno de pasillos y zonas, el mobiliario y los equipos, y los ejes de grilla. La elección se guarda en el equipo y vale para todos los pisos.
- **El nivel −1** se dibuja desde sus láminas DWG (A-501…A-508, A-511, A-512) en el mismo marco que su plano PDF anterior. Sus recintos, contornos, rombos y correcciones siguen en su lugar: el error mediano del calce es 0,5 cm. Ver `scripts/s01-plano/LEEME.md`.
- **Recintos de los niveles 1 y 3.** El contorno se obtiene rellenando desde el rótulo entre muros, puertas, ventanas y pilares, y se valida contra la superficie del PMA:
  - Nivel 1: 286 contornos, 9 parciales y 64 superficies auxiliares de 359 recintos.
  - Nivel 3: 233 contornos, 4 parciales y 71 superficies auxiliares de 308 recintos.
  - Las superficies auxiliares corresponden a recintos abiertos, como circulaciones, estaciones o halls.
  - La monografía sale del rombo de la lámina; si la lámina no trae rombo, sale del PMA.

- La lista de pisos vive en `dist/pisos.js`; `dist/level.mjs` expone el piso activo a los módulos.
- Las correcciones y respaldos se guardan por piso. El nivel −1 conserva las claves originales.
- El nivel 2 usa la misma escala que el −1 (puntos PDF 1:50). Sus contornos vienen del DWG; tiene rombos reconstruidos desde sus bloques documentales, pero no láminas de Cielos/Pavimentos cargadas. Esas dos pestañas indican «Sin lámina».
- El plano de fondo del nivel 2 se dibuja desde sus 8 láminas DWG en el marco de sus recintos (`scripts/dwg-plano/LEEME.md`). La planta PDF (`dist/source/n02-planta-arquitectura.pdf`) se conserva como documento.
- Los rombos del nivel 2 se leen de las 8 láminas DWG 1:50 (286 recintos; la zona 8.2.3 de A-501 no los dibuja) y se ven en el plano donde los dibuja la lámina; la monografía de la ficha sale de esos rombos.
- 23 recintos abiertos no tienen todos sus lados dibujados en las fuentes: su contorno se cierra con tramos rectos (o una superficie auxiliar de selección) y queda marcado como aproximado.
- `/n02/` redirige a `/?nivel=N02` y conserva el enlace a un recinto (`/n02/#código`).
- Enlaces directos: `/?nivel=N02#4.4.1.3.1-10` abre la ficha de un recinto.

La entrada `dist/floor-explorer.mjs` carga las cuatro vistas generales y pospone `app.js` hasta seleccionar un nivel. Volver a las tarjetas y reabrir el mismo nivel conserva zoom, selección y datos en memoria. Cambiar a otro nivel sigue abriendo el visor existente mediante su URL: no se mantienen varios visores ni se cargan todas las teselas en segundo plano. Los enlaces anteriores por código y módulo siguen funcionando. La búsqueda queda deshabilitada hasta terminar la inicialización para no perder consultas durante la carga.

Dentro del visor, los accesos horizontales abren Arquitectura, Cielos y Pavimentos con sus controles originales. Muros activa las terminaciones sobre Arquitectura: no representa una lámina nueva. Los filtros se abren desde el botón a la derecha del plano; el botón «Capas» solo enciende o apaga capas del dibujo. Los gráficos están dentro de Control de obra, que abre con una tarjeta por panel (mismo formato que los pisos); dentro de un panel, «Todos los paneles» vuelve a las tarjetas y la fila superior cambia de panel. Seleccionar una categoría documental destaca sus recintos reales. La navegación bloquea la salida si hay edición pendiente; los formularios de especialidad permiten descartar cambios explícitamente.

Validación de navegación: `PLAYWRIGHT_MODULE=<ruta-a-playwright-core> node floor-explorer-browser-test.mjs`. Cubre 1440/390/320 px, ausencia de carga del visor en portada, niveles reales, reutilización del mismo piso, historial, enlaces de recinto, pestañas, filtros desde gráfico y formularios pendientes. `node pisos-test.mjs` valida el catálogo y los archivos offline. El manifiesto se regenera con `node scripts/prepare-offline.mjs`; Render también lo regenera al construir, porque en Windows los saltos de línea cambian el tamaño de los archivos y el manifiesto dejaría de calzar.

Para sumar un piso desde sus láminas DWG, sigue `scripts/dwg-plano/LEEME.md` (extraer, recintos, mosaicos e `scripts/import-dwg.mjs`). Después agrega una línea en `dist/pisos.js`, en `otherLevels` de `server/groq-server.mjs` y en `pmaLevels` de `dist/pma-model.mjs`, y ejecuta `node scripts/prepare-offline.mjs` y `node pisos-test.mjs`.

## Observaciones en terreno con fotos

Desde la ficha de cualquier recinto, «+ Observación con foto» abre la cámara del celular (solo cámara, fotos tomadas en el lugar) y registra qué se observa, terminación, categoría, prioridad, responsable y plazo. Tocando el recinto se ven sus observaciones con las miniaturas de sus fotos.
- **Seguimiento:** Abierta → En corrección → Corregida (con foto «después» o comentario) → Cerrada, con historial completo.
- **Control de obra → Observaciones en terreno:** pendientes, vencidas, corregidas por verificar y cierres, pendientes por responsable, filtros, capa del plano y respaldo JSON para llevarlas a otro equipo.
- **Se guardan en el equipo** y, con la sesión de **Nube**, se sincronizan con los demás equipos. [Uso y límites](docs/OBSERVACIONES_TERRENO.md).

## Nube de proyectos y observaciones

Botón **Nube** en la cabecera: con la cuenta personal de Atlas (Supabase) los proyectos y las observaciones con fotos se sincronizan entre equipos y no se pierden al cerrar la app ni al actualizar el código. Sin red todo sigue guardándose en el equipo y se sube después. Activación (SQL, permisos y Render) y reglas de conflicto: [docs/NUBE_CAMPO.md](docs/NUBE_CAMPO.md).

## Avance por recinto · piloto nivel −1

Control de obra → **Avance por recinto** sigue 330 recintos y 1.940 partidas PMA aplicables: instalación, condición, faltantes, observaciones, responsable, fecha e historial. Se registra desde Control o la ficha del plano. Gráficos de instalación, conformidad, avance por partida y pendientes por sector; filtros por asepsia, sector y estado. Datos locales al dispositivo con respaldo/importación y funcionamiento offline. [Alcance y validación](docs/ROOM_PROGRESS.md).

## Avance valorizado por partida · piloto nivel −1

Control de obra → Avance valorizado y la ficha de cada recinto: los 414 recintos A-S01 del PMA RevB reciben sus partidas del itemizado (Formulario n°11A) según terminaciones y asepsia, con cadena de protocolos previos (una partida no se aprueba sin su previo liberado). Estado, %, conformidad, faltantes y observaciones con fecha y autor. Valor ejecutado = superficie PMA × % × precio unitario; totales por partida, recinto, asepsia y piso; cinco gráficos de decisión y capa «Avance de obra» en el plano. El itemizado con precios se carga en el dispositivo y no se publica. [Reglas, cadena, gráficos y listas para revisar](docs/AVANCE_VALORIZADO.md).

## PMA de terminaciones RevB

Control de obra → **PMA de terminaciones** incorpora los 3.107 registros del Excel, sus revisiones de pavimentos/cielos/muros, filtros, gráficos y detalle con hoja/fila. Las fichas del plano muestran un desplegable PMA para cotejar terminaciones y superficies declaradas. Los conflictos de nivel/eliminación se señalan sin sobrescribir rombos ni contornos. Original intacto, catálogo offline y SQLite documental independiente: [alcance, datos y verificación](docs/PMA_REVB.md).

## Control de obra y filtros del plano

- **Control de obra** abre por defecto Protocolos de la matriz, con la matriz Excel incorporada. Ese panel junta dos vistas, **Matriz** y **Críticos · más de un año**. **Avance por recinto** junta **Por recinto** y, en el nivel −1, **Avance valorizado**. El panel Avances y protocolos se retiró; sus registros locales no se borran. Características del piso también se retiró (28 de octubre de 2026, decisión del jefe de producción); los atributos documentales del piso siguen en el plano desde **Filtros**. Estados de pago se eliminó de la app el mismo día: es información sensible y sujeta a negociación, y no debe estar donde entra todo el personal de terreno. Detalle en [docs/PAYMENTS.md](docs/PAYMENTS.md). El antiguo Dashboard deja de ser un apartado principal.
- Los gráficos de torta muestran estados técnicos y cierres administrativos de los protocolos registrados. Las barras muestran zonas y su último estado por dimensión. Seleccionar un estado consulta sus registros. Sin datos se muestra «Sin registros»; no se calcula avance de producción ni cumplimiento contra un total no documentado.
- **Filtros**, en la barra derecha del visor, permite buscar recintos y categorías, sumar categorías dentro de una familia y cruzarlas con otras familias, asepsia, sector o revisión. Se mantiene el zoom mientras se ajustan filtros; el panel conserva la selección al cerrarlo y abrirlo de nuevo. En móvil se adapta a un panel compacto.
- Gestión de recintos y Documentación y fuentes dejan de aparecer en la navegación. Las fichas conservan sus referencias; los respaldos están disponibles desde Filtros → Colores y respaldo. Los enlaces anteriores por módulo siguen siendo compatibles.
- Los colores y la procedencia de las leyendas siguen usando el modelo anterior. No se modifican datos fuente, SQLite ni geometrías.

Detalles, capturas y validación en [PLAN_FILTERS_CONTROL.md](docs/PLAN_FILTERS_CONTROL.md). Pruebas nuevas: `node work-charts-test.mjs` y `PLAYWRIGHT_MODULE=<ruta-a-playwright-core> node plan-filters-browser-test.mjs` (incluye recarga y uso sin conexión).

## Protocolos de la matriz REV1

Control de obra → **Protocolos de la matriz** permite desplegar especialidades, buscar y seleccionar un proceso, consultar folios y abrir su ficha documental. Incluye los **20.233 registros, 154 códigos y 38 agrupaciones textuales de especialidad** de la hoja principal, con corte del Excel al 26-10-2026. Pintura de asepsia baja/media y planchas XR-RH se encuentran por sus nombres y códigos originales.

El detalle se carga por código bajo demanda y se pagina en 25 filas. Estado, nivel, persona que recibe y búsqueda filtran el proceso seleccionado. La selección y los filtros se recuerdan en este navegador; los registros locales de obra se conservan aparte. El original puede descargarse íntegro y forma parte de la descarga opcional de originales offline.

El recuento normalizado da 5.678 abiertos, frente a 5.675 del resumen: tres estados tienen espacios finales. Se conservan esos valores originales y las 17 combinaciones repetidas de código/folio; cada fila mantiene su identidad y procedencia. No se asignan las letras de RECINTOS a geometrías ni se transforma CERRADO en aprobación técnica.

Fuente: `dist/source/matriz-control-protocolos-rev1-hpc.xlsx`. Para regenerar los derivados, ejecutar `python scripts/import-protocol-matrix.py`, `node scripts/prepare-offline.mjs` y `node protocol-matrix-test.mjs`. Detalle de esquema, actualización y pruebas en [PROTOCOL_MATRIX.md](docs/PROTOCOL_MATRIX.md).

## Fechas y protocolos críticos

En Protocolos de la matriz se puede filtrar por elaboración o cierre con límites Desde/Hasta inclusivos. «Pendiente de cierre (abiertos)» es una vista de ABIERTO, ya que la fuente no contiene un estado PENDIENTE. «Cerrados (incluye autocontrol)» agrupa ambos estados de cierre sin modificar las filas originales.

**En el plano por ejes (pisos −1, 1, 2 y 3):** al elegir un protocolo, **Ver en el plano** encuadra cada folio entre sus ejes (por ejemplo, «AD-AG/A3-A5»). Cada folio lleva su número (001, 002…), cualquiera sea su estado. Los anulados no se dibujan: se listan a la derecha. [Detalle](docs/PROTOCOL_MATRIX.md#ubicación-en-el-plano-por-ejes).

Control de obra → Protocolos de la matriz → **Críticos · más de un año** muestra abiertos con fecha de elaboración válida, sin dato de cierre y con más de un año calendario a la fecha de evaluación. El aniversario exacto no es crítico. El análisis usa Hoy en America/Santiago por defecto; permite una fecha personalizada y distingue el estado de la matriz al corte de la antigüedad calculada.

Incluye barras por proceso, torta por tramos y listado paginado con acceso al folio/fila original. Filtros de especialidad, nivel, recibe y elaboración acotan el análisis. Pulsar un proceso o registro abre la consulta de la matriz con el mismo criterio de criticidad, fechas y alcance. Los abiertos sin fecha válida se cuentan aparte.

Con la fuente actual y evaluación al **27-10-2026**: **2.045 registros críticos**, 5.678 abiertos y **1.495 abiertos sin elaboración válida**. El gráfico cuenta filas y conserva folios repetidos. No se infieren fechas ni se escriben estados críticos en Excel.

Detalles y capturas: [CRITICAL_PROTOCOLS.md](docs/CRITICAL_PROTOCOLS.md). Tests: `node critical-protocol-test.mjs` y `PLAYWRIGHT_MODULE=<ruta-a-playwright-core> node critical-protocol-browser-test.mjs`.

## Editor de contornos (herramienta interna)

Para corregir a mano los contornos de los recintos sobre las líneas del DWG, con pinzamientos como en AutoCAD, OSNAP, orto, dibujar, partir y simplificar. Corre solo en el PC de desarrollo (`node scripts/editor-contornos/servidor.mjs` → http://127.0.0.1:8012/) y no se publica. Guarda `dist/<piso>/contornos.json`, que la app aplica sobre los contornos originales. Uso y reglas: [scripts/editor-contornos/LEEME.md](scripts/editor-contornos/LEEME.md). Prueba: `node contornos-test.mjs`.

## Liberación de frentes (archivado)

El semáforo de liberación por recinto se retiró de la app el 28 de octubre de 2026. El código, el Excel de ejemplo, los estilos, su prueba y los pasos para volver a activarlo están en [archivo/semaforo-liberacion/](archivo/semaforo-liberacion/LEEME.md). Esa carpeta no se publica ni entra al paquete sin conexión.

# ATLAS HPC 3 — incremento multiespecialidad

Edición 2D sobre PDF original con Leaflet + Geoman Free: uso, pruebas y despliegue en [docs/CONTOUR_EDITOR.md](docs/CONTOUR_EDITOR.md).

Colores de leyenda y selección visible: [docs/LAYER_COLORS.md](docs/LAYER_COLORS.md).

Ver `docs/ATLAS_PROGRESS.md` para alcance probado y limitaciones, y `docs/ATLAS_ROADMAP.md` para continuidad. No se considera completada toda la orden maestra.

# Atlas HPC 2.0

Modernización incremental: cinco módulos, capas documentales, tabla maestra, gráficos vinculados, deshacer/rehacer y recuperación IndexedDB. Auditoría, decisiones y límites en `docs/ATLAS_2_AUDIT.md`. Los límites técnicos pendientes siguen pendientes.

# Atlas HPC · Versión web

Visor web del nivel −1 del Hospital Provincia Cordillera. Se usa desde el navegador sin instalar Python, Node ni otras herramientas. Las nueve fuentes forman un plano continuo recortado al área A–W / 1–12, con búsqueda y ficha por recinto.

## Consulta del plano

- Plano base monocromático, sin marcadores circulares. Pulsar dentro de una superficie abre su ficha; arrastrar mueve el plano.
- 330 recintos únicos dentro del área solicitada tienen superficies auxiliares de selección. La ficha conserva nombre, código, seis terminaciones, rombo original y referencia documental.
- Cinco etiquetas cuyo nombre ocupaba varias líneas se recuperaron de las fuentes. El conjunto contiene ahora 443 etiquetas documentales, antes de consolidar solapes y aplicar el recorte.
- Panel lateral en escritorio y ficha inferior ampliable en móvil. Búsqueda por nombre, código, materiales y consultas compatibles; filtros plegables, aislamiento, documentos, resumen y exportaciones PDF/XLSX.

## Rendimiento

El plano general monocromático de 158 kB aparece desde el HTML inicial, mientras se abren las fichas. Los datos de apertura pasan de 1.896.014 a 378.217 bytes (80 % menos); es una reducción de datos, no una medición de velocidad en iPhone. Una sola descarga compacta conserva la información documental de los 443 registros y las 330 superficies de selección. Los contornos técnicos completos se cargan al editar, desde nueve archivos separados, sin pérdida de coordenadas.

El visor carga únicamente las teselas visibles del nivel de detalle necesario y retira todas las que quedan fuera de pantalla. Reutiliza las imágenes visibles sin buscarlas repetidamente en el documento. El desplazamiento y el gesto de dos dedos calculan la transformación una vez al comenzar; los movimientos usan operaciones aritméticas y se agrupan en un solo cambio por cuadro. Al levantar un dedo se puede seguir desplazando con el otro sin volver a tocar. La navegación no renderiza los PDF ni aplica filtros SVG de escala de grises. Las superficies se consultan mediante un índice espacial. La selección reutiliza las rutas y la lista de recintos; solo actualiza la ficha y el resaltado. Las bibliotecas de exportación se cargan cuando se solicitan. Si falla la carga inicial, aparece Reintentar en lugar de quedar esperando indefinidamente.

## Uso sin conexión

1. Abrir el sitio publicado con conexión en Safari o Chrome. En iPhone/iPad se recomienda Compartir → Añadir a pantalla de inicio y abrir Atlas desde ese icono antes de descargar.
2. Abrir «Sin conexión» y pulsar «Guardar plano y fichas» (aproximadamente 23,6 MB). Mantener Atlas abierto hasta «Listo para usar sin conexión».
3. Mover y ampliar el plano, buscar, seleccionar recintos, consultar rombos, editar contornos y exportar fichas/plano/Excel desde la copia local. No hace falta descargar los PDF para la consulta habitual.
4. Opcionalmente, guardar las nueve láminas PDF originales y su visor (aproximadamente 29,9 MB). Esta descarga también permite recalcular el recorte de un rombo si se cambia su región original.

La descarga muestra progreso, admite pausa y continúa con los archivos faltantes. El estado listo se calcula a partir de los archivos realmente guardados. Las descargas y la caché trabajan en un service worker, con un máximo de tres peticiones simultáneas. El núcleo inicial automático ocupa unos 635 kB; el plano completo se descarga por elección del usuario. Al abrir después, el visor usa primero la copia local y recupera el registro offline existente sin esperar otra petición de registro. Al volver de otra aplicación comprueba de nuevo el estado guardado.

Las nuevas versiones se activan con «Actualizar versión». Si la pestaña conserva una interfaz antigua, abrir `/actualizar.html` con conexión después de desplegar esta página de recuperación. No borra correcciones ni descargas. El panel también permite buscar actualizaciones y muestra su preparación. Si había paquetes completos guardados, se preparan en la versión nueva antes de permitir activarla: los archivos idénticos se reutilizan y solo se descargan los que cambiaron. Una actualización que falla deja la versión anterior y su descarga disponibles. Los paquetes que nunca se descargaron siguen siendo opcionales.

La copia pertenece al navegador o instalación donde se descargó: Safari, el icono de inicio y la vista interna de otra aplicación pueden tener almacenamiento distinto. No se promete conservación indefinida: el navegador puede retirar datos si falta espacio, y borrar los datos del sitio elimina también las correcciones locales. Respaldarlas desde Recintos. El modo offline exige un navegador compatible y el sitio publicado con HTTPS; la vista interna de ChatGPT puede no admitirlo.

## Datos y límites

Las superficies de selección permiten consultar el recinto y no sustituyen los contornos técnicos. Se prepararon con geometría vectorial de las fuentes y 41 delimitaciones auxiliares trazadas sobre el montaje. Se corrigieron solapes con recintos vecinos y se conservaron huecos relevantes. Su revisión visual es parcial; los límites de áreas abiertas pueden requerir ajuste. No sirven para cubicaciones ni certifican delimitación técnica.

Los 158 polígonos técnicos originales y sus estados de revisión siguen conservados, incluidos los dos validados. Las correcciones de contorno guardadas por el usuario tienen prioridad sobre la superficie auxiliar. Las superficies escritas en las fichas proceden del documento, sin recálculo geométrico. Las descripciones de asepsia se refieren a la pintura documentada.

Los PDF originales se mantienen íntegros. ORIGINAL_* registra la validación del paquete previo; este README describe la versión web vigente. dist/atlas.json conserva desplazamientos y recortes: 16 enlaces de alineación comprobados y residuo máximo de 0,181 puntos de las fuentes.

## Guardado

Las correcciones se guardan en localStorage de cada navegador, con historial y comprobación de conflictos. Respaldos exporta y restaura JSON. La publicación conserva correcciones por identificador; no hay sincronización entre dispositivos ni base de datos compartida.

## Verificación

Reconocimiento y catálogo de rombos: `docs/DIAMOND_RECOGNITION.md`, `node diamonds-test.mjs` y `node diamonds-browser-test.mjs` con el mismo entorno Chromium de las demás pruebas de navegador.

La auditoría estructural, las causas por recinto y el alcance del incremento actual están en `docs/REENGINEERING_AUDIT.md`. Pruebas adicionales: `node documentary-evidence-test.mjs`, `node geometry-authority-test.mjs`, `node review-observations-test.mjs` y `node quality-browser-test.mjs` (mismo entorno Chromium que `cielos-browser-test.mjs`).

El incremento de navegación y asociación CIE se describe en `docs/CIELOS_INCREMENT.md`. Prueba del modelo: `node discipline-model-test.mjs`; recorrido Chromium: `node cielos-browser-test.mjs` con las dependencias de prueba indicadas allí.

- node test.mjs: datos reales, búsqueda, recursos, materiales, persistencia, historial y conflictos.
- node runtime-test.mjs: igualdad de los 443 registros documentales, geometría técnica sin pérdida, búsqueda equivalente y conservación de las 330 superficies; reducción medida del tamaño de apertura.
- node offline-test.mjs: ejecuta los manejadores reales del service worker con adaptadores aislados de caché y red. Comprueba apertura y consulta sin peticiones de red, descargas interrumpidas, pausa/reanudación, falta de espacio, pérdida parcial de caché, actualización con reutilización y PDF opcionales sin conexión. No sustituye una prueba en un dispositivo físico.
- node interaction-test.mjs: anclaje de zoom, desplazamiento al levantar un dedo, agrupación por cuadro, eliminación de imágenes fuera de pantalla, reutilización y recuperación tras reconectar, con el visor real y un adaptador SVG aislado.
- node offline-ui-test.mjs: reapertura offline sin registrar ni actualizar por red, regreso desde otra aplicación y reintento tras una preparación inicial fallida. offline-test.mjs también comprueba que las actualizaciones conservan paquetes completos antes de activarse y que un fallo no elimina la copia anterior.
- node atlas-test.mjs: alineación, cobertura de posiciones y conversión de coordenadas.
- node selection-test.mjs: los 330 rótulos están en su superficie; 22 comprobaciones interiores y de separación entre vecinos; consulta de 10.000 puntos y existencia de las teselas. El tiempo de Node no mide fluidez móvil.
- Sintaxis de los módulos de navegador comprobada con node --check.
- Navegador de escritorio: búsqueda, ficha y selección de Sala Seriógrafo mediante un punto interior alejado del rótulo; plano monocromático sin círculos. También se comprobó la ficha de una etiqueta recuperada, la carga compacta y el panel offline. En esta revisión se comprobó además zoom, arrastre y apertura del Comedor 8.2.1.1.1-1 al tocar su interior, conservando sus seis campos de terminaciones. El servidor de revisión usa HTTP y no permite registrar service workers; la prueba de red cortada se realizó con los adaptadores de Node anteriores. La disposición móvil se revisó a 390 × 844 en una revisión anterior; el gesto de dos dedos, la instalación offline y el rendimiento en iPhone físico siguen sin comprobarse.

## Preparación y publicación

HTML/CSS/JS y datos estáticos en dist; configuración en .openai/hosting.json. Se conserva el acceso público ya configurado del sitio existente. Las bibliotecas se distribuyen localmente con sus licencias, sin CDN externa. Los scripts Python de scripts/ son utilidades de preparación fuera de línea y no forman parte de la ejecución web. scripts/selection/ conserva la evidencia y el ensamblado reproducible de las superficies auxiliares.

Después de cambiar datos, ejecutar `node scripts/prepare-runtime.mjs`. Los iconos PNG se generan con `node scripts/prepare-icons.mjs`. Después de cualquier cambio en dist, ejecutar `node scripts/prepare-offline.mjs` para renovar las huellas y la versión del paquete offline, y después `node offline-test.mjs` para comprobar que el manifiesto coincide con los archivos publicados.


### Proyectos (documentos de marcado) en Arquitectura

**Proyectos** parte de cualquier piso para pintar recintos de interés con una **leyenda de estados** (por ejemplo, Pendiente → En ejecución → Terminado para un levantamiento de pisos vinílicos), con conteo y m² por estado. Se guardan **cortes con fecha** (por ejemplo, cierre de mes) y se comparan de dos maneras:
- en el plano, recintos que avanzaron, siguieron igual o retrocedieron, con una tabla por estado;
- **lado a lado**, los dos cortes sobre la vista general del plano.

En el visor, **Proyectos → Nuevo proyecto** exige nombre, autor y propósito. Tocar un recinto lo pinta y añade su número y código a la lista exterior al plano (derecha en escritorio, debajo en móvil). Los números se conservan al quitar recintos. Documentos independientes por piso, color editable, PDF con plano/listado/metadatos y respaldo JSON. Guardado local en IndexedDB y, con la sesión de **Nube**, sincronizado entre equipos ([docs/NUBE_CAMPO.md](docs/NUBE_CAMPO.md)). Buscar un código acerca el plano sin marcarlo. Detalles y pruebas: [docs/MARKING_DOCUMENTS.md](docs/MARKING_DOCUMENTS.md).

### Protocolos del piso activo

En Control de obra, la matriz muestra por defecto los abiertos de S01 (piso −1), N01 (1), N02 (2) o N03 (3). Los contadores, desplegables y críticos usan el mismo ámbito. Los registros compartidos que mencionan explícitamente ese piso se identifican; los niveles desconocidos no se asignan por suposición. Véase [docs/PROTOCOL_FLOORS.md](docs/PROTOCOL_FLOORS.md).
