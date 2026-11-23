"""Alinea las láminas CIE (PDF) de un piso con el plano de ATLAS, sin medir a mano.

1. Traslado por códigos: los códigos de recinto que trae la lámina como texto se comparan con la posición de esos
   recintos en ATLAS (mediana robusta). Las láminas van a escala 1 y sin giro, como en el −1.
2. Afinado por muros: correlación de fase entre la lámina y el plano de arquitectura de ATLAS (export del piso a escala
   0,5), buscando cerca del traslado anterior.

Uso:
  node scripts/cielos/posiciones-recintos.mjs n02 > %TEMP%/pos-n02.json
  python scripts/cielos/alinear_cie.py N02 <carpeta con cie-501.pdf…> %TEMP%/pos-n02.json
Escribe scripts/cielos/alineacion-n02.json (desplazamientos y huella de cada PDF), que usa generar-mapa-cie.py.
Validado con el −1: queda a 1–3 unidades en y de la alineación manual de alineacion-s01.json (en x, 10 unidades
constantes: el export del −1 está corrido respecto de su fondo, por eso el −1 conserva su alineación manual).
"""
import hashlib, json, math, re, statistics, sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
REPO = Path(__file__).resolve().parents[2]
CODIGO = re.compile(r'\d+(\.\d+){3,}-\d+|[A-Z]{2,3}(\.[A-Z0-9]+)+-\d+')
ESC = .5


def palabras(pagina):
    """Códigos de recinto de la página, en coordenadas visibles (con el giro de la página aplicado)."""
    m = pagina.rotation_matrix
    for x0, y0, x1, y1, t, *_ in pagina.get_text('words'):
        if CODIGO.fullmatch(t):
            p = pymupdf.Point((x0 + x1) / 2, (y0 + y1) / 2) * m
            yield t, (p.x, p.y)


def pares_de(pagina, unicos):
    vistos = {}
    for t, p in palabras(pagina): vistos.setdefault(t, []).append(p)
    return [(v[0], unicos[k]) for k, v in vistos.items() if len(v) == 1 and k in unicos]


def traslado(pares, tol=35):
    dx = statistics.median(b[0] - a[0] for a, b in pares); dy = statistics.median(b[1] - a[1] for a, b in pares)
    dentro = pares
    for _ in range(3):
        cerca = [(a, b) for a, b in pares if math.hypot(b[0] - a[0] - dx, b[1] - a[1] - dy) < tol]
        if len(cerca) < 4: break
        dentro = cerca
        dx = statistics.median(b[0] - a[0] for a, b in dentro); dy = statistics.median(b[1] - a[1] for a, b in dentro)
    return dx, dy, len(dentro)


def tinta(img):
    return (np.asarray(img.convert('L'), dtype=np.float32) < 191).astype(np.float32)


def correlacion(a, b, radio=60):
    r = np.fft.rfft2(a) * np.conj(np.fft.rfft2(b)); r /= np.abs(r) + 1e-9
    c = np.fft.irfft2(r, s=a.shape)
    c = np.roll(np.roll(c, radio, 0), radio, 1)[:2 * radio + 1, :2 * radio + 1]
    y, x = np.unravel_index(np.argmax(c), c.shape)
    nitidez = c[y, x] / (np.sort(c.ravel())[-20:-1].mean() + 1e-9)
    return x - radio, y - radio, float(nitidez)


def alinear(piso, carpeta, posiciones):
    pos = json.loads(Path(posiciones).read_text(encoding='utf8'))['pos']
    unicos = {k: v[0] for k, v in pos.items() if len(v) == 1}
    mapa = json.loads((REPO / 'dist' / piso.lower() / 'map' / 'index.json').read_text())
    ox, oy = mapa['origin']; arq = tinta(Image.open(REPO / 'dist' / mapa['export']))
    hojas = {}
    for pdf in sorted(Path(carpeta).glob('cie-5*.pdf')):
        with pymupdf.open(pdf) as d:
            pagina = d[0]; pares = pares_de(pagina, unicos)
            if len(pares) < 3: print(pdf.stem, 'sin códigos suficientes', len(pares)); continue
            dx, dy, n = traslado(pares)
            pix = pagina.get_pixmap(matrix=pymupdf.Matrix(ESC, ESC), alpha=False, annots=False)
            cie = tinta(Image.frombytes('RGB', (pix.width, pix.height), pix.samples)); h, w = cie.shape
            x0, y0 = round((dx - ox) * ESC), round((dy - oy) * ESC); a = np.zeros_like(cie)
            sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(arq.shape[1], x0 + w), min(arq.shape[0], y0 + h)
            if sx1 > sx0 and sy1 > sy0: a[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = arq[sy0:sy1, sx0:sx1]
            cx, cy, nitidez = correlacion(a, cie)
            hojas[pdf.stem] = {'archivo': pdf.name, 'sha256': hashlib.sha256(pdf.read_bytes()).hexdigest(),
                               'desplazamiento': [round(dx + cx / ESC, 3), round(dy + cy / ESC, 3)],
                               'codigos': len(pares), 'codigosAjustan': n, 'correccionMuros': [cx / ESC, cy / ESC], 'nitidez': round(nitidez, 2)}
            print(pdf.stem, 'códigos', len(pares), 'desplazamiento', hojas[pdf.stem]['desplazamiento'], 'nitidez', round(nitidez, 2))
    salida = Path(__file__).with_name(f'alineacion-{piso.lower()}.json')
    salida.write_text(json.dumps({'piso': piso, 'metodo': 'códigos de recinto + correlación con el plano de arquitectura (alinear_cie.py)', 'hojas': hojas}, indent=1, ensure_ascii=False), encoding='utf8')
    print('Escrito', salida)


if __name__ == '__main__':
    alinear(*sys.argv[1:4])
