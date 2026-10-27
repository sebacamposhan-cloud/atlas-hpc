# Plano monocromático, rombos y contornos del nivel 2

> Desde la incorporación de los niveles 1 y 3, el plano de fondo y las imágenes de rombo del nivel 2 se dibujan desde sus láminas DWG, separados en capas, con `scripts/dwg-plano` (ver su LEEME). Los contornos y la monografía siguen saliendo de aquí (`plano.json`, `dwg-rombos.mjs`, `dwg-contornos.mjs`). Los pasos de PDF (3 a 5) quedan como referencia.

Fuentes (carpeta «Planos N02», fuera del repo):
- `planta arquitectura N02.pdf` (copiada como `dist/source/n02-planta-arquitectura.pdf`): planta vectorial completa con muros, mobiliario y rótulos. No trae rombos.
- `HPC-ARQ-PLA-N02-A-501…508-Rev01_V1.dwg`: láminas 1:50. Traen los rombos de terminación (bloque `ARQ_GEN_RomboTerminación1_50`) y las líneas de límite de recintos (capa `A-AREA`).

Resultados: `dist/n02/map/` (mosaicos WebP en 3 niveles, vista general y exportación), `dist/n02/rombos/<código>.png` (rombo de cada recinto para la ficha) y, en `data/n02/`, los datos intermedios.

## Pasos

1. **Rombos desde los DWG** (lector LibreDWG en WebAssembly, licencia GPL, instalado fuera del repo; no se publica):
   `npm install --prefix <carpeta> @mlightcad/libredwg-web@0.7.17`
   `node scripts/n02-plano/dwg-rombos.mjs <carpeta> "<Planos N02>"` → `data/n02/rombos-dwg.json`.
   Ubica cada lámina sobre el plano por los códigos de recinto (error ≈ 1 cm) y lee M1–M4, CIE y PAV por la posición del texto en el rombo. Compara con `plano.json` y avisa diferencias.
2. `node scripts/n02-plano/servidor.mjs` (déjalo abierto). pdf.js necesita un navegador, así que los pasos 3 y 5 usan Chrome sin ventana:
   `chrome --headless=new --disable-gpu --user-data-dir=%TEMP%\n02 <url>`
3. Textos del PDF: `http://127.0.0.1:8010/tool/textos.html` → `data/n02/textos-pdf.json`.
4. `node scripts/n02-plano/ajuste.mjs` → `data/n02/pdf-a-plano.json`. Transformación PDF → plano por los códigos de recinto; se detiene si el error mediano supera 15 cm.
5. Render (≈ 1,5 min): `http://127.0.0.1:8010/tool/render.html`. Dibuja la planta en monocromático y encima los rombos del DWG, centrados sobre el rótulo de cada recinto y a la escala de anotación del PDF. Genera también las imágenes de rombo y `data/n02/rombos-plano.json`. El avance queda en `dist/n02/map/estado.txt` (no se publica).
6. `node scripts/import-n02.mjs`, `node scripts/prepare-offline.mjs` y `node pisos-test.mjs`.

Revisar una zona sin generar todo: `render.html?x=2950&y=5150&w=750&h=500&s=2` (coordenadas del plano de Atlas); `&color=1` muestra el PDF original y `&guardar=nombre` deja la imagen en `scripts/n02-plano/revision/` (ignorada por Git).

## Recintos abiertos

23 recintos (estaciones de enfermería, puestos de monitoreo, salas de espera…) no tienen todos sus lados dibujados: ni la planta PDF ni los DWG los cierran (se comprobó rellenando desde el rótulo con muros, puertas, ventanales, pilares y líneas `A-AREA`: siempre se escapa al pasillo; `dwg-contornos.mjs` deja ese diagnóstico en `data/n02/contornos-dwg.json`). La app original los había cerrado con arcos inventados. `import-n02.mjs` reemplaza cada arco por tramos rectos alineados con los ejes y conserva los tramos que siguen muros; si no queda una forma válida (área entre 50 % y 125 % de la declarada, sin cruces), usa una superficie auxiliar de selección en el rótulo. Ambos casos quedan marcados en la ficha.

## Monocromático

Conserva líneas, textos y mobiliario y aclara los rellenos de color por zona: usa el canal más claro de cada píxel, de modo que el texto sobre un relleno no pierde contraste.
