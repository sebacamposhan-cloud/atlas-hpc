// Grilla de ejes del edificio desde la capa S-GRID de las láminas DWG (data/<nivel>/dibujo.json, en cm del modelo).
// Cada etiqueta (AD, A5, BG2…) está dentro de un círculo; su eje es la recta que pasa por el centro del círculo.
// Las láminas de todos los niveles comparten las coordenadas del modelo de Revit, así que la grilla es la misma en cada piso.
import fs from 'node:fs';
import path from 'node:path';

const recta = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); return {a, b, L, u: [(b[0] - a[0]) / L, (b[1] - a[1]) / L]}; };
const distanciaRecta = (r, p) => Math.abs((p[0] - r.a[0]) * r.u[1] - (p[1] - r.a[1]) * r.u[0]);

// Lee círculos, rectas y etiquetas de la capa de ejes de un nivel.
export function leerCapaEjes(repo, nivel) {
  const capa = JSON.parse(fs.readFileSync(path.join(repo, 'data', nivel, 'dibujo.json'), 'utf8')).capas.ejes;
  const circulos = [], rectas = [], etiquetas = [];
  for (const it of capa) {
    if (it[0] === 't') { etiquetas.push({texto: String(it[7]).trim(), p: [it[2], it[3]]}); continue; }
    if (it[0] !== 'l') continue;
    const p = it[4], n = p.length / 2;
    if (n === 2) { const r = recta([p[0], p[1]], [p[2], p[3]]); if (r.L > 150) rectas.push(r); continue; }
    let cx = 0, cy = 0; for (let i = 0; i < n; i++) { cx += p[2 * i]; cy += p[2 * i + 1]; }
    cx /= n; cy /= n;
    const radios = Array.from({length: n}, (_, i) => Math.hypot(p[2 * i] - cx, p[2 * i + 1] - cy)), r = radios.reduce((s, v) => s + v, 0) / n;
    if (n > 12 && Math.max(...radios.map(v => Math.abs(v - r))) < r * 0.08) circulos.push({c: [cx, cy], r});
  }
  return {circulos, rectas, etiquetas};
}

// Une las etiquetas con su recta: la más larga que pasa por el centro del círculo y empieza cerca de él.
// El eje queda como el tramo que cubren todas las rectas colineales (Revit corta algunos ejes en varios tramos).
export function grillaDeNivel(capa) {
  const ejes = new Map();
  for (const {texto, p} of capa.etiquetas) {
    const circulo = capa.circulos.find(c => Math.hypot(c.c[0] - p[0], c.c[1] - p[1]) < c.r * 1.3), centro = circulo ? circulo.c : p;
    const candidatas = capa.rectas.filter(r => distanciaRecta(r, centro) < 3 && Math.min(Math.hypot(r.a[0] - centro[0], r.a[1] - centro[1]), Math.hypot(r.b[0] - centro[0], r.b[1] - centro[1])) < 80);
    if (!candidatas.length) continue;
    const base = candidatas.sort((x, y) => y.L - x.L)[0];
    const colineales = capa.rectas.filter(r => Math.abs(r.u[0] * base.u[1] - r.u[1] * base.u[0]) < 0.002 && distanciaRecta(base, r.a) < 3 && distanciaRecta(base, r.b) < 3);
    const t = q => (q[0] - base.a[0]) * base.u[0] + (q[1] - base.a[1]) * base.u[1];
    const valores = colineales.flatMap(r => [t(r.a), t(r.b)]), t0 = Math.min(...valores), t1 = Math.max(...valores);
    const eje = {id: texto, a: [base.a[0] + base.u[0] * t0, base.a[1] + base.u[1] * t0], b: [base.a[0] + base.u[0] * t1, base.a[1] + base.u[1] * t1], burbujas: 1};
    const previo = ejes.get(texto);
    if (!previo) ejes.set(texto, eje);
    else if (distanciaRecta(recta(previo.a, previo.b), eje.a) < 5) {
      // Misma recta vista desde la otra burbuja: se amplía el tramo.
      const r = recta(previo.a, previo.b), s = q => (q[0] - r.a[0]) * r.u[0] + (q[1] - r.a[1]) * r.u[1], v = [0, r.L, s(eje.a), s(eje.b)];
      ejes.set(texto, {id: texto, a: [r.a[0] + r.u[0] * Math.min(...v), r.a[1] + r.u[1] * Math.min(...v)], b: [r.a[0] + r.u[0] * Math.max(...v), r.a[1] + r.u[1] * Math.max(...v)], burbujas: previo.burbujas + 1});
    } else ejes.set(texto + '#conflicto', eje);
  }
  return [...ejes.values()];
}
