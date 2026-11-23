"""Recintos con retorno vinílico de cada piso, sacados de la lámina de retornos ya alineada (generar-plano.py).

La lámina N0x_ARQ_PLA_Retornos_Vinilicos pinta en magenta los recintos con retorno. Con la lámina en coordenadas del
plano (dist/n0x/retornos-map, export a escala 0,5; se genera con `generar-plano.py retornos <piso> …` y se borra
después: ATLAS ya no la muestra) se mira qué parte del interior de cada contorno de ATLAS
(dist/n0x/contornos.json) queda magenta. Escribe dist/n0x/retornos.json con los id de esos recintos, que la
simbología de Pavimentos marca con contorno magenta.

Uso: python scripts/planos/retornos-recintos.py [N01 N02 …]   (sin argumentos: todos los pisos con lámina)
"""
import json, re, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
UMBRAL = .25   # fracción del interior en magenta para contar el recinto


def magenta(rgb):
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    return (r - g > 70) & (b - g > 50) & (r > 150)


def piso(id_):
    carpeta = REPO / 'dist' / id_.lower()
    texto = (carpeta.parent / f'{id_.lower()}/retornos-map.mjs').read_text(encoding='utf8')
    mapa = json.loads(re.search(r'=\s*(\{.*\});', texto, re.S).group(1))
    ox, oy = mapa['origin']
    img = Image.open(REPO / 'dist' / mapa['export']).convert('RGB')
    f = img.width / mapa['width']
    marca = magenta(np.asarray(img))
    # Contornos como los dibuja ATLAS: los de las láminas (geometry/) y, encima, los corregidos a mano (contornos.json).
    formas = {}
    cat = json.loads((carpeta / 'runtime.json').read_text(encoding='utf8'))['catalog']
    ip, ih = cat['fields'].index('polygon'), cat['fields'].index('holes')
    for fila in cat['rows']:
        if fila[ip]: formas[fila[0]] = [{'polygon': fila[ip], 'holes': [h for h in (fila[ih] or []) if isinstance(h, list) and h and isinstance(h[0], list)]}]
    for g in sorted((carpeta / 'geometry').glob('*.json')):
        for r in json.loads(g.read_text(encoding='utf8'))['rooms']:
            if r.get('polygon'): formas[r['id']] = [{'polygon': r['polygon'], 'holes': r.get('holes') or []}]
    for r in json.loads((carpeta / 'contornos.json').read_text(encoding='utf8'))['recintos']:
        if r.get('parts'): formas[r['id']] = r['parts']
    contornos = [{'id': k, 'parts': v} for k, v in formas.items()]
    con, fracciones = [], {}
    for r in contornos:
        lienzo = Image.new('L', img.size, 0); d = ImageDraw.Draw(lienzo)
        for parte in r.get('parts') or []:
            d.polygon([((x - ox) * f, (y - oy) * f) for x, y in parte['polygon']], fill=1)
            for hueco in parte.get('holes') or []:
                d.polygon([((x - ox) * f, (y - oy) * f) for x, y in hueco], fill=0)
        m = np.asarray(lienzo, dtype=bool)
        n = int(m.sum())
        if n < 20: continue
        fr = float(marca[m].mean()); fracciones[r['id']] = round(fr, 3)
        if fr >= UMBRAL: con.append(r['id'])
    con.sort()
    salida = {'schema': 1, 'nivel': id_, 'fuente': 'Lámina de retornos vinílicos alineada (scripts/planos/alineacion-retornos-' + id_.lower() + '.json)',
              'metodo': f'Interior del contorno con al menos {UMBRAL:.0%} en magenta (scripts/planos/retornos-recintos.py)', 'recintos': con}
    (carpeta / 'retornos.json').write_text(json.dumps(salida, ensure_ascii=False, indent=1) + '\n', encoding='utf8')
    dudosos = sorted((v, k) for k, v in fracciones.items() if .08 <= v < .45)
    print(f'{id_}: {len(con)} de {len(fracciones)} recintos con retorno · dudosos (8–45 %): {len(dudosos)}')
    for v, k in dudosos: print(f'   {v:.2f} {k}')
    return fracciones


if __name__ == '__main__':
    for p in sys.argv[1:] or ['N01', 'N02', 'N03', 'N04']: piso(p)
