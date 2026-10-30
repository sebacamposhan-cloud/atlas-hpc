// Datos de EJEMPLO FICTICIOS del Last Planner para presentar la plataforma. Terminaciones por piso con los
// subcontratos de la obra: ocho semanas de historia, la semana en curso, dos semanas y el plan intermedio por
// delante, restricciones, reuniones semanales con asistencia, frentes y acuerdos. Las personas son inventadas.
// Cada piso tiene su propio carácter (subcontratos, recintos, PPC y causas). Todo lleva id «demo-» para quitarlo
// de una vez; la generación es determinista para una misma fecha.
import * as M from './lastplanner-model.mjs';

export const PREFIJO = 'demo-';
export const esEjemplo = registro => String(registro?.id || '').startsWith(PREFIJO);
const AUTOR = 'Jefe de producción (ejemplo)';

// Trabajos de terminaciones: rendimiento planificado por persona al día y, si rinde distinto, factor real.
const T = {
  tabique1: {actividad: 'Tabiquería volcometal 1ª cara', responsable: 'Spotless', unidad: 'm²', cantidad: [40, 110], rend: 11, salas: /oficina|estar|bodega|sala|box|vestuario|higi/i},
  tabique2: {actividad: 'Tabiquería 2ª cara y aislación', responsable: 'Spotless', unidad: 'm²', cantidad: [40, 100], rend: 13, salas: /oficina|estar|bodega|sala|box|vestuario|higi/i},
  aseo: {actividad: 'Aseo fino de recintos para entrega', responsable: 'Spotless', unidad: 'm²', cantidad: [150, 420], rend: 110, salas: /./},
  cieloEstr: {actividad: 'Estructuración de cielo duro', responsable: 'Valencia', unidad: 'm²', cantidad: [50, 140], rend: 12, salas: /circulaci|hall|oficina|higi|estar|sala/i},
  cieloTapado: {actividad: 'Tapado de cielo duro (volcanita RH)', responsable: 'Valencia', unidad: 'm²', cantidad: [50, 130], rend: 15, salas: /circulaci|hall|oficina|higi|estar|sala/i},
  cdeCable: {actividad: 'Cableado de corrientes débiles', responsable: 'DAC-Controls', unidad: 'm', cantidad: [250, 900], rend: 130, salas: /circulaci|oficina|box|cub[ií]culo|estaci|sala/i},
  cdePuntos: {actividad: 'Instalación de puntos de red y voz', responsable: 'DAC-Controls', unidad: 'pto', cantidad: [20, 60], rend: 9, salas: /oficina|box|cub[ií]culo|estaci|sala|estar/i},
  vinMiranda: {actividad: 'Instalación de piso vinílico', responsable: 'Miranda', unidad: 'm²', cantidad: [60, 180], rend: 28, salas: /circulaci|oficina|sala|cub[ií]culo|estar/i},
  zocaloMiranda: {actividad: 'Guardapolvo sanitario vinílico', responsable: 'Miranda', unidad: 'm', cantidad: [60, 160], rend: 32, salas: /circulaci|oficina|sala|cub[ií]culo|estar/i},
  vinConstrulyl: {actividad: 'Instalación de piso vinílico', responsable: 'Construlyl', unidad: 'm²', cantidad: [60, 170], rend: 26, salas: /box|circulaci|sala|oficina/i},
  vinConductivo: {actividad: 'Instalación de piso vinílico conductivo', responsable: 'Construlyl', unidad: 'm²', cantidad: [50, 140], rend: 20, salas: /pabell|quir|lavado|pre-anestesia/i},
  zocaloConstrulyl: {actividad: 'Guardapolvo sanitario vinílico', responsable: 'Construlyl', unidad: 'm', cantidad: [50, 150], rend: 30, salas: /box|pabell|circulaci|sala/i},
  puertasTeisa: {actividad: 'Montaje de puertas de madera', responsable: 'Teisa', unidad: 'un', cantidad: [6, 18], rend: 3, salas: /oficina|estar|bodega|sala|box|higi/i},
  hplTeisa: {actividad: 'Instalación de paneles HPL', responsable: 'Teisa', unidad: 'm²', cantidad: [20, 60], rend: 7, salas: /box|cub[ií]culo|higi|sala/i},
  correderas: {actividad: 'Montaje de puertas correderas UCI', responsable: 'Grupsa', unidad: 'un', cantidad: [4, 10], rend: 1.5, factor: [1.3, 1.5], salas: /cub[ií]culo|UTI|UCI/i},
  cortafuego: {actividad: 'Instalación de puertas cortafuego', responsable: 'Protego', unidad: 'un', cantidad: [4, 12], rend: 1.2, factor: [1.25, 1.45], salas: /circulaci|pabell|hall|lavado/i},
  artefactos: {actividad: 'Instalación de artefactos sanitarios', responsable: 'Pavitec', unidad: 'un', cantidad: [8, 24], rend: 4, salas: /higi|ba[ñn]o|vestuario|lavado/i},
  retape: {actividad: 'Retape y reparación de muros', responsable: 'Pavitec', unidad: 'm²', cantidad: [30, 90], rend: 16, salas: /./},
  soporteria: {actividad: 'Montaje de soportería de equipos', responsable: 'STI', unidad: 'un', cantidad: [10, 30], rend: 6, salas: /sala|box|cub[ií]culo|pabell|oficina/i},
  sellos: {actividad: 'Sellos cortafuego en pasadas', responsable: 'STI', unidad: 'un', cantidad: [20, 60], rend: 18, salas: /circulaci|sala|pabell|hall/i}
};

// Carácter de cada piso: trabajos, PPC de las 8 semanas pasadas (de la más antigua a la última) y causas frecuentes.
export const PISOS_EJEMPLO = {
  'N-1': {trabajos: ['tabique1', 'tabique2', 'cieloEstr', 'cieloTapado', 'cdeCable', 'vinMiranda', 'zocaloMiranda', 'puertasTeisa', 'artefactos', 'aseo', 'soporteria'],
    ppc: [.62, .67, .7, .65, .73, .77, .72, .81], porSemana: [10, 13], causas: ['Mano de obra insuficiente', 'Material no disponible', 'Frente no liberado', 'Programación / planificación']},
  N01: {trabajos: ['tabique1', 'tabique2', 'cieloEstr', 'cieloTapado', 'cdePuntos', 'vinConstrulyl', 'zocaloConstrulyl', 'hplTeisa', 'puertasTeisa', 'artefactos', 'sellos', 'retape'],
    ppc: [.55, .58, .63, .68, .71, .76, .82, .85], porSemana: [11, 14], causas: ['Frente no liberado', 'Diseño / información', 'Material no disponible', 'Calidad / rehacer trabajo']},
  N02: {trabajos: ['correderas', 'correderas', 'vinMiranda', 'zocaloMiranda', 'cieloTapado', 'cdeCable', 'cdePuntos', 'hplTeisa', 'aseo', 'soporteria'],
    ppc: [.8, .83, .86, .82, .88, .9, .89, .93], porSemana: [9, 12], causas: ['Mandante / ITO', 'Frente no liberado', 'Material no disponible']},
  N03: {trabajos: ['cortafuego', 'cortafuego', 'vinConductivo', 'zocaloConstrulyl', 'tabique2', 'aseo', 'sellos', 'soporteria', 'artefactos', 'cdeCable', 'cieloTapado'],
    ppc: [.74, .7, .61, .58, .66, .75, .83, .88], porSemana: [10, 13], causas: ['Material no disponible', 'Frente no liberado', 'Calidad / rehacer trabajo', 'Subcontrato']}
};
const NOTAS = {
  'Mano de obra insuficiente': ['La cuadrilla llegó con dos personas menos', 'Personal reasignado a otro frente'],
  'Material no disponible': ['El despacho llegó incompleto', 'Material retenido en bodega central', 'Proveedor atrasó la entrega'],
  'Frente no liberado': ['El cielo del sector no estaba tapado', 'Faltaban pruebas de clima en el sector', 'Andamios sin retirar'],
  'Programación / planificación': ['Se comprometió más de lo que permitía el frente'],
  'Diseño / información': ['RFI de encuentro tabique–cielo sin respuesta', 'Plano de puertas en revisión'],
  'Calidad / rehacer trabajo': ['Observación de calidad obligó a rehacer juntas', 'ITO pidió rehacer un tramo'],
  'Mandante / ITO': ['Recepción de la ITO reprogramada'],
  'Subcontrato': ['El subcontrato cambió de supervisor a mitad de semana']
};
const RESTRICCIONES = [
  ['Materiales', 'Despacho de rollos de vinílico', 'Compras · Sacyr'], ['Materiales', 'Llegada de placas de volcanita RH', 'Compras · Sacyr'],
  ['Materiales', 'Despacho de puertas desde fábrica', 'Subcontrato'], ['Frente previo', 'Cielo duro tapado y empastado', 'Valencia'],
  ['Frente previo', 'Pruebas de clima terminadas en el sector', 'Instalaciones · Sacyr'], ['Frente previo', 'Aseo grueso previo del sector', 'Spotless'],
  ['Diseño / planos', 'RFI de encuentro tabique–cielo respondida', 'Oficina técnica · Sacyr'], ['Diseño / planos', 'Plano de quincallería aprobado', 'Oficina técnica · Sacyr'],
  ['Calidad / protocolo', 'Protocolo de tabique 1ª cara firmado', 'Calidad · Sacyr'], ['Permisos / inspección', 'Recepción ITO de sellos cortafuego', 'ITO'],
  ['Mano de obra', 'Acreditación de cuadrilla nueva', 'Subcontrato']
];
// Asistentes inventados: equipo de la constructora y un representante por subcontrato.
const EQUIPO = [['Daniela Fuentes', 'Sacyr', 'Jefa de producción'], ['Ricardo Molina', 'Sacyr', 'Administrador de obra'], ['Camila Rojas', 'Sacyr', 'Oficina técnica'],
  ['Tomás Vergara', 'Sacyr', 'Jefe de terreno'], ['Paula Henríquez', 'Sacyr', 'Calidad'], ['Ignacio Soto', 'Sacyr', 'Prevención de riesgos'],
  ['Héctor Lagos', 'Spotless', 'Supervisor'], ['Valentina Cruz', 'STI', 'Supervisora'], ['Jorge Peña', 'Valencia', 'Capataz'], ['Nicolás Araya', 'DAC-Controls', 'Supervisor'],
  ['Francisca Ortiz', 'Grupsa', 'Jefa de cuadrilla'], ['Cristóbal Vidal', 'Protego', 'Supervisor'], ['Gonzalo Salinas', 'Miranda', 'Capataz'],
  ['Andrés Bravo', 'Construlyl', 'Capataz'], ['Carolina Méndez', 'Teisa', 'Supervisora'], ['Felipe Navarro', 'Pavitec', 'Supervisor']];
const ACUERDOS = [['Liberar frente de cielos del sector C para vinílico', 'Valencia'], ['Confirmar fecha de despacho de puertas cortafuego', 'Protego'],
  ['Responder RFI de encuentro tabique–cielo en pabellones', 'Oficina técnica · Sacyr'], ['Reforzar la cuadrilla de tabiquería a seis personas', 'Spotless'],
  ['Coordinar la recepción ITO de sellos cortafuego', 'Calidad · Sacyr'], ['Programar aseo fino antes de la entrega de UTI', 'Spotless'],
  ['Entregar muestras aprobadas de paneles HPL', 'Teisa'], ['Despejar bodega de piso para acopio de vinílico', 'Producción · Sacyr']];

// Azar reproducible (mulberry32) con semilla por piso.
function azar(semilla) { let a = semilla >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const semillaDe = texto => [...texto].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const habil = f => { const d = new Date(f + 'T00:00:00Z').getUTCDay(); return d !== 0 && d !== 6; };
const masHabiles = (f, n) => { let x = f; for (let k = 0; k < n;) { x = M.sumarDias(x, 1); if (habil(x)) k++; } return x; };
const instante = (fecha, hora = '21:00') => `${fecha}T${hora}:00.000Z`;

function generarPiso(piso, salas, hoy, semanaHoy) {
  const conf = PISOS_EJEMPLO[piso], r = azar(semillaDe(piso + semanaHoy)), entre = ([a, b]) => a + r() * (b - a), entero = rango => Math.round(entre(rango)), elige = l => l[Math.floor(r() * l.length)];
  const salasDe = t => { const l = salas.filter(s => T[t].salas.test(s.name)); return l.length ? l : salas; };
  const actividades = [];
  let n = 0;
  function nueva(t, semana, extra = {}) {
    const tr = T[t], lunes = semana ? M.lunesDe(semana) : null, plazo = 1 + Math.floor(r() * 4), dentro = salasDe(t), inicio = Math.floor(r() * dentro.length);
    const recintos = [...new Map(Array.from({length: 1 + Math.floor(r() * 3)}, (_, i) => dentro[(inicio + i * 3) % dentro.length]).map(s => [s.id, {id: s.id, code: s.code, name: s.name}])).values()];
    const inicioPlan = lunes ? M.sumarDias(lunes, Math.floor(r() * 2)) : null, finPlan = lunes ? [masHabiles(inicioPlan, plazo - 1)].map(f => f > M.sumarDias(lunes, 4) ? M.sumarDias(lunes, 4) : f)[0] : null;
    const cantidad = tr.unidad === 'un' || tr.unidad === 'pto' ? entero(tr.cantidad) : Math.round(entre(tr.cantidad) / 5) * 5, dias = M.diasHabiles(inicioPlan, finPlan) || 5;
    const recomendada = M.dotacionRecomendada(cantidad, tr.rend, dias)?.personas || 1;
    const at = instante(lunes ? M.sumarDias(lunes, -3) : M.sumarDias(hoy, -2), '20:00');
    return M.nuevaActividad({actividad: tr.actividad, level: piso, sector: recintos[0] && salas.find(s => s.id === recintos[0].id)?.sector || null, frente: recintos[0]?.name?.slice(0, 80) || null,
      recintos, responsable: tr.responsable, semana, inicioPlan, finPlan, cantidad, unidad: tr.unidad, rendimientoPlan: tr.rend, dotacion: Math.max(1, recomendada - (extra.corta ? 1 : 0)), restricciones: extra.restricciones || []},
    {id: `${PREFIJO}${piso}-${++n}`, autor: AUTOR, at});
  }
  // Ejecución real: rinde según el factor del trabajo; cumplida al 100 % o no cumplida con avance parcial y causa.
  function ejecutar(a, t, cumple, viernes) {
    const tr = T[t], factor = entre(tr.factor || [.8, 1.1]), inicioReal = a.inicioPlan, disponibles = M.diasHabiles(inicioReal, viernes);
    // Días trabajados en medias jornadas, como se registran en terreno; el término real es el día en que se acaba.
    const dias = Math.min(disponibles, Math.max(.5, Math.round(a.cantidad / (tr.rend * factor * a.dotacion) * 2) / 2));
    const finReal = masHabiles(inicioReal, Math.ceil(dias) - 1), hh = r() < .6 ? Math.round(a.dotacion * dias * 9) : null;
    let x = M.cambiarEstado(a, 'En ejecución', {inicioReal}, {autor: AUTOR, at: instante(inicioReal, '11:30')});
    if (cumple) return M.cambiarEstado(x, 'Cumplida', {inicioReal, finReal, cantidadEjecutada: a.cantidad, diasReales: dias, hh}, {autor: AUTOR, at: instante(finReal)});
    const causa = conf.causas[Math.floor(Math.pow(r(), 2) * conf.causas.length)]; // las primeras del piso son las más frecuentes
    return M.cambiarEstado(x, 'No cumplida', {finReal: viernes, cantidadEjecutada: Math.max(1, Math.round(a.cantidad * entre([.35, .85]))), causa, causaNota: elige(NOTAS[causa])}, {autor: AUTOR, at: instante(viernes)});
  }
  const restriccion = (lunes, k, estado) => {
    const [tipo, descripcion, responsable] = elige(RESTRICCIONES), compromiso = estado === 'vencida' ? M.sumarDias(hoy, -1 - Math.floor(r() * 4)) : estado === 'liberada' ? M.sumarDias(lunes, -3) : M.sumarDias(hoy, 1 + Math.floor(r() * 6));
    const base = M.nuevaRestriccion({tipo, descripcion, responsable, compromiso}, `${PREFIJO}r-${piso}-${n}-${k}`);
    return estado === 'liberada' ? {...base, estado: 'Liberada', liberada: M.sumarDias(compromiso, Math.floor(r() * 2))} : base;
  };
  let pendientesReprogramar = [];
  for (let w = -8; w <= 2; w++) {
    const s = M.moverSemana(semanaHoy, w), lunes = M.lunesDe(s), viernes = M.sumarDias(lunes, 4);
    const cantidad = w <= 0 ? entero(conf.porSemana) : 5 + Math.floor(r() * 3);
    const trabajos = Array.from({length: cantidad}, () => elige(conf.trabajos));
    if (w < 0) {
      // Semana cerrada: se cumple la proporción del PPC del piso; los de buen rendimiento van primero en cumplir.
      const cumplidas = Math.round(conf.ppc[w + 8] * cantidad), orden = trabajos.map((t, i) => ({t, i, p: (T[t].factor ? -1 : 0) + r()})).sort((x, y) => x.p - y.p);
      const semana = orden.map(({t}, k) => [t, ejecutar(nueva(t, s), t, k < cumplidas, viernes)]);
      actividades.push(...semana.map(([, a]) => a));
      pendientesReprogramar = w === -1 ? semana.filter(([, a]) => a.estado === 'No cumplida') : [];
    } else if (w === 0) {
      // Semana en curso: lo terminado antes de hoy cumplido, lo de hoy en ejecución, lo demás planificado; el saldo de la anterior se reprograma.
      for (const [, original] of pendientesReprogramar) {
        const {original: cerrada, nueva: saldo} = M.reprogramar(original, s, {id: `${PREFIJO}${piso}-${++n}`, autor: AUTOR, at: instante(M.sumarDias(lunes, -3), '20:30')});
        actividades.splice(actividades.indexOf(original), 1, cerrada);
        actividades.push(saldo.inicioPlan < hoy ? M.cambiarEstado(saldo, 'En ejecución', {inicioReal: saldo.inicioPlan}, {autor: AUTOR, at: instante(saldo.inicioPlan, '11:30')}) : saldo);
      }
      for (const t of trabajos) {
        const a = nueva(t, s, {corta: r() < .2, restricciones: r() < .15 ? [restriccion(lunes, 0, 'pendiente')] : []});
        if (M.pendientes(a).length || a.inicioPlan > hoy) actividades.push(a);
        else if (a.finPlan < hoy && r() < .85) actividades.push(ejecutar(a, t, true, hoy)); // el término real no pasa de hoy
        else actividades.push(M.cambiarEstado(a, 'En ejecución', {inicioReal: a.inicioPlan}, {autor: AUTOR, at: instante(a.inicioPlan, '11:30')}));
      }
    } else {
      // Próximas semanas: comprometidas con restricciones, algunas liberadas, otras pendientes y alguna vencida.
      for (const t of trabajos) {
        const tirada = r(), restricciones = tirada < .35 ? [] : [restriccion(lunes, 0, tirada < .6 ? 'liberada' : tirada < .85 ? 'pendiente' : 'vencida')];
        actividades.push(nueva(t, s, {corta: r() < .25, restricciones}));
      }
    }
  }
  // Plan intermedio: trabajos aún sin semana, con sus puntos de bloqueo.
  for (let k = 0; k < 4; k++) {
    const t = elige(conf.trabajos), lunes = M.lunesDe(M.moverSemana(semanaHoy, 3));
    actividades.push(nueva(t, null, {restricciones: [restriccion(lunes, 0, k === 0 ? 'vencida' : 'pendiente'), ...(r() < .5 ? [restriccion(lunes, 1, 'pendiente')] : [])]}));
  }
  return actividades;
}

// Reuniones semanales de producción (lunes) con asistencia, frentes por piso y acuerdos que pasan hasta cumplirse.
function generarReuniones(actividades, hoy, semanaHoy) {
  const r = azar(semillaDe('reuniones' + semanaHoy)), reuniones = [], abiertos = [];
  for (let w = -7; w <= 0; w++) {
    const s = M.moverSemana(semanaHoy, w), fecha = M.lunesDe(s), at = instante(fecha, '15:00');
    const asistentes = EQUIPO.map(([nombre, empresa, cargo]) => ({nombre, empresa, cargo, asistio: r() < (empresa === 'Sacyr' ? .95 : .82 + w * .005)}));
    const frentes = [];
    for (const piso of Object.keys(PISOS_EJEMPLO)) {
      const deSemana = actividades.filter(a => a.level === piso && a.semana === s), porResp = new Map();
      for (const a of deSemana) porResp.set(a.responsable, (porResp.get(a.responsable) || 0) + (a.dotacion || 0));
      [...porResp].sort((x, y) => y[1] - x[1]).slice(0, 3).forEach(([responsable, dotacion], i) => {
        const detenido = w === 0 && piso === 'N03' && i === 2;
        frentes.push({level: piso, sector: deSemana.find(a => a.responsable === responsable)?.sector || null, frente: deSemana.find(a => a.responsable === responsable).actividad, responsable,
          dotacion: detenido ? 0 : dotacion, estado: detenido ? 'Detenido' : 'Activo', nota: detenido ? 'Espera liberación de cielo en el sector' : null});
      });
    }
    // Los acuerdos de la reunión anterior siguen hasta cumplirse; se agregan dos nuevos por semana.
    for (const c of abiertos) c.cumplido = r() < .6;
    const vigentes = abiertos.filter(c => !c.cumplido), nuevos = [0, 1].map(() => { const [texto, responsable] = ACUERDOS[Math.floor(r() * ACUERDOS.length)]; return {texto, responsable, plazo: M.sumarDias(fecha, 2 + Math.floor(r() * 5)), cumplido: false}; })
      .filter(c => !vigentes.some(v => v.texto === c.texto));
    const acuerdos = [...abiertos.map(c => ({...c})), ...nuevos].filter((c, i, l) => l.findIndex(x => x.texto === c.texto) === i);
    abiertos.splice(0, abiertos.length, ...acuerdos.filter(c => !c.cumplido).map(c => ({...c})));
    reuniones.push(M.validarReunion({schema: 1, id: `${PREFIJO}reunion-${s}`, fecha, tipo: 'Semanal (Last Planner)', lugar: 'Sala de reuniones de obra', notas: 'Reunión de ejemplo con datos ficticios.',
      asistentes, frentes, acuerdos, autor: AUTOR, creada: at, actualizada: at, version: 1}));
  }
  return reuniones;
}

// salasPorPiso: {N-1: [{id, code, name, sector}], …}. Devuelve registros listos para guardar (versión 1).
export function generarEjemplo(salasPorPiso, hoy) {
  const semanaHoy = M.semanaDe(hoy), actividades = [];
  for (const piso of Object.keys(PISOS_EJEMPLO)) if (salasPorPiso[piso]?.length) actividades.push(...generarPiso(piso, salasPorPiso[piso], hoy, semanaHoy));
  const listas = actividades.map(a => M.validarActividad({...a, version: 1}));
  return {actividades: listas, reuniones: generarReuniones(listas, hoy, semanaHoy)};
}
