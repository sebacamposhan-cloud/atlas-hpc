# Plano por capas, rombos y contornos desde las láminas DWG

Dibuja el plano de un nivel directamente desde sus láminas DWG de arquitectura 1:50, sin PDF. Se usa para los niveles 1, 2 y 3, y para el −1 (`s01`), que se dibuja en el marco de su plano anterior: ver `scripts/s01-plano/LEEME.md`.

Fuentes, fuera del repo: carpetas «Planos N01», «Planos N02» y «Planos N03» con las láminas `HPC-ARQ-PLA-N0x-A-5xx`.

- **Coordenadas.** Las láminas exportadas desde Revit comparten las coordenadas del modelo, en metros, así que se unen sin ajustes.
- **Encuadre.** Cada lámina aporta solo el contorno de lo dibujado, que Revit corta en el borde de la vista. Así no entran la viñeta, la leyenda ni el plano llave.
- **Marco del N02.** El N02 conserva el marco de `data/n02/plano.json`, para que sus contornos sigan calzando.

## Capas

| Capa de Atlas | Capas del DWG | Se puede apagar |
|---|---|---|
| Base | Muros, puertas, ventanas, pilares, escaleras, rótulos, rombos y anotaciones | No |
| Relleno de pasillos y zonas | `A-FLOR-PATT`, `A-AREA-PATT` | Sí |
| Mobiliario y equipos | `Q-*`, `M-EQPM*`, `P-SANR-FIXT*`, `I-FURN*`, `A-FURN*` | Sí |
| Ejes de grilla | `S-GRID*` | Sí |

**Se omiten:** viñeta, cotas, cabezas de corte y nubes de revisión.

**Mosaicos:**
- La base es opaca.
- Cada capa que se puede apagar tiene teselas transparentes en `dist/<nivel>/map/<capa>/`, solo donde tiene dibujo.
- El visor dibuja las capas sobre la base con mezcla «multiplicar».

**Preferencia:** el botón «Capas» de la barra del plano guarda la elección en el equipo, y vale para todos los pisos, incluido el −1.

## Pasos

1. **Instalar el lector.** Es LibreDWG en WebAssembly, con licencia GPL. Se instala fuera del repo y no se publica:
   `npm install --prefix <carpeta> @mlightcad/libredwg-web@0.7.17`
2. **Extraer el dibujo.**
   `node scripts/dwg-plano/extraer.mjs <carpeta> "<Planos N0x>" n0x`
   - **Zona sin lámina 1:50:** con `PLANTA_GENERAL="<archivo>|x0,y0,x1,y1|0.25"` se agrega una planta general (copiada en la misma carpeta) solo en esa ventana, en cm del modelo. Sus textos (1:200) se reducen a la escala de las láminas y sus puertas se reconocen por el nombre del bloque. En el N03 la zona de la A-501, que no está entre las láminas, sale de la planta general:
     `PLANTA_GENERAL="HPC-5-ARQ-PLA-N03-A-201-RevC.dwg|-8300.2,8700,-4436.5,11560.3|0.25"` (unidad 3.2.2: 38 recintos).
   - Genera `data/n0x/laminas.json`, con huellas, encuadres, rótulos y rombos, y `data/n0x/marco.json`.
   - Genera `data/n0x/vanos.json`: el vano de cada puerta, de jamba a jamba, sobre el eje del muro.
   - Genera `data/n0x/zonas.json` si las láminas traen rellenos de color de recinto (capa `A-AREA-PATT`). Hoy solo el N02.
   - También genera `dibujo.json` y `barreras.json`. Son grandes y no se publican.
   - En el −1 reescribe `marco.json`: hay que restaurarlo (`git checkout data/s01/marco.json`) o repetir `scripts/s01-plano/ajuste.mjs`.
3. **Calcular recintos.** Solo para N01 y N03:
   `node scripts/dwg-plano/recintos.mjs n0x` → `data/n0x/recintos.json`
   - El contorno lo calcula `contorno.mjs`. Ver «Contornos» más abajo.
   - Se acepta si el área queda entre 80 % y 120 % de la superficie del PMA, o hasta 1,5 m² de más en recintos chicos.
   - Entre 60 % y 80 % queda como contorno parcial, por tabiques interiores.
   - Si el relleno se une con otro recinto por una abertura sin puerta, o el área no calza, el recinto lleva una superficie auxiliar de selección.
4. **Dibujar los mosaicos.**
   - Inicia el servidor y déjalo abierto: `node scripts/dwg-plano/servidor.mjs`
   - Abre `http://127.0.0.1:8011/tool/render.html?nivel=n0x` en Chrome sin ventana:
     `chrome --headless=new --disable-gpu --user-data-dir=%TEMP%\dwg <url>`
   - Tarda unos 3 min por nivel.
   - Genera `dist/n0x/map/` con la base, las capas, la vista general y la exportación, las imágenes `dist/n0x/rombos/<código>.png` y `data/n0x/rombos-plano.json`.
   - El avance queda en `dist/n0x/map/estado.txt`.
5. **Importar.**
   - N01 y N03: `node scripts/import-dwg.mjs n0x`
   - N02: `node scripts/n02-plano/recalcular-contornos.mjs` y después `node scripts/import-n02.mjs`
     - El primero recalcula los contornos de `data/n02/plano.json` desde las láminas y los deja en `data/n02/contornos-recalculados.json`.
     - El importador usa el recalculado si el recinto cierra. Si no, conserva el de `plano.json`, corrido con el desfase medido.
   - Luego `node scripts/recintos-extra.mjs`, que hace dos cosas:
     - agrega los recintos rotulados que el plano no tiene: en el N02, los que quedaron sin polilínea; en el −1, los de las láminas A-511 y A-512;
     - quita de los niveles 2 y 3 los recintos de triple altura del nivel 1.
     El contorno sale de `contorno.mjs`. Lo calculado queda en `data/<nivel>/recintos-extra.json`, para volver a aplicarlo sin `barreras.json`. Se puede correr varias veces: lo que agregó antes lo vuelve a calcular.
   - Después: `node scripts/prepare-offline.mjs`, `node contorno-dwg-test.mjs` y `node pisos-test.mjs`.

## Contornos

`contorno.mjs` saca el contorno de un recinto de dos fuentes, en este orden:

1. **Relleno de color del recinto.** Si la lámina pinta el recinto (esquema de color de Revit, capa `A-AREA-PATT`), ese relleno es el límite que usa el modelo. Corta los pasillos donde corresponde aunque no haya puerta.
   - Un recinto que cruza dos láminas trae un relleno en cada una. Se unen los que se traslapan; los que solo se tocan son recintos vecinos.
   - El relleno de Revit rodea las hojas de las puertas abiertas. Esas ranuras se cierran.
   - Se usa si su área queda a ±5 % de la superficie declarada.
2. **Relleno desde el rótulo.** Se rasterizan muros, ventanales, pilares y escaleras en una grilla de 3 cm para todo el nivel y se rellena desde el rótulo.
   - **Puertas.** Cada puerta cierra su vano con una recta de jamba a jamba sobre el eje del muro. La hoja, el barrido y el marco no limitan. Frente al vano, el borde pasa por la cara del muro: el contorno queda recto.
   - **Línea del muro.** El borde se lleva a la línea del muro, no a 6 cm por dentro como antes. El área calza mejor con la declarada.
   - **Sin ventana de búsqueda.** Un pasillo largo se rellena completo. El relleno se detiene si pasa de 125 % de la superficie declarada.

En los dos casos:
- Los tramos casi horizontales o verticales se ponen a escuadra y los chaflanes cortos pasan a ser esquinas.
- Los huecos de más de 1,5 m², como un núcleo rodeado por un pasillo, se guardan aparte y no cuentan en el área.
- **Superficie auxiliar.** Si el contorno no cierra, se guarda la parte del recinto que rodea al rótulo, recortada por los muros. Ya no es un cuadrado que invade los recintos vecinos.

**Resultado (noviembre de 2026):**

| Piso | Con contorno | Parciales | Auxiliares | Error medio de área |
|---|---|---|---|---|
| N01 | 308 de 359 (antes 286) | 10 | 41 (antes 64) | 2,5 % (antes 7,8 %) |
| N02, recintos de `plano.json` | 267 de 311 recalculados | | 44 conservan su contorno anterior | 1,2 % (antes 3,9 %) |
| N02, recintos agregados | 48 de 48 (antes 30) | 0 | 0 (antes 17) | menos de 1 % |
| N03 | 251 de 308 (antes 233) | 1 | 56 (antes 71) | 1,8 % (antes 8,0 %) |
| −1, recintos agregados | 9 de 14 | 2 | 3 (antes 4) | |

**Desfase del N02.** Los contornos de `plano.json` venían de la planta general y estaban corridos 18,7 cm en X y −3,6 cm en Y respecto de los muros de las láminas 1:50 con que se dibuja el plano (medido en 263 recintos, igual en las 8 láminas). Los recalculados calzan con los muros. A los 44 que se conservan (recintos abiertos: estaciones de enfermería, puestos de monitoreo, salas de espera) se les aplica ese desfase.

Los auxiliares que quedan son recintos abiertos, sin muro ni puerta que los separe: estaciones de enfermería, salas de espera, áreas de casilleros y circulaciones de N01 y N03, que no traen relleno de color. Se corrigen en el editor de contornos.

**Revisar una zona sin generar todo:** `render.html?nivel=n01&x=1600&y=2000&w=700&h=500&s=2&guardar=nombre`, en coordenadas de Atlas. La imagen queda en `data/n01/revision/`, que Git ignora.

**Láminas faltantes:** cuando lleguen (por ejemplo N01 A-509 o N03 A-501), se copian en su carpeta y se repiten los pasos 2 a 5.
