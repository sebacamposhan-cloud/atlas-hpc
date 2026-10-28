# Plano del nivel −1 desde sus láminas DWG

El −1 se armó desde las láminas PDF A-501…A-509, unidas por traslación. Sobre ese marco existen sus 330 recintos, contornos, rombos, correcciones, especialidades y puertas. Para que todo siga calzando, el dibujo DWG se lleva a ese mismo marco: no se cambia el plano de coordenadas.

Fuentes, fuera del repo: carpeta «Planos S01» con `HPC-ARQ-PLA-S01-A-501…508, 511, 512-Rev01_V1.dwg`.

## Pasos

1. **Extraer el dibujo** con el lector LibreDWG, como en `scripts/dwg-plano`:
   `node scripts/dwg-plano/extraer.mjs <carpeta del lector> "<Planos S01>" s01`
   Genera `data/s01/dibujo.json`, `laminas.json` y `barreras.json`, en cm del modelo.
2. **Calzar con el plano existente:** `node scripts/s01-plano/ajuste.mjs`
   - Hace un ajuste de semejanza entre el rótulo de cada recinto en el DWG y su posición en el mosaico del −1. Usa los códigos únicos y descarta los que no calzan.
   - Con los DWG de Rev01_V1 hubo 256 recintos en común. El ajuste dio escala 0,56692 (la teórica de 1:50 en puntos es 0,56693), giro de 0,0009° y error mediano de 0,5 cm (90 % bajo 1,7 cm). Ninguna lámina superó 0,7 cm de error mediano.
   - Escribe `data/s01/marco.json`: la escala y la traslación del calce, más la ventana del mapa actual (origen 1105,6 · 284,2 y tamaño 5302 × 7630). También escribe `data/s01/ajuste.json`, con el error de cada recinto.
   - Se detiene si el giro supera 0,05° o si el error mediano supera 15 cm.
3. **Dibujar los mosaicos:** `node scripts/dwg-plano/servidor.mjs`, y en Chrome sin ventana `http://127.0.0.1:8011/tool/render.html?nivel=s01` (≈ 2 min).
   - Escribe en `dist/map/`, la carpeta del −1: la base con la misma grilla de teselas que antes y las capas `relleno/`, `mobiliario/` y `ejes/`.
   - No genera imágenes de rombo: el −1 conserva las suyas.
4. **Incorporar:** `node scripts/s01-plano/importar.mjs` agrega las capas al bloque `map` de `dist/runtime.json`. Antes comprueba que la ventana y la grilla de teselas coincidan.
5. **Ejes:** `node scripts/ejes/generar.mjs` escribe `dist/ejes.json`, la grilla de los protocolos en el plano del −1. Después: `node scripts/prepare-offline.mjs`.

Para probar una zona sin generar todo: `render.html?nivel=s01&x=1450&y=500&w=700&h=450&s=1.5&guardar=prueba`, en coordenadas de Atlas. La imagen queda en `data/s01/revision/`.
