# Motores abiertos para planos 2D

Se consultaron los metadatos, licencias declaradas y README de los repositorios enlazados. No se copiaron fuentes de Dalux. El incremento de edición incorpora Leaflet, Geoman Free y validadores Turf locales; ver `CONTOUR_EDITOR.md`. La tabla conserva alternativas evaluadas, sin constituir un benchmark.

## Opciones verificadas en GitHub

| Proyecto | Qué aporta a Atlas | Licencia observada | Encaje |
|---|---|---|---|
| [That Open Components](https://github.com/ThatOpen/engine_components) | Herramientas BIM de navegador sobre Three.js: selección, dimensiones, navegación por plantas y exportación DXF, según README | MIT; revisar también las dependencias utilizadas | Candidato principal para una futura vista BIM con IFC real |
| [web-ifc](https://github.com/ThatOpen/engine_web-ifc) | Lectura/escritura de IFC con motor compilado para JavaScript/WASM | MPL-2.0 | Importación de geometría y propiedades IFC; no deduce habitaciones desde un PDF |
| [Leaflet](https://github.com/Leaflet/Leaflet) + [Leaflet-Geoman](https://github.com/geoman-io/leaflet-geoman) | Navegación 2D, overlays, dibujo y edición de geometrías; Geoman declara soporte de multipolígonos y herramientas geométricas | BSD-2-Clause + MIT para el repositorio abierto de Geoman | Candidato para piloto de editor 2D sobre coordenadas de plano. Verificar qué herramientas pertenecen a Free o Pro antes de prometerlas |
| [OpenSeadragon](https://github.com/openseadragon/openseadragon) | Navegación y zoom de imágenes de gran resolución mediante teselas | BSD-3-Clause | Candidato para un visor 2D centrado en nitidez/zoom; requiere una capa adicional para contornos/rombos |
| [xeokit](https://github.com/xeokit/xeokit-sdk) | SDK WebGL BIM/IFC con selección, plugins y modelos XKT derivados de IFC | AGPL-3.0 en el repositorio consultado; el proyecto ofrece opciones comerciales | Alternativa BIM sólida a evaluar con sus condiciones de distribución antes de adoptarla |
| [Speckle Server](https://github.com/specklesystems/speckle-server) | Plataforma AEC con backend, frontend y visor 3D, integraciones e intercambio de datos | README: Apache-2.0 salvo módulos con licencia distinta; GitHub no resuelve una licencia única | Encaja más en colaboración/sincronización; es una adopción mucho mayor que reemplazar un visor |
| [PDF.js](https://github.com/mozilla/pdf.js) | Renderizado de PDF y consulta de regiones | Apache-2.0 | Ya está integrado en Atlas; reutilizarlo y probar mejor el recorrido publicado |

Los repositorios consultados no aparecían archivados. Su actividad reciente por sí sola no demuestra estabilidad ni rendimiento en nuestros planos.

## Decisión para los PDF disponibles

Para los archivos disponibles hoy (PDF 2D), se integró **Leaflet + Geoman Free** en el editor de contornos y **OpenSeadragon** si el cuello medido es navegación/nitidez de teselas. Comparar ambos con el visor actual antes de elegir uno: no instalar los tres motores en la misma vista por defecto.

Para una experiencia BIM real, el candidato inicial es **That Open Components + web-ifc**. Requiere archivos IFC de proyecto y correspondencias verificadas con los códigos de recinto; los PDF actuales no aportan por sí solos objetos BIM, GUID, niveles ni relaciones espaciales. El flujo de Dalux puede servir como referencia de producto, pero no sustituye esos datos.

## Criterios del piloto antes de adoptar

1. Usar la misma fuente, coordenadas y recinto de referencia; conservar ID, código, seis campos, hash y revisión.
2. Comprobar rombo↔código sin apoyarse en el contorno, incluidos N/A/S/E y referencias alfanuméricas.
3. Editar un contorno irregular, uno con huecos, uno compuesto y una circulación, sin incorporar mobiliario como huecos.
4. Probar selección interior y exclusión de vecinos, undo/redo, historial y reversión. Los contornos pendientes no adquieren aprobación por cambiar de motor.
5. Medir navegación y memoria en escritorio/móvil con los datos reales, misma escala y teselas. Un ejemplo comercial fluido no constituye un benchmark de Atlas.
6. Verificar servicio Node real, autenticación, service worker activo, actualizaciones y reapertura offline, con imágenes efectivamente decodificadas.
7. Incorporar licencias/avisos y fijar versiones solo de las dependencias elegidas.

## Qué está fallando hoy

La aplicación web es una tecnología válida para este trabajo: estas alternativas también ejecutan visores en el navegador. La dificultad documental viene de pasar de PDF a entidades trazables: rombo/código, atributos, transformaciones y perímetros. Las superficies auxiliares no son contornos técnicos certificados.

El fallo de imágenes reportado por el usuario debe investigarse además como problema de entrega en ejecución. En una reproducción local con Node, contraseña y service worker activo, el rombo `/assets/501-5016771b/r0037.png` carga correctamente. No se ha establecido la causa del fallo en Render: no atribuirla sin evidencia a SVG, a una biblioteca concreta o al formato web.

Se añadió una prueba HTTP de las 1.171 imágenes del manifiesto (incluye los 443 rombos): autenticación, MIME, bytes y hash desde el backend real. Descubrió y corrigió la falta de MIME explícito para JPG/JPEG; eso no demuestra que fuera la causa del PNG roto de la captura. Render ejecutará esa prueba en el build cuando su comando se actualice. El test de navegador de despliegue añade autenticación y service worker reales; las pruebas anteriores solían bloquearlo.

No usar «las pruebas pasan» como sinónimo de «el sitio publicado está aceptado». Falta observar el estado HTTP/decodificación en la instancia donde ocurre el fallo y validar allí el recorrido completo.
