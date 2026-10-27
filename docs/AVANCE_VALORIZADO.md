# Avance valorizado por recinto y partida · piloto nivel −1

Control de obra → **Avance valorizado** y la ficha de cada recinto del plano (sección **Avance valorizado por partida**). El objetivo pasa de documentar a controlar y valorizar el avance. Piloto: solo nivel −1.

## Fuentes

- **PMA RevB** (`dist/pma/catalog.json`): 414 recintos activos A-S01 con superficie escrita, PAV, CIE, M1–M4 y asepsia. Es la fuente de cantidades por recinto.
- **Itemizado** `HPC-5-GEN-GEN-PRE-01-RevE_UT-SSMSO_Sacyr.xlsx`, hoja «Formulario n°11A»: A = ITEM, B = descripción, C = unidad, K / AB / AR = cantidad del piso −1 (módulos A, B y D), BA = precio unitario. Las partidas se identifican por código ITEM (6.2.3 y 6.4.2.1 aparecen fuera de orden en el archivo); se ignoran los «Ítem eliminado…» y las filas de título sin unidad.
- **El itemizado no se publica.** El repositorio es público y el archivo trae precios: se carga en la app con «Cargar itemizado…», se interpreta en el navegador y queda solo en ese dispositivo (IndexedDB `atlas-avance-partidas`, tabla `fuentes`). Tampoco viaja en los respaldos de avance. Sin itemizado el checklist funciona igual, sin montos.

La conciliación PMA ↔ plano (330 / 414 / 22 diferencias) queda para después. La ficha avisa cuando PMA y plano difieren; las partidas y cantidades usan el PMA.

## Enlace recinto → partidas

| Terminación PMA | Partida | Cantidad por recinto |
|---|---|---|
| PAV 101 / 102 / 104–108 / 112 / 116 | 6.1.2.1 / 6.1.3.1 / 6.1.4.2–6.1.4.6 / 6.1.5.1 / 6.1.5.2 | Superficie PMA (m²) |
| PAV 115 | 6.4.3.8 esmalte epóxico de piso | Superficie PMA |
| CIE 200 / 201 / 202 / 203–204 / 206 / 207 / 209–218 / 210 | 6.3.1 / 6.3.2 / 6.3.3 / 6.3.4 / 6.3.5 / 6.3.6 / 6.3.9 / 6.3.10 | Superficie PMA |
| CIE 200–202 (para pintura) | 6.4.2.1 asepsia baja · 6.4.2.2 asepsia media, según asepsia del recinto | Superficie PMA |
| CIE 202 (recinto húmedo) con baldosa o porcelanato | 4.3.1 impermeabilización | Superficie PMA |
| Muro 11 / 12 | 6.2.2 empaste + 6.4.1.1 (baja) / 6.4.1.2 (media) | Sin cantidad (no hay m² de muro) |
| Muro 14 / 15 / 16 / 19 | 6.2.3 porcelanato / 6.2.3 + empaste y pintura por asepsia / 6.2.4 HPL / 6.2.7 madera | Sin cantidad |
| Cualquier muro con terminación | 5.1 tabiquería y 5.3 sellos | Sin cantidad |
| Todo pavimento | 2.6 sobrerradier / sobrelosa | Sin cantidad (2.6.1 o 2.6.2 por recinto no está definido) |
| CIE 204 / 206 / 218 (con cenefa) · PAV 116 | 6.10.4.2 cenefa · 6.10.2.8 retorno sanitario | Sin cantidad (ml) |

**Asepsia alta:** ningún recinto del −1 la tiene en el PMA (BAJA 188, MEDIA 214, N/A 12), así que no hay pintura de asepsia alta que asignar. Los 4 recintos con cielo 210 (Humancare) quedan en 6.3.10 «cielo acústico 02 asepsia alta» aunque su asepsia sea baja o media: revisar.

## Cadena de protocolos previos

Una partida no puede quedar **Aprobada** si su previo no está liberado (partida previa aprobada o protocolo liberado). El estado del previo se muestra en solo lectura con aviso.

| Partida | Requiere liberado | Origen |
|---|---|---|
| 6.1.4.x vinílicos · 6.1.4.6 caucho | Nivelación de pavimentos resilientes (REV1 NPPR-TER) | Indicada |
| Nivelación de pavimentos resilientes | 2.6 sobrelosa | Indicada |
| 6.1.5.2 resina PU | Nivelación y humedad del sustrato | Indicada |
| 6.10.2.8 retorno sanitario | 6.1.5.2 resina PU | Indicada |
| 6.1.2 / 6.1.3 en recintos húmedos | 4.3.1 impermeabilización | Indicada |
| 6.4.1 pintura de muros | 6.2.2 empaste | Indicada |
| 6.2.2 empaste | 5.1 tabique | Indicada |
| 5.1 tabique | 5.3 sellos cortafuego | Indicada · confirmar el sentido (los sellos de juntas suelen ir después del tabique) |
| 6.3 cielos | Instalaciones sobre cielo | Indicada |
| 6.6 quincallería | 6.5 puerta | Indicada · puertas aún sin vínculo por recinto |
| Nivelación y humedad del sustrato · 4.3.1 · baldosa/porcelanato en recintos secos | 2.6 | Propuesta |
| 6.1.5.1 textil flocado | Nivelación de pavimentos resilientes | Propuesta |
| 6.4.3.8 esmalte epóxico de piso | Nivelación y humedad del sustrato | Propuesta |
| 6.2.3 / 6.2.4 / 6.2.7 revestimientos de muro | 5.1 | Propuesta |
| 6.4.2 pintura de cielos · 6.10.4.2 cenefa | Su cielo (6.3.x) | Propuesta |

Los protocolos de la matriz REV1 se registran por ejes (p. ej. «AD-AG/A3-A5»), no por recinto. Por eso aquí los protocolos previos se marcan por recinto (Pendiente / Liberado) con su tipo REV1 como referencia. Leerlos automáticamente requiere ubicar los ejes en el plano: siguiente paso.

## Checklist y valorización

Por partida: estado (No iniciado 0 % · En ejecución 1–99 % · Instalado 100 % · Observado · Aprobado 100 %), % de avance, conformidad, qué falta y observaciones con fecha y autor. Observado o No conforme exigen observación o faltante; Aprobado exige Conforme, sin faltantes y previo liberado.

**Avance $ = cantidad del recinto (superficie PMA) × % × precio unitario (BA).** Totales por partida, recinto, asepsia y piso. Las partidas sin cantidad registran avance físico pero no se valorizan. El avance físico promedio pesa cada partida por igual.

Registros en IndexedDB `atlas-avance-partidas` con versión esperada (no se sobrescribe lo guardado en otra pestaña) e historial append-only. Exportar/importar respaldo JSON: importación aditiva que rechaza todo si un registro existente difiere. Módulos en el núcleo sin conexión. **Los avances son locales al dispositivo; no hay sincronización entre usuarios.**

En el plano, «Filtros → Colorear por → Avance de obra» o el botón «Ver avance en el plano» colorean cada recinto: sin iniciar, en curso, completo u observado.

## Gráficos (los 5 priorizados)

1. **Avance por partida, $ ejecutado y pendiente**, ordenado por monto pendiente → dónde concentrar cuadrillas.
2. **Embudo de estados** (no iniciado → en ejecución → instalado → aprobado, más observado) → si el cuello está en la ejecución o en la inspección/aprobación.
3. **Partidas con avance bloqueado por protocolo previo**, con el $ ejecutado que no puede aprobarse → qué protocolo liberar primero. Las partidas sin iniciar que esperan su previo se informan aparte.
4. **Avance por nivel de asepsia** → si la cadena empaste → pintura de asepsia media se atrasa.
5. **Control de cubicación, PMA contra itemizado** (diferencias > 5 % destacadas) → qué partidas no cuadrarán en el estado de pago.

El mapa de calor es la capa «Avance de obra» del plano. No se implementan aún: **curva S planificada vs real** (requiere el programa de obra cargado) y **ritmo semanal con proyección** (requiere semanas de registros).

## Control de cubicación (PMA vs itemizado, piso −1)

Calzan dentro de 5 %: 6.1.2.1 (+1,6 %), 6.1.4.2, 6.1.4.3, 6.1.4.5, 6.1.4.6 (+0,1 %), 6.1.5.1, 6.1.5.2 (+4,6 %), 6.3.1, 6.4.3.8.
Superan 5 %: 6.1.3.1 (+27 %), 6.1.4.4 (−8 %), 6.3.2 (−10 %), 6.3.3 (−20 %), 6.3.4 (+51 %), 6.3.5 (+50 %), 6.3.6 (+10 %), 6.3.9 (+14 %), 6.3.10 (−29 %), 6.4.2.1 (−41 %), 6.4.2.2 (−29 %), **4.3.1 (−82 %)**. Los cielos sugieren clasificaciones distintas entre PMA e itemizado. En 4.3.1 la regla «recinto húmedo = cielo 202» cubre solo una parte: definir qué recintos llevan impermeabilización.

## Para revisar

- **Sin cantidad por recinto** (avance físico sí, $ no): 2.6, 5.1, 5.3, 6.2.2, 6.2.3, 6.2.4, 6.2.7, 6.4.1.1, 6.4.1.2, 6.10.2.8, 6.10.4.2. Se necesitan m² de muro, ml y la regla 2.6.1 / 2.6.2 por recinto.
- **Sin protocolo previo:** 2.6 y 5.3.
- **Sin vínculo por recinto** (con cantidad en el piso −1): 6.5 puertas (45 ítems), 6.6 quincallería (43), 6.8 protecciones (10), 6.10 complementos (22), 6.1.2.2, 6.3.12, 6.4.3.1, 6.4.3.7, 4.3.4. Puertas y quincallería pueden vincularse con la planilla de control de puertas.
- **Terminaciones del PMA sin partida en el piloto:** cielos 213, 215, 216, 219 y S/E; muros 20, 21 y S/E; pavimentos 119, 120 (paneles frigoríficos) y S/E.
- Capítulos 7 y 9: 1.272 partidas con cantidad en el piso −1, preparadas para una etapa posterior.

## Implementación y pruebas

- `dist/avance-model.mjs`: reglas de enlace, cadena, validación, valorización, lectura del itemizado y listas de revisión.
- `dist/avance-store.mjs`: persistencia, historial, respaldos e itemizado local.
- `dist/avance.mjs`: editor de recinto (ficha y Control), panel, gráficos y capa del plano.
- `avance-test.mjs` (en el build de Render): itemizado sintético con precios ficticios (desorden, eliminados, títulos, duplicados), PMA real, cadena, reglas de estado, valorización, estados de recinto y listas.
