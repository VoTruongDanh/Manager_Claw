const { ipcRenderer } = require('electron');
const ui = require('../ui');

function load() {
  ipcRenderer.send('get-settings');
}

function init() {
  ipcRenderer.on('settings-data', (_, s) => {
    ui.$('setting-auto-launch').checked     = !!s.autoLaunch;
    ui.$('setting-start-minimized').checked = !!s.startMinimized;
    ui.$('setting-auto-router').checked     = !!s.autoStartRouter;
    ui.$('setting-auto-openclaw').checked   = !!s.autoStartOpenclaw;
    ui.$('setting-minimize-tray').checked   = s.minimizeToTray !== false;
    ui.$('settings-path-text').textContent  = s._path || '...';
  });

  ipcRenderer.on('settings-saved', () => ui.showToast('Đã lưu cài đặt', 'success'));

  ipcRenderer.on('app-version', (_, v) => {
    ui.$('app-version-text').textContent = `v${v}`;
  });

  ui.$('save-settings-btn').addEventListener('click', () => {
    ipcRenderer.send('save-settings', {
      autoLaunch:        ui.$('setting-auto-launch').checked,
      startMinimized:    ui.$('setting-start-minimized').checked,
      autoStartRouter:   ui.$('setting-auto-router').checked,
      autoStartOpenclaw: ui.$('setting-auto-openclaw').checked,
      minimizeToTray:    ui.$('setting-minimize-tray').checked
    });
  });
}

module.exports = { init, load };
