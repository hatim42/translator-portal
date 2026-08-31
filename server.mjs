import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
createServer((req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '')));
  let file = path.startsWith(root) ? path : join(root, 'index.html');
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); } catch { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(4173, '0.0.0.0');
