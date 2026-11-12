// Datos de un proyecto (marcado o levantamiento): nombre editable, propósito elegido de una lista y autor automático.
// El autor no se escribe: es la cuenta con que se inició sesión en Atlas (firma.mjs) y queda guardado en el proyecto.
// Sin DOM salvo conectarProposito: lo prueba proyecto-datos-test.mjs.
export const PROPOSITOS = ['Avance de obra', 'Levantamiento', 'Producción', 'Calidad y observaciones', 'Comparación entre cortes', 'Entrega y recepción'];
export const PERSONALIZADO = 'Personalizado';

// Propósito guardado → {tipo, otro} para el formulario. Un texto que no está en la lista es personalizado.
export function separarProposito(purpose, porDefecto = PROPOSITOS[0]) {
  const texto = String(purpose ?? '').trim();
  if (!texto) return {tipo: porDefecto, otro: ''};
  return PROPOSITOS.includes(texto) ? {tipo: texto, otro: ''} : {tipo: PERSONALIZADO, otro: texto};
}
// Valores del formulario → texto que se guarda en el proyecto.
export function leerProposito(values) {
  const tipo = String(values?.purposeTipo ?? '').trim();
  if (tipo === PERSONALIZADO) {
    const otro = String(values?.purposeOtro ?? '').trim();
    if (!otro) throw Error('Escribe el propósito personalizado.');
    return otro;
  }
  if (!PROPOSITOS.includes(tipo)) throw Error('Elige para qué es el proyecto.');
  return tipo;
}
// Campo «Para qué es»: lista desplegable nativa (sin rueda de tarjetas: son siete opciones y deben verse todas al abrirla)
// y, solo con «Personalizado», una línea para escribirlo.
export function propositoHTML(purpose, esc, porDefecto) {
  const {tipo, otro} = separarProposito(purpose, porDefecto);
  return `<label>Para qué es<select name="purposeTipo" class="propositoTipo" data-sin-flujo>${[...PROPOSITOS, PERSONALIZADO].map(p => `<option value="${esc(p)}" ${p === tipo ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
      <label class="propositoOtro" ${tipo === PERSONALIZADO ? '' : 'hidden'}>Propósito personalizado<input name="purposeOtro" maxlength="200" value="${esc(otro)}" placeholder="Ej.: Recintos para entrega al mandante"></label>`;
}
export function conectarProposito(form) {
  const tipo = form.querySelector('[name=purposeTipo]'), otro = form.querySelector('.propositoOtro');
  if (!tipo || !otro) return;
  const ver = () => { otro.hidden = tipo.value !== PERSONALIZADO; otro.querySelector('input').required = !otro.hidden; if (!otro.hidden) otro.querySelector('input').focus(); };
  tipo.addEventListener('change', ver);
}
