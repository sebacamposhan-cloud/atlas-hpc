# Plano monocromático del nivel 2

Genera `dist/n02/map/` (mosaicos WebP en 3 niveles, vista general y exportación) desde la planta vectorial `dist/source/n02-planta-arquitectura.pdf`, en el mismo marco de coordenadas que los recintos del DWG (`data/n02/plano.json`).

pdf.js necesita un navegador, así que el proceso usa Chrome sin ventana:

1. `node scripts/n02-plano/servidor.mjs` (déjalo abierto).
2. Extraer los textos del PDF:
   `chrome --headless=new --disable-gpu --user-data-dir=%TEMP%\n02 http://127.0.0.1:8010/tool/textos.html`
   → `data/n02/textos-pdf.json`
3. `node scripts/n02-plano/ajuste.mjs` → `data/n02/pdf-a-plano.json`. Empareja los códigos de recinto del PDF con los del DWG y calcula una transformación afín. Se detiene si el error mediano supera 15 cm.
4. Renderizar (≈ 1,5 min):
   `chrome --headless=new --disable-gpu --user-data-dir=%TEMP%\n02 http://127.0.0.1:8010/tool/render.html`
   El avance queda en `dist/n02/map/estado.txt` (no se publica).
5. `node scripts/import-n02.mjs`, `node scripts/prepare-offline.mjs` y `node pisos-test.mjs`.

Para revisar una zona sin generar todo: `render.html?x=2950&y=5150&w=750&h=500&s=2` (coordenadas del plano de Atlas).

El monocromático conserva líneas, textos y mobiliario, y aclara los rellenos de color por zona: usa el canal más claro de cada píxel, de modo que el texto sobre un relleno no pierde contraste.
