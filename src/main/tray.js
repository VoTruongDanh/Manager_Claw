const { Tray, Menu, nativeImage, shell } = require('electron');
const fs   = require('fs');

let tray      = null;
let _onAction = null;

function create(iconPath, onAction) {
  _onAction = onAction;
  try {
    const icon = fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty();
    tray = new Tray(icon);
  } catch (e) {
    tray = new Tray(nativeImage.createEmpty());
  }
  tray.setToolTip('Service Manager');
  updateMenu({ routerRunning: false, openclawRunning: false });
  tray.on('double-click', () => _onAction('show'));
  return tray;
}

function updateMenu({ routerRunning, openclawRunning }) {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: '🖥  Mở ứng dụng', click: () => _onAction('show') },
    { type: 'separator' },
    {
      label: routerRunning ? '⏹  Dừng 9Router' : '▶  Khởi động 9Router',
      click: () => _onAction(routerRunning ? 'stop-router' : 'start-router')
    },
    {
      label: openclawRunning ? '⏹  Dừng OpenClaw' : '▶  Khởi động OpenClaw',
      click: () => _onAction(openclawRunning ? 'stop-openclaw' : 'start-openclaw')
    },
    { type: 'separator' },
    { label: '🌐  Mở 9Router Dashboard', click: () => shell.openExternal('http://localhost:20128') },
    { label: '🌐  Mở OpenClaw API',      click: () => shell.openExternal('http://127.0.0.1:18789') },
    { type: 'separator' },
    { label: '❌  Thoát', click: () => _onAction('quit') }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`9Router: ${routerRunning ? '🟢' : '🔴'}  OpenClaw: ${openclawRunning ? '🟢' : '🔴'}`);
}

function notify(title, content) {
  if (!tray) return;
  try { tray.displayBalloon({ iconType: 'error', title, content }); } catch (e) {}
}

module.exports = { create, updateMenu, notify };
