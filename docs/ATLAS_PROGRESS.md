# Estado del incremento — 24 octubre 2026

## Auditoría estructural y primer incremento de corrección

Ver `REENGINEERING_AUDIT.md` para matriz de causas, evidencias por recinto y criterios A–H. Los 192 recintos sin asepsia sí tienen rombos: 161 con terminaciones sin categoría de asepsia, 29 con pintura no especificada (código 15), uno con muros N/A y uno con S/E. No se reclasifican ni se añade asepsia alta.

- Recuperadas 75 apariciones de 62 códigos ARQ exactos omitidos por el patrón numérico del importador CIE. Se consultan como candidatos pendientes, junto con las 329 observaciones originales preservadas. CT.F.(-1)-3 ahora se localiza en CIE-504. No se infieren superficies/materiales de los candidatos ni se consolidan en SQLite como asociaciones aprobadas.
- Estados documentales explícitos en fichas; asepsia derivada solo de M1–M4 al leer y guardar correcciones, conservando almacenamiento e historial anteriores.
- Los dos contornos técnicos ya validados tienen prioridad sobre superficies auxiliares. Correcciones manuales, huecos y multipolígonos se conservan; índice y resaltado usan la misma geometría. Lo pendiente se representa con trazo discontinuo.
- Leyenda compacta minimizable, sin apagar filtros/colores; controles separados para colores y limpiar.
- Clearance incorporado como PDF complementario con hash. El usuario confirmó que C: son grupos MEP liberados para cerrar a la fecha del plano; actualizar liberaciones queda al final por su prioridad expresa.

La auditoría detecta cuatro auxiliares inválidos y 12 pares de solapes; no se reparan ni validan automáticamente. No está implementado el montaje CIE calibrado ni el editor completo de multipolígonos. Las tres SQLite, geometrías y originales previos conservan sus hashes.

## Incremento Cielos: navegación y ficha documental

El incremento conserva los ocho originales CIE, sus 329 observaciones (277 códigos), los datos ARQ y las tres bases SQLite. No añade atributos extraídos ni valida geometrías nuevas.

- Búsqueda CIE por código, texto fuente y nombres documentados en Arquitectura, sin distinguir tildes o mayúsculas.
- Navegación entre láminas y retorno al recinto de Arquitectura por código. Se conserva la observación elegida al pasar por Pavimentos o Arquitectura.
- Las coincidencias múltiples se presentan para elección explícita por lámina/etiqueta; no se mezclan sus superficies, NCT ni materiales. Una lámina sin observación para el código muestra atributos pendientes.
- La ficha muestra superficie declarada, NCT, códigos documentados de cielo y luminaria, PDF/revisión/página, texto original, caja de extracción y SHA256. Cada código de material consulta su propia descripción del catálogo ARQ.
- Se corrige el retorno a una selección ARQ antigua cuando el código CIE no tiene correspondencia. Una respuesta de carga atrasada ya no reemplaza el modo activo; los errores de carga permiten reintentar.

Línea base previa: nueve suites Node aprobadas y tres SQLite con integridad correcta y cero errores de claves externas. Pruebas del incremento y reproducción en `docs/CIELOS_INCREMENT.md`.

## Implementado

- Selector Arquitectura / Pavimentos / Cielos en el proyecto existente.
- Ocho CIE y un PAV reales con PDF original, mosaicos, zoom, desplazamiento, búsqueda y ficha contextual. Caso 7.1.2.1.2-1 cotejado.
- Conservación de código entre especialidades; correspondencias ambiguas no se resuelven arbitrariamente.
- Límites ARQ negros visibles; categorías de asepsia desde datos presentes.
- Zonas completas/parciales dibujables, rechazo de polígonos cruzados o degenerados, persistencia, selección por interior, avance multidimensional, colores por dimensión e historial.
- Protocolos con estado técnico/administrativo, formularios, conteos únicos, filtro e historial; panel Control de obra.
- Respaldo portable de zonas/eventos/protocolos/revisiones; importación aditiva y copia previa transaccional.
- SQLite aditivo y scripts de importación, extracción y calibración. Esquemas preparados para MEP y llaves, sin datos inventados ni publicación de información sensible.
- Piloto de puertas con fuente, coordenadas, recortes, corrección de posición, asociación manual y revisión por grupos. La evaluación actual no permite inventariar puertas.

## Pruebas

Automáticas: test.mjs, runtime-test.mjs, atlas-test.mjs, selection-test.mjs, interaction-test.mjs, layers-test.mjs, construction-test.mjs, offline-test.mjs, offline-ui-test.mjs. Integridad SQLite y claves externas; comparación de todas las filas heredadas con original. Metadatos ARQ443, contornos158 y superficies330 preservados. Las329 posiciones CIE quedan dentro de sus páginas tras normalizar /Rotate.

Navegador de escritorio: selector Cielos, búsqueda del caso, ficha12,45/NCT2,80/213/L19, fuente, plano PAV real, protocolo de prueba local, segunda escritura sin duplicar y persistencia tras recarga. Antes de la recuperación del entorno se verificó también una zona parcial y evento de estructura; después se reconstruyó el módulo y sigue pendiente repetir todo ese recorrido visual en la versión final.

Métricas de pruebas Node: 10.000 consultas del índice espacial ~8,2 ms total; filtros mediana ~0,11 ms. No son mediciones de iPhone ni FPS del visor. Mosaicos nuevos se solicitan por zona visible. Paquete plano aproximado42 MB, PDFs opcionales56 MB; manifiesto exacto en sw.js.

Pruebas offline ejecutan los manejadores del Service Worker con red simulada deshabilitada. NO equivalen a una prueba Safari real en modo avión. La previsualización HTTP no permite comprobar el Service Worker real. No se declara esa aceptación terminada.

## Incidencias y pendientes

1. Validación técnica de contornos ARQ/rombos y asociación de atributos todavía incompleta; reforzar líneas no corrige geometrías incorrectas.
2. Alineación gráfica por puntos de control entre revisiones pendiente; existe modelo y ajuste numérico, pero no una interfaz de calibración validada. PAV sin localización automática.
3. Editor nuevo crea zonas y quita último vértice; falta mover vértices de zonas guardadas, partición topológica y deshacer/rehacer completo. Editor ARQ previo se conserva.
4. Protocolos: falta planificación prevista/vencimientos, evidencias adjuntas, relaciones tipadas completas y resaltado de todos sus elementos sobre planos.
5. Detector: criterio cúbico inicial capturó símbolos de cartela; reconstrucción de824 arcos en103.902 líneas produjo un candidato que se rechazó visualmente como equipamiento. No hay inventario de puertas confirmado ni referencia completa para medir omisiones. No ejecutar a escala como detector fiable.
6. MEP/llaves: esquema inicial, sin interfaz completa ni datos/documentación validada. Adaptador IA opcional sin conectar; Dalux no consultado.
7. Prueba móvil física, modo avión real, descarga/restauración por navegador y comparación completa de rendimiento pendientes.

Una limpieza automática retiró el checkout no sincronizado durante el desarrollo. Se recuperó la versión8 desde Git, se conservaron los PDF y se reconstruyó el incremento. Punto de recuperación sincronizado e75ce294ab8a137d179e7198eef88126003fecea. No se sustituyeron datos de producción por los ensayos del navegador local.

## Correcciones del informe visual — familias

El selector principal de capas se reduce a Cielos, Pavimentos y Muros. Asepsia pasa a filtro independiente de atributo de pintura; HPL permanece en Muros. Se conservan las categorías documentales internas y los colores personalizados. Prueba quality-browser-test en 1440 y 390 px verifica las tres opciones y persistencia del filtro de 72 recintos, junto con geometría y trazabilidad. Pasan layers-test y offline-test. El montaje continuo CIE y la corrección integral de circulación siguen pendientes; este incremento no los declara resueltos.

## Asistente Groq

Chat para consultas generales y resumen de fichas originales con contexto de recinto y referencias documentales, mediante backend Node. Clave solo en servidor; límite de intentos/tokens y errores explícitos. La configuración de producción y prueba real requieren credencial, modelo habilitado y servicio backend, ya que el hosting actual es estático. Ver `GROQ.md`.

Despliegue Groq preparado: `render.yaml` entrega sitio y backend en un servicio, sin despliegue automático. Contraseña generada por Render protege documentos/API y el servidor exige esa protección al enlazar fuera de loopback. Pendiente conectar cuenta, introducir clave y validar el despliegue real. Respaldar datos locales antes de cambiar de dominio.

## Reconocimiento de rombos

Ver `DIAMOND_RECOGNITION.md`. Detector independiente de seis campos en las nueve fuentes ARQ: 443 símbolos reconocidos, 443 observaciones cotejadas y 2.658 códigos coincidentes, incluyendo N/A/S/E. Catálogo completo con fuente y búsqueda fuera del recorte del plano, y marcas de rombo seleccionables por clic/teclado sin depender de contornos. No se modifican geometrías ni bases. La plantilla no se declara OCR universal ni se aplica sin revisión a otras disciplinas.

## Evaluación de motores abiertos y entrega de imágenes

Comparativa concreta en `VIEWER_ENGINES.md`: That Open/web-ifc para futura vista BIM con IFC, Leaflet/Geoman para piloto de edición 2D y OpenSeadragon como alternativa de zoom de teselas. No se incorporaron dependencias ni se sustituyó el visor. La relación rombo/código/fuente/revisión se mantiene como contrato de datos.

Nueva prueba `deployment-assets-test.mjs`: 1.171 imágenes comprobadas mediante HTTP autenticado contra el backend real local, con MIME, tamaño y hash; incluye los 443 rombos. Corrige MIME JPG/JPEG. `deployment-browser-test.mjs` prueba el rombo 8.2.4.2.16-1, plano y teselas con contraseña y service worker activo, online y tras recarga offline. Ambas pasan. La causa del fallo de PNG/plano en Render sigue sin establecerse; no se declara corregida a partir de pruebas locales. El comando build propuesto añade el control de imágenes y requiere aplicarse en el alojamiento para ejecutarse allí.

## Editor de contornos 2D y recuperación de rombos

Integración real de Leaflet + Geoman Free y validadores Turf locales, sin reconstruir el visor. Edición sobre PDF original, huecos/partes, deshacer/rehacer, historial y exportación; correcciones pendientes y locales. Consolidación opcional en SQLite derivada con respaldo y revisiones inmutables, sin modificar las bases originales. Ficha y catálogo recuperan la región original del PDF si falla el PNG. Alcance, límites y publicación en `CONTOUR_EDITOR.md`.

El usuario confirmó que Groq funciona en Render; se conserva su configuración manual. La persistencia compartida, el conteo independiente de todos los rombos y la revisión técnica de todos los límites siguen pendientes. La PR anterior fue fusionada externamente; este incremento se presenta en una rama y PR nuevas.

## Corrección de los perímetros mostrados en las capturas móviles

La edición manual del incremento anterior no cambió las superficies iniciales defectuosas. Se localizaron Oficina médico jefe (3.1.1.2.2-1), Sala Preparación de Pacientes (3.1.1.5.5-1) y Sala Seriógrafo (3.1.1.5.1-1): en la oficina y Preparación, las superficies auxiliares procedían de rectángulos parciales de suelo/mobiliario. En Seriógrafo, el auxiliar manual previo cortaba el borde derecho e inferior. Ninguno representaba correctamente el límite del recinto.

Ahora se aplican 13 perímetros derivados, cotejados visualmente contra las caras interiores de los muros del PDF; incluyen entrantes estructurales y una Sala de Comando contigua. Un auxiliar vecino de TAC se recorta para eliminar un solape de aproximadamente 99,6 puntos PDF cuadrados. El nuevo lote afecta tanto al relleno como al clic del visor inicial; no requiere editar manualmente cada recinto para ver el cambio. Los trazados técnicos validados y las correcciones locales del usuario conservan prioridad.

Reproducción: `python scripts/selection/build-source-repairs.py` con PyMuPDF y Shapely. Las rutas fuente aceptadas y hashes se fijan en `scripts/selection/reviewed-source-paths.json`. Los candidatos automáticos que invadían columnas, baños o exteriores se descartaron; no se aplican rectángulos blancos indiscriminadamente. El resultado separado `dist/room-contour-repairs.mjs` conserva los originales y pasa a la copia offline. La validación técnica global de los 330 recintos sigue pendiente.

Pruebas nuevas: `source-contours-test.mjs` reproduce las franjas omitidas y comprueba inclusión, exclusión de columna/baño, hashes, geometrías, prioridad manual y rechazo ante registro desplazado. `source-contours-topology-test.py` verifica con Shapely que no se introduzcan solapes con vecinos y conserva los 36 hashes originales. `source-contours-browser-test.mjs` comprueba el relleno SVG real, clic y ficha con servidor protegido en escritorio y móvil. Evidencia de la capa Muros: [Oficina móvil](audit/images/office-contour-mobile.png), [Seriógrafo móvil](audit/images/seriograph-contour-mobile.png). No se considera verificado el despliegue Render por haber pasado las pruebas locales.

## Colores de fuente, selección y lectura de contornos

Se sustituyen los colores por hash de CIE por 20 muestras de su leyenda: 152 extracciones vectoriales coincidentes entre ocho fuentes, celda blanca 200 y trama original 214. Muros/Pavimentos se identifican como paleta de consulta porque su leyenda ARQ es monocroma; no se infiere una asignación de material por el fondo coloreado de un plano. Las preferencias se distinguen y se pueden restablecer por familia. Plano, muestras y exportación comparten color/opacidad/composición.

Selección independiente con borde azul, halo blanco y código visible aunque se cierre la ficha; no depende de oscurecer el mismo relleno. Contornos generales más finos con estado pendiente conservado. La nitidez vectorial no cambia el límite de resolución de las teselas ni certifica la geometría. Pruebas de imagen verifican color real y conservación de texto/lineado. Detalle y límites en `LAYER_COLORS.md`.

Pendiente: revisar los contornos adicionales de la captura de Box Consulta Médica 7.1.2.1.2-2 (504) y del borde inclinado sur. Este incremento no declara corregidas esas geometrías. Para publicación estable, Render puede usar main tras revisión/fusión de la PR por el usuario; no hay merge ni despliegue automáticos.

## Recuperación de actualizaciones en pestañas con copia anterior

Se reprodujo en Chromium una portada antigua servida desde el service worker mientras el servidor ya tenía el selector de pisos nuevo. El flujo actual conserva versiones por caché y espera instalación completa antes de ofrecer activación; el estado de descarga/error y la disponibilidad tardía de registration.waiting no eran suficientemente visibles.

Se añade aviso persistente, búsqueda manual de actualizaciones, progreso de preparación y error recuperable conservando la copia anterior. El estado installed se vuelve a consultar después del evento para evitar perder la transición a waiting. La activación desde la app se bloquea si hay una edición de contorno/formulario pendiente. No se recarga automáticamente una pestaña que tiene trabajo sin guardar.

`/actualizar.html` es una página de recuperación independiente, deliberadamente fuera del manifiesto offline. Un worker antiguo deja pasar esa ruta al servidor; desde allí se registra el mismo worker con updateViaCache:none y se aplica la versión preparada sin borrar localStorage, IndexedDB ni CacheStorage. La página necesita conexión y solo estará disponible después de desplegar este incremento. Index y scripts del worker se entregan con Cache-Control:no-cache.

Pruebas: `offline-update-browser-test.mjs` reproduce la portada anterior y verifica selector nuevo tras activar, conservación de una corrección local, un registro IndexedDB y la caché anterior; `offline-ui-test.mjs` cubre aviso, activación y carrera installed/waiting. `offline-test.mjs` conserva las pruebas de paquetes completos, fallos, pausa y reutilización. No se afirma haber intervenido en el navegador o Render del usuario.


## Explorador visual por pisos y accesos a especialidades

Se incorpora una portada de cuatro tarjetas, dos columnas en escritorio y móvil, con miniaturas de las vistas generales reales de −1 y 2. Pisos 1/3 quedan explícitamente pendientes de documentación. Se retira el desplegable superior de pisos y se añade «Pisos» para regresar. La entrada carga el visor existente bajo demanda; no modifica runtime, SQLite, geometrías, fuentes originales ni claves de almacenamiento. Reabrir el mismo piso conserva zoom/selección sin nuevas solicitudes de runtime. El cambio entre niveles distintos conserva la navegación documental por URL y requiere inicializar el visor del destino; no se promete un cambio instantáneo ni se crean visores paralelos.

Se añaden botones de Arquitectura/Cielos/Pavimentos/Muros. Muros reutiliza la capa de terminaciones en arquitectura; Cielos y Pavimentos sin láminas se indican deshabilitados. Se mantienen los paneles plegables, filtros y gráficos existentes conectados con recintos reales. No se añaden mediciones ni indicadores ficticios.

Se protegen formularios/contornos pendientes al salir del piso o aplicar una actualización. En especialidades, «Descartar cambios» restablece el formulario antes de navegar. La búsqueda se habilita al terminar el arranque del visor; se corrigió una carrera detectada al probar la restauración de geometría tras recargar.

Pruebas del incremento: `floor-explorer-browser-test.mjs` (1440/390/320 px, proporciones 2 × 2, datos diferidos, retorno al mismo piso, historial, enlaces, Muros, gráfico a filtro y protección de formularios), suites existentes de Cielos, calidad, colores/selección, catálogo de rombos, contornos, editor, Groq, despliegue y recuperación offline. Los tests de visor usan ahora `?nivel=N-1` porque `/` tiene otra función. La expectativa antigua de tres familias en `quality-browser-test.mjs` se actualiza para incluir Liberación, que ya estaba en main.

Este incremento incluye la recuperación de caché pendiente del incremento anterior. Publicación prevista: revisar/fusionar la PR a main y desplegar main en Render; sin merge ni despliegue automáticos. El navegador con portada antigua puede aplicar la actualización desde `/actualizar.html` después del despliegue.


## Navegación de tres apartados, filtros integrados y gráficos de obra

Se simplifica la navegación principal a Control de obra, Explorador de planos y Liberación de frentes. El dashboard documental pasa a una vista interna de Control de obra; Capas pasa al panel derecho del plano. Gestión de recintos y Documentación y fuentes se retiran del menú, manteniendo datos, referencias en fichas, respaldos y compatibilidad de enlaces anteriores.

El panel comparte el estado existente de búsqueda, filtros, colores y geometrías. Permite consultar por recinto y categoría, combinación por unión dentro de una familia/intersección entre familias, asepsia, sector y revisión; indica el total de coincidencias y categorías del piso. Conserva zoom, colores personalizados y filtros al abrir/cerrar. No abre automáticamente una ficha por una sola coincidencia mientras se configura; tocar un recinto cierra el panel y muestra su ficha. Se corrige el retorno desde especialidades al pintar categorías documentales para aplicar la representación sobre Arquitectura.

Control de obra incorpora gráficos de torta de estados técnicos/cierre administrativo y barras de zonas/último estado por dimensión. Torta solo para categorías excluyentes; las terminaciones documentales conservan barras porque pueden solaparse. Los gráficos consultan registros reales de IndexedDB, deduplican identificadores y muestran explícitamente estados sin registrar. No hay cantidades previstas ni porcentajes de ejecución inferidos. Alcance visible: avances/protocolos del navegador, todos los pisos; características del piso seleccionado. Las pruebas usan datos aislados, que nunca se incorporan al runtime o las bases del proyecto.

Validación: 23 suites Node, incluyendo work-charts-test.mjs; plan-filters-browser-test.mjs cubre escritorio/móvil, tres apartados, tortas/barras y filtros de registros, búsqueda, categorías, colores, zoom, retorno de especialidades, 311 recintos de N02 y recarga offline con control de obra operativo. Se adaptan las pruebas existentes de colores, calidad, contornos y tarjetas a los nuevos accesos. También se comprueban Cielos, editor, rombos, despliegue protegido, Groq simulado y actualización conservando correcciones/caché. Fuentes, SQLite, runtime y geometrías conservados. Publicación mediante PR a main, sin merge ni despliegue automáticos.


## Matriz de protocolos REV1 en Control de obra

Se incorpora el Excel original de 8,4 MiB sin modificarlo y se deriva un catálogo pequeño con detalle por código. La hoja principal contiene 20.233 filas de registros, 154 códigos y 156 variantes de nombre; las especialidades se agrupan textualmente en 38 entradas conservando sus etiquetas originales. Corte documentado: 26-10-2026. Solo se incorporan la hoja maestra y el resumen general como control; no se duplican tablas dinámicas ni históricos ocultos.

Control de obra abre por defecto Protocolos de la matriz. Selección por desplegables de especialidad/proceso y paneles desplegables, búsqueda por código/nombre, carga bajo demanda, filtros por estado/nivel/recibe/texto, paginación de 25 filas y ficha inline con los 16 campos originales y fila fuente. Selección/filtros se recuerdan sin sobrescribir los protocolos locales de IndexedDB. Los detalles se verifican contra la versión de su catálogo y se recuperan tras fallos; respuestas antiguas no sobrescriben una selección nueva.

Integridad: se mantienen las 17 combinaciones repetidas de código/folio. Tres estados ABIERTO con espacios finales explican 5.678 abiertos al agrupar las filas frente a 5.675 en el resumen; se publica la diferencia y se conservan los valores originales. No se infieren códigos de recinto, geometrías, formatos de inspección o aprobaciones técnicas a partir de estas etiquetas.

Pruebas nuevas: lectura independiente SheetJS de todos los campos de las 20.233 filas, conservación byte a byte del original y descarga protegida, agrupación/fechas/duplicados/diferencias, esquema y versión de los detalles y paquetes offline. Python verifica importación reproducible entre semillas distintas y rechazo de totales incompatibles sin alterar derivados existentes. Chromium cubre escritorio/móvil, desplegables, filtros, paginación, ficha, persistencia, descarga, respuesta tardía, reintentos y recarga real sin conexión. Las suites anteriores de gráficos y filtros se adaptan a la nueva vista inicial; fuentes anteriores, runtime, SQLite y geometrías se mantienen.

Actualización mediante importador reproducible y PR a main. No se modifica ni se sincroniza el Excel original desde el navegador; la fuente publicada es una copia documental con fecha de corte. No hay merge ni despliegue automáticos.


## Filtros de fechas y análisis de protocolos críticos

Se incorporan filtros inclusivos de elaboración/cierre, vista Pendiente de cierre como alias explícito de ABIERTO y grupo Cerrados incluyendo autocontrol. Se conserva el estado original, la opción de cierre por autocontrol y los nulos. Selección, intervalo y criterio de criticidad se recuerdan en la consulta.

Nueva vista interna de Control de obra: Protocolos críticos. Regla: estado abierto, elaboración válida, campo de cierre vacío y fecha de evaluación estrictamente posterior al primer aniversario calendario. Para 29 de febrero, el aniversario en año no bisiesto se toma el 28; solo el día posterior cumple «más de». Cerrados, autocontrol y nulos no se clasifican críticos; campos de cierre en conflicto y fechas ausentes/inválidas tampoco se suponen abiertos antiguos. Se mantienen los datos originales.

El índice compacto contiene solo las 5.678 filas abiertas con los campos necesarios; no se cargan los 154 detalles completos para construir el gráfico. Estado al corte de fuente (26-10-2026) y fecha de evaluación están visibles. Hoy usa America/Santiago y se actualiza al reabrir/retomar la vista; las fechas elegidas explícitamente se conservan. Barras de los diez procesos con más críticos, torta de tramos y tabla paginada enlazan a los registros originales, transmitiendo fecha, filtros y fila seleccionada. No hay reescrituras de Excel ni mezcla con la aprobación técnica local.

Verificación independiente sobre el XML original y tests: al 27-10-2026 hay 2.045 críticos, 1.495 abiertos sin elaboración válida y cero conflictos de cierre entre los abiertos; 1.758 en más de 1 y hasta 2 años, 286 en más de 2 y hasta 3, uno en más de 3 años. Los 38 valores de elaboración formados por espacios se tratan como fecha ausente y no como fechas antiguas.

Validación: 25 suites Node, importación reproducible Python, Chromium escritorio/móvil, igualdad/umbral de un año, bisiestos, cambios de día en Chile, cierres excluidos, fechas inclusivas, rangos inválidos, gráficos a filas originales, criterio persistido, reintento y recarga offline. Los originales, SQLite, geometrías y las 154 colecciones de detalle se conservan. Nueva salida derivada open-aging.json y módulos en el manifiesto offline; sin merge/despliegue automáticos.


## Integración PMA de terminaciones RevB

Se conserva el Excel original con SHA256 0c9b9e20a2c1257b2390ce1cba74dc756f0e45ef036043c5f084d228715c7ea9 y se importan 3.107 recintos, incluidos 133 eliminados, con 9.321 observaciones de tres hojas. Fuente complementaria de anteproyecto según carátula, sin fecha que permita imponer precedencia sobre láminas. Los códigos sin sufijo también se incluyen y los totales del Excel se verifican. Leyendas EETT, orientación M1–M4, codificación de muros y notas se conservan; no se ejecutan fórmulas.

Control de obra añade PMA de terminaciones con filtros, torta/barras, paginación, 57 campos fuente y enlaces a recintos del piso activo. Desplegable compacto PMA en ficha coteja códigos y muestra superficie/asepsia/revisión documental, sin sustituir los rombos ni certificar ejecución. Cuatro discrepancias internas de eliminación se pueden filtrar. Cuatro códigos del plano N02 que el PMA sitúa en N01 quedan señalados sin reasignarse. Groq recibe la evidencia PMA y sus leyendas desde el servidor al consultar un recinto.

Se incorpora data/pma-revb.sqlite como instantánea derivada independiente; las tres SQLite originales, geometrías, runtime y matriz de protocolos se conservan. Consulta diferida y catálogo en paquete offline; original opcional con acceso protegido. Importador reproducible y protegido ante esquema incompatible. Validación: 177.099 campos contrastados con SheetJS, 9.321 observaciones SQLite con integridad/claves/payload, filtros/relaciones/conflictos y contexto de IA simulado; Chromium escritorio/móvil, reintento, respuesta tardía y consulta real sin red. Detalles en docs/PMA_REVB.md. Publicación mediante PR a main, sin merge ni despliegue automáticos.


## Piloto de avance por recinto en nivel −1

Control de obra prioriza Avance por recinto. Los 330 recintos visibles del plano generan 1.940 partidas PMA aplicables (pavimento, cielo y cuatro orientaciones de muro). Instalación y condición independientes, faltantes/observaciones de partida y generales, responsable, fecha e historial desde Control y ficha. El dato inicial es Sin registrar; N/A queda fuera del cálculo; Conforme requiere instalado y sin faltantes. Los conflictos de fuentes exigen cotejo explícito sin reescribir documentos.

Torta de instalación, seis barras de instaladas/conformes/total, revisión de lo instalado y pendientes por sector. Indicadores por partidas y recintos, con denominador explícito no ponderado por m² o costo; filtros por asepsia, sector, partida, nombre/código y estado. Sin curvas temporales ficticias.

IndexedDB independiente, guardado atómico con historial/control de versión, borradores de pestaña recuperables, respaldo/importación con rechazo de conflictos y consulta offline. No hay sincronización compartida; fuentes SQLite, PMA, geometrías y registros de protocolos se conservan. Detalles y pruebas en docs/ROOM_PROGRESS.md. Publicación por PR a main; sin merge/despliegue automático.
