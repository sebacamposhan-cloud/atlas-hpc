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
