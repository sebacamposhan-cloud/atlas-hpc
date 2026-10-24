# Estado del incremento — 24 octubre 2026

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
