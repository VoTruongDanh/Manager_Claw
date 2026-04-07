const { exec } = require('child_process');
const shutdownTools = require('./tools/shutdown');
const idmTools = require('./tools/idm-reset');

const SERVICE_CONFIGS = {
  router: {
    key: 'router',
    label: '9Router',
    cmd: '9router',
    args: [],
    statusCh: 'router-status',
    logCh: 'router-log'
  },
  openclaw: {
    key: 'openclaw',
    label: 'OpenClaw',
    cmd: 'openclaw',
    args: ['gateway'],
    statusCh: 'openclaw-status',
    logCh: 'openclaw-log'
  }
};

function register({ ipcMain, app, shell, settings, services, tray, getWindow }) {
  const send = (channel, data) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, data);
  };

  const broadcastStatus = async () => {
    const data = await services.getStatus();
    send('status-update', data);
    tray.updateMenu({ routerRunning: data.router.running, openclawRunning: data.openclaw.running });
    return data;
  };

  Object.values(SERVICE_CONFIGS).forEach((cfg) => {
    services.registerService(cfg, {
      onStatus: (data) => {
        send(cfg.statusCh, data);
        broadcastStatus();
      },
      onLog: (data) => send(cfg.logCh, data),
      onCrash: (label, code) => tray.notify(`${label} da crash`, `Process thoat voi code ${code}`),
      onAutoHeal: (label, reason, attempt) =>
        tray.notify('Auto-heal', `${label}: ${reason} (${attempt}/3)`)
    });
  });

  services.setAutoHealEnabled(!!settings.autoHeal);

  ipcMain.on('check-status', async (event) => {
    const data = await broadcastStatus();
    event.reply('status-update', data);
  });

  ipcMain.on('get-settings', async (event) => {
    const autoLaunch = await checkAutoLaunch();
    event.reply('settings-data', {
      autoLaunch,
      autoHeal: settings.autoHeal !== false,
      startMinimized: settings.startMinimized,
      autoStartRouter: settings.autoStartRouter,
      autoStartOpenclaw: settings.autoStartOpenclaw,
      minimizeToTray: settings.minimizeToTray,
      _path: settings._settingsPath || ''
    });
  });

  ipcMain.on('save-settings', (event, newSettings) => {
    const wasAutoLaunch = settings.autoLaunch;
    const keys = ['autoLaunch', 'autoHeal', 'startMinimized', 'autoStartRouter', 'autoStartOpenclaw', 'minimizeToTray'];

    keys.forEach((key) => {
      if (newSettings[key] !== undefined) settings[key] = newSettings[key];
    });

    settings._save();

    if (newSettings.autoLaunch !== undefined && newSettings.autoLaunch !== wasAutoLaunch) {
      setAutoLaunch(newSettings.autoLaunch);
    }

    if (newSettings.autoHeal !== undefined) {
      services.setAutoHealEnabled(newSettings.autoHeal);
    }

    event.reply('settings-saved');
  });

  ipcMain.on('set-auto-heal', (event, enabled) => {
    settings.autoHeal = !!enabled;
    settings._save();
    services.setAutoHealEnabled(settings.autoHeal);
    event.reply('auto-heal-saved', { enabled: settings.autoHeal });
  });

  ipcMain.on('get-app-version', (event) => event.reply('app-version', app.getVersion()));

  ipcMain.on('open-browser', (_, url) => shell.openExternal(url));
  ipcMain.on('open-folder', (_, folderPath) => exec(`explorer "${folderPath}"`, () => {}));

  Object.values(SERVICE_CONFIGS).forEach((cfg) => {
    ipcMain.on(`start-${cfg.key}`, () => {
      services.spawnService({ key: cfg.key });
    });

    ipcMain.on(`stop-${cfg.key}`, () => {
      services.stopService({ key: cfg.key });
    });

    ipcMain.on(`restart-${cfg.key}`, () => {
      services.restartService({ key: cfg.key });
    });
  });

  const UPDATE_MAP = {
    router: { pkg: '9router', label: '9Router' },
    openclaw: { pkg: 'openclaw', label: 'OpenClaw' }
  };

  Object.entries(UPDATE_MAP).forEach(([key, cfg]) => {
    ipcMain.on(`update-${key}`, (event) => {
      services.updatePackage({
        ...cfg,
        onProgress: (data) => event.reply('update-progress', data),
        onDone: (data) => event.reply('update-result', data)
      });
    });
  });

  ipcMain.on('shutdown-schedule', async (event, { seconds, mode }) => {
    const fn = mode === 'restart' ? shutdownTools.scheduleRestart : shutdownTools.scheduleShutdown;
    const result = await fn(seconds);
    event.reply('shutdown-scheduled', result);
  });

  ipcMain.on('shutdown-cancel', async (event) => {
    const result = await shutdownTools.cancelShutdown();
    event.reply('shutdown-cancelled', result);
  });

  ipcMain.on('shutdown-now', async () => {
    await shutdownTools.shutdownNow();
  });

  // IDM Trial Reset handlers
  ipcMain.handle('idm-reset-trial', async () => {
    return await idmTools.resetIDMTrial();
  });

  ipcMain.handle('idm-check-running', async () => {
    return await idmTools.checkIDMRunning();
  });

  return { broadcastStatus };
}

function setAutoLaunch(enable) {
  const appName = 'ServiceManager';
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

  if (enable) {
    exec(`reg add "${regKey}" /v "${appName}" /t REG_SZ /d "${process.execPath}" /f`);
  } else {
    exec(`reg delete "${regKey}" /v "${appName}" /f`);
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

module.exports = { register };
