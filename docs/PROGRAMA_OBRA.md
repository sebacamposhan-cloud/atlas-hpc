# Programa de obra en Last Planner y Avance

El programa de obra de Sacyr (MS Project) es el **nivel maestro** de Last Planner: sobre el plan intermedio y la planificación semanal. Atlas lo usa también para la **línea programada** del gráfico «Avance real vs programado».

## Cómo viene el programa y qué hace Atlas

El programa es uno solo para toda la obra y se ordena por **partida → módulo → piso**. Por ejemplo, «6.4.1 Pinturas en paramentos verticales → MÓDULO A → 2°Piso». No existe un programa separado por piso.

Atlas invierte ese orden a **piso → partida**:

- Toma las tareas finales del **Módulo A** (el edificio hospitalario, que es lo que tiene planos en Atlas).
- Convierte cada piso del programa al piso de Atlas: «1°Subterráneo» = −1 (S01) y «2°Piso» = N02. Los otros subterráneos, la cubierta y los módulos B, C y D quedan fuera.
- Usa como código de partida el campo **Texto1** de Project. Es el código EETT, el mismo que usan las partidas de Atlas (6.2.2, 6.3.x, 6.4.1…).
- Junta en una sola partida las tareas que se repiten en un mismo piso, y guarda sus tramos.
- **No lee recursos ni montos.**
- El subprograma de notas de cambio queda fuera. Project no escribe en el XML las tareas externas (las del subprograma enlazadas al general).

Debajo del piso, el programa no tiene sectores ni recintos. Esa parte la refina Planificación en Atlas, con **ventanas por sector**.

## Cargar una revisión (oficina técnica, escritorio)

1. En Project: **Archivo › Guardar como › XML**. El archivo puede pesar varios GB por las asignaciones. Atlas lee solo la sección de tareas, que va al principio, y corta ahí: el programa Rev05 se lee en unos 3 segundos.
2. En Atlas: **Last Planner › Programa de obra › Cargar programa (XML de Project)**.
3. Atlas muestra, por piso, cuántas partidas entran y qué cambió respecto de lo guardado: fechas movidas, partidas nuevas y quitadas. **Guardar en la nube** sube un registro por piso.
4. Las ventanas por sector ya guardadas se conservan en las partidas que siguen en el programa. Cada carga queda en el historial de Nube.

Atlas no lee el `.mpp` directamente. El programa **no va en el repositorio**: vive en Nube (tipo `programa`, id `programa-<piso>`).

## Vista «Programa de obra» (Last Planner)

- **Indicadores:**
  - partidas del piso;
  - en curso;
  - que empiezan en las próximas 6 semanas;
  - vencidas con pendiente;
  - atrasadas o en riesgo según el ritmo real;
  - actividades que terminan después de su partida.
- **Plan intermedio, próximas 6 semanas.** Es una tabla con estas columnas:
  - partida y fechas del programa;
  - **real** (el avance del piso en Atlas: planillas y terreno, en m² cuando la partida los tiene, si no cada recinto pesa uno);
  - **programado hoy** (lineal entre inicio y término);
  - brecha;
  - **término proyectado** con el ritmo real (solo para lo que está en curso; en una vencida se muestra cuánto falta).

  «Solo partidas que Atlas mide» deja fuera instalaciones, fachada y obra gruesa. Sin el filtro se ven, porque condicionan el trabajo.
- **Detalle de una partida:**
  - **Ventanas por sector.** Atlas propone repartir el plazo entre los sectores 1, 2 y 3, uno tras otro, en proporción a lo pendiente de cada uno. Si la partida ya empezó, reparte desde hoy; si ya venció, usa el plazo original.
  - Planificación cambia el orden y las fechas y las guarda en Nube. Una ventana que sale del plazo del programa se marca «Fuera del programa». El programa original no cambia.
  - **Crear actividad.** Crea una actividad del plan intermedio (sin semana) con los recintos pendientes del sector y sus m², **ligada** a la partida (`actividad.programa`: código, sector y plazo).
  - Cuando la actividad se compromete en una semana, si su término cae después de su ventana (o de su partida), Atlas lo avisa aquí.
- El programa del piso completo queda en «Todo el programa del piso».

El avance real solo se calcula para el piso abierto en la página. En otro piso del filtro de Last Planner se ven las fechas, sin avance.

## Línea programada en Avance

**Avance › Avance por recinto › Avance real vs programado** dibuja la línea programada cuando el piso tiene programa:

- Cada terminación del recinto (pavimento, cielo, muros) avanza entre el inicio más temprano y el término más tardío de las tareas del programa de sus partidas. Por ejemplo, «6.4.1.2» va a la tarea 6.4.1; «2.6» junta 2.6.x.
- Una terminación que el programa no trae no cuenta como programada.
- Después de hoy solo se dibuja la línea programada.

## Activación

1. Ejecutar **`supabase/programa-obra.sql`** en el SQL Editor del proyecto Supabase de Nube, después de `campo.sql`, `contornos.sql`, `planillas-avance.sql` y `avance-terreno.sql`. Se puede repetir sin perder datos: solo amplía los tipos aceptados y la validación de `guardar_atlas_campo`. No crea tablas.
2. Desplegar esta versión. Sin el SQL, guardar el programa responde con el error de Nube y no se pierde nada.

Cargar el programa y guardar ventanas exige una cuenta `editor`. Una cuenta `lector` lo consulta.

## Archivos

| Parte | Archivos |
| --- | --- |
| Modelo (sin DOM) | `dist/programa-obra-model.mjs` |
| Nube | `dist/programa-obra-nube.mjs`, `server/campo.mjs` (tipo `programa`), `dist/nube.mjs` (lo baja al sincronizar), `supabase/programa-obra.sql` |
| Vista | `dist/programa-obra-ui.mjs`, `dist/lastplanner-workflow.mjs` (pestaña), `dist/selector-flujo.mjs` (tarjeta), `dist/lastplanner-cycle.css` |
| Curva | `dist/curva-avance.mjs` (`curvaConPrograma`), `dist/avance.mjs` (`planDeTerminacion`), `dist/room-progress.mjs` |
| Prueba | `programa-obra-test.mjs`: XML inventado, cliente de Nube simulado y SQL en PGlite si hay `PGLITE_MODULE` |
