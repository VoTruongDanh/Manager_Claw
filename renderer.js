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
const views = {
  dashboard: $('view-dashboard'),
  logs:      $('view-logs'),
  settings:  $('view-settings')
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
  $(`nav-${name}`).classList.add('active');
}

$('nav-dashboard').addEventListener('click', (e) => { e.preventDefault(); switchView('dashboard'); });
$('nav-logs').addEventListener('click',      (e) => { e.preventDefault(); switchView('logs'); });
$('nav-settings').addEventListener('click',  (e) => { e.preventDefault(); switchView('settings'); loadSettings(); });

// ─── Sidebar quick links ──────────────────────────────────────────────────────
$('open-router-web').addEventListener('click', () => ipcRenderer.send('open-browser', 'http://localhost:20128'));
$('open-openclaw-web').addEventListener('click', () => ipcRenderer.send('open-browser', 'http://127.0.0.1:18789'));

// ─── Service buttons ──────────────────────────────────────────────────────────
function bindService(name) {
  $(`start-${name}`).addEventListener('click', () => {
    $(`start-${name}`).classList.add('loading');
    setStatus($(`${name}-status`), 'starting', 'Đang khởi động...');
    showProgress(name);
    ipcRenderer.send(`start-${name}`);
    setTimeout(() => $(`start-${name}`).classList.remove('loading'), 4000);
  });

  $(`stop-${name}`).addEventListener('click', () => {
    $(`stop-${name}`).classList.add('loading');
    ipcRenderer.send(`stop-${name}`);
    setTimeout(() => $(`stop-${name}`).classList.remove('loading'), 3000);
  });

  // Restart button
  $(`restart-${name}`).addEventListener('click', () => {
    const btn = $(`restart-${name}`);
    btn.classList.add('loading');
    addLog($(`${name}-log`), `Đang restart ${name === 'router' ? '9Router' : 'OpenClaw'}...`, 'info');
    ipcRenderer.send(`restart-${name}`);
    setTimeout(() => btn.classList.remove('loading'), 5000);
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
  hideProgress(name);
  updateMetrics(name);
  toggleButtons(name, data.running);

  const logType = data.error ? 'error' : (data.running ? 'success' : 'info');
  addLog($(`${name}-log`), data.message, logType);
  addCombinedLog(name === 'router' ? '9Router' : 'OpenClaw', data.message, logType);

  if (data.running && !data.error) showToast(`${name === 'router' ? '9Router' : 'OpenClaw'} đang chạy`, 'success');
  else if (data.error) { showToast(data.message, 'error'); showAlert(name, data.message); }
  else dismissAlert(name);
}

ipcRenderer.on('router-status',   (_, d) => handleServiceStatus('router',   d));
ipcRenderer.on('openclaw-status', (_, d) => handleServiceStatus('openclaw', d));

ipcRenderer.on('router-log',   (_, d) => { addLog($('router-log'),   d, detectLogType(d)); addCombinedLog('9Router',  d, detectLogType(d)); });
ipcRenderer.on('openclaw-log', (_, d) => { addLog($('openclaw-log'), d, detectLogType(d)); addCombinedLog('OpenClaw', d, detectLogType(d)); });

// ─── IPC: status-update (periodic) ───────────────────────────────────────────
ipcRenderer.on('status-update', (_, data) => {
  ['router', 'openclaw'].forEach(name => {
    const d = data[name];

    // Auto-start guard: nếu badge đang ở trạng thái 'starting' (service chưa
    // confirm running/stopped qua router-status/openclaw-status), bỏ qua
    // status-update periodic để tránh override UI về 'stopped' giữa chừng.
    const statusEl = $(`${name}-status`);
    const isStarting = statusEl && statusEl.classList.contains('badge-warning');
    if (isStarting && !d.running) return;

    state[name].running   = d.running;
    state[name].pid       = d.pid;
    state[name].startTime = d.startTime;
    state[name].external  = d.external;

    setStatus(statusEl, d.running ? 'running' : 'stopped', d.running ? 'Đang chạy' : 'Đã dừng');
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
function showAlert(name, message) {
  const card = $(`${name}-card`);
  // Remove existing alert
  const existing = card.querySelector('.alert');
  if (existing) existing.remove();

  const alert = document.createElement('div');
  alert.className = 'alert alert-destructive';
  alert.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
    <div class="alert-body">
      <p class="alert-title">Lỗi</p>
      <p class="alert-desc">${escapeHtml(message)}</p>
    </div>
    <button class="alert-close" aria-label="Đóng">×</button>`;

  // Insert after service-header
  const header = card.querySelector('.service-header');
  header.insertAdjacentElement('afterend', alert);

  alert.querySelector('.alert-close').addEventListener('click', () => dismissAlert(name));
}

function dismissAlert(name) {
  const card = $(`${name}-card`);
  const alert = card ? card.querySelector('.alert') : null;
  if (!alert) return;
  alert.classList.add('dismissing');
  setTimeout(() => alert.remove(), 200);
}

function showProgress(name) {
  const el = $(`${name}-progress`);
  if (el) { el.style.display = 'block'; }
}

function hideProgress(name) {
  const el = $(`${name}-progress`);
  if (el) { el.style.display = 'none'; }
}

function setStatus(el, statusState, text) {
  const dot  = el.querySelector('.status-dot');
  const span = el.querySelector('.status-text');
  const card = el.closest('.service-card');
  dot.className  = `status-dot ${statusState}`;
  span.textContent = text;
  // Update badge variant
  el.classList.remove('badge-success', 'badge-secondary', 'badge-warning', 'badge-destructive');
  const variantMap = { running: 'badge-success', stopped: 'badge-secondary', starting: 'badge-warning', error: 'badge-destructive' };
  el.classList.add(variantMap[statusState] || 'badge-secondary');
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

  function setMetric(el, newVal) {
    const prev = el.textContent;
    el.classList.remove('skeleton');
    el.style.width = '';
    el.style.height = '';
    el.textContent = newVal;
    if (prev === '--' && newVal !== '--') {
      el.classList.remove('metric-flash');
      void el.offsetWidth; // reflow
      el.classList.add('metric-flash');
    }
  }

  setMetric(pidEl,    s.pid       ? s.pid                                  : '--');
  setMetric(uptimeEl, s.startTime ? formatUptime(Date.now() - s.startTime) : '--');
  setMetric(srcEl,    s.running   ? (s.external ? 'Ngoài' : 'App')        : '--');
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

  // Increment unread if collapsed
  const name = el.id === 'router-log' ? 'router' : el.id === 'openclaw-log' ? 'openclaw' : null;
  if (name) incrementUnread(name);
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
  document.querySelectorAll(`.toast.${type}`).forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('dismissing');
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

// ─── Copy metrics on click ────────────────────────────────────────────────────
['router', 'openclaw'].forEach(name => {
  $(`${name}-pid-metric`).addEventListener('click', () => {
    const val = $(`${name}-pid`).textContent;
    if (val !== '--') {
      navigator.clipboard.writeText(val);
      showToast(`Đã copy PID: ${val}`, 'info');
    }
  });
  $(`${name}-uptime-metric`).addEventListener('click', () => {
    const val = $(`${name}-uptime`).textContent;
    if (val !== '--') {
      navigator.clipboard.writeText(val);
      showToast(`Đã copy uptime: ${val}`, 'info');
    }
  });
});

// ─── Log filters ──────────────────────────────────────────────────────────────
document.querySelectorAll('.log-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    const logId  = btn.dataset.log;
    const filter = btn.dataset.filter;
    const logEl  = $(logId);

    // Update active state within same group
    const group = btn.closest('.log-filters');
    group.querySelectorAll('.log-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Show/hide lines
    logEl.querySelectorAll('.log-line').forEach(line => {
      if (filter === 'all') {
        line.style.display = '';
      } else {
        const hasClass = line.querySelector(`.log-${filter}`);
        line.style.display = hasClass ? '' : 'none';
      }
    });
  });
});

// ─── Initial check ────────────────────────────────────────────────────────────
// ─── Ripple effect ───────────────────────────────────────────────────────────
document.addEventListener('mousedown', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  const rect   = btn.getBoundingClientRect();
  const size   = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size/2}px;top:${e.clientY - rect.top - size/2}px`;
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
});

// ─── Tooltips ────────────────────────────────────────────────────────────────
function initTooltips() {
  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 100) {
        el.classList.add('tooltip-bottom');
      } else {
        el.classList.remove('tooltip-bottom');
      }
    });
  });
}

initTooltips();

// ─── Collapsible Logs ────────────────────────────────────────────────────────
const logUnread = { router: 0, openclaw: 0 };

function initCollapsibleLogs() {
  ['router', 'openclaw'].forEach(name => {
    const logEl     = $(`${name}-log`);
    const header    = $(`${name}-log-header`);
    const chevron   = $(`${name}-log-chevron`);
    const unreadEl  = $(`${name}-log-unread`);
    const collapsed = localStorage.getItem(`log-collapsed-${name}`) === 'true';

    logEl.classList.add(collapsed ? 'collapsed' : 'expanded');
    if (collapsed) chevron.classList.add('collapsed');

    header.addEventListener('click', (e) => {
      // Don't toggle when clicking filter buttons or clear button
      if (e.target.closest('.log-filters') || e.target.closest('#clear-' + name + '-log')) return;
      const isCollapsed = logEl.classList.contains('collapsed');
      logEl.classList.toggle('collapsed', !isCollapsed);
      logEl.classList.toggle('expanded', isCollapsed);
      chevron.classList.toggle('collapsed', !isCollapsed);
      localStorage.setItem(`log-collapsed-${name}`, String(!isCollapsed));
      if (isCollapsed) {
        logUnread[name] = 0;
        unreadEl.style.display = 'none';
        unreadEl.textContent = '';
      }
    });
  });
}

function incrementUnread(name) {
  const logEl   = $(`${name}-log`);
  const unreadEl = $(`${name}-log-unread`);
  if (!logEl || !logEl.classList.contains('collapsed')) return;
  logUnread[name]++;
  unreadEl.textContent = logUnread[name];
  unreadEl.style.display = 'inline-block';
}

function initSkeletons() {
  ['router', 'openclaw'].forEach(name => {
    ['pid', 'uptime', 'source'].forEach(metric => {
      const el = $(`${name}-${metric}`);
      if (el && el.textContent === '--') {
        el.textContent = '';
        el.classList.add('skeleton');
        el.style.width  = metric === 'source' ? '36px' : '48px';
        el.style.height = '18px';
      }
    });
  });
}

initCollapsibleLogs();
initSkeletons();
ipcRenderer.send('check-status');
ipcRenderer.send('get-app-version');

// ─── Settings ─────────────────────────────────────────────────────────────────
function loadSettings() {
  ipcRenderer.send('get-settings');
}

ipcRenderer.on('settings-data', (_, s) => {
  $('setting-auto-launch').checked     = !!s.autoLaunch;
  $('setting-start-minimized').checked = !!s.startMinimized;
  $('setting-auto-router').checked     = !!s.autoStartRouter;
  $('setting-auto-openclaw').checked   = !!s.autoStartOpenclaw;
  $('setting-minimize-tray').checked   = s.minimizeToTray !== false;
  $('settings-path-text').textContent  = s._path || '...';
});

ipcRenderer.on('settings-saved', (_, s) => {
  showToast('Đã lưu cài đặt', 'success');
});

ipcRenderer.on('app-version', (_, v) => {
  $('app-version-text').textContent = `v${v}`;
});

$('save-settings-btn').addEventListener('click', () => {
  ipcRenderer.send('save-settings', {
    autoLaunch:        $('setting-auto-launch').checked,
    startMinimized:    $('setting-start-minimized').checked,
    autoStartRouter:   $('setting-auto-router').checked,
    autoStartOpenclaw: $('setting-auto-openclaw').checked,
    minimizeToTray:    $('setting-minimize-tray').checked
  });
});

// ─── Auto-start trigger từ main ───────────────────────────────────────────────
ipcRenderer.on('auto-start', (_, service) => {
  const btn = $(`start-${service}`);
  if (btn && !btn.disabled) {
    addCombinedLog('System', `Tự động khởi động ${service === 'router' ? '9Router' : 'OpenClaw'}...`, 'info');
    btn.click();
  }
});

// ─── Command Palette ──────────────────────────────────────────────────────────
function initCommandPalette() {
  const overlay   = $('command-overlay');
  const dialog    = overlay.querySelector('.command-dialog');
  const input     = $('command-input');
  const list      = $('command-list');
  let activeIdx   = -1;
  let filtered    = [];

  const iconPlay  = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3l8 5-8 5V3z"/></svg>`;
  const iconStop  = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8"/></svg>`;
  const iconRst   = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 00-.908-.417A4 4 0 118 4a.5.5 0 000-1z"/></svg>`;
  const iconWeb   = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/></svg>`;
  const iconView  = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>`;
  const iconTheme = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>`;

  const commands = [
    { label: 'Start 9Router',          icon: iconPlay,  action: () => { if (!$('start-router').disabled)  $('start-router').click(); } },
    { label: 'Stop 9Router',           icon: iconStop,  action: () => { if (!$('stop-router').disabled)   $('stop-router').click(); } },
    { label: 'Restart 9Router',        icon: iconRst,   action: () => $('restart-router').click() },
    { label: 'Start OpenClaw',         icon: iconPlay,  action: () => { if (!$('start-openclaw').disabled) $('start-openclaw').click(); } },
    { label: 'Stop OpenClaw',          icon: iconStop,  action: () => { if (!$('stop-openclaw').disabled)  $('stop-openclaw').click(); } },
    { label: 'Restart OpenClaw',       icon: iconRst,   action: () => $('restart-openclaw').click() },
    { label: 'Khởi động tất cả',       icon: iconPlay,  action: () => $('start-all').click() },
    { label: 'Dừng tất cả',            icon: iconStop,  action: () => $('stop-all').click() },
    { label: 'Mở 9Router Dashboard',   icon: iconWeb,   action: () => ipcRenderer.send('open-browser', 'http://localhost:20128') },
    { label: 'Mở OpenClaw API',        icon: iconWeb,   action: () => ipcRenderer.send('open-browser', 'http://127.0.0.1:18789') },
    { label: 'Chuyển sang Dashboard',  icon: iconView,  action: () => switchView('dashboard') },
    { label: 'Chuyển sang Logs',       icon: iconView,  action: () => switchView('logs') },
    { label: 'Chuyển sang Settings',   icon: iconView,  action: () => { switchView('settings'); loadSettings(); } },
    { label: 'Bật/Tắt Dark Mode',      icon: iconTheme, action: () => $('theme-toggle').click() },
    { label: 'Xóa tất cả logs',        icon: iconStop,  action: () => $('clear-all-logs').click() },
  ];

  function highlight(text, query) {
    if (!query) return escapeHtml(text);
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx)) + '<mark>' + escapeHtml(text.slice(idx, idx + query.length)) + '</mark>' + escapeHtml(text.slice(idx + query.length));
  }

  function render(query) {
    filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));
    activeIdx = filtered.length > 0 ? 0 : -1;
    list.innerHTML = filtered.length === 0
      ? '<li class="command-empty">Không tìm thấy lệnh</li>'
      : filtered.map((c, i) => `<li class="command-item${i === 0 ? ' active' : ''}" data-idx="${i}" role="option">
          <span class="command-item-icon">${c.icon}</span>
          <span>${highlight(c.label, query)}</span>
        </li>`).join('');

    list.querySelectorAll('.command-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        activeIdx = +item.dataset.idx;
        updateActive();
      });
      item.addEventListener('click', () => {
        filtered[+item.dataset.idx]?.action();
        closeCmd();
      });
    });
  }

  function updateActive() {
    list.querySelectorAll('.command-item').forEach((el, i) => {
      el.classList.toggle('active', i === activeIdx);
    });
    const activeEl = list.querySelector('.command-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function openCmd() {
    overlay.style.display = 'flex';
    dialog.classList.remove('closing');
    input.value = '';
    render('');
    input.focus();
  }

  function closeCmd() {
    dialog.classList.add('closing');
    setTimeout(() => { overlay.style.display = 'none'; }, 150);
  }

  input.addEventListener('input', () => render(input.value));

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCmd(); });

  document.addEventListener('keydown', (e) => {
    if (overlay.style.display !== 'none') {
      if (e.key === 'Escape') { e.preventDefault(); closeCmd(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, filtered.length - 1);
        updateActive(); return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        updateActive(); return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx >= 0) { filtered[activeIdx]?.action(); closeCmd(); }
        return;
      }
      // Focus trap: Tab stays in dialog
      if (e.key === 'Tab') { e.preventDefault(); return; }
    }
    // Open: Ctrl+K (not Ctrl+1/2)
    if (e.ctrlKey && e.key === 'k' && !e.shiftKey) {
      e.preventDefault();
      overlay.style.display !== 'none' ? closeCmd() : openCmd();
    }
  });
}

initCommandPalette();
