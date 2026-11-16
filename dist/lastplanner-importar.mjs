// Carga de actividades de Last Planner en lote desde un Excel de planificación (oficina técnica, escritorio).
// Cada fila es una actividad: se revisa antes de guardar (campos, piso, códigos de recinto) y se marca la que ya venció
// para reprogramarla; nada se guarda sin que la persona confirme. Crea los mismos borradores que «Nueva actividad»:
// recinto completo como ubicación (las superficies se definen después en la actividad) y un tramo por semana ISO, con la
// cantidad repartida según los días de cada tramo. Sin DOM: lo prueba lastplanner-importar-test.mjs.
import {weeksForDates} from './lastplanner-cycle-model.mjs';
import {progressFloor} from './progress-scope.mjs';

// Columnas de la plantilla y los encabezados que se aceptan para cada una (sin tildes ni mayúsculas).
export const COLUMNAS = [
  {id: 'actividad', titulo: 'Actividad', nombres: ['actividad', 'tarea', 'partida', 'descripcion'], obligatoria: true},
  {id: 'piso', titulo: 'Piso', nombres: ['piso', 'nivel'], obligatoria: true},
  {id: 'recintos', titulo: 'Recintos', nombres: ['recintos', 'recinto', 'codigos', 'codigo', 'codigo recinto', 'codigos de recinto'], obligatoria: true},
  {id: 'responsable', titulo: 'Responsable', nombres: ['responsable', 'encargado', 'jefe'], obligatoria: true},
  {id: 'inicio', titulo: 'Inicio', nombres: ['inicio', 'fecha inicio', 'inicio plan', 'comienzo'], obligatoria: true},
  {id: 'fin', titulo: 'Término', nombres: ['termino', 'fin', 'fecha termino', 'fecha fin', 'termino plan'], obligatoria: true},
  {id: 'cantidad', titulo: 'Cantidad', nombres: ['cantidad', 'cant'], obligatoria: true},
  {id: 'unidad', titulo: 'Unidad', nombres: ['unidad', 'un', 'ud'], obligatoria: true},
  {id: 'especialidad', titulo: 'Especialidad', nombres: ['especialidad', 'disciplina'], obligatoria: false},
  {id: 'contratista', titulo: 'Contratista', nombres: ['contratista', 'subcontrato', 'empresa'], obligatoria: false},
  {id: 'frente', titulo: 'Frente de trabajo', nombres: ['frente', 'frente de trabajo'], obligatoria: false}
];
export const MAX_FILAS = 500;

const llano = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

// Encabezado de la planilla → id de columna. Lo que no se reconoce se ignora.
export function mapearEncabezados(encabezados) {
  const mapa = {};
  encabezados.forEach((h, i) => { const n = llano(h), c = COLUMNAS.find(c => c.nombres.includes(n)); if (c && mapa[c.id] === undefined) mapa[c.id] = i; });
  return mapa;
}

const iso = (y, m, d) => { const f = new Date(Date.UTC(y, m - 1, d)); return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f.toISOString().slice(0, 10) : null; };
// Fecha de Excel: objeto Date, número de serie, «dd-mm-aaaa», «dd/mm/aaaa» o «aaaa-mm-dd».
export function leerFecha(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) { const f = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return f.toISOString().slice(0, 10); }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); if (m) return iso(+m[3], +m[2], +m[1]);
  return null;
}
const leerNumero = v => typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
// «Piso 4», «Nivel 4», «N04», «4» → N04; «-1», «Nivel -1», «S01» → N-1.
export function leerPiso(v) { const s = String(v ?? '').toUpperCase().replace(/PISO|NIVEL/g, '').replace(/−/g, '-').replace(/\s+/g, '').trim(); return progressFloor(s); }
const sumarDias = (fecha, n) => new Date(Date.parse(fecha) + n * 864e5).toISOString().slice(0, 10);
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;

// filas: arreglo de arreglos (la primera es el encabezado). recintoDe(código) → recinto del piso activo o null.
// Devuelve una revisión por fila: datos leídos, errores (impiden guardar), si está atrasada y si es de otro piso.
export function revisarPlanilla(filas, {piso, hoy, recintoDe}) {
  if (!Array.isArray(filas) || filas.length < 2) throw Error('La planilla no tiene filas bajo el encabezado.');
  const mapa = mapearEncabezados(filas[0]), faltan = COLUMNAS.filter(c => c.obligatoria && mapa[c.id] === undefined).map(c => c.titulo);
  if (faltan.length) throw Error('Faltan columnas en la planilla: ' + faltan.join(', ') + '. Descarga la plantilla para ver el formato.');
  const cuerpo = filas.slice(1).map((f, i) => ({f, n: i + 2})).filter(({f}) => f.some(c => String(c ?? '').trim()));
  if (cuerpo.length > MAX_FILAS) throw Error(`La planilla tiene ${cuerpo.length} actividades; carga hasta ${MAX_FILAS} por vez.`);
  return cuerpo.map(({f, n}) => {
    const v = id => mapa[id] === undefined ? '' : f[mapa[id]], texto = id => String(v(id) ?? '').trim();
    const datos = {actividad: texto('actividad'), responsable: texto('responsable'), especialidad: texto('especialidad'), contratista: texto('contratista'), frente: texto('frente'), unidad: texto('unidad'),
      piso: leerPiso(v('piso')), inicio: leerFecha(v('inicio')), fin: leerFecha(v('fin')), cantidad: leerNumero(v('cantidad')), codigos: [...new Set(texto('recintos').split(/[,;\n]+/).map(c => c.trim()).filter(Boolean))]};
    const errores = [];
    if (!datos.actividad) errores.push('Falta la actividad.');
    if (!datos.responsable) errores.push('Falta el responsable.');
    if (!datos.piso) errores.push('Piso no reconocido: «' + texto('piso') + '».');
    if (!datos.inicio || !datos.fin) errores.push('Fecha de inicio o término no válida.');
    else if (datos.fin < datos.inicio) errores.push('El término es anterior al inicio.');
    else if (dias(datos.inicio, datos.fin) > 366) errores.push('La actividad dura más de un año: divídela.');
    if (!(datos.cantidad > 0)) errores.push('La cantidad debe ser un número mayor que cero.');
    if (!datos.unidad) errores.push('Falta la unidad.');
    if (!datos.codigos.length) errores.push('Falta al menos un código de recinto.');
    const otroPiso = !!datos.piso && datos.piso !== piso;
    const recintos = otroPiso ? [] : datos.codigos.map(c => ({codigo: c, recinto: recintoDe(c)}));
    const noHallados = recintos.filter(r => !r.recinto).map(r => r.codigo);
    if (noHallados.length) errores.push('Recintos que no están en este piso: ' + noHallados.join(', ') + '.');
    const atrasada = !errores.length && !otroPiso && datos.fin < hoy;
    return {fila: n, datos, recintos: recintos.filter(r => r.recinto).map(r => r.recinto), errores, otroPiso, atrasada};
  });
}

// Reprogramar una fila atrasada: empieza hoy y conserva su duración en días.
export function reprogramar(datos, hoy) { const d = dias(datos.inicio, datos.fin); return {...datos, inicio: hoy, fin: sumarDias(hoy, d - 1)}; }

// Reparte la cantidad entre los tramos semanales según los días de cada uno; la suma es exacta.
export function repartir(cantidad, inicio, fin) {
  const tramos = weeksForDates(inicio, fin);
  if (tramos.length === 1) return [];
  const total = dias(inicio, fin), partes = tramos.map(t => Math.round(cantidad * dias(t.inicioPlan, t.finPlan) / total * 1e6) / 1e6);
  partes[partes.length - 1] = Math.round((cantidad - partes.slice(0, -1).reduce((s, n) => s + n, 0)) * 1e6) / 1e6;
  if (partes.some(n => !(n > 0))) throw Error('No se pudo repartir la cantidad entre las semanas.');
  return partes;
}

// Valores de «Nueva actividad» para una fila revisada. fuente(recinto) → {id, sha256, revision} de su lámina, o null.
export function valoresDeFila(revision, {fuente = () => null} = {}) {
  const d = revision.datos;
  const alcances = revision.recintos.map(r => { const s = fuente(r); return {id: r.id + '|location|0', roomId: r.id, code: r.code, name: r.name, tipo: 'recinto', geometry: null, locationOnly: true, label: 'Pendiente de definir superficies', measurement: null, level: r.level, ...(s ? {source: {id: s.id, sha256: s.sha256, revision: s.revision}} : {})}; });
  return {planificacion: null, actividad: d.actividad, responsable: d.responsable, especialidad: d.especialidad, contratista: d.contratista, inicioPlan: d.inicio, finPlan: d.fin, cantidad: d.cantidad, unidad: d.unidad,
    dotacion: null, rendimientoPlan: null, level: d.piso, sector: null, frente: d.frente || null, notas: 'Cargada desde planilla (fila ' + revision.fila + ').', origenCantidad: 'manual',
    alcances, recintos: revision.recintos.map(r => ({id: r.id, code: r.code, name: r.name}))};
}

// Plantilla para descargar: encabezados y una fila de ejemplo.
export const plantilla = () => [COLUMNAS.map(c => c.titulo), ['Tabiquería sector A', 'N04', '10.1.1.1.5-1, 10.1.1.1.6-1', 'Jefe de terreno', '16-11-2026', '20-11-2026', 120, 'm²', 'Arquitectura', 'Subcontrato', 'Ala norte']];
