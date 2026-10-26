# Asistente Groq de Atlas

El botón «Asistente» abre una conversación general y permite consultar/resumir la ficha original del recinto seleccionado. El backend añade código, nombre, superficie declarada, terminaciones y referencia documental (revisión, página y hash). No carga automáticamente todos los PDF ni envía bases SQLite, correcciones locales o historiales. La conversación vive en memoria de la pestaña y puede limpiarse con «Nueva conversación».

## Configuración segura

Introducir `GROQ_API_KEY` como secreto del **backend**, nunca en `dist/`, Git o el chat. En el entorno Codex se declaró el requisito seguro con destino `api.groq.com`; guardar el borrador no introduce la clave, aplica cambios ni publica el servicio. Revisar/guardar y publicar la configuración del entorno cuando corresponda. El despliegue del backend requiere su propio secreto en el proveedor que lo ejecute.

Variables opcionales:

- `GROQ_MODEL`: modelo habilitado en tu cuenta. Valor inicial `llama-3.3-70b-versatile`; verificar disponibilidad con el comando siguiente antes de usarlo.
- `GROQ_MAX_TOKENS`: máximo por respuesta; 1024 por defecto, hasta 8192.
- `GROQ_MAX_REQUESTS`: máximo de intentos por proceso; 60 por defecto. Se reinicia al reiniciar Node y no es contabilidad de facturación.
- `ATLAS_PORT`: puerto local, 8000 por defecto.

Con el secreto ya inyectado, comprobar autenticación y modelos sin generar una respuesta de pago:

```sh
cd /workspace/atlas-hpc
node server/groq-check.mjs
```

Si el modelo inicial no aparece, configurar `GROQ_MODEL` con un ID disponible. No imprime credenciales. Después arrancar:

```sh
node server/groq-server.mjs
```

Este servidor entrega `dist/` y `/api/groq/chat` bajo el mismo origen. Sustituye al servidor HTTP estático en desarrollo cuando se quiera usar el chat. Mantiene el enlace en loopback; solo atenderá conexiones locales o de un proxy local.

## Sitio publicado

La configuración `.openai/hosting.json` actual publica **solo archivos estáticos**. Una clave por sí sola no habilita el chat allí: hace falta alojar el servicio Node y enrutar `/api/groq/chat` al backend mediante el mismo origen. El proxy debe conservar Host/Origin y proporcionar autenticación de usuarios, HTTPS y límites persistentes antes de exponer el servicio. Este incremento no despliega ni crea esa infraestructura y no expone un endpoint público sin autenticación.

No activar CORS abierto ni llamar Groq directamente desde JavaScript del navegador. La API key permanece en el servidor; el frontend solo recibe respuestas. Los mensajes se renderizan como texto y no se ejecutan como HTML.

## Validación

```sh
node groq-test.mjs
PLAYWRIGHT_MODULE=/workspace/atlas-browser-tools/node_modules/playwright-core/index.mjs CHROMIUM_PATH=/usr/bin/chromium node groq-browser-test.mjs
node construction-test.mjs
node offline-test.mjs
```

Las pruebas usan un proveedor simulado y HTTP real local: validación de mensajes, contexto de recinto, secreto solo en backend, origen, límite por proceso, errores del proveedor y conversación en escritorio/móvil. No acreditan que una clave real funcione. La comprobación real queda pendiente de configurar la credencial y verificar el modelo. El visor offline conserva su funcionamiento; la IA requiere conexión y backend.

El adaptador Groq es independiente del adaptador IA opcional anterior, que continúa desactivado por defecto para sus consumidores existentes.
