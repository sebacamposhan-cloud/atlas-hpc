# Impermeabilización, artefactos y láminas por piso

Lo que hoy existe solo en el −1 (Impermeabilización con la ficha rápida de Sebastian, avance de artefactos, Cielos y Pavimentos, Puertas como tipo de plano) depende de los datos de cada piso, nunca de que sea el −1. Cada piso declara sus datos en `dist/pisos.js`:

| Marca | Qué activa | Archivos que necesita |
|---|---|---|
| `imp: 'n02'` | Impermeabilización en Herramientas y en el tipo de plano; Proyectos → «Avance de artefactos · plano N02» | `impermeabilizacion/n02.json`, `n02-export.pdf`, `disciplines/imp-n02/`, `source/imp-n02.pdf` y, para los artefactos, `impermeabilizacion/artefactos-n02.json` |
| `especialidades: true` | Cielos y Pavimentos en el tipo de plano | `<datos>disciplines.json` con sus documentos `ceilings` y `floors` y sus teselas en `disciplines/` |
| `puertas: true` | Puertas en Herramientas y en el tipo de plano (plano de puertas por recinto) | `<datos>puertas.json` |
| `puertasPiloto: true` | Puertas como catálogo piloto (hoy solo el −1) | `doors/catalog.json` |

Sin la marca, el piso no muestra la función (ni botones desactivados).

## Cargar la Impermeabilización de un piso

Se necesita la lámina IMP del piso (PDF de una página, por ejemplo `HPC-ARQ-DET-IMP-A-9xx-Rev01 N02.pdf`).

```sh
python -m pip install -r scripts/imp/requirements.txt
python scripts/imp/import.py "HPC-ARQ-DET-IMP-A-9xx-Rev01 N02.pdf" n02 N02 n02/
```

Los argumentos son el código de la lámina, el piso de Atlas y la carpeta de datos del piso (`''` para el −1). El registro usa los ejes S-GRID del PDF y los ejes del piso (`dist/n02/ejes.json`). Los contornos salen de la autoridad geométrica del piso (`scripts/imp/contours.mjs n02/`). Después:

1. agregar `imp: 'n02'` al piso en `dist/pisos.js`;
2. `node scripts/prepare-offline.mjs` (los archivos `imp-n02`, `n02.json`, `artefactos-n02.json` van solos al paquete sin conexión del piso 2);
3. revisar en el plano IMP del piso que los contornos calcen.

## Cargar los artefactos de un piso

Del libro `HPC-5-ARQ-GEN-PMA-03-RevB.xlsx`, hoja «HPC PMA Artefactos»:

```sh
python scripts/imp/import-artifacts.py HPC-5-ARQ-GEN-PMA-03-RevB.xlsx A-N02 n02
```

Decidido con Mauro (2026-11-16): los artefactos de un piso se ven recién cuando ese piso tiene su lámina IMP, como en el −1.

## Cielos y Pavimentos de otro piso

Se necesitan sus láminas CIE y PAV. Con ellas, el importador de especialidades del −1 debe escribir `dist/<datos>/disciplines.json` del piso. Sus teselas van en `disciplines/` con el código del piso en el nombre (por ejemplo `cie-n02-501`), para que vayan al paquete sin conexión de ese piso. Luego se marca el piso con `especialidades: true`.
