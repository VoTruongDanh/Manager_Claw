const { ipcRenderer } = require('electron');
const state = require('../state');
const ui    = require('../ui');

const SERVICE_LABELS = { router: '9Router', openclaw: 'OpenClaw' };

// ─── Bind một service card ────────────────────────────────────────────────────
function bindService(name) {
  const label = SERVICE_LABELS[name];

  ui.$(`start-${name}`).addEventListener('click', () => {
    ui.$(`start-${name}`).classList.add('loading');
    ui.setStatus(ui.$(`${name}-status`), 'starting', 'Đang khởi động...');
    ui.showProgress(name);
    ipcRenderer.send(`start-${name}`);
    setTimeout(() => ui.$(`start-${name}`).classList.remove('loading'), 4000);
  });

  ui.$(`stop-${name}`).addEventListener('click', () => {
    ui.$(`stop-${name}`).classList.add('loading');
    ipcRenderer.send(`stop-${name}`);
    setTimeout(() => ui.$(`stop-${name}`).classList.remove('loading'), 3000);
  });

  ui.$(`restart-${name}`).addEventListener('click', () => {
    const btn = ui.$(`restart-${name}`);
    btn.classList.add('loading');
    ui.addLog(ui.$(`${name}-log`), `Đang restart ${label}...`, 'info');
    ipcRenderer.send(`restart-${name}`);
    setTimeout(() => btn.classList.remove('loading'), 5000);
  });

  ui.$(`update-${name}`).addEventListener('click', () => {
    const btn = ui.$(`update-${name}`);
    btn.classList.add('loading');
    btn.disabled = true;
    ui.addLog(ui.$(`${name}-log`), `Đang cập nhật ${label}...`, 'info');
    ipcRenderer.send(`update-${name}`);
  });

  ui.$(`clear-${name}-log`).addEventListener('click', () => ui.clearLog(ui.$(`${name}-log`)));
}

// ─── Folder / Web UI buttons ──────────────────────────────────────────────────
function bindExternal() {
  ui.$('open-router-folder').addEventListener('click', () =>
    ipcRenderer.send('open-folder', process.env.APPDATA + '\\npm\\node_modules\\9router'));
  ui.$('open-openclaw-folder').addEventListener('click', () =>
    ipcRenderer.send('open-folder', process.env.APPDATA + '\\npm\\node_modules\\openclaw'));
  ui.$('open-router-dashboard').addEventListener('click', () =>
    ipcRenderer.send('open-browser', 'http://localhost:20128'));
  ui.$('open-openclaw-api').addEventListener('click', () =>
    ipcRenderer.send('open-browser', 'http://127.0.0.1:18789'));

  ui.$('start-all').addEventListener('click', () => {
    ['router', 'openclaw'].forEach(n => {
      ui.setStatus(ui.$(`${n}-status`), 'starting', 'Đang khởi động...');
      ipcRenderer.send(`start-${n}`);
    });
  });

  ui.$('stop-all').addEventListener('click', () => {
    ipcRenderer.send('stop-router');
    ipcRenderer.send('stop-openclaw');
  });
}

// ─── Copy metrics ─────────────────────────────────────────────────────────────
function bindCopyMetrics() {
  ['router', 'openclaw'].forEach(name => {
    ui.$(`${name}-pid-metric`).addEventListener('click', () => {
      const val = ui.$(`${name}-pid`).textContent;
      if (val !== '--') { navigator.clipboard.writeText(val); ui.showToast(`Đã copy PID: ${val}`, 'info'); }
    });
    ui.$(`${name}-uptime-metric`).addEventListener('click', () => {
      const val = ui.$(`${name}-uptime`).textContent;
      if (val !== '--') { navigator.clipboard.writeText(val); ui.showToast(`Đã copy uptime: ${val}`, 'info'); }
    });
  });
}

// ─── IPC: service status ──────────────────────────────────────────────────────
function handleServiceStatus(name, data) {
  const label = SERVICE_LABELS[name];
  ui.$(`start-${name}`).classList.remove('loading');
  ui.$(`stop-${name}`).classList.remove('loading');

  state[name].running   = data.running;
  state[name].pid       = data.running ? data.pid       : null;
  state[name].startTime = data.running ? (data.startTime || Date.now()) : null;
  state[name].external  = data.running ? !!data.external : false;

  const statusType = data.error ? 'error' : (data.running ? 'running' : 'stopped');
  const statusText = data.running ? 'Đang chạy' : (data.error ? 'Lỗi' : 'Đã dừng');
  ui.setStatus(ui.$(`${name}-status`), statusType, statusText);
  ui.hideProgress(name);
  ui.updateMetrics(name, state[name]);
  ui.toggleButtons(name, data.running);

  const logType = data.error ? 'error' : (data.running ? 'success' : 'info');
  ui.addLog(ui.$(`${name}-log`), data.message, logType);
  ui.addCombinedLog(label, data.message, logType);

  // Xóa toast "đang khởi động" cũ trước khi hiện toast mới
  if (data.running && !data.error) {
    ui.dismissToasts('info');
    ui.showToast(`${label} đang chạy`, 'success');
  }
  else if (data.error) {
    ui.dismissToasts('info');
    ui.showToast(data.message, 'error');
    ui.showAlert(name, data.message);
  }
  else ui.dismissAlert(name);
}

// ─── IPC: periodic status-update ─────────────────────────────────────────────
function handleStatusUpdate(data) {
  ['router', 'openclaw'].forEach(name => {
    const d = data[name];
    const statusEl = ui.$(`${name}-status`);
    if (statusEl && statusEl.classList.contains('badge-warning') && !d.running) return;

    state[name].running   = d.running;
    state[name].pid       = d.pid;
    state[name].startTime = d.startTime;
    state[name].external  = d.external;

    ui.setStatus(statusEl, d.running ? 'running' : 'stopped', d.running ? 'Đang chạy' : 'Đã dừng');
    ui.updateMetrics(name, state[name]);
    ui.toggleButtons(name, d.running);
  });
}

// ─── Uptime ticker ────────────────────────────────────────────────────────────
function startUptimeTicker() {
  setInterval(() => {
    ['router', 'openclaw'].forEach(name => {
      if (state[name].running && state[name].startTime) {
        ui.$(`${name}-uptime`).textContent = ui.formatUptime(Date.now() - state[name].startTime);
      }
    });
  }, 1000);
}

function init() {
  bindService('router');
  bindService('openclaw');
  bindExternal();
  bindCopyMetrics();
  startUptimeTicker();

  ipcRenderer.on('router-status',   (_, d) => handleServiceStatus('router',   d));
  ipcRenderer.on('openclaw-status', (_, d) => handleServiceStatus('openclaw', d));

  ipcRenderer.on('router-log',   (_, d) => { ui.addLog(ui.$('router-log'),   d, ui.detectLogType(d)); ui.addCombinedLog('9Router',  d, ui.detectLogType(d)); });
  ipcRenderer.on('openclaw-log', (_, d) => { ui.addLog(ui.$('openclaw-log'), d, ui.detectLogType(d)); ui.addCombinedLog('OpenClaw', d, ui.detectLogType(d)); });

  ipcRenderer.on('status-update', (_, data) => handleStatusUpdate(data));

  ipcRenderer.on('update-progress', (_, d) => {
    const el = d.label === '9Router' ? ui.$('router-log') : ui.$('openclaw-log');
    ui.addLog(el, d.message.trim(), 'info');
  });

  ipcRenderer.on('update-result', (_, d) => {
    const el  = d.label === '9Router' ? ui.$('router-log') : ui.$('openclaw-log');
    const btn = d.label === '9Router' ? ui.$('update-router') : ui.$('update-openclaw');
    btn.classList.remove('loading');
    btn.disabled = false;
    if (d.success) {
      ui.addLog(el, `✅ ${d.label} đã cập nhật thành công`, 'success');
      ui.showToast(`${d.label} đã cập nhật thành công`, 'success');
    } else {
      ui.addLog(el, `❌ Cập nhật ${d.label} thất bại (code: ${d.code})`, 'error');
      ui.showToast(`Cập nhật ${d.label} thất bại`, 'error');
    }
  });

  // Tray actions
  ipcRenderer.on('tray-start-router',   () => ui.$('start-router').click());
  ipcRenderer.on('tray-stop-router',    () => ui.$('stop-router').click());
  ipcRenderer.on('tray-start-openclaw', () => ui.$('start-openclaw').click());
  ipcRenderer.on('tray-stop-openclaw',  () => ui.$('stop-openclaw').click());
  ipcRenderer.on('tray-start-all',      () => ui.$('start-all').click());
  ipcRenderer.on('tray-stop-all',       () => ui.$('stop-all').click());

  // Auto-start
  ipcRenderer.on('auto-start', (_, service) => {
    const btn = ui.$(`start-${service}`);
    if (btn && !btn.disabled) {
      ui.addCombinedLog('System', `Tự động khởi động ${SERVICE_LABELS[service]}...`, 'info');
      btn.click();
    }
  });
}

module.exports = { init };
