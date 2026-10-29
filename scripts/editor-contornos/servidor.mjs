// Servidor local del editor de contornos: herramienta interna de desarrollo, no se publica.
// Uso: node scripts/editor-contornos/servidor.mjs  y abrir http://127.0.0.1:8012/
// Lee el plano de dist/ y las líneas del DWG de data/<nivel>/barreras.json (fuera del repo publicado).
// Solo escribe dist/<piso>/contornos.json, después de validarlo contra los recintos del piso.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeRuntime} from '../../dist/runtime-loader.mjs';
import {NIVELES, validar, serializar} from './archivo.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..'), dist = path.join(repo, 'dist');
const PUERTO = Number(process.env.EDITOR_PORT || 8012);
const mime = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'};
const enviar = (res, status, cuerpo, tipo = 'application/json; charset=utf-8') => { res.writeHead(status, {'Content-Type': tipo, 'Cache-Control': 'no-store'}); res.end(typeof cuerpo === 'string' || Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo)); };
const dentro = (base, archivo) => archivo === base || archivo.startsWith(base + path.sep);

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
    let archivo;
    if (url.pathname === '/') archivo = path.join(here, 'editor.html');
    else if (url.pathname.startsWith('/tool/')) archivo = path.resolve(here, '.' + decodeURIComponent(url.pathname.slice(5)));
    else if (url.pathname.startsWith('/repo/dist/')) archivo = path.resolve(dist, '.' + decodeURIComponent(url.pathname.slice(10)));
    else { const m = url.pathname.match(/^\/repo\/data\/(s01|n01|n02|n03)\/(barreras|marco)\.json$/); if (m) archivo = path.join(repo, 'data', m[1], m[2] + '.json'); }
    if (!archivo || !(dentro(here, archivo) || dentro(dist, archivo) || dentro(path.join(repo, 'data'), archivo))) return enviar(res, 403, {errores: ['Ruta no permitida.']});
    if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) return enviar(res, 404, {errores: ['No existe: ' + url.pathname]});
    res.writeHead(200, {'Content-Type': mime[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    fs.createReadStream(archivo).pipe(res);
  } catch (e) { enviar(res, 500, {errores: [e.message]}); }
}).listen(PUERTO, '127.0.0.1', () => console.log('Editor de contornos: http://127.0.0.1:' + PUERTO + '/  (Ctrl+C para cerrar)'));
