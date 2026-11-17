// Tiny static file server for the tests: node tests/serve.js <folder> <port>
const http = require('http'), fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2]), port = +process.argv[3];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.css': 'text/css' };
http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const fp = path.join(dir, u);
  if (!fp.startsWith(dir)) { res.statusCode = 403; return res.end(); }
  fs.readFile(fp, (e, d) => {
    if (e) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', types[path.extname(fp)] || 'application/octet-stream'); res.setHeader('Content-Length', d.length); res.end(d);
  });
}).listen(port);
