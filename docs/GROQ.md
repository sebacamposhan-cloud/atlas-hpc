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

Este servidor entrega `dist/` y `/api/groq/chat` bajo el mismo origen. Sustituye al servidor HTTP estático en desarrollo cuando se quiera usar el chat. Por defecto mantiene el enlace en loopback. Para el alojamiento se configura ATLAS_HOST y se exige contraseña antes de admitir un enlace público.

## Sitio publicado

La configuración `.openai/hosting.json` actual publica **solo archivos estáticos**. Una clave por sí sola no habilita el chat allí: hace falta alojar el servicio Node y enrutar `/api/groq/chat` al backend mediante el mismo origen. El proxy debe conservar Host/Origin y terminar HTTPS. La configuración Render incluida activa acceso compartido por contraseña; para escalar deben añadirse cuentas individuales y límites persistentes. Este incremento no despliega ni crea esa infraestructura y no expone un endpoint público sin autenticación.

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

## Despliegue preparado en Render

`render.yaml` configura un único servicio Node que sirve Atlas y Groq bajo la misma dirección. Solicita plan `free`, usa la rama `feat/cielos-navigation-association` y deja desactivados los despliegues automáticos. No se ha creado ningún recurso externo desde este repositorio.

1. Crear una cuenta en Render y conectar GitHub con acceso al repositorio privado `sebacamposhan-cloud/atlas-hpc`.
2. Crear un Blueprint desde ese repositorio, seleccionando la rama `feat/cielos-navigation-association` y el archivo `render.yaml`.
3. Introducir `GROQ_API_KEY` en el campo secreto solicitado por Render y revisar el servicio antes de iniciar el despliegue. No copiar la clave a Git ni al chat.
4. Render genera `ATLAS_ACCESS_PASSWORD`; consultarla en sus variables de entorno. El usuario de acceso a Atlas es `atlas`. La contraseña es distinta de la API key.
5. Abrir la dirección que proporcione Render, entrar con esas credenciales y probar «Asistente». Si Groq rechaza el modelo, ejecutar `server/groq-check.mjs` en un entorno con la clave inyectada y actualizar `GROQ_MODEL` con un ID habilitado.

El servidor admite el `PORT` asignado por el alojamiento y `ATLAS_HOST=0.0.0.0`. Rechaza ese enlace público si no hay `ATLAS_ACCESS_PASSWORD`. El acceso básico protege tanto archivos como API; `/healthz` solo devuelve el estado del proceso, sin documentos ni claves. Render debe terminar HTTPS. Esta protección es un acceso compartido inicial; no implementa roles o cuentas individuales.

**Antes de cambiar de dirección de Atlas, exportar los respaldos de recintos y de obra del sitio actual.** LocalStorage, IndexedDB y las descargas offline pertenecen a cada origen/navegador: no se trasladan automáticamente al dominio nuevo. Importar los respaldos en el nuevo sitio y verificar su contenido antes de abandonar el anterior.

Pruebas locales no equivalen a un despliegue Render validado. La disponibilidad del plan/modelo, autenticación real de Groq y funcionamiento en el dominio final se comprobarán después de conectar la cuenta y desplegar. El plan gratuito puede suspender el servicio durante inactividad y tardar en el primer acceso.
