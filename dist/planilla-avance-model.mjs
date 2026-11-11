// Planillas de avance de la oficina técnica («HPC-Medicion Avance <piso>.xlsx»): una hoja por partida, una fila por
// recinto (o varias), con el % de cada etapa (estructura, tapado, huincha…) y casi siempre un total ponderado.
// Las hojas no comparten columnas entre pisos: el lector busca por nombre la columna del código de recinto, las de %
// por etapa, la cantidad y el total. Solo guarda código, cantidad, % total y % por etapa; la planilla no se guarda.
// Las hojas sin código de recinto (tabiquería por tabique, luminarias…) quedan fuera, con su motivo.

export const SCHEMA = 1;
// Familias de partidas de la planilla. «hoja»: nombre de hoja (sin tildes, en mayúsculas). «nombre»: lo que se muestra.
// El orden importa: «PINTURA EN CIELO DURO» es pintura de cielo, no cielo duro.
export const FAMILIAS = [
  ['pinturaCenefa', /PINTURA.*CENEFA/, 'Pintura de cenefa'],
  ['pinturaCielo', /PINTURA.*CIELO/, 'Pintura de cielos'],
  ['pinturaMuro', /PINTURA.*(TABIQUE|MURO)/, 'Pintura de muros'],
  ['pintura', /^PINTURA$/, 'Pintura'],
  ['cenefa', /CENEFA/, 'Cenefas'],
  ['cieloDuro', /CIELO DURO/, 'Cielo duro'],
  ['cieloModular', /CIELO MODULAR/, 'Cielo modular'],
  ['retorno', /RETORNO/, 'Retorno de pavimento'],
  ['guardapolvo', /GUARDA ?POLVO/, 'Guardapolvo'],
  ['baldosa', /BALDOSA/, 'Baldosa'],
  ['vinilico', /VINILIC/, 'Pavimento vinílico'],
  ['resina', /RESINA/, 'Resina'],
  ['epoxico', /EPOXIC/, 'Pavimento epóxico'],
  ['pavimento', /^PAVIMENTO/, 'Pavimento'],
  ['sobrelosa', /SOBRELOSA/, 'Sobrelosa'],
  ['imperMuros', /IMPER.*MURO/, 'Impermeabilización de muros'],
  ['imper', /^IMPER/, 'Impermeabilización'],
  ['porcelanato', /PORCELANATO/, 'Porcelanato de muros'],
  ['hpl', /^HPL/, 'HPL'],
  ['puertas', /^PUERTAS/, 'Puertas'],
  ['cortafuego', /CORTAFUEGO|COMPARTIMENTACION/, 'Sellos cortafuego'],
  ['prefabricados', /PREFABRICADO/, 'Baños prefabricados']
].map(([id, hoja, nombre]) => ({id, hoja, nombre}));
export const NOMBRE_FAMILIA = Object.fromEntries([...FAMILIAS.map(f => [f.id, f.nombre])]);
// La hoja «PINTURA» de N02 y N03 trae muros y cielos juntos: se separa en dos familias.
const PARTES_PINTURA = [['pinturaMuro', 'MUROS'], ['pinturaCielo', 'CIELOS']];
// Pesos de etapa cuando la hoja no trae total ni pesos (los usados en las otras planillas de la obra).
const PESOS_FAMILIA = {cieloDuro: [0.63, 0.3, 0.07], cieloModular: [0.37, 0.63], cenefa: [0.49, 0.45, 0.06], hpl: [0.4, 0.6]};

export const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
export const familiaDeHoja = nombre => { const n = norm(nombre); return FAMILIAS.find(f => f.hoja.test(n))?.id || null; };
const num = v => typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'string' && /^\s*-?\d+([.,]\d+)?\s*%?\s*$/.test(v) ? parseFloat(v.replace(',', '.')) / (v.includes('%') ? 100 : 1) : null;
const fraccion = v => { const n = num(v); if (n == null) return 0; const f = n > 1.05 && n <= 105 ? n / 100 : n; return Math.min(1, Math.max(0, f)); };
const r3 = v => Math.round(v * 1000) / 1000;
// Código de recinto: «3.2.1.1.1-1», «RT.2-1», «CT.F.(-1)-8» (el −1 lleva su piso entre paréntesis).
const ES_CODIGO = /^[A-Z0-9][A-Z0-9.,() ]*(\(-\d\)[A-Z0-9.,() ]*)?-\s*\d+$/i;

// Código de la planilla → código de Atlas. Corrige comas, espacios y puntos sobrantes («CU,5,1,3-3», «DI 1-3»,
// «CT.P.1.-7»). Si se entrega la lista de códigos del piso, devuelve solo uno que exista en ella.
export function normalizarCodigo(valor, conocidos = null) {
  const crudo = String(valor ?? '').trim().toUpperCase();
  if (!crudo || crudo.length > 30 || !ES_CODIGO.test(crudo)) return null;
  const base = crudo.replace(/,/g, '.').replace(/\s*-\s*/g, '-').replace(/\.-(?=\d+$)/, '-');
  const candidatos = [base, base.replace(/\s+/g, ''), base.replace(/\s+/g, '.'), base.replace(/^([A-Z]{2})(\d)/, '$1.$2').replace(/\s+/g, '')];
  if (!conocidos) return candidatos[1];
  return candidatos.find(c => conocidos.has(c)) || null;
}

// ---------- Lectura de una hoja ----------
const COD_RECINTO = /COD\w*\.? *(DE )?RECINTO/;
const TOTAL_PCT = /PORCENTAJE DE AVAN|^AVANCE \(%\)$/;
const TOTAL_M2 = /TOTAL EJECUTADO \(M|AVANCE TOTAL M2|^TOTAL PONDERADO$|^PONDERADO$|^AVANCE \(M2\)$|^AVANCE TOTAL$/;
const ETAPA_NOMBRE = /^(PASTA|LATEX|1RA MANO|2DA MANO|1RA MANO ESMALTE|2DA MANO ESMALTE|AVANCE (MUROS|FRAGUE|ESQUINERO|PERFIL))$/;
const CANTIDAD = [/^AREA TOTAL$/, /AREA PAVIMENTO/, /AREA \+ RETORNO/, /^TOTAL \(M2?\)$/, /^TOTAL MUROS/, /^AREA \(M2\)$/, /^AREA$/, /^M2$/, /LONGITUD TOTAL/, /LARGO TOTAL/, /^TOTAL$/, /^SUPERFICIE$/, /^AREA MURO$/, /^LARGO$/, /^LONGITUD$/, /^CANT\.?$/];
const NO_ETIQUETA = /^(AVANCE PARCIAL|AVANCE|UNI|UND\.?|PONDERADO|TOTAL PONDERADO|CONSENSUADO ITO|\d+([.,]\d+)?)$/;

function cabecera(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const cols = (aoa[i] || []).map((v, j) => COD_RECINTO.test(norm(v)) ? j : -1).filter(j => j >= 0);
    if (!cols.length) continue;
    // Si hay más de una columna de código, la que trae más códigos.
    const cuenta = j => aoa.slice(i + 1, i + 300).filter(r => normalizarCodigo(r?.[j])).length;
    let col = cols.sort((a, b) => cuenta(b) - cuenta(a))[0];
    // Columna de código vacía: algunas hojas traen el código en otra columna (PMA, código asignado).
    if (!cuenta(col)) { const otras = (aoa[i] || []).map((_, j) => j).filter(j => cuenta(j) > 5).sort((a, b) => cuenta(b) - cuenta(a)); if (otras.length) col = otras[0]; }
    return {fila: i, col};
  }
  // Sin encabezado: la columna con más códigos de recinto en las primeras filas.
  let mejor = null;
  for (let j = 0; j < 12; j++) {
    const filas = aoa.slice(0, 300).map((r, i) => normalizarCodigo(r?.[j]) ? i : -1).filter(i => i >= 0);
    if (filas.length > 5 && (!mejor || filas.length > mejor.n)) mejor = {col: j, n: filas.length, fila: Math.max(0, filas[0] - 1)};
  }
  return mejor ? {fila: mejor.fila, col: mejor.col} : null;
}
// Nombre de una etapa: el rótulo de las filas de arriba, en la columna de la etapa o un poco a su izquierda.
function nombreEtapa(aoa, fila, col, i, encabezado) {
  const escrito = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  if (ETAPA_NOMBRE.test(encabezado)) return escrito(aoa[fila]?.[col]).replace(/^AVANCE /i, '');
  for (let d = 0; d <= 3; d++) for (let f = fila - 1; f >= Math.max(0, fila - 3); f--) {
    const t = norm(aoa[f]?.[col - d]);
    if (t && !NO_ETIQUETA.test(t) && num(aoa[f]?.[col - d]) == null) return escrito(aoa[f][col - d]).replace(/\s+\d+\s*%$/, '');
  }
  const resto = encabezado.replace(/AVANCE|PARCIAL|\(%\)|%/g, '').trim();
  return resto || 'ETAPA ' + (i + 1);
}
const etiqueta = t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
// Pesos de etapa escritos sobre el encabezado: la primera serie de k números entre 0 y 1 que suma 1.
function pesosEscritos(aoa, fila, desde, k) {
  for (let f = fila - 1; f >= Math.max(0, fila - 3); f--) {
    const ns = (aoa[f] || []).map((v, j) => j >= desde ? num(v) : null).filter(v => v != null && v > 0 && v <= 1);
    for (let s = 0; s + k <= ns.length; s++) { const p = ns.slice(s, s + k), t = p.reduce((a, b) => a + b, 0); if (k > 1 && Math.abs(t - 1) < 0.02) return p; }
  }
  return null;
}

// Bloques de una hoja: normalmente uno; la hoja «PINTURA» combinada trae muros y cielos.
function bloques(aoa, h, familia) {
  const enc = (aoa[h.fila] || []).map(norm), ancho = enc.length;
  const primera = (re, desde = 0, hasta = ancho) => { for (let j = desde; j < hasta; j++) if (re.test(enc[j] || '')) return j; return -1; };
  const etapasPct = [];
  for (let j = 0; j < ancho; j++) {
    const t = enc[j] || '';
    if (j !== h.col && t.includes('%') && t !== '%' && !TOTAL_PCT.test(t)) etapasPct.push(j);
  }
  // Sin columnas de %: etapas por nombre (pintura, porcelanato), solo la primera aparición de cada nombre por bloque.
  const porNombre = [];
  if (!etapasPct.length) for (let j = 0; j < ancho; j++) { const t = enc[j] || ''; if (ETAPA_NOMBRE.test(t)) porNombre.push(j); }
  const grupos = [];
  if (etapasPct.length) grupos.push(etapasPct);
  else if (porNombre.length) {
    let actual = [];
    for (const j of porNombre) { if (actual.length && (j - actual[actual.length - 1] > 2 || actual.some(x => enc[x] === enc[j]))) { grupos.push(actual); actual = []; } actual.push(j); }
    if (actual.length) grupos.push(actual);
  }
  if (!grupos.length) return [];
  if (familia === 'pintura') {
    return PARTES_PINTURA.map(([fam, parte], i) => {
      const cols = grupos[i]; if (!cols) return null;
      const cant = primera(new RegExp('^TOTAL ' + parte)), total = primera(new RegExp('^PONDERADO ' + parte));
      return {familia: fam, cols, cant, totalM2: total, totalPct: -1};
    }).filter(Boolean);
  }
  const cols = grupos[0], ultima = cols[cols.length - 1];
  // Cantidad: la primera columna de la lista, a la izquierda de las etapas, que traiga algún número mayor que cero.
  const conDatos = j => aoa.slice(h.fila + 1, h.fila + 400).some(r => num(r?.[j]) > 0);
  let cant = -1; for (const re of CANTIDAD) { for (let j = cols[0] - 1; j >= 0; j--) if (j !== h.col && re.test(enc[j] || '') && conDatos(j)) { cant = j; break; } if (cant >= 0) break; }
  return [{familia, cols, cant, totalPct: primera(TOTAL_PCT, ultima + 1), totalM2: primera(TOTAL_M2, ultima + 1)}];
}

// Lee una hoja ya convertida a filas (aoa). Devuelve sus bloques con filas por código (sin agrupar todavía).
export function leerHoja(nombre, aoa) {
  const familia = familiaDeHoja(nombre);
  if (!familia) return {hoja: nombre, motivo: 'No es una partida por recinto'};
  const h = cabecera(aoa);
  if (!h) return {hoja: nombre, familia, motivo: 'Sin columna de código de recinto'};
  const bs = bloques(aoa, h, familia);
  if (!bs.length) return {hoja: nombre, familia, motivo: 'Sin columnas de avance por etapa'};
  const salida = [];
  let conCodigo = 0, sinCodigo = 0;
  for (const b of bs) {
    const enc = (aoa[h.fila] || []).map(norm);
    const etapas = b.cols.map((c, i) => etiqueta(nombreEtapa(aoa, h.fila, c, i, enc[c] || '')));
    const pesos = pesosEscritos(aoa, h.fila, b.cols[0] - 2, b.cols.length) || (PESOS_FAMILIA[b.familia]?.length === b.cols.length ? PESOS_FAMILIA[b.familia] : null);
    const conTotal = b.totalPct >= 0 || b.totalM2 >= 0;
    const filas = [];
    for (let i = h.fila + 1; i < aoa.length; i++) {
      const r = aoa[i] || [];
      const et = b.cols.map(c => fraccion(r[c]));
      const tieneDatos = b.cols.some(c => num(r[c]) != null) || (b.cant >= 0 && num(r[b.cant]) != null);
      if (!tieneDatos) continue;
      const codigo = String(r[h.col] ?? '').trim();
      if (!codigo || !ES_CODIGO.test(codigo) || codigo.length > 30) { sinCodigo++; continue; }
      const cant = b.cant >= 0 ? Math.max(0, num(r[b.cant]) || 0) : 0;
      let pct;
      if (b.totalPct >= 0 && num(r[b.totalPct]) != null) pct = fraccion(r[b.totalPct]);
      else if (b.totalM2 >= 0 && cant > 0 && num(r[b.totalM2]) != null) pct = Math.min(1, Math.max(0, num(r[b.totalM2]) / cant));
      else if (pesos && !conTotal) pct = et.reduce((a, v, k) => a + v * pesos[k], 0);
      else pct = et.reduce((a, v) => a + v, 0) / et.length;
      conCodigo++;
      filas.push({codigo, cant, pct, et, fila: i});
    }
    salida.push({familia: b.familia, etapas, pesos, filas, cols: b.cols});
  }
  return {hoja: nombre, familia, bloques: salida, conCodigo, sinCodigo, ...(conCodigo ? {} : {motivo: sinCodigo ? 'La columna de código de recinto está vacía' : 'Sin filas con avance'})};
}

// ---------- Libro completo ----------
const PISOS = {'N-1': /^(S01|S-1|N-1|-1|NIVEL -1)$/, N01: /^(N01|N1|1|NIVEL 1)$/, N02: /^(N02|N2|2|NIVEL 2)$/, N03: /^(N03|N3|3|NIVEL 3)$/};
// Piso de la planilla: lo que más se repite en la columna NIVEL; si no, el nombre del archivo.
export function pisoDeLibro(hojas, archivo = '') {
  const votos = {};
  for (const {aoa} of hojas) {
    const h = cabecera(aoa); if (!h) continue;
    const col = (aoa[h.fila] || []).findIndex(v => norm(v) === 'NIVEL'); if (col < 0) continue;
    for (const r of aoa.slice(h.fila + 1, h.fila + 400)) { const v = norm(r?.[col]); const p = Object.keys(PISOS).find(k => PISOS[k].test(v)); if (p) votos[p] = (votos[p] || 0) + 1; }
  }
  const mejor = Object.entries(votos).sort((a, b) => b[1] - a[1])[0];
  if (mejor) return mejor[0];
  const m = norm(archivo).match(/\b(S01|N0[1-3])\b/);
  return m ? (m[1] === 'S01' ? 'N-1' : m[1]) : null;
}

// Libro → datos de avance del piso. hojas: [{nombre, aoa}]. conocidos: códigos de recinto del piso en Atlas.
export function leerPlanilla(hojas, {conocidos, archivo = '', nivel = null} = {}) {
  const piso = nivel || pisoDeLibro(hojas, archivo);
  const resumen = [], recintos = {}, fuera = new Map();
  for (const {nombre, aoa} of hojas) {
    const r = leerHoja(nombre, aoa);
    if (!r.bloques) { resumen.push({hoja: nombre, familia: r.familia || null, motivo: r.motivo}); continue; }
    for (const b of r.bloques) {
      const grupo = new Map();
      for (const f of b.filas) {
        const code = normalizarCodigo(f.codigo, conocidos);
        if (!code) { fuera.set(f.codigo, (fuera.get(f.codigo) || new Set()).add(b.familia)); continue; }
        const g = grupo.get(code) || {cant: 0, pond: 0, pesoEt: b.etapas.map(() => 0), n: 0, suma: 0, sumaEt: b.etapas.map(() => 0)};
        g.n++; g.suma += f.pct; f.et.forEach((v, k) => { g.sumaEt[k] += v; g.pesoEt[k] += v * f.cant; });
        g.cant += f.cant; g.pond += f.pct * f.cant; grupo.set(code, g);
      }
      // Varias filas de un recinto (tipos de cielo, cenefas por tramo): se suman ponderadas por su cantidad.
      for (const [code, g] of grupo) {
        const pct = g.cant > 0 ? g.pond / g.cant : g.suma / g.n, et = g.cant > 0 ? g.pesoEt.map(v => v / g.cant) : g.sumaEt.map(v => v / g.n);
        // Si la familia ya vino de otra hoja (no debería), queda la de más cantidad.
        const previo = recintos[code]?.[b.familia];
        if (previo && previo[1] >= g.cant) continue;
        (recintos[code] ||= {})[b.familia] = [r3(pct), r3(g.cant), et.map(r3)];
      }
      resumen.push({hoja: nombre, familia: b.familia, etapas: b.etapas, pesos: b.pesos, filas: b.filas.length, recintos: grupo.size, sinCodigo: r.sinCodigo || 0});
    }
    if (!r.conCodigo) resumen[resumen.length - 1].motivo = r.motivo;
  }
  return {schema: SCHEMA, nivel: piso, archivo: String(archivo).slice(0, 160), hojas: resumen,
    recintos, fuera: [...fuera].map(([codigo, fams]) => ({codigo, familias: [...fams]})).sort((a, b) => a.codigo.localeCompare(b.codigo))};
}

// Validación de lo que se guarda en la nube (también la usa el servidor de pruebas).
export function validarPlanilla(p) {
  if (!p || p.schema !== SCHEMA || !['N-1', 'N01', 'N02', 'N03'].includes(p.nivel) || typeof p.recintos !== 'object' || Array.isArray(p.recintos) || !Array.isArray(p.hojas)) throw Error('Planilla de avance inválida.');
  if (typeof p.cargada !== 'string' || !Number.isFinite(Date.parse(p.cargada)) || typeof p.por !== 'string' || !p.por.trim()) throw Error('Falta la fecha o el responsable de la carga.');
  const familias = new Set(FAMILIAS.map(f => f.id));
  for (const [code, fams] of Object.entries(p.recintos)) {
    if (!code || code.length > 30) throw Error('Código de recinto inválido en la planilla.');
    for (const [fam, v] of Object.entries(fams)) if (!familias.has(fam) || !Array.isArray(v) || v.length !== 3 || !(v[0] >= 0 && v[0] <= 1) || !(v[1] >= 0) || !Array.isArray(v[2])) throw Error('Avance inválido en ' + code + '.');
  }
  return p;
}

// Diferencias entre dos cargas del mismo piso: recintos y familias cuyo % cambió.
export function compararPlanillas(anterior, nueva) {
  const cambios = [];
  for (const [code, fams] of Object.entries(nueva?.recintos || {})) for (const [fam, v] of Object.entries(fams)) {
    const antes = anterior?.recintos?.[code]?.[fam]?.[0];
    if (antes == null ? v[0] > 0 : Math.abs(antes - v[0]) >= 0.005) cambios.push({code, familia: fam, antes: antes ?? null, despues: v[0]});
  }
  return cambios.sort((a, b) => a.code.localeCompare(b.code) || a.familia.localeCompare(b.familia));
}
// Resumen por familia: recintos, cantidad total y ejecutada, % ponderado.
export function totalesPorFamilia(planilla) {
  const t = {};
  for (const fams of Object.values(planilla?.recintos || {})) for (const [fam, [pct, cant]] of Object.entries(fams)) {
    const x = t[fam] ||= {familia: fam, nombre: NOMBRE_FAMILIA[fam] || fam, recintos: 0, terminados: 0, cantidad: 0, ejecutado: 0, suma: 0};
    x.recintos++; if (pct >= 0.995) x.terminados++; x.cantidad += cant; x.ejecutado += cant * pct; x.suma += pct;
  }
  return Object.values(t).map(x => ({...x, pct: x.cantidad > 0 ? x.ejecutado / x.cantidad : x.suma / x.recintos})).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ---------- Planilla → partidas de Atlas ----------
// Familias de pavimento: la hoja específica manda sobre la general «PAVIMENTO».
const PAVIMENTOS = ['vinilico', 'baldosa', 'resina', 'epoxico', 'pavimento'];
// Familia de la planilla que alimenta cada partida del recinto (null si ninguna).
export function familiaDePartida(id, fams) {
  const hay = f => fams?.[f] ? f : null;
  if (id === '6.3.2' || id === '6.3.3') return hay('cieloDuro');
  if (/^6\.3\./.test(id) && id !== '6.3.1') return hay('cieloModular');
  if (id.startsWith('T-CIE-PINTURA')) return hay('pinturaCielo');
  if (id.startsWith('T-CIE-')) return hay('cieloModular') || hay('cieloDuro');
  if (id === '6.10.4.2') return hay('cenefa');
  if (/^6\.4\.2\./.test(id)) return hay('pinturaCielo');
  if (/^6\.4\.1\./.test(id) || id === '6.2.2') return hay('pinturaMuro');
  if (/^6\.1\./.test(id) || id === '6.4.3.8' || id.startsWith('T-PAV-')) return PAVIMENTOS.map(hay).find(Boolean) || null;
  if (id === '6.10.2.8') return hay('retorno');
  if (id === '2.6') return hay('sobrelosa');
  if (id === '4.3.1') return hay('imper');
  if (id === '6.2.3') return hay('porcelanato');
  if (id === '6.2.4') return hay('hpl');
  if (id === '5.3') return hay('cortafuego');
  return null;
}
// % que la planilla asigna a una partida: el total de su familia; el empaste (6.2.2) toma la etapa «Pasta» de la pintura.
export function avanceDePartida(id, fams, hojas = []) {
  const fam = familiaDePartida(id, fams); if (!fam) return null;
  const [pct, cant, et] = fams[fam], etapas = hojas.find(h => h.familia === fam && h.etapas)?.etapas || [];
  if (id === '6.2.2') { const k = etapas.findIndex(e => /pasta/i.test(e)); if (k < 0) return null; return {familia: fam, pct: et[k] ?? 0, etapas: [{nombre: etapas[k], pct: et[k] ?? 0}]}; }
  return {familia: fam, pct, cant, etapas: etapas.map((nombre, k) => ({nombre, pct: et[k] ?? 0}))};
}

// ---------- Avance de una partida de la planilla por recinto ----------
export const SIN_INICIAR = 'Sin iniciar', TERMINADO = 'Terminado';
const COLORES_ETAPA = ['#c26a00', '#d9a21b', '#357d9a', '#1b5e9c', '#6b4fa3', '#8a6d00'];
export const etapasDe = (planilla, familia) => planilla?.hojas?.find(h => h.familia === familia && h.etapas)?.etapas || [];
// Pesos de las etapas: los escritos en la hoja, los habituales de la partida o iguales.
export function pesosDe(planilla, familia) {
  const etapas = etapasDe(planilla, familia), h = planilla?.hojas?.find(x => x.familia === familia && x.pesos?.length === etapas.length);
  return h?.pesos || (PESOS_FAMILIA[familia]?.length === etapas.length ? PESOS_FAMILIA[familia] : etapas.map(() => 1 / Math.max(1, etapas.length)));
}
// Categorías del plano para una partida, por la etapa ALCANZADA (como las lee producción): «Sin iniciar», una por etapa
// («Estructurado», «Tapado», «Huincha»…) y «Terminado». Un recinto queda en la última etapa que empezó.
const ALCANZADA = {estructura: 'Estructurado'};
export const nombreAlcanzado = etapa => ALCANZADA[String(etapa).trim().toLowerCase()] || etapa;
export const categoriasFamilia = etapas => [SIN_INICIAR, ...etapas.map(nombreAlcanzado), TERMINADO];
export function coloresFamilia(etapas) {
  return Object.fromEntries(categoriasFamilia(etapas).map((c, i, todas) => [c, i === 0 ? '#8c8c8c' : i === todas.length - 1 ? '#2e9e5b' : COLORES_ETAPA[(i - 1) % COLORES_ETAPA.length]]));
}
// completo: lo que además pide «Terminado» (el cielo duro, su pintura) está listo. Sin eso, el recinto queda en su última etapa.
export function categoriaEtapas(pct, et = [], etapas = [], completo = true) {
  if (pct >= 0.995 && completo) return TERMINADO;
  let k = -1; et.forEach((v, i) => { if (i < etapas.length && v > 0.004) k = i; });
  if (k >= 0) return nombreAlcanzado(etapas[k]);
  // Sin etapas marcadas: con avance total, la primera (o la última si está completa y falta lo que pide «Terminado»).
  if (!etapas.length) return pct >= 0.995 ? TERMINADO : SIN_INICIAR;
  return pct >= 0.995 ? nombreAlcanzado(etapas.at(-1)) : pct > 0.004 ? nombreAlcanzado(etapas[0]) : SIN_INICIAR;
}
// «Terminado» de una partida que pide otra completa: el cielo duro, con su pintura de cielos.
export const REQUIERE_PARA_TERMINAR = {cieloDuro: 'pinturaCielo'};
// % ponderado a partir de las etapas marcadas.
export const pctDeEtapas = (et, pesos) => Math.min(1, Math.max(0, et.reduce((a, v, k) => a + v * (pesos[k] ?? 0), 0)));
// Recintos de una partida con su avance vigente: lo de la planilla o, si terreno marcó después de la carga, lo de
// terreno. filas: código → fila del reporte de avance (avance-model.mjs), con sus partidas ya combinadas.
// Partidas del recinto que alimenta una familia de la planilla (el empaste 6.2.2 va aparte).
export const nodosDeFamilia = (fila, fams, familia) => (fila?.nodos || []).filter(n => n.tipo === 'partida' && n.id !== '6.2.2' && familiaDePartida(n.id, fams) === familia);
// Avance vigente de una familia en un recinto: el de la planilla o, si terreno marcó después de la carga, el de terreno.
export function avanceVigente(planilla, code, familia, fila = null) {
  const fams = planilla?.recintos?.[code], v = fams?.[familia]; if (!v) return null;
  const etapas = etapasDe(planilla, familia), nodo = nodosDeFamilia(fila, fams, familia)[0];
  let [pct, cant, et] = v, fuente = 'planilla';
  if (nodo?.registrada && nodo.fuente !== 'planilla') {
    fuente = 'terreno'; pct = (nodo.pct || 0) / 100;
    et = nodo.etapas?.length === etapas.length ? nodo.etapas.map(e => e.pct) : nodo.ejecucion === 'Instalado' ? etapas.map(() => 1) : nodo.ejecucion === 'No iniciado' ? etapas.map(() => 0) : et;
  }
  return {pct, cant, et: et || [], fuente, etapas, nodo};
}
export function avanceFamilia(planilla, familia, filas = new Map()) {
  const etapas = etapasDe(planilla, familia), requiere = REQUIERE_PARA_TERMINAR[familia], out = [];
  for (const code of Object.keys(planilla?.recintos || {})) {
    const fila = filas.get(code), a = avanceVigente(planilla, code, familia, fila); if (!a) continue;
    const {pct, cant, et, fuente, nodo} = a;
    // Lo que además pide «Terminado» (pintura de cielos), si la planilla lo mide en este recinto.
    const extra = requiere ? avanceVigente(planilla, code, requiere, fila) : null, completo = !extra || extra.pct >= 0.995;
    out.push({code, name: fila?.name || '', cant, pct, et, fuente, categoria: categoriaEtapas(pct, et, etapas, completo), ejecutado: cant * pct, pendiente: cant * (1 - pct), partida: nodo?.id || null,
      ...(extra ? {requiere, pctRequiere: extra.pct} : {})});
  }
  out.sort((a, b) => a.code.localeCompare(b.code, 'es', {numeric: true}));
  const cantidad = out.reduce((a, f) => a + f.cant, 0), ejecutado = out.reduce((a, f) => a + f.ejecutado, 0);
  return {familia, nombre: NOMBRE_FAMILIA[familia] || familia, etapas, categorias: categoriasFamilia(etapas), colores: coloresFamilia(etapas), filas: out,
    cantidad, ejecutado, pct: cantidad > 0 ? ejecutado / cantidad : out.length ? out.reduce((a, f) => a + f.pct, 0) / out.length : 0,
    terminados: out.filter(f => f.categoria === TERMINADO).length, pendientes: out.filter(f => f.categoria !== TERMINADO).length};
}
// Cambios desde la carga anterior para una partida (guardados con cada carga): recintos y cantidad que avanzó.
export function cambiosFamilia(planilla, familia) {
  const lista = (planilla?.resumen?.detalle || []).filter(c => c[1] === familia), cant = code => planilla.recintos?.[code]?.[familia]?.[1] || 0;
  return {anterior: planilla?.resumen?.anterior || null, recintos: lista.length, avance: lista.reduce((a, [code, , antes, despues]) => a + cant(code) * ((despues ?? 0) - (antes ?? 0)), 0), lista};
}
