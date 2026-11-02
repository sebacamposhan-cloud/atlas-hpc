// Servidor local del editor de contornos (dist/editor-contornos/), para corregir en el PC y publicar con commit.
// Uso: node scripts/editor-contornos/servidor.mjs  y abrir http://127.0.0.1:8012/
// Sirve dist/ como Atlas y responde editor-contornos/modo.json {local: true}: así el editor guarda aquí, en
// dist/<piso>/contornos.json (validado contra los recintos del piso), y no en Nube. Las líneas del DWG salen de
// data/<nivel>/barreras.json, más completas que las publicadas.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeRuntime} from '../../dist/runtime-loader.mjs';
import {NIVELES, validar, serializar} from '../../dist/editor-contornos/archivo.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), dist = path.join(repo, 'dist');
const PUERTO = Number(process.env.EDITOR_PORT || 8012);
const mime = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const enviar = (res, status, cuerpo, tipo = 'application/json; charset=utf-8') => { res.writeHead(status, {'Content-Type': tipo, 'Cache-Control': 'no-store'}); res.end(typeof cuerpo === 'string' || Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo)); };
const dentro = (base, archivo) => archivo === base || archivo.startsWith(base + path.sep);
// Líneas del DWG en el formato publicado, armadas desde data/<nivel>/barreras.json.
function lineas(nivel) {
  const b = path.join(repo, 'data', nivel, 'barreras.json'), m = path.join(repo, 'data', nivel, 'marco.json');
  if (!fs.existsSync(b) || !fs.existsSync(m)) return null;
  const {escala, ox, oy} = JSON.parse(fs.readFileSync(m, 'utf8'));
  return {formato: 'atlas-barreras-v1', nivel, marco: {escala, ox, oy}, tramos: JSON.parse(fs.readFileSync(b, 'utf8')).flat()};
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/guardar') {
      const nivel = url.searchParams.get('nivel'), n = NIVELES[nivel];
      if (!n) return enviar(res, 400, {errores: ['Piso desconocido.']});
      let cuerpo = ''; for await (const c of req) { cuerpo += c; if (cuerpo.length > 20e6) return enviar(res, 413, {errores: ['Archivo demasiado grande.']}); }
      let archivo; try { archivo = JSON.parse(cuerpo); } catch { return enviar(res, 400, {errores: ['JSON inválido.']}); }
      const {data, atlas, map} = decodeRuntime(JSON.parse(fs.readFileSync(path.join(dist, n.datos, 'runtime.json'), 'utf8')));
      const errores = validar(archivo, {nivel, rooms: data.rooms, atlas, map});
      if (errores.length) return enviar(res, 422, {errores});
      const destino = path.join(dist, n.datos, 'contornos.json');
      fs.writeFileSync(destino, serializar(archivo));
      console.log(new Date().toLocaleTimeString('es-CL'), nivel, archivo.recintos.length, 'recintos corregidos →', path.relative(repo, destino));
      return enviar(res, 200, {ok: true, archivo: path.relative(repo, destino).replaceAll('\\', '/'), recintos: archivo.recintos.length});
    }
    if (req.method !== 'GET') return enviar(res, 405, {errores: ['Método no permitido.']});
    if (url.pathname === '/') { res.writeHead(302, {Location: '/editor-contornos/editor.html'}); return res.end(); }
    if (url.pathname === '/editor-contornos/modo.json') return enviar(res, 200, {local: true});
    const l = url.pathname.match(/^\/editor-contornos\/barreras\/(s01|n01|n02|n03)\.json$/), local = l && lineas(l[1]);
    if (local) return enviar(res, 200, local);
    const archivo = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (!dentro(dist, archivo)) return enviar(res, 403, {errores: ['Ruta no permitida.']});
    if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) return enviar(res, 404, {errores: ['No existe: ' + url.pathname]});
    res.writeHead(200, {'Content-Type': mime[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    fs.createReadStream(archivo).pipe(res);
  } catch (e) { enviar(res, 500, {errores: [e.message]}); }
}).listen(PUERTO, '127.0.0.1', () => console.log('Editor de contornos: http://127.0.0.1:' + PUERTO + '/  (Ctrl+C para cerrar)'));
