// One compact request supplies everything needed to browse the plan of the active level.
import {datos} from './level.mjs';
let pending;
export function decodeRuntime(bundle) {
  if (bundle.schema !== 1) throw new Error('Versión de datos no compatible. Recarga Atlas.');
  const {catalog: c} = bundle;
  const rooms = c.rows.map(row => {
    const r = Object.fromEntries(c.fields.map((key, i) => [key, row[i]]));
    for (const key of c.pooledFields) r[key] = c.strings[r[key]];
    r.notes = r.notes.map(i => c.strings[i]);
    r.finishes = r.finishes.map(([i, bbox]) => ({...c.finishes[i], bbox}));
    return r;
  });
  return {...bundle, data: {...c.base, rooms}};
}
export function loadRuntime() {
  if (!pending) pending = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      // contornos.json: correcciones del editor interno de contornos; si falta, el plano usa sus contornos originales.
      const [response, contornos] = await Promise.all([fetch(datos('runtime.json'), {signal: controller.signal}), fetch(datos('contornos.json'), {signal: controller.signal}).then(r => r.ok ? r.json() : null).catch(() => null)]);
      if (!response.ok) throw new Error('No se pudieron cargar las fichas. Reintenta con conexión.');
      return {...decodeRuntime(await response.json()), contornos: contornos?.recintos || []};
    } catch (error) {
      pending = null;
      if (error.name === 'AbortError') throw new Error('La conexión está tardando. Reintenta; el plano guardado se abre sin internet.');
      throw error;
    } finally { clearTimeout(timer); }
  })();
  return pending;
}
