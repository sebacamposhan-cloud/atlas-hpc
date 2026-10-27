// Servidor local para dibujar los mosaicos de un nivel desde data/<nivel>/dibujo.json (render.html necesita un navegador).
// Uso: node scripts/dwg-plano/servidor.mjs  y luego, en Chrome sin ventana, http://127.0.0.1:8011/tool/render.html?nivel=n01
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const ROOTS = {'/repo/': repo, '/tool/': here};
// Solo se escribe dentro de estas carpetas.
const WRITABLE = ['n01', 'n02', 'n03'].flatMap(n => [path.join(repo, 'dist', n, 'map'), path.join(repo, 'dist', n, 'rombos'), path.join(repo, 'data', n)]);
const mime = {'.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json'};
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/save') {
    const target = path.resolve(repo, url.searchParams.get('name') || '');
    if (!WRITABLE.some(dir => target.startsWith(dir + path.sep))) { res.writeHead(403); return res.end('ruta no permitida'); }
    const chunks = []; for await (const c of req) chunks.push(c);
    fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, Buffer.concat(chunks));
    if (target.endsWith('estado.txt')) console.log(Buffer.concat(chunks).toString());
    res.writeHead(200); return res.end('ok');
  }
  const prefix = Object.keys(ROOTS).find(p => url.pathname.startsWith(p));
  const file = prefix && path.resolve(ROOTS[prefix], '.' + decodeURIComponent(url.pathname.slice(prefix.length - 1)));
  if (!file || !file.startsWith(ROOTS[prefix]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
}).listen(8011, '127.0.0.1', () => console.log('Abre en Chrome: http://127.0.0.1:8011/tool/render.html?nivel=n01'));
