"""Compone las láminas CIE, sin sus carátulas, en las coordenadas del visor S01."""
import hashlib
import json
import math
from pathlib import Path

import pymupdf
from PIL import Image


ROOT = Path(__file__).resolve().parents[2] / "dist"
FOLDER = "cie-s01-map"
SIZE = 512
SCALES = (0.55, 1.35)


def read_json(path):
    return json.loads(path.read_text(encoding="utf8"))


def render_crop(document, displacement, world_box, origin, scale, repository):
    source = repository / "source" / document["filename"]
    if hashlib.sha256(source.read_bytes()).hexdigest() != document["sha256"]:
        raise ValueError(f"La lámina {document['id']} cambió y necesita cotejo de alineación")

    ox, oy = displacement
    x0, y0, x1, y1 = world_box
    ix, iy = origin
    left, top = round((x0 - ix) * scale), round((y0 - iy) * scale)
    right, bottom = round((x1 - ix) * scale), round((y1 - iy) * scale)
    # Los cortes adyacentes comparten el mismo píxel del mosaico. El margen da
    # al interpolador píxeles de ambos lados del corte sin incluir la cartela.
    shift_x, shift_y = (ix - ox) * scale, (iy - oy) * scale
    sx, sy = left + shift_x, top + shift_y
    pad = 3
    clip = pymupdf.Rect((sx - pad) / scale, (sy - pad) / scale,
                        (right + shift_x + pad) / scale, (bottom + shift_y + pad) / scale)
    with pymupdf.open(source) as pdf:
        page = pdf[document["page"] - 1]
        if not page.rect.contains(clip):
            raise ValueError(f"Recorte fuera de la lámina {document['id']}: {clip}")
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip,
                              alpha=False, annots=False)
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    crop = image.transform((right - left, bottom - top), Image.Transform.AFFINE,
                           (1, 0, sx - pix.x, 0, 1, sy - pix.y), Image.Resampling.BICUBIC)
    return crop, (left, top)


def generate(repository=ROOT):
    registration = read_json(Path(__file__).with_name("alineacion-s01.json"))
    documents = {doc["id"]: doc for doc in read_json(repository / "disciplines.json")["documents"]
                 if doc["specialty"] == "ceilings"}
    x, y, width, height = read_json(repository / "atlas.json")["scope"]["view"]
    xs = (x, registration["columna"], x + width)
    ys = (y, *registration["filas"], y + height)
    scale = max(SCALES)
    full = Image.new("RGB", (round(width * scale), round(height * scale)), "white")
    for column in range(2):
        for row in range(4):
            sheet = f"cie-{501 + row + 4 * column}"
            box = (xs[column], ys[row], xs[column + 1], ys[row + 1])
            crop, target = render_crop(documents[sheet], registration["desplazamientos"][sheet],
                                       box, (x, y), scale, repository)
            full.paste(crop, target)

    out = repository / FOLDER
    out.mkdir(exist_ok=True)

    def sized(factor):
        return full.resize((round(width * factor), round(height * factor)), Image.Resampling.LANCZOS)

    for name, factor in (("overview", 0.26), ("overview-mobile", 0.17), ("export", 0.5)):
        image = sized(factor)
        image.save(out / f"{name}.webp", quality=90, method=4)

    levels = []
    for z, factor in enumerate(SCALES):
        image = full if factor == scale else sized(factor)
        folder = out / str(z)
        folder.mkdir(exist_ok=True)
        columns, rows = math.ceil(image.width / SIZE), math.ceil(image.height / SIZE)
        for row in range(rows):
            for column in range(columns):
                left, top = column * SIZE, row * SIZE
                tile = image.crop((left, top, min(left + SIZE, image.width), min(top + SIZE, image.height)))
                tile.save(folder / f"{column}_{row}.webp", quality=89, method=4)
        levels.append(dict(z=z, scale=factor, columns=columns, rows=rows))

    layout = dict(origin=[x, y], width=width, height=height, tileSize=SIZE, tilePath=f"{FOLDER}/",
                  overview=f"{FOLDER}/overview.webp", export=f"{FOLDER}/export.webp", levels=levels)
    (repository / "cie-s01-map.mjs").write_text(
        "// Generado por scripts/cielos/generar-mapa-s01.py\n"
        "export const ceilingS01Map = " + json.dumps(layout, indent=2) + ";\n", encoding="utf8")
    print(f"Mapa CIE S01: {sum(level['columns'] * level['rows'] for level in levels)} teselas", flush=True)


if __name__ == "__main__":
    generate()
