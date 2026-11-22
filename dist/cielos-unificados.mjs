import {withReviewObservations} from './review-observations.mjs';
import {documentedLayerColors} from './documented-layer-colors.mjs';

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

export async function loadCeilingSheets(rooms) {
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
  const fallback = architecture?.code && architecture.code !== '–'
    ? `<p class="dataNote">Referencia de Arquitectura: ${esc(architecture.code)} · ${esc(architecture.description || 'Descripción pendiente')}.</p>`
    : '';
  const values = (items, format = item => item) => items.map(item => esc(format(item))).join(' · ') || 'Sin dato identificado';
  const ceiling = code => {
    const description = material(code)?.description;
    return description ? code + ' · ' + description : code;
  };
  const publicFields = records.map(row => {
    const sheet = row.sheetId.toUpperCase();
    return `<article class="ceilingSource">
      <h3>${esc(sheet)} · ${esc(row.document.revision)}</h3>
      <small>${row.checked ? 'Lectura cotejada en la lámina' : 'Lectura del rótulo · por revisar'}</small>
      ${ambiguous || (row.otherLabel && !row.checked)
        ? '<p>El código o el recorte tiene varias correspondencias. Consulta la fuente para atribuir sus datos.</p>'
        : `<dl>
          <dt>Tipo de cielo</dt><dd>${values(row.ceilings, ceiling)}</dd>
          <dt>Altura (NCT)</dt><dd>${values(row.heights, value => value + ' m')}</dd>
          <dt>${row.checked ? 'Luminarias identificadas' : 'Códigos de luminaria en el recorte'}</dt><dd>${values(row.lights)}</dd>
        </dl>`}
      <a href="source/${esc(row.document.filename)}#page=${esc(row.source.page)}" target="_blank" rel="noopener">Abrir lámina ${esc(sheet)} ↗</a>
    </article>`;
  }).join('');
  return `<section class="ceilingRoom" aria-label="Ficha de Cielos">
    <small>CIELOS · NIVEL −1</small>
    <h2 class="detailName">${esc(room.name)}</h2><p class="detailCode">${esc(room.code)}</p>
    ${loading ? '<p role="status">Cargando fichas de Cielos…</p>' : error
      ? `<p role="alert">${esc(error)}</p><button type="button" data-retry-ceilings>Reintentar</button>`
      : publicFields || '<p>Sin datos de Cielos asociados a este código.</p>'}
    ${fallback}
  </section>`;
}
