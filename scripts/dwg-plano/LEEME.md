# Plano por capas, rombos y contornos desde las láminas DWG

Dibuja el plano de un nivel directamente desde sus láminas DWG de arquitectura 1:50, sin PDF. Se usa para los niveles 1, 2 y 3.

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

**Preferencia:** el botón «Capas» de la barra del plano guarda la elección en el equipo, y vale para todos los pisos. El nivel −1 viene de PDF sin capas, así que necesita sus láminas DWG para poder apagarlas.

## Pasos

1. **Instalar el lector.** Es LibreDWG en WebAssembly, con licencia GPL. Se instala fuera del repo y no se publica:
   `npm install --prefix <carpeta> @mlightcad/libredwg-web@0.7.17`
2. **Extraer el dibujo.**
   `node scripts/dwg-plano/extraer.mjs <carpeta> "<Planos N0x>" n0x`
   - Genera `data/n0x/laminas.json`, con huellas, encuadres, rótulos y rombos, y `data/n0x/marco.json`.
   - También genera `dibujo.json` y `barreras.json`. Son grandes y no se publican.
3. **Calcular recintos.** Solo para N01 y N03:
   `node scripts/dwg-plano/recintos.mjs n0x` → `data/n0x/recintos.json`
   - El contorno sale de rellenar desde el rótulo entre muros, puertas, ventanas, pilares y escaleras.
   - En las puertas, el vano se cierra con la recta de la hoja cerrada y el arco de barrido no limita.
   - Se acepta si el área queda entre 80 % y 120 % de la superficie del PMA.
   - Entre 60 % y 80 % queda como contorno parcial, por tabiques interiores.
   - Si el relleno se escapa por aberturas sin puerta o el área no calza, el recinto lleva una superficie auxiliar de selección en su rótulo.
4. **Dibujar los mosaicos.**
   - Inicia el servidor y déjalo abierto: `node scripts/dwg-plano/servidor.mjs`
   - Abre `http://127.0.0.1:8011/tool/render.html?nivel=n0x` en Chrome sin ventana:
     `chrome --headless=new --disable-gpu --user-data-dir=%TEMP%\dwg <url>`
   - Tarda unos 3 min por nivel.
   - Genera `dist/n0x/map/` con la base, las capas, la vista general y la exportación, las imágenes `dist/n0x/rombos/<código>.png` y `data/n0x/rombos-plano.json`.
   - El avance queda en `dist/n0x/map/estado.txt`.
5. **Importar.**
   - N01 y N03: `node scripts/import-dwg.mjs n0x`
   - N02: `node scripts/import-n02.mjs`
   - Después: `node scripts/prepare-offline.mjs` y `node pisos-test.mjs`.

**Revisar una zona sin generar todo:** `render.html?nivel=n01&x=1600&y=2000&w=700&h=500&s=2&guardar=nombre`, en coordenadas de Atlas. La imagen queda en `data/n01/revision/`, que Git ignora.

**Láminas faltantes:** cuando lleguen (por ejemplo N01 A-509 o N03 A-501), se copian en su carpeta y se repiten los pasos 2 a 5.
