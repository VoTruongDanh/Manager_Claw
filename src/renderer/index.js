const { ipcRenderer } = require('electron');

const ui             = require('./ui');
const state          = require('./state');
const dashboard      = require('./views/dashboard');
const logsView       = require('./views/logs');
const settingsView   = require('./views/settings');
const shutdownView   = require('./views/tools/shutdown');
const idmResetView   = require('./views/tools/idm-reset');
const logPanel       = require('./components/logPanel');
const commandPalette = require('./components/commandPalette');

// ─── Theme ────────────────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

ui.$('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ─── Navigation ───────────────────────────────────────────────────────────────
const views = {
  dashboard: ui.$('view-dashboard'),
  logs:      ui.$('view-logs'),
  settings:  ui.$('view-settings'),
  shutdown:  ui.$('view-shutdown'),
  idmReset:  ui.$('view-idm-reset')
};

function switchView(name) {
  Object.entries(views).forEach(([k, el]) => {
    el.style.display = k === name ? '' : 'none';
    if (k === name) {
      el.classList.remove('view-enter');
      void el.offsetWidth;
      el.classList.add('view-enter');
    }
  });
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  ui.$(`nav-${name}`).classList.add('active');
}

ui.$('nav-dashboard').addEventListener('click', (e) => { e.preventDefault(); switchView('dashboard'); });
ui.$('nav-logs').addEventListener('click',      (e) => { e.preventDefault(); switchView('logs'); });
ui.$('nav-settings').addEventListener('click',  (e) => { e.preventDefault(); switchView('settings'); settingsView.load(); });
ui.$('nav-shutdown').addEventListener('click',  (e) => { e.preventDefault(); switchView('shutdown'); });
ui.$('nav-idm-reset').addEventListener('click', (e) => { e.preventDefault(); switchView('idmReset'); });

// ─── Sidebar quick links ──────────────────────────────────────────────────────
ui.$('open-router-web').addEventListener('click',   () => ipcRenderer.send('open-browser', 'http://localhost:20128'));
ui.$('open-openclaw-web').addEventListener('click', () => ipcRenderer.send('open-browser', 'http://127.0.0.1:18789'));

// ─── Init modules ─────────────────────────────────────────────────────────────
dashboard.init();
logsView.init();
settingsView.init();
shutdownView.init();
idmResetView.init();
logPanel.initLogPanels(['router', 'openclaw']);
logPanel.initLogFilters();
ui.initRipple();
ui.initSkeletons(['router', 'openclaw']);
commandPalette.init({ ipcRenderer, switchView, loadSettings: settingsView.load });

// ─── Bootstrap ────────────────────────────────────────────────────────────────
ipcRenderer.send('check-status');
ipcRenderer.send('get-app-version');
