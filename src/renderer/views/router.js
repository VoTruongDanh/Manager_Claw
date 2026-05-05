const { ipcRenderer } = require('electron');
const state = require('../state');
const ui = require('../ui');

const SERVICE_LABEL = '9Router';

// ─── Bind service card ────────────────────────────────────────────────────────
function bindService() {
  ui.$('start-router').addEventListener('click', () => {
    ui.$('start-router').classList.add('loading');
    ui.setStatus(ui.$('router-status'), 'starting', 'Đang khởi động...');
    ui.showProgress('router');
    ipcRenderer.send('start-router');
    setTimeout(() => ui.$('start-router').classList.remove('loading'), 4000);
  });

  ui.$('stop-router').addEventListener('click', () => {
    ui.$('stop-router').classList.add('loading');
    ipcRenderer.send('stop-router');
    setTimeout(() => ui.$('stop-router').classList.remove('loading'), 3000);
  });

  ui.$('restart-router').addEventListener('click', () => {
    const btn = ui.$('restart-router');
    btn.classList.add('loading');
    ui.addLog(ui.$('router-log'), `Đang restart ${SERVICE_LABEL}...`, 'info');
    ipcRenderer.send('restart-router');
    setTimeout(() => btn.classList.remove('loading'), 5000);
  });

  ui.$('update-router').addEventListener('click', () => {
    const btn = ui.$('update-router');
    btn.classList.add('loading');
    btn.disabled = true;
    ui.addLog(ui.$('router-log'), `Đang cập nhật ${SERVICE_LABEL}...`, 'info');
    ipcRenderer.send('update-router');
  });

  ui.$('clear-router-log').addEventListener('click', () => ui.clearLog(ui.$('router-log')));
}

// ─── Folder / Web UI buttons ──────────────────────────────────────────────────
function bindExternal() {
  const openRouterFolder = ui.$('open-router-folder');
  if (openRouterFolder) openRouterFolder.addEventListener('click', () =>
    ipcRenderer.send('open-folder', process.env.APPDATA + '\\npm\\node_modules\\9router'));

  const openRouterDashboard = ui.$('open-router-dashboard');
  if (openRouterDashboard) openRouterDashboard.addEventListener('click', () =>
    ipcRenderer.send('open-browser', 'http://localhost:20128'));
}

// ─── Copy metrics ─────────────────────────────────────────────────────────────
function bindCopyMetrics() {
  ui.$('router-pid-metric').addEventListener('click', () => {
    const val = ui.$('router-pid').textContent;
    if (val !== '--') { navigator.clipboard.writeText(val); ui.showToast(`Đã copy PID: ${val}`, 'info'); }
  });
  ui.$('router-uptime-metric').addEventListener('click', () => {
    const val = ui.$('router-uptime').textContent;
    if (val !== '--') { navigator.clipboard.writeText(val); ui.showToast(`Đã copy uptime: ${val}`, 'info'); }
  });
}

// ─── IPC: service status ──────────────────────────────────────────────────────
function handleServiceStatus(data) {
  ui.$('start-router').classList.remove('loading');
  ui.$('stop-router').classList.remove('loading');

  state.router.running = data.running;
  state.router.pid = data.running ? data.pid : null;
  state.router.startTime = data.running ? (data.startTime || Date.now()) : null;
  state.router.external = data.running ? !!data.external : false;

  const statusType = data.error ? 'error' : (data.running ? 'running' : 'stopped');
  const statusText = data.running ? 'Đang chạy' : (data.error ? 'Lỗi' : 'Đã dừng');
  ui.setStatus(ui.$('router-status'), statusType, statusText);
  ui.hideProgress('router');
  ui.updateMetrics('router', state.router);
  ui.toggleButtons('router', data.running);

  const logType = data.error ? 'error' : (data.running ? 'success' : 'info');
  ui.addLog(ui.$('router-log'), data.message, logType);
  ui.addCombinedLog(SERVICE_LABEL, data.message, logType);

  if (data.running && !data.error) {
    ui.dismissToasts('info');
    ui.showToast(`${SERVICE_LABEL} đang chạy`, 'success');
  }
  else if (data.error) {
    ui.dismissToasts('info');
    ui.showToast(data.message, 'error');
    ui.showAlert('router', data.message);
  }
  else ui.dismissAlert('router');
}

// ─── IPC: periodic status-update ─────────────────────────────────────────────
function handleStatusUpdate(data) {
  const d = data.router;
  const statusEl = ui.$('router-status');
  if (statusEl && statusEl.classList.contains('badge-warning') && !d.running) return;

  state.router.running = d.running;
  state.router.pid = d.pid;
  state.router.startTime = d.startTime;
  state.router.external = d.external;

  ui.setStatus(statusEl, d.running ? 'running' : 'stopped', d.running ? 'Đang chạy' : 'Đã dừng');
  ui.updateMetrics('router', state.router);
  ui.toggleButtons('router', d.running);
}

// ─── Uptime ticker ────────────────────────────────────────────────────────────
function startUptimeTicker() {
  setInterval(() => {
    if (state.router.running && state.router.startTime) {
      ui.$('router-uptime').textContent = ui.formatUptime(Date.now() - state.router.startTime);
    }
  }, 1000);
}

function init() {
  bindService();
  bindExternal();
  bindCopyMetrics();
  startUptimeTicker();

  ipcRenderer.on('router-status', (_, d) => handleServiceStatus(d));
  ipcRenderer.on('router-log', (_, d) => { ui.addLog(ui.$('router-log'), d, ui.detectLogType(d)); ui.addCombinedLog('9Router', d, ui.detectLogType(d)); });
  ipcRenderer.on('status-update', (_, data) => handleStatusUpdate(data));

  ipcRenderer.on('update-progress', (_, d) => {
    const el = d.label === '9Router' ? ui.$('router-log') : null;
    if (el) ui.addLog(el, d.message.trim(), 'info');
  });

  ipcRenderer.on('update-result', (_, d) => {
    const el = d.label === '9Router' ? ui.$('router-log') : null;
    const btn = d.label === '9Router' ? ui.$('update-router') : null;
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    if (el) {
      if (d.success) {
        ui.addLog(el, `✅ ${d.label} đã cập nhật thành công`, 'success');
        ui.showToast(`${d.label} đã cập nhật thành công`, 'success');
      } else {
        ui.addLog(el, `❌ Cập nhật ${d.label} thất bại (code: ${d.code})`, 'error');
        ui.showToast(`Cập nhật ${d.label} thất bại`, 'error');
      }
    }
  });

  // Tray actions
  ipcRenderer.on('tray-start-router', () => ui.$('start-router').click());
  ipcRenderer.on('tray-stop-router', () => ui.$('stop-router').click());

  // Auto-start
  ipcRenderer.on('auto-start', (_, service) => {
    if (service === 'router') {
      const btn = ui.$('start-router');
      if (btn && !btn.disabled) {
        ui.addCombinedLog('System', `Tự động khởi động ${SERVICE_LABEL}...`, 'info');
        btn.click();
      }
    }
  });
}

module.exports = { init };
