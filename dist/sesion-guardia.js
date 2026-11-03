// Sin sesión de Atlas en este equipo, la app abre el inicio de sesión. Corre antes que todo lo demás y también sin
// conexión, porque la app se abre desde la copia guardada. Una sesión sin «Recordar» vale mientras exista la marca
// atlas_activa (cookie del navegador, se borra al cerrarlo). El servidor de desarrollo sin ATLAS_SESSION_SECRET la apaga.
(function () {
  var cookies = document.cookie;
  if (/(?:^|;\s*)atlas_sin_login=1/.test(cookies)) return;
  try {
    var s = JSON.parse(localStorage.getItem('atlas-nube-sesion') || 'null');
    if (s && s.token && (s.recordar !== false || /(?:^|;\s*)atlas_activa=1/.test(cookies))) return;
    localStorage.removeItem('atlas-nube-sesion');
  } catch (e) {}
  document.documentElement.style.visibility = 'hidden';
  location.replace('/login.html?next=' + encodeURIComponent(location.pathname + location.search + location.hash));
})();
