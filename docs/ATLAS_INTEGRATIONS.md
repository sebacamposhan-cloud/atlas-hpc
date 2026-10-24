# Integraciones

El visor, búsquedas, avances y protocolos no llaman proveedores de IA. Dalux no se conecta ni se extrae: solo existe acceso declarado a Quantities, no API autorizada.

`server/ai-adapter.mjs` es un módulo opcional fuera de dist, no desplegado por el sitio estático. Configuración futura exclusiva de backend: ATLAS_AI_ENABLED, ATLAS_AI_BASE_URL (HTTPS), ATLAS_AI_API_KEY, ATLAS_AI_MODEL, ATLAS_AI_TIMEOUT_MS, ATLAS_AI_MAX_REQUESTS, ATLAS_AI_MAX_COST. Desactivado por defecto. Requiere estimación de coste y validador de estructura; timeout y errores HTTP explícitos. Los límites son por instancia y deben reemplazarse por un contador persistente antes de producción; no es contabilidad real de costos. No hay claves ficticias ni secretos frontend. Prueba: desactivado realiza cero solicitudes.

SQLite es local de ingeniería. Importar el respaldo de obra con `python3 scripts/import-work-backup.py respaldo.json`; conserva registros existentes y crea copia previa. No hay sincronización automática entre usuarios/dispositivos. Las tablas de cerraduras y referencias autorizadas de llaves están fuera del contenido servido; no publicar combinaciones de fabricación o corte.

No se añadieron bibliotecas frontend ni se copiaron repositorios de referencia en este incremento. Se conserva el enfoque visual de la versión2 y el stack existente. PyMuPDF y NumPy se usan en scripts offline del entorno, no en el cliente; revisar sus condiciones de distribución antes de empaquetar un ejecutable externo. No se ha realizado benchmark Konva: su incorporación no está justificada todavía.
