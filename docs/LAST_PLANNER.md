# Last Planner en Control de obra

Control de obra → **Last Planner** reúne el plan de producción de la obra según el Last Planner System. Las funciones vienen del pedido del jefe de producción (29-10-2026); la organización en tarjetas, la navegación por estados con contadores y los indicadores en cuadros siguen la estructura de plataformas como FunBIM.

El panel abre con tres tarjetas, una por sección, y cada tarjeta muestra el dato del momento (PPC, actividades de la semana, restricciones pendientes). Dentro de una sección, los gráficos van a la izquierda y la tabla a la derecha:
- tocar una barra, una porción de torta o una semana del PPC filtra la tabla;
- tocar una fila despliega su detalle: plazo, avance, rendimiento planificado y real, dotación recomendada, recintos, restricciones y últimos cambios. Desde ahí se abre la actividad para editarla.

| Sección | Gráficos (izquierda) | Tabla (derecha) |
|---|---|---|
| **Resumen** | PPC por semana, estado de la semana, causas de no cumplimiento, cumplimiento por responsable y por sector. Arriba, el PPC de la semana y de 4 semanas, las restricciones y la asistencia. | Actividades de la semana, o las que corresponden a lo elegido en un gráfico. |
| **Plan semanal y rendimientos** | Estado de la semana, actividades por responsable (en rojo si la dotación no alcanza), rendimiento real por persona al día y estimador de días. | Pestañas «Actividades de la semana», con iniciar, cerrar y reprogramar, y «Rendimientos» por actividad con sus registros. |
| **Restricciones y reuniones** | Estado de las restricciones (vencidas, por vencer, liberadas), pendientes por tipo, asistencia por empresa y frentes de trabajo. | Pestañas «Restricciones» (con liberar), «Plan intermedio» (6 semanas, con comprometer) y «Reuniones» (presentes, ausentes, frentes y acuerdos). |

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
- **Semana y fechas:** en una actividad comprometida, las fechas planificadas deben quedar dentro de su semana. Un trabajo más largo se divide por semanas; las actividades sin semana (plan intermedio) tienen fechas libres.
  - Una actividad nueva parte de lunes a viernes de la semana elegida.
  - Al cambiarla de semana, o al comprometerla desde el intermedio, las fechas se mueven con ella: mismo día de la semana y misma duración, sin pasar del domingo.
- **Responsable:** se elige de la lista de subcontratos de la obra (`dist/subcontratos.mjs`, con su especialidad) o se escribe con «Otro…». La lista viene de las capturas que se usaron para Estados de pago, más Valcompany; no lleva precios.
- **Dotación recomendada:** con la cantidad, el rendimiento por persona al día y los días hábiles del plazo (de lunes a viernes de la semana si no hay fechas), se calcula `personas = cantidad ÷ (rendimiento × días)`, redondeado hacia arriba.
  - Ejemplo: 30 m² a 10 m² por persona al día en 5 días da 1 persona, que termina en 3 días.
  - Si la dotación ingresada no alcanza, el formulario dice cuánto se lograría, y el plan semanal marca la dotación recomendada en rojo.
  - Si Atlas ya tiene rendimientos reales de esa actividad y unidad, los propone con «Usar este rendimiento».

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

## Datos de ejemplo para presentar

«Datos de ejemplo», en la barra del panel, carga un plan de terminaciones ficticio en los cuatro pisos. Lo genera `dist/lastplanner-ejemplo.mjs` y siempre parte de la semana actual.
- **Contenido:** ocho semanas cerradas, la semana en curso (con saldos reprogramados), las dos siguientes, el plan intermedio, restricciones (vencidas, pendientes y liberadas) y ocho reuniones semanales con asistencia, frentes y acuerdos.
- **Un carácter por piso:**
  - Piso −1: PPC estable, frenado por mano de obra y materiales.
  - Piso 1: PPC que mejora al liberarse los frentes.
  - Piso 2: PPC alto, con Grupsa en puertas correderas de los cubículos UTI rindiendo sobre lo planificado.
  - Piso 3: PPC que cae por material y frente y se recupera, con Protego en puertas cortafuego rindiendo sobre lo planificado.
- **Responsables:** son los subcontratos de terminaciones: Spotless, STI, Valencia, DAC-Controls, Grupsa, Protego, Miranda, Construlyl, Teisa y Pavitec. Los recintos son los reales de cada piso y las personas son inventadas.
- **Cómo se quitan:** los registros llevan id `demo-`. «Quitar datos de ejemplo» borra solo esos y deja intacto lo ingresado por el equipo. Mientras estén cargados, el panel lo avisa.
- **Prueba:** `node lastplanner-ejemplo-test.mjs`.

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
