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

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePrompt(input = {}, now = Date.now()) {
  const name = normalizeText(input.name);
  const content = String(input.content || '').trim();
  if (!name) throw new Error('Tên prompt không được để trống');
  if (!content) throw new Error('Nội dung prompt không được để trống');

  return {
    id: input.id || `prompt_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    content,
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function normalizeLink(input = {}, now = Date.now()) {
  const name = normalizeText(input.name);
  const url = normalizeText(input.url);
  if (!name) throw new Error('Tên link không được để trống');
  if (!url) throw new Error('Link không được để trống');

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error('Link không hợp lệ');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Chỉ hỗ trợ link http hoặc https');
  }

  return {
    id: input.id || `link_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    url: parsedUrl.toString(),
    read: !!input.read,
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function persistSettings(settings) {
  settings._save();
}

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

  ipcMain.handle('library-get-all', () => ({
    prompts: Array.isArray(settings.prompts) ? settings.prompts : [],
    links: Array.isArray(settings.links) ? settings.links : []
  }));

  ipcMain.handle('prompt-save', (_, prompt) => {
    const now = Date.now();
    const current = Array.isArray(settings.prompts) ? [...settings.prompts] : [];
    const existing = prompt && prompt.id ? current.find(item => item.id === prompt.id) : null;
    const normalized = normalizePrompt({
      ...existing,
      ...prompt,
      createdAt: existing?.createdAt || prompt?.createdAt
    }, now);

    const next = existing
      ? current.map(item => (item.id === normalized.id ? normalized : item))
      : [normalized, ...current];

    settings.prompts = next;
    persistSettings(settings);
    return { ok: true, prompt: normalized, prompts: next };
  });

  ipcMain.handle('prompt-delete', (_, promptId) => {
    const current = Array.isArray(settings.prompts) ? settings.prompts : [];
    settings.prompts = current.filter(item => item.id !== promptId);
    persistSettings(settings);
    return { ok: true, prompts: settings.prompts };
  });

  ipcMain.handle('link-save', (_, link) => {
    const now = Date.now();
    const current = Array.isArray(settings.links) ? [...settings.links] : [];
    const existing = link && link.id ? current.find(item => item.id === link.id) : null;
    const normalized = normalizeLink({
      ...existing,
      ...link,
      createdAt: existing?.createdAt || link?.createdAt
    }, now);

    const next = existing
      ? current.map(item => (item.id === normalized.id ? normalized : item))
      : [normalized, ...current];

    settings.links = next;
    persistSettings(settings);
    return { ok: true, link: normalized, links: next };
  });

  ipcMain.handle('link-delete', (_, linkId) => {
    const current = Array.isArray(settings.links) ? settings.links : [];
    settings.links = current.filter(item => item.id !== linkId);
    persistSettings(settings);
    return { ok: true, links: settings.links };
  });

  ipcMain.handle('link-toggle-read', (_, { id, read }) => {
    const now = Date.now();
    const current = Array.isArray(settings.links) ? settings.links : [];
    let updatedLink = null;

    settings.links = current.map((item) => {
      if (item.id !== id) return item;
      updatedLink = { ...item, read: !!read, updatedAt: now };
      return updatedLink;
    });

    persistSettings(settings);
    return { ok: true, link: updatedLink, links: settings.links };
  });

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
