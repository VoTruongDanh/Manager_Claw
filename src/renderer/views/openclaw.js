const { ipcRenderer } = require('electron');
const state = require('../state');
const ui = require('../ui');

const SERVICE_LABEL = 'OpenClaw';

// ─── Bind service card ────────────────────────────────────────────────────────
function bindService() {
  ui.$('start-openclaw').addEventListener('click', () => {
    ui.$('start-openclaw').classList.add('loading');
    ui.setStatus(ui.$('openclaw-status'), 'starting', 'Đang khởi động...');
    ui.showProgress('openclaw');
    ipcRenderer.send('start-openclaw');
    setTimeout(() => ui.$('start-openclaw').classList.remove('loading'), 4000);
  });

  ui.$('stop-openclaw').addEventListener('click', () => {
    ui.$('stop-openclaw').classList.add('loading');
    ipcRenderer.send('stop-openclaw');
    setTimeout(() => ui.$('stop-openclaw').classList.remove('loading'), 3000);
  });

  ui.$('restart-openclaw').addEventListener('click', () => {
    const btn = ui.$('restart-openclaw');
    btn.classList.add('loading');
    ui.addLog(ui.$('openclaw-log'), `Đang restart ${SERVICE_LABEL}...`, 'info');
    ipcRenderer.send('restart-openclaw');
    setTimeout(() => btn.classList.remove('loading'), 5000);
  });

  ui.$('update-openclaw').addEventListener('click', () => {
    const btn = ui.$('update-openclaw');
    btn.classList.add('loading');
    btn.disabled = true;
    ui.addLog(ui.$('openclaw-log'), `Đang cập nhật ${SERVICE_LABEL}...`, 'info');
    ipcRenderer.send('update-openclaw');
  });

  ui.$('clear-openclaw-log').addEventListener('click', () => ui.clearLog(ui.$('openclaw-log')));
}

// ─── Folder / Web UI buttons ──────────────────────────────────────────────────
function bindExternal() {
  const openOpenclawFolder = ui.$('open-openclaw-folder');
  if (openOpenclawFolder) openOpenclawFolder.addEventListener('click', () =>
    ipcRenderer.send('open-folder', process.env.APPDATA + '\\npm\\node_modules\\openclaw'));

  const openOpenclawApi = ui.$('open-openclaw-api');
  if (openOpenclawApi) openOpenclawApi.addEventListener('click', () =>
    ipcRenderer.send('open-browser', 'http://127.0.0.1:18789'));
}

// ─── Copy metrics ─────────────────────────────────────────────────────────────
function bindCopyMetrics() {
  ui.$('openclaw-pid-metric').addEventListener('click', () => {
    const val = ui.$('openclaw-pid').textContent;
    if (val !== '--') { navigator.clipboard.writeText(val); ui.showToast(`Đã copy PID: ${val}`, 'info'); }
  });
  ui.$('openclaw-uptime-metric').addEventListener('click', () => {
    const val = ui.$('openclaw-uptime').textContent;
    if (val !== '--') { navigator.clipboard.writeText(val); ui.showToast(`Đã copy uptime: ${val}`, 'info'); }
  });
}

// ─── IPC: service status ──────────────────────────────────────────────────────
function handleServiceStatus(data) {
  ui.$('start-openclaw').classList.remove('loading');
  ui.$('stop-openclaw').classList.remove('loading');

  state.openclaw.running = data.running;
  state.openclaw.pid = data.running ? data.pid : null;
  state.openclaw.startTime = data.running ? (data.startTime || Date.now()) : null;
  state.openclaw.external = data.running ? !!data.external : false;

  const statusType = data.error ? 'error' : (data.running ? 'running' : 'stopped');
  const statusText = data.running ? 'Đang chạy' : (data.error ? 'Lỗi' : 'Đã dừng');
  ui.setStatus(ui.$('openclaw-status'), statusType, statusText);
  ui.hideProgress('openclaw');
  ui.updateMetrics('openclaw', state.openclaw);
  ui.toggleButtons('openclaw', data.running);

  const logType = data.error ? 'error' : (data.running ? 'success' : 'info');
  ui.addLog(ui.$('openclaw-log'), data.message, logType);
  ui.addCombinedLog(SERVICE_LABEL, data.message, logType);

  if (data.running && !data.error) {
    ui.dismissToasts('info');
    ui.showToast(`${SERVICE_LABEL} đang chạy`, 'success');
  }
  else if (data.error) {
    ui.dismissToasts('info');
    ui.showToast(data.message, 'error');
    ui.showAlert('openclaw', data.message);
  }
  else ui.dismissAlert('openclaw');
}

// ─── IPC: periodic status-update ─────────────────────────────────────────────
function handleStatusUpdate(data) {
  const d = data.openclaw;
  const statusEl = ui.$('openclaw-status');
  if (statusEl && statusEl.classList.contains('badge-warning') && !d.running) return;

  state.openclaw.running = d.running;
  state.openclaw.pid = d.pid;
  state.openclaw.startTime = d.startTime;
  state.openclaw.external = d.external;

  ui.setStatus(statusEl, d.running ? 'running' : 'stopped', d.running ? 'Đang chạy' : 'Đã dừng');
  ui.updateMetrics('openclaw', state.openclaw);
  ui.toggleButtons('openclaw', d.running);
}

// ─── Uptime ticker ────────────────────────────────────────────────────────────
function startUptimeTicker() {
  setInterval(() => {
    if (state.openclaw.running && state.openclaw.startTime) {
      ui.$('openclaw-uptime').textContent = ui.formatUptime(Date.now() - state.openclaw.startTime);
    }
  }, 1000);
}

function init() {
  bindService();
  bindExternal();
  bindCopyMetrics();
  startUptimeTicker();

  ipcRenderer.on('openclaw-status', (_, d) => handleServiceStatus(d));
  ipcRenderer.on('openclaw-log', (_, d) => { ui.addLog(ui.$('openclaw-log'), d, ui.detectLogType(d)); ui.addCombinedLog('OpenClaw', d, ui.detectLogType(d)); });
  ipcRenderer.on('status-update', (_, data) => handleStatusUpdate(data));

  ipcRenderer.on('update-progress', (_, d) => {
    const el = d.label === 'OpenClaw' ? ui.$('openclaw-log') : null;
    if (el) ui.addLog(el, d.message.trim(), 'info');
  });

  ipcRenderer.on('update-result', (_, d) => {
    const el = d.label === 'OpenClaw' ? ui.$('openclaw-log') : null;
    const btn = d.label === 'OpenClaw' ? ui.$('update-openclaw') : null;
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
  ipcRenderer.on('tray-start-openclaw', () => ui.$('start-openclaw').click());
  ipcRenderer.on('tray-stop-openclaw', () => ui.$('stop-openclaw').click());

  // Auto-start
  ipcRenderer.on('auto-start', (_, service) => {
    if (service === 'openclaw') {
      const btn = ui.$('start-openclaw');
      if (btn && !btn.disabled) {
        ui.addCombinedLog('System', `Tự động khởi động ${SERVICE_LABEL}...`, 'info');
        btn.click();
      }
    }
  });
}

module.exports = { init };
