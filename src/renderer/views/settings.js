const { ipcRenderer } = require('electron');
const ui = require('../ui');

let lastSavedState = {};

function load() {
  ipcRenderer.send('get-settings');
}

function markDirty() {
  const badge = ui.$('settings-dirty-badge');
  if (badge) badge.style.display = 'inline-flex';
}

function markClean() {
  const badge = ui.$('settings-dirty-badge');
  if (badge) badge.style.display = 'none';
}

function getCurrentState() {
  return {
    autoLaunch:        ui.$('setting-auto-launch').checked,
    autoHeal:          ui.$('setting-auto-heal').checked,
    startMinimized:    ui.$('setting-start-minimized').checked,
    autoStartRouter:   ui.$('setting-auto-router').checked,
    autoStartOpenclaw: ui.$('setting-auto-openclaw').checked,
    minimizeToTray:    ui.$('setting-minimize-tray').checked
  };
}

function isDirty() {
  const current = getCurrentState();
  return JSON.stringify(current) !== JSON.stringify(lastSavedState);
}

function init() {
  ipcRenderer.on('settings-data', (_, s) => {
    ui.$('setting-auto-launch').checked     = !!s.autoLaunch;
    ui.$('setting-auto-heal').checked       = !!s.autoHeal;
    ui.$('setting-start-minimized').checked = !!s.startMinimized;
    ui.$('setting-auto-router').checked     = !!s.autoStartRouter;
    ui.$('setting-auto-openclaw').checked   = !!s.autoStartOpenclaw;
    ui.$('setting-minimize-tray').checked   = s.minimizeToTray !== false;
    ui.$('settings-path-text').textContent  = s._path || '...';
    lastSavedState = getCurrentState();
    markClean();
  });

  ipcRenderer.on('settings-saved', () => {
    lastSavedState = getCurrentState();
    markClean();
    ui.showToast('Đã lưu cài đặt', 'success');
  });

  ipcRenderer.on('app-version', (_, v) => {
    ui.$('app-version-text').textContent = `v${v}`;
  });

  ['setting-auto-launch', 'setting-auto-heal', 'setting-start-minimized', 'setting-auto-router', 'setting-auto-openclaw', 'setting-minimize-tray'].forEach(id => {
    const el = ui.$(id);
    if (el) el.addEventListener('change', () => { if (isDirty()) markDirty(); else markClean(); });
  });

  ui.$('save-settings-btn').addEventListener('click', () => {
    const current = getCurrentState();
    ipcRenderer.send('set-auto-heal', current.autoHeal);
    ipcRenderer.send('save-settings', current);
  });
}

module.exports = { init, load };
