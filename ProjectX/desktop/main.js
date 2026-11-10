// Windows (and any desktop) launcher: serves the game from a private local server and shows it in a window.
const { app, BrowserWindow, Menu } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const root = path.join(__dirname, 'game');
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.normalize(path.join(root, p));
      if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
  });
}
async function start() {
  const port = await serve();
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({ width: 1280, height: 720, minWidth: 800, minHeight: 450, backgroundColor: '#090a0e', title: 'Project X', autoHideMenuBar: true, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
  win.once('ready-to-show', () => { win.show(); if (!process.argv.includes('--windowed')) win.setFullScreen(true); });
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11' || (i.key === 'Enter' && i.alt)) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (i.key === 'F4' && i.alt) app.quit();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadURL('http://127.0.0.1:' + port + '/index.html');
}
app.whenReady().then(start);
app.on('window-all-closed', () => app.quit());
