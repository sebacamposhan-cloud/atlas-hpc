// Subcontratos de la obra para elegir responsable en el Last Planner.
// Transcritos de las capturas que entregó el usuario para Estados de pago (rama feat/quijote-contractor), más STI y
// Valcompany. Son etiquetas de consulta: no implican razón social ni RUT verificados. Sin precios ni montos.
export const SUBCONTRATOS = [
  ['CallFire', 'Gases limpios'], ['Canalinox', 'Barandas y pasamanos'], ['Conpres', 'Yesos'], ['Convergint', 'Detección'],
  ['CS Energy', 'Clima'], ['DAC-Controls', 'CDE'], ['ECIM', 'Electricidad'], ['Eleva Group', 'Ascensores'], ['EMT', 'Andamios'],
  ['Falcold', 'Clima'], ['Forpec', 'Fachada'], ['Heavy Duty', 'Andamios'], ['Huennebeck', 'Andamios'], ['JMIE', 'Electricidad'],
  ['Linde', 'Gases clínicos'], ['Loginteg', 'Bodegas'], ['Lza Ingeniería', 'Data Center'], ['Metalcar', 'Montaje greating'],
  ['Optiva', ''], ['Pavitec', 'Sanitario'], ['Pestkiller', 'Control de plagas'], ['Pua Diseño', ''], ['QCLASS', 'Biolimpias'],
  ['Quijote', 'Pintura'], ['Rafcon', 'Fachadas'], ['Rentokil', 'Control de plagas'], ['RMF Miccono', 'Sanitario'], ['STI', 'Clima'],
  ['Valcompany', '']
].map(([nombre, especialidad]) => ({nombre, especialidad, etiqueta: nombre + (especialidad ? ' · ' + especialidad : '')}));
