# Jerarquía de obra en Last Planner

Cada persona tiene un cargo y un jefe directo. Los jefes reparten tareas a quienes dependen de ellos, cada tarea llega a la libreta **Mis tareas** de quien la recibe, el avance se marca tocando los recintos en el plano y quien la asignó la confirma o la devuelve. Todo funciona sin señal: se guarda en el equipo y sube solo cuando vuelve la conexión.

Sin personas cargadas, Atlas sigue igual que hoy.

## Qué ve cada persona

| Nivel | Cargo | Mis tareas | Asignar | Mi equipo | Last Planner |
| --- | --- | --- | --- | --- | --- |
| 0 | Gerente de contrato | No | No | Ve todo | Solo mirar |
| 1 | Jefe general de terreno | No | Sí | Sí | Sí |
| 2 | Jefe de terreno | Sí | Sí | Sí | Sí |
| 3 | Jefe de terreno B | Sí | Sí | Sí | Sí |
| 4 | Supervisor de piso o capataz | Sí | No | No | No |
| Sin nivel | Planificación | No | No | Ve todo | Sí |
| Sin nivel | Calidad | No | No | Ve todo | Solo verificar, evidencias y restricciones |

El nivel 4 entra con su propia cuenta y ve sus tareas y sus pisos. En Control ve Mis tareas y Herramientas. Plano y Protocolos los ve como todos, sin los Resumen.

## Cómo se usa

1. **Asignar.** Control → Mis tareas → Asignar. Atlas pregunta a quién, qué tiene que hacer, en qué piso y, si se quiere, hasta qué fecha. El frente de trabajo se elige en el plano. La tarea puede salir de una actividad de Last Planner.
2. **Recibir.** Quien la recibe ve un número en Control (o en Módulos, si está en otro módulo) y la tarea en Mis tareas.
3. **Marcar.** Marcar en el plano → tocar cada recinto terminado → Listo. Una tarea sin frente se marca en porcentaje.
4. **Terminar.** Terminé esta tarea. Queda esperando confirmación.
5. **Confirmar.** En Mi equipo, quien la asignó toca Confirmar, o Devolver con el motivo. Una tarea devuelta vuelve a Mis tareas.

## SQL que hay que correr

Lo corre quien administra Supabase, en **SQL Editor → New query**: pegar el archivo completo y **Run**. Debe terminar en *Success*. El orden importa:

1. [`supabase/campo.sql`](../supabase/campo.sql)
2. [`supabase/lastplanner-cycle.sql`](../supabase/lastplanner-cycle.sql), y `lastplanner-4.sql` o `lastplanner-daily.sql` si se usaron.
3. [`supabase/jerarquia.sql`](../supabase/jerarquia.sql)

**Si se vuelve a correr `lastplanner-cycle.sql`, hay que correr `jerarquia.sql` después.** Ese archivo reemplaza `atlas_lp_can`, y `jerarquia.sql` vuelve a poner el tope de permisos por nivel.

`jerarquia.sql` se puede correr varias veces sin perder datos y no usa la clave `service_role`. Si todavía no se corre, Atlas sigue funcionando como hoy.

## Cargar personas

Los nombres reales van solo en Supabase, nunca en el repositorio, que es público. Las personas se cargan **por correo y de arriba hacia abajo**: el jefe tiene que estar cargado antes que quienes dependen de él. Cada persona necesita antes su cuenta (ver [LOGIN.md](LOGIN.md)).

```sql
select public.atlas_jer_cargar('correo@empresa.cl','Nombre y apellido','Jefe de terreno',2,'linea','correo-del-jefe@empresa.cl',array['N01','N02']);
```

En orden, los datos son:

| Dato | Qué va |
| --- | --- |
| Correo | El de su cuenta de Atlas. |
| Nombre | Como aparecerá en las tareas. |
| Cargo | Texto libre. |
| Nivel | De 0 a 4, según la tabla de arriba. En Planificación y Calidad va `null`. |
| Área | `linea` para la cadena de mando, o `planificacion`, o `calidad`. |
| Correo del jefe | Su jefe directo, con un nivel más alto. Gerencia, Planificación y Calidad llevan `null`. |
| Pisos | `N-1`, `N01`, `N02`, `N03`. Con `array[]::text[]` trabaja en todos. |
| Empresa | Opcional, para subcontratos. |

Para corregir a alguien, se vuelve a ejecutar la misma línea con los datos nuevos.

**La cuenta también tiene que poder hacer la acción.** Marcar, asignar y confirmar exigen rol `editor`. Una cuenta `lector` solo mira. Si la cuenta tiene `lastplanner_permissions`, se aplican esos permisos además del tope por nivel: asignar pide `draft`, marcar pide `execution` y confirmar pide `verify`.

**Quien deja la obra** se desactiva. No se borra, y sus tareas quedan para que su jefe las reasigne. Para reactivarlo, se vuelve a cargar.

```sql
select public.atlas_jer_desactivar('correo@empresa.cl');
```

**Ver lo cargado:**

```sql
select u.email, p.nombre, p.cargo, p.nivel, p.area, (select email from auth.users where id=p.jefe) as jefe, p.pisos, p.activo
from public.atlas_personas p join auth.users u on u.id=p.user_id order by p.area, p.nivel nulls last, p.nombre;
```

## Decisiones de esta versión

Están tomadas para poder partir y falta revisarlas con la obra.

- **Se asigna solo a los reportes directos.** Lo hacen los niveles 1 a 3. Para permitir saltar niveles hay que cambiar la constante `SALTAR_NIVELES` en `dist/jerarquia-model.mjs` y `atlas_jer_salta_niveles` en `supabase/jerarquia.sql`, y volver a correr ese SQL.
- **El aviso es solo dentro de Atlas:** el número en Control de obra y la libreta.
- **Hecha, y luego confirmar o devolver.** Quien recibe marca que terminó. La confirma o la devuelve con un motivo quien la asignó, o alguien más arriba en su cadena.
- **Reasigna el jefe directo de quien falta.** La tarea pasa a otra persona que dependa de ese jefe y que trabaje en ese piso.
- **Nivel 4 con su propia cuenta:** ve solo sus tareas y sus pisos.
- **Sin perfil, todo como hoy:** sin libreta, con sus tarjetas y permisos de siempre.
- **Tope de permisos de Last Planner por nivel.** Se cruza con los permisos de la cuenta, así que nunca da más de lo que la cuenta ya tenía. El nivel 4 queda con ejecución, asistencia, restricciones y evidencias.
- **El avance marcado suma al avance real de Last Planner.** Por cada superficie se toma el mayor entre lo informado en Last Planner y lo marcado en las tareas, así no se cuenta dos veces. No cambia el PPC ni la verificación.

## Lo que falta

- **Las lecturas de Last Planner aún no se limitan por piso en la base.** Hoy el piso se respeta en la interfaz y al guardar tareas, pero no al leer los registros de Last Planner.
- **Sin notificaciones push, correo ni WhatsApp.** Quien recibe una tarea la ve al abrir Atlas con señal.
- **Falta probarlo en un teléfono real y en Safari.** El recorrido se probó en Chromium a 375 × 812 y 1366 × 768.

## Pruebas y archivos

- `jerarquia-test.mjs`, `jerarquia-sql-test.mjs` y `jerarquia-api-test.mjs` corren en el build de Render.
- `jerarquia-browser-test.mjs` hace el recorrido completo en navegador y queda fuera del build porque necesita PGlite y Playwright:

```bash
PGLITE_MODULE=…/pglite/dist/index.js CHROMIUM_PATH=…/chromium node jerarquia-browser-test.mjs capturas
```

- Modelo y reglas: `dist/jerarquia-model.mjs`.
- Guardado en el equipo: `dist/jerarquia-store.mjs`.
- Pantallas: `dist/jerarquia-ui.mjs` y `dist/jerarquia.css`.
- Servidor: `server/jerarquia.mjs`.
- Base de datos: `supabase/jerarquia.sql`.
