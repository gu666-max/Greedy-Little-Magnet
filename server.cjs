'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const port = Number(process.env.PORT) || 4173;
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/game-core.js', ['game-core.js', 'text/javascript; charset=utf-8']],
  ['/game.js', ['game.js', 'text/javascript; charset=utf-8']]
]);
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { res.writeHead(400); return res.end('Bad request'); }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  const file = files.get(pathname);
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, file[0]), (error, data) => {
    if (error) { res.writeHead(500); return res.end('Unable to read game file'); }
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。可直接双击 index.html，或设置 PORT 后重试。` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`贪心小磁铁已启动：http://127.0.0.1:${port}`));
