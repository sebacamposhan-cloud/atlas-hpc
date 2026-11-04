# Navegación de terreno

Pensada para capataces y jefes de terreno, que trabajan en un solo piso.

## Flujo

1. Después de iniciar sesión se elige el piso entre las maquetas 3D apiladas. El último piso queda marcado. En celular y tablet se toca y se presiona «Continuar»; en computador se entra con doble clic.
2. El plano del piso queda de base. Arriba están la búsqueda, **Asistente**, **Sin conexión** y **Cerrar sesión**; abajo, **Pisos** y **Control de obra**. Junto al zoom, **Limpiar** quita en cualquier momento búsqueda, filtros, colores y selección.
3. **Control de obra** abre una rueda de tarjetas desde abajo, sin salir del plano.
4. Cada tarjeta devuelve el plano con sus botones de función, circulares y flotantes en el borde izquierdo:

| Tarjeta | Botones |
|---|---|
| Last Planner | Abre su panel de siempre. Es para jefatura y su interfaz no cambió. |
| Recintos | Avance, Observaciones y Resumen |
| Protocolos | Por tipo, Críticos y Resumen |
| Herramientas | Proyectos, Filtros y capas, y Más |

Atlas recuerda en cada equipo el último piso y la última función. Recintos se retoma pintando el plano; Protocolos deja sus botones sin abrir la lista.

La rueda y los pisos se mueven con el mouse, el dedo o la rueda del mouse (`dist/fluido.mjs`): siguen con suavidad, al soltar frenan solos y los vecinos llegan con un leve retraso. En los pisos, arrastrar cambia el piso elegido.

Pasar el cursor también ilumina en azul lo que tiene debajo. Si las cuatro tarjetas caben en la pantalla, la rueda queda centrada: la tarjeta bajo el cursor se acerca sin desplazar el grupo, y lo que se mueva con la mano vuelve al centro. En los pisos, el azul y la apertura siguen al cursor con el mismo flujo del arrastre; al salir, vuelven al piso elegido. El piso queda elegido, con ✓, al tocarlo, arrastrarlo o usar la rueda del mouse.

## Menú del recinto

Avance y Observaciones solo cambian lo que pinta el plano. Al tocar un recinto se abre siempre el mismo menú:

1. Rombo, avance general, observaciones y protocolos abiertos, todo en una pantalla.
2. Al tocar una parte del rombo se abre su menú de avance: el tipo de pavimento, muro o cielo en grande, y sus partidas y observaciones.

En celular y tablet, buscar un código ilumina el recinto y lo centra en el plano, sin abrir el menú; el menú se abre al tocar el recinto. En computador se abre de inmediato, a media pantalla.

Cada partida se despliega en palancas, en el orden en que se avanza: protocolo previo, ejecución y revisión. El pomo se arrastra o se toca la posición. Cada parada es un botón normal, y el guardado es el mismo de antes.

## Avance por recinto

«Ver datos de ejemplo» muestra el panel completo con una muestra para gerencia. Se calcula al vuelo: no se guarda, no se sincroniza y no toca los registros reales. Mientras está activa, el panel lo avisa y no se puede marcar avance.

«Avance real vs programado» muestra el % acumulado de partidas instaladas por semana. La línea real sale de la fecha del registro de cada recinto. Atlas todavía no tiene un programa de obra cargado, así que la línea programada solo aparece en los datos de ejemplo.

## Proyectos

Eliminar un proyecto pide confirmar con un segundo toque. La nube no borra registros: el proyecto queda marcado como eliminado y desaparece de las listas de todos los equipos.

## Archivos

- `dist/navegacion-model.mjs`: tarjetas, funciones y memoria, sin DOM (`navegacion-test.mjs`).
- `dist/navegacion.mjs` y `dist/navegacion.css`: barra inferior, rueda, botones y hojas.
- `dist/palanca.mjs`: palanca de estados.
- `dist/floor-explorer.mjs`: portada de pisos.
- `scripts/pisos-3d.mjs`: genera `dist/pisos3d/*.png` desde los contornos de cada piso.

## Actualizar las maquetas

Las maquetas no se actualizan solas. Si cambian muchos contornos de un piso:

1. Abre ese piso en Atlas y guarda en `<carpeta>/<piso>.json` la lista `[{d, t}]` de `#polygons path.roomshape`, con su atributo `d` y su título.
2. Corre `node scripts/pisos-3d.mjs <carpeta> dist/pisos3d`.
3. Regenera el manifiesto sin conexión.
