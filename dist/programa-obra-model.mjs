// Programa de obra de Sacyr (MS Project) en Atlas: base del nivel maestro de Last Planner y de la línea programada del avance.
// El programa es general de toda la obra y se ordena partida → módulo → piso: «6.4.1 Pinturas en paramentos verticales →
// MÓDULO A → 2°Piso». Atlas lo invierte a piso → partida y se queda con las tareas del Módulo A que caen en sus pisos.
// Debajo del piso el programa no tiene sectores ni recintos: Planificación lo refina en ventanas por sector (ventanasPorSector).
// Se lee el XML que guarda Project (Archivo › Guardar como › XML), solo la sección <Tasks>: los recursos traen montos y no se
// leen. Project no escribe en el XML las tareas externas (las del subprograma de notas de cambio enlazadas al general), así
// que el subprograma queda fuera, como se decidió. El código de cada partida es el campo Texto1 de Project (código EETT, el mismo de las partidas de Atlas).
// Sin DOM: lo prueba programa-obra-test.mjs.

export const MODULOS = ['A']; // módulos del programa que tienen planos en Atlas (edificio hospitalario)
export const SEMANAS_ADELANTE = 6; // ventana del plan intermedio (lookahead)
const TEXTO1 = '188743731'; // FieldID de Texto1 en el XML de Project
const DIA = 864e5;

const llano = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fecha = v => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? '')); return m ? m[1] : null; };
const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
export const dias = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DIA);
export const sumarDias = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * DIA).toISOString().slice(0, 10);
const CODIGO = /^\d+(\.\d+)+$/;
export const esCodigo = c => CODIGO.test(String(c ?? ''));
// a es b o una partida dentro de b («6.4.1.2» está en «6.4.1»).
export const dentroDe = (a, b) => a === b || String(a).startsWith(b + '.');

// Piso del programa → piso de Atlas. «1°Subterráneo» es el −1 (S01); «2°Piso», el N02. Los demás subterráneos y la
// cubierta no están en Atlas.
export function pisoAtlas(nombre) {
  const n = llano(String(nombre ?? '').replace(/\([^)]*\)/g, '')); // «1°Subterráneo (Remanente)»
  if (n === '1SUBTERRANEO' || n === 'NIVELSUBTERRANEO1') return 'N-1';
  const m = /^(?:([1-9])PISO|NIVEL([1-9]))$/.exec(n);
  return m ? 'N0' + (m[1] || m[2]) : null;
}
// «MÓDULO A» o «MÓDULO A (ED.PRINCIPAL)» → 'A'. «MÓDULO DE EXPANSIÓN…» (control centralizado) no es un módulo del edificio.
export function moduloDe(nombre) { const m = /^MODULO([A-D])(EDPRINCIPAL)?$/.exec(llano(nombre)); return m ? m[1] : null; }

// ---------- Lectura del XML de Project ----------
const ENTIDADES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
const decodificar = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (t, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e] ?? t);
const campo = (xml, tag) => { const m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(xml); return m ? decodificar(m[1].trim()) : ''; };
// Bloques anidados de una tarea que repiten etiquetas (Start, Finish…): se quitan antes de leer los campos propios.
const ANIDADOS = /<(Baseline|PredecessorLink|TimephasedData|ExtendedAttribute|OutlineCode)>[\s\S]*?<\/\1>/g;

// Cabecera del proyecto (lo que va antes de <Tasks>): nombre, fecha de estado y qué FieldID es Texto1.
export function leerCabecera(xml) {
  const antes = xml.split('<Tasks>')[0], sinCal = antes.replace(/<Calendars>[\s\S]*?<\/Calendars>/, '').replace(/<ExtendedAttributes>[\s\S]*?<\/ExtendedAttributes>/, '');
  let texto1 = TEXTO1;
  for (const [, def] of antes.matchAll(/<ExtendedAttribute>([\s\S]*?)<\/ExtendedAttribute>/g)) if (campo(def, 'FieldName') === 'Text1' && campo(def, 'FieldID')) texto1 = campo(def, 'FieldID');
  return {nombre: campo(sinCal, 'Name'), titulo: campo(sinCal, 'Title'), estado: fecha(campo(sinCal, 'StatusDate')), guardado: campo(sinCal, 'LastSaved') || null, texto1};
}
// Una tarea del XML: <Task>…</Task>.
// Línea base 1 (la original del contrato, la que usa el plan del RMP): inicio, fin y costo de la tarea. El costo solo sirve
// para el peso relativo de cada partida (programaPorPiso): no se guarda ningún monto.
export const LINEA_BASE = '1';
export function leerTarea(bloque, texto1 = TEXTO1) {
  const propio = bloque.replace(ANIDADOS, ''), extra = {};
  for (const [, ea] of bloque.matchAll(/<ExtendedAttribute>([\s\S]*?)<\/ExtendedAttribute>/g)) extra[campo(ea, 'FieldID')] = campo(ea, 'Value');
  let base = null;
  for (const [, b] of bloque.matchAll(/<Baseline>([\s\S]*?)<\/Baseline>/g)) {
    if (campo(b, 'Number') !== LINEA_BASE) continue;
    const inicio = fecha(campo(b, 'Start')), fin = fecha(campo(b, 'Finish')), costo = Number(campo(b, 'Cost'));
    base = {inicio, fin, costo: Number.isFinite(costo) ? costo : 0};
  }
  const nivel = Number(campo(propio, 'OutlineLevel')), costo = Number(campo(propio, 'Cost'));
  return {uid: Number(campo(propio, 'UID')), nombre: campo(propio, 'Name'), esquema: campo(propio, 'OutlineNumber'), nivel: Number.isFinite(nivel) ? nivel : 0,
    inicio: fecha(campo(propio, 'Start')), fin: fecha(campo(propio, 'Finish')), resumen: campo(propio, 'Summary') === '1', hito: campo(propio, 'Milestone') === '1',
    texto1: String(extra[texto1] ?? '').trim(), base, costo: base ? base.costo : Number.isFinite(costo) ? costo : 0};
}
// XML completo en memoria (pruebas, archivos chicos).
export function leerXML(xml) {
  if (!/<Project[\s>]/.test(xml) || !xml.includes('schemas.microsoft.com/project')) throw Error('El archivo no es un XML de Project. En Project usa Archivo › Guardar como › XML.');
  const cabecera = leerCabecera(xml), cuerpo = (xml.split('<Tasks>')[1] || '').split('</Tasks>')[0];
  return {cabecera, tareas: [...cuerpo.matchAll(/<Task>([\s\S]*?)<\/Task>/g)].map(m => leerTarea(m[1], cabecera.texto1))};
}
// XML de un archivo por partes (el programa completo pesa cientos de MB): se lee hasta </Tasks> y se corta ahí.
// fuente: ReadableStream de bytes (archivo.stream()). alAvanzar(bytes) informa el avance.
export async function leerXMLPorPartes(fuente, {alAvanzar} = {}) {
  const lector = fuente.getReader(), dec = new TextDecoder('utf-8');
  let buf = '', bytes = 0, cabecera = null, tareas = [], fin = false, inicio = true;
  try {
    while (!fin) {
      const {value, done} = await lector.read();
      if (value) { bytes += value.length; buf += dec.decode(value, {stream: !done}); alAvanzar?.(bytes); }
      if (inicio && buf.length > 200) { inicio = false; if (!/<Project[\s>]/.test(buf.slice(0, 4000)) || !buf.slice(0, 4000).includes('schemas.microsoft.com/project')) throw Error('El archivo no es un XML de Project. En Project usa Archivo › Guardar como › XML.'); }
      if (!cabecera) { const i = buf.indexOf('<Tasks>'); if (i >= 0) { cabecera = leerCabecera(buf.slice(0, i + 7)); buf = buf.slice(i + 7); } else if (done) break; else continue; }
      let j;
      while ((j = buf.indexOf('</Task>')) >= 0) {
        const k = buf.lastIndexOf('<Task>', j); if (k >= 0) tareas.push(leerTarea(buf.slice(k + 6, j), cabecera.texto1));
        buf = buf.slice(j + 7);
      }
      if (buf.includes('</Tasks>')) fin = true;
      else if (done) break;
    }
  } finally { try { await lector.cancel(); } catch {} }
  if (!cabecera) throw Error('El XML no trae tareas (<Tasks>). Guárdalo de nuevo desde Project como XML.');
  return {cabecera, tareas};
}

// ---------- Del programa general a cada piso de Atlas ----------
// Tareas finales del Módulo A con piso de Atlas y código EETT (el Texto1 más cercano hacia arriba en el esquema).
// Una partida puede tener varias tareas en un piso (p. ej. pintura de cielos y su cierre): se juntan en una, con sus tramos.
export function programaPorPiso({cabecera, tareas}, {archivo = '', modulos = MODULOS} = {}) {
  const porEsquema = new Map(tareas.filter(t => t.esquema).map(t => [t.esquema, t]));
  const hijos = new Set(tareas.map(t => t.esquema.split('.').slice(0, -1).join('.')));
  const pisos = {}, fuera = {sinPiso: 0, otroModulo: 0, sinCodigo: 0}, costos = new Map();
  // Peso de cada partida del piso: su costo de línea base ÷ el costo de todas las tareas finales del programa (% de la obra).
  const finales = tareas.filter(t => t.esquema && !hijos.has(t.esquema) && !t.resumen), costoObra = finales.reduce((a, t) => a + Math.max(0, t.costo || 0), 0);
  for (const t of tareas) {
    if (!t.esquema || hijos.has(t.esquema) || t.resumen || !t.inicio || !t.fin) continue;
    const partes = t.esquema.split('.'), cadena = partes.map((_, i) => porEsquema.get(partes.slice(0, i + 1).join('.'))).filter(Boolean);
    // El código puede estar en la tarea del piso misma (obra gruesa): el nombre de la partida es el de la última tarea con
    // código que no es un piso ni un módulo.
    let modulo = null, piso = null, cod = null, nombre = '';
    for (const a of cadena) {
      const esPiso = pisoAtlas(a.nombre), esModulo = moduloDe(a.nombre);
      modulo = esModulo || modulo; piso = esPiso || piso;
      if (esCodigo(a.texto1)) { cod = a; if (!esPiso && !esModulo) nombre = a.nombre.trim(); }
    }
    if (!piso) { fuera.sinPiso++; continue; }
    if (!modulos.includes(modulo)) { fuera.otroModulo++; continue; }
    if (!cod) { fuera.sinCodigo++; continue; }
    const lista = pisos[piso] ||= new Map(), codigo = cod.texto1;
    const previa = lista.get(codigo) || {codigo, partida: nombre || cod.nombre.trim(), inicio: t.inicio, fin: t.fin, uids: [], tramos: []};
    previa.inicio = previa.inicio < t.inicio ? previa.inicio : t.inicio; previa.fin = previa.fin > t.fin ? previa.fin : t.fin;
    previa.uids.push(t.uid); previa.tramos.push([t.inicio, t.fin]);
    // Línea base 1: solo si todas las tareas de la partida la traen.
    const conBase = t.base?.inicio && t.base?.fin && (previa.uids.length === 1 || previa.inicioBase);
    if (conBase) { previa.inicioBase = previa.uids.length === 1 || t.base.inicio < previa.inicioBase ? t.base.inicio : previa.inicioBase; previa.finBase = previa.uids.length === 1 || t.base.fin > previa.finBase ? t.base.fin : previa.finBase; }
    else { delete previa.inicioBase; delete previa.finBase; }
    costos.set(previa, (costos.get(previa) || 0) + Math.max(0, t.costo || 0));
    lista.set(codigo, previa);
  }
  if (costoObra > 0) for (const [t, c] of costos) t.peso = Math.round(1e6 * 100 * c / costoObra) / 1e6;
  const revision = {archivo: String(archivo).slice(0, 200), titulo: (cabecera.titulo || cabecera.nombre || '').slice(0, 200), estado: cabecera.estado || null,
    lineaBase: tareas.some(t => t.base?.inicio) ? Number(LINEA_BASE) : null};
  const orden = (a, b) => a.codigo.split('.').map(Number).reduce((r, n, i) => r || n - (Number(b.codigo.split('.')[i]) || 0), 0) || a.codigo.length - b.codigo.length;
  return {revision, fuera, pisos: Object.fromEntries(Object.entries(pisos).map(([nivel, m]) => [nivel, {nivel, revision, tareas: [...m.values()].sort(orden)}]))};
}

// Registro de un piso como se guarda en Nube (tipo «programa», id «programa-<piso>»).
export const idPrograma = nivel => 'programa-' + nivel;
export function validarPrograma(p) {
  if (!p || !/^(N-1|N0[1-9])$/.test(p.nivel || '')) throw Error('Programa sin piso válido.');
  if (!Array.isArray(p.tareas) || p.tareas.length > 2000) throw Error('Programa sin tareas.');
  for (const t of p.tareas) if (!esCodigo(t.codigo) || typeof t.partida !== 'string' || !esFecha(t.inicio) || !esFecha(t.fin) || t.fin < t.inicio
    || (t.inicioBase != null || t.finBase != null) && !(esFecha(t.inicioBase) && esFecha(t.finBase) && t.finBase >= t.inicioBase)
    || t.peso != null && !(Number.isFinite(t.peso) && t.peso >= 0 && t.peso <= 100)) throw Error('Tarea del programa inválida: ' + (t?.codigo || '?'));
  if (new Set(p.tareas.map(t => t.codigo)).size !== p.tareas.length) throw Error('Partida repetida en el programa del piso.');
  if (p.ventanas != null && (typeof p.ventanas !== 'object' || Array.isArray(p.ventanas))) throw Error('Ventanas por sector inválidas.');
  for (const [codigo, v] of Object.entries(p.ventanas || {})) validarVentanas(v, codigo);
  return p;
}

// Diferencias entre la revisión guardada y la nueva de un piso: partidas nuevas, quitadas y con fechas movidas.
export function compararProgramas(anterior, nuevo) {
  const antes = new Map((anterior?.tareas || []).map(t => [t.codigo, t])), cambios = [];
  for (const t of nuevo.tareas) {
    const a = antes.get(t.codigo); antes.delete(t.codigo);
    if (!a) cambios.push({codigo: t.codigo, partida: t.partida, tipo: 'nueva', despues: [t.inicio, t.fin]});
    else if (a.inicio !== t.inicio || a.fin !== t.fin) cambios.push({codigo: t.codigo, partida: t.partida, tipo: 'fechas', antes: [a.inicio, a.fin], despues: [t.inicio, t.fin], corre: dias(a.fin, t.fin)});
  }
  for (const a of antes.values()) cambios.push({codigo: a.codigo, partida: a.partida, tipo: 'quitada', antes: [a.inicio, a.fin]});
  return cambios;
}
// Al cargar una revisión se conservan las ventanas por sector de las partidas que siguen; las de partidas quitadas se van.
export function conVentanasPrevias(nuevo, anterior) {
  const codigos = new Set(nuevo.tareas.map(t => t.codigo)), ventanas = Object.fromEntries(Object.entries(anterior?.ventanas || {}).filter(([c]) => codigos.has(c)));
  return Object.keys(ventanas).length ? {...nuevo, ventanas} : nuevo;
}

// ---------- Partidas de Atlas → tareas del programa ----------
// Partidas genéricas del PMA (sin ítem del itemizado) → familia del programa.
const GENERICAS = [[/^T-CIE-PINTURA/, '6.4.2'], [/^T-PAV-/, '6.1'], [/^T-CIE-/, '6.3'], [/^T-MURO-/, '6.2']];
const juntar = (codigo, ts) => ts.length === 1 ? ts[0] : {codigo, partida: ts.map(t => t.partida).join(' · '), inicio: ts.reduce((m, t) => t.inicio < m ? t.inicio : m, ts[0].inicio), fin: ts.reduce((m, t) => t.fin > m ? t.fin : m, ts[0].fin), compuesta: true,
  ...(ts.every(t => t.inicioBase) ? {inicioBase: ts.reduce((m, t) => t.inicioBase < m ? t.inicioBase : m, ts[0].inicioBase), finBase: ts.reduce((m, t) => t.finBase > m ? t.finBase : m, ts[0].finBase)} : {}),
  ...(ts.every(t => t.peso != null) ? {peso: ts.reduce((a, t) => a + t.peso, 0)} : {})};
// Tarea del programa para una partida de Atlas (id «6.4.1.2», «2.6», «T-PAV-109»): la de código más largo que la contiene;
// si el programa la abre en partes («2.6» → 2.6.1, 2.6.2…), todas juntas. null si el programa no la trae.
export function tareaDeItem(programa, id) {
  const tareas = programa?.tareas || [];
  const generica = GENERICAS.find(([re]) => re.test(id))?.[1], clave = generica || id;
  const contiene = tareas.filter(t => dentroDe(clave, t.codigo)).sort((a, b) => b.codigo.length - a.codigo.length)[0];
  if (contiene && !generica) return contiene;
  const partes = tareas.filter(t => dentroDe(t.codigo, clave));
  return partes.length ? juntar(clave, partes) : contiene || null;
}
// Partidas de Atlas (nodos del reporte de avance) que caen en una tarea del programa.
export const partidasDeTarea = (tarea, partidas) => partidas.filter(p => p.tipo === 'partida' && !/^T-/.test(p.id) && (dentroDe(p.id, tarea.codigo) || dentroDe(tarea.codigo, p.id) && p.id.includes('.')));

// ---------- Avance real de una tarea ----------
// partidas: nodos del reporte de avance del piso con su recinto ({id, cantidad, pct, recinto: {code}}); sectorDe(code).
// Pesa por m² cuando todas las partidas los tienen; si no, cada recinto pesa uno (tabiques, empaste, sellos).
export function avanceTarea(tarea, partidas, sectorDe = () => '') {
  const ps = partidasDeTarea(tarea, partidas), porM2 = ps.length > 0 && ps.every(p => p.cantidad > 0), porSector = {};
  let total = 0, ejecutado = 0;
  for (const p of ps) {
    const peso = porM2 ? p.cantidad : 1, hecho = peso * Math.min(100, Math.max(0, p.pct || 0)) / 100, s = sectorDe(p.recinto?.code) || '';
    total += peso; ejecutado += hecho;
    const x = porSector[s] ||= {total: 0, ejecutado: 0, pendiente: 0, recintos: new Set(), pendientes: new Set()};
    x.total += peso; x.ejecutado += hecho; x.pendiente += peso - hecho; x.recintos.add(p.recinto?.code);
    if (hecho < peso - 1e-9) x.pendientes.add(p.recinto?.code);
  }
  for (const x of Object.values(porSector)) { x.recintos = [...x.recintos].filter(Boolean); x.pendientes = [...x.pendientes].filter(Boolean); }
  return {partidas: ps.length, unidad: porM2 ? 'm²' : 'recintos', total, ejecutado, pendiente: total - ejecutado, pct: total ? 100 * ejecutado / total : null, porSector};
}

// % programado a una fecha: lineal entre inicio y fin (el día de término cuenta completo).
export function fraccionProgramada(inicio, fin, dia) {
  if (!inicio || !fin || !dia) return null;
  if (dia < inicio) return 0;
  if (dia >= fin) return 1;
  return Math.min(1, (dias(inicio, dia) + 1) / (dias(inicio, fin) + 1));
}
// Término proyectado con el ritmo real desde el inicio programado. null si no hay ritmo que medir o ya terminó.
export function proyeccion(tarea, pct, hoy) {
  if (pct == null || pct >= 100 || pct <= 0 || hoy <= tarea.inicio) return null;
  const transcurridos = dias(tarea.inicio, hoy) + 1, total = Math.ceil(transcurridos * 100 / pct), termino = sumarDias(tarea.inicio, total - 1);
  return {termino, atraso: dias(tarea.fin, termino)};
}

// ---------- Plan intermedio: lo que viene en las próximas semanas ----------
// Tareas en curso o que empiezan dentro de «semanas»; las vencidas (fin < hoy) van aparte y la vista decide si quedan
// pendientes según el avance real.
export function tareasProximas(programa, hoy, semanas = SEMANAS_ADELANTE) {
  const limite = sumarDias(hoy, semanas * 7), ts = programa?.tareas || [];
  return {
    enCurso: ts.filter(t => t.inicio <= hoy && t.fin >= hoy).sort((a, b) => a.fin.localeCompare(b.fin)),
    proximas: ts.filter(t => t.inicio > hoy && t.inicio <= limite).sort((a, b) => a.inicio.localeCompare(b.inicio)),
    vencidas: ts.filter(t => t.fin < hoy).sort((a, b) => b.fin.localeCompare(a.fin)),
    limite
  };
}

// ---------- Ventanas por sector ----------
// Reparte una tarea de piso entre los sectores, uno tras otro, en proporción a lo pendiente de cada uno. Si la tarea ya
// empezó, se reparte lo que queda desde hoy; si ya venció, el plazo original (y queda marcada como vencida). Un sector sin
// pendiente no recibe ventana. Planificación puede cambiar el orden y las fechas; el programa original no se toca.
export function ventanasPorSector(tarea, pendientes, {hoy, orden = ['1', '2', '3']} = {}) {
  const vencida = !!hoy && hoy > tarea.fin, desde = !hoy || vencida || hoy <= tarea.inicio ? tarea.inicio : hoy;
  const conPendiente = orden.filter(s => (pendientes[s] || 0) > 1e-9), total = conPendiente.reduce((a, s) => a + pendientes[s], 0);
  const largo = dias(desde, tarea.fin) + 1, sectores = [];
  let acumulado = 0, cursor = desde;
  for (const s of conPendiente) {
    acumulado += pendientes[s];
    const hasta = sumarDias(desde, Math.max(0, Math.round(largo * acumulado / total) - 1));
    sectores.push({sector: s, inicio: cursor, fin: hasta < cursor ? cursor : hasta});
    cursor = sumarDias(hasta < cursor ? cursor : hasta, 1);
    if (cursor > tarea.fin) cursor = tarea.fin;
  }
  return {orden: [...orden], sectores, vencida, desde};
}
export function validarVentanas(v, codigo = '') {
  if (!v || !Array.isArray(v.sectores) || v.sectores.length > 12) throw Error('Ventanas por sector inválidas' + (codigo ? ' (' + codigo + ')' : '') + '.');
  for (const s of v.sectores) {
    if (!/^[0-9A-Za-z-]{1,12}$/.test(s.sector || '') || !esFecha(s.inicio) || !esFecha(s.fin)) throw Error('Ventana por sector inválida' + (codigo ? ' (' + codigo + ')' : '') + '.');
    if (s.fin < s.inicio) throw Error(`El sector ${s.sector} termina antes de empezar.`);
  }
  if (new Set(v.sectores.map(s => s.sector)).size !== v.sectores.length) throw Error('Sector repetido en las ventanas.');
  return v;
}
// Ventanas fuera del plazo del programa: Atlas las acepta pero avisa.
export const fueraDelPrograma = (tarea, v) => (v?.sectores || []).filter(s => s.fin > tarea.fin || s.inicio < tarea.inicio).map(s => s.sector);
export const ventanaDe = (programa, codigo, sector) => programa?.ventanas?.[codigo]?.sectores?.find(s => s.sector === String(sector)) || null;

// ---------- Actividades de Last Planner ligadas al programa ----------
// Vínculo que se guarda en la actividad: la partida del programa (código, estable entre revisiones) y su plazo.
export const vinculo = (tarea, ventana = null, revision = null) => ({codigo: tarea.codigo, partida: tarea.partida, inicio: ventana?.inicio || tarea.inicio, fin: ventana?.fin || tarea.fin,
  ...(ventana ? {sector: ventana.sector} : {}), ...(revision?.estado ? {estado: revision.estado} : {})});
// Una actividad que termina después de su tarea (o de su ventana de sector) queda fuera del programa.
export function avisoActividad(actividad, programa) {
  const v = actividad?.programa; if (!v?.codigo || !actividad.finPlan) return null;
  const t = (programa?.tareas || []).find(x => x.codigo === v.codigo), ventana = v.sector ? ventanaDe(programa, v.codigo, v.sector) : null, fin = ventana?.fin || t?.fin || v.fin;
  return fin && actividad.finPlan > fin ? {fin, atraso: dias(fin, actividad.finPlan)} : null;
}
