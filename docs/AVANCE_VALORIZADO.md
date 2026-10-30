# Avance por recinto y partida (m²) · pisos −1, 1, 2 y 3

Control de obra → Avance y observaciones → **Avance por partida** y la ficha de cada recinto del plano (sección **Avance por partida · terminaciones PMA**, bajo el rombo). Nació como piloto valorizado del −1.

**Desde el 30-10-2026:**
- **Sin valorización.** El jefe de producción no debe manejar precios en la plataforma, así que se retiró la carga del itemizado y todos los montos. La copia del itemizado que quedara en un equipo se borra al abrir el avance.
- **Avance físico en m².** Ejecutado = superficie PMA × % de avance; pendiente = el resto.
- **Los cuatro pisos.** Cada uno se cruza con su nivel del PMA (A-S01, A-N01, A-N02, A-N03). Los registros se guardan con la clave «piso|código», y los del −1 conservan la suya.
- **En el rombo.** Cada sección muestra las partidas de su terminación con sus m² ejecutados y pendientes, y lleva a este registro.

## Fuentes

- **PMA RevB** (`dist/pma/catalog.json`): 414 recintos activos A-S01 con superficie escrita, PAV, CIE, M1–M4 y asepsia. Es la fuente de cantidades por recinto.
- **Itemizado** `HPC-5-GEN-GEN-PRE-01-RevE_UT-SSMSO_Sacyr.xlsx`, hoja «Formulario n°11A»: A = ITEM, B = descripción, C = unidad, K / AB / AR = cantidad del piso −1 (módulos A, B y D), BA = precio unitario. Las partidas se identifican por código ITEM (6.2.3 y 6.4.2.1 aparecen fuera de orden en el archivo); se ignoran los «Ítem eliminado…» y las filas de título sin unidad.
- **El itemizado no se usa en la plataforma** (30-10-2026). Sirvió para definir el enlace terminación → partida (códigos ITEM) que se describe abajo. `leerItemizado` y la valorización siguen en el modelo solo para las pruebas.

La conciliación PMA ↔ plano (330 / 414 / 22 diferencias) queda para después. La ficha avisa cuando PMA y plano difieren; las partidas y cantidades usan el PMA.

## Enlace recinto → partidas

| Terminación PMA | Partida | Cantidad por recinto |
|---|---|---|
| PAV 101 / 102 / 104–108 / 112 / 116 | 6.1.2.1 / 6.1.3.1 / 6.1.4.2–6.1.4.6 / 6.1.5.1 / 6.1.5.2 | Superficie PMA (m²) |
| PAV 115 | 6.4.3.8 esmalte epóxico de piso | Superficie PMA |
| CIE 200 / 201 / 202 / 203–204 / 206 / 207 / 209–218 / 210 | 6.3.1 / 6.3.2 / 6.3.3 / 6.3.4 / 6.3.5 / 6.3.6 / 6.3.9 / 6.3.10 | Superficie PMA |
| CIE 200–202 (para pintura) | 6.4.2.1 asepsia baja · 6.4.2.2 asepsia media, según asepsia del recinto | Superficie PMA |
| CIE 202 (recinto húmedo), con cualquier pavimento | 4.3.1 impermeabilización | Superficie PMA |
| Muro 11 / 12 | 6.2.2 empaste + 6.4.1.1 (baja) / 6.4.1.2 (media) | Sin cantidad (no hay m² de muro) |
| Muro 14 / 15 / 16 / 19 | 6.2.3 porcelanato / 6.2.3 + empaste y pintura por asepsia / 6.2.4 HPL / 6.2.7 madera | Sin cantidad |
| Cualquier muro con terminación | 5.1 tabiquería y 5.3 sellos | Sin cantidad |
| Todo pavimento | 2.6 sobrerradier / sobrelosa | Sin cantidad (2.6.1 o 2.6.2 por recinto no está definido) |
| CIE 204 / 206 / 218 (con cenefa) · PAV 116 | 6.10.4.2 cenefa · 6.10.2.8 retorno sanitario | Sin cantidad (ml) |

**Asepsia alta:** ningún recinto del −1 la tiene en el PMA (BAJA 188, MEDIA 214, N/A 12), así que no hay pintura de asepsia alta que asignar. El cielo 210 es «Owa Humancare (Acústico 2)» y corresponde a la partida 6.3.10 «Cielo acústico 02 – asepsia alta»: el «asepsia alta» describe el producto, no la asepsia del recinto. Los 4 recintos con cielo 210 están bien vinculados.

## Cadena de protocolos previos

Una partida no puede quedar **Aprobada** si su previo no está liberado (partida previa aprobada o protocolo liberado). El estado del previo se muestra en solo lectura con aviso.

| Partida | Requiere liberado | Origen |
|---|---|---|
| 6.1.4.x vinílicos · 6.1.4.6 caucho | Nivelación de pavimentos resilientes (REV1 NPPR-TER) | Indicada |
| Nivelación de pavimentos resilientes | 2.6 sobrelosa | Indicada |
| 6.1.5.2 resina PU | Nivelación y humedad del sustrato | Indicada |
| 6.10.2.8 retorno sanitario | 6.1.5.2 resina PU | Indicada |
| Pavimento de todo recinto con cielo húmedo (202) | 4.3.1 impermeabilización | Decidida con obra |
| 6.4.1 pintura de muros | 6.2.2 empaste | Indicada |
| 6.2.2 empaste | 5.3 sellos de juntas | Decidida con obra |
| 5.3 sellos de juntas | 5.1 tabique | Decidida con obra (el tabique inicia la cadena) |
| 2.6 sobrerradier / sobrelosa | Trabajos previos y reparación de sobrelosa (REV1 P23-SOBRELOSA-OG-01) | Decidida con obra |
| 6.3 cielos | Instalaciones sobre cielo | Indicada |
| 6.6 quincallería | 6.5 puerta | Indicada · puertas aún sin vínculo por recinto |
| Nivelación y humedad del sustrato · 4.3.1 · baldosa/porcelanato en recintos secos | 2.6 | Propuesta |
| 6.1.5.1 textil flocado | Nivelación de pavimentos resilientes | Propuesta |
| 6.4.3.8 esmalte epóxico de piso | Nivelación y humedad del sustrato | Propuesta |
| 6.2.3 / 6.2.4 / 6.2.7 revestimientos de muro | 5.1 | Propuesta |
| 6.4.2 pintura de cielos · 6.10.4.2 cenefa | Su cielo (6.3.x) | Propuesta |

Los protocolos de la matriz REV1 se registran por ejes (p. ej. «AD-AG/A3-A5»), no por recinto. Por eso aquí los protocolos previos se marcan por recinto (Pendiente / Liberado) con su tipo REV1 como referencia. Los ejes ya se ubican en los pisos −1, 1, 2 y 3 (Protocolos de la matriz → Ver en el plano; [PROTOCOL_MATRIX.md](PROTOCOL_MATRIX.md#ubicación-en-el-plano-por-ejes)). Cruzar ejes con recintos de forma automática sigue pendiente.

## Checklist y m²

Por partida: estado (No iniciado 0 % · En ejecución 1–99 % · Instalado 100 % · Observado · Aprobado 100 %), % de avance, conformidad, qué falta y observaciones con fecha y autor. Observado o No conforme exigen observación o faltante; Aprobado exige Conforme, sin faltantes y previo liberado.

**m² ejecutados = superficie PMA del recinto × % de avance; pendientes = el resto.** Totales de pavimentos y cielos por piso, y m² por partida. Las partidas sin cantidad por recinto (muros, sobrelosa, sellos, cenefas) registran solo su %. El avance físico promedio pesa cada partida por igual.

**Terminaciones sin ítem del itemizado** (sobre todo en los pisos 1 a 3): se registran como partida de la terminación, por ejemplo «PMA 109 Pavimento caucho virgen disipativo», con el nombre del PMA, sus m² y la cadena de previos de su familia.
- caucho y vinílico acústico: nivelación de pavimentos resilientes;
- cielos: instalaciones sobre cielo;
- muro 13 epóxico de asepsia alta: tabique → sellos → empaste;
- pintura de cielo de asepsia alta: después de su cielo;
- paneles autoportantes: inician su cadena.

En el −1 esto incluye los cielos 213, 215, 216 y 219, los muros 20 y 21 y los pavimentos 119 y 120, que antes quedaban fuera. Siguen sin ítem del itemizado. Solo quedan sin partida las terminaciones S/E o N/A.

Registros en IndexedDB `atlas-avance-partidas` con versión esperada (no se sobrescribe lo guardado en otra pestaña) e historial append-only. Exportar/importar respaldo JSON: importación aditiva que rechaza todo si un registro existente difiere. Módulos en el núcleo sin conexión. **Los avances son locales al dispositivo; no hay sincronización entre usuarios.**

En el plano, «Filtros → Colorear por → Avance de obra» o el botón «Ver avance en el plano» colorean cada recinto: sin iniciar, en curso, completo u observado.

## Gráficos (los 5 priorizados)

1. **Avance por partida, m² ejecutados y pendientes**, ordenado por m² pendientes → dónde concentrar cuadrillas.
2. **Embudo de estados** (no iniciado → en ejecución → instalado → aprobado, más observado) → si el cuello está en la ejecución o en la inspección/aprobación.
3. **Partidas con avance bloqueado por protocolo previo** → qué protocolo liberar primero. Las partidas sin iniciar que esperan su previo se informan aparte.
4. **Avance por nivel de asepsia** → si la cadena empaste → pintura de asepsia media se atrasa.
5. ~~Control de cubicación, PMA contra itemizado~~: retirado con la valorización (30-10-2026); el análisis de abajo queda como registro.

El mapa de calor es la capa «Avance de obra» del plano. No se implementan aún: **curva S planificada vs real** (requiere el programa de obra cargado) y **ritmo semanal con proyección** (requiere semanas de registros).

## Control de cubicación (PMA vs itemizado, piso −1)

Calzan dentro de 5 %: 4.3.1 (−2 %: 136 recintos con cielo 202, 2.531 m² contra 2.589), 6.1.2.1 (+1,6 %), 6.1.4.2, 6.1.4.3, 6.1.4.5, 6.1.4.6 (+0,1 %), 6.1.5.1, 6.1.5.2 (+4,6 %), 6.3.1, 6.4.3.8.
Superan 5 %: 6.1.3.1 (+27 %), 6.1.4.4 (−8 %), 6.3.2 (−10 %), 6.3.3 (−20 %), 6.3.4 (+51 %), 6.3.5 (+50 %), 6.3.6 (+10 %), 6.3.9 (+14 %), 6.3.10 (−29 %), 6.4.2.1 (−41 %), 6.4.2.2 (−29 %). Los cielos sugieren clasificaciones distintas entre PMA e itemizado; por decisión de obra se valorizan con la superficie PMA y el gráfico de cubicación marca la diferencia.

## Decisiones de obra (27-10-2026)

| Tema | Decisión |
|---|---|
| 4.3.1 impermeabilización | Todo recinto con cielo húmedo (202), con cualquier pavimento: 136 recintos, −2 % contra el itemizado. Su pavimento no se aprueba sin 4.3.1 liberada. |
| Partidas sin cantidad por recinto | Esperar la cubicación de obra. Mientras tanto registran avance físico sin $. |
| Tabique y sellos | Tabique 5.1 → sellos de juntas 5.3 → empaste 6.2.2. El tabique inicia la cadena. |
| Previo de la sobrelosa 2.6 | Trabajos previos y reparación de sobrelosa (REV1 P23-SOBRELOSA-OG-01), marcado por recinto. |
| Cielos con más de 5 % de diferencia | Superficie PMA por recinto; la diferencia queda en el control de cubicación. |
| Terminaciones sin partida | Por ahora no se vinculan (ver candidatas abajo). |
| Puertas y quincallería | Para después. |
| Módulo «Avance por recinto» | Se mantiene junto al avance valorizado. |

## Para revisar

- **Sin cantidad por recinto** (avance físico sí, $ no; a la espera de cubicación): 2.6, 5.1, 5.3, 6.2.2, 6.2.3, 6.2.4, 6.2.7, 6.4.1.1, 6.4.1.2, 6.10.2.8, 6.10.4.2. La cubicación sirve como tabla con código de recinto, código ITEM, cantidad y unidad (m² de muro por tipo de tabique y terminación, ml de sellos, cenefas y retornos, y m² de 2.6.1 o 2.6.2 por recinto).
- **Sin protocolo previo:** ninguna.
- **Sin vínculo por recinto** (con cantidad en el piso −1): 6.5 puertas (45 ítems), 6.6 quincallería (43), 6.8 protecciones (10), 6.10 complementos (22), 6.1.2.2, 6.3.12, 6.4.3.1, 6.4.3.7, 4.3.4.
- **Terminaciones del PMA sin partida en el piloto** y su partida candidata, no aplicada por decisión de obra:
  - cielo 213 «Owa Opus (Acústico 4)», 4 recintos, 48 m² → 6.3.12, que tiene exactamente 48 m²;
  - cielo 219 mixto Humancare y yeso-cartón, 1 recinto → 6.3.10;
  - cámaras frigoríficas con panel PUR: muros 20 y 21, cielos 215 y 216, pavimentos 119 y 120 → 9.19.13 y 9.14 según espesor. El cielo de 70 mm calza exacto (73 m²);
  - además cielos, muros y pavimentos S/E.
- Capítulos 7 y 9: 1.272 partidas con cantidad en el piso −1, preparadas para una etapa posterior.

## Implementación y pruebas

- `dist/avance-model.mjs`: reglas de enlace, cadena, validación, valorización, lectura del itemizado y listas de revisión.
- `dist/avance-store.mjs`: persistencia, historial, respaldos e itemizado local.
- `dist/avance.mjs`: editor de recinto (ficha y Control), panel, gráficos y capa del plano.
- `avance-pisos-test.mjs` (en el build): los cuatro pisos sin precios, clave por piso, m² ejecutados y pendientes, partidas de cada terminación del rombo y terminaciones sin ítem.
- `avance-test.mjs` (en el build de Render): itemizado sintético con precios ficticios (desorden, eliminados, títulos, duplicados), PMA real, cadena, reglas de estado, valorización, estados de recinto y listas.
