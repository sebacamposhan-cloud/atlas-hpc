# Terreno y escritorio

Atlas distingue dos tipos de equipo (`dist/dispositivo.mjs`):
- **Escritorio:** una pantalla de 1024 px o más manejada con mouse.
- **Terreno:** todo lo demás, sea celular o tablet.

Marca `body.escritorio` o `body.terreno`, y vuelve a marcar si cambia, por ejemplo al girar una tablet o achicar la ventana.

## Navegación: directo al plano, sin módulos
Decidido con Mauro el 2026-11-16, después de que Sebastian pidiera una navegación «a prueba de tontos».

- **Entrada:** Atlas abre directo el plano del piso, en el celular y en el escritorio. Ya no hay pantalla de Módulos ni pila de pisos.
  - Abre el último piso usado en ese equipo si sigue disponible; si no, el primero disponible.
  - Con perfil de obra, solo cuentan sus pisos asignados (`pisoDeEntrada` en `navegacion-model.mjs`, `entrarTerreno` en `floor-explorer.mjs`).
  - Las direcciones con piso y los QR funcionan como antes.
- **Tu cuenta (arriba a la izquierda):** tus iniciales en un círculo y «Piso N ▾». Al tocarlos sube una hoja con:
  - tu nombre y correo;
  - tus pisos para elegir, con su estado sin conexión y «Guardar»;
  - «Sin conexión y actualizaciones»;
  - «Cerrar sesión».

  El botón de descarga y el de cerrar sesión salieron de la cabecera.
- **Herramientas** está en Plano y reúne Proyectos, Filtros y capas, Puertas e Impermeabilización (solo en el −1). Las tarjetas sueltas de Filtros, Puertas e IMP quedan ocultas, por permisos y direcciones antiguas.
- **Celular, barra de abajo:**
  - **Plano** cierra lo que esté abierto y deja el plano a la vista.
  - **Mis tareas** abre la libreta (o Last Planner, si la cuenta no tiene libreta).
  - **Más** sube los accesos en cuadrícula, agrupados en Control, Plano y Protocolos (`accesosMas`). Cada función es un acceso directo.

  La búsqueda es la de arriba.
- **Escritorio, columna izquierda:** la libreta y los grupos Control, Plano y Protocolos, uno debajo de otro.
- **«Ver simbología»** se quitó.
- **Avance y observaciones** siguen en el rombo del recinto, a un toque desde el plano o la búsqueda.
- **Proyectos:** al quitar un recinto, los siguientes se renumeran (1, 2, 3… sin huecos).
- **Sin cubrir:** la vista de varios pisos a la vez (franja de pisos) ya no tiene cómo elegirse.

## Terreno: solo herramientas de terreno
Decidido con Mauro el 2026-11-09.

**Qué queda en el celular:**
- la agenda Hoy y Esta semana;
- Last Planner, con el reporte diario;
- Proyectos completo;
- el plano con el rombo, las observaciones con foto, los filtros, las puertas y los protocolos;
- la búsqueda de recintos, Sin conexión y el Asistente.

**Qué pasa a ser de oficina**, solo en escritorio:
- Avance y la matriz de protocolos, con sus tablas grandes;
- el «Resumen» de Recintos y de Protocolos;
- Respaldo JSON e Importar respaldo de Last Planner;
- Exportar plano, Documentos fuente, Rombos y Respaldos en «Más».

Las tarjetas y funciones de oficina salen de `paraTerreno()` en `navegacion-model.mjs`. Los elementos sueltos llevan `data-oficina`, y `terreno.css` los esconde.

**Búsqueda:** Enter ya no abre el panel de oficina.
- Un código exacto enciende el recinto y lo centra; un toque lo abre.
- Varios resultados se listan en la hoja.

**Listas de más de 8 opciones** (`selector-flujo.mjs`): se muestran como lista vertical con buscador. Las tarjetas de flujo siguen para módulos, vistas y listas cortas.

**Protocolos sin pérdida de información** (`protocolo-folio.mjs`):
- Cada folio tiene una sola ficha, a la que se llega desde el plano, la lista por tipo y el recinto.
- Arriba van estado, días abierto, dónde, quién recibe, elaboración y cierre. Debajo, siempre a la vista, los 16 datos de la matriz.
- El recinto muestra los folios abiertos y los cerrados. Los cerrados van plegados.
- Un aviso fijo da la fecha de corte del Excel.

**Agenda** (`agenda.mjs`):
- La portada de Control muestra las tareas de Hoy (con lo atrasado y lo devuelto) y de Esta semana, hasta el domingo.
- «Mis tareas» queda separada igual.
- Una tarea con actividad de Last Planner ofrece «Reporte diario en Last Planner».

**Supervisor de piso o capataz** (nivel 4): tiene Last Planner y Proyectos completo.

## Escritorio: tres paneles
Decidido con Mauro el 2026-11-09. Archivo: `escritorio.css`.

La entrada, es decir los módulos y los pisos 3D, sigue igual, con tarjetas de flujo. Dentro de un piso:
- **Izquierda:** Módulos, Pisos y las tarjetas del módulo, una debajo de otra y siempre a la vista. Son las mismas tarjetas, y la abierta va en azul.
- **Centro:** el plano.
- **Derecha:** la ficha del recinto, la hoja o el panel de protocolos o de puertas.
  - Last Planner, Avance y la matriz usan todo el ancho junto a la columna.
  - En la portada de Control y de Protocolos va el resumen del piso (`resumen-piso.mjs`): partidas instaladas, recintos completos, Mis tareas, observaciones pendientes, protocolos abiertos y críticos. Cada número abre su detalle.

No hay barra inferior ni encabezados repetidos.

## Pruebas
- `navegacion-test.mjs`: terreno, «Más» y hojas de estilo.
- `agenda-test.mjs`: agenda y ficha del folio.
- `puertas-avance-test.mjs`.
- Los recorridos en Chromium (`modulos-browser-test.mjs`, `jerarquia-browser-test.mjs`) no están en el build de Render.
