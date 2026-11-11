// Devolver la planilla de la oficina con lo marcado en terreno: se elige la misma planilla (.xlsx) y Atlas escribe, en las
// celdas de % de cada etapa, lo que terreno marcó después de la última carga. Se edita el XML de las hojas dentro del
// archivo: fórmulas, formato, tablas dinámicas y demás quedan como estaban; Excel recalcula al abrir. Las celdas con
// fórmula no se tocan (se informan).
import {leerHoja, normalizarCodigo, familiaDePartida, etapasDe} from './planilla-avance-model.mjs';

// Avance de terreno posterior a la carga, por partida de la planilla: familia → código → % de cada etapa.
export function avanceDeTerreno(planilla, reporte) {
  const out = new Map(); let sinEtapas = 0;
  for (const fila of reporte?.filas || []) {
    const fams = planilla?.recintos?.[fila.code]; if (!fams) continue;
    for (const n of fila.nodos || []) {
      if (n.tipo !== 'partida' || n.id === '6.2.2' || !n.registrada || n.fuente === 'planilla') continue;
      const fam = familiaDePartida(n.id, fams); if (!fam) continue;
      const etapas = etapasDe(planilla, fam); if (!etapas.length) continue;
      const et = n.etapas?.length === etapas.length ? n.etapas.map(e => e.pct) : n.ejecucion === 'Instalado' ? etapas.map(() => 1) : n.ejecucion === 'No iniciado' ? etapas.map(() => 0) : null;
      if (!et) { sinEtapas++; continue; }
      if (!out.has(fam)) out.set(fam, new Map());
      out.get(fam).set(fila.code, et);
    }
  }
  return {porFamilia: out, sinEtapas};
}

// Celdas que cambian: hojas = [{nombre, aoa, origen: {r, c}}] (origen: primera celda del rango de la hoja).
export function celdasDevolver(hojas, porFamilia, conocidos) {
  const celdas = [], recintos = new Set(), hojasUsadas = new Set();
  const ref = (r, c) => { let s = '', n = c + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s + (r + 1); };
  for (const {nombre, aoa, origen = {r: 0, c: 0}} of hojas) {
    const h = leerHoja(nombre, aoa); if (!h.bloques) continue;
    for (const b of h.bloques) {
      const mapa = porFamilia.get(b.familia); if (!mapa) continue;
      for (const f of b.filas) {
        const code = normalizarCodigo(f.codigo, conocidos), et = code && mapa.get(code); if (!et) continue;
        b.cols.forEach((col, k) => {
          const actual = aoa[f.fila]?.[col], nuevo = Math.round((et[k] ?? 0) * 1000) / 1000;
          if (typeof actual === 'number' && Math.abs(actual - nuevo) < 0.0005) return;
          if ((actual == null || actual === '') && nuevo === 0) return;
          celdas.push({hoja: nombre, ref: ref(origen.r + f.fila, origen.c + col), valor: nuevo, code});
          recintos.add(code); hojasUsadas.add(nombre);
        });
      }
    }
  }
  return {celdas, recintos: recintos.size, hojas: hojasUsadas.size};
}

// ---------- Edición del XML de una hoja ----------
const colNum = ref => ref.match(/^[A-Z]+/)[0].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
const filaNum = ref => Number(ref.match(/\d+$/)[0]);
// Escribe un número en la celda. Devuelve el XML nuevo, o null si la celda tiene fórmula o la fila no existe.
export function escribirCelda(xml, ref, valor) {
  const r = filaNum(ref), v = String(valor);
  const inicioFila = xml.search(new RegExp(`<row [^>]*r="${r}"[ >/]`)); if (inicioFila < 0) return null;
  const finCab = xml.indexOf('>', inicioFila), cabecera = xml.slice(inicioFila, finCab + 1);
  if (cabecera.endsWith('/>')) return xml.slice(0, inicioFila) + cabecera.slice(0, -2) + `><c r="${ref}"><v>${v}</v></c></row>` + xml.slice(finCab + 1);
  const finFila = xml.indexOf('</row>', finCab), cuerpo = xml.slice(finCab + 1, finFila);
  const celda = new RegExp(`<c r="${ref}"(\\s[^>]*?)?(/>|>([\\s\\S]*?)</c>)`).exec(cuerpo);
  let nuevo;
  if (celda) {
    if (/<f[\s>]/.test(celda[3] || '')) return null;
    const attrs = (celda[1] || '').replace(/\s+t="[^"]*"/, '');
    nuevo = cuerpo.slice(0, celda.index) + `<c r="${ref}"${attrs}><v>${v}</v></c>` + cuerpo.slice(celda.index + celda[0].length);
  } else {
    // Celda vacía sin registro: se inserta en orden de columna.
    const objetivo = colNum(ref), re = /<c r="([A-Z]+)\d+"/g; let m, pos = cuerpo.length;
    while ((m = re.exec(cuerpo))) if (colNum(m[1]) > objetivo) { pos = m.index; break; }
    nuevo = cuerpo.slice(0, pos) + `<c r="${ref}"><v>${v}</v></c>` + cuerpo.slice(pos);
  }
  return xml.slice(0, finCab + 1) + nuevo + xml.slice(finFila);
}

// Escribe las celdas en el archivo (bytes del .xlsx) con la biblioteca XLSX (su lector y escritor ZIP, CFB).
export function escribirPlanilla(XLSX, bytes, celdas) {
  const CFB = XLSX.CFB, zip = CFB.read(bytes, {type: 'array'}), dec = new TextDecoder(), enc = new TextEncoder();
  const leer = ruta => { const e = CFB.find(zip, ruta); return e ? dec.decode(e.content) : null; };
  const poner = (ruta, texto) => { const e = CFB.find(zip, ruta), b = enc.encode(texto); e.content = b; e.size = b.length; };
  const libro = leer('/xl/workbook.xml'), rels = leer('/xl/_rels/workbook.xml.rels');
  if (!libro || !rels) throw Error('El archivo no parece una planilla de Excel (.xlsx).');
  const decodificar = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const rutaDe = nombre => {
    const hoja = [...libro.matchAll(/<sheet\b[^>]*>/g)].map(m => m[0]).find(t => decodificar(/name="([^"]*)"/.exec(t)?.[1] || '') === nombre); if (!hoja) return null;
    const id = /r:id="([^"]+)"/.exec(hoja)?.[1], rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(t => t.includes(`Id="${id}"`));
    const destino = /Target="([^"]+)"/.exec(rel || '')?.[1]; if (!destino) return null;
    return destino.startsWith('/') ? destino : '/xl/' + destino.replace(/^\.\//, '');
  };
  let escritas = 0, conFormula = 0, sinFila = 0;
  const porHoja = new Map(); for (const c of celdas) { if (!porHoja.has(c.hoja)) porHoja.set(c.hoja, []); porHoja.get(c.hoja).push(c); }
  for (const [nombre, lista] of porHoja) {
    const ruta = rutaDe(nombre); if (!ruta) { sinFila += lista.length; continue; }
    let xml = leer(ruta);
    for (const c of lista) { const nuevo = escribirCelda(xml, c.ref, c.valor); if (nuevo == null) { if (/<row [^>]*r="\d+"/.test(xml) && new RegExp(`<row [^>]*r="${filaNum(c.ref)}"[ >/]`).test(xml)) conFormula++; else sinFila++; continue; } xml = nuevo; escritas++; }
    poner(ruta, xml);
  }
  // Excel recalcula todo al abrir (totales y ponderados de la oficina).
  const libroNuevo = /<calcPr\b/.test(libro) ? libro.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, a, cierre) => `<calcPr${a.replace(/\s+fullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"${cierre}>`) : libro.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  poner('/xl/workbook.xml', libroNuevo);
  return {bytes: CFB.write(zip, {fileType: 'zip', type: 'array', compression: true}), escritas, conFormula, sinFila};
}

const n = (k, uno, varios) => `${k} ${k === 1 ? uno : varios}`;
// Interfaz: lee el archivo elegido, escribe lo de terreno y descarga la copia.
export async function devolverPlanilla(archivo, {planilla, reporte, nivel}) {
  if (!planilla) throw Error('Primero carga la planilla de avance de este piso.');
  if (!/\.xls[xm]$/i.test(archivo.name)) throw Error('Elige la planilla de avance en formato Excel (.xlsx).');
  const {porFamilia, sinEtapas} = avanceDeTerreno(planilla, reporte);
  if (!porFamilia.size) throw Error('No hay avance marcado en terreno después de la última carga (' + planilla.cargada.slice(0, 10).split('-').reverse().join('-') + ').');
  const {loadVendor} = await import('./vendor-loader.mjs'); await loadVendor('xlsx');
  const X = window.XLSX, bytes = new Uint8Array(await archivo.arrayBuffer()), libro = X.read(bytes, {type: 'array'});
  const hojas = libro.SheetNames.filter((_, i) => !libro.Workbook?.Sheets?.[i]?.Hidden).map(nombre => { const ws = libro.Sheets[nombre]; return {nombre, origen: ws['!ref'] ? X.utils.decode_range(ws['!ref']).s : {r: 0, c: 0}, aoa: X.utils.sheet_to_json(ws, {header: 1, raw: true, defval: null})}; });
  const {pisoDeLibro} = await import('./planilla-avance-model.mjs');
  if (pisoDeLibro(hojas, archivo.name) !== nivel) throw Error('Esta planilla es de otro piso: elige la del piso activo.');
  const plan = celdasDevolver(hojas, porFamilia, new Set(Object.keys(planilla.recintos)));
  if (!plan.celdas.length) return {mensaje: 'La planilla ya tiene lo marcado en terreno: no hay celdas que cambiar.'};
  const r = escribirPlanilla(X, bytes, plan.celdas);
  const hoy = new Intl.DateTimeFormat('es-CL', {timeZone: 'America/Santiago', day: '2-digit', month: '2-digit'}).format(new Date()).replace('/', '-');
  const url = URL.createObjectURL(new Blob([r.bytes], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})), a = document.createElement('a');
  a.href = url; a.download = archivo.name.replace(/\.xls[xm]$/i, '') + ` (terreno ${hoy}).xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 20000);
  return {...r, mensaje: `Planilla descargada con lo de terreno: ${n(r.escritas, 'celda', 'celdas')} en ${n(plan.recintos, 'recinto', 'recintos')} de ${n(plan.hojas, 'hoja', 'hojas')}.`
    + (r.conFormula ? ` ${r.conFormula} celdas con fórmula no se tocaron.` : '') + (r.sinFila ? ` ${r.sinFila} celdas no se encontraron en el archivo.` : '')
    + (sinEtapas ? ` ${sinEtapas} partidas en ejecución sin etapas marcadas no se escriben: marca sus etapas en el rombo.` : '') + ' Revísala y vuelve a cargarla como la planilla de la semana.'};
}
