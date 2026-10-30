// Avance por recinto y partida en los cuatro pisos (−1, 1, 2 y 3).
// Cada recinto del PMA RevB de su piso (A-S01, A-N01, A-N02, A-N03) recibe las partidas del itemizado que corresponden
// a sus terminaciones y asepsia. Avance físico en m²: ejecutado = superficie PMA × % de avance; pendiente = el resto.
// Sin valorización en la plataforma (decisión de obra, 2026-10-30): los precios del itemizado no se cargan; las funciones
// que aceptan un itemizado siguen calculando montos solo si se les entrega uno (pruebas y análisis fuera de la app).
// Las partidas se identifican siempre por su código ITEM, nunca por número de fila.
import {progressFloors} from './progress-scope.mjs';

export const CAPITULOS_PILOTO = ['2.6', '4.3', '5.1', '5.3', '6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.8', '6.10'];
export const CAPITULOS_POSTERIORES = ['7', '9']; // artefactos e instalaciones: preparados, fuera del piloto
export const ESTADOS = ['No iniciado', 'En ejecución', 'Instalado', 'Observado', 'Aprobado'];
export const CONFORMIDAD = ['Sin revisar', 'Conforme', 'No conforme'];
export const ESTADOS_PROTOCOLO = ['Pendiente', 'Liberado'];
export const ESTADOS_RECINTO = ['Sin iniciar', 'En curso', 'Completo', 'Observado', 'Sin datos'];
// Clave piso|código; los registros del −1 conservan su clave «N-1|código».
export const keyFor = (code, level = 'N-1') => level + '|' + String(code).trim();
const enCapitulo = (code, caps) => caps.some(c => code === c || code.startsWith(c + '.'));

// Nombres de respaldo: el checklist funciona aunque el itemizado aún no se haya cargado en el dispositivo.
export const NOMBRES = {
  '2.6': 'Sobrerradier / sobrelosa para terminación de pisos', '4.3.1': 'Impermeabilización bajo pavimentos de recintos húmedos',
  '5.1': 'Tabiquería', '5.3': 'Sellos de juntas y cortafuego', '6.1.2.1': 'Baldosa microvibrada lisa 40x40', '6.1.3.1': 'Porcelanato técnico 60x60',
  '6.1.4.2': 'Pavimento vinílico homogéneo antiestático 2 mm', '6.1.4.3': 'Pavimento vinílico homogéneo 2 mm', '6.1.4.4': 'Pavimento vinílico antideslizante R10 2 mm',
  '6.1.4.5': 'Pavimento vinílico antideslizante clase 3 2,5 mm', '6.1.4.6': 'Pavimento caucho virgen 3 mm', '6.1.5.1': 'Textil flocado 4,3 mm', '6.1.5.2': 'Resina de poliuretano',
  '6.2.2': 'Empaste para terminación de pintura', '6.2.3': 'Porcelanato técnico en muros', '6.2.4': 'Laminado de alta presión (HPL)', '6.2.7': 'Revestimiento acústico de madera',
  '6.3.1': 'Losa revocada en yeso para pintura', '6.3.2': 'Cielo falso fijo yeso-cartón recintos secos', '6.3.3': 'Cielo falso fijo yeso-cartón recintos húmedos',
  '6.3.4': 'Cielo modular de yeso revestido en vinilo', '6.3.5': 'Cielo modular acústico bandeja metálica', '6.3.6': 'Cielo modular de madera', '6.3.9': 'Cielo acústico 01 (NRC 0,85)',
  '6.3.10': 'Cielo acústico 02 (NRC 0,85) asepsia alta', '6.4.1.1': 'Pintura asepsia baja en muros', '6.4.1.2': 'Pintura asepsia media en muros', '6.4.2.1': 'Pintura asepsia baja en cielos',
  '6.4.2.2': 'Pintura asepsia media en cielos', '6.4.3.8': 'Esmalte epóxico para pisos', '6.10.2.8': 'Retorno sanitario para pavimento de resina PU', '6.10.4.2': 'Cenefa de yeso-cartón para cielo modular'
};

// Terminaciones del PMA → partidas.
const PAV = {'101': '6.1.2.1', '102': '6.1.3.1', '104': '6.1.4.2', '105': '6.1.4.3', '106': '6.1.4.4', '107': '6.1.4.5', '108': '6.1.4.6', '112': '6.1.5.1', '116': '6.1.5.2', '115': '6.4.3.8'};
const VINILICOS_CAUCHO = new Set(['104', '105', '106', '107', '108']);
const CIE = {'200': '6.3.1', '201': '6.3.2', '202': '6.3.3', '203': '6.3.4', '204': '6.3.4', '206': '6.3.5', '207': '6.3.6', '209': '6.3.9', '218': '6.3.9', '210': '6.3.10'};
const CIE_PINTADO = new Set(['200', '201', '202']), CIE_CENEFA = new Set(['204', '206', '218']), CIE_HUMEDO = '202';
const MUROS_PINTURA = {'11': 'BAJA', '12': 'MEDIA'}; // el código de muro ya fija la asepsia de la pintura
const MURO_REVESTIMIENTO = {'14': '6.2.3', '15': '6.2.3', '16': '6.2.4', '19': '6.2.7'};
const PINTURA_MURO = {BAJA: '6.4.1.1', MEDIA: '6.4.1.2'}, PINTURA_CIELO = {BAJA: '6.4.2.1', MEDIA: '6.4.2.2'};
// Terminaciones del PMA sin ítem conocido del itemizado (sobre todo en los pisos 1 a 3): se registran igual, como
// partida de la terminación («PMA 109»), con el nombre del PMA, sus m² y la cadena de previos de su familia.
const PAV_RESILIENTE = new Set(['103', '109', '110']), MURO_PANEL = new Set(['20', '21', '24']), MURO_EPOXICO = '13';

// Protocolos previos que no son partidas del itemizado. «ref» es el tipo de protocolo de la matriz REV1.
export const PROTOCOLOS = {
  'P-NIV-RES': {nombre: 'Nivelación de pavimentos resilientes', ref: 'NPPR-TER'},
  'P-SUSTRATO': {nombre: 'Nivelación y humedad del sustrato', ref: 'NPPR-TER'},
  'P-INST-CIELO': {nombre: 'Instalaciones sobre cielo liberadas', ref: 'MEP (varios)'},
  'P-SOBRELOSA': {nombre: 'Trabajos previos y reparación de sobrelosa', ref: 'P23-SOBRELOSA-OG-01'}
};
// Partidas que inician su cadena por decisión de obra: no se listan como «sin protocolo previo».
export const INICIO_CADENA = new Set(['5.1']);
// Tabla de cadena: origen «dada» (indicada en el encargo), «decidida» (revisión con obra, 27-10-2026) o «propuesta» (completada para revisión).
export const CADENA = [
  ['6.1.4.x vinílicos · 6.1.4.6 caucho', 'P-NIV-RES', 'dada'], ['Nivelación de pavimentos resilientes', '2.6', 'dada'],
  ['6.1.5.2 resina PU', 'P-SUSTRATO', 'dada'], ['6.10.2.8 retorno sanitario', '6.1.5.2', 'dada'],
  ['Pavimento de todo recinto con cielo húmedo (202)', '4.3.1', 'decidida'], ['6.4.1 pintura de muros', '6.2.2', 'dada'],
  ['6.2.2 empaste', '5.3', 'decidida'], ['5.3 sellos de juntas', '5.1', 'decidida'], ['5.1 tabiquería (inicia la cadena)', '—', 'decidida'],
  ['2.6 sobrerradier / sobrelosa', 'P-SOBRELOSA', 'decidida'], ['6.3 cielos', 'P-INST-CIELO', 'dada'], ['6.6 quincallería', '6.5', 'dada'],
  ['Nivelación y humedad del sustrato', '2.6', 'propuesta'], ['4.3.1 impermeabilización', '2.6', 'propuesta'],
  ['6.1.2 / 6.1.3 baldosa y porcelanato en recintos secos', '2.6', 'propuesta'], ['6.1.5.1 textil flocado', 'P-NIV-RES', 'propuesta'],
  ['6.4.3.8 esmalte epóxico de piso', 'P-SUSTRATO', 'propuesta'], ['6.2.3 / 6.2.4 / 6.2.7 revestimientos de muro', '5.1', 'propuesta'],
  ['6.4.2 pintura de cielos', '6.3.1 / 6.3.2 / 6.3.3 (su cielo)', 'propuesta'], ['6.10.4.2 cenefa', '6.3.4 / 6.3.5 / 6.3.9 (su cielo)', 'propuesta']
];

export const area = row => parseFloat(String(row?.area ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
const limpio = v => String(v ?? '').trim();

// Nodos (partidas y protocolos) de un recinto, con sus prerrequisitos. Cantidad = superficie PMA solo para partidas en m².
export function nodosRecinto(row, items = new Map(), materiales = null) {
  const nodos = new Map(), asepsia = limpio(row.asepsis).toUpperCase(), m2 = area(row), sinPartida = [];
  const unidad = id => items.get(id)?.unit || (/^6\.(1|3)\.|^6\.4\.(2|3)|^4\.3\.1/.test(id) ? 'm2' : '');
  const partida = (id, origen, prereq = [], porSuperficie = true) => {
    if (nodos.has(id)) { const n = nodos.get(id); n.origen.push(origen); for (const p of prereq) if (!n.prereq.includes(p)) n.prereq.push(p); return; }
    const it = items.get(id), u = unidad(id);
    nodos.set(id, {id, tipo: 'partida', item: id, nombre: it?.desc || NOMBRES[id] || id, unidad: u, cantidad: porSuperficie && /^m2$/i.test(u) && m2 > 0 ? m2 : null, pu: it?.pu ?? null, origen: [origen], prereq: [...prereq]});
  };
  // inicio: inicia su propia cadena (paneles autoportantes), no se informa como «sin protocolo previo».
  const terminacion = (campo, codigo, origen, prereq, porSuperficie, inicio = false, nombre = null) => {
    const id = 'T-' + campo + '-' + codigo;
    if (nodos.has(id)) { const n = nodos.get(id); n.origen.push(origen); return; }
    nodos.set(id, {id, tipo: 'partida', item: 'PMA ' + codigo, nombre: nombre || materiales?.get(codigo) || 'Terminación ' + codigo + ' del PMA', unidad: porSuperficie && m2 > 0 ? 'm2' : '', cantidad: porSuperficie && m2 > 0 ? m2 : null, pu: null, origen: [origen], prereq: [...prereq], generica: true, inicio});
  };
  const conocido = codigo => codigo !== 'S/E' && !!materiales?.has(codigo);
  const protocolo = (id, prereq = []) => { if (!nodos.has(id)) nodos.set(id, {id, tipo: 'protocolo', nombre: PROTOCOLOS[id].nombre, ref: PROTOCOLOS[id].ref, origen: [], prereq: [...prereq]}); };
  const pav = limpio(row.PAV), cie = limpio(row.CIE), muros = ['M1', 'M2', 'M3', 'M4'].map(k => limpio(row[k])), humedo = cie === CIE_HUMEDO;
  // Pavimento
  if (PAV[pav]) {
    // Todo recinto con cielo húmedo (202) lleva impermeabilización 4.3.1 bajo su pavimento, sea cual sea el pavimento.
    const id = PAV[pav], impermeable = humedo ? ['4.3.1'] : [];
    protocolo('P-SOBRELOSA');
    partida('2.6', 'Pavimento ' + pav, ['P-SOBRELOSA'], false);
    if (humedo) partida('4.3.1', 'Recinto húmedo (cielo 202)', ['2.6']);
    if (VINILICOS_CAUCHO.has(pav) || pav === '112') { protocolo('P-NIV-RES', ['2.6']); partida(id, 'Pavimento ' + pav, ['P-NIV-RES', ...impermeable]); }
    else if (pav === '116' || pav === '115') { protocolo('P-SUSTRATO', ['2.6']); partida(id, 'Pavimento ' + pav, ['P-SUSTRATO', ...impermeable]); if (pav === '116') partida('6.10.2.8', 'Retorno de resina PU', ['6.1.5.2'], false); }
    else partida(id, 'Pavimento ' + pav, humedo ? impermeable : ['2.6']);
  } else if (pav && !['N/A', '-'].includes(pav)) {
    if (conocido(pav)) {
      const impermeable = humedo ? ['4.3.1'] : [];
      protocolo('P-SOBRELOSA'); partida('2.6', 'Pavimento ' + pav, ['P-SOBRELOSA'], false);
      if (humedo) partida('4.3.1', 'Recinto húmedo (cielo 202)', ['2.6']);
      if (PAV_RESILIENTE.has(pav)) { protocolo('P-NIV-RES', ['2.6']); terminacion('PAV', pav, 'Pavimento ' + pav, ['P-NIV-RES', ...impermeable], true); }
      else terminacion('PAV', pav, 'Pavimento ' + pav, humedo ? impermeable : ['2.6'], true);
    } else sinPartida.push('Pavimento ' + pav);
  }
  // Cielo
  if (CIE[cie]) {
    protocolo('P-INST-CIELO');
    const id = CIE[cie];
    partida(id, 'Cielo ' + cie, ['P-INST-CIELO']);
    if (CIE_PINTADO.has(cie)) { if (PINTURA_CIELO[asepsia]) partida(PINTURA_CIELO[asepsia], 'Cielo ' + cie + ' · asepsia ' + asepsia, [id]); else if (asepsia === 'ALTA' && materiales) terminacion('CIE', 'PINTURA-ALTA', 'Cielo ' + cie + ' · asepsia ALTA', [id], true, false, 'Pintura de cielo asepsia alta'); else sinPartida.push('Pintura de cielo con asepsia ' + (asepsia || 'sin dato')); }
    if (CIE_CENEFA.has(cie)) partida('6.10.4.2', 'Cenefa de cielo ' + cie, [id], false);
  } else if (cie && !['N/A', '-'].includes(cie)) {
    if (conocido(cie)) { protocolo('P-INST-CIELO'); terminacion('CIE', cie, 'Cielo ' + cie, ['P-INST-CIELO'], true); }
    else sinPartida.push('Cielo ' + cie);
  }
  // Muros: tabique → sellos de juntas → empaste. El tabique es la base de cualquier revestimiento o pintura de muro.
  const conMuro = muros.filter(c => MUROS_PINTURA[c] || MURO_REVESTIMIENTO[c] || (c === MURO_EPOXICO && conocido(c)));
  if (conMuro.length) { partida('5.1', 'Muros', [], false); partida('5.3', 'Muros', ['5.1'], false); }
  for (const c of new Set(muros)) {
    if (MURO_REVESTIMIENTO[c]) partida(MURO_REVESTIMIENTO[c], 'Muro ' + c, ['5.1'], false);
    const pintura = MUROS_PINTURA[c] || (c === '15' ? asepsia : null);
    if (MUROS_PINTURA[c] || c === '15') {
      partida('6.2.2', 'Muro ' + c, ['5.3'], false);
      if (PINTURA_MURO[pintura]) partida(PINTURA_MURO[pintura], 'Muro ' + c + ' · asepsia ' + pintura, ['6.2.2'], false);
      else sinPartida.push('Pintura de muro ' + c + ' con asepsia ' + (pintura || 'sin dato'));
    }
    // Epóxica de asepsia alta: misma cadena que la pintura (tabique → sellos → empaste). Paneles: inician su cadena.
    if (c === MURO_EPOXICO && conocido(c)) { partida('6.2.2', 'Muro ' + c, ['5.3'], false); terminacion('MURO', c, 'Muro ' + c, ['6.2.2'], false); continue; }
    if (MURO_PANEL.has(c) && conocido(c)) { terminacion('MURO', c, 'Muro ' + c, [], false, true); continue; }
    if (c && !MUROS_PINTURA[c] && !MURO_REVESTIMIENTO[c] && !['N/A', '-'].includes(c)) sinPartida.push('Muro ' + c);
  }
  return {nodos: [...nodos.values()], sinPartida: [...new Set(sinPartida)], asepsia, superficie: m2};
}

// Estado vigente de un nodo, a partir del registro guardado.
export function estadoNodo(nodo, registro) {
  if (nodo.tipo === 'protocolo') return {estado: registro?.protocolos?.[nodo.id]?.estado || 'Pendiente'};
  const v = registro?.partidas?.[nodo.id];
  return v ? {estado: v.estado, pct: v.pct, conformidad: v.conformidad, falta: v.falta || '', obs: v.obs || []} : {estado: 'No iniciado', pct: 0, conformidad: 'Sin revisar', falta: '', obs: []};
}
export const liberado = (nodo, estado) => nodo.tipo === 'protocolo' ? estado.estado === 'Liberado' : estado.estado === 'Aprobado';
export function bloqueos(nodo, nodos, registro) {
  const porId = new Map(nodos.map(n => [n.id, n]));
  return nodo.prereq.map(id => porId.get(id)).filter(p => p && !liberado(p, estadoNodo(p, registro)));
}

// Reglas del checklist. Devuelve la lista de errores (vacía si es válido).
export function validarPartida(nodo, v, bloqueadoPor = []) {
  const e = [], nombre = nodo.item + ' ' + nodo.nombre;
  if (!ESTADOS.includes(v.estado)) e.push(nombre + ': estado no válido.');
  if (!CONFORMIDAD.includes(v.conformidad)) e.push(nombre + ': conformidad no válida.');
  if (!Number.isFinite(v.pct) || v.pct < 0 || v.pct > 100) e.push(nombre + ': el % de avance debe estar entre 0 y 100.');
  if (v.estado === 'No iniciado' && v.pct !== 0) e.push(nombre + ': «No iniciado» es 0 %.');
  if (v.estado === 'En ejecución' && !(v.pct > 0 && v.pct < 100)) e.push(nombre + ': «En ejecución» requiere un % entre 1 y 99.');
  if (['Instalado', 'Aprobado'].includes(v.estado) && v.pct !== 100) e.push(nombre + ': «' + v.estado + '» es 100 %.');
  if (v.estado === 'Observado' && !v.obs.length && !v.falta.trim()) e.push(nombre + ': «Observado» requiere una observación o indicar qué falta.');
  if (v.conformidad === 'No conforme' && !v.obs.length && !v.falta.trim()) e.push(nombre + ': «No conforme» requiere una observación o indicar qué falta.');
  if (v.estado === 'Aprobado' && v.conformidad !== 'Conforme') e.push(nombre + ': solo se aprueba una partida conforme.');
  if (v.estado === 'Aprobado' && v.falta.trim()) e.push(nombre + ': no se aprueba con faltantes declarados.');
  if (v.estado === 'Aprobado' && bloqueadoPor.length) e.push(nombre + ': no puede quedar aprobada; falta liberar ' + bloqueadoPor.map(b => b.item || b.nombre).join(', ') + '.');
  return e;
}
export function validarRegistro(r, nodos) {
  const e = [];
  if (!progressFloors[r?.level] || r.key !== keyFor(r.code, r.level) || !Number.isInteger(r.version) || r.version < 1 || typeof r.at !== 'string') e.push('Registro incompleto.');
  if (!r?.responsable?.trim()) e.push('Indica el responsable.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r?.fecha || '') || new Date(r.fecha).toISOString?.().slice(0, 10) !== r.fecha) e.push('Fecha inválida.');
  if (e.length || !nodos) return e;
  for (const n of nodos) {
    if (n.tipo === 'protocolo') { const p = r.protocolos?.[n.id]; if (p && !ESTADOS_PROTOCOLO.includes(p.estado)) e.push(n.nombre + ': estado no válido.'); continue; }
    const v = r.partidas?.[n.id]; if (!v) continue;
    e.push(...validarPartida(n, {...v, falta: v.falta || '', obs: v.obs || []}, bloqueos(n, nodos, r)));
  }
  return e;
}

// Estado del recinto para colorear el plano.
export function estadoRecinto(nodos, registro) {
  const partidas = nodos.filter(n => n.tipo === 'partida');
  if (!partidas.length) return 'Sin datos';
  const estados = partidas.map(n => estadoNodo(n, registro));
  if (estados.some(s => s.estado === 'Observado' || s.conformidad === 'No conforme')) return 'Observado';
  if (estados.every(s => s.estado === 'Aprobado') && nodos.filter(n => n.tipo === 'protocolo').every(n => liberado(n, estadoNodo(n, registro)))) return 'Completo';
  if (estados.every(s => s.estado === 'No iniciado')) return 'Sin iniciar';
  return 'En curso';
}

// Reporte completo: filas por recinto, totales por partida, recinto, asepsia y piso; bloqueos; control de cubicación.
export function reporteAvance(pma, items, registros, level = 'N-1') {
  const porClave = new Map(registros.map(r => [r.key, r])), filas = [];
  for (const row of pma.main.filter(r => r.level === progressFloors[level])) {
    const {nodos, sinPartida, asepsia, superficie} = nodosRecinto(row, items, pma.materials), registro = porClave.get(keyFor(row.code, level));
    const detalle = nodos.map(n => {
      const s = estadoNodo(n, registro), bloq = bloqueos(n, nodos, registro);
      const total = n.tipo === 'partida' && n.cantidad != null && n.pu != null ? n.cantidad * n.pu : null;
      const ejecutado = total != null ? total * (s.pct || 0) / 100 : null;
      const m2Ejecutado = n.tipo === 'partida' && n.cantidad != null ? n.cantidad * (s.pct || 0) / 100 : null;
      return {...n, ...s, bloqueadoPor: bloq, total, ejecutado, pendiente: total != null ? total - ejecutado : null, m2Ejecutado, m2Pendiente: m2Ejecutado != null ? n.cantidad - m2Ejecutado : null};
    });
    filas.push({code: limpio(row.code), name: row.name, unit: row.unit, asepsia: asepsia || 'Sin dato', superficie, row, registro, nodos: detalle, sinPartida, estado: estadoRecinto(nodos, registro),
      total: suma(detalle, 'total'), ejecutado: suma(detalle, 'ejecutado')});
  }
  const partidas = filas.flatMap(f => f.nodos.filter(n => n.tipo === 'partida').map(n => ({...n, recinto: f})));
  const porPartida = agrupar(partidas, n => n.item), porAsepsia = agrupar(partidas, n => n.recinto.asepsia);
  const cubicacion = [...porPartida.entries()].map(([id, ns]) => { const it = items.get(id), pma = ns.reduce((a, n) => a + (n.cantidad || 0), 0); return {id, nombre: ns[0].nombre, unidad: ns[0].unidad, pma: ns.some(n => n.cantidad != null) ? pma : null, itemizado: it?.p1 ?? null, dif: it?.p1 && ns.some(n => n.cantidad != null) ? (pma - it.p1) / it.p1 : null}; });
  // Bloqueada: ya tiene avance pero no puede aprobarse porque su protocolo previo no está liberado. Su monto ejecutado queda detenido.
  const bloqueadas = partidas.filter(n => n.bloqueadoPor.length && !['No iniciado', 'Aprobado'].includes(n.estado));
  return {
    level, filas, partidas,
    porPartida: [...porPartida.entries()].map(([id, ns]) => resumen(id, ns)).sort((a, b) => (b.pendiente ?? -1) - (a.pendiente ?? -1)),
    porAsepsia: [...porAsepsia.entries()].map(([id, ns]) => resumen(id, ns)),
    porRecinto: filas.map(f => ({code: f.code, name: f.name, estado: f.estado, total: f.total, ejecutado: f.ejecutado})),
    piso: {total: suma(partidas, 'total'), ejecutado: suma(partidas, 'ejecutado'), partidas: partidas.length, valorizables: partidas.filter(n => n.total != null).length,
      avanceFisico: partidas.length ? partidas.reduce((a, n) => a + (n.pct || 0), 0) / partidas.length : 0},
    estados: ESTADOS.map(e => [e, partidas.filter(n => n.estado === e).length]),
    recintos: ESTADOS_RECINTO.map(e => [e, filas.filter(f => f.estado === e).length]),
    bloqueadas, bloqueosPorCausa: [...agrupar(bloqueadas.flatMap(n => n.bloqueadoPor.map(b => ({...n, causa: b.tipo === 'protocolo' ? b.nombre : b.item + ' ' + b.nombre}))), n => n.causa).entries()]
      .map(([causa, ns]) => ({causa, n: ns.length, detenido: suma(ns, 'ejecutado')})).sort((a, b) => b.detenido - a.detenido || b.n - a.n),
    esperando: partidas.filter(n => n.bloqueadoPor.length && n.estado === 'No iniciado').length,
    cubicacion
  };
}
const suma = (lista, k) => lista.reduce((a, n) => a + (n[k] || 0), 0);
function agrupar(lista, clave) { const m = new Map(); for (const n of lista) { const k = clave(n); if (!m.has(k)) m.set(k, []); m.get(k).push(n); } return m; }
function resumen(id, ns) {
  const valorizables = ns.filter(n => n.total != null);
  return {id, nombre: ns[0].nombre, n: ns.length, aprobadas: ns.filter(n => n.estado === 'Aprobado').length, total: valorizables.length ? suma(valorizables, 'total') : null,
    ejecutado: valorizables.length ? suma(valorizables, 'ejecutado') : null, pendiente: valorizables.length ? suma(valorizables, 'pendiente') : null,
    cantidad: ns.some(n => n.cantidad != null) ? suma(ns, 'cantidad') : null, m2Ejecutado: ns.some(n => n.cantidad != null) ? suma(ns, 'm2Ejecutado') : null, unidad: ns[0].unidad,
    fisico: ns.reduce((a, n) => a + (n.pct || 0), 0) / ns.length};
}

// Partidas de una terminación del rombo (PAV, CIE, M1–M4), según de dónde salió cada partida al generarse.
// El pavimento incluye su impermeabilización de recinto húmedo y su retorno; el cielo, su pintura y cenefa; un muro, su
// tabique y sellos comunes y lo que corresponde a su código.
export function partidasDeTerminacion(nodos, campo, row) {
  const codigo = limpio(row?.[campo]), es = (o, base) => o === base || o.startsWith(base + ' ');
  const propia = o => campo === 'PAV' ? es(o, 'Pavimento') || o.startsWith('Recinto húmedo') || o.startsWith('Retorno')
    : campo === 'CIE' ? es(o, 'Cielo') || o.startsWith('Cenefa') : !!codigo && (o === 'Muros' || es(o, 'Muro ' + codigo));
  return nodos.filter(n => n.tipo === 'partida' && n.origen.some(propia));
}
// Avance físico de un recinto: promedio del % de sus partidas (cada partida pesa igual).
export const avanceFisico = nodos => { const ps = nodos.filter(n => n.tipo === 'partida'); return ps.length ? ps.reduce((a, n) => a + (n.pct || 0), 0) / ps.length : 0; };

// Itemizado (Formulario n°11A). Cantidades del piso −1 en K (módulo A), AB (módulo B) y AR (módulo D); precio unitario en BA.
export function leerItemizado(libro, XLSX) {
  const nombre = libro.SheetNames.find(s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '').includes('formulario') && /11a/i.test(s));
  if (!nombre) throw Error('No se encontró la hoja «Formulario n°11A».');
  const ws = libro.Sheets[nombre], valor = (col, fila) => ws[col + fila]?.v, texto = (col, fila) => String(valor(col, fila) ?? '').trim();
  let cab = 0; for (let f = 1; f <= 20 && !cab; f++) if (texto('A', f).toUpperCase() === 'ITEM' && /UNIDAD/i.test(texto('C', f)) && /PRECIO/i.test(texto('BA', f))) cab = f;
  if (!cab) throw Error('El formato no coincide: se esperaba ITEM en A, UNIDAD en C y PRECIO UNITARIO en BA.');
  const num = v => typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;
  const items = new Map(), titulos = new Map(), ultima = XLSX.utils.decode_range(ws['!ref']).e.r + 1;
  for (let f = cab + 1; f <= ultima; f++) {
    const code = texto('A', f).replace(/\.$/, ''), desc = texto('B', f), unit = texto('C', f);
    if (!/^\d+(\.\d+)*$/.test(code)) continue;
    if (/eliminad/i.test(desc)) continue;
    if (!unit) { titulos.set(code, desc); continue; }
    if (items.has(code)) throw Error('ITEM repetido en el itemizado: ' + code + '. Revisa el archivo.');
    const qty = {A: num(valor('K', f)), B: num(valor('AB', f)), D: num(valor('AR', f))};
    items.set(code, {code, desc, unit, qty, p1: qty.A + qty.B + qty.D, az: num(valor('AZ', f)), pu: num(valor('BA', f)), importe: num(valor('BB', f)), fila: f,
      piloto: enCapitulo(code, CAPITULOS_PILOTO), posterior: enCapitulo(code, CAPITULOS_POSTERIORES)});
  }
  if (!items.size) throw Error('El itemizado no tiene partidas con unidad.');
  return {hoja: nombre, items, titulos};
}

// Listas para revisión: partidas del piloto sin cantidad por recinto, sin protocolo previo y terminaciones sin partida.
export function revision(reporte, items) {
  const generadas = new Map();
  for (const n of reporte.partidas) { const g = generadas.get(n.item) || {id: n.item, nombre: n.nombre, recintos: 0, sinCantidad: 0, sinProtocolo: !n.prereq.length && !INICIO_CADENA.has(n.item) && !n.inicio}; g.recintos++; if (n.cantidad == null) g.sinCantidad++; generadas.set(n.item, g); }
  const piloto = [...items.values()].filter(i => i.piloto && i.p1 > 0);
  const cubiertas = id => generadas.has(id) || [...generadas.keys()].some(g => id.startsWith(g + '.'));
  return {
    sinVinculo: piloto.filter(i => !cubiertas(i.code)).map(i => ({id: i.code, nombre: i.desc, unidad: i.unit, cantidad: i.p1})),
    sinCantidad: [...generadas.values()].filter(g => g.sinCantidad).map(g => ({id: g.id, nombre: g.nombre, recintos: g.recintos})),
    sinProtocolo: [...generadas.values()].filter(g => g.sinProtocolo).map(g => ({id: g.id, nombre: g.nombre, recintos: g.recintos})),
    sinPartida: [...agrupar(reporte.filas.flatMap(f => f.sinPartida.map(s => ({s, code: f.code}))), x => x.s).entries()].map(([s, xs]) => ({terminacion: s, recintos: xs.map(x => x.code)})),
    posteriores: [...items.values()].filter(i => i.posterior && i.p1 > 0).length
  };
}
