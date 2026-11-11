// Levantamiento: proyecto con columnas propias por recinto (estado, lista o texto), importable desde una planilla y
// exportable a Excel con los mismos encabezados. Un levantamiento de varios pisos se guarda como un documento por piso,
// unidos por «grupo»: el plano de cada piso pinta sus filas y la exportación los junta con la columna Nivel.
// Las filas se identifican por código de recinto. Una columna de estado puede enlazarse al avance del rombo (pavimento,
// cielo o muros): mientras el rombo tenga registro, manda sobre el valor guardado.
const texto = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const color = v => /^#[a-f0-9]{6}$/i.test(v);
export const TIPOS_COLUMNA = {estado: 'Estado', lista: 'Lista', texto: 'Texto'};
export const ENLACES = {PAV: 'Pavimento del rombo', CIE: 'Cielo del rombo', MUROS: 'Muros del rombo'};
// Una columna de lista puede tomar el estado de una partida de la planilla de avance: enlace «P:<familia>».
export const esEnlacePlanilla = e => typeof e === 'string' && /^P:[A-Za-z]{2,30}$/.test(e);
export const MAX_COLUMNAS = 30, MAX_OPCIONES = 24, MAX_FILAS = 5000;
export const VISTA_LISTO = 'listo';
export const LISTO = {listo: {nombre: 'Listo para instalar', color: '#2e9e5b'}, pendiente: {nombre: 'Pendiente', color: '#c26a00'}};
// Pisos de Atlas y cómo pueden venir escritos en una planilla.
export const PISOS = {'N-1': ['s01', 'n-1', '-1', 'nivel -1', 'subterraneo', 'sotano'], N01: ['n01', '1', 'nivel 1', 'n1'], N02: ['n02', '2', 'nivel 2', 'n2'], N03: ['n03', '3', 'nivel 3', 'n3']};
const PALETA = ['#2f6db5', '#e07b00', '#7a4fa3', '#2a9d8f', '#b5651d', '#5f6b7a', '#c21f1f', '#1b2a56', '#8a6d00', '#3c8d3c'];

// Clave para unir variantes de escritura: sin tildes, mayúsculas ni espacios dobles, y «Instalada» = «Instalado».
export const clave = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/ad[ao]\b/g, 'ado');
const oracion = v => { const s = String(v).trim().replace(/\s+/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
// Acepta también el prefijo de especialidad de las planillas del proyecto: «A-N02», «A-S01».
export const pisoDe = v => { const k = clave(v).replace(/^[a-z]{1,3}[-_ ](?=[ns]-?\d)/, ''); return Object.keys(PISOS).find(p => p.toLowerCase() === k || PISOS[p].includes(k)) || null; };
const id = (prefijo, i) => prefijo + String(i + 1).padStart(2, '0');

// ---------- Validación ----------
export function validarLevantamiento(doc) {
  if (!doc || doc.schema !== 3 || doc.tipo !== 'levantamiento' || doc.specialty !== 'architecture' || !texto(doc.id, 100) || !texto(doc.level, 30)) throw Error('Levantamiento inválido.');
  for (const [k, nombre, max] of [['name', 'Nombre', 160], ['author', 'Quién lo realizó', 160], ['purpose', 'Para qué es', 2000]]) if (!texto(doc[k], max)) throw Error(nombre + ': completa este campo obligatorio.');
  if (doc.grupo != null && !texto(doc.grupo, 100)) throw Error('Grupo inválido.');
  if (doc.etiquetaNivel != null && !texto(doc.etiquetaNivel, 30)) throw Error('Nivel de la planilla inválido.');
  if (!color(doc.color) || !Number.isSafeInteger(doc.version) || doc.version < 1) throw Error('Versión o color inválido.');
  if (![doc.createdAt, doc.updatedAt].every(at => typeof at === 'string' && Number.isFinite(Date.parse(at)))) throw Error('Fecha inválida.');
  if (!Array.isArray(doc.columnas) || !doc.columnas.length || doc.columnas.length > MAX_COLUMNAS) throw Error(`Un levantamiento necesita entre 1 y ${MAX_COLUMNAS} columnas.`);
  const ids = new Set(), nombres = new Set();
  for (const c of doc.columnas) {
    if (!texto(c.id, 40) || !texto(c.nombre, 80) || !TIPOS_COLUMNA[c.tipo] || ids.has(c.id) || nombres.has(clave(c.nombre))) throw Error('Columna incompleta o repetida: ' + (c?.nombre || '?') + '.');
    ids.add(c.id); nombres.add(clave(c.nombre));
    if (c.enlace != null && !(c.tipo === 'estado' && ENLACES[c.enlace]) && !(c.tipo === 'lista' && esEnlacePlanilla(c.enlace))) throw Error('Solo una columna de estado se enlaza al rombo.');
    if (c.tipo === 'texto') continue;
    if (!Array.isArray(c.opciones) || !c.opciones.length || c.opciones.length > MAX_OPCIONES) throw Error(`La columna «${c.nombre}» necesita entre 1 y ${MAX_OPCIONES} opciones.`);
    const op = new Set(), opNombres = new Set();
    for (const o of c.opciones) {
      if (!texto(o.id, 40) || !texto(o.nombre, 80) || !color(o.color) || op.has(o.id) || opNombres.has(clave(o.nombre))) throw Error(`Opción incompleta o repetida en «${c.nombre}».`);
      op.add(o.id); opNombres.add(clave(o.nombre));
    }
    if (c.tipo === 'estado' && !c.opciones.some(o => o.final)) throw Error(`Marca cuál es el estado final de «${c.nombre}» (por ejemplo, Instalado).`);
  }
  if (doc.vista !== VISTA_LISTO && !doc.columnas.some(c => c.id === doc.vista && c.tipo !== 'texto')) throw Error('La vista del plano no corresponde a una columna.');
  if (!Array.isArray(doc.filas) || doc.filas.length > MAX_FILAS) throw Error('Lista de recintos inválida.');
  const codigos = new Set(), porId = new Map(doc.columnas.map(c => [c.id, c]));
  for (const f of doc.filas) {
    if (!texto(f.code, 160) || codigos.has(f.code) || typeof f.name !== 'string' || f.name.length > 500 || !f.valores || typeof f.valores !== 'object') throw Error('Recinto repetido o incompleto: ' + (f?.code || '?') + '.');
    codigos.add(f.code);
    for (const [k, v] of Object.entries(f.valores)) {
      const c = porId.get(k); if (!c) throw Error('Valor de una columna que no existe.');
      if (c.tipo === 'texto' ? typeof v !== 'string' || v.length > 2000 : !c.opciones.some(o => o.id === v)) throw Error(`Valor inválido en «${c.nombre}» de ${f.code}.`);
    }
  }
  return doc;
}

// ---------- Valores, «Listo» y enlace con el rombo ----------
// enlazado(code, enlace): estado de la terminación en el rombo ({installation}) o null si no tiene registro.
export function valor(columna, fila, enlazado = null) {
  // Lista enlazada a una partida de la planilla de avance: la categoría vigente del recinto (Sin iniciar, En tapado…).
  // Se une por el orden de los estados (renombrarlos no corta el enlace) y, si no calzan en número, por el nombre.
  if (esEnlacePlanilla(columna.enlace) && enlazado) {
    const e = enlazado(fila.code, columna.enlace), o = e && opcionDeCategoria(columna, e);
    if (o) return {id: o.id, rombo: true};
    return {id: fila.valores[columna.id] ?? null, rombo: false};
  }
  if (columna.enlace && enlazado) {
    const e = enlazado(fila.code, columna.enlace);
    if (e) {
      const final = columna.opciones.find(o => o.final), pendiente = columna.opciones.find(o => !o.final && !o.noAplica);
      return {id: e.installation === 'Instalado' ? final.id : (pendiente || final).id, rombo: true};
    }
  }
  return {id: fila.valores[columna.id] ?? null, rombo: false};
}
export const opcion = (columna, idOpcion) => columna.opciones?.find(o => o.id === idOpcion) || null;
// Estados de una columna enlazada a una partida ↔ estados de la partida ({categoria, indice, total}).
export function opcionDeCategoria(columna, e) {
  if (Number.isInteger(e.indice) && e.indice >= 0 && e.total === columna.opciones.length) return columna.opciones[e.indice];
  return columna.opciones.find(o => o.nombre === e.categoria) || null;
}
export function indiceDeOpcion(columna, idOpcion, categorias) {
  const i = columna.opciones.findIndex(o => o.id === idOpcion); if (i < 0) return -1;
  return categorias.length === columna.opciones.length ? i : categorias.indexOf(columna.opciones[i].nombre);
}
// Columnas enlazadas a una partida con los nombres y colores vigentes de sus estados (por orden). partidaDe(enlace):
// {categorias, colores} o null. Devuelve el mismo documento si no hay nada que cambiar.
export function alinearPartidas(doc, partidaDe) {
  let cambio = false;
  const columnas = doc.columnas.map(c => {
    const a = esEnlacePlanilla(c.enlace) && partidaDe(c.enlace);
    if (!a || a.categorias.length !== c.opciones.length) return c;
    const opciones = c.opciones.map((o, i) => ({...o, nombre: a.categorias[i], color: a.colores[a.categorias[i]] || o.color}));
    if (opciones.every((o, i) => o.nombre === c.opciones[i].nombre && o.color === c.opciones[i].color)) return c;
    cambio = true; return {...c, opciones};
  });
  return cambio ? validarLevantamiento({...doc, columnas}) : doc;
}
// Listo para instalar: todas las columnas de estado en su estado final (o «no aplica»). Sin ningún dato, no se pinta.
export function listo(doc, fila, enlazado = null) {
  const estados = doc.columnas.filter(c => c.tipo === 'estado');
  const vals = estados.map(c => opcion(c, valor(c, fila, enlazado).id));
  if (!vals.some(Boolean)) return null;
  return vals.every(o => o && (o.final || o.noAplica)) ? 'listo' : 'pendiente';
}
// Categoría de la fila en la vista del plano: opción de la columna elegida o listo / pendiente.
export function categoria(doc, fila, enlazado = null) {
  if (doc.vista === VISTA_LISTO) { const k = listo(doc, fila, enlazado); return k ? {id: k, ...LISTO[k]} : null; }
  const c = doc.columnas.find(c => c.id === doc.vista), o = c && opcion(c, valor(c, fila, enlazado).id);
  return o ? {id: o.id, nombre: o.nombre, color: o.color} : null;
}
// ---------- Filtro de la tabla (como Excel) ----------
// Columnas de la tabla: código, recinto, cada columna del levantamiento y «Listo para instalar». El mismo filtro acota la
// tabla, el plano y la exportación (PDF y PNG): así se cruza, por ejemplo, «Tipo de pavimento = 103» con el estatus.
export function columnasTabla(doc, enlazado = null, nombreRecinto = () => '') {
  const nombreValor = (c, f) => c.tipo === 'texto' ? f.valores[c.id] || '' : opcion(c, valor(c, f, enlazado).id)?.nombre || 'Sin dato';
  return [{key: 'code', titulo: 'Código', valor: f => f.code}, {key: 'name', titulo: 'Recinto', valor: f => f.name || nombreRecinto(f.code) || ''},
    ...doc.columnas.map(c => ({key: c.id, titulo: c.nombre, valor: f => nombreValor(c, f), ...(c.tipo === 'texto' ? {} : {opciones: [...c.opciones.map(o => o.nombre), 'Sin dato']})})),
    {key: 'listo', titulo: 'Listo para instalar', valor: f => ({listo: 'Listo', pendiente: 'Pendiente'}[listo(doc, f, enlazado)] || 'Sin dato'), opciones: ['Listo', 'Pendiente', 'Sin dato']}];
}
export const filtroActivo = estado => Object.values(estado?.filtros || {}).some(Array.isArray);
// Filas que pasan el filtro (todas si no hay filtro). Una columna filtrada sin valores elegidos no deja ninguna.
export function filasFiltradas(doc, estado, enlazado = null, nombreRecinto = () => '') {
  if (!filtroActivo(estado)) return doc.filas;
  const cols = columnasTabla(doc, enlazado, nombreRecinto), activas = cols.filter(c => Array.isArray(estado.filtros[c.key])).map(c => [c, new Set(estado.filtros[c.key])]);
  return doc.filas.filter(f => activas.every(([c, elegidos]) => { const v = c.valor(f); return elegidos.has(v == null || v === '' ? '(Vacías)' : String(v)); }));
}
// Texto del filtro para el panel y la exportación: «Tipo Pavimento: 103 - Vinílico Acústico · Estatus: No instalado».
export function textoFiltro(doc, estado) {
  return columnasTabla(doc).filter(c => Array.isArray(estado?.filtros?.[c.key])).map(c => `${c.titulo}: ${estado.filtros[c.key].length ? estado.filtros[c.key].join(', ') : 'ninguno'}`).join(' · ');
}

export function leyenda(doc, filas, enlazado = null) {
  const base = doc.vista === VISTA_LISTO ? Object.entries(LISTO).map(([k, v]) => ({id: k, ...v})) : doc.columnas.find(c => c.id === doc.vista).opciones.map(o => ({id: o.id, nombre: o.nombre, color: o.color}));
  const cuenta = new Map(); for (const f of filas) { const k = categoria(doc, f, enlazado)?.id ?? null; cuenta.set(k, (cuenta.get(k) || 0) + 1); }
  return [...base.map(e => ({...e, n: cuenta.get(e.id) || 0})), {id: null, nombre: 'Sin dato', color: '#ffffff', n: cuenta.get(null) || 0}];
}

// ---------- Edición ----------
export function nuevoLevantamiento({name, author, purpose, columnas, grupo = null, etiquetaNivel = null}, level, docId, at = new Date().toISOString()) {
  const vista = columnas.some(c => c.tipo === 'estado') ? VISTA_LISTO : columnas.find(c => c.tipo !== 'texto')?.id;
  return validarLevantamiento({schema: 3, tipo: 'levantamiento', specialty: 'architecture', id: docId, level, grupo, etiquetaNivel,
    name: String(name ?? '').trim(), author: String(author ?? '').trim(), purpose: String(purpose ?? '').trim(), color: LISTO.listo.color,
    columnas, vista: vista ?? VISTA_LISTO, filas: [], createdAt: at, updatedAt: at, version: 1});
}
// Cambia un valor; una fila nueva entra con el nombre del recinto del plano.
export function fijarValor(doc, room, columnaId, v) {
  const c = doc.columnas.find(c => c.id === columnaId); if (!c) throw Error('Columna inexistente.');
  if (c.tipo === 'texto' ? typeof v !== 'string' : v != null && !opcion(c, v)) throw Error('Valor inválido.');
  const existe = doc.filas.some(f => f.code === room.code);
  const filas = existe ? doc.filas.map(f => f.code !== room.code ? f : {...f, valores: limpiar({...f.valores, [columnaId]: v})}) : [...doc.filas, {code: room.code, name: room.name || '', valores: limpiar({[columnaId]: v})}];
  return validarLevantamiento({...doc, filas});
}
const limpiar = valores => Object.fromEntries(Object.entries(valores).filter(([, v]) => v != null && v !== ''));
export const quitarFila = (doc, code) => validarLevantamiento({...doc, filas: doc.filas.filter(f => f.code !== code)});
// Cambia columnas: los valores de opciones o columnas eliminadas se descartan; la vista vuelve a «Listo» si su columna sale.
export function fijarColumnas(doc, columnas) {
  const porId = new Map(columnas.map(c => [c.id, c]));
  const filas = doc.filas.map(f => ({...f, valores: Object.fromEntries(Object.entries(f.valores).filter(([k, v]) => { const c = porId.get(k); return c && (c.tipo === 'texto' ? typeof v === 'string' : opcion(c, v)); }))}));
  const vista = columnas.some(c => c.id === doc.vista && c.tipo !== 'texto') ? doc.vista : columnas.some(c => c.tipo === 'estado') ? VISTA_LISTO : columnas.find(c => c.tipo !== 'texto')?.id ?? VISTA_LISTO;
  return validarLevantamiento({...doc, columnas, filas, vista});
}

// ---------- Importación ----------
// Propuesta de columnas a partir de la planilla (filas como arreglos; la primera con 3 o más celdas es el encabezado).
// Reconoce Nivel y Código de recinto; una columna con pocos valores que se repiten pasa a lista (a estado si su nombre
// empieza con Estatus/Estado o sus valores son de instalación), con las variantes de escritura unidas; el resto, a texto.
export function proponer(aoa) {
  const cab = aoa.findIndex(f => f.filter(v => String(v ?? '').trim()).length >= 3);
  if (cab < 0) throw Error('No se encontró la fila de encabezados.');
  const encabezado = aoa[cab].map(v => String(v ?? '').trim()), datos = aoa.slice(cab + 1).filter(f => f.some(v => String(v ?? '').trim()));
  if (!datos.length) throw Error('La planilla no tiene filas de datos.');
  const indiceNivel = encabezado.findIndex(h => /^(nivel|piso)$/i.test(clave(h)));
  const indiceCodigo = encabezado.findIndex(h => /codigo|cod\.? de recinto|^recinto$/.test(clave(h)));
  if (indiceCodigo < 0) throw Error('Falta la columna «Código de recinto».');
  const columnas = [];
  encabezado.forEach((nombre, i) => {
    if (i === indiceNivel || i === indiceCodigo || !nombre) return;
    const grupos = new Map();
    for (const f of datos) { const v = String(f[i] ?? '').trim(); if (!v) continue; const k = clave(v); const g = grupos.get(k) || {k, total: 0, formas: new Map()}; g.total++; g.formas.set(v, (g.formas.get(v) || 0) + 1); grupos.set(k, g); }
    const lista = [...grupos.values()].sort((a, b) => b.total - a.total), llenas = lista.reduce((s, g) => s + g.total, 0);
    const instalacion = lista.some(g => /instalado|terminado|listo|conforme|aplica/.test(g.k));
    const repetida = lista.length && lista.length <= 12 && llenas / lista.length >= 3;
    const tipo = repetida && (/^(estatus|estado)\b/.test(clave(nombre)) || instalacion) ? 'estado' : repetida ? 'lista' : 'texto';
    const col = {origen: i, id: id('c', columnas.length), nombre, tipo};
    if (tipo !== 'texto') {
      let pendientes = 0;
      // Nombre de cada opción: la forma más usada, prefiriendo «Instalado» a «Instalada» cuando se unieron ambas.
      col.opciones = lista.map((g, j) => {
        const nombreOp = oracion([...g.formas.entries()].sort((a, b) => /ada\b/i.test(a[0]) - /ada\b/i.test(b[0]) || b[1] - a[1])[0][0]);
        const final = tipo === 'estado' && /^(instalado|terminado|listo|conforme|aprobado|ok)$/.test(g.k), noAplica = tipo === 'estado' && /^no aplica|^n\/?a$/.test(g.k);
        const c = tipo === 'lista' ? PALETA[j % PALETA.length] : final ? '#2e9e5b' : noAplica ? '#9aa3ad' : ['#c26a00', '#c21f1f', '#7a4fa3'][Math.min(2, pendientes++)];
        return {id: id('o', j), nombre: nombreOp, color: c, ...(final ? {final: true} : {}), ...(noAplica ? {noAplica: true} : {}), claves: [g.k]};
      });
      if (tipo === 'estado' && !col.opciones.some(o => o.final)) col.opciones[0].final = true;
      // Estados en orden de botonera: el final primero, luego los pendientes y al final «no aplica».
      if (tipo === 'estado') col.opciones.sort((a, b) => (b.final ? 2 : 0) - (a.final ? 2 : 0) || (a.noAplica ? 1 : 0) - (b.noAplica ? 1 : 0));
      const k = clave(nombre); col.enlace = tipo === 'estado' ? (/pavimento|piso\b/.test(k) ? 'PAV' : /cielo/.test(k) ? 'CIE' : /pintura|muro/.test(k) ? 'MUROS' : null) : null;
    }
    columnas.push(col);
  });
  const niveles = indiceNivel < 0 ? [] : [...new Set(datos.map(f => String(f[indiceNivel] ?? '').trim()).filter(Boolean))];
  return {encabezado, indiceNivel, indiceCodigo, columnas, niveles, filas: datos.length, datos};
}
// Libro con varias hojas ([{nombre, aoa}]): se importa la primera que tenga encabezados con código de recinto y datos,
// aunque antes haya hojas de apoyo (tablas de códigos, listas). Si ninguna sirve, explica por qué falló cada una.
export function proponerLibro(hojas) {
  const fallas = [];
  for (const h of hojas) {
    try { return {...proponer(h.aoa), hoja: h.nombre}; }
    catch (failure) { fallas.push(hojas.length > 1 ? `«${h.nombre}»: ${failure.message}` : failure.message); }
  }
  throw Error(fallas.length > 1 ? 'Ninguna hoja se puede importar. ' + fallas.join(' ') : fallas[0] || 'La planilla no tiene datos.');
}
// Documentos (uno por piso) desde la propuesta ya ajustada. pisoActual: piso de destino si la planilla no trae Nivel.
// Devuelve también lo que no se pudo ubicar (nivel desconocido, código vacío o repetido en el mismo piso).
export function construir(propuesta, {name, author, purpose, pisoActual, grupo, ids, at = new Date().toISOString()}) {
  const columnas = propuesta.columnas.map(({origen, claves, ...c}) => ({...c, ...(c.opciones ? {opciones: c.opciones.map(({claves, ...o}) => o)} : {}), enlace: c.enlace ?? null}));
  const porPiso = new Map(), avisos = [];
  for (const f of propuesta.datos) {
    const etiqueta = propuesta.indiceNivel < 0 ? null : String(f[propuesta.indiceNivel] ?? '').trim();
    const piso = etiqueta == null ? pisoActual : pisoDe(etiqueta), code = String(f[propuesta.indiceCodigo] ?? '').trim();
    if (!piso) { avisos.push(`Nivel desconocido «${etiqueta}» (${code || 'sin código'}).`); continue; }
    if (!code) { avisos.push('Fila sin código de recinto.'); continue; }
    const p = porPiso.get(piso) || {etiqueta, filas: new Map()}; porPiso.set(piso, p);
    if (p.filas.has(code)) { avisos.push(`${code} repetido en ${etiqueta || piso}: se conserva la primera fila.`); continue; }
    const valores = {};
    for (const c of propuesta.columnas) {
      const v = String(f[c.origen] ?? '').trim(); if (!v) continue;
      if (c.tipo === 'texto') { valores[c.id] = v.slice(0, 2000); continue; }
      const o = c.opciones.find(o => (o.claves || [clave(o.nombre)]).includes(clave(v)) || clave(o.nombre) === clave(v)); if (o) valores[c.id] = o.id;
    }
    const nombreCol = propuesta.columnas.find(c => c.tipo === 'texto' && /tipo de recinto|nombre|recinto/.test(clave(c.nombre)));
    p.filas.set(code, {code, name: nombreCol ? String(f[nombreCol.origen] ?? '').trim().slice(0, 500) : '', valores});
  }
  const docs = [...porPiso.entries()].map(([piso, p], i) => {
    const d = nuevoLevantamiento({name, author, purpose, columnas, grupo, etiquetaNivel: p.etiqueta}, piso, ids[i] || grupo + '-' + piso, at);
    return validarLevantamiento({...d, filas: [...p.filas.values()]});
  });
  return {docs, avisos};
}

// ---------- Exportación ----------
// Filas para Excel con los encabezados del levantamiento: Nivel, Código de recinto y cada columna con su valor vigente
// (los enlazados, desde el rombo de su piso). enlazados: {piso: enlazado}.
export function exportar(docs, enlazados = {}) {
  const base = docs[0]; if (!base) throw Error('No hay levantamiento que exportar.');
  const orden = Object.keys(PISOS), ds = [...docs].sort((a, b) => orden.indexOf(a.level) - orden.indexOf(b.level));
  const encabezado = ['Nivel', 'Código de Recinto', ...base.columnas.map(c => c.nombre), 'Listo para instalar'];
  const filas = ds.flatMap(d => d.filas.map(f => [d.etiquetaNivel || d.level, f.code, ...base.columnas.map(c0 => {
    const c = d.columnas.find(x => x.id === c0.id) || c0; if (c.tipo === 'texto') return f.valores[c.id] || '';
    return opcion(c, valor(c, f, enlazados[d.level] || null).id)?.nombre || '';
  }), {listo: 'Sí', pendiente: 'No'}[listo(d, f, enlazados[d.level] || null)] || '']));
  return [encabezado, ...filas];
}
