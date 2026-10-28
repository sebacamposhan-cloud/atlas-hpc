// Ubicación de un protocolo de la matriz en el plano según sus ejes (columna EJES), por ejemplo «AD-AG/A3-A5».
// La primera A es el edificio: AD, AG… son ejes con letra (una fila de pilares) y A3, A5… ejes numerados.
// Se encuadra exactamente entre los ejes extremos de cada tipo: zona (dos y dos), tramo sobre un eje (uno y dos),
// pilar en un cruce (uno y uno) o franja (un solo tipo). El texto antes o después de los ejes se informa como ignorado.
const SEPARADORES = new Set(['A', 'Y', 'EJE', 'EJES', 'ENTRE', 'DESDE', 'HASTA']);
const LETRA = /^A[A-Z]\d?'?$/, NUMERO = /^A\d{1,2}[A-Z]?'?$/, LETRA_SOLA = /^[B-Z]$/, NUMERO_SOLO = /^\d{1,2}$/;
const reconocida = p => LETRA.test(p) || NUMERO.test(p) || LETRA_SOLA.test(p) || NUMERO_SOLO.test(p) || SEPARADORES.has(p);
const deEdificio = p => LETRA.test(p) || NUMERO.test(p);

// Ejes que nombra el texto: {letras, numeros, ignorado} o null si no nombra ejes reconocibles.
export function leerEjes(texto) {
  const original = String(texto ?? '').replace(/[–—]/g, '-');
  const palabras = [...original.matchAll(/[^\s\-\/,;:+&]+/g)].map(m => ({p: m[0].toUpperCase(), desde: m.index, hasta: m.index + m[0].length}));
  // Lo que antecede al primer eje («Nucleo N4P AM-AN/…», «Voladizo AW/…») se salta.
  const inicio = Math.max(0, palabras.findIndex(w => deEdificio(w.p)));
  const leidas = [];
  let fin = inicio;
  for (let i = inicio; i < palabras.length; i++) {
    const {p} = palabras[i];
    if (reconocida(p)) { leidas.push(p); fin = i + 1; continue; }
    // Ejes escritos juntos («A1A11», «A9AE») se separan antes de cada A.
    const partes = p.split(/(?=A[A-Z0-9])/).filter(Boolean);
    if (partes.length > 1 && partes.every(deEdificio)) { leidas.push(...partes); fin = i + 1; continue; }
    break;
  }
  const conEdificio = leidas.filter(deEdificio);
  let letras, numeros;
  if (conEdificio.length) {
    letras = conEdificio.filter(p => LETRA.test(p));
    numeros = [...conEdificio.filter(p => NUMERO.test(p)), ...leidas.filter(p => NUMERO_SOLO.test(p)).map(p => 'A' + p)];
  } else {
    // Formato sin la A del edificio («B-O/4-5»): solo si trae letras y números, para no leer «S/N» como ejes.
    letras = leidas.filter(p => LETRA_SOLA.test(p) && !SEPARADORES.has(p)).map(p => 'A' + p);
    numeros = leidas.filter(p => NUMERO_SOLO.test(p)).map(p => 'A' + p);
    if (!letras.length || !numeros.length) return null;
  }
  if (!letras.length && !numeros.length) return null;
  const limpiar = s => s.replace(/^[\s\-\/,;:+&]+|[\s\-\/,;:+&]+$/g, '').trim();
  const ignorado = [palabras[inicio] ? limpiar(original.slice(0, palabras[inicio].desde)) : '', fin < palabras.length ? limpiar(original.slice(palabras[fin - 1]?.hasta ?? 0)) : ''].filter(Boolean).join(' … ');
  return {letras: [...new Set(letras)], numeros: [...new Set(numeros)].map(n => n.replace(/^A0(\d)/, 'A$1')), ignorado};
}

const resta = (a, b) => [a[0] - b[0], a[1] - b[1]], producto = (a, b) => a[0] * b[0] + a[1] * b[1], distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function cruce(r, s) {
  const d = r.u[0] * s.u[1] - r.u[1] * s.u[0];
  if (Math.abs(d) < 1e-9) return null;
  const t = ((s.a[0] - r.a[0]) * s.u[1] - (s.a[1] - r.a[1]) * s.u[0]) / d;
  return [r.a[0] + r.u[0] * t, r.a[1] + r.u[1] * t];
}

// Grilla del piso (dist/<piso>/ejes.json). Un eje que no está («A12B») se aproxima a su base («A12») y se avisa.
export function crearGrilla(datos) {
  const ejes = new Map();
  for (const e of datos?.ejes || []) {
    const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    if (L > 0) ejes.set(e.id, {...e, u: [(e.b[0] - e.a[0]) / L, (e.b[1] - e.a[1]) / L], L});
  }
  const separacion = (() => {
    const n = [...ejes.values()].filter(e => e.tipo === 'numero').map(e => e.a[0]).sort((a, b) => a - b), pasos = n.slice(1).map((x, i) => x - n[i]).filter(p => p > 1).sort((a, b) => a - b);
    return pasos[Math.floor(pasos.length / 2)] || 400;
  })();
  function resolver(id) {
    if (ejes.has(id)) return {eje: ejes.get(id), aproximado: false};
    const base = id.replace(/'$/, '').replace(/^(A\d{1,2})[A-Z]$/, '$1').replace(/^(A[A-Z])\d$/, '$1');
    return ejes.has(base) ? {eje: ejes.get(base), aproximado: true} : null;
  }
  return {ejes, separacion, resolver, metros: Number(datos?.metrosPorUnidad) || 0.0176389};
}

// Geometría exacta del protocolo en coordenadas del plano, con medidas en metros.
// estado: 'ok', 'sin-ejes' (no nombra ejes) o 'faltan' (nombra ejes que no están en la grilla).
export function ubicarEjes(texto, grilla) {
  const leidos = leerEjes(texto);
  if (!leidos) return {estado: 'sin-ejes'};
  const resueltos = [...leidos.letras, ...leidos.numeros].map(id => [id, grilla.resolver(id)]), faltan = resueltos.filter(([, r]) => !r).map(([id]) => id);
  if (faltan.length) return {estado: 'faltan', faltan, ignorado: leidos.ignorado};
  const aproximados = resueltos.filter(([, r]) => r.aproximado).map(([id, r]) => ({id, base: r.eje.id}));
  const de = ids => [...new Map(ids.map(id => grilla.resolver(id).eje).map(e => [e.id, e])).values()];
  // Extremos de un grupo de ejes paralelos: los de menor y mayor distancia sobre su normal común.
  const extremos = lista => {
    if (!lista.length) return [];
    const n = [-lista[0].u[1], lista[0].u[0]], orden = [...lista].sort((x, y) => producto(x.a, n) - producto(y.a, n));
    return orden.length > 1 ? [orden[0], orden.at(-1)] : [orden[0]];
  };
  const L = extremos(de(leidos.letras)), N = extremos(de(leidos.numeros)), m = grilla.metros;
  let tipo, poligono = null, linea = null, punto = null;
  if (L.length && N.length) {
    const esquinas = [cruce(L[0], N[0]), cruce(L.at(-1), N[0]), cruce(L.at(-1), N.at(-1)), cruce(L[0], N.at(-1))];
    if (esquinas.some(p => !p)) return {estado: 'faltan', faltan: [], ignorado: leidos.ignorado};
    if (L.length > 1 && N.length > 1) { tipo = 'zona'; poligono = esquinas; }
    else if (L.length === 1 && N.length === 1) { tipo = 'punto'; punto = esquinas[0]; }
    else { tipo = 'tramo'; linea = [esquinas[0], esquinas[2]]; }
  } else {
    // Solo ejes de un tipo: franja entre ellos (o el eje completo), en el tramo que comparten.
    const lista = L.length ? L : N, u = lista[0].u, t = p => producto(resta(p, lista[0].a), u);
    const desde = Math.max(...lista.map(e => Math.min(t(e.a), t(e.b)))), hasta = Math.min(...lista.map(e => Math.max(t(e.a), t(e.b))));
    const sobre = (e, s) => { const base = producto(resta(e.a, lista[0].a), u); return [e.a[0] + u[0] * (s - base), e.a[1] + u[1] * (s - base)]; };
    tipo = 'franja';
    if (lista.length > 1) poligono = [sobre(lista[0], desde), sobre(lista[0], hasta), sobre(lista.at(-1), hasta), sobre(lista.at(-1), desde)];
    else linea = [sobre(lista[0], desde), sobre(lista[0], hasta)];
  }
  const puntos = poligono || linea || [punto], xs = puntos.map(p => p[0]), ys = puntos.map(p => p[1]);
  const caja = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  const medidas = poligono ? {lados: [distancia(poligono[0], poligono[1]) * m, distancia(poligono[1], poligono[2]) * m],
    area: Math.abs(poligono.reduce((s, p, i) => { const q = poligono[(i + 1) % poligono.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2 * m * m}
    : linea ? {largo: distancia(linea[0], linea[1]) * m} : null;
  const rango = ids => { const orden = [...ids].sort((a, b) => a.localeCompare(b, 'es', {numeric: true})); return orden.length > 1 ? orden[0] + '–' + orden.at(-1) : orden[0] || ''; };
  return {estado: 'ok', tipo, poligono, linea, punto, caja, centro: [caja[0] + caja[2] / 2, caja[1] + caja[3] / 2], medidas,
    aproximado: aproximados.length > 0, aproximados, ignorado: leidos.ignorado,
    etiqueta: [rango(L.map(e => e.id)), rango(N.map(e => e.id))].filter(Boolean).join(' / ')};
}

const numero = (v, d = 1) => v.toLocaleString('es-CL', {minimumFractionDigits: d, maximumFractionDigits: d});
// Medidas legibles: «8,2 × 16,4 m · 134,5 m²», «tramo de 73,8 m» o «pilar».
export function textoMedidas(u) {
  if (!u?.medidas) return u?.tipo === 'punto' ? 'pilar del cruce' : '';
  if (u.medidas.largo != null) return 'tramo de ' + numero(u.medidas.largo) + ' m';
  const [a, b] = u.medidas.lados;
  return `${numero(a)} × ${numero(b)} m · ${numero(u.medidas.area)} m²`;
}
// Por qué un folio no se dibuja, citando lo que dice la matriz.
export function motivoSinUbicar(texto, u) {
  if (!String(texto ?? '').trim() || String(texto).trim() === 'null') return 'La celda EJES está vacía en la matriz.';
  if (u.estado === 'faltan' && u.faltan.length) return 'Nombra ejes que no están en la grilla del plano: ' + u.faltan.join(', ') + '.';
  if (u.estado === 'faltan') return 'Sus ejes son paralelos y no forman un cruce.';
  return 'El texto no nombra ejes del edificio A (AA…AW con A0…A12).';
}

// Número de protocolo a tres cifras (folio 7 → «007»); si el folio no es un número, se muestra tal cual.
export const numeroProtocolo = folio => { const f = String(folio ?? '').trim(); return /^\d{1,3}$/.test(f) ? f.padStart(3, '0') : f || 's/n'; };
