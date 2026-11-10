# Puertas: plano de avance y Proyecto tipo Puertas

## Qué hace
- **Plano → Puertas** muestra cada puerta del piso en su lugar, con el color de su estado y su número de vano.
  - Al alejar el plano, las puertas son puntos chicos. Al acercar, se ve el círculo con el número.
  - Tocar una puerta abre su ficha:
    - modelo (PI09c);
    - llave (K2_N02_14);
    - vano;
    - ancho;
    - código de partida;
    - contratista;
    - estado en el plano;
    - descripción del modelo: tipo de puerta, familia y vano de obra de cada variante.
  - El panel filtra por estado y por contratista, y busca por vano, llave, modelo o descripción del modelo («cortafuegos», «vaivén»).
  - El botón Excel exporta todo.
- **Consulta o terreno:**
  - Sin proyecto abierto se ven los estados tal como vienen en el plano de avance.
  - «Marcar en terreno» abre el Proyecto tipo Puertas del piso, o lo crea si no existe. Pide sesión iniciada.
  - Con el proyecto abierto, cada puerta se marca con los estados de su contratista:
    - **Teisa** (puertas de madera): No instalada, Instalada, Revisar.
    - **Protego** (cortafuego y metálicas): No instalada, Pletinas instaladas, Instalada.
  - Se guarda quién y cuándo. Lo no tocado sigue al plano.
- **Proyectos:**
  - «+ Nuevo proyecto → Puertas» crea el proyecto del piso.
  - En «Mis proyectos», abrir un proyecto de puertas lleva al plano de puertas.
  - Se sincroniza con la nube como cualquier proyecto (tipo `proyecto`, sin cambios en Supabase).
- **Números de vano:** se conservan tal cual. Sacyr y los subcontratos los usan para ubicar los vanos.

## Fuente: plano de avance de instalación
`PUERTAS N02.dwg`: planta general de Revit, coordenadas del modelo en metros.

| Capa del DWG | Contratista | Estado | Marca |
|---|---|---|---|
| `TEISA - INSTALADA` (verde) | Teisa | Instalada | círculo alrededor del rótulo |
| `TEISA` (rojo) | Teisa | No instalada | círculo alrededor del rótulo |
| `REVISAR TEISA` (rojo) | Teisa | Revisar | círculo alrededor del rótulo |
| `PROTEGO - INSTALADA` (verde) | Protego | Instalada | círculo con número de vano |
| `PROTEGO PUERTAS` (rojo) | Protego | No instalada | círculo con número de vano |
| `PROTEGO - PLETINAS` (magenta) | Protego | Pletinas instaladas | círculo con número de vano |

En la capa `A-DOOR-IDEN` cada puerta trae un rótulo con el modelo, el ancho («0,90 m») y el código de partida («6.6.1.3.4»), y su llave a unos 50 cm.

**Lectura (`scripts/puertas/importar-dwg.mjs`):**
- Cada llave se empareja con el rótulo más cercano, a 1 m o menos.
- Cada círculo de avance va a la puerta más cercana, a 1,6 m o menos. Una puerta puede tener dos círculos: el de la puerta y el de las pletinas.
- Para el estado, instalada manda sobre pletinas, que manda sobre revisar, que manda sobre no instalada.
- Un círculo sin puerta rotulada cerca queda como vano propio, con su número y su estado: no se pierde.
- Lo que cae fuera del marco del plano del piso (otra zona del dibujo) se conserva en la lista, marcado, pero no se dibuja.

**Ubicación:**
- Se calzan los ejes de grilla del DWG (`S-GRID-IDEN`) con `dist/<piso>/ejes.json`, por mínimos cuadrados.
- En el N02 se usaron 14 ejes numerados y 22 con letra. El residuo es de 3,9 unidades en X (unos 7 cm) y 0,06 en Y.

**Resultado en el N02:**
- 394 puertas: 179 instaladas, 70 no instaladas, 10 con pletinas como estado principal, 1 por revisar y 134 sin registro en el plano.
- 115 llevan número de vano y 17 tienen pletinas.
- Se usan los 280 círculos del plano.
- 36 puertas quedan marcadas para revisar, entre ellas 5 que están fuera del plano.

## Regenerar o sumar un piso
1. Instalar el lector LibreDWG (WebAssembly, GPL) fuera del repo:
   ```
   npm install --prefix <carpeta> @mlightcad/libredwg-web@0.7.17
   ```
2. Importar el piso:
   ```
   node scripts/puertas/importar-dwg.mjs <carpeta> "PUERTAS N0x.dwg" n0x
   ```
   El resultado queda en `dist/n0x/puertas.json`.
3. Ejecutar `node puertas-avance-test.mjs`. Después regenerar `sw.js` en un checkout con fin de línea LF (`node scripts/prepare-offline.mjs`).

Faltan los DWG de avance de puertas de N01, N03 y −1. En el −1 sigue el plano de puertas en PDF de antes, en Filtros y capas.

## Descripción del modelo
Sale de la «Planilla vanos de puertas», lámina HPC-ARQ-FDI-224 Rev03 del 26 de noviembre de 2024. Llegó escaneada, así que se transcribió a mano en `dist/puertas-modelos.mjs`.

- La planilla trae 72 modelos en 9 familias: vidriadas de aluminio, madera llena, madera con mirilla, madera plomadas, metálicas vidriadas, automáticas de HPL, escape y cortafuego, metálicas llenas y especiales.
- Cada fila es una variante: ítem, descripción y vano de obra (ancho × alto, en mm). Un modelo puede tener hasta tres: sin imposta («SI»), con imposta opaca y con imposta vidriada o de policarbonato.
- El plano de avance no dice cuál variante lleva cada puerta. La ficha las muestra todas.
- Los ítems de la planilla (6.5.x) no son los códigos de partida del plano de avance (6.6.1.x).
- Vano terminado = vano de obra + 30 mm.
- En el N02, 9 modelos del plano no están en la planilla: PAS1, PAS2, PAS3, PI01ka, PI04da, PI05a, PI10b, PI13a y PI13b. Su ficha lo dice y no inventa una descripción.
- La descripción también va en la búsqueda del panel y en el Excel.

**Por confirmar con el original:** en el escaneo las letras «i» y «l» se parecen. Se leyó PI01i (corredera 140), PI01l (abatir 120), PI09i (doble RF120 90/90) y PI09l (psiquiatría RF60 90), por el orden de la planilla.

## Archivos
- `dist/puertas-model.mjs`: estados, contratistas, proyecto, búsqueda y Excel. Sin DOM.
- `dist/puertas-modelos.mjs`: descripción de cada modelo, de la planilla de vanos.
- `dist/puertas.mjs`: plano, panel y ficha.
- `dist/puertas.css`
- `dist/n02/puertas.json`
- Pruebas: `puertas-avance-test.mjs`, en `render.yaml`.
