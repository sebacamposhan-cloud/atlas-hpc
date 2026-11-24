// Excel con el mismo formato del informe PDF (marking-overlay.mjs, paginasProyecto): piso en grande y título, la línea
// azul, «Realizado por», «Actualizado» y «Propósito», la simbología con cantidades y la tabla con el encabezado azul,
// la primera columna en negrita y el estado con su color. Antes los Excel salían con la librería (sin formato): hojas
// blancas sin título ni anchos. Este archivo escribe el .xlsx directo (XML + zip sin comprimir), sin librerías ni red.
// Sin DOM: lo prueba excel-informe-test.mjs.
//
// info: {piso, titulo, tipo, detalle, autor, actualizado, proposito, leyenda: [{nombre, color, n}], columnas, filas}
// (el mismo objeto de la exportación PDF). Una celda es texto, número o {texto, color}.
// opciones: {hoja, alcance, nota}. Devuelve los bytes del .xlsx.
export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MARCA = '1B2A56', REGLA = '8C8C8C', GRIS = '595959';

export function libroInforme(info, {hoja = 'Informe', alcance = '', nota = ''} = {}) {
  const columnas = info.columnas || [], filas = info.filas || [], n = Math.max(2, columnas.length), ultima = letra(n - 1);
  const E = estilos(), rows = [], merges = [];
  let r = 0;
  const fila = (celdas, alto = null) => { r++; rows.push({r, celdas, alto}); return r; };
  const unir = (fila0, c0 = 1) => { if (n - 1 > c0) merges.push(`${letra(c0)}${fila0}:${ultima}${fila0}`); };

  // Encabezado: piso en grande y título; debajo el tipo y el detalle; después la línea azul.
  const raya = E.xf({borde: {abajo: ['medium', MARCA]}});
  unir(fila([celda(info.piso, E.xf({fuente: 'piso', alinear: 'medio'})), celda(info.titulo, E.xf({fuente: 'titulo', alinear: 'medio'}))], 34));
  unir(fila([celda('', raya), celda([info.tipo, alcance, info.detalle].filter(Boolean).join(' · '), E.xf({fuente: 'gris', borde: {abajo: ['medium', MARCA]}})), ...Array.from({length: n - 2}, () => celda('', raya))], 20));
  fila([]);
  const fecha = new Date(info.actualizado), cuando = Number.isFinite(+fecha) ? fecha.toLocaleString('es-CL', {dateStyle: 'short', timeStyle: 'short'}) : '';
  const anchos = anchosColumnas(columnas, filas, info.piso);
  for (const [rotulo, valor] of [['Realizado por', info.autor], ['Actualizado', cuando], ['Propósito', info.proposito]]) {
    if (!String(valor ?? '').trim()) continue;
    const lineas = Math.max(1, Math.ceil(String(valor).length / Math.max(20, anchos.slice(1).reduce((s, a) => s + a, 0) * 1.1)));
    unir(fila([celda(rotulo, E.xf({fuente: 'negrita', alinear: 'arriba'})), celda(valor, E.xf({alinear: 'ajustar'}))], lineas > 1 ? 13.5 * lineas : null));
  }
  // Simbología con cantidades: el número sobre su color y el nombre al lado.
  const leyenda = (info.leyenda || []).filter(e => e.n);
  if (leyenda.length) {
    fila([]);
    for (const e of leyenda) unir(fila([celda(e.n, E.xf({fuente: oscuro(e.color) ? 'blanca' : 'negrita', relleno: e.color, borde: {todo: ['thin', '000000']}, alinear: 'centro'})), celda(e.nombre, E.xf({alinear: 'medio'}))]));
  }
  fila([]);
  // Tabla: encabezado azul con letra blanca; filas con línea gris abajo; el estado con una barra de su color a la izquierda.
  const cabeza = fila(columnas.map(c => celda(c, E.xf({fuente: 'cabeza', relleno: MARCA, alinear: 'medio'}))), 20);
  for (const f of filas) fila(f.map((v, i) => {
    const color = v && typeof v === 'object' ? v.color : null, borde = {abajo: ['thin', REGLA], ...(color ? {izquierda: ['thick', hex(color)]} : {})};
    return celda(color ? v.texto : v, E.xf({fuente: i === 0 ? 'negrita' : null, borde, alinear: color ? 'sangria' : 'izquierda'}));
  }));
  if (!filas.length) fila([celda('Sin filas.', E.xf({fuente: 'gris'}))]);
  const fin = r;

  const hojaXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${ultima}${fin}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>
<cols>${anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.map(({r, celdas, alto}) => `<row r="${r}"${alto ? ` ht="${alto}" customHeight="1"` : ''}>${celdas.map((c, i) => c.xml(`${letra(i)}${r}`)).join('')}</row>`).join('')}</sheetData>
${columnas.length ? `<autoFilter ref="A${cabeza}:${letra(columnas.length - 1)}${Math.max(cabeza, fin)}"/>` : ''}
${merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
<printOptions horizontalCentered="1"/><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.7" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${columnas.length > 6 ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>
<headerFooter><oddFooter>&amp;L&amp;8${xml(String(nota).replace(/&/g, '&&').slice(0, 200))}&amp;R&amp;8Hoja &amp;P de &amp;N</oddFooter></headerFooter>
</worksheet>`;
  const nombreHoja = String(hoja).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Informe';
  const archivos = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(nombreHoja)}" sheetId="1" r:id="rId1"/></sheets><definedNames>${columnas.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(nombreHoja.replace(/'/g, "''"))}'!$A$${cabeza}:$${letra(columnas.length - 1)}$${Math.max(cabeza, fin)}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'${xml(nombreHoja.replace(/'/g, "''"))}'!$${cabeza}:$${cabeza}</definedName>` : ''}</definedNames></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': E.xml(),
    'xl/worksheets/sheet1.xml': hojaXML
  };
  return zip(Object.entries(archivos).map(([nombre, texto]) => [nombre, new TextEncoder().encode(texto)]));
}

// Nombre de archivo seguro, «Puertas N02 - No instalada.xlsx».
export const nombreXlsx = nombre => (String(nombre || 'Informe').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Informe') + '.xlsx';

// ---------- Celdas y estilos ----------
const xml = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const letra = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const hex = c => (/^#?[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).replace('#', '') : 'FFFFFF').toUpperCase();
const oscuro = c => { const [r, g, b] = hex(c).match(/../g).map(v => parseInt(v, 16) / 255); return .2126 * r + .7152 * g + .0722 * b < .55; };
function celda(valor, s) {
  return {xml: ref => {
    if (typeof valor === 'number' && Number.isFinite(valor)) return `<c r="${ref}" s="${s}"><v>${valor}</v></c>`;
    const t = String(valor ?? '');
    return t ? `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(t)}</t></is></c>` : `<c r="${ref}" s="${s}"/>`;
  }};
}
// Ancho por columna según el contenido (como en la tabla del PDF), entre 8 y 48 caracteres.
function anchosColumnas(columnas, filas, piso) {
  const largo = v => String(v && typeof v === 'object' ? v.texto : v ?? '').length;
  return Array.from({length: Math.max(2, columnas.length)}, (_, i) => {
    const max = Math.max(largo(columnas[i]), ...filas.slice(0, 400).map(f => largo(f[i])));
    // La primera columna lleva también «Realizado por» y el piso en grande.
    return Math.min(48, Math.max(i === 0 ? Math.max(15, String(piso || '').length * 2.6) : 8, max * 1.1 + (i === 0 ? 2 : 3)));
  });
}
const FUENTES = {
  normal: '<sz val="10"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/>',
  negrita: '<b/><sz val="10"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/>',
  piso: '<b/><sz val="26"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/>',
  titulo: '<b/><sz val="15"/><color rgb="FF000000"/><name val="Arial"/><family val="2"/>',
  gris: `<sz val="9"/><color rgb="FF${GRIS}"/><name val="Arial"/><family val="2"/>`,
  cabeza: '<b/><sz val="9"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/>',
  blanca: '<b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/>'
};
const ALINEAR = {
  medio: '<alignment vertical="center"/>', centro: '<alignment horizontal="center" vertical="center"/>',
  arriba: '<alignment vertical="top"/>', ajustar: '<alignment vertical="top" wrapText="1"/>', sangria: '<alignment horizontal="left" indent="1"/>', izquierda: '<alignment horizontal="left"/>'
};
function estilos() {
  const fuentes = Object.keys(FUENTES), rellenos = ['none', 'gray125'], bordes = [''], xfs = ['0|0|0|'];
  const id = (lista, clave) => { let i = lista.indexOf(clave); if (i < 0) { lista.push(clave); i = lista.length - 1; } return i; };
  const lado = (nombre, b) => b ? `<${nombre} style="${b[0]}"><color rgb="FF${hex(b[1])}"/></${nombre}>` : `<${nombre}/>`;
  return {
    xf({fuente = null, relleno = null, borde = null, alinear = null} = {}) {
      const f = fuentes.indexOf(fuente || 'normal'), r = relleno ? id(rellenos, hex(relleno)) : 0;
      const b = borde ? id(bordes, ['izquierda', 'derecha', 'arriba', 'abajo'].map(k => (borde[k] || borde.todo || []).join(':')).join('|')) : 0;
      return id(xfs, `${f}|${r}|${b}|${alinear || ''}`);
    },
    xml: () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="${fuentes.length}">${fuentes.map(f => `<font>${FUENTES[f]}</font>`).join('')}</fonts>
<fills count="${rellenos.length}">${rellenos.map(r => r === 'none' || r === 'gray125' ? `<fill><patternFill patternType="${r}"/></fill>` : `<fill><patternFill patternType="solid"><fgColor rgb="FF${r}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills>
<borders count="${bordes.length}">${bordes.map(b => { const [iz, de, ar, ab] = (b || '|||').split('|').map(x => x ? x.split(':') : null); return `<border>${lado('left', iz)}${lado('right', de)}${lado('top', ar)}${lado('bottom', ab)}<diagonal/></border>`; }).join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.map(x => { const [f, r, b, a] = x.split('|'); return `<xf numFmtId="0" fontId="${f}" fillId="${r}" borderId="${b}" xfId="0"${+f ? ' applyFont="1"' : ''}${+r ? ' applyFill="1"' : ''}${+b ? ' applyBorder="1"' : ''}${a ? ` applyAlignment="1">${ALINEAR[a]}</xf>` : '/>'}`; }).join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
  };
}

// ---------- Zip sin compresión (lo que pide un .xlsx) ----------
const CRC = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = bytes => { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
export function zip(entradas) {
  const partes = [], centro = []; let pos = 0;
  for (const [nombre, datos] of entradas) {
    const n = new TextEncoder().encode(nombre), crc = crc32(datos), local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, datos.length, 4], [22, datos.length, 4], [26, n.length, 2], [28, 0, 2]].forEach(([o, v, t]) => t === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true));
    const central = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, datos.length, 4], [24, datos.length, 4], [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, pos, 4]].forEach(([o, v, t]) => t === 4 ? central.setUint32(o, v, true) : central.setUint16(o, v, true));
    partes.push(new Uint8Array(local.buffer), n, datos); centro.push(new Uint8Array(central.buffer), n);
    pos += 30 + n.length + datos.length;
  }
  const tamCentro = centro.reduce((s, p) => s + p.length, 0), fin = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, entradas.length, 2], [10, entradas.length, 2], [12, tamCentro, 4], [16, pos, 4], [20, 0, 2]].forEach(([o, v, t]) => t === 4 ? fin.setUint32(o, v, true) : fin.setUint16(o, v, true));
  const todo = [...partes, ...centro, new Uint8Array(fin.buffer)], salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of todo) { salida.set(p, o); o += p.length; }
  return salida;
}
