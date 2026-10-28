# Matriz de control de protocolos REV1

## Fuente incorporada

- Original conservado: `dist/source/matriz-control-protocolos-rev1-hpc.xlsx`.
- SHA256: `e8f7774c964166450ff9546abb1cabc92cb9d2344144e82ace424df6d2c6a9ef`.
- Corte guardado en el Excel: 26-10-2026. REV1 corresponde al nombre del archivo, sin atribuir esa revisión a cada formato de protocolo.
- Registro maestro: `2-CORRELATIVO DE PROTOCOLOS HPC`, hoja ID 64, filas 3–20235.
- 20.233 registros; 154 códigos y 156 variantes originales de nombre de proceso. Agrupación de especialidades: 38, mediante normalización textual de espacios, mayúsculas y tildes. Las etiquetas originales permanecen en los registros y en las variantes del catálogo.
- Se usa `1-RESUMEN GENERAL HPC` como control. No se suman tablas dinámicas ni hojas históricas ocultas; el Excel descargable las conserva.

La matriz es un registro documental de seguimiento. No contiene todos los formatos y puntos de inspección de cada protocolo. No se inventan formularios de ejecución, resultados o aprobaciones técnicas.

## Uso

En Control de obra se abre **Protocolos de la matriz**. Seleccionar especialidad y buscar por nombre/código; elegir un proceso en el desplegable o explorar los paneles por especialidad. Ejemplos reales:

| Código | Nombre de proceso guardado | Registros |
|---|---|---:|
| APASB-TER | Aplicación Pintura Asepsia Baja | 97 |
| APASM-TER | Aplicación Pintura Asepsia Media | 44 |
| IPCT2-TER | Instalacion De Primera Cara Planchas XR-RH | 170 |

Al seleccionar se carga únicamente su detalle. Se puede filtrar por estado, nivel literal del Excel, persona que recibe y texto; recorrer páginas de 25 filas; desplegar un folio para ver sus 16 campos y fila fuente. La selección, filtros y página se recuerdan en este navegador y se restablecen al cambiar la versión de la fuente. «Cambiar protocolo» vuelve a los selectores.

![Consulta de escritorio](images/protocol-matrix-desktop.png)

[Consulta móvil](images/protocol-matrix-mobile.png)

La matriz se consulta sin editarla. Los protocolos locales y su historial existentes en IndexedDB siguen independientes; el panel Avances y protocolos que los mostraba se retiró de Control de obra, pero los registros no se borran. No se insertan automáticamente veinte mil registros en esa base ni se confunde un estado CERRADO del Excel con una aprobación técnica local.

## Ubicación en el plano por ejes

En los pisos −1, 1, 2 y 3, al elegir un protocolo aparece **Ver en el plano**; cada folio desplegado trae además **Ver protocolo 001 en el plano**.

**Cómo se encuadra cada folio:**
- Se encuadra entre los ejes de su columna EJES. La primera A es el edificio y la segunda letra o el número es el eje.
- Ejemplos de lectura:

  | Texto en EJES | Se dibuja |
  |---|---|
  | `AD-AG/A3-A5` | el rectángulo exacto entre los ejes AD y AG y entre A3 y A5 |
  | `AH/A1-A2` | una línea sobre el eje AH, de A1 a A2, con topes |
  | `AC-A2` | un círculo en el pilar del cruce |
  | `AO-AV` | una franja, porque solo trae ejes con letra |

- El orden no importa (`A3-A5/AD-AG`). Se aceptan `B-O/4-5`, sin la A del edificio, y `A1A11`, con los ejes pegados.
- El texto antes o después de los ejes no cambia la ubicación (`Nucleo N4P AM-AN/A1-A2`, `(Colada 5.1)`, `N1T`), y el panel lo informa como «se ignoró».
- Un eje que no está en la grilla (`A12B`, `A11A`) se aproxima a su eje base y el panel lo informa (`≈ A12B → A12`).

**Qué se dibuja y qué no:**
- Cada figura lleva el número del protocolo a tres cifras (folio 7 → 007), en cualquier estado. **Todos los números se escriben sobre su figura:** al centro de la zona o del tramo, y junto al círculo del pilar.
- **Las superposiciones se muestran tal cual**, porque es lo que se quiere ver. Los rellenos son tenues y se acumulan donde se cruzan protocolos. Todos los bordes van encima de los rellenos, con halo blanco, para que cada límite se lea.
- El color sigue el estado: abierto, cerrado o cerrado por autocontrol.
- Varios folios con la misma figura comparten trazo.
- **Medidas:** cada folio ubicado indica las suyas en metros, por ejemplo «24,6 × 16,4 m · 403,4 m²» o «tramo de 73,8 m». Salen de la grilla del DWG: un vano mide 8,2 m.
- **Lo que dice la matriz:** cada folio muestra su texto EJES tal cual («EJES: «AD-AE/A1-A2 N1T»»), para comprobar la lectura.
- **Los anulados (NULO) no se dibujan:** se listan arriba en el panel derecho (abajo en el celular).
- **Sin ubicación (lista abierta):** cita el texto de EJES y el motivo. Puede ser la celda vacía, un texto sin ejes del edificio A («Nucleo N6P», «Descrito en monografía», «Linea 1_138») o ejes que no están en la grilla.

**Cobertura con la matriz REV1** (sin contar anulados):

| Piso | Folios ubicados |
|---|---|
| 1 | 1.833 de 2.256 |
| 2 | 1.427 de 1.494 |
| 3 | 1.345 de 1.404 |
| −1 | 2.131 de 2.732 |

**Grilla:**
- `dist/n0x/ejes.json`, y `dist/ejes.json` para el −1, salen de la capa `S-GRID` de las láminas DWG. Cada etiqueta (AD, A5…) está dentro de su círculo y su eje es la recta que pasa por el centro.
- Los ejes que comparten N01, N03 y S01 coinciden a 0,0 cm. Las láminas de N02 están corridas: +18,8 cm en X y −3,2 cm en Y (mediana de sus ejes A1, A3', AO1 y AO2).
- El −1 lleva su grilla al marco de su plano con el mismo calce que su dibujo DWG (`data/s01/marco.json`).
- Cada piso usa la posición de sus propios ejes. Los que le faltan se toman de la grilla completa, corridos ese desplazamiento, para que las figuras queden sobre los pilares del dibujo de ese piso. El ajuste queda registrado en `ejes.json` (`ajuste`).
- Se arma una sola grilla del edificio A con las burbujas de los cuatro pisos (A2 y A3 solo aparecen en N03; A11' en S01): 26 ejes con letra (AA…AW, AA', AO1, AO2) y 15 numerados (A0…A12, A3', A11'), cada 8,2 m.
- Para regenerarla: `node scripts/ejes/generar.mjs`. Necesita `data/n0x/` y `data/s01/` (`dibujo.json` y `marco.json`), de `scripts/dwg-plano/extraer.mjs` y, para el −1, `scripts/s01-plano/ajuste.mjs`.
- `protocol-ejes.mjs` lee y encuadra, y `protocolos-plano.mjs` dibuja la capa y el panel.
- `protocol-ejes-test.mjs` valida la lectura, la geometría y la cobertura con los 20.233 registros. Corre en el build de Render.

## Datos conservados y diferencias

Cada registro mantiene ITEM GRAL, ESPECIALIDAD / ACTIVIDAD, PARTIDAS / PROCESO, CODIGO, FOLIO, ELEMENTO, NIVEL, EJES, RECINTOS, FECHA DE ELABORACIÓN, AUTOCONTROL, CERRADO, FECHA DE CIERRE, Mes, RECIBE y ESTADO, incluyendo blancos y espacios del valor original. Fechas visibles se convierten desde su serial Excel; no se sustituyen ausencias por la fecha actual.

Estados agrupados por filas:

| Estado | Filas |
|---|---:|
| Abierto | 5.678 |
| Cerrado | 12.956 |
| Cerrado por autocontrol | 1.575 |
| Nulo | 24 |
| Total | 20.233 |

El resumen declara 5.675 abiertos. Las filas 20026, 20033 y 20112 contienen `ABIERTO ` con espacio final: se agrupan para consulta y se informa la diferencia, sin corregir el archivo ni reemplazar el valor raw.

Hay 17 combinaciones repetidas de código/folio y una fila sin especialidad documentada. Se conservan todas las filas. La identidad usa hash de la fuente + hoja + fila, no código/folio. Los nombres y niveles no se convierten automáticamente en códigos de recinto ni se vinculan a polígonos. Las ubicaciones de la matriz abarcan más niveles que los planos cargados en Atlas.

## Derivados, carga y offline

`scripts/import-protocol-matrix.py` utiliza ZIP/XML de la biblioteca estándar de Python, verifica cabeceras y totales antes de escribir y extrae valores guardados. No ejecuta fórmulas, macros, vínculos ni instrucciones dentro del documento. No modifica el original ni las bases SQLite.

- `dist/protocols/catalog.json`: índice, procedencia, agrupaciones, recuentos y diferencias.
- `dist/protocols/open-aging.json`: índice compacto de abiertos para antigüedad; conserva fechas/estados raw y apunta a su código y fila.
- `dist/protocols/registers/protocol-*.json`: 154 conjuntos por código, con strings agrupados y las filas originales.
- `protocol-model.mjs`: decodificación con validación de versión/esquema, filtros, fechas y paginación.
- `protocol-catalog.mjs`: paneles, selección, carga bajo demanda, caché limitada, reintentos y protección frente a respuestas tardías.

El índice y módulos forman parte del núcleo offline; todos los detalles están en «Guardar plano y fichas». Un detalle ya consultado también se conserva en caché. Para consultar cualquier protocolo sin señal, completar ese paquete. El Excel original se descarga aparte en «Documentos originales». Servidor protege índice, detalles y original con el mismo acceso de Atlas.

## Regeneración y revisión

1. Conservar el nuevo archivo autorizado en la ruta de fuente; revisar su estructura y fecha de corte. No reemplazar fuentes sin autorización.
2. Ejecutar `python scripts/import-protocol-matrix.py` y revisar el resumen emitido. El importador rechaza cambios de cabeceras y discrepancias en el total declarado para revisión.
3. Ejecutar `node scripts/prepare-offline.mjs`.
4. Actualizar y revisar las expectativas de fuente de `protocol-matrix-test.mjs` cuando cambie legítimamente el Excel; ejecutar ese test y `python protocol-import-test.py`.
5. Ejecutar `PLAYWRIGHT_MODULE=<ruta-a-playwright-core> node protocol-matrix-browser-test.mjs` y presentar los cambios en PR. Render permanece en main tras revisión/fusión; no hay publicación automática.

La regeneración no incluye fecha de ejecución y usa orden determinista. Las salidas de prueba se escriben en directorios temporales. SQLite, geometrías y fuentes previas no se reescriben.

## Validación

`protocol-matrix-test.mjs` usa SheetJS como lector independiente y compara los 16 campos de cada una de las 20.233 filas con el Excel original. Verifica búsquedas, recuentos, duplicados, fechas, paginación, identidad, versión/esquema, paquetes offline y descarga protegida idéntica al original. Se ejecuta en el build de Render.

`protocol-import-test.py` verifica repetibilidad con dos semillas de hash y que un total incompatible no modifique derivados válidos.

`protocol-matrix-browser-test.mjs` usa Node protegido y Chromium real en escritorio/móvil: carga diferida, desplegables/paneles, filtros, ficha inline, paginación, persistencia sin sobrescribir datos locales, resultados vacíos, descarga, reintentos, respuesta atrasada y recarga con el service worker activo y red deshabilitada. Las capturas muestran registros reales del archivo; los únicos registros de prueba locales quedan aislados en el contexto del navegador y no se incorporan al programa.

Filtros de fechas y análisis posterior: [CRITICAL_PROTOCOLS.md](CRITICAL_PROTOCOLS.md).
