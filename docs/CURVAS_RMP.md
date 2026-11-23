# Curvas RMP, cadena avance → metas, solapes y Cielos unificado

Decidido el 20 y el 22 de noviembre de 2026. Todo funciona en los pisos cargados (−1, 1, 2, 3 y 4). Las diferencias entre pisos son datos (`dist/pisos.js`), nunca código de un piso.

## Curvas RMP (Last Planner › Programa de obra, escritorio)

Son los mismos gráficos del Reporte Mensual de Progreso, calculados con los pesos de Planificación. Así, si el RMP dice 68 %, ATLAS dice 68 %.

- **Curva S:** plan, real y proyección. La proyección sigue el ritmo real de los últimos 3 meses, hasta 100 % o un máximo de 36 meses.
- **Eficiencia:** real ÷ plan de cada mes. El valor 1,00 significa que la obra va al día.
- **Plan vs real de los últimos 4 meses:** el avance de cada mes, no el acumulado.
- **Cumplimiento de programación:** real acumulado ÷ plan acumulado, con su desviación.

**Planilla de pesos.** Planificación descarga la plantilla («Descargar plantilla») y la carga con «Cargar pesos del RMP (Excel)». Tiene dos hojas:

- **Pesos:** partida EETT, nombre, peso % y si ATLAS la mide (Sí/No). Si los pesos no suman 100 %, ATLAS los lleva a 100 % en la misma proporción y lo avisa.
- **Avance mensual:** mes (aaaa-mm), partida EETT, plan acumulado % y real acumulado %.

**Real.** En el mes actual, las partidas que ATLAS mide toman el avance de terreno de los pisos cargados: m² ejecutados sobre m² totales del PMA, con los mismos registros del rombo. Si ese avance es menor que lo último que informó Planificación, queda lo informado, porque un acumulado no retrocede. Los meses cerrados y las partidas que ATLAS no mide usan el % de Planificación.

**Sin planilla** los gráficos se ven desactivados, con el aviso «Falta la planilla de pesos del RMP».

**Guardado.** La planilla queda en la Nube como tipo `rmp`, id `rmp-pesos`. **Antes de usarla, quien administra Supabase ejecuta `supabase/rmp-pesos.sql`** (después de `programa-obra.sql`). Sin ese SQL la carga avisa que falta.

Archivos:
- `dist/rmp-model.mjs`: cálculo, probado en `rmp-model-test.mjs`.
- `dist/rmp-nube.mjs`.
- `dist/rmp-ui.mjs`.

## Programa de obra sin reimportar

El programa ya vivía en la Nube, pero bajaba al equipo solo al final de una sincronización completa. Si esa vuelta fallaba, por ejemplo por un conflicto de Last Planner, el programa nunca llegaba y parecía que había que importarlo de nuevo.

Ahora el programa, los pesos del RMP, las planillas y los contornos bajan al comienzo de cada vuelta, aunque el resto falle. Además, la vista pide el programa a la Nube si el equipo aún no lo tiene y muestra «Buscando el programa de obra en la Nube…».

## Cadena Proyectos → Avance → metas de Last Planner

El avance del recinto se marca en el rombo o con el pincel de un proyecto de partida. `dist/cadena-metas.mjs` lo lleva a las metas que recibió la cuenta:

- **«Instalado»** suma enseguida al avance de cada superficie del frente de la meta: pavimento (PAV), cielo (CIE), muros (M1–M4) o recinto (todo).
- **Todo «Instalado» y «Conforme»:** la meta pasa a «Por confirmar» (estado `hecha`).
- **Confirmación:** la confirma a mano quien la asignó, o su jefatura, o la devuelve. Nada se confirma solo.

La cadena corre en el equipo de quien recibió la meta, porque el servidor solo le deja marcar a esa persona. Se activa cuando cambia el avance (marcado ahí o bajado de la Nube) o cambian sus metas. Prueba: `cadena-metas-test.mjs`.

## Contornos solapados

- **Regla en el índice de toques** (`dist/hit-index.mjs`, todos los pisos): si un recinto chico queda casi entero (85 % o más) dentro de otro, el toque elige el chico. Solo los empates reales de borde abren «Elige un recinto». Prueba: `hit-index-test.mjs`.
- **Huecos en `contornos.json`** (`scripts/contornos/cortar-solapes.mjs <carpeta-piso> --escribir`): al contorno grande se le corta el hueco del recinto que tiene adentro y se recalculan sus m².
- **Resultado medido** en los pisos cargados: de 29 pares graves quedan 2, ambos en N01:
  - 5.1.3.2.14-1 Sala Observación, que solo está en parte dentro de CU.5.1.3-2;
  - 5.1.3.3.3-1 Estación de enfermería, dentro de la misma circulación.

  Esos dos se corrigen moviendo vértices en el editor de contornos.

## Cielos unificado en N01–N04

Las láminas CIE de cada piso se componen en un solo plano con teselas, igual que el −1:

- `scripts/cielos/alinear_cie.py` alinea cada lámina sin medir a mano: primero con los códigos de recinto que trae como texto y después afinando con los muros del plano de arquitectura.
- `scripts/cielos/generar-mapa-cie.py` compone el plano y lo corta en teselas.

La marca `cielosUnificado` de `pisos.js` dice qué mapa, qué simbología y qué lámina usa cada piso. En N01–N04 la ficha de Cielos muestra el tipo de cielo y el NCT de `cielos.json`. Los PDF fuente (`CIELOS.zip` de Planificación) no van en el repositorio; `scripts/cielos/alineacion-<piso>.json` guarda su huella SHA-256.
