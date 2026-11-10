// Puertas de un piso y Proyecto tipo Puertas. Sin DOM: lo prueba puertas-test.mjs.
// - El catálogo (dist/<piso>/puertas.json) sale del plano de avance de instalación (scripts/puertas/importar-dwg.mjs):
//   llave, modelo, ancho, código de partida, número de vano, contratista y el estado que marca el plano.
// - El proyecto guarda solo lo que se cambia en terreno, puerta por puerta, con quién y cuándo. Lo demás sigue lo que
//   dice el plano. Se guarda y sincroniza como cualquier proyecto (tipo «proyecto» en la nube, sin cambios en Supabase).
export const ESTADOS = {
  no_instalada: {nombre: 'No instalada', color: '#c0392b'},
  pletinas: {nombre: 'Pletinas instaladas', color: '#a3229d'},
  revisar: {nombre: 'Revisar', color: '#b54708'},
  instalada: {nombre: 'Instalada', color: '#1a7f37'},
  sin_registro: {nombre: 'Sin registro en el plano', color: '#8c8c8c'}
};
export const ORDEN = ['no_instalada', 'pletinas', 'revisar', 'instalada', 'sin_registro'];
export const CONTRATISTAS = {Teisa: 'Teisa · puertas de madera', Protego: 'Protego · cortafuego y metálicas'};
// Estados que se pueden marcar en terreno, según quién instala la puerta.
export const opcionesDe = p => p.contratista === 'Protego' ? ['no_instalada', 'pletinas', 'instalada'] : p.contratista === 'Teisa' ? ['no_instalada', 'instalada', 'revisar'] : ['no_instalada', 'instalada'];
export const esPuertas = doc => doc?.schema === 3 && doc.tipo === 'puertas';
const texto = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

export function validarCatalogo(c) {
  if (!c || c.schema !== 1 || !texto(c.nivel, 30) || !Array.isArray(c.puertas) || !c.fuente || !/^[a-f0-9]{64}$/.test(c.fuente.sha256 || '')) throw Error('Plano de puertas inválido.');
  const ids = new Set();
  for (const p of c.puertas) {
    if (!texto(p.id, 100) || ids.has(p.id) || !ESTADOS[p.estado] || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw Error('Puerta inválida en el plano: ' + (p?.id || '?') + '.');
    ids.add(p.id);
  }
  return c;
}

export function validarPuertas(doc) {
  if (!esPuertas(doc) || doc.specialty !== 'architecture' || !texto(doc.id, 100) || !texto(doc.level, 30)) throw Error('Proyecto de puertas inválido.');
  for (const [k, n, max] of [['name', 'Nombre', 160], ['author', 'Quién lo realizó', 160], ['purpose', 'Para qué es', 2000]]) if (!texto(doc[k], max)) throw Error(n + ': completa este campo obligatorio.');
  if (!/^#[a-f0-9]{6}$/i.test(doc.color || '') || !Number.isSafeInteger(doc.version) || doc.version < 1) throw Error('Versión o color inválido.');
  if (![doc.createdAt, doc.updatedAt].every(at => typeof at === 'string' && Number.isFinite(Date.parse(at)))) throw Error('Fecha inválida.');
  if (!doc.fuente || !texto(doc.fuente.archivo, 200) || !/^[a-f0-9]{64}$/.test(doc.fuente.sha256 || '')) throw Error('Fuente del plano de puertas inválida.');
  if (!doc.filas || typeof doc.filas !== 'object' || Array.isArray(doc.filas) || Object.keys(doc.filas).length > 5000) throw Error('Filas de puertas inválidas.');
  for (const [id, f] of Object.entries(doc.filas)) {
    if (!texto(id, 100) || !ESTADOS[f?.estado] || f.estado === 'sin_registro') throw Error('Puerta con un estado que no se puede marcar: ' + id + '.');
    if (!Number.isFinite(Date.parse(f.at)) || typeof f.autor !== 'string' || f.autor.length > 160) throw Error('Cambio de puerta sin fecha o autor: ' + id + '.');
    if (f.nota != null && (typeof f.nota !== 'string' || f.nota.length > 500)) throw Error('Nota demasiado larga en ' + id + '.');
  }
  return doc;
}

export function nuevoProyectoPuertas(valores, catalogo, level, id, at = new Date().toISOString()) {
  return validarPuertas({schema: 3, tipo: 'puertas', specialty: 'architecture', id, level,
    name: String(valores.name ?? '').trim(), author: String(valores.author ?? '').trim(), purpose: String(valores.purpose ?? '').trim(), color: '#0f5499',
    fuente: {archivo: catalogo.fuente.archivo, sha256: catalogo.fuente.sha256, modificado: catalogo.fuente.modificado || null},
    filas: {}, createdAt: at, updatedAt: at, version: 1});
}

// Estado vigente: lo marcado en el proyecto o, si nadie lo cambió, lo que dice el plano.
export const estadoDe = (p, doc = null) => doc?.filas?.[p.id]?.estado || p.estado;
export const cambioDe = (p, doc = null) => doc?.filas?.[p.id] || null;

export function marcarPuerta(doc, puerta, estado, {autor, at = new Date().toISOString(), nota = null} = {}) {
  if (!opcionesDe(puerta).includes(estado)) throw Error('Ese estado no aplica a esta puerta.');
  if (!texto(autor, 160)) throw Error('Inicia sesión en Atlas para registrar el cambio.');
  return validarPuertas({...doc, filas: {...doc.filas, [puerta.id]: {estado, at, autor, ...(nota ? {nota} : {})}}});
}

// Busca por llave, modelo, vano, código de partida o contratista. Varias palabras: todas deben aparecer.
const normal = s => String(s || '').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');
export function filtrar(puertas, {texto: q = '', estados = null, contratista = '', doc = null} = {}) {
  const palabras = normal(q).split(/\s+/).filter(Boolean);
  return puertas.filter(p => (!estados || estados.has(estadoDe(p, doc))) && (!contratista || (p.contratista || '') === contratista)
    && palabras.every(w => normal([p.llave, p.modelo, p.vano ? 'vano ' + p.vano : '', p.partida, p.contratista].join(' ')).includes(w)));
}
export function contar(puertas, doc = null) {
  const n = Object.fromEntries(ORDEN.map(e => [e, 0]));
  for (const p of puertas) n[estadoDe(p, doc)]++;
  return n;
}
// Orden de la lista: vano (número) y después llave.
export const ordenLista = (a, b) => (parseInt(a.vano) || 1e6) - (parseInt(b.vano) || 1e6) || String(a.llave || a.id).localeCompare(String(b.llave || b.id), 'es', {numeric: true});

export const ENCABEZADOS = ['Vano', 'Llave', 'Modelo', 'Ancho', 'Código de partida', 'Contratista', 'Estado', 'Estado en el plano', 'Pletinas', 'Cambiado el', 'Por', 'Revisar'];
export function filasExcel(catalogo, doc = null) {
  return [...catalogo.puertas].sort(ordenLista).map(p => {
    const c = cambioDe(p, doc);
    return [p.vano || '', p.llave || '', p.modelo || '', p.ancho || '', p.partida || '', p.contratista || '', ESTADOS[estadoDe(p, doc)].nombre, ESTADOS[p.estado].nombre, p.pletinas ? 'Sí' : '', c ? c.at.slice(0, 10).split('-').reverse().join('-') : '', c?.autor || '', (p.revisar || []).join('; ')];
  });
}
