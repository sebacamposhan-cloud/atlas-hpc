// Descripción de cada modelo de puerta, transcrita de la «Planilla vanos de puertas» (lámina HPC-ARQ-FDI-224 Rev03,
// 26 de noviembre de 2024, escaneada). Sin DOM: lo prueba puertas-avance-test.mjs.
// - Cada fila de la planilla es una variante del modelo: ítem, descripción y vano de obra (ancho × alto, en mm).
// - Un modelo puede traer varias variantes (sin imposta «SI», con imposta opaca, vidriada o de policarbonato). El plano de
//   avance no dice cuál lleva cada puerta: la ficha muestra todas.
// - Los ítems de la planilla (6.5.x) no son los códigos de partida del plano de avance (6.6.1.x).
// - Modelos del plano que la planilla no trae (PAS1, PI05a, PI10b, PI13a…) quedan sin descripción: no se inventa.
export const FUENTE = {titulo: 'Planilla vanos de puertas', lamina: 'HPC-ARQ-FDI-224', revision: 'Rev03', fecha: '2024-11-26'};
export const NOTAS = ['Vano terminado = vano de obra + 30 mm.', 'Las puertas de madera y de HPL no llevan tapilla; las metálicas vidriadas, cortafuego, de escape y metálicas llevan una.', 'Holgura de ±5 mm por lado, en ancho y en alto.'];

// Familia; después cada fila: [ítem, modelo, descripción sin el código, variante, ancho, alto].
const PLANILLA = [
  ['Puertas vidriadas de aluminio con RPT', [
    ['3.5.1.1', 'PE01a', 'Puerta simple de abatir', '', 996, 2780],
    ['3.5.1.2', 'PE01b', 'Puerta simple de abatir, psiquiatría', '', 996, 2530],
    ['3.5.1.3', 'PE01c', 'Puerta doble de abatir 80/80', '', 1696, 2150],
    ['3.5.1.4', 'PE01d', 'Puerta doble de abatir 90/90', '', 1896, 2150],
    ['3.5.1.5', 'PE01f', 'Puerta simple de abatir 90', '', 996, 2150],
    ['3.5.1.6', 'PE01g', 'Puerta simple de abatir 90', '', 996, 2600]]],
  ['Puertas de madera llena', [
    ['6.5.1.1', 'PI01a', 'Puerta simple abatir 70', 'SI', 766, 2130],
    ['6.5.1.1', 'PI01a', 'Puerta simple abatir 70', 'Con imposta opaca', 766, 2680],
    ['6.5.1.2', 'PI01b', 'Puerta simple abatir 80', 'SI', 866, 2130],
    ['6.5.1.2', 'PI01b', 'Puerta simple abatir 80', 'Con imposta opaca', 866, 2680],
    ['6.5.1.2', 'PI01b', 'Puerta simple abatir 80', 'Con imposta vidriada', 866, 2680],
    ['6.5.1.3', 'PI01c', 'Puerta simple abatir 90', 'SI', 966, 2130],
    ['6.5.1.3', 'PI01c', 'Puerta simple abatir 90', 'Con imposta opaca', 966, 2680],
    ['6.5.1.3', 'PI01c', 'Puerta simple abatir 90', 'Con imposta vidriada', 966, 2680],
    ['6.5.1.4', 'PI01f', 'Puerta doble abatir 90/90', 'Con imposta opaca', 1866, 2680],
    ['6.5.1.4', 'PI01f', 'Puerta doble abatir 90/90', 'Con imposta policarbonato', 1866, 2680],
    ['6.5.1.5', 'PI01d', 'Puerta puertín abatir 90/40', 'Con imposta opaca', 1366, 2680],
    ['6.5.1.5', 'PI01d', 'Puerta puertín abatir 90/40', 'Con imposta vidriada', 1366, 2680],
    ['6.5.1.6', 'PI01i', 'Puerta simple corredera 140', 'SI', 1433, 2130],
    ['6.5.1.7', 'PI01e', 'Puerta doble abatir 70/70', 'Con imposta opaca', 1466, 2680],
    ['6.5.1.8.1', 'PI01g', 'Puerta simple abatir psiquiatría SH 90', 'Con imposta policarbonato', 966, 2680],
    ['6.5.1.8.2', 'PI01h', 'Puerta simple abatir psiquiatría 90', 'Con imposta policarbonato', 966, 2680],
    ['6.5.1.9', 'PI01j', 'Puerta simple abatir psiquiatría 110', 'Con imposta policarbonato', 1166, 2680],
    ['6.5.1.10', 'PI01k', 'Puerta simple abatir 110', 'Con imposta opaca', 1166, 2680],
    ['6.5.1.10', 'PI01k', 'Puerta simple abatir 110', 'Con imposta vidriada', 1166, 2680],
    ['6.5.1.11', 'PI01l', 'Puerta simple abatir 120', 'Con imposta vidriada', 1266, 2680]]],
  ['Puertas de madera con mirilla', [
    ['6.5.2.1', 'PI02a', 'Puerta simple de abatir 90', 'SI', 966, 2130],
    ['6.5.2.1', 'PI02a', 'Puerta simple de abatir 90', 'Con imposta opaca', 966, 2680],
    ['6.5.2.1', 'PI02a', 'Puerta simple de abatir 90', 'Con imposta vidriada', 966, 2680],
    ['6.5.2.2', 'PI02b', 'Puerta puertín 90/40', 'Con imposta opaca', 1366, 2680],
    ['6.5.2.2', 'PI02b', 'Puerta puertín 90/40', 'Con imposta vidriada', 1366, 2680],
    ['6.5.2.3', 'PI02c', 'Puerta puertín 90/40 psiquiatría', 'Con imposta policarbonato', 1366, 2680],
    ['6.5.2.4', 'PI02d', 'Puerta puertín 90/40 psiquiatría contención', 'Con imposta policarbonato', 1366, 2680]]],
  ['Puertas madera plomadas', [
    ['6.5.3.1', 'PI03a', 'Puerta simple de abatir plomada 70', 'SI', 776, 2135],
    ['6.5.3.2', 'PI03b', 'Puerta simple de abatir plomada 90', 'SI', 976, 2135],
    ['6.5.3.3', 'PI03c', 'Puerta doble de abatir plomada 70/70', 'SI', 1476, 2135],
    ['6.5.3.4', 'PI03d', 'Puerta doble de abatir plomada 90/90', 'SI', 1876, 2135]]],
  ['Puertas metálicas vidriadas', [
    ['6.5.4.1', 'PI04a', 'Puerta simple de abatir 90', 'SI', 996, 2150],
    ['6.5.4.1', 'PI04a', 'Puerta simple de abatir 90', 'Con imposta vidriada', 996, 2680],
    ['6.5.4.2', 'PI04b', 'Puerta puertín de abatir 90/40', 'Con imposta vidriada', 1396, 2680],
    ['6.5.4.3', 'PI04f', 'Puerta doble de abatir 90/90', 'SI', 1896, 2150],
    ['6.5.4.3', 'PI04f', 'Puerta doble de abatir 90/90', 'Con imposta vidriada', 1896, 2680],
    ['6.5.4.4', 'PI04c', 'Puerta simple de vaivén 90', 'Con imposta vidriada', 996, 2680],
    ['6.5.4.5', 'PI04d', 'Puerta doble de vaivén 90/90', 'Con imposta vidriada', 1896, 2680],
    ['6.5.4.8', 'PI04e', 'Puerta simple de abatir 100', 'Con imposta vidriada', 1096, 2680],
    ['6.5.4.9', 'PI04g', 'Puerta puertín de abatir 80/80', 'Con imposta vidriada', 1696, 2680],
    ['6.5.4.10', 'PI04h', 'Puerta doble de vaivén 80/80', 'SI', 1696, 2150]]],
  ['Puertas automáticas de HPL', [
    ['6.5.5.1', 'PI06a', 'Puerta corredera plomada 140', '', 1470, 2131],
    ['6.5.5.2', 'PI06b', 'Puerta corredera plomada 190', '', 1970, 2131],
    ['6.5.5.3', 'PI06c', 'Puerta corredera 160', '', 1670, 2131]]],
  ['Puertas escape y cortafuego', [
    ['6.5.6.1', 'PI07a', 'Puerta de escape simple 120', '', 1300, 2155],
    ['6.5.6.2', 'PI07c', 'Puerta de escape doble 90/90', '', 1900, 2155],
    ['6.5.6.3', 'PI08c', 'Puerta cortafuegos de abatir con sentidos encontrados de doble hoja 90/90', '', 1900, 2155],
    ['6.5.6.4', 'PI08e', 'Puerta cortafuegos de abatir con sentidos encontrados de doble hoja 120/120', '', 2500, 2155],
    ['6.5.6.5', 'PI08b', 'Puerta cortafuegos simple 120', '', 1300, 2155],
    ['6.5.6.6', 'PI07b', 'Puerta de escape doble 80/80', '', 1700, 2155],
    ['6.5.6.7', 'PI07d', 'Puerta de escape doble 120/120', '', 2500, 2641],
    ['6.5.6.8', 'PI08a', 'Puerta cortafuego simple 90', '', 1000, 2155],
    ['6.5.6.9', 'PI08d', 'Puerta cortafuegos doble unidireccional 90/90', '', 1900, 2155],
    ['6.5.6.10', 'PI08f', 'Puerta cortafuegos doble unidireccional 120/120', '', 2500, 2155],
    ['6.5.6.11', 'PI08g', 'Puerta cortafuegos doble unidireccional con mirilla 90/90', '', 1900, 2155],
    ['6.5.6.12', 'PI08h', 'Puerta cortafuego simple 110', '', 1200, 2155],
    ['6.5.6.13', 'PI09a', 'Puerta simple abatir RF60 70', '', 800, 2155],
    ['6.5.6.14', 'PI09b', 'Puerta simple abatir RF60 80', '', 900, 2155],
    ['6.5.6.15', 'PI09c', 'Puerta simple abatir RF60 90', '', 1000, 2155],
    ['6.5.6.16', 'PI09d', 'Puerta simple abatir RF120 90', '', 1000, 2155],
    ['6.5.6.17', 'PI09e', 'Puerta doble de abatir RF60 90/40', '', 1400, 2155],
    ['6.5.6.18', 'PI09f', 'Puerta doble de abatir RF120 90/40', '', 1400, 2155],
    ['6.5.6.19', 'PI09g', 'Puerta doble de abatir RF60 70/70', '', 1500, 2155],
    ['6.5.6.20', 'PI09h', 'Puerta doble de abatir RF120 70/70', '', 1500, 2155],
    ['6.5.6.21', 'PI09i', 'Puerta doble de abatir RF120 90/90', '', 1900, 2155],
    ['6.5.6.22', 'PI09j', 'Puerta simple abatir RF120 110', '', 1200, 2155],
    ['6.5.6.23', 'PI09k', 'Puerta simple abatir RF60 110', '', 1200, 2155],
    ['6.5.6.24', 'PI09l', 'Puerta simple abatir psiquiatría RF60 90', '', 1000, 2155]]],
  ['Puertas metálicas llenas', [
    ['6.5.7.1', 'PT01a', 'Puerta doble de abatir RF90 60/60', '', 1300, 2155],
    ['6.5.7.2', 'PT01c', 'Puerta doble de abatir RF120 90/90', '', 1900, 2155],
    ['6.5.7.3', 'PT01b', 'Puerta doble de abatir RF120 60/60', '', 1300, 2155],
    ['6.5.7.4', 'PT01d', 'Puerta doble de abatir de escape insonorizada RF120 90/90', '', 1900, 2155],
    ['6.5.7.5', 'PT01e', 'Puerta de registro 60', '', 700, 2155],
    ['6.5.7.8', 'PT01h', 'Puerta doble de abatir RF60 80/80', '', 1700, 2315],
    ['6.5.7.9', 'PT01i', 'Puerta simple de abatir RF120 90', '', 1000, 2155]]],
  ['Puertas especiales', [
    ['6.5.8.4', 'PI11a', 'Puerta de seguridad de alto tráfico doble vaivén 70/70', '', 1500, 2155],
    ['6.5.8.5', 'PI11b', 'Puerta de seguridad de alto tráfico simple de abatir 90', '', 1000, 2155],
    ['6.5.8.6', 'PI11c', 'Puerta de seguridad de alto tráfico doble vaivén 90/90', '', 1900, 2155],
    ['6.5.8.7', 'PI12a', 'Puerta de seguridad blindada simple de abatir 100', '', 1066, 2130]]]
];

// modelo → {modelo, familia, descripcion, variantes: [{item, variante, ancho, alto}]}
export const MODELOS = new Map();
for (const [familia, filas] of PLANILLA) for (const [item, modelo, descripcion, variante, ancho, alto] of filas) {
  if (!MODELOS.has(modelo)) MODELOS.set(modelo, {modelo, familia, descripcion, variantes: []});
  MODELOS.get(modelo).variantes.push({item, variante, ancho, alto});
}
export const modeloDe = codigo => MODELOS.get(String(codigo || '').trim()) || null;
// «Puerta simple abatir 90 · Puertas de madera llena», o vacío si la planilla no trae el modelo.
export const descripcionDe = codigo => { const m = modeloDe(codigo); return m ? `${m.descripcion} · ${m.familia}` : ''; };
export const vanoDe = v => `${v.ancho} × ${v.alto} mm`;
