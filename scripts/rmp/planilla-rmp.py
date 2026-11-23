"""Planilla de pesos del RMP (hojas «Pesos», «Avance mensual» y «Reprogramación») armada desde el programa costeado
y las tablas por capítulo de los RMP. Se carga en ATLAS › Last Planner › Programa de obra › Curvas RMP.

Uso:  python -P scripts/rmp/planilla-rmp.py "Programa obra.xml" salida.xlsx RMP-1.pdf [RMP-2.pdf ...]
Requiere openpyxl y pypdf.

Criterio (decidido el 23-11-2026, docs/CURVAS_RMP.md):
- Peso de cada capítulo = costo de la línea base 1 del programa (la original, fin 23-11-26) ÷ costo total. El costo
  del programa es cantidad real × P.U. del itemizado HPC-5-GEN-GEN-PRE-01-RevE (Texto1 = ítem del formulario N°11).
- Plan acumulado de cada capítulo a fin de mes = costo de línea base 1 repartido en forma lineal entre el inicio y el
  fin de cada tarea. Reprogramación = lo mismo con la línea base 0 (reprogramación, fin 30-07-27), total de la obra.
- Real acumulado = la tabla «% AVANCES REALES» por capítulo de cada RMP (sus 4 columnas son los 4 últimos meses).
  Terminaciones se abre en sus subcapítulos (6.1 … 6.10), todos con el % del capítulo; ATLAS mide 6.1–6.4.
  Artefactos (7) y Obras complementarias (8) no vienen en esa tabla: se les da el % que cuadra el total con la
  portada del RMP (real acumulado del mes y de los 3 anteriores, del gráfico de últimos 4 meses), y la hoja «Notas»
  lo dice. Los preliminares de los Anexos 1 y 2 (terminados en 2023 según la línea base) van al 100 %.
- Solo porcentajes: la planilla no lleva montos en pesos.
"""
import sys, re, json, unicodedata, datetime as dt
import xml.etree.ElementTree as ET
from collections import defaultdict
import openpyxl
from pypdf import PdfReader

NS = '{http://schemas.microsoft.com/project}'
MESES_ES = {'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'ago': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dic': 12}
norm = lambda s: re.sub(r'\s+', ' ', unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()).strip()

# Capítulos de la planilla: código (itemizado), nombre, prefijos WBS del programa, nombre en la tabla del RMP, mide ATLAS.
# Nombre None: la tabla no lo trae y se calibra con la portada; TERMINADO: real = 100 %.
A1, A2, A3 = '1.2.1.2.1.', '1.2.1.3.1.', '1.2.1.3.2.'
TERMINADO = '(terminado)'
CAPITULOS = [
    # Preliminares de los Anexos 1 y 2: su línea base terminó en 2023 y la tabla del RMP no los trae; van terminados.
    ('1.1', 'Obras preliminares (Anexos 1 y 2)', [A1 + '1', A2 + '1'], TERMINADO, False),
    ('1.2', 'Obras preliminares (remanentes del Modificatorio N°1)', [A3 + '1.1'], 'obras preliminares (remanentes del modificatorio n1)', False),
    ('1.3', 'Excavaciones, movimientos de tierra y rellenos (remanentes del Modificatorio N°1)', [A3 + '1.2'], 'excavaciones, movimientos de tierra y rellenos (remanentes del modificatorio n1)', False),
    ('2', 'Obra gruesa', [A1 + '2', A2 + '2', A3 + '2'], 'obra gruesa', False),
    ('3', 'Envolvente', [A2 + '3', A3 + '3'], 'envolvente', False),
    ('4', 'Impermeabilizaciones y barreras de humedad', [A2 + '4', A3 + '4'], 'impermeabilizaciones y barreras de humedad', False),
    ('5', 'Divisiones interiores', [A3 + '5'], 'divisiones interiores', False),
    *[(f'6.{k}', n, [A3 + f'6.{k}'], 'terminaciones', k <= 4) for k, n in [
        (1, 'Pavimentos y pisos técnicos'), (2, 'Revestimientos interiores de paramentos verticales'), (3, 'Terminaciones de cielos'),
        (4, 'Pinturas'), (5, 'Puertas'), (6, 'Quincallería y complementos de puertas'), (7, 'Ferreterías y protecciones exteriores'),
        (8, 'Protecciones interiores'), (9, 'Cubrejuntas de dilatación'), (10, 'Complementos de terminaciones interiores')]],
    ('7', 'Artefactos sanitarios, accesorios y equipos', [A3 + '7'], None, False),
    ('8', 'Obras complementarias y equipos', [A3 + '8'], None, False),
    *[(f'9.{k}', n, [A3 + f'9.{k}'], norm(n), False) for k, n in [
        (1, 'Instalación eléctrica'), (2, 'Iluminación y ahorro de energía'), (3, 'Instalaciones térmicas, ventilación y climatización'),
        (4, 'Instalaciones de alcantarillado'), (5, 'Agua potable fría y caliente'), (6, 'Sistemas de seguridad'),
        (7, 'Circulaciones verticales mecánicas'), (8, 'Instalaciones de evacuación de agua lluvia'),
        (9, 'Instalaciones de cableado estructurado y CCDD'), (10, 'Sistema de control centralizado'), (11, 'Instalaciones de combustibles'),
        (12, 'Instalaciones de gases clínicos'), (13, 'Manejo de residuos hospitalarios'), (14, 'Mobiliario clínico y no clínico adosado'),
        (15, 'Obras exteriores, pavimentación, vialidad exterior e interior'), (16, 'Instalación de correo neumático'),
        (17, 'Insonorización'), (18, 'Proyectos especiales')]],
]
CALIBRADOS = {'7', '8'}


def tareas(xml):
    """Hojas del programa: WBS, línea base 0 y 1 (inicio, fin, costo en pesos)."""
    out = []
    for _, el in ET.iterparse(xml, events=('end',)):
        tag = el.tag.replace(NS, '')
        if tag == 'Task':
            if el.findtext(NS + 'Summary') == '0':
                bl = {b.findtext(NS + 'Number'): (b.findtext(NS + 'Start'), b.findtext(NS + 'Finish'), float(b.findtext(NS + 'Cost') or 0) / 100) for b in el.findall(NS + 'Baseline')}
                out.append({'wbs': el.findtext(NS + 'WBS') or '', 'bl': bl})
            el.clear()
        elif tag == 'Tasks':
            break
        elif tag in ('Calendar', 'View', 'Filter', 'Table', 'Group', 'ExtendedAttribute'):
            el.clear()
    return out


def fin_de_mes(mes):
    a, m = map(int, mes.split('-'))
    return dt.datetime(a + (m == 12), m % 12 + 1, 1)


def mes_mas(mes, n):
    a, m = map(int, mes.split('-')); t = a * 12 + m - 1 + n
    return f'{t // 12}-{t % 12 + 1:02d}'


def acumulado(partes, corte):
    """% del costo hecho al corte (lineal entre inicio y fin)."""
    tot = sum(c for _, _, c in partes); hecho = 0
    for s, f, c in partes:
        if corte <= s: continue
        hecho += c if corte >= f or f <= s else c * ((corte - s) / (f - s))
    return 100 * hecho / tot if tot else 0


def leer_rmp(pdf):
    """Mes del RMP, real acumulado de la portada y tabla por capítulo {nombre: {mes: (plan, real)}}."""
    r = PdfReader(pdf)
    portada = r.pages[0].extract_text()
    mm = re.search(r'MES DE\s*PROYECTO\s*\d+\s+([a-z]+)-(\d\d)', portada, re.I)
    mes = f'20{mm.group(2)}-{MESES_ES[mm.group(1).lower()]:02d}'
    pct = lambda s: float(s.replace('.', '').replace(',', '.')) if ',' in s else float(s)
    prog = re.search(r'PROGRESO Anterior Per[ií]odo Acumulado\s*Plan\s+([\d.,]+)%\s+([\d.,]+)%\s+([\d.,]+)%\s+([\d.,]+)%\s+([\d.,]+)%\s+([\d.,]+)%', portada)
    # Acumulados de la portada del mes y de los 3 anteriores: el del mes menos el avance de los meses siguientes
    # (gráfico «Plan vs real · últimos 4 meses»: 4 valores de plan y 4 de real).
    barras = portada[portada.find('CUMPLIMIENTO DE PROGRAMACION'):portada.find('PLAN VS REAL')]
    b = [pct(x[:-1]) for x in re.findall(r'[\d.,]+%', barras)][:8]
    if len(b) < 8: raise SystemExit(f'{pdf}: no encontré los 4 meses de plan y real de la portada')
    plan_m, real_m = pct(prog.group(3)), pct(prog.group(6)); total = {}
    for i in range(3, -1, -1):
        total[mes_mas(mes, i - 3)] = {'plan': round(plan_m, 2), 'real': round(real_m, 2)}
        plan_m -= b[i]; real_m -= b[4 + i]
    tabla = {}
    for pagina in r.pages:
        t = pagina.extract_text() or ''
        if 'PROG ACTUAL' not in t: continue
        for linea in t.splitlines():
            v = re.findall(r'-?[\d.,]+%', linea)
            if len(v) < 12: continue
            nombre = norm(linea[:linea.find(v[0])].replace('°', ''))
            nums = [pct(x[:-1]) for x in v[-12:]]
            tabla[nombre] = {mes_mas(mes, i - 3): (nums[i], nums[4 + i]) for i in range(4)}
    return mes, total, tabla


def main(xml, salida, pdfs):
    hojas = tareas(xml)
    total_bl1 = sum(t['bl']['1'][2] for t in hojas if '1' in t['bl'])
    P = lambda s: dt.datetime.fromisoformat(s)
    grupos = {}
    usadas = set()
    for cod, nombre, prefijos, *_ in CAPITULOS:
        ts = [t for t in hojas if '1' in t['bl'] and t['bl']['1'][0] and any(t['wbs'] == p or t['wbs'].startswith(p + '.') for p in prefijos)]
        usadas.update(id(t) for t in ts)
        grupos[cod] = [(P(t['bl']['1'][0]), P(t['bl']['1'][1]), t['bl']['1'][2]) for t in ts if t['bl']['1'][2]]
    resto = [t for t in hojas if '1' in t['bl'] and id(t) not in usadas and t['bl']['1'][2]]
    fuera = sum(t['bl']['1'][2] for t in resto)
    por_rama = defaultdict(float)
    for t in resto: por_rama['.'.join(t['wbs'].split('.')[:6])] += t['bl']['1'][2]
    print('Fuera de los capítulos:', {k: round(v / 1e6) for k, v in por_rama.items()})
    costo = {c: sum(x[2] for x in g) for c, g in grupos.items()}
    T = sum(costo.values())
    print(f'Línea base 1: {len(hojas)} hojas; capítulos cubren {100 * T / total_bl1:.2f} % del costo (fuera: {fuera / 1e6:,.0f} MM, hitos y notas de cambio)')
    inicio = min(s for g in grupos.values() for s, _, _ in g).strftime('%Y-%m'); fin = max(f for g in grupos.values() for _, f, _ in g).strftime('%Y-%m')
    # Reprogramación: línea base 0 de toda la obra.
    bl0 = [(P(t['bl']['0'][0]), P(t['bl']['0'][1]), t['bl']['0'][2]) for t in hojas if '0' in t['bl'] and t['bl']['0'][0] and t['bl']['0'][2]]
    fin0 = max(f for _, f, _ in bl0).strftime('%Y-%m')
    meses = []; m = inicio
    while m <= max(fin, fin0): meses.append(m); m = mes_mas(m, 1)
    plan = {c: {m: acumulado(g, fin_de_mes(m)) for m in meses if m <= fin} for c, g in grupos.items()}
    plan_total = {m: sum(costo[c] * plan[c].get(m, 100) for c in grupos) / T for m in meses}
    reprog = {m: acumulado(bl0, fin_de_mes(m)) for m in meses}
    # Real por capítulo de los RMP (el más reciente manda en los meses repetidos).
    real = defaultdict(dict); totales = {}; notas = []
    leidos = sorted((leer_rmp(pdf) + (pdf,) for pdf in pdfs), key=lambda x: x[0])
    for mes, total, tabla, pdf in leidos:  # el RMP más reciente manda en los meses repetidos
        totales.update(total)
        for cod, nombre, _, clave, _ in CAPITULOS:
            if clave is None or clave == TERMINADO: continue
            fila = tabla.get(clave)
            if not fila: raise SystemExit(f'{pdf}: no encontré «{clave}» en la tabla por capítulo')
            for mm, (_, re_) in fila.items(): real[cod][mm] = re_
        print(f'RMP {mes}: plan {total[mes]["plan"]} %, real {total[mes]["real"]} %')
    for cod, _, _, clave, _ in CAPITULOS:
        if clave == TERMINADO:
            for mm in totales: real[cod][mm] = 100
    # 7 y 8: el % que cuadra el real total de la portada de cada mes.
    cal = sorted(CALIBRADOS)
    for mes, total in sorted(totales.items()):
        if any(mes not in real[c] for c in grupos if c not in CALIBRADOS): continue
        conocido = sum(costo[c] * real[c][mes] for c in grupos if c not in CALIBRADOS)
        x = (total['real'] * T - conocido) / sum(costo[c] for c in cal)
        if not 0 <= x <= 100: raise SystemExit(f'{mes}: el % que cuadra 7 y 8 sale {x:.1f} %, fuera de 0–100; revisar el cruce')
        for c in cal: real[c][mes] = round(x, 2)
        notas.append(f'{mes}: Artefactos (7) y Obras complementarias (8) al {x:.2f} % para cuadrar el real de la portada ({total["real"]} %).')
    con_portada = sorted(m for m in totales if all(m in real[c] for c in cal))
    # Salida.
    wb = openpyxl.Workbook(); hp = wb.active; hp.title = 'Pesos'
    hp.append(['Partida EETT', 'Nombre', 'Peso %', 'Mide ATLAS (Sí/No)'])
    for cod, nombre, _, _, mide in CAPITULOS: hp.append([cod, nombre, round(100 * costo[cod] / T, 4), 'Sí' if mide else 'No'])
    hm = wb.create_sheet('Avance mensual'); hm.append(['Mes (aaaa-mm)', 'Partida EETT', 'Plan acumulado %', 'Real acumulado %'])
    for m in meses:
        if m > fin and not any(m in real[c] for c in grupos): continue
        for cod, *_ in CAPITULOS:
            hm.append([m, cod, round(plan[cod].get(m, 100), 2), real[cod].get(m)])
    hr = wb.create_sheet('Reprogramación'); hr.append(['Mes (aaaa-mm)', 'Acumulado %'])
    for m in meses: hr.append([m, round(reprog[m], 2)])
    hn = wb.create_sheet('Notas')
    for linea in [
        'Planilla generada por scripts/rmp/planilla-rmp.py el ' + dt.date.today().isoformat() + '.',
        'Pesos y plan: línea base 1 del programa (' + xml.replace('\\', '/').split('/')[-1] + '), costo = cantidad real × P.U. del itemizado RevE.',
        'Reprogramación: línea base 0 del mismo programa (fin ' + fin0 + ').',
        'Real: tabla por capítulo de los RMP ' + ', '.join(con_portada) + '. Terminaciones (6.1–6.10) lleva el % del capítulo.',
        *notas,
        'Comparación del plan con la portada del RMP: ' + '; '.join(f'{m} ATLAS {plan_total[m]:.2f} % / RMP {t["plan"]} %' for m, t in sorted(totales.items())),
        'Sin montos en pesos: solo porcentajes.']:
        hn.append([linea])
    wb.save(salida)
    for l in hn.iter_rows(values_only=True): print(l[0])


if __name__ == '__main__':
    if len(sys.argv) < 4: raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
