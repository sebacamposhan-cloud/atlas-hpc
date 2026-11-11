# Planillas de avance de la oficina

Atlas lee la planilla de avance de la oficina técnica («HPC-Medicion Avance <piso>.xlsx») y la usa como **base del avance por recinto**, para no marcar a mano lo que la oficina ya midió.

## Cargar
- **Dónde:** Control → Avance → **Avance por partida** → «Cargar planilla de avance». Solo en escritorio y con una cuenta de rol editor.
- **Qué archivo:** la planilla tal como está, una por piso, estando en ese piso. No hay que purgarla ni pasarla a CSV.
- **Antes de guardar** Atlas muestra un resumen: partidas leídas con sus recintos, terminados y % ponderado; hojas que quedan fuera y por qué; códigos que no existen en el plano del piso; y cuántos recintos cambian respecto de la carga anterior.
- **Guardar en la nube** deja la carga disponible para todos los equipos con sesión. La planilla misma no se guarda: solo el código de recinto, la cantidad, el % total y el % por etapa (unos 50 a 80 KB por piso).
- Si pesa más de 12 MB suele ser por filas vacías con formato; el mensaje explica cómo borrarlas en Excel.

## Qué lee
- Una hoja por partida. Atlas busca por nombre la columna «CÓDIGO RECINTO», las columnas de % por etapa (estructura, tapado, huincha…), la cantidad y el total, porque las columnas cambian entre pisos y hojas.
- **Entran:** cielo duro, cielo modular, cenefas, pavimentos (vinílico, baldosa, resina, epóxico o la hoja general), retorno, guardapolvo, sobrelosa, impermeabilización, pintura de muros y de cielos, porcelanato, HPL, sellos cortafuego, puertas y baños prefabricados.
- **Quedan fuera:** las hojas sin código de recinto (tabiquería por tabique, tabique desmontable, yeso en pilares, luminarias, resúmenes) y las que traen la columna de código vacía. El resumen las lista.
- **% de cada recinto:** el total de la oficina si la hoja lo trae (porcentaje de avance o m² ejecutados sobre la cantidad); si no, las etapas con los pesos escritos en la hoja o los pesos habituales de la partida.
- Varias filas del mismo recinto se suman ponderadas por su cantidad. Los códigos con comas, espacios o puntos sobrantes se corrigen solos.

## Precedencia
- **La planilla es la base.** Cada partida que la planilla mide toma de ahí su ejecución y su %.
- **Lo marcado en terreno después de la carga manda** sobre la planilla, partida por partida, hasta la siguiente carga.
- **La revisión** (conforme, con observaciones) siempre es de terreno: la planilla no la trae. Una partida solo queda conforme si está instalada.
- En el rombo, la partida indica «Según la planilla de la oficina» con el % de cada etapa.

## Partidas de Atlas que alimenta cada hoja
| Hoja | Partidas del recinto |
|---|---|
| Cielo duro | 6.3.2, 6.3.3 |
| Cielo modular | 6.3.4, 6.3.5, 6.3.6, 6.3.9, 6.3.10 |
| Cenefas | 6.10.4.2 |
| Pavimentos | 6.1.x, 6.4.3.8 y pavimentos del PMA sin ítem (la hoja específica manda sobre «PAVIMENTO») |
| Retorno | 6.10.2.8 |
| Sobrelosa | 2.6 |
| Impermeabilización | 4.3.1 |
| Pintura de muros | 6.4.1.x; su etapa «Pasta» alimenta el empaste 6.2.2 |
| Pintura de cielos | 6.4.2.x |
| Porcelanato de muros | 6.2.3 |
| HPL | 6.2.4 |
| Sellos cortafuego | 5.3 |

Guardapolvo, puertas, prefabricados, pintura de cenefa e impermeabilización de muros se guardan con la carga, pero todavía no alimentan una partida del rombo.

## Datos
- Lectura y reglas: `dist/planilla-avance-model.mjs`. Nube y copia en el equipo: `dist/planilla-avance-nube.mjs`. Precedencia: `aplicarPlanilla` en `dist/avance-model.mjs`. Interfaz: `dist/avance.mjs`.
- Nube: tipo `planilla`, un registro por piso (`avance-N02`). **Requiere ejecutar `supabase/planillas-avance.sql`** después de `campo.sql` y `contornos.sql`. Cada carga queda también en el historial de Supabase.
- Pruebas: `planilla-avance-test.mjs`, en el build de Render. Con `PLANILLAS_AVANCE=<carpeta con los .xlsx>` revisa además las planillas reales, que no se publican.

## Pendiente
- Panel único de avance por partida con el plano, y Proyectos por partida con hoja de ruta.
- Marcar etapas en el rombo y devolver la planilla con lo de terreno escrito en sus celdas.
