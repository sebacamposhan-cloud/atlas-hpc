// Sincronización de proyectos, observaciones y avance por recinto con la nube compartida (/api/campo → supabase/campo.sql
// y supabase/avance-terreno.sql). Cada equipo guarda primero en su IndexedDB; aquí se baja lo de otros equipos, se sube
// lo cambiado y se mueven las fotos. Un cambio se detecta comparando la huella del contenido (sin la versión local) con
// la de la última sincronización. Si el mismo registro cambió en dos equipos: el proyecto se junta con la base
// guardada (fusionarProyecto; copia solo si no se puede), la observación se fusiona (historial y fotos de ambos; los datos de la versión actualizada más tarde) y el
// avance del recinto también (en cada partida queda la marca más reciente).
// El avance es lo que se marca en el rombo, en la ficha o con el pincel de un proyecto de partida: el proyecto no
// guarda esos estados, los lee del avance del recinto, así que sin este tipo lo pintado no salía del equipo.
import {MAX_FOTOS} from './observaciones-model.mjs';

// JSON con las claves ordenadas: el mismo contenido da el mismo texto aunque la base reordene las claves.
export const canonico = v => Array.isArray(v) ? '[' + v.map(x => x === undefined ? 'null' : canonico(x)).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}'
  : JSON.stringify(v);
// Huella de 64 bits más el largo: suficiente para saber si algo cambió.
export function huella(valor) {
  const s = canonico(valor); let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (b >>> 0).toString(16).padStart(8, '0') + (a >>> 0).toString(16).padStart(8, '0') + ':' + s.length;
}
const sinVersion = ({version, ...resto}) => resto;
const porFecha = (x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id);
export const paqueteProyecto = doc => ({doc: sinVersion(doc)});
export const paqueteObservacion = (obs, historial) => ({obs: sinVersion(obs), historial: [...historial].sort(porFecha)});

// Dos versiones de la misma observación: datos de la actualizada más tarde, fotos e historial de ambas.
export function fusionarObservacion(local, remoto) {
  const base = local.obs.actualizada > remoto.obs.actualizada ? local.obs : remoto.obs, otra = base === local.obs ? remoto.obs : local.obs;
  const ids = new Set(base.fotos.map(f => f.id));
  const fotos = [...base.fotos, ...otra.fotos.filter(f => !ids.has(f.id))].slice(0, MAX_FOTOS);
  const historial = new Map([...remoto.historial, ...local.historial].map(h => [h.id, h]));
  return {obs: {...base, fotos}, historial: [...historial.values()].sort(porFecha)};
}
// Avance de un recinto (registro de avance-store.mjs, clave «piso|código»). La clave lleva «|» y puntos, que la nube
// no acepta en el id: cada carácter fuera de [A-Za-z0-9-] se escribe como «_» y 4 cifras hexadecimales (reversible).
export const idAvance = key => 'av_' + String(key).replace(/[^A-Za-z0-9-]/g, c => '_' + c.charCodeAt(0).toString(16).padStart(4, '0'));
export const paqueteAvance = registro => ({registro: sinVersion(registro)});
// Dos versiones del avance del mismo recinto: en cada partida queda la marcada más tarde (su «at»; las que no llevan
// hora usan la del registro) y se juntan las que estén en una sola. Protocolos y firma, del registro más reciente.
// Una marca deshecha en un equipo mientras el otro tenía la partida puede volver: se corrige marcando de nuevo.
export function fusionarAvance(local, remoto) {
  const [base, otro] = (local.at || '') > (remoto.at || '') ? [local, remoto] : [remoto, local];
  const hora = (r, p) => p?.at || r.atSinHora || r.at || '';
  const partidas = {...(otro.partidas || {})};
  for (const [id, p] of Object.entries(base.partidas || {})) if (!partidas[id] || hora(base, p) >= hora(otro, partidas[id])) partidas[id] = p;
  return {...base, partidas, protocolos: {...(otro.protocolos || {}), ...(base.protocolos || {})}};
}
// Un proyecto cambiado en dos equipos se junta en uno solo, comparando con lo último sincronizado (la base):
// - lo que cambió solo en un lado se toma de ese lado; lo borrado en un lado y no tocado en el otro se borra;
// - las listas con «id» (recintos, estados, cortes) o «code» (filas de un levantamiento) se juntan elemento a elemento;
// - si los dos cambiaron el mismo dato, queda el del equipo que guardó más tarde (updatedAt) y se cuenta como choque.
// Sin base (proyectos sincronizados antes de guardarla) las listas se suman: algo borrado en un solo equipo puede volver.
// En los proyectos de recintos numerados, dos recintos nuevos con el mismo número reciben números nuevos.
const esObjeto = v => v && typeof v === 'object' && !Array.isArray(v);
const igual = (a, b) => canonico(a) === canonico(b);
function claveLista(...listas) {
  for (const k of ['id', 'code']) if (listas.every(l => l.every(x => esObjeto(x) && typeof x[k] === 'string') && new Set(l.map(x => x[k])).size === l.length)) return k;
  return null;
}
function fusionar3(base, loc, rem, ctx) {
  if (igual(loc, rem)) return rem;
  if (base !== undefined && igual(base, loc)) return rem;
  if (base !== undefined && igual(base, rem)) return loc;
  if (Array.isArray(loc) && Array.isArray(rem)) {
    const b = Array.isArray(base) ? base : [], k = claveLista(loc, rem, b);
    if (k) {
      const mb = new Map(b.map(x => [x[k], x])), ml = new Map(loc.map(x => [x[k], x])), mr = new Map(rem.map(x => [x[k], x])), out = [];
      for (const key of [...mr.keys(), ...[...ml.keys()].filter(x => !mr.has(x))]) {
        const enB = mb.get(key), enL = ml.get(key), enR = mr.get(key);
        if (enL && enR) out.push(fusionar3(enB, enL, enR, ctx));
        else if (enR) { if (!(enB && igual(enB, enR))) out.push(enR); }
        else if (!(enB && igual(enB, enL))) out.push(enL);
      }
      return out;
    }
  } else if (esObjeto(loc) && esObjeto(rem)) {
    const out = {};
    for (const key of new Set([...Object.keys(rem), ...Object.keys(loc)])) {
      const v = fusionar3(esObjeto(base) ? base[key] : undefined, loc[key], rem[key], ctx);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  ctx.choques++;
  return ctx.ganaLocal ? loc : rem;
}
export function fusionarProyecto(base, local, remoto) {
  const ctx = {choques: 0, ganaLocal: (local.updatedAt || '') > (remoto.updatedAt || '')};
  // La fecha de guardado no cuenta como choque: queda la del lado que guardó más tarde.
  const sinFecha = d => { if (!esObjeto(d)) return d; const {updatedAt, ...resto} = d; return resto; };
  let doc = fusionar3(sinFecha(base), sinFecha(local), sinFecha(remoto), ctx);
  doc = {...doc, updatedAt: ctx.ganaLocal ? local.updatedAt : remoto.updatedAt};
  if (Array.isArray(doc.rooms) && doc.rooms.every(r => Number.isSafeInteger(r?.number))) {
    let siguiente = Math.max(local.nextNumber || 1, remoto.nextNumber || 1, ...doc.rooms.map(r => r.number + 1));
    const usados = new Set();
    const rooms = doc.rooms.map(r => { if (!usados.has(r.number)) { usados.add(r.number); return r; } const n = {...r, number: siguiente++}; usados.add(n.number); return n; });
    doc = {...doc, rooms, nextNumber: siguiente};
  }
  return {doc, choques: ctx.choques};
}
// Copia del proyecto de este equipo cuando no se pudo juntar (el resultado no era un proyecto válido).
export function copiaProyecto(doc, id, at) {
  const sufijo = ' (copia de este equipo)';
  return {...doc, id, name: doc.name.slice(0, 160 - sufijo.length) + sufijo, createdAt: at, updatedAt: at, version: 1};
}

// Errores que cortan la sincronización completa: sin sesión, sin permiso o sin red. Los demás se cuentan y se sigue.
const corta = e => !e.status || e.status === 401 || e.status === 403;
const MARGEN = 5 * 60000;

// api(método, ruta, cuerpo, {tipo, binario}); local: almacenes de este equipo; meta: lo último sincronizado.
// validarProyecto: comprueba un proyecto juntado; sin él, un choque deja la versión de este equipo como copia.
export function crearSincronizador({api, local, meta, avisar = () => {}, nuevoId = () => crypto.randomUUID(), ahora = () => new Date().toISOString(), validarProyecto = null}) {
  // Lo último sincronizado de cada proyecto se guarda como base para juntar cambios hechos en dos equipos.
  const datosMeta = (tipo, version, h, data) => ({version, huella: h, ...(tipo === 'proyecto' ? {base: data} : {})});
  function unir(m, doc, remoto) {
    if (!validarProyecto) return null;
    try { const r = fusionarProyecto(m?.base?.doc, sinVersion(doc), remoto); validarProyecto(r.doc); return r; } catch { return null; }
  }
  async function aplicar(r, locales, resumen) {
    const clave = r.tipo + ':' + r.id, m = await meta.leer(clave);
    if (m && m.version >= r.version) return;
    const hr = huella(r.data);
    if (r.tipo === 'proyecto') {
      const doc = locales.proyectos.get(r.id), hl = doc && huella(paqueteProyecto(doc));
      if (doc && hl !== hr && (!m || hl !== m.huella)) {
        const unido = unir(m, doc, r.data.doc);
        if (unido) {
          locales.proyectos.set(r.id, await local.escribirProyecto(unido.doc)); resumen.conflictos++;
          avisar(`El proyecto «${doc.name}» también cambió en otro equipo. Se juntaron los cambios de ambos${unido.choques ? '; donde los dos cambiaron lo mismo quedó lo guardado más tarde' : ''}.`);
          await meta.escribir(clave, datosMeta(r.tipo, r.version, hr, r.data));
          return;
        }
        const copia = copiaProyecto(doc, nuevoId(), ahora());
        await local.crearProyecto(copia); locales.proyectos.set(copia.id, copia); resumen.conflictos++;
        avisar(`El proyecto «${doc.name}» también cambió en otro equipo. Tu versión quedó como «${copia.name}».`);
      }
      if (!doc || hl !== hr) { locales.proyectos.set(r.id, await local.escribirProyecto(r.data.doc)); resumen.bajados++; }
    } else if (r.tipo === 'observacion') {
      const loc = locales.observaciones.get(r.id), propio = loc && paqueteObservacion(loc.obs, loc.historial), hl = propio && huella(propio);
      if (loc && hl !== hr && (!m || hl !== m.huella)) {
        const f = fusionarObservacion(propio, r.data);
        locales.observaciones.set(r.id, {obs: await local.escribirObservacion(f.obs, f.historial), historial: f.historial}); resumen.conflictos++;
        avisar(`La observación de ${r.data.obs.room.code} también cambió en otro equipo. Se juntaron ambos historiales y fotos.`);
      } else if (!loc || hl !== hr) {
        locales.observaciones.set(r.id, {obs: await local.escribirObservacion(r.data.obs, r.data.historial), historial: r.data.historial}); resumen.bajados++;
      }
    } else if (r.tipo === 'avance') {
      if (!local.escribirAvance) return;
      const remoto = r.data?.registro;
      // Registro incompleto o con un id que no es el de su clave: se cuenta como error y se sigue con los demás.
      const valido = remoto && typeof remoto.at === 'string' && remoto.partidas && typeof remoto.partidas === 'object'
        && remoto.key === remoto.level + '|' + String(remoto.code).trim() && idAvance(remoto.key) === r.id;
      if (!valido) { resumen.errores++; return; }
      const loc = locales.avances.get(r.id), hl = loc && huella(paqueteAvance(loc));
      if (loc && hl !== hr && (!m || hl !== m.huella)) {
        locales.avances.set(r.id, await local.escribirAvance(fusionarAvance(sinVersion(loc), remoto))); resumen.conflictos++;
        avisar(`El avance de ${remoto.code} también cambió en otro equipo. Se juntaron ambos: en cada partida quedó la marca más reciente.`);
      } else if (!loc || hl !== hr) { locales.avances.set(r.id, await local.escribirAvance(remoto)); resumen.bajados++; }
    } else return;
    await meta.escribir(clave, datosMeta(r.tipo, r.version, hr, r.data));
  }

  // Sube lo que cambió desde la última sincronización; si otro equipo se adelantó (409), se aplica lo suyo y se reintenta.
  async function subir(locales, resumen) {
    let otraVuelta = false;
    for (const [tipo, mapa, paquete] of [['proyecto', locales.proyectos, d => paqueteProyecto(d)], ['observacion', locales.observaciones, o => paqueteObservacion(o.obs, o.historial)], ['avance', locales.avances, paqueteAvance]]) {
      for (const [id, valor] of mapa) {
        const clave = tipo + ':' + id, m = await meta.leer(clave), data = paquete(valor), h = huella(data);
        if (m && m.huella === h) continue;
        try {
          const r = await api('POST', '/api/campo', {tipo, id, version: m?.version || 0, data});
          await meta.escribir(clave, datosMeta(tipo, r.version, h, data)); resumen.subidos++;
        } catch (e) {
          if (e.status === 409 && e.data?.registro) { await aplicar(e.data.registro, locales, resumen); otraVuelta = true; }
          else if (corta(e)) throw e;
          else resumen.errores++;
        }
      }
    }
    return otraVuelta;
  }

  // Las fotos se suben antes que las observaciones para que los otros equipos las encuentren.
  async function subirFotos(resumen) {
    for (const id of await local.idsFotos()) {
      if (await meta.fotoLista(id)) continue;
      const f = await local.leerFoto(id); if (!f) continue;
      try {
        await api('PUT', '/api/campo/fotos/' + id, f.datos, {tipo: 'image/jpeg'});
        if (f.mini) await api('PUT', '/api/campo/fotos/' + id + '.mini', f.mini, {tipo: 'image/jpeg'});
        await meta.marcarFoto(id); resumen.fotosSubidas++;
      } catch (e) { if (corta(e)) throw e; resumen.errores++; }
    }
  }
  async function bajarFotos(locales, resumen) {
    const tengo = await local.idsFotos();
    for (const {obs} of locales.observaciones.values()) for (const ref of obs.fotos) {
      if (tengo.has(ref.id)) continue;
      try {
        const datos = await api('GET', '/api/campo/fotos/' + ref.id, null, {binario: true});
        const mini = await api('GET', '/api/campo/fotos/' + ref.id + '.mini', null, {binario: true}).catch(e => { if (e.status === 404) return datos; throw e; });
        await local.guardarFoto({id: ref.id, obsId: obs.id, tipo: ref.tipo, at: ref.at, autor: ref.autor, mime: 'image/jpeg', bytes: datos.byteLength, datos, mini});
        await meta.marcarFoto(ref.id); tengo.add(ref.id); resumen.fotosBajadas++;
      } catch (e) { if (e.status === 404) resumen.fotosEsperando++; else if (corta(e)) throw e; else resumen.errores++; }
    }
  }

  // Cambios de este equipo que aún no están en la nube, con la misma comparación que usa «subir».
  async function pendientes() {
    const cuenta = {proyectos: 0, observaciones: 0, avances: 0, fotos: 0};
    // Con meta.todos / meta.fotosListas se lee todo de una vez (contar es frecuente; leer registro a registro es lento).
    const todos = meta.todos ? new Map((await meta.todos()).map(r => [r.clave, r])) : null, leer = k => todos ? todos.get(k) : meta.leer(k);
    const fotosListas = meta.fotosListas ? new Set(await meta.fotosListas()) : null;
    const revisar = async (tipo, lista, id, paquete) => { for (const v of lista) { const m = await leer(tipo + ':' + id(v)); if (!m || m.huella !== huella(paquete(v))) cuenta[tipo === 'proyecto' ? 'proyectos' : tipo === 'observacion' ? 'observaciones' : 'avances']++; } };
    await revisar('proyecto', await local.proyectos(), d => d.id, paqueteProyecto);
    await revisar('observacion', await local.observaciones(), o => o.obs.id, o => paqueteObservacion(o.obs, o.historial));
    if (local.avances) await revisar('avance', await local.avances(), a => idAvance(a.key), paqueteAvance);
    for (const id of await local.idsFotos()) if (!(fotosListas ? fotosListas.has(id) : await meta.fotoLista(id))) cuenta.fotos++;
    return {...cuenta, total: cuenta.proyectos + cuenta.observaciones + cuenta.avances + cuenta.fotos};
  }
  sincronizar.pendientes = pendientes;
  return sincronizar;
  async function sincronizar(rol) {
    const resumen = {bajados: 0, subidos: 0, conflictos: 0, fotosSubidas: 0, fotosBajadas: 0, fotosEsperando: 0, errores: 0};
    const locales = {proyectos: new Map((await local.proyectos()).map(d => [d.id, d])), observaciones: new Map((await local.observaciones()).map(o => [o.obs.id, o])),
      avances: new Map((local.avances ? await local.avances() : []).map(a => [idAvance(a.key), a]))};
    const desde = await meta.desde();
    const {registros} = await api('GET', '/api/campo' + (desde ? '?desde=' + encodeURIComponent(desde) : ''));
    let ultimo = 0;
    for (const r of registros) {
      try { await aplicar(r, locales, resumen); } catch (e) { if (corta(e)) throw e; resumen.errores++; }
      ultimo = Math.max(ultimo, Date.parse(r.updated_at) || 0);
    }
    // Margen hacia atrás: un guardado que terminó tarde puede traer una hora anterior; lo repetido se ignora por versión.
    if (ultimo) await meta.guardarDesde(new Date(ultimo - MARGEN).toISOString());
    if (rol === 'editor') {
      await subirFotos(resumen);
      for (let vuelta = 0; vuelta < 3 && await subir(locales, resumen); vuelta++);
    }
    await bajarFotos(locales, resumen);
    return resumen;
  };
}
