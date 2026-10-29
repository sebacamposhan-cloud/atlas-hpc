# Last Planner en Control de obra

Control de obra → **Last Planner** reúne el plan de producción de la obra según el Last Planner System. Las funciones vienen del pedido del jefe de producción (29-10-2026); la organización en tarjetas, la navegación por estados con contadores y los indicadores en cuadros siguen la estructura de plataformas como FunBIM.

El panel tiene cinco vistas.

| Vista | Para qué sirve |
|---|---|
| **Resumen** | Indicadores de la semana: PPC de la semana y de las últimas 4, restricciones pendientes y asistencia a la última reunión. Gráficos de PPC por semana, estado de la semana, causas de no cumplimiento, cumplimiento por responsable y por sector, restricciones por tipo y frentes de trabajo. |
| **Plan semanal** | Compromisos de la semana. Cada actividad registra sector, frente, recintos, responsable, cantidad, dotación y plazo. Se filtran por estado, sector y responsable. Desde aquí se inicia, se cierra o se reprograma una actividad, y se puede exportar a CSV. |
| **Intermedio y restricciones** | Seis semanas hacia adelante: actividades sin comprometer y sus restricciones (puntos de bloqueo), que se liberan una a una. Una actividad liberada se compromete en la semana elegida con un toque. |
| **Reuniones y frentes** | Reuniones de producción con asistencia por persona y empresa, frentes de trabajo (dotación y estado) y acuerdos. Cada reunión nueva trae los convocados, los frentes vigentes y los acuerdos pendientes de la anterior. |
| **Rendimientos** | Rendimiento real de lo ejecutado por actividad: por día, por persona-día y por HH, y el desvío frente al plazo planificado. Incluye un estimador de días para una cantidad y una dotación. |

## Reglas

- **Estados de una actividad:** Planificada → En ejecución → Cumplida o No cumplida. Solo se inicia o se cierra una actividad comprometida en una semana. Para reabrir una actividad cerrada hay que escribir el motivo.
- **Cumplida:** se marca solo si se completó el 100 % de la cantidad comprometida. Lo parcial se cierra como **No cumplida**, con su causa (CNC). El saldo se **reprograma** en otra semana como una actividad nueva; la original conserva su causa para el PPC.
- **PPC** = cumplidas ÷ comprometidas de la semana. Mientras la semana tenga actividades abiertas, el indicador dice «parcial» y no lleva color. El PPC de 4 semanas cuenta solo las actividades cerradas. El color es verde desde 80 %, ámbar desde 60 % y rojo bajo 60 %.
- **Restricciones:** son de tipo diseño, información, materiales, mano de obra, equipos, subcontrato, frente previo, calidad, permisos u otro. Cada una tiene responsable y fecha compromiso, y se marca vencida cuando pasa esa fecha sin liberarse. Comprometer una actividad con restricciones pendientes pide confirmación.
- **Rendimientos:** se calculan como cantidad ejecutada ÷ días trabajados.
  - Los días trabajados son los días hábiles de lunes a viernes entre el inicio y el término real. Se pueden corregir a mano, por ejemplo por feriados o sábados trabajados.
  - Los promedios son ponderados: total ejecutado ÷ total de días.
  - El rendimiento por persona-día usa solo los registros que tienen dotación, y el rendimiento por HH solo los que tienen horas.
- **Semanas:** son semanas ISO, de lunes a domingo, en la hora de Chile (America/Santiago).

## En el plano

- **Ver en el plano** pinta los recintos de la semana elegida según la peor condición de sus actividades, en este orden: No cumplida, Con restricción, En ejecución, Planificada, Cumplida. «Exportar plano» respeta esa capa.
- **Reporte con plano** arma una hoja imprimible de la semana, que se guarda como PDF desde «Imprimir». Contiene:
  - los indicadores de la semana;
  - el plano del piso abierto con los recintos coloreados y el número de cada actividad;
  - la tabla de actividades, con la misma numeración del plano;
  - el PPC de las últimas 8 semanas y el Pareto de causas;
  - las restricciones pendientes;
  - la última reunión: asistencia, frentes y acuerdos;
  - líneas de firma.

## Datos

- Todo se guarda en este equipo, en la base IndexedDB `atlas-lastplanner`.
  - Las actividades de todos los pisos van en una sola lista; el filtro «Piso» del panel elige cuáles se ven.
  - Las reuniones son de toda la obra.
- **Respaldo JSON** exporta el plan completo, e **Importar respaldo** lo agrega en otro equipo. Si un registro existente difiere del respaldo, la importación no se aplica.
- Todavía no se sincroniza con la **Nube**. Para sincronizarlo hay que ampliar `supabase/campo.sql` y `server/campo.mjs` con un tipo de registro nuevo.
- Cada actividad guarda su historial de cambios, con autor y fecha. El nombre de quien registra se recuerda en el equipo; es el mismo de Observaciones.

## Archivos y pruebas

- `dist/lastplanner-model.mjs`: reglas puras (semanas, estados, PPC, causas, rendimientos, asistencia).
- `dist/lastplanner-store.mjs`: IndexedDB, guardado con versión esperada, respaldo e importación.
- `dist/lastplanner.mjs` y `dist/lastplanner.css`: panel, formularios, capa del plano y reporte.
- `node lastplanner-test.mjs`: prueba las reglas del modelo y corre en el build de Render.
