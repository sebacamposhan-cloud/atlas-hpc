# Plano interactivo de impermeabilización S01

Se incorpora `HPC-ARQ-DET-IMP-A-908-Rev01 S01.pdf` a **Plano → Nivel −1 → Impermeabilización**. También aparece en el selector existente de tipos de plano.

## Implementación

- PDF original íntegro: SHA256 `3b9437064f8652af57c0a6d1f813b710517840b1e1087270253d0f37e2f4168a`, una página, 1100 × 1560 puntos visibles, rotación original 270°.
- Visor de especialidades existente: mismas teselas, SVG, zoom, desplazamiento, gestos y búsqueda. La geometría y las imágenes se cargan al abrir la especialidad.
- **326 recintos seleccionables, incluidos 44 pasillos/circulaciones**, con polígonos multiparte y huecos. Identificadores estables relacionados con los recintos de Arquitectura.
- Contornos reutilizados de la autoridad geométrica actual de Atlas, registrados sobre el PDF por **41 líneas S-GRID**. Correspondencia por orden y comprobación de las distancias entre ejes. Máximo residuo: **0,061360 puntos PDF**. No se ajustan los contornos por proximidad de las etiquetas ni se inventan límites nuevos.
- Las capas `Proyecto Aprobado`, `Artefacto a impermeabilizar`, `Solo muros 2 metros` y `Se agregan en obra de proyecto aprobado` se leen del PDF. El cruce geométrico con cada recinto conserva las referencias presentes. El nombre de una capa no se interpreta como altura o medición verificada.
- Estados independientes de avance: Pendiente, En ejecución, Avance parcial, Terminado y Observado. Registro con fecha, autor autenticado y observación. Historial por filas y consulta del avance al corte de una fecha.
- Guardado real en el IndexedDB de proyectos existente. Usa la sincronización existente `/api/campo` como proyecto `schema:3`, `tipo:impermeabilizacion`, `specialty:waterproofing`. Se conservan el control de versiones, las copias ante conflictos y los respaldos/restauraciones JSON. Los registros de Arquitectura y Puertas conservan su esquema.
- Exportación **PDF vectorial** con el plano completo, capa de avance, leyenda, fuente documental, corte y listado/historial. La copia de exportación normaliza la rotación y aplana las anotaciones del PDF; el original queda intacto. Exportación PNG adicional.
- No se consideran avance los colores originales del documento. No se calculan cantidades ni superficies de impermeabilización a partir del área del recinto.
- Controles móviles compactos y botones táctiles. Se evita que la conversión automática de selectores a carruseles duplique o tape los controles de esta lámina.

## Archivos

- Modelo y controlador: `dist/impermeabilizacion-model.mjs`, `dist/impermeabilizacion.mjs`.
- Datos y fuente: `dist/impermeabilizacion/s01.json`, `dist/impermeabilizacion/s01-export.pdf`, `dist/source/imp-s01.pdf`, teselas en `dist/disciplines/imp-s01/`.
- Integración: `dist/disciplines.mjs`, `dist/disciplines.json`, `dist/app.js`, `dist/marking-model.mjs`, `dist/navegacion-model.mjs`, `dist/navegacion.mjs`, `dist/navegacion.css`, `dist/workspace.css`, `dist/selector-flujo.mjs`.
- Paquete sin conexión: `scripts/prepare-offline.mjs`, `dist/progress-room-levels.json`, `dist/sw.js`.
- Importación: `scripts/imp/import.py`, `scripts/imp/contours.mjs`, `scripts/imp/requirements.txt`.
- Pruebas: `impermeabilizacion-test.mjs`, `impermeabilizacion-browser-test.mjs`, ajuste de expectativas de navegación en `navegacion-test.mjs`.

**Base de datos:** no requiere tablas nuevas ni migración SQL. Reutiliza los proyectos de la nube de Atlas y sus permisos editor/lector.

## Reproducir la importación

```sh
python -m pip install -r scripts/imp/requirements.txt
python scripts/imp/import.py /ruta/HPC-ARQ-DET-IMP-A-908-Rev01-S01.pdf
node scripts/prepare-offline.mjs
```

La importación reemplaza únicamente los derivados `imp-s01`, conserva las otras especialidades y no toca registros de usuarios. Dos importaciones consecutivas con las mismas fuentes producen los mismos archivos, incluido el PDF derivado.

## Verificaciones

- `node impermeabilizacion-test.mjs`: SHA original, calibración de 41 ejes, 326 contornos, 44 circulaciones, huecos, límites, IDs, historial, corte temporal, validaciones, repetición sin duplicados, compatibilidad del proyecto con el sincronizador, envío/recuperación entre dos equipos simulados y copia de conflicto.
- `node impermeabilizacion-browser-test.mjs`, con `PLAYWRIGHT_MODULE` apuntando a Playwright Core y Chromium instalado: presentaciones de **320, 375, 390, 430, 768 y 1280 px**. A 390/1280: selección interior real, avance de recinto y pasillo, estados independientes, historial, repetición del envío, conservación de notas ante conflicto, reapertura tras recargar, PDF descargado y texto comprobado, restauración JSON y regreso a Cielos/Arquitectura. PNG descargado a 390 px. Cuenta lectora sin botón de guardado habilitado. Sin errores de página.
- Capturas revisadas de móvil y escritorio y del plano PDF exportado. Son pruebas locales; no certifican Safari en un iPhone físico ni el despliegue en Render.
- `node construction-test.mjs`, `node discipline-model-test.mjs`, `node marking-test.mjs`, `node proyectos-test.mjs`, `node navegacion-test.mjs`, `node nube-test.mjs`, `node geometry-authority-test.mjs`, `node deployment-assets-test.mjs`, `node offline-test.mjs`: comprobaciones de compatibilidad y recursos.
- `node --check` en los módulos modificados. El proyecto sirve módulos JavaScript estáticos: no tiene un paso TypeScript/React que ejecutar para esta integración.

## Límites documentados

- **Tres códigos del PDF no tienen contorno disponible en Atlas:** `9.1.3.1.9-1`, `9.1.3.1.9-2` y `RT.(-1)-14`. Se conservan en el PDF y se enumeran en la ficha de procedencia; no se crean perímetros ficticios para ellos.
- El ajuste de los ejes comprueba la alineación, no certifica todos los límites arquitectónicos. Cada contorno conserva su calidad de origen; los pendientes siguen pendientes de revisión técnica.
- Se registra el estado del recinto completo; no se infiere un porcentaje ejecutado ni se reparte una cantidad entre artefactos o muros.
- La sincronización se verificó con adaptadores aislados; no se escribió avance ficticio en la nube de producción.
- `runtime-test.mjs` ya falla en la base `06d566f` porque el catálogo runtime contiene identificadores que no aparecen en el antiguo `data.json` (TypeError al buscar el registro fuente). Se reprodujo el mismo fallo con los archivos originales de ese commit en un directorio aislado. Estos cambios no modifican esos catálogos ni la prueba; queda pendiente su actualización independiente.

## Artefactos por recinto — ampliación del mismo PR

Se importa **exclusivamente A-S01** de `HPC-5-ARQ-GEN-PMA-03-RevB.xlsx`, hoja `HPC PMA Artefactos`. No se genera catálogo de otros pisos ni se publica el libro completo. Importador reproducible: `python scripts/imp/import-artifacts.py /ruta/al/archivo.xlsx`.

La matriz contiene 414 recintos S01, 213 con artefactos previstos y 991 unidades. Coinciden con los contornos de este plano 173 recintos con 840 unidades. Los registros sin coincidencia se conservan en el catálogo S01, sin asignarlos por proximidad a otro recinto.

Desde **Proyectos → Avance de artefactos · plano S01**, o desde la lámina de Impermeabilización, se selecciona el recinto y aparece una tabla con **artefacto, unidad prevista y estado de instalación**. Cada unidad tiene sus opciones Instalado / No instalado / Sin verificar; por ejemplo, dos lavaderos B1 pueden tener estados distintos. No se presume instalado lo que figura en la planilla. El historial guarda usuario, fecha, código, número de unidad, celda y SHA256 de la fuente.

La instalación es independiente del avance de impermeabilización. Ambos se guardan en el mismo proyecto sincronizable, sin migración y conservando los proyectos anteriores. La capa «Instalación de artefactos» pinta verde los recintos con todos sus artefactos instalados, ámbar los parciales y gris los que tienen unidades registradas como no instaladas. El PDF incluye los estados y el historial de artefactos; el respaldo JSON conserva ambas clases de registro.

Archivos adicionales: `dist/artefactos-model.mjs`, `dist/impermeabilizacion/artefactos-s01.json`, `scripts/imp/import-artifacts.py` y `artefactos-test.mjs`. Integraciones en el controlador IMP, validación de proyectos, biblioteca de Proyectos y paquete offline.

Pruebas adicionales: `node artefactos-test.mjs` comprueba el ámbito S01, cantidades documentadas, instalación individual, ausencia de instalación inferida, conservación histórica y prevención de duplicados. El recorrido de navegador a 390 px guarda A4 no instalado y una de dos unidades B1 instalada, recarga, recupera los estados independientes y comprueba que la instalación figura en el PDF exportado. Las pruebas a seis anchos y las de proyectos, nube, navegación y offline se vuelven a ejecutar.

## Numeración vinculada entre plano y tabla

Cada toque sobre un recinto guarda su número de forma consecutiva (1, 2, 3…) en el proyecto. Desde una búsqueda también puede usarse «Marcar recinto con número». Registrar avance o instalación incluye el recinto en esa misma numeración. Volver a marcar un recinto mantiene su número; consultar o buscar sin marcar no agrega números. Las cuentas lectoras no crean marcas.

Las marcas contienen ID, código, número, punto interior en coordenadas del plano, autor y fecha. Sobreviven a recarga, respaldo y sincronización. Los proyectos anteriores siguen siendo válidos; no se inventa un orden histórico para recintos que aún no fueron numerados.

El PDF muestra las marcas numeradas y **una tabla debajo del plano en la misma primera página**, con columnas N°, recinto, artefacto, unidad e instalado (Sí / No / Sin verificar). La tabla repite el mismo número en cada artefacto del recinto y respeta el orden de marcado. Si supera el espacio previsto, continúa en páginas con cabecera repetida. El PNG incluye también los números y la tabla; para tablas que exceden el tamaño seguro de imagen se solicita usar PDF. El historial y la procedencia permanecen en el anexo.

Pruebas: `node imp-numbering-test.mjs` comprueba orden de selección diferente del catálogo, repetición sin duplicados, recuperación, unicidad y ubicación interior. El recorrido de navegador verifica números 1/2/3, marcas sin registrar avance, respaldo con orden persistido, tabla en la primera página y separación física entre plano y tabla mediante las coordenadas del PDF. Se corrigió además el selector de estados de impermeabilización al visualizar la capa de artefactos.

`imp-numbering-browser-test.mjs` verifica también dos toques táctiles reales en un contexto móvil: se persisten 1 y 2 en orden de toque, sin crear marcas por búsqueda ni por tocar otra vez el mismo recinto. Las escrituras de marcas se serializan para conservar ese orden.

## Corregir selecciones y trabajar con varios proyectos

- **Quitar selección** en la ficha retira ese recinto del plano numerado y de la tabla principal exportada.
- **Limpiar selección** retira todas las marcas del proyecto actual, con confirmación. No elimina el avance ni el historial y no afecta otros proyectos.
- **Nuevo proyecto** solicita un nombre y guarda un proyecto independiente, inicialmente vacío, con numeración desde 1. El selector permite regresar a cualquiera de los proyectos guardados y recuerda el último abierto tras recargar.

El retiro de marcas es lógico, con autor y fecha: los números de los otros recintos no cambian. Volver a marcar uno retirado recupera su número original; limpiar no reutiliza números de un mismo proyecto para identificar otro recinto. Para reiniciar desde 1 se crea un nuevo proyecto. La capa y la tabla principal omiten recintos retirados; el historial previo se conserva.

No requiere migración. Se amplían `imp-numbering.mjs` y el controlador/estilo IMP; se incorpora la limpieza de la ficha seleccionada en `disciplines.mjs`. `imp-numbering-test.mjs` comprueba retiro, limpieza, conservación de números e historial y reselección. `imp-numbering-browser-test.mjs` comprueba quitar un recinto, limpiar todos, crear un segundo proyecto, marcar su recinto 1, alternar proyectos y recuperar el último al recargar. El recorrido responsive a seis anchos y las pruebas de modelos, proyectos, nube y offline pasan.

## Plano a pantalla completa y ficha de selección rápida

Abrir la lámina S01 muestra el visor existente ocupando la pantalla disponible (`100dvh`, sin depender de la API Fullscreen de Safari). La barra compacta conserva búsqueda, ajustar vista y abrir ficha; «Herramientas» agrupa proyectos, limpieza, capas, zoom y exportación. «Volver» sale de pantalla completa.

Tocar un recinto abre una única ficha modal accesible. Los estados de cada unidad se eligen con botones grandes y selección visible, sin listas desplegables. Los controles siguen utilizando los mismos campos y validaciones: sin nuevos endpoints, tablas ni cambios en las cantidades PMA. «Guardar y volver al plano» persiste mediante el almacén existente y cierra la ficha únicamente tras confirmar el guardado. Volver o Escape con cambios sin guardar permite conservar la edición o descartarla. Ante conflicto, los valores editados permanecen en la ficha. El toque que abre la ficha no activa además un botón debajo del dedo.

La numeración, quitar/limpiar selecciones, proyectos independientes, PDF/PNG y la tabla vinculada se conservan. El registro de solo lectura mantiene las opciones deshabilitadas. El plano se puede seguir ampliando y desplazando al cerrar la ficha.

Pruebas: `imp-quick-entry-browser-test.mjs` (también ejecutado por el punto de entrada `impermeabilizacion-browser-test.mjs`) verifica 320/375/390/430/768/1280 px, tamaño del visor, ficha única, ausencia de desplegables visibles en artefactos, estados independientes por unidad, protección al cerrar, guardado/retorno, recuperación, fallo por versión concurrente, PDF con tabla bajo el plano y salida a Arquitectura. La prueba táctil de numeración se adapta al abrir/cerrar la ficha y sigue verificando quitar/limpiar, varios proyectos y recarga. Se revisan capturas de la ficha móvil y escritorio. No sustituye una prueba en Safari físico.

## Ajuste: marcar con un toque, sin guardar ni continuar

El flujo actual sustituye el envío manual de la ficha: cada botón de instalación persiste inmediatamente su unidad. No se muestran botones de guardar, continuar o descartar. Tras confirmar el guardado de la opción, la ficha se cierra automáticamente y vuelve al plano, sin pulsar «Volver al plano». Si el guardado falla, permanece abierta con el error y la última selección confirmada. La confirmación discreta distingue «Guardando…», «Guardado en este equipo» y error; la sincronización continúa mediante la cuenta existente.

Las escrituras se serializan en el orden de los toques y actualizan únicamente la unidad elegida, evitando sobrescribir otras elecciones rápidas. Repetir el estado ya registrado no duplica el historial. Ante un fallo se restaura la selección confirmada y se informa que no se guardó. Si se pulsa volver durante un guardado, la ficha se cierra al terminar correctamente, sin pedir un segundo toque.

«Opciones del recinto» permanece contraído e incluye estado general, fecha, observación e historial de avance. Sus botones también guardan directamente; fecha y observación se registran al cambiar el campo. El avance de artefactos y el avance general siguen separados. Los historiales se actualizan y el plano refleja la capa correspondiente al cambio confirmado.

Pruebas: `imp-autosave-browser-test.mjs`, mediante los puntos de entrada de integración existentes, verifica 320/375/390/430/768/1280 px: tres unidades marcadas rápidamente sin enviar formulario, persistencia individual, repetición sin duplicados, opciones contraídas, guardado del avance opcional, reapertura/recarga, vuelta al plano durante el guardado, conservación de la tabla PDF y reversión visual ante conflicto de versión. Se conservan las pruebas de numeración, artefactos, proyectos, nube y offline. Sin migración SQL.

La prueba de integración verifica el cierre automático después de cada elección de artefacto y del estado general, la recuperación al reabrir y que un conflicto de versión mantenga la ficha abierta. Se comprueba a 320/375/390/430/768/1280 px.

## Recuperación del generador PDF

Se corrige el cargador compartido de bibliotecas de exportación: antes conservaba permanentemente una promesa rechazada después de un fallo de descarga, de modo que los siguientes intentos fallaban sin volver a solicitar el archivo. `vendor-loader.mjs` comparte las cargas en curso, verifica que la biblioteca realmente exista, limita el tiempo de espera, limpia los intentos fallidos y realiza un reintento breve. Si ambos fallan, pulsar exportar nuevamente vuelve a cargar la biblioteca. No se borran cachés ni registros de usuarios.

`vendor/pdf-lib.min.js` se incorpora al núcleo del paquete offline para que el generador quede disponible junto con la aplicación. La exportación sigue utilizando el original y los registros del proyecto. No se modifica autenticación ni se publica ningún dato del proyecto.

Prueba `pdf-export-recovery-browser-test.mjs`: fallan intencionalmente las dos cargas iniciales; el siguiente clic genera un PDF de 16 páginas con 80 recintos numerados, plano y tabla vinculada. El documento de marcas es idéntico antes y después de ambos intentos. Se verifica a 390 y 1280 px. También se prueba recuperación automática tras un fallo transitorio, llamadas concurrentes sin descargas duplicadas y reutilización de la biblioteca ya cargada. Offline, recursos HTTP y modelos de numeración/artefactos comprobados. Esto reproduce el mecanismo localmente; no identifica por sí solo la causa de red/sesión del primer fallo observado en Render.

## PDF sin anexos de historial

La exportación conserva únicamente el plano numerado y la tabla de artefactos vinculada a sus números (con continuación de la tabla cuando sea necesaria). Se retiran las páginas finales de procedencia técnica, listado repetido de instalación e historiales con fechas, autores y observaciones. No se cambia ni elimina ningún registro del proyecto: el historial sigue disponible en Atlas y en el respaldo JSON.

La prueba de exportación incluye ahora registros de avance y artefactos con notas/autores de auditoría. Comprueba que esos textos e historiales no aparezcan en el PDF, que la cantidad de páginas corresponda exactamente al plano y a las filas de su tabla y que el documento guardado sea idéntico antes y después de exportar. Probado con 80 recintos a 390 y 1280 px, incluida recuperación tras fallo de carga del generador.

## Tablas compactas por recinto y semáforo de instalación

La exportación PDF/PNG agrupa los artefactos en una tabla por recinto marcado. Su número, código y nombre aparecen una sola vez en el encabezado; cada tipo de artefacto ocupa una fila con cantidades instaladas/previstas, no instaladas y sin verificar. Por ejemplo, dos unidades del mismo artefacto se resumen como 1/2, sin repetir el recinto o generar dos filas. Se mantienen el orden y la numeración del plano.

Verde indica instalación completa, amarillo instalación parcial y rojo cero instalaciones registradas. «Sin verificar» se conserva separado de «No instalado»: el color rojo no acredita una ausencia física. Un recinto sin artefactos PMA queda neutro, sin cantidades inventadas. La capa de instalación usa los mismos colores; el avance general de impermeabilización conserva su leyenda original.

Cada tabla tiene separación visual y se mantiene completa al cambiar de página cuando cabe; solo una tabla mayor que una página se divide con encabezado de continuación. No se reintroducen anexos de historial ni se modifican registros guardados. `imp-report-test.mjs` comprueba agrupación, cantidades, estados, conservación y paginación. `pdf-export-recovery-browser-test.mjs` genera PDFs reales a 390/1280 px y verifica 80 encabezados únicos, sin anexos ni mutación de datos.

Comprobación adicional: PNG real con filas completas y parciales, sin mutación del documento; guardado con un toque/reapertura/recarga y manejo de conflicto a 320/375/390/430/768/1280 px. Se actualiza la expectativa del PDF de esa prueba para exigir cantidades agregadas y un único encabezado de recinto.
