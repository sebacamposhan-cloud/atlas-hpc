# Context7 y Modern Web Guidance en ATLAS HPC

Instala estas herramientas en el perfil de Codex que uses para desarrollar ATLAS. Los comandos se ejecutan fuera del proceso de build. La configuración del perfil y las credenciales se guardan fuera del repositorio.

## Context7

Registra el servidor MCP remoto de Upstash en Codex CLI:

```sh
codex mcp add context7 --url https://mcp.context7.com/mcp
codex mcp get context7
```

Si necesitas una clave para autenticarte o ampliar la cuota, obtén una en el [panel de Context7](https://context7.com/dashboard?tab=settings). Guárdala como secreto `CONTEXT7_API_KEY` en el gestor de secretos de tu entorno de desarrollo y haz que esté disponible como variable de entorno al iniciar Codex. Para configurar el encabezado Bearer en una instalación nueva, usa:

```sh
codex mcp add context7 --url https://mcp.context7.com/mcp --bearer-token-env-var CONTEXT7_API_KEY
```

Si ya registraste el servidor sin clave, elimina esa entrada con `codex mcp remove context7` antes de volver a agregarla. Guarda únicamente el nombre de la variable en la configuración. Abre una nueva sesión de Codex y comprueba que el MCP resuelve la biblioteca y devuelve documentación. Que aparezca en `codex mcp get` confirma el registro local.

- Comprueba primero la versión en el código o en el lockfile. El editor de contornos fija Leaflet 1.9.4 en [su lockfile](../tools/contour-editor/package-lock.json).
- Ejemplo de consulta: «Usa Context7 para consultar `fitBounds` e `invalidateSize` en Leaflet 1.9.4 para el visor al redimensionar su contenedor. Indica qué versión respalda cada API». Si Context7 devuelve documentación de otra versión o una referencia sin versión, contrasta con la versión fijada antes de aplicar el ejemplo.

[Instrucciones oficiales de Context7](https://github.com/upstash/context7)

## Modern Web Guidance

```sh
codex plugin marketplace add GoogleChrome/modern-web-guidance
codex plugin add modern-web-guidance@googlechrome
codex plugin list
```

En una nueva sesión de Codex, pide que use Modern Web Guidance para buscar y recuperar una guía aplicable. También puedes consultar las guías directamente con la CLI, sin modificar las dependencias de ATLAS:

```sh
npx -y modern-web-guidance@latest search "responsive form layout"
npx -y modern-web-guidance@latest retrieve navigation-drawer
```

- Para responsive y accesibilidad, revisa formularios a 320 y 390 px. Comprueba etiquetas, mensajes de error, orden de foco, navegación por teclado y objetivos táctiles. Contrasta las APIs propuestas con los navegadores objetivo y usa las alternativas que correspondan.
- Para el visor arquitectónico, prueba el zoom y el desplazamiento táctil, la selección de recintos y el acceso a los controles después de cambiar tamaño u orientación. Para rendimiento, mide la apertura y la respuesta durante esas interacciones en un navegador móvil o dispositivo representativo.
- Conserva las pruebas existentes según el flujo que cambie. El [editor de contornos](CONTOUR_EDITOR.md) cubre guardado y recarga, exportación con PDF real y geometría con huecos y partes. Las [pruebas de documentos de marcado](MARKING_DOCUMENTS.md) comprueban el PDF, el respaldo, la restauración y la separación de pisos. Usa las pruebas de navegador indicadas allí para validar flujos completos.

[Instrucciones oficiales de Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance)
