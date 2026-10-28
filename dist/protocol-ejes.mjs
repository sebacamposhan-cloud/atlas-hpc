// Ubicación de un protocolo de la matriz en el plano según sus ejes (columna EJES), por ejemplo «AD-AG/A3-A5».
// La primera A es el edificio: AD, AG… son ejes con letra (una fila de pilares) y A3, A5… ejes numerados.
// Se encuadra el rectángulo entre los ejes extremos de cada tipo; un eje de un tipo y dos del otro marcan un tramo,
// y un eje de cada tipo, el pilar de su cruce. El texto que sigue a los ejes («(Colada 5.1)», «Tipo B»…) se ignora.
const SEPARADORES = new Set(['A', 'Y', 'EJE', 'EJES', 'ENTRE', 'DESDE', 'HASTA']);
const LETRA = /^A[A-Z]\d?'?$/, NUMERO = /^A\d{1,2}[A-Z]?'?$/, LETRA_SOLA = /^[B-Z]$/, NUMERO_SOLO = /^\d{1,2}$/;
const reconocida = p => LETRA.test(p) || NUMERO.test(p) || LETRA_SOLA.test(p) || NUMERO_SOLO.test(p) || SEPARADORES.has(p);

// Ejes que nombra el texto: {letras, numeros} o null si no empieza con ejes reconocibles.
export function leerEjes(texto) {
  const todas = String(texto ?? '').toUpperCase().replace(/[–—]/g, '-').trim().split(/[\s\-\/,;:+&]+/).filter(Boolean);
  // Lo que antecede al primer eje («Voladizo AW/A4-A11», «ESC. 5 AH-AI/…») se salta.
  const inicio = todas.findIndex(p => LETRA.test(p) || NUMERO.test(p)), palabras = inicio > 0 ? todas.slice(inicio) : todas;
  const leidas = [];
  for (const p of palabras) {
    if (reconocida(p)) { leidas.push(p); continue; }
    // Ejes escritos juntos («A1A11», «A9AE») se separan antes de cada A.
    const partes = p.split(/(?=A[A-Z0-9])/).filter(Boolean);
    if (partes.length > 1 && partes.every(x => LETRA.test(x) || NUMERO.test(x))) { leidas.push(...partes); continue; }
    break;
  }
  const conEdificio = leidas.filter(p => LETRA.test(p) || NUMERO.test(p));
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
  return {letras: [...new Set(letras)], numeros: [...new Set(numeros)].map(n => n.replace(/^A0(\d)/, 'A$1'))};
}

const resta = (a, b) => [a[0] - b[0], a[1] - b[1]], producto = (a, b) => a[0] * b[0] + a[1] * b[1];
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
  return {ejes, separacion, resolver};
}

// Polígono del protocolo en coordenadas del plano. estado: 'ok', 'sin-ejes' (texto sin ejes) o 'faltan' (ejes que no están en el plano).
export function ubicarEjes(texto, grilla) {
  const leidos = leerEjes(texto);
  if (!leidos) return {estado: 'sin-ejes'};
  const resueltos = [...leidos.letras, ...leidos.numeros].map(id => [id, grilla.resolver(id)]), faltan = resueltos.filter(([, r]) => !r).map(([id]) => id);
  if (faltan.length) return {estado: 'faltan', faltan};
  const aproximado = resueltos.some(([, r]) => r.aproximado);
  const de = ids => [...new Map(ids.map(id => grilla.resolver(id).eje).map(e => [e.id, e])).values()];
  // Extremos de un grupo de ejes paralelos: los de menor y mayor distancia sobre su normal común.
  const extremos = lista => {
    if (!lista.length) return [];
    const n = [-lista[0].u[1], lista[0].u[0]], orden = [...lista].sort((x, y) => producto(x.a, n) - producto(y.a, n));
    return orden.length > 1 ? [orden[0], orden.at(-1)] : [orden[0]];
  };
  const L = extremos(de(leidos.letras)), N = extremos(de(leidos.numeros)), w = grilla.separacion;
  let tipo, poligono;
  const banda = (p, q, ancho) => { const d = resta(q, p), largo = Math.hypot(...d) || 1, n = [-d[1] / largo * ancho, d[0] / largo * ancho]; return [[p[0] + n[0], p[1] + n[1]], [q[0] + n[0], q[1] + n[1]], [q[0] - n[0], q[1] - n[1]], [p[0] - n[0], p[1] - n[1]]]; };
  if (L.length && N.length) {
    const esquinas = [cruce(L[0], N[0]), cruce(L.at(-1), N[0]), cruce(L.at(-1), N.at(-1)), cruce(L[0], N.at(-1))];
    if (esquinas.some(p => !p)) return {estado: 'faltan', faltan: []};
    if (L.length > 1 && N.length > 1) { tipo = 'zona'; poligono = esquinas; }
    else if (L.length === 1 && N.length === 1) { tipo = 'punto'; const c = esquinas[0], r = w * 0.09; poligono = [[c[0] - r, c[1] - r], [c[0] + r, c[1] - r], [c[0] + r, c[1] + r], [c[0] - r, c[1] + r]]; }
    else { tipo = 'tramo'; poligono = banda(esquinas[0], esquinas[2], w * 0.06); }
  } else {
    // Solo ejes de un tipo: franja a lo largo de ellos, en el tramo que comparten.
    const lista = L.length ? L : N, u = lista[0].u, t = (e, p) => producto(resta(p, lista[0].a), u);
    const desde = Math.max(...lista.map(e => Math.min(t(e, e.a), t(e, e.b)))), hasta = Math.min(...lista.map(e => Math.max(t(e, e.a), t(e, e.b))));
    const punto = (e, s) => { const base = producto(resta(e.a, lista[0].a), u); return [e.a[0] + u[0] * (s - base), e.a[1] + u[1] * (s - base)]; };
    tipo = 'franja';
    poligono = lista.length > 1 ? [punto(lista[0], desde), punto(lista[0], hasta), punto(lista.at(-1), hasta), punto(lista.at(-1), desde)] : banda(punto(lista[0], desde), punto(lista[0], hasta), w * 0.06);
  }
  const xs = poligono.map(p => p[0]), ys = poligono.map(p => p[1]);
  const caja = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  const rango = ids => ids.length > 1 ? ids[0] + '–' + ids.at(-1) : ids[0] || '';
  return {estado: 'ok', tipo, poligono, caja, centro: [caja[0] + caja[2] / 2, caja[1] + caja[3] / 2], aproximado,
    etiqueta: [rango(L.map(e => e.id)), rango(N.map(e => e.id))].filter(Boolean).join(' / ')};
}

// Número de protocolo a tres cifras (folio 7 → «007»); si el folio no es un número, se muestra tal cual.
export const numeroProtocolo = folio => { const f = String(folio ?? '').trim(); return /^\d{1,3}$/.test(f) ? f.padStart(3, '0') : f || 's/n'; };
