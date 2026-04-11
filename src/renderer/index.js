const { ipcRenderer } = require('electron');

const ui = require('./ui');
const dashboard = require('./views/dashboard');
const logsView = require('./views/logs');
const settingsView = require('./views/settings');
const shutdownView = require('./views/tools/shutdown');
const networkView = require('./views/tools/network');
const hardwareView = require('./views/tools/hardware');
const idmResetView = require('./views/tools/idm-reset');
const anydeskView = require('./views/tools/anydesk-reset');
const promptsView = require('./views/tools/prompts');
const linksView = require('./views/tools/links');
const logPanel = require('./components/logPanel');
const commandPalette = require('./components/commandPalette');
const { initThemeToggle } = require('./bootstrap/theme');
const { createNavigator } = require('./bootstrap/navigation');

const views = {
  dashboard: ui.$('view-dashboard'),
  logs: ui.$('view-logs'),
  settings: ui.$('view-settings'),
  shutdown: ui.$('view-shutdown'),
  network: ui.$('view-network'),
  hardware: ui.$('view-hardware'),
  idmReset: ui.$('view-idm-reset'),
  prompts: ui.$('view-prompts'),
  links: ui.$('view-links'),
};

const viewLoaders = {
  settings: () => settingsView.load(),
  network: () => networkView.load(),
  hardware: () => hardwareView.load(),
  prompts: () => promptsView.load(),
  links: () => linksView.load(),
};

const modules = [
  dashboard,
  logsView,
  settingsView,
  shutdownView,
  networkView,
  hardwareView,
  idmResetView,
  anydeskView,
  promptsView,
  linksView,
];

const navMap = {
  'nav-dashboard': 'dashboard',
  'nav-logs': 'logs',
  'nav-settings': 'settings',
  'nav-shutdown': 'shutdown',
  'nav-network': 'network',
  'nav-hardware': 'hardware',
  'nav-idm-reset': 'idmReset',
  'nav-prompts': 'prompts',
  'nav-links': 'links',
};

function markAppReady() {
  const body = document.body;
  if (!body || body.classList.contains('app-ready')) return;

  body.classList.add('app-ready');
  body.classList.remove('app-loading');
}

function initQuickLinks() {
  const quickLinks = {
    'open-router-web': 'http://localhost:20128',
    'open-openclaw-web': 'http://127.0.0.1:18789',
  };

  Object.entries(quickLinks).forEach(([id, url]) => {
    const button = ui.$(id);
    if (!button) return;
    button.addEventListener('click', () => ipcRenderer.send('open-browser', url));
  });
}

function initModules() {
  modules.forEach((moduleRef) => {
    if (moduleRef && typeof moduleRef.init === 'function') {
      moduleRef.init();
    }
  });
}

function initShell() {
  initThemeToggle({
    root: document.documentElement,
    storage: localStorage,
    toggleButton: ui.$('theme-toggle'),
  });

  const { bindNavigation, switchView } = createNavigator({
    ui,
    views,
    onViewEnter(name) {
      const loadView = viewLoaders[name];
      if (loadView) loadView();
    },
  });

  bindNavigation(navMap);
  initQuickLinks();
  initModules();

  logPanel.initLogPanels(['router', 'openclaw']);
  logPanel.initLogFilters();
  ui.initRipple();
  ui.initSkeletons(['router', 'openclaw']);
  commandPalette.init({ ipcRenderer, switchView, loadSettings: settingsView.load });

  ipcRenderer.send('check-status');
  ipcRenderer.send('get-app-version');

  requestAnimationFrame(() => {
    setTimeout(markAppReady, 2000);
  });
}

initShell();
