// Servidor local sem dependências. Execute com: node frontend/dev-server.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname);
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };

http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end('Requisição inválida'); return; }
  if (pathname === '/promocoes' || pathname === '/promocoes/') { response.writeHead(301, { Location: '/ofertas/' }).end(); return; }
  if (['/ofertas', '/privacidade', '/termos', '/cookies', '/reembolso'].includes(pathname)) {
    response.writeHead(301, { Location: pathname + '/' }).end(); return;
  }
  const filePath = path.resolve(root, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '');
  if (!filePath.startsWith(root + path.sep)) { response.writeHead(403).end('Acesso negado'); return; }
  fs.readFile(filePath, (error, content) => {
    if (error) { response.writeHead(404).end('Página não encontrada'); return; }
    const contentType = mime[path.extname(filePath)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType.startsWith('image/') || contentType.startsWith('font/') ? contentType : `${contentType}; charset=utf-8` });
    response.end(content);
  });
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/`));
