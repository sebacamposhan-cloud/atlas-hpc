# Navegación de Atlas

Pensada para jefes de terreno, que tienen varios pisos a su cargo, y para capataces y supervisores, que trabajan en uno.

## Flujo

1. **Módulo.** Después de iniciar sesión se elige Control, Plano o Protocolos. El último módulo queda marcado.
2. **Piso o pisos.** Se eligen entre las maquetas 3D apiladas y se avanza con **Continuar**, en celular y en computador. Quien tiene un solo piso disponible se salta este paso.
3. **Módulo abierto.** Control y Protocolos parten en sus tarjetas, sin plano. Plano parte en el plano del piso.

Los enlaces con piso, los QR de recintos y los enlaces a tareas entran directo, sin pasar por Módulos.

Arriba están la búsqueda, **Asistente**, **Sin conexión** y **Cerrar sesión**. Abajo están **Módulos**, **Pisos** y el botón del módulo abierto, que muestra sus tarjetas. Junto al zoom, **Limpiar** quita en cualquier momento búsqueda, filtros, colores y selección.

| Módulo | Tarjetas |
|---|---|
| Control | Mis tareas (con perfil), Last Planner, Avance y Herramientas (Proyectos y Más) |
| Plano | Recintos (Avance, Observaciones y Resumen) y Filtros y capas |
| Protocolos | Por tipo, Críticos y Resumen |

Supervisores y capataces no ven Last Planner ni los Resumen, y su Herramientas solo trae Más.

Atlas recuerda en cada equipo el último módulo, los últimos pisos y la última función. Recintos se retoma pintando el plano.

## Varios pisos

En Control y Protocolos, las jefaturas (niveles 0 a 3), Planificación y Calidad pueden elegir varios pisos. Supervisor, capataz y las cuentas sin perfil eligen uno. En Plano siempre se ve un piso.

Con varios pisos se ve uno a la vez, y una franja arriba cambia de piso. No hay un total entre pisos. Lo que actúa sobre un piso, como publicar y cerrar en Last Planner, Proyectos y Más, usa el piso que se está viendo.

La página siempre tiene cargado un solo piso (`dist/pisos.js`). Last Planner cambia de piso sin recargar. Lo demás recarga y vuelve a la misma tarjeta y vista con `#abrir=tarjeta:vista`.

## Tarjetas con flujo

Todas las selecciones usan las mismas tarjetas (`dist/selector-flujo.mjs`). Se mueven con el mouse o el dedo: siguen con suavidad, al soltar frenan solas y las vecinas llegan con un leve retraso (`dist/fluido.mjs`). Pasar el cursor ilumina en azul la tarjeta que tiene debajo y la acerca. Si caben todas, quedan centradas; si no, la del centro queda de frente y las demás giran alrededor.

Hay tres tamaños:

- **Grande**, como la rueda, con dibujo: vistas de Last Planner, de la ficha de actividad y de los Resumen.
- **Media**, con un número o dos líneas: estados de Observaciones, días de Last Planner diario, personas y listas de protocolos.
- **Baja**, de una línea: franja de pisos, tipos de plano, listas desplegables, porcentajes, motivos, estados de levantamiento, herramientas de fotos y filtros de columna.

`GRUPOS` dice qué grupos de botones se muestran así. La pantalla conserva sus botones, sus atributos y su lógica. Las listas desplegables siguen existiendo ocultas: las tarjetas cambian su valor y avisan como siempre. El rombo y las palancas quedan fuera a propósito.

En los pisos, el azul y la apertura siguen al cursor con el mismo flujo del arrastre, y al salir vuelven a los elegidos. Con un solo piso, tocarlo, arrastrarlo o usar la rueda del mouse lo elige. Con varios, cada toque lo marca o lo desmarca.

## Menú del recinto

Avance y Observaciones solo cambian lo que pinta el plano. Al tocar un recinto se abre siempre el mismo menú:

1. Rombo, avance general, observaciones y protocolos abiertos, todo en una pantalla.
2. Al tocar una parte del rombo se abre su menú de avance: el tipo de pavimento, muro o cielo en grande, y sus partidas y observaciones.

En celular y tablet, buscar un código ilumina el recinto y lo centra en el plano, sin abrir el menú; el menú se abre al tocar el recinto. En computador se abre de inmediato, a media pantalla.

Cada partida se despliega en palancas, en el orden en que se avanza: protocolo previo, ejecución y revisión. El pomo se arrastra o se toca la posición. Cada parada es un botón normal, y el guardado es el mismo de antes.

## Avance por recinto

Avance muestra solo registros reales: los datos de ejemplo se quitaron de esta sección (11-11-2026). Last Planner conserva los suyos por ahora.

El gráfico «Trabajo pendiente por sector» usa los tres sectores de obra, definidos sobre el piso 2: 1 (láminas A-501 y A-505), 2 (el medio) y 3 (desde el eje AJ hacia el AW). Como las láminas no se numeran igual en los demás pisos, la regla se mide con los ejes de cada piso: el sector 1 termina entre AD y AE, a 0,7376 del tramo (el borde de las láminas 501 y 505 del piso 2), y el sector 3 empieza en AJ. Cada recinto se ubica por su rótulo. En el piso 2 el resultado coincide recinto por recinto con las láminas. La capa «Bordes de sectores» (Filtros y capas) se arma al cargar cada piso con esas mismas líneas, sobre el plano y debajo de los recintos. Ver `dist/sectores-model.mjs`.

Los edificios complementarios no entran en Atlas (`dist/obra-complementaria.mjs`): en el −1, el anexo al oriente del eje A12 (lámina A-509, ampliaciones A-511/A-512 y el borde oriente de las láminas 505 a 507, 66 recintos); en el piso 1, la lámina A-510 (casetas de guardia y central de gases clínicos, 5 recintos), y el plano del piso 1 se acota a las láminas A-501 a A-508. Se quitan al cargar el piso y al leer las planillas de avance.

«Avance real vs programado» muestra el % acumulado de partidas instaladas por semana. La línea real sale de la fecha del registro de cada recinto. Atlas todavía no tiene un programa de obra cargado, así que por ahora solo se dibuja la línea real.

## Proyectos

Crear un proyecto pide solo el nombre y para qué es (lista desplegable con «Personalizado»). El autor es quien inició sesión, también al guardar un corte. El nombre y el propósito se editan después en «Datos y leyenda» (marcado) o «Datos y columnas» (levantamiento y avance de partida); en un levantamiento cambian en todos sus pisos.

Herramientas en Control cierra el panel abierto (por ejemplo, Avance) y deja el plano con Proyectos y Más.

Eliminar un proyecto pide confirmar con un segundo toque. La nube no borra registros: el proyecto queda marcado como eliminado y desaparece de las listas de todos los equipos.

## Archivos

- `dist/navegacion-model.mjs`: módulos, tarjetas, funciones, memoria y direcciones, sin DOM (`navegacion-test.mjs`).
- `dist/navegacion.mjs` y `dist/navegacion.css`: barra inferior, rueda, franja de pisos, botones y hojas.
- `dist/selector-flujo.mjs` y `dist/flujo.css`: tarjetas con flujo de toda la app.
- `dist/palanca.mjs`: palanca de estados.
- `dist/floor-explorer.mjs`: portada de módulos y pisos.
- `modulos-browser-test.mjs`: recorrido en navegador, fuera del build porque necesita Playwright.
- `scripts/pisos-3d.mjs`: genera `dist/pisos3d/*.png` desde los contornos de cada piso.

## Actualizar las maquetas

Las maquetas no se actualizan solas. Si cambian muchos contornos de un piso:

1. Abre ese piso en Atlas y guarda en `<carpeta>/<piso>.json` la lista `[{d, t}]` de `#polygons path.roomshape`, con su atributo `d` y su título.
2. Corre `node scripts/pisos-3d.mjs <carpeta> dist/pisos3d`.
3. Regenera el manifiesto sin conexión.
