// Datos de EJEMPLO FICTICIOS del Last Planner para presentar la plataforma. Terminaciones por piso con los
// subcontratos de la obra: ocho semanas de historia, la semana en curso, dos semanas y el plan intermedio por
// delante, puntos de bloqueo con acción, departamento e ITO (liberados a tiempo o tarde según expliquen o no lo no
// cumplido), reuniones semanales con asistencia, frentes y acuerdos. Las personas son inventadas.
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

// Carácter de cada piso: trabajos, PPC de las 8 semanas pasadas (de la más antigua a la última), causas y puntos de
// bloqueo frecuentes (los primeros, los más comunes).
export const PISOS_EJEMPLO = {
  'N-1': {trabajos: ['tabique1', 'tabique2', 'cieloEstr', 'cieloTapado', 'cdeCable', 'vinMiranda', 'zocaloMiranda', 'puertasTeisa', 'artefactos', 'aseo', 'soporteria'],
    ppc: [.62, .67, .7, .65, .73, .77, .72, .81], porSemana: [10, 13], causas: ['Mano de obra insuficiente', 'Material no disponible', 'Frente no liberado', 'Programación / planificación'],
    bloqueos: ['placasRH', 'acreditacion', 'cielo', 'protocolo', 'vinilico', 'rfi']},
  N01: {trabajos: ['tabique1', 'tabique2', 'cieloEstr', 'cieloTapado', 'cdePuntos', 'vinConstrulyl', 'zocaloConstrulyl', 'hplTeisa', 'puertasTeisa', 'artefactos', 'sellos', 'retape'],
    ppc: [.55, .58, .63, .68, .71, .76, .82, .85], porSemana: [11, 14], causas: ['Frente no liberado', 'Diseño / información', 'Material no disponible', 'Calidad / rehacer trabajo'],
    bloqueos: ['rfi', 'cielo', 'clima', 'quincalleria', 'protocolo', 'placasRH']},
  N02: {trabajos: ['correderas', 'correderas', 'vinMiranda', 'zocaloMiranda', 'cieloTapado', 'cdeCable', 'cdePuntos', 'hplTeisa', 'aseo', 'soporteria'],
    ppc: [.8, .83, .86, .82, .88, .9, .89, .93], porSemana: [9, 12], causas: ['Mandante / ITO', 'Frente no liberado', 'Material no disponible'],
    bloqueos: ['recepcionITO', 'quincalleria', 'clima', 'vinilico', 'aseoGrueso']},
  N03: {trabajos: ['cortafuego', 'cortafuego', 'vinConductivo', 'zocaloConstrulyl', 'tabique2', 'aseo', 'sellos', 'soporteria', 'artefactos', 'cdeCable', 'cieloTapado'],
    ppc: [.74, .7, .61, .58, .66, .75, .83, .88], porSemana: [10, 13], causas: ['Material no disponible', 'Frente no liberado', 'Calidad / rehacer trabajo', 'Subcontrato'],
    bloqueos: ['puertas', 'vinilico', 'cielo', 'recepcionITO', 'protocolo']}
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
// Puntos de bloqueo: tipo, qué falta, quién lo levanta, su departamento, la acción acordada y si requiere a la ITO.
const RESTRICCIONES = {
  vinilico: ['Materiales', 'Despacho de rollos de vinílico', 'Marcela Ibáñez', 'Compras', 'Confirmar la fecha de despacho con el proveedor'],
  placasRH: ['Materiales', 'Llegada de placas de volcanita RH', 'Marcela Ibáñez', 'Compras', 'Activar la orden de compra y coordinar la descarga'],
  puertas: ['Materiales', 'Despacho de puertas desde fábrica', 'Supervisor del subcontrato', 'Subcontrato', 'Exigir al subcontrato el programa de despacho'],
  cielo: ['Frente previo', 'Cielo duro tapado y empastado', 'Valencia', 'Producción', 'Reforzar la cuadrilla de cielos en el sector'],
  clima: ['Frente previo', 'Pruebas de clima terminadas en el sector', 'Martín Carrasco', 'Instalaciones', 'Programar las pruebas con el subcontrato de clima', true],
  aseoGrueso: ['Frente previo', 'Aseo grueso previo del sector', 'Spotless', 'Subcontrato', 'Programar la cuadrilla de aseo grueso'],
  rfi: ['Diseño / planos', 'RFI de encuentro tabique–cielo respondida', 'Camila Rojas', 'Oficina técnica', 'Enviar la RFI a la ITO y seguirla en la reunión semanal', true],
  quincalleria: ['Diseño / planos', 'Plano de quincallería aprobado', 'Camila Rojas', 'Oficina técnica', 'Gestionar la aprobación con arquitectura', true],
  protocolo: ['Calidad / protocolo', 'Protocolo de tabique 1ª cara firmado', 'Paula Henríquez', 'Calidad', 'Revisar en terreno y firmar el protocolo'],
  recepcionITO: ['Permisos / inspección', 'Recepción ITO de sellos cortafuego', 'Inspector técnico (ITO)', 'ITO / Mandante', 'Solicitar la recepción por libro de obra', true],
  acreditacion: ['Mano de obra', 'Acreditación de cuadrilla nueva', 'Ignacio Soto', 'Prevención de riesgos', 'Revisar la documentación e inducir a la cuadrilla']
};
// Punto de bloqueo que explica cada causa de no cumplimiento (se liberó tarde o sigue abierto).
const BLOQUEO_DE_CAUSA = {'Material no disponible': ['vinilico', 'placasRH', 'puertas'], 'Frente no liberado': ['cielo', 'clima', 'aseoGrueso'], 'Diseño / información': ['rfi', 'quincalleria'],
  'Calidad / rehacer trabajo': ['protocolo'], 'Mandante / ITO': ['recepcionITO'], 'Mano de obra insuficiente': ['acreditacion'], 'Subcontrato': ['puertas', 'acreditacion']};
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
  // Puntos de bloqueo con su propio azar, para que la historia de actividades del piso no cambie.
  const rb = azar(semillaDe('bloqueos' + piso + semanaHoy)), nDias = (a, b) => a + Math.floor(rb() * (b - a + 1)), frecuente = l => l[Math.floor(Math.pow(rb(), 2) * l.length)];
  const aHabil = (f, paso = -1) => { let x = f; while (!habil(x)) x = M.sumarDias(x, paso); return x; }, menor = (a, b) => a < b ? a : b;
  let nr = 0;
  const restriccion = (clave, {registrada, compromiso, liberada = null}) => {
    const [tipo, descripcion, responsable, departamento, accion, requiereITO = false] = RESTRICCIONES[clave];
    const base = M.nuevaRestriccion({tipo, descripcion, responsable, compromiso, accion, departamento, requiereITO, registrada}, `${PREFIJO}r-${piso}-${++nr}`, hoy);
    return liberada ? {...base, estado: 'Liberada', liberada} : base;
  };
  // Puntos de las semanas por venir: pendiente por vencer, vencido, o ya liberado (a tiempo o tarde, nunca después de hoy).
  function bloqueo(estado, clave = frecuente(conf.bloqueos)) {
    if (estado === 'pendiente') return restriccion(clave, {compromiso: aHabil(M.sumarDias(hoy, nDias(1, 6)), 1), registrada: M.sumarDias(hoy, -nDias(0, 10))});
    if (estado === 'vencida') { const compromiso = aHabil(M.sumarDias(hoy, -nDias(1, 4))); return restriccion(clave, {compromiso, registrada: M.sumarDias(compromiso, -nDias(5, 12))}); }
    const liberada = aHabil(M.sumarDias(hoy, -nDias(0, 6))), compromiso = rb() < .75 ? aHabil(M.sumarDias(liberada, nDias(0, 3)), 1) : aHabil(M.sumarDias(liberada, -nDias(1, 4)));
    return restriccion(clave, {compromiso, liberada, registrada: M.sumarDias(menor(compromiso, liberada), -nDias(4, 12))});
  }
  // Semana cerrada: los puntos se registran una o dos semanas antes y vencen antes del lunes. Si explican la causa de
  // una no cumplida se liberaron tarde, ya en la semana (o la última sigue abierta); lo cumplido se liberó casi siempre a tiempo.
  function bloqueoCerrada(a, lunes, ultima) {
    const explica = a.estado === 'No cumplida' && BLOQUEO_DE_CAUSA[a.causa];
    if (rb() > (explica ? .45 : .3)) return [];
    const compromiso = M.sumarDias(lunes, -nDias(3, 5)), registrada = M.sumarDias(compromiso, -nDias(4, 12));
    const liberada = explica ? (ultima && rb() < .4 ? null : M.sumarDias(lunes, nDias(1, 3))) : rb() < .85 ? M.sumarDias(compromiso, -nDias(0, 2)) : lunes;
    return [restriccion(explica ? frecuente(explica) : frecuente(conf.bloqueos), {compromiso, registrada, liberada})];
  }
  let pendientesReprogramar = [];
  for (let w = -8; w <= 2; w++) {
    const s = M.moverSemana(semanaHoy, w), lunes = M.lunesDe(s), viernes = M.sumarDias(lunes, 4);
    const cantidad = w <= 0 ? entero(conf.porSemana) : 5 + Math.floor(r() * 3);
    const trabajos = Array.from({length: cantidad}, () => elige(conf.trabajos));
    if (w < 0) {
      // Semana cerrada: se cumple la proporción del PPC del piso; los de buen rendimiento van primero en cumplir.
      const cumplidas = Math.round(conf.ppc[w + 8] * cantidad), orden = trabajos.map((t, i) => ({t, i, p: (T[t].factor ? -1 : 0) + r()})).sort((x, y) => x.p - y.p);
      const semana = orden.map(({t}, k) => [t, ejecutar(nueva(t, s), t, k < cumplidas, viernes)]).map(([t, a]) => [t, {...a, restricciones: bloqueoCerrada(a, lunes, w === -1)}]);
      actividades.push(...semana.map(([, a]) => a));
      pendientesReprogramar = w === -1 ? semana.filter(([, a]) => a.estado === 'No cumplida') : [];
    } else if (w === 0) {
      // Semana en curso: lo terminado antes de hoy cumplido, lo de hoy en ejecución, lo demás planificado; el saldo de la anterior se reprograma.
      for (const [, original] of pendientesReprogramar) {
        const {original: cerrada, nueva: saldo} = M.reprogramar(original, s, {id: `${PREFIJO}${piso}-${++n}`, autor: AUTOR, at: instante(M.sumarDias(lunes, -3), '20:30')});
        actividades.splice(actividades.indexOf(original), 1, cerrada);
        actividades.push(saldo.inicioPlan < hoy && !M.pendientes(saldo).length ? M.cambiarEstado(saldo, 'En ejecución', {inicioReal: saldo.inicioPlan}, {autor: AUTOR, at: instante(saldo.inicioPlan, '11:30')}) : saldo);
      }
      for (const t of trabajos) {
        const a = nueva(t, s, {corta: r() < .2, restricciones: r() < .15 ? [bloqueo(rb() < .5 ? 'vencida' : 'pendiente')] : []});
        if (M.pendientes(a).length || a.inicioPlan > hoy) actividades.push(a);
        else if (a.finPlan < hoy && r() < .85) actividades.push(ejecutar(a, t, true, hoy)); // el término real no pasa de hoy
        else actividades.push(M.cambiarEstado(a, 'En ejecución', {inicioReal: a.inicioPlan}, {autor: AUTOR, at: instante(a.inicioPlan, '11:30')}));
      }
    } else {
      // Próximas semanas: comprometidas con restricciones, algunas liberadas, otras pendientes y alguna vencida.
      for (const t of trabajos) {
        const tirada = r(), restricciones = tirada < .35 ? [] : [bloqueo(tirada < .6 ? 'liberada' : tirada < .85 ? 'pendiente' : 'vencida')];
        actividades.push(nueva(t, s, {corta: r() < .25, restricciones}));
      }
    }
  }
  // Plan intermedio: trabajos aún sin semana, con sus puntos de bloqueo.
  for (let k = 0; k < 4; k++) {
    const t = elige(conf.trabajos);
    actividades.push(nueva(t, null, {restricciones: [bloqueo(k === 0 ? 'vencida' : 'pendiente'), ...(r() < .5 ? [bloqueo('pendiente')] : [])]}));
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
