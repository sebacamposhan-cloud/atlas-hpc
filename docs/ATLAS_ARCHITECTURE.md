# Atlas HPC 3 — arquitectura incremental

Se conserva el proyecto estático JavaScript ES modules + SVG; no es React/Vite y no se migra por apariencia. `app.js`, `viewer.mjs`, `web-store.mjs`, `workspace.mjs` siguen siendo la arquitectura operativa.

- `disciplines.mjs`: selector, visor paginado por lámina, búsqueda, ficha contextual, zonas y eventos. Usa mosaicos de PDF y coordenadas independientes normalizadas con /Rotate.
- `construction-store.mjs`: IndexedDB `atlas-construction` v2, transacciones de registro + historial, respaldo e importación aditiva sin sobrescritura. Correcciones antiguas siguen en su almacenamiento original.
- `construction-dashboard.mjs`: indicadores locales, revisión técnica/administrativa de protocolos, revisión de candidatos a puertas.
- `scripts/import-disciplines.py`: ingesta reproducible de ocho ARQ-CIE y un plano de pavimentos; original, SHA256, página y bbox preservados.
- `scripts/migrate-atlas.py`: SQLite de consolidación fuera de `dist`; no se descarga una base sensible en la aplicación pública.
- `scripts/detect-doors.py`: piloto offline de segmentos que forman arcos y líneas de hojas. Resultado NO apto para inventario todavía.
- `scripts/calibrate-sheets.py`: ajuste afín por puntos de control. Salida pendiente, no aplicada automáticamente.

La selección se conserva por código cuando hay una correspondencia única. No hay aún transformaciones interdisciplinares revisadas: no se copian polígonos entre ARQ, CIE y PAV. Pavimentos no tiene texto extraíble y conserva el código sin inventar su ubicación.

SQLite es una consolidación de fuentes y herramienta offline de ingeniería. IndexedDB contiene cambios del dispositivo; el respaldo portable se importa a SQLite con `scripts/import-work-backup.py`. No existe sincronización multiusuario automática.

Rendimiento: carga diferida de datos de especialidad, mosaicos visibles, SVG único por visor activo. El motor ARQ anterior conserva su índice espacial. No hay comparación válida SVG/Konva; no se incorpora Konva sin evidencia.
