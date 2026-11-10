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
