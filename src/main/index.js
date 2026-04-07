const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require('electron');
const path = require('path');

const { load }     = require('./settings');
const services     = require('./services');
const tray         = require('./tray');
const { register } = require('./ipc');

let mainWindow      = null;
let statusInterval  = null;
let broadcastStatus = null;

const settings = load();

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const bounds = settings.windowBounds || { width: 1100, height: 720 };

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900, minHeight: 600,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    frame: true,
    backgroundColor: '#ffffff',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '../../index.html'));

  // Log lỗi từ renderer ra console
  mainWindow.webContents.on('console-message', (e, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[Renderer] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.error(`[Load failed] ${code}: ${desc}`);
  });

  const saveBounds = () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      settings.windowBounds = mainWindow.getBounds();
      settings._save();
    }
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move',   saveBounds);

  mainWindow.once('ready-to-show', async () => {
    if (!settings.startMinimized) mainWindow.show();
    if (broadcastStatus) broadcastStatus();

    setTimeout(async () => {
      const status = await services.getStatus();
      if (settings.autoStartRouter   && !status.router.running)   mainWindow.webContents.send('auto-start', 'router');
      if (settings.autoStartOpenclaw && !status.openclaw.running) mainWindow.webContents.send('auto-start', 'openclaw');
    }, 1500);
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting && settings.minimizeToTray !== false) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();

  tray.create(
    path.join(__dirname, '../../icon.png'),
    (action) => {
      if (action === 'show') { mainWindow && mainWindow.show(); return; }
      if (action === 'quit') { app.isQuitting = true; app.quit(); return; }
      if (mainWindow) mainWindow.webContents.send(`tray-${action}`);
    }
  );

  const ipc = register({ ipcMain, app, shell, settings, services, tray, getWindow: () => mainWindow });
  broadcastStatus = ipc.broadcastStatus;

  globalShortcut.register('CommandOrControl+1',       () => mainWindow && mainWindow.webContents.send('tray-start-router'));
  globalShortcut.register('CommandOrControl+2',       () => mainWindow && mainWindow.webContents.send('tray-start-openclaw'));
  globalShortcut.register('CommandOrControl+Shift+1', () => mainWindow && mainWindow.webContents.send('tray-stop-router'));
  globalShortcut.register('CommandOrControl+Shift+2', () => mainWindow && mainWindow.webContents.send('tray-stop-openclaw'));

  statusInterval = setInterval(() => broadcastStatus(), 5000);
});

app.on('window-all-closed', (e) => e.preventDefault());

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  clearInterval(statusInterval);
  services.killAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
