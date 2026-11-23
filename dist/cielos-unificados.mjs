import {withReviewObservations} from './review-observations.mjs';
import {documentedLayerColors} from './documented-layer-colors.mjs';
import {nivel, datos} from './level.mjs';

const roomLabel = /^[\dA-Z]+(?:\.[\dA-Z()−-]+){2,}-\d+[A-Z]?$/i;
const lightCode = /^L\d{1,2}$/;
const height = /^NCT\s*(\d+[,.]\d+)\s*m\b/i;
const unique = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'es', {numeric: true}));

function roomFields(row, knownCodes) {
  const lines = (row.rawText || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const label = lines.indexOf(row.code), otherLabel = lines.some(line =>
    line !== row.code && (knownCodes.has(line) || roomLabel.test(line)));
  // A crop with another room label is evidence to consult, not a reliable source of room attributes.
  const afterLabel = label >= 0 && !otherLabel ? lines.slice(label + 1) : [];
  const checked = !!row.verification;
  const ceilings = unique(row.ceilingCodes || afterLabel.filter(line => Object.hasOwn(documentedLayerColors, 'CIE|' + line)));
  const heights = unique(checked && row.nct ? [row.nct] : afterLabel.flatMap(line => line.match(height)?.[1] ?? []));
  const lights = unique(row.luminaires || afterLabel.filter(line => lightCode.test(line)));
  return {ceilings, heights, lights, checked, otherLabel};
}

export function indexCeilingSheets(base, review, rooms = []) {
  const bundle = withReviewObservations(base, review);
  const documents = bundle.documents.filter(doc => doc.specialty === 'ceilings');
  const bySheet = new Map(documents.map(doc => [doc.id, doc]));
  const knownCodes = new Set([...rooms, ...bundle.observations].map(room => room.code));
  const byCode = new Map();
  for (const row of bundle.observations) {
    const document = bySheet.get(row.sheetId);
    if (!document || row.specialty !== 'ceilings' || row.source?.sha256 !== document.sha256 || row.source?.page !== document.page) continue;
    const records = byCode.get(row.code) || [];
    records.push({...row, document, ...roomFields(row, knownCodes)});
    byCode.set(row.code, records);
  }
  for (const rows of byCode.values()) rows.sort((a, b) =>
    Number(b.checked) - Number(a.checked) || a.sheetId.localeCompare(b.sheetId) || a.id.localeCompare(b.id, 'es', {numeric: true}));
  return {byCode, documents};
}

// Pisos sin las fichas del −1 (disciplines.json): tipo de cielo y NCT por recinto leídos de sus láminas CIE (cielos.json,
// scripts/cielos/extraer-cie.mjs), con la lámina de donde salen.
export function indexCielosLamina(d) {
  const documents = (d?.laminas || []).map(l => ({id: 'cie-' + String(l.lamina).toLowerCase(), revision: (String(l.archivo).match(/Rev\d+/i) || ['—'])[0], filename: null, page: 1}));
  const porLamina = new Map(documents.map(doc => [doc.id.replace(/^cie-/, '').toUpperCase(), doc]));
  const byCode = new Map(Object.entries(d?.recintos || {}).map(([code, r]) => [code, (r.laminas?.length ? r.laminas : ['—']).map((l, i) => ({
    id: code + '-' + i, code, sheetId: 'cie-' + String(l).toLowerCase(), document: porLamina.get(String(l).toUpperCase()) || {revision: '—', filename: null}, source: {page: 1},
    ceilings: r.cielos || [], heights: (r.nct || []).map(v => Number(v).toFixed(2).replace('.', ',')), lights: [], checked: true, otherLabel: false}))]));
  return {byCode, documents};
}

export async function loadCeilingSheets(rooms) {
  if (!nivel.especialidades) {
    const r = await fetch(datos('cielos.json'));
    if (!r.ok) throw new Error('Falta la lectura de las láminas CIE de ' + nivel.nombre + '.');
    return indexCielosLamina(await r.json());
  }
  async function read(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error('No se pudieron cargar las fichas de Cielos. Reintenta o guarda el piso con conexión.');
    return response.json();
  }
  const [base, review] = await Promise.all([read('disciplines.json'), read('cie-review-observations.json')]);
  return indexCeilingSheets(base, review, rooms);
}

export function renderCeilingRoom({room, catalog, ambiguous, loading, error, material, esc}) {
  const records = catalog?.byCode.get(room.code) || [];
  const architecture = room.finishes?.find(finish => finish.field === 'CIE');
  const values = (items, format = item => item) => items.map(item => esc(format(item))).join(' · ') || 'Sin dato';
  const ceiling = code => {
    const description = material(code)?.description;
    return description ? code + ' · ' + description : code;
  };
  // Una sola ficha con lo que dice el recinto, sin la lámina, la revisión ni el enlace a la fuente (decidido 2026-11-22).
  // Las lecturas dudosas (código repetido o recorte con otro rótulo sin cotejar) no entran.
  const usables = ambiguous ? [] : records.filter(row => row.checked || !row.otherLabel);
  const juntar = campo => [...new Set(usables.flatMap(row => row[campo]))].sort((a, b) => String(a).localeCompare(String(b), 'es', {numeric: true}));
  const pma = architecture?.code && architecture.code !== '–' ? architecture.code : null;
  const cielos = juntar('ceilings'), alturas = juntar('heights'), luces = juntar('lights');
  const tipos = cielos.length ? cielos : pma ? [pma] : [];
  const difiere = pma && cielos.length && !cielos.includes(pma);
  const ficha = tipos.length || alturas.length ? `<dl>
      <dt>Tipo de cielo</dt><dd>${values(tipos, ceiling)}</dd>
      <dt>Altura (NCT)</dt><dd>${values(alturas, value => value + ' m')}</dd>
      ${luces.length ? `<dt>Luminarias</dt><dd>${values(luces)}</dd>` : ''}
    </dl>${difiere ? `<p class="dataNote">El PMA indica ${esc(ceiling(pma))}.</p>` : ''}` : '<p>Sin datos de Cielos para este recinto.</p>';
  return `<section class="ceilingRoom" aria-label="Ficha de Cielos">
    <small>CIELOS · ${esc(String(nivel.nombre).toUpperCase())}</small>
    <h2 class="detailName">${esc(room.name)}</h2><p class="detailCode">${esc(room.code)}</p>
    ${loading ? '<p role="status">Cargando fichas de Cielos…</p>' : error
      ? `<p role="alert">${esc(error)}</p><button type="button" data-retry-ceilings>Reintentar</button>`
      : `<article class="ceilingSource">${ficha}</article>`}
  </section>`;
}
