const { app, BrowserWindow, ipcMain, Tray, Menu, shell, globalShortcut, nativeImage } = require('electron');
const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;
let statusCheckInterval = null;

let processes = { router: null, openclaw: null };

let processInfo = {
  router:   { pid: null, startTime: null, port: 20128, externalPid: null },
  openclaw: { pid: null, startTime: null, port: 18789, externalPid: null }
};

// ─── Settings ─────────────────────────────────────────────────────────────────
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch (e) {}
  return {
    autoLaunch: false,
    autoStartRouter: false,
    autoStartOpenclaw: false,
    minimizeToTray: true,
    startMinimized: false
  };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (e) {}
}

let settings = loadSettings();

// ─── Auto-launch (Windows Registry) ──────────────────────────────────────────
function setAutoLaunch(enable) {
  const exePath = process.execPath;
  const appName = 'ServiceManager';
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

  if (enable) {
    exec(`reg add "${regKey}" /v "${appName}" /t REG_SZ /d "${exePath}" /f`, (err) => {
      if (!err) {
        settings.autoLaunch = true;
        saveSettings(settings);
      }
    });
  } else {
    exec(`reg delete "${regKey}" /v "${appName}" /f`, (err) => {
      settings.autoLaunch = false;
      saveSettings(settings);
    });
  }
}

function checkAutoLaunch() {
  return new Promise((resolve) => {
    const appName = 'ServiceManager';
    const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    exec(`reg query "${regKey}" /v "${appName}"`, (err, stdout) => {
      resolve(!err && stdout.includes(appName));
    });
  });
}

// ─── IPC: Settings ────────────────────────────────────────────────────────────
ipcMain.on('get-settings', async (event) => {
  const autoLaunch = await checkAutoLaunch();
  settings.autoLaunch = autoLaunch;
  settings._path = SETTINGS_PATH;
  event.reply('settings-data', settings);
});

ipcMain.on('save-settings', (event, newSettings) => {
  const wasAutoLaunch = settings.autoLaunch;
  settings = { ...settings, ...newSettings };
  saveSettings(settings);

  // Apply auto-launch change
  if (newSettings.autoLaunch !== undefined && newSettings.autoLaunch !== wasAutoLaunch) {
    setAutoLaunch(newSettings.autoLaunch);
  }

  event.reply('settings-saved', settings);
});

ipcMain.on('get-app-version', (event) => {
  event.reply('app-version', app.getVersion());
});

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  // Restore saved window size
  const winBounds = settings.windowBounds || { width: 1100, height: 720 };

  mainWindow = new BrowserWindow({
    width: winBounds.width, height: winBounds.height,
    x: winBounds.x, y: winBounds.y,
    minWidth: 900, minHeight: 600,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    frame: true,
    backgroundColor: '#ffffff',
    show: false
  });

  mainWindow.loadFile('index.html');

  // Save window size on resize/move
  const saveBounds = () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      settings.windowBounds = mainWindow.getBounds();
      saveSettings(settings);
    }
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move',   saveBounds);

  mainWindow.once('ready-to-show', () => {
    if (!settings.startMinimized) {
      mainWindow.show();
    }
    // Kick off first status check
    broadcastStatus();

    // Auto-start services nếu được bật
    setTimeout(async () => {
      const status = await checkStatusByPort();
      if (settings.autoStartRouter && !status.router.running) {
        mainWindow.webContents.send('auto-start', 'router');
      }
      if (settings.autoStartOpenclaw && !status.openclaw.running) {
        mainWindow.webContents.send('auto-start', 'openclaw');
      }
    }, 1500);
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      if (settings.minimizeToTray !== false) {
        e.preventDefault();
        mainWindow.hide();
      }
    }
  });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  let icon;
  try {
    icon = fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty();
    tray = new Tray(icon);
  } catch (e) {
    tray = new Tray(nativeImage.createEmpty());
  }
  tray.setToolTip('Service Manager');
  updateTrayMenu(false, false);
  tray.on('double-click', () => mainWindow.show());
}

function updateTrayMenu(routerRunning, openclawRunning) {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: '🖥  Mở ứng dụng', click: () => mainWindow.show() },
    { type: 'separator' },
    {
      label: routerRunning ? '⏹  Dừng 9Router' : '▶  Khởi động 9Router',
      click: () => mainWindow.webContents.send(routerRunning ? 'tray-stop-router' : 'tray-start-router')
    },
    {
      label: openclawRunning ? '⏹  Dừng OpenClaw' : '▶  Khởi động OpenClaw',
      click: () => mainWindow.webContents.send(openclawRunning ? 'tray-stop-openclaw' : 'tray-start-openclaw')
    },
    { type: 'separator' },
    { label: '🌐  Mở 9Router Dashboard', click: () => shell.openExternal('http://localhost:20128') },
    { label: '🌐  Mở OpenClaw API',      click: () => shell.openExternal('http://127.0.0.1:18789') },
    { type: 'separator' },
    { label: '❌  Thoát', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`9Router: ${routerRunning ? '🟢' : '🔴'}  OpenClaw: ${openclawRunning ? '🟢' : '🔴'}`);
}

// ─── Port / HTTP health check ─────────────────────────────────────────────────
function checkPort(port) {
  return new Promise((resolve) => {
    exec(`netstat -ano | findstr ":${port} " | findstr "LISTENING"`, (err, stdout) => {
      if (stdout && stdout.trim()) {
        const pid = parseInt(stdout.trim().split(/\s+/).pop());
        resolve({ listening: true, pid: isNaN(pid) ? null : pid });
      } else {
        resolve({ listening: false, pid: null });
      }
    });
  });
}

function httpPing(port, path = '/') {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path, timeout: 1000 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ─── Status engine ────────────────────────────────────────────────────────────
async function checkStatusByPort() {
  const [routerPort, openclawPort] = await Promise.all([
    checkPort(processInfo.router.port),
    checkPort(processInfo.openclaw.port)
  ]);

  // Router
  if (routerPort.listening) {
    processInfo.router.pid = routerPort.pid;
    if (!processInfo.router.startTime) processInfo.router.startTime = Date.now();
    processInfo.router.externalPid = !processes.router ? routerPort.pid : null;
  } else if (!processes.router) {
    processInfo.router.pid = null;
    processInfo.router.startTime = null;
    processInfo.router.externalPid = null;
  }

  // OpenClaw
  if (openclawPort.listening) {
    processInfo.openclaw.pid = openclawPort.pid;
    if (!processInfo.openclaw.startTime) processInfo.openclaw.startTime = Date.now();
    processInfo.openclaw.externalPid = !processes.openclaw ? openclawPort.pid : null;
  } else if (!processes.openclaw) {
    processInfo.openclaw.pid = null;
    processInfo.openclaw.startTime = null;
    processInfo.openclaw.externalPid = null;
  }

  const status = {
    router: {
      running: routerPort.listening || !!processes.router,
      pid: processInfo.router.pid,
      startTime: processInfo.router.startTime,
      port: processInfo.router.port,
      external: !!processInfo.router.externalPid
    },
    openclaw: {
      running: openclawPort.listening || !!processes.openclaw,
      pid: processInfo.openclaw.pid,
      startTime: processInfo.openclaw.startTime,
      port: processInfo.openclaw.port,
      external: !!processInfo.openclaw.externalPid
    }
  };

  updateTrayMenu(status.router.running, status.openclaw.running);
  return status;
}

async function broadcastStatus() {
  const data = await checkStatusByPort();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-update', data);
  }
}

// ─── IPC: check-status ────────────────────────────────────────────────────────
ipcMain.on('check-status', async (event) => {
  const data = await checkStatusByPort();
  event.reply('status-update', data);
});

// ─── IPC: open-browser ───────────────────────────────────────────────────────
ipcMain.on('open-browser', (event, url) => shell.openExternal(url));

// ─── IPC: open-folder ────────────────────────────────────────────────────────
ipcMain.on('open-folder', (event, folderPath) => {
  exec(`explorer "${folderPath}"`, () => {});
});

// ─── Helper: spawn service ────────────────────────────────────────────────────
function spawnService(name, cmd, args, infoKey, statusChannel, logChannel, event) {
  if (processes[infoKey] && processes[infoKey].pid) {
    event.reply(statusChannel, {
      running: true, message: `${name} đang chạy`,
      pid: processes[infoKey].pid,
      startTime: processInfo[infoKey].startTime,
      port: processInfo[infoKey].port
    });
    return;
  }

  try {
    const proc = spawn(cmd, args, { windowsHide: true, detached: false, shell: true });
    processes[infoKey] = proc;
    processInfo[infoKey].pid = proc.pid;
    processInfo[infoKey].startTime = Date.now();

    const startTimeout = setTimeout(async () => {
      const portCheck = await checkPort(processInfo[infoKey].port);
      if (!portCheck.listening) {
        event.reply(statusChannel, {
          running: false, error: true,
          message: `${name} không khởi động được. Kiểm tra: npm list -g ${cmd}`
        });
      }
    }, 3000);

    proc.stdout.on('data', (d) => {
      clearTimeout(startTimeout);
      event.reply(logChannel, d.toString());
    });
    proc.stderr.on('data', (d) => event.reply(logChannel, `ERROR: ${d.toString()}`));

    proc.on('error', (err) => {
      clearTimeout(startTimeout);
      processes[infoKey] = null;
      processInfo[infoKey].pid = null;
      processInfo[infoKey].startTime = null;
      event.reply(statusChannel, { running: false, error: true, message: `Lỗi: ${err.message}` });
      broadcastStatus();
    });

    proc.on('close', (code) => {
      clearTimeout(startTimeout);
      processes[infoKey] = null;
      processInfo[infoKey].pid = null;
      processInfo[infoKey].startTime = null;
      const crashed = code !== 0 && code !== null;
      event.reply(statusChannel, {
        running: false,
        message: code === 0 ? `${name} đã dừng` : `${name} dừng với lỗi (code: ${code})`,
        error: crashed
      });
      // Notify crash via tray
      if (crashed && tray) {
        tray.displayBalloon({
          iconType: 'error',
          title: `${name} đã crash`,
          content: `Process thoát với code ${code}. Click để mở app.`
        });
      }
      broadcastStatus();
    });

    event.reply(statusChannel, {
      running: true, message: `${name} đang khởi động...`,
      pid: proc.pid, startTime: processInfo[infoKey].startTime,
      port: processInfo[infoKey].port
    });
    broadcastStatus();
  } catch (err) {
    event.reply(statusChannel, { running: false, error: true, message: `Không thể khởi động: ${err.message}` });
  }
}

// ─── Helper: stop service ─────────────────────────────────────────────────────
function stopService(name, infoKey, statusChannel, event) {
  const proc = processes[infoKey];
  const extPid = processInfo[infoKey].externalPid;

  if (proc) {
    try {
      proc.kill('SIGTERM');
    } catch (e) {
      exec(`taskkill /PID ${proc.pid} /F /T`, () => {});
    }
    processes[infoKey] = null;
    processInfo[infoKey].pid = null;
    processInfo[infoKey].startTime = null;
    event.reply(statusChannel, { running: false, message: `${name} đã dừng` });
    broadcastStatus();
  } else if (extPid) {
    // Kill external process by PID
    exec(`taskkill /PID ${extPid} /F /T`, (err) => {
      if (!err) {
        processInfo[infoKey].pid = null;
        processInfo[infoKey].startTime = null;
        processInfo[infoKey].externalPid = null;
        event.reply(statusChannel, { running: false, message: `${name} đã dừng (PID ${extPid})` });
      } else {
        event.reply(statusChannel, { running: false, error: true, message: `Không thể dừng ${name}: ${err.message}` });
      }
      broadcastStatus();
    });
  } else {
    event.reply(statusChannel, { running: false, message: `${name} không chạy` });
  }
}

// ─── IPC: start/stop/restart ──────────────────────────────────────────────────
ipcMain.on('start-router',   (e) => spawnService('9Router',  '9router',  [],          'router',   'router-status',   'router-log',   e));
ipcMain.on('start-openclaw', (e) => spawnService('OpenClaw', 'openclaw', ['gateway'], 'openclaw', 'openclaw-status', 'openclaw-log', e));
ipcMain.on('stop-router',    (e) => stopService('9Router',  'router',   'router-status',   e));
ipcMain.on('stop-openclaw',  (e) => stopService('OpenClaw', 'openclaw', 'openclaw-status', e));

ipcMain.on('restart-router', (e) => {
  stopService('9Router', 'router', 'router-status', e);
  setTimeout(() => spawnService('9Router', '9router', [], 'router', 'router-status', 'router-log', e), 1500);
});

ipcMain.on('restart-openclaw', (e) => {
  stopService('OpenClaw', 'openclaw', 'openclaw-status', e);
  setTimeout(() => spawnService('OpenClaw', 'openclaw', ['gateway'], 'openclaw', 'openclaw-status', 'openclaw-log', e), 1500);
});

// ─── IPC: update ─────────────────────────────────────────────────────────────
function updatePackage(pkgName, appLabel, event) {
  const proc = spawn('cmd.exe', ['/c', 'npm', 'install', '-g', pkgName], { windowsHide: true });
  proc.stdout.on('data', (d) => event.reply('update-progress', { app: appLabel, message: d.toString() }));
  proc.stderr.on('data', (d) => event.reply('update-progress', { app: appLabel, message: d.toString() }));
  proc.on('close', (code) => event.reply('update-result', { success: code === 0, app: appLabel, code }));
}

ipcMain.on('update-router',   (e) => updatePackage('9router',  '9Router',  e));
ipcMain.on('update-openclaw', (e) => updatePackage('openclaw', 'OpenClaw', e));

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();

  // Keyboard shortcuts
  globalShortcut.register('CommandOrControl+1', () => mainWindow.webContents.send('tray-start-router'));
  globalShortcut.register('CommandOrControl+2', () => mainWindow.webContents.send('tray-start-openclaw'));
  globalShortcut.register('CommandOrControl+Shift+1', () => mainWindow.webContents.send('tray-stop-router'));
  globalShortcut.register('CommandOrControl+Shift+2', () => mainWindow.webContents.send('tray-stop-openclaw'));

  // Periodic status check every 5s
  statusCheckInterval = setInterval(broadcastStatus, 5000);
});

app.on('window-all-closed', (e) => e.preventDefault());

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  clearInterval(statusCheckInterval);
  if (processes.router)   try { processes.router.kill();   } catch (e) {}
  if (processes.openclaw) try { processes.openclaw.kill(); } catch (e) {}
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
