// Puertas de un piso y Proyecto tipo Puertas. Sin DOM: lo prueba puertas-test.mjs.
// - El catálogo (dist/<piso>/puertas.json) sale del plano de avance de instalación (scripts/puertas/importar-dwg.mjs):
//   llave, modelo, ancho, código de partida, número de vano, contratista y el estado que marca el plano.
// - El proyecto guarda solo lo que se cambia en terreno, puerta por puerta, con quién y cuándo. Lo demás sigue lo que
//   dice el plano. Se guarda y sincroniza como cualquier proyecto (tipo «proyecto» en la nube, sin cambios en Supabase).
import {descripcionDe} from './puertas-modelos.mjs';
export const ESTADOS = {
  no_instalada: {nombre: 'No instalada', color: '#c0392b'},
  revisar: {nombre: 'Revisar', color: '#b54708'},
  instalada: {nombre: 'Instalada', color: '#1a7f37'},
  sin_registro: {nombre: 'Sin registro en el plano', color: '#8c8c8c'}
};
export const ORDEN = ['no_instalada', 'revisar', 'instalada', 'sin_registro'];
// «Pletinas instaladas» se quitó (11-11-2026): las pletinas no son la puerta, así que esas puertas siguen «No instaladas».
// Vale para lo que trae el plano de avance (capa «PROTEGO - PLETINAS») y para lo marcado así antes en terreno.
const LEGADO = {pletinas: 'no_instalada'};
export const estadoVigente = estado => LEGADO[estado] || estado;
// Contratista: solo su nombre. Teisa y Protego vienen de las capas del plano de avance; Grupsa (PI05a) y Retec (PAS3) se
// asignan por modelo porque el plano no los marca. Los demás modelos quedan sin contratista hasta que se sepa.
export const CONTRATISTAS = {Teisa: 'Teisa', Protego: 'Protego', Grupsa: 'Grupsa', Retec: 'Retec'};
export const CONTRATISTA_POR_MODELO = {PI05a: 'Grupsa', PAS3: 'Retec'};
export const SIN_CONTRATISTA = '__sin';
export const contratistaDe = p => p?.contratista || CONTRATISTA_POR_MODELO[p?.modelo] || null;
// Estados que se pueden marcar en terreno, según quién instala la puerta. «Revisar» es la marca propia de Teisa.
export const opcionesDe = p => contratistaDe(p) === 'Teisa' ? ['no_instalada', 'instalada', 'revisar'] : ['no_instalada', 'instalada'];
// Catálogo tal como sale del DWG → como se usa: estado vigente y contratista por modelo. Las capas originales quedan en
// p.capas. No cambia el objeto recibido.
export function prepararCatalogo(c) {
  if (!c || !Array.isArray(c.puertas)) return c;
  return {...c, puertas: c.puertas.map(({pletinas, ...p}) => ({...p, estado: estadoVigente(p.estado), contratista: contratistaDe(p)}))};
}
export const esPuertas = doc => doc?.schema === 3 && doc.tipo === 'puertas';
const texto = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

export function validarCatalogo(original) {
  const c = prepararCatalogo(original);
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
    if (!texto(id, 100) || !ESTADOS[estadoVigente(f?.estado)] || f.estado === 'sin_registro') throw Error('Puerta con un estado que no se puede marcar: ' + id + '.');
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
export const estadoDe = (p, doc = null) => estadoVigente(doc?.filas?.[p.id]?.estado || p.estado);
export const cambioDe = (p, doc = null) => doc?.filas?.[p.id] || null;

export function marcarPuerta(doc, puerta, estado, {autor, at = new Date().toISOString(), nota = null} = {}) {
  if (!opcionesDe(puerta).includes(estado)) throw Error('Ese estado no aplica a esta puerta.');
  if (!texto(autor, 160)) throw Error('Inicia sesión en Atlas para registrar el cambio.');
  return validarPuertas({...doc, filas: {...doc.filas, [puerta.id]: {estado, at, autor, ...(nota ? {nota} : {})}}});
}
// Deshacer del pincel: deja la puerta como estaba antes (previo = su fila anterior, o null si seguía al plano).
export function restaurarPuerta(doc, id, previo) {
  const filas = {...doc.filas};
  if (previo) filas[id] = previo; else delete filas[id];
  return validarPuertas({...doc, filas});
}

// Busca por llave, modelo, descripción del modelo, vano, código de partida o contratista. Varias palabras: todas deben aparecer.
const normal = s => String(s || '').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');
export function filtrar(puertas, {texto: q = '', estados = null, contratista = '', doc = null} = {}) {
  const palabras = normal(q).split(/\s+/).filter(Boolean);
  return puertas.filter(p => (!estados || estados.has(estadoDe(p, doc))) && (!contratista || (contratista === SIN_CONTRATISTA ? !contratistaDe(p) : contratistaDe(p) === contratista))
    && palabras.every(w => normal([p.llave, p.modelo, descripcionDe(p.modelo), p.vano ? 'vano ' + p.vano : '', p.partida, contratistaDe(p)].join(' ')).includes(w)));
}
export function contar(puertas, doc = null) {
  const n = Object.fromEntries(ORDEN.map(e => [e, 0]));
  for (const p of puertas) n[estadoDe(p, doc)]++;
  return n;
}
// Orden de la lista: vano (número) y después llave.
export const ordenLista = (a, b) => (parseInt(a.vano) || 1e6) - (parseInt(b.vano) || 1e6) || String(a.llave || a.id).localeCompare(String(b.llave || b.id), 'es', {numeric: true});

export const ENCABEZADOS = ['Vano', 'Llave', 'Modelo', 'Descripción del modelo', 'Ancho', 'Código de partida', 'Contratista', 'Estado', 'Estado en el plano', 'Cambiado el', 'Por', 'Revisar'];
export function filasExcel(catalogo, doc = null) {
  return [...catalogo.puertas].sort(ordenLista).map(p => {
    const c = cambioDe(p, doc);
    return [p.vano || '', p.llave || '', p.modelo || '', descripcionDe(p.modelo), p.ancho || '', p.partida || '', contratistaDe(p) || '', ESTADOS[estadoDe(p, doc)].nombre, ESTADOS[estadoVigente(p.estado)].nombre, c ? c.at.slice(0, 10).split('-').reverse().join('-') : '', c?.autor || '', (p.revisar || []).join('; ')];
  });
}
