const { exec } = require('child_process');
const shutdownTools = require('./tools/shutdown');

const SERVICE_CONFIGS = {
  router: {
    key: 'router', label: '9Router',
    cmd: '9router', args: [],
    statusCh: 'router-status', logCh: 'router-log'
  },
  openclaw: {
    key: 'openclaw', label: 'OpenClaw',
    cmd: 'openclaw', args: ['gateway'],
    statusCh: 'openclaw-status', logCh: 'openclaw-log'
  }
};

function register({ ipcMain, app, shell, settings, services, tray, getWindow }) {
  const send = (ch, data) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(ch, data);
  };

  const broadcastStatus = async () => {
    const data = await services.getStatus();
    send('status-update', data);
    tray.updateMenu({ routerRunning: data.router.running, openclawRunning: data.openclaw.running });
    return data;
  };

  // ─── Status ────────────────────────────────────────────────────────────────
  ipcMain.on('check-status', async (event) => {
    const data = await broadcastStatus();
    event.reply('status-update', data);
  });

  // ─── Settings ──────────────────────────────────────────────────────────────
  ipcMain.on('get-settings', async (event) => {
    const autoLaunch = await checkAutoLaunch();
    // Trả về plain object, không kèm function
    const payload = {
      autoLaunch,
      startMinimized:    settings.startMinimized,
      autoStartRouter:   settings.autoStartRouter,
      autoStartOpenclaw: settings.autoStartOpenclaw,
      minimizeToTray:    settings.minimizeToTray,
      _path:             settings._settingsPath || ''
    };
    event.reply('settings-data', payload);
  });

  ipcMain.on('save-settings', (event, newSettings) => {
    const wasAutoLaunch = settings.autoLaunch;
    // Chỉ merge các key hợp lệ
    const keys = ['autoLaunch','startMinimized','autoStartRouter','autoStartOpenclaw','minimizeToTray'];
    keys.forEach(k => { if (newSettings[k] !== undefined) settings[k] = newSettings[k]; });
    settings._save();
    if (newSettings.autoLaunch !== undefined && newSettings.autoLaunch !== wasAutoLaunch) {
      setAutoLaunch(newSettings.autoLaunch);
    }
    event.reply('settings-saved');
  });

  ipcMain.on('get-app-version', (event) => event.reply('app-version', app.getVersion()));

  // ─── Shell helpers ─────────────────────────────────────────────────────────
  ipcMain.on('open-browser', (_, url) => shell.openExternal(url));
  ipcMain.on('open-folder',  (_, folderPath) => exec(`explorer "${folderPath}"`, () => {}));

  // ─── Service start / stop / restart ───────────────────────────────────────
  Object.values(SERVICE_CONFIGS).forEach(cfg => {
    ipcMain.on(`start-${cfg.key}`, (event) => {
      services.spawnService({
        ...cfg,
        onStatus: (d) => { event.reply(cfg.statusCh, d); broadcastStatus(); },
        onLog:    (d) => event.reply(cfg.logCh, d),
        onCrash:  (label, code) => tray.notify(`${label} đã crash`, `Process thoát với code ${code}`)
      });
    });

    ipcMain.on(`stop-${cfg.key}`, (event) => {
      services.stopService({
        key: cfg.key, label: cfg.label,
        onStatus: (d) => { event.reply(cfg.statusCh, d); broadcastStatus(); }
      });
    });

    ipcMain.on(`restart-${cfg.key}`, (event) => {
      services.stopService({
        key: cfg.key, label: cfg.label,
        onStatus: (d) => event.reply(cfg.statusCh, d)
      });
      setTimeout(() => {
        services.spawnService({
          ...cfg,
          onStatus: (d) => { event.reply(cfg.statusCh, d); broadcastStatus(); },
          onLog:    (d) => event.reply(cfg.logCh, d),
          onCrash:  (label, code) => tray.notify(`${label} đã crash`, `Process thoát với code ${code}`)
        });
      }, 1500);
    });
  });

  // ─── Update ────────────────────────────────────────────────────────────────
  const UPDATE_MAP = {
    router:   { pkg: '9router',  label: '9Router'  },
    openclaw: { pkg: 'openclaw', label: 'OpenClaw' }
  };
  Object.entries(UPDATE_MAP).forEach(([key, cfg]) => {
    ipcMain.on(`update-${key}`, (event) => {
      services.updatePackage({
        ...cfg,
        onProgress: (d) => event.reply('update-progress', d),
        onDone:     (d) => event.reply('update-result', d)
      });
    });
  });

  // ─── Shutdown tools ────────────────────────────────────────────────────────
  ipcMain.on('shutdown-schedule', async (event, { seconds, mode }) => {
    const fn = mode === 'restart' ? shutdownTools.scheduleRestart : shutdownTools.scheduleShutdown;
    const result = await fn(seconds);
    event.reply('shutdown-scheduled', result);
  });

  ipcMain.on('shutdown-cancel', async (event) => {
    const result = await shutdownTools.cancelShutdown();
    event.reply('shutdown-cancelled', result);
  });

  ipcMain.on('shutdown-now', async (event) => {
    await shutdownTools.shutdownNow();
  });

  return { broadcastStatus };
}

// ─── Auto-launch ──────────────────────────────────────────────────────────────
function setAutoLaunch(enable) {
  const appName = 'ServiceManager';
  const regKey  = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  if (enable) {
    exec(`reg add "${regKey}" /v "${appName}" /t REG_SZ /d "${process.execPath}" /f`);
  } else {
    exec(`reg delete "${regKey}" /v "${appName}" /f`);
  }
}

function checkAutoLaunch() {
  return new Promise((resolve) => {
    const appName = 'ServiceManager';
    const regKey  = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    exec(`reg query "${regKey}" /v "${appName}"`, (err, stdout) => {
      resolve(!err && stdout.includes(appName));
    });
  });
}

module.exports = { register };
