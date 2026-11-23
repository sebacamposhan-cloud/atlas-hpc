"""Plano de especialidad unificado de una sola lámina por piso (Compartimentación, Retornos vinílicos…), en las
coordenadas del visor de ATLAS y cortado en teselas con el mismo formato que Cielos (scripts/cielos/).

La lámina viene a otra escala que el plano de ATLAS (todo el piso en una hoja), así que se alinea con una similitud
(escala, giro y traslado) ajustada con los códigos de recinto que trae como texto (RANSAC), y después se afina el
traslado con los muros del plano de arquitectura del piso (correlación de fase con su export a escala 0,5). Se recorta a
la zona de los recintos, sin carátula ni márgenes.

Uso: python scripts/planos/generar-plano.py <tipo> <piso> <lámina.pdf> <pos.json>
  tipo: comp, retornos…   piso: N-1, N01…   pos.json: node scripts/cielos/posiciones-recintos.mjs <carpeta-piso>
Escribe dist/<carpeta>/<tipo>-map/, dist/<carpeta>/<tipo>-map.mjs y scripts/planos/alineacion-<tipo>-<piso>.json.
"""
import hashlib, json, math, random, sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'cielos'))
from alinear_cie import palabras, tinta, correlacion  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
REPO = Path(__file__).resolve().parents[2]
SIZE, SCALES, MARGEN, ESC = 512, (0.55, 1.35), 320, .5


def similitud(pares):
    n = len(pares); ax = sum(a[0] for a, _ in pares) / n; ay = sum(a[1] for a, _ in pares) / n
    bx = sum(b[0] for _, b in pares) / n; by = sum(b[1] for _, b in pares) / n
    sxx = sxy = syx = syy = va = 0
    for (x, y), (u, v) in pares:
        x -= ax; y -= ay; u -= bx; v -= by
        sxx += x * u; sxy += x * v; syx += y * u; syy += y * v; va += x * x + y * y
    giro = math.atan2(sxy - syx, sxx + syy); c, s = math.cos(giro), math.sin(giro)
    esc = ((sxx + syy) * c + (sxy - syx) * s) / va
    return esc, giro, bx - esc * (c * ax - s * ay), by - esc * (s * ax + c * ay)


def aplicar(t, p):
    esc, giro, tx, ty = t; c, s = math.cos(giro), math.sin(giro)
    return esc * (c * p[0] - s * p[1]) + tx, esc * (s * p[0] + c * p[1]) + ty


def ajustar(pares, tolerancia=45):
    random.seed(7); mejor = []
    for _ in range(4000):
        a, b = random.sample(pares, 2)
        if math.dist(a[0], b[0]) < 100: continue
        t = similitud([a, b]); dentro = [p for p in pares if math.dist(aplicar(t, p[0]), p[1]) < tolerancia]
        if len(dentro) > len(mejor): mejor = dentro
    for _ in range(3):
        t = similitud(mejor); mejor = [p for p in pares if math.dist(aplicar(t, p[0]), p[1]) < tolerancia]
    return similitud(mejor), len(mejor)


def generar(tipo, piso, pdf, posiciones):
    carpeta = '' if piso == 'N-1' else piso.lower() + '/'
    pos = json.loads(Path(posiciones).read_text(encoding='utf8'))['pos']
    unicos = {k: v[0] for k, v in pos.items() if len(v) == 1}
    with pymupdf.open(pdf) as d:
        pagina = d[0]; vistos = {}
        for t, p in palabras(pagina): vistos.setdefault(t, []).append(p)
        pares = [(v[0], unicos[k]) for k, v in vistos.items() if len(v) == 1 and k in unicos]
        (esc, giro, tx, ty), n = ajustar(pares)
        if abs(math.degrees(giro)) > 1: raise ValueError(f'La lámina viene girada {math.degrees(giro):.1f}°: revisar a mano')
        # Con giro casi nulo se trabaja con escala y traslado (la página ya viene en su orientación visible).
        mapa = json.loads((REPO / 'dist' / carpeta / 'map' / 'index.json').read_text())
        ox, oy = mapa['origin']; arq = tinta(Image.open(REPO / 'dist' / mapa['export']))
        pix = pagina.get_pixmap(matrix=pymupdf.Matrix(esc * ESC, esc * ESC), alpha=False, annots=False)
        lam = tinta(Image.frombytes('RGB', (pix.width, pix.height), pix.samples)); h, w = lam.shape
        x0, y0 = round((tx - ox) * ESC), round((ty - oy) * ESC); a = np.zeros_like(lam)
        sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(arq.shape[1], x0 + w), min(arq.shape[0], y0 + h)
        if sx1 > sx0 and sy1 > sy0: a[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = arq[sy0:sy1, sx0:sx1]
        cx, cy, nitidez = correlacion(a, lam)
        tx, ty = tx + cx / ESC, ty + cy / ESC
        alineacion = {'tipo': tipo, 'piso': piso, 'archivo': Path(pdf).name, 'sha256': hashlib.sha256(Path(pdf).read_bytes()).hexdigest(),
                      'escala': esc, 'giro': math.degrees(giro), 'desplazamiento': [round(tx, 3), round(ty, 3)], 'codigos': len(pares),
                      'codigosAjustan': n, 'correccionMuros': [cx / ESC, cy / ESC], 'nitidez': round(nitidez, 2),
                      'metodo': 'códigos de recinto (similitud RANSAC) + correlación con el plano de arquitectura (generar-plano.py)'}
        salida_al = Path(__file__).with_name(f'alineacion-{tipo}-{piso.lower()}.json')
        salida_al.write_text(json.dumps(alineacion, indent=1, ensure_ascii=False), encoding='utf8')
        print(f'{tipo} {piso}: códigos {len(pares)} ajustan {n} escala {esc:.4f} giro {math.degrees(giro):.2f}° desplazamiento ({tx:.1f}, {ty:.1f}) nitidez {nitidez:.2f}', flush=True)
        # Zona: los recintos de la lámina con margen.
        mundo = [(esc * p[0] + tx, esc * p[1] + ty) for p, _ in pares]
        X0 = math.floor(min(p[0] for p in mundo) - MARGEN); Y0 = math.floor(min(p[1] for p in mundo) - MARGEN)
        X1 = math.ceil(max(p[0] for p in mundo) + MARGEN); Y1 = math.ceil(max(p[1] for p in mundo) + MARGEN)
        width, height, escala = X1 - X0, Y1 - Y0, max(SCALES)
        # Recorte de la página que cae en la zona, a la escala más alta.
        clip = pymupdf.Rect((X0 - tx) / esc, (Y0 - ty) / esc, (X1 - tx) / esc, (Y1 - ty) / esc) & pagina.rect
        pix = pagina.get_pixmap(matrix=pymupdf.Matrix(escala * esc, escala * esc), clip=clip, alpha=False, annots=False)
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    full = Image.new('RGB', (round(width * escala), round(height * escala)), 'white')
    full.paste(img, (round((clip.x0 * esc + tx - X0) * escala), round((clip.y0 * esc + ty - Y0) * escala)))
    nombre = f'{carpeta}{tipo}-map'
    out = REPO / 'dist' / nombre; out.mkdir(parents=True, exist_ok=True)

    def sized(f): return full.resize((round(width * f), round(height * f)), Image.Resampling.LANCZOS)
    for n_, f in (('overview', .26), ('overview-mobile', .17), ('export', .5)): sized(f).save(out / f'{n_}.webp', quality=90, method=4)
    levels = []
    for z, f in enumerate(SCALES):
        image = full if f == escala else sized(f)
        folder = out / str(z); folder.mkdir(exist_ok=True)
        columns, rows = math.ceil(image.width / SIZE), math.ceil(image.height / SIZE)
        for row in range(rows):
            for column in range(columns):
                l, t = column * SIZE, row * SIZE
                image.crop((l, t, min(l + SIZE, image.width), min(t + SIZE, image.height))).save(folder / f'{column}_{row}.webp', quality=89, method=4)
        levels.append(dict(z=z, scale=f, columns=columns, rows=rows))
    layout = dict(origin=[X0, Y0], width=width, height=height, tileSize=SIZE, tilePath=f'{nombre}/', overview=f'{nombre}/overview.webp', export=f'{nombre}/export.webp', levels=levels)
    (REPO / 'dist' / f'{nombre}.mjs').write_text(f'// Generado por scripts/planos/generar-plano.py\nexport const mapa = ' + json.dumps(layout, indent=2) + ';\n', encoding='utf8')
    print(f'Mapa {tipo} {piso}: {sum(l["columns"] * l["rows"] for l in levels)} teselas · {width}×{height}', flush=True)


if __name__ == '__main__':
    generar(*sys.argv[1:5])
