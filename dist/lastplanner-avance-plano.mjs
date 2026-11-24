// Hoja de avance de Last Planner sobre el plano: al tocar un recinto con actividades publicadas de la semana se marca su
// avance con un toque (0 · 25 · 50 · 75 · 100 %), sin formulario ni asistencia obligatoria (decisión de Mauro, 2026-11-23).
// El recinto cambia de color en el plano con la paleta única de ATLAS: gris sin avance, amarillo en ejecución, azul al
// 100 % (terminado, por revisar) y verde cuando se verifica.
import {isoToday} from './lastplanner-cycle-model.mjs';

const PASOS = [0, 25, 50, 75, 100];
let hoja = null;

export function abrirHojaAvance({room, esc, actividades, avance, guardar, abrirFicha}) {
  hoja?.remove();
  hoja = document.createElement('dialog');
  hoja.className = 'lpAvanceHoja';
  hoja.dataset.sinFlujo = '';
  hoja.setAttribute('aria-labelledby', 'lpAvanceTitulo');
  const hoy = isoToday();
  const pintar = (mensaje = '') => {
    const lista = actividades();
    hoja.innerHTML = `<header><div><h2 id="lpAvanceTitulo">${esc(room.code)}</h2><p>${esc(room.name || '')}</p></div>
      <button type="button" data-cerrar aria-label="Cerrar">×</button></header>
      <label class="lpAvanceFecha">Fecha del avance<input type="date" data-fecha value="${hoja.dataset.fecha || hoy}" max="${hoy}"></label>
      ${lista.map(a => {
        const actual = Math.round(avance(a) * 100);
        return `<section class="lpAvanceActividad" data-actividad="${esc(a.id)}"><h3>${esc(a.actividad)}</h3>
          <p>${esc(a.responsable || '')}${a.especialidad ? ' · ' + esc(a.especialidad) : ''} · avance del recinto: <b>${actual} %</b></p>
          <div class="lpAvancePasos" role="group" aria-label="Avance de ${esc(a.actividad)} en ${esc(room.code)}">${PASOS.map(p =>
            `<button type="button" data-paso="${p}" aria-pressed="${p === actual}" class="${p === 100 ? 'lpPasoListo' : ''}">${p} %${p === 100 ? ' ✓' : ''}</button>`).join('')}</div></section>`;
      }).join('') || '<p>Este recinto ya no tiene actividades abiertas esta semana.</p>'}
      <p class="lpAvanceMensaje" role="status">${esc(mensaje)}</p>
      <footer><button type="button" data-ficha>Ver ficha del recinto</button><button type="button" data-cerrar class="primary">Listo</button></footer>`;
    hoja.querySelectorAll('[data-cerrar]').forEach(b => b.onclick = () => hoja.close());
    hoja.querySelector('[data-ficha]').onclick = () => { hoja.close(); abrirFicha(); };
    hoja.querySelector('[data-fecha]').onchange = e => { hoja.dataset.fecha = e.target.value; };
    hoja.querySelectorAll('[data-paso]').forEach(b => b.onclick = async () => {
      const seccion = b.closest('[data-actividad]'), a = actividades().find(x => x.id === seccion.dataset.actividad);
      const fecha = hoja.querySelector('[data-fecha]').value || hoy;
      if (!a) return;
      seccion.querySelectorAll('[data-paso]').forEach(x => x.disabled = true);
      hoja.querySelector('.lpAvanceMensaje').textContent = 'Guardando…';
      try {
        await guardar(a, Number(b.dataset.paso), fecha);
        pintar(`${a.actividad}: ${b.dataset.paso} % guardado en este equipo.`);
      } catch (error) {
        pintar(error.message || 'No se pudo guardar el avance.');
        hoja.querySelector('.lpAvanceMensaje').setAttribute('role', 'alert');
      }
    });
  };
  pintar();
  hoja.addEventListener('close', () => { hoja?.remove(); hoja = null; });
  document.body.append(hoja);
  hoja.showModal();
  return hoja;
}
