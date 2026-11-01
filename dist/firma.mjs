// Quién registra en terreno: la cuenta de Nube con sesión en este equipo (su nombre, o el correo si la cuenta no tiene
// nombre). Sin sesión no se registra avance ni observaciones: se abre el inicio de sesión de Nube. La sesión queda
// guardada en el equipo, así que también firma sin señal.
const SESION = 'atlas-nube-sesion'; // misma clave que nube.mjs y lastplanner-session.mjs
export const SIN_SESION = 'Entra en Nube con tu cuenta para registrar.';
export function firmante() {
  try { const s = JSON.parse(localStorage.getItem(SESION) || 'null'); return s?.token && s.user?.username ? String(s.user.nombre || s.user.username) : null; } catch { return null; }
}
export function pedirSesion(motivo = SIN_SESION) {
  window.dispatchEvent(new CustomEvent('atlas-nube-open', {cancelable: true, detail: {message: motivo, closeOnLogin: true}}));
}
// Firma o, sin sesión, abre el inicio de sesión y corta el registro.
export function exigirFirma(motivo = SIN_SESION) {
  const f = firmante(); if (f) return f;
  pedirSesion(motivo); throw Error(motivo);
}
