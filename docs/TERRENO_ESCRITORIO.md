# Terreno y escritorio

Atlas distingue dos tipos de equipo (`dist/dispositivo.mjs`):
- **Escritorio:** una pantalla de 1024 px o más manejada con mouse.
- **Terreno:** todo lo demás, sea celular o tablet.

Marca `body.escritorio` o `body.terreno`, y vuelve a marcar si cambia, por ejemplo al girar una tablet o achicar la ventana.

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
