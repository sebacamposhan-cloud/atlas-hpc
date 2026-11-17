// Cielos según las láminas CIE (cielo reflejado) del piso: tipo de cielo y altura NCT de cada recinto, leídos de los DWG
// con scripts/cielos/extraer-cie.mjs y guardados en <datos>cielos.json. Solo en pisos con la marca «cielos» (pisos.js).
// Se ven como capas sobre Arquitectura («Cielos según lámina CIE» y «Altura de cielo NCT») y en el rombo, en la
// terminación CIE. Si el tipo de la lámina no coincide con el del PMA, el rombo lo avisa.
import {nivel, datos} from './level.mjs';
import {registerLayer, categoryColor} from './layers.mjs';

let cache = null;
export const SIN_LAMINA = 'Sin dato en la lámina';
export const cieloDe = code => cache?.recintos?.[String(code ?? '').trim()] || null;
export const textoNct = v => 'NCT ' + Number(v).toLocaleString('es-CL', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' m';
// Línea para el rombo: «Lámina CIE A-503: cielo 209 · NCT 2,80 m».
export function lineaCielo(code) {
  const c = cieloDe(code); if (!c) return null;
  const partes = [c.cielos.length ? 'cielo ' + c.cielos.join(' + ') : null, c.nct.length ? c.nct.map(textoNct).join(' / ') : null].filter(Boolean);
  return {texto: 'Lámina CIE ' + c.laminas.join(', ') + ': ' + (partes.join(' · ') || 'sin tipo ni altura'), difiere: !!c.difiere, pma: c.pma || []};
}
// Alturas: de más baja (claro) a más alta (oscuro).
const TONOS = ['#cfe3f5', '#9cc6ea', '#6aa8dc', '#3f86c6', '#1f65a6', '#0f4a80'];
function colorNct(k) {
  if (k === SIN_LAMINA) return '#e9ecef';
  const v = Number(String(k).replace(/[^\d,]/g, '').replace(',', '.'));
  return TONOS[Math.max(0, Math.min(TONOS.length - 1, Math.round((v - 2.5) / 0.3)))];
}
if (nivel.cielos) {
  registerLayer('cielosLamina', {nombre: 'Cielos según lámina CIE', categories: r => cieloDe(r.code)?.cielos?.length ? cieloDe(r.code).cielos : [SIN_LAMINA],
    color: k => k === SIN_LAMINA ? '#e9ecef' : categoryColor('CIE', k), opacity: .45});
  registerLayer('nct', {nombre: 'Altura de cielo (NCT)', categories: r => cieloDe(r.code)?.nct?.length ? cieloDe(r.code).nct.map(textoNct) : [SIN_LAMINA], color: colorNct, opacity: .5});
  fetch(datos('cielos.json')).then(r => r.ok ? r.json() : null).then(d => { cache = d; window.dispatchEvent(new Event('atlas-cielos-lamina')); }).catch(() => {});
}
