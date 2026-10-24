# Atlas HPC 2.0 — Auditoría e implementación, 23-10-2026

## Punto seguro

Commit previo: f59c86a55c0908cdc6813aff7bb710887ff54f65. Tag local atlas-pre-2.0-f59c86a. El historial Git remoto conserva ese commit. Proyecto appgprj_6ad820afe9a88191955ef80183409dcb, acceso público conservado. Sin sustitución de originales, geometrías ni códigos.

## Fase 0: resultados

HTML/CSS y módulos JavaScript nativos, sin React, TypeScript, Vite ni Next. Build estático dist. No servidor de consulta. SVG para plano y polígonos, WebP por niveles de detalle, índice espacial de consulta, rutas cacheadas. Exportadores XLSX/PDF locales cargados bajo demanda. Cache Storage + service worker versionado; correcciones en localStorage con versiones e historial. Nueve fuentes, 443 etiquetas, 330 recintos consolidados dentro de A–W / 1–12. 158 contornos técnicos (2 validados en el área). Datos compactos de apertura 378217 bytes, overview 157890 bytes.

Problemas detectados: colorBy era forzado a none y CSS ocultaba el selector; dashboard era una ventana con estadísticas de terminaciones mezcladas; no existía tabla maestra; capas reinstanciadas mediante innerHTML; edición sin deshacer/rehacer; recuperación previa a importación no automática. La revisión del pintado inicial detectó que «Esmalte» no contiene «Pintura»: el clasificador textual incluye ambos términos de la leyenda, solo en M1–M4.

## Referencias obligatorias y licencias

Se inspeccionaron los README, estructura y documentación pública de los cinco repositorios mediante GitHub el 23-10-2026. Todos declaran MIT. No se copiaron archivos de esos proyectos ni se incorporaron dependencias; las implementaciones nuevas son nativas. Se conservaron las licencias de las bibliotecas existentes en dist/vendor.

- https://github.com/satnaing/shadcn-admin — referencia de sidebar, búsqueda global, sheet y jerarquía sobria. Su stack React/Vite/Radix/Tailwind no coincide con Atlas. Adaptación visual, no instalación de shadcn/ui.
- https://github.com/Kiranism/next-shadcn-dashboard-starter — patrones de búsqueda, orden, paginación, formularios y organización por funciones. Sin migración a Next ni servicios Clerk.
- https://github.com/TailAdmin/free-react-tailwind-admin-dashboard — KPI compactos, barras y tarjetas. Indicadores calculados desde los registros, sin datos de demostración.
- https://github.com/tinkersoder/floorplan-studio — SVG, capas, persistencia IndexedDB, historial y JSON. Sin integración Home Assistant.
- https://github.com/konvajs/react-konva — requiere React/ReactDOM y Konva; aporta escena Canvas. No se ha ejecutado una comparación real SVG vs React Konva. No se instala sin evidencia de mejora. Se conserva SVG y se reduce la reconstrucción de sus nodos; la comparación sigue pendiente, no se presenta SVG como ganador de un ensayo inexistente.

## Fases 1–4 implementadas

workspace.css y workspace.mjs: cinco módulos con navegación plegable, dashboard, tabla maestra, fuentes y capas. Diseño responsive y ficha redimensionable en escritorio. El buscador global, tabla, indicadores y plano comparten datos, filtros y selección. Tabla con 30 filas por página, orden, pendientes de calidad y exportación. Gráficos de asepsia, PAV, pintura, cielo, muros y sector son accionables. layers.mjs separa categorías por campo, suma selecciones dentro de una capa e intersecta entre capas. Una sola capa controla color, evitando mezcla ambigua; colores configurables. Asepsia baja verde/media azul. Ausencias no se convierten en datos documentados.

No se altera ninguna superficie técnica validada. Las superficies auxiliares conservan los huecos y anillos; la exactitud de todos sus límites NO queda certificada por esta publicación. Pintura mixta de muro conserva el código de leyenda, no se convierte en una pintura pura.

## Fase 5 implementada y límites

Editor con historial de 100 operaciones, deshacer/rehacer y cancelación. Para recintos sin contorno técnico se ofrece la superficie auxiliar simple como punto de partida, sin modificar el original al abrir. Recintos compuestos sin contorno técnico requieren un editor multianillo futuro; se bloquea su sustitución para evitar perder anillos. La ficha conserva su edición y registro de responsable/motivo. Se añade IndexedDB como diario de recuperación antes de modificaciones/importación, sin borrar ni migrar destructivamente localStorage. Respaldo JSON portable y descarga de copia anterior. Las preferencias de colores se conservan localmente.

Service worker incluye módulos nuevos y mantiene actualización por huellas, preservando paquetes anteriores si falla la nueva descarga. Las tareas principales siguen operando con recursos locales. PDF originales opcionales. Exportación XLSX/CSV, geometrías de consulta JSON, PNG y PDF del plano con leyenda textual y fuentes.

## Fase 6: verificación y límites

Pruebas Node: test, runtime-test, selection-test, atlas-test, interaction-test, offline-test, offline-ui-test, layers-test. Las pruebas de red cortada utilizan adaptadores aislados del service worker real, NO equivalen a cortar conectividad en Safari físico. El preview HTTP administrado no permite registrar el SW; prueba offline real en HTTPS e iPhone sigue pendiente.

QA navegador de escritorio: dashboard 330/2/2/0,6%; gráfico media => 72 recintos azules; tabla y selección; controles de capas y búsqueda. Medición inicial índice: 10000 puntos, 24,61 ms; repetición 9,17 ms. Variación de entorno/JIT, no mejora atribuible a un cambio del índice (no se modificó). Nuevo filtro combinado: mediana ~0,106 ms por 330 registros, p95 ~0,146 ms en Node. El tamaño de datos compacto y la geometría no cambian. El núcleo offline aumenta ~32 kB por nuevas funciones. No se afirma aceleración real de carga o FPS de iPhone.

Objetivos para dispositivos: selección p95 <100 ms con recursos residentes, desplazamiento sin tareas >50 ms repetidas, sin degradar la legibilidad ni geometrías. Pendiente medir con CPU móvil/red lenta, hacer comparación Konva, validar todos los contornos, editor multianillo y probar offline en dispositivo real. Estas limitaciones impiden declarar cumplidos todos los criterios de aceptación del prompt.

QA adicional: vista responsive 390×844 mediante iframe de prueba (no dispositivo físico); editor quitar vértice/deshacer restauró 69 vértices y 3 huecos sin guardar; formulario de ficha guardado con historial en origen de preview sin cambiar atributos documentales. Se corrigieron dos defectos: el evento click se interpretaba como bandera de edición geométrica, y una corrección solo documental podía sustituir la superficie auxiliar al recargar. La prioridad geométrica manual ahora exige método de edición manual explícito.
