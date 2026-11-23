"""Plano unificado de Cielos de un piso: compone sus láminas CIE (PDF) en las coordenadas del visor de ATLAS y lo corta
en teselas, con el mismo formato que generar-mapa-s01.py (el −1).

Cada lámina se ubica con su desplazamiento de alineacion-<piso>.json (alinear_cie.py) y se queda con la parte del
plano que le toca: la que está dentro de su zona de dibujo (sin la carátula de la derecha), cerca de sus recintos y más
cerca del centro de sus recintos que del de cualquier otra lámina. Así no entran carátulas, timbres ni el blanco de los
márgenes, y en los traslapes manda la lámina que dibuja esa zona.

Uso: python scripts/cielos/generar-mapa-cie.py N02 <carpeta con cie-501.pdf…> <pos-n02.json>
Escribe dist/n02/cie-map/ (teselas), dist/n02/cie-map.mjs (la malla) y dist/n02/cie-simbologia.webp (tablas de la
primera lámina). Después se marca el piso en dist/pisos.js con «cielosUnificado».
"""
import hashlib, json, math, sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from alinear_cie import pares_de  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
REPO = Path(__file__).resolve().parents[2]
SIZE, SCALES, BLOQUE = 512, (0.55, 1.35), 48
CARATULA = .885      # la carátula ocupa la franja derecha de la lámina (desde el 88,5 % del ancho)
MARGEN = 320         # unidades del plano alrededor de los recintos de cada lámina


def generar(piso, carpeta, posiciones):
    al = json.loads(Path(__file__).with_name(f'alineacion-{piso.lower()}.json').read_text(encoding='utf8'))['hojas']
    pos = json.loads(Path(posiciones).read_text(encoding='utf8'))['pos']
    unicos = {k: v[0] for k, v in pos.items() if len(v) == 1}
    hojas = []
    for nombre, a in sorted(al.items()):
        pdf = Path(carpeta) / a['archivo']
        if hashlib.sha256(pdf.read_bytes()).hexdigest() != a['sha256']:
            raise ValueError(f'La lámina {nombre} cambió: vuelve a correr alinear_cie.py')
        dx, dy = a['desplazamiento']
        with pymupdf.open(pdf) as d:
            pagina = d[0]; w, h = pagina.rect.width, pagina.rect.height
            recintos = [(b[0], b[1]) for _, b in pares_de(pagina, unicos)]
        xs, ys = [p[0] for p in recintos], [p[1] for p in recintos]
        dibujo = (dx, dy, dx + w * CARATULA, dy + h)
        cerca = (min(xs) - MARGEN, min(ys) - MARGEN, max(xs) + MARGEN, max(ys) + MARGEN)
        zona = (max(dibujo[0], cerca[0]), max(dibujo[1], cerca[1]), min(dibujo[2], cerca[2]), min(dibujo[3], cerca[3]))
        hojas.append({'nombre': nombre, 'pdf': pdf, 'dx': dx, 'dy': dy, 'zona': zona, 'centro': (sum(xs) / len(xs), sum(ys) / len(ys))})
    x0 = math.floor(min(s['zona'][0] for s in hojas)); y0 = math.floor(min(s['zona'][1] for s in hojas))
    x1 = math.ceil(max(s['zona'][2] for s in hojas)); y1 = math.ceil(max(s['zona'][3] for s in hojas))
    width, height, escala = x1 - x0, y1 - y0, max(SCALES)
    W, H = round(width * escala), round(height * escala)
    lienzo = np.full((H, W, 3), 255, np.uint8)
    # Dueño de cada bloque: la lámina cuya zona lo contiene y cuyo centro de recintos está más cerca.
    filas, cols = math.ceil(H / BLOQUE), math.ceil(W / BLOQUE)
    dueno = np.full((filas, cols), -1, np.int16)
    for i in range(filas):
        for j in range(cols):
            wx, wy = x0 + (j + .5) * BLOQUE / escala, y0 + (i + .5) * BLOQUE / escala
            mejor, dist = -1, 1e18
            for k, s in enumerate(hojas):
                z = s['zona']
                if z[0] <= wx <= z[2] and z[1] <= wy <= z[3]:
                    d = math.hypot(wx - s['centro'][0], wy - s['centro'][1])
                    if d < dist: mejor, dist = k, d
            dueno[i, j] = mejor
    for k, s in enumerate(hojas):
        with pymupdf.open(s['pdf']) as d:
            pix = d[0].get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=False, annots=False)
            img = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3)
        ox, oy = round((s['dx'] - x0) * escala), round((s['dy'] - y0) * escala)
        for i, j in zip(*np.nonzero(dueno == k)):
            ty0, tx0 = i * BLOQUE, j * BLOQUE; ty1, tx1 = min(H, ty0 + BLOQUE), min(W, tx0 + BLOQUE)
            sy0, sx0 = max(0, ty0 - oy), max(0, tx0 - ox); sy1, sx1 = min(pix.height, ty1 - oy), min(pix.width, tx1 - ox)
            if sy1 > sy0 and sx1 > sx0: lienzo[sy0 + oy:sy1 + oy, sx0 + ox:sx1 + ox] = img[sy0:sy1, sx0:sx1]
        print(s['nombre'], 'compuesta', flush=True)
    full = Image.fromarray(lienzo)
    carpeta_salida = piso.lower() + '/cie-map'
    out = REPO / 'dist' / carpeta_salida
    out.mkdir(parents=True, exist_ok=True)

    def sized(factor):
        return full.resize((round(width * factor), round(height * factor)), Image.Resampling.LANCZOS)

    for nombre, factor in (('overview', 0.26), ('overview-mobile', 0.17), ('export', 0.5)):
        sized(factor).save(out / f'{nombre}.webp', quality=90, method=4)
    levels = []
    for z, factor in enumerate(SCALES):
        image = full if factor == escala else sized(factor)
        folder = out / str(z); folder.mkdir(exist_ok=True)
        columns, rows = math.ceil(image.width / SIZE), math.ceil(image.height / SIZE)
        for row in range(rows):
            for column in range(columns):
                left, top = column * SIZE, row * SIZE
                image.crop((left, top, min(left + SIZE, image.width), min(top + SIZE, image.height))).save(folder / f'{column}_{row}.webp', quality=89, method=4)
        levels.append(dict(z=z, scale=factor, columns=columns, rows=rows))
    layout = dict(origin=[x0, y0], width=width, height=height, tileSize=SIZE, tilePath=f'{carpeta_salida}/',
                  overview=f'{carpeta_salida}/overview.webp', export=f'{carpeta_salida}/export.webp', levels=levels)
    (REPO / 'dist' / piso.lower() / 'cie-map.mjs').write_text(
        '// Generado por scripts/cielos/generar-mapa-cie.py\nexport const mapaCielos = ' + json.dumps(layout, indent=2) + ';\n', encoding='utf8')
    # Simbología: la parte alta de la carátula de la primera lámina (tablas de cielos y luminarias).
    primera = hojas[0]
    with pymupdf.open(primera['pdf']) as d:
        r = d[0].rect
        pix = d[0].get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6), clip=pymupdf.Rect(r.width * CARATULA, 0, r.width, r.height * .5), alpha=False, annots=False)
        Image.frombytes('RGB', (pix.width, pix.height), pix.samples).save(REPO / 'dist' / piso.lower() / 'cie-simbologia.webp', quality=88, method=4)
    print(f'Mapa CIE {piso}: {sum(l["columns"] * l["rows"] for l in levels)} teselas · origen {x0},{y0} · {width}×{height}', flush=True)


if __name__ == '__main__':
    generar(*sys.argv[1:4])
