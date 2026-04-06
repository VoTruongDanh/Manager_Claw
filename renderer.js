const { ipcRenderer } = require('electron');

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  router:   { running: false, startTime: null, pid: null, external: false },
  openclaw: { running: false, startTime: null, pid: null, external: false }
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ─── Theme ────────────────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

$('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ─── Navigation ───────────────────────────────────────────────────────────────
$('nav-dashboard').addEventListener('click', (e) => {
  e.preventDefault();
  $('view-dashboard').style.display = '';
  $('view-logs').style.display = 'none';
  $('nav-dashboard').classList.add('active');
  $('nav-logs').classList.remove('active');
});

$('nav-logs').addEventListener('click', (e) => {
  e.preventDefault();
  $('view-dashboard').style.display = 'none';
  $('view-logs').style.display = '';
  $('nav-logs').classList.add('active');
  $('nav-dashboard').classList.remove('active');
});

// ─── Sidebar quick links ──────────────────────────────────────────────────────
$('open-router-web').addEventListener('click', () => ipcRenderer.send('open-browser', 'http://localhost:20128'));
$('open-openclaw-web').addEventListener('click', () => ipcRenderer.send('open-browser', 'http://127.0.0.1:18789'));

// ─── Service buttons ──────────────────────────────────────────────────────────
function bindService(name) {
  $(`start-${name}`).addEventListener('click', () => {
    $(`start-${name}`).classList.add('loading');
    setStatus($(`${name}-status`), 'starting', 'Đang khởi động...');
    ipcRenderer.send(`start-${name}`);
    setTimeout(() => $(`start-${name}`).classList.remove('loading'), 4000);
  });

  $(`stop-${name}`).addEventListener('click', () => {
    $(`stop-${name}`).classList.add('loading');
    ipcRenderer.send(`stop-${name}`);
    setTimeout(() => $(`stop-${name}`).classList.remove('loading'), 3000);
  });

  $(`update-${name}`).addEventListener('click', () => {
    const btn = $(`update-${name}`);
    btn.classList.add('loading');
    btn.disabled = true;
    addLog($(`${name}-log`), `Đang cập nhật ${name === 'router' ? '9Router' : 'OpenClaw'}...`, 'info');
    ipcRenderer.send(`update-${name}`);
  });

  $(`clear-${name}-log`).addEventListener('click', () => clearLog($(`${name}-log`)));
}

bindService('router');
bindService('openclaw');

$('open-router-folder').addEventListener('click', () =>
  ipcRenderer.send('open-folder', process.env.APPDATA + '\\npm\\node_modules\\9router'));
$('open-openclaw-folder').addEventListener('click', () =>
  ipcRenderer.send('open-folder', process.env.APPDATA + '\\npm\\node_modules\\openclaw'));
$('open-router-dashboard').addEventListener('click', () =>
  ipcRenderer.send('open-browser', 'http://localhost:20128'));
$('open-openclaw-api').addEventListener('click', () =>
  ipcRenderer.send('open-browser', 'http://127.0.0.1:18789'));

$('start-all').addEventListener('click', () => {
  ['router', 'openclaw'].forEach(n => {
    setStatus($(`${n}-status`), 'starting', 'Đang khởi động...');
    ipcRenderer.send(`start-${n}`);
  });
});

$('stop-all').addEventListener('click', () => {
  ipcRenderer.send('stop-router');
  ipcRenderer.send('stop-openclaw');
});

$('clear-all-logs').addEventListener('click', () => {
  clearLog($('combined-log'));
  clearLog($('router-log'));
  clearLog($('openclaw-log'));
});

// ─── IPC: individual status ───────────────────────────────────────────────────
function handleServiceStatus(name, data) {
  $(`start-${name}`).classList.remove('loading');
  $(`stop-${name}`).classList.remove('loading');

  state[name].running   = data.running;
  state[name].pid       = data.running ? data.pid       : null;
  state[name].startTime = data.running ? (data.startTime || Date.now()) : null;
  state[name].external  = data.running ? !!data.external : false;

  const statusType = data.error ? 'error' : (data.running ? 'running' : 'stopped');
  const statusText = data.running ? 'Đang chạy' : (data.error ? 'Lỗi' : 'Đã dừng');
  setStatus($(`${name}-status`), statusType, statusText);
  updateMetrics(name);
  toggleButtons(name, data.running);

  const logType = data.error ? 'error' : (data.running ? 'success' : 'info');
  addLog($(`${name}-log`), data.message, logType);
  addCombinedLog(name === 'router' ? '9Router' : 'OpenClaw', data.message, logType);

  if (data.running && !data.error) showToast(`${name === 'router' ? '9Router' : 'OpenClaw'} đang chạy`, 'success');
  else if (data.error) showToast(data.message, 'error');
}

ipcRenderer.on('router-status',   (_, d) => handleServiceStatus('router',   d));
ipcRenderer.on('openclaw-status', (_, d) => handleServiceStatus('openclaw', d));

ipcRenderer.on('router-log',   (_, d) => { addLog($('router-log'),   d, detectLogType(d)); addCombinedLog('9Router',  d, detectLogType(d)); });
ipcRenderer.on('openclaw-log', (_, d) => { addLog($('openclaw-log'), d, detectLogType(d)); addCombinedLog('OpenClaw', d, detectLogType(d)); });

// ─── IPC: status-update (periodic) ───────────────────────────────────────────
ipcRenderer.on('status-update', (_, data) => {
  ['router', 'openclaw'].forEach(name => {
    const d = data[name];
    state[name].running   = d.running;
    state[name].pid       = d.pid;
    state[name].startTime = d.startTime;
    state[name].external  = d.external;

    setStatus($(`${name}-status`), d.running ? 'running' : 'stopped', d.running ? 'Đang chạy' : 'Đã dừng');
    updateMetrics(name);
    toggleButtons(name, d.running);
  });
});

// ─── IPC: update ─────────────────────────────────────────────────────────────
ipcRenderer.on('update-progress', (_, d) => {
  const el = d.app === '9Router' ? $('router-log') : $('openclaw-log');
  addLog(el, d.message.trim(), 'info');
});

ipcRenderer.on('update-result', (_, d) => {
  const el  = d.app === '9Router' ? $('router-log') : $('openclaw-log');
  const btn = d.app === '9Router' ? $('update-router') : $('update-openclaw');
  btn.classList.remove('loading');
  btn.disabled = false;
  if (d.success) {
    addLog(el, `✅ ${d.app} đã cập nhật thành công`, 'success');
    showToast(`${d.app} đã cập nhật thành công`, 'success');
  } else {
    addLog(el, `❌ Cập nhật ${d.app} thất bại (code: ${d.code})`, 'error');
    showToast(`Cập nhật ${d.app} thất bại`, 'error');
  }
});

// ─── Tray actions ─────────────────────────────────────────────────────────────
ipcRenderer.on('tray-start-router',   () => $('start-router').click());
ipcRenderer.on('tray-stop-router',    () => $('stop-router').click());
ipcRenderer.on('tray-start-openclaw', () => $('start-openclaw').click());
ipcRenderer.on('tray-stop-openclaw',  () => $('stop-openclaw').click());
ipcRenderer.on('tray-start-all',      () => $('start-all').click());
ipcRenderer.on('tray-stop-all',       () => $('stop-all').click());

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(el, statusState, text) {
  const dot  = el.querySelector('.status-dot');
  const span = el.querySelector('.status-text');
  const card = el.closest('.service-card');
  dot.className  = `status-dot ${statusState}`;
  span.textContent = text;
  if (card) {
    card.classList.remove('running', 'error');
    if (statusState === 'running') card.classList.add('running');
    if (statusState === 'error')   card.classList.add('error');
  }
}

function updateMetrics(name) {
  const s = state[name];
  const pidEl    = $(`${name}-pid`);
  const uptimeEl = $(`${name}-uptime`);
  const srcEl    = $(`${name}-source`);

  pidEl.textContent    = s.pid       ? s.pid                                    : '--';
  uptimeEl.textContent = s.startTime ? formatUptime(Date.now() - s.startTime)   : '--';
  srcEl.textContent    = s.running   ? (s.external ? 'Ngoài' : 'App')           : '--';
}

function toggleButtons(name, running) {
  const start  = $(`start-${name}`);
  const stop   = $(`stop-${name}`);
  const update = $(`update-${name}`);
  if (start)  start.disabled  = running;
  if (stop)   stop.disabled   = !running;
  if (update) update.disabled = running;
}

function addLog(el, msg, type = 'info') {
  const empty = el.querySelector('.log-empty');
  if (empty) empty.remove();

  const ts   = new Date().toLocaleTimeString('vi-VN');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-timestamp">[${ts}]</span><span class="log-${type}">${escapeHtml(msg)}</span>`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;

  const lines = el.querySelectorAll('.log-line');
  if (lines.length > 200) lines[0].remove();
}

function addCombinedLog(source, msg, type = 'info') {
  const el = $('combined-log');
  const empty = el.querySelector('.log-empty');
  if (empty) empty.remove();

  const ts   = new Date().toLocaleTimeString('vi-VN');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-timestamp">[${ts}]</span><span class="log-source">[${source}]</span><span class="log-${type}">${escapeHtml(msg)}</span>`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;

  const lines = el.querySelectorAll('.log-line');
  if (lines.length > 500) lines[0].remove();
}

function clearLog(el) {
  el.innerHTML = '<div class="log-empty">Chưa có log</div>';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function detectLogType(msg) {
  const m = msg.toLowerCase();
  if (m.includes('error') || m.includes('failed') || m.includes('❌')) return 'error';
  if (m.includes('warn'))  return 'warning';
  if (m.includes('success') || m.includes('✅') || m.includes('started') || m.includes('listening')) return 'success';
  return 'info';
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function showToast(msg, type = 'info') {
  // Remove existing toasts of same type
  document.querySelectorAll(`.toast.${type}`).forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Uptime ticker ────────────────────────────────────────────────────────────
setInterval(() => {
  ['router', 'openclaw'].forEach(name => {
    if (state[name].running && state[name].startTime) {
      $(`${name}-uptime`).textContent = formatUptime(Date.now() - state[name].startTime);
    }
  });
}, 1000);

// ─── Initial check ────────────────────────────────────────────────────────────
ipcRenderer.send('check-status');
