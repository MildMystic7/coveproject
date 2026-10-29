// Local studio server for the promo video: serves the repo and saves rendered files into brand/.
// Run from the repo root: node tools/promo/serve.cjs, then open http://localhost:4750/tools/promo/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.PORT) || 4750;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.mp4': 'video/mp4', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/save') {
    const name = path.basename(url.searchParams.get('name') || '');
    if (!/^[\w.-]+\.(mp4|png)$/.test(name)) { res.writeHead(400); res.end('Bad file name'); return; }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const data = Buffer.concat(chunks);
      const out = path.join(ROOT, 'brand', name);
      fs.writeFileSync(out, data);
      console.log(`saved ${path.relative(ROOT, out)} (${(data.length / 1048576).toFixed(2)} MB)`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ saved: path.relative(ROOT, out), bytes: data.length }));
    });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Promo studio: http://localhost:${PORT}/tools/promo/`));
