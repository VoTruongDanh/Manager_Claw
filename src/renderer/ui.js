// ─── DOM helper ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ─── Escape HTML ──────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Detect log type ──────────────────────────────────────────────────────────
function detectLogType(msg) {
  const m = msg.toLowerCase();
  if (m.includes('error') || m.includes('failed') || m.includes('❌')) return 'error';
  if (m.includes('warn'))  return 'warning';
  if (m.includes('success') || m.includes('✅') || m.includes('started') || m.includes('listening')) return 'success';
  return 'info';
}

// ─── Format uptime ────────────────────────────────────────────────────────────
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

// ─── Toast ────────────────────────────────────────────────────────────────────
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

// ─── Badge / status ───────────────────────────────────────────────────────────
function setStatus(el, statusState, text) {
  const dot  = el.querySelector('.status-dot');
  const span = el.querySelector('.status-text');
  const card = el.closest('.service-card');
  dot.className  = `status-dot ${statusState}`;
  span.textContent = text;
  el.classList.remove('badge-success', 'badge-secondary', 'badge-warning', 'badge-destructive');
  const map = { running: 'badge-success', stopped: 'badge-secondary', starting: 'badge-warning', error: 'badge-destructive' };
  el.classList.add(map[statusState] || 'badge-secondary');
  if (card) {
    card.classList.remove('running', 'error');
    if (statusState === 'running') card.classList.add('running');
    if (statusState === 'error')   card.classList.add('error');
  }
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
function updateMetrics(name, s) {
  const setMetric = (el, val) => {
    const prev = el.textContent;
    el.classList.remove('skeleton');
    el.style.width = el.style.height = '';
    el.textContent = val;
    if (prev === '--' && val !== '--') {
      el.classList.remove('metric-flash');
      void el.offsetWidth;
      el.classList.add('metric-flash');
    }
  };
  setMetric($(`${name}-pid`),    s.pid       ? s.pid                                  : '--');
  setMetric($(`${name}-uptime`), s.startTime ? formatUptime(Date.now() - s.startTime) : '--');
  setMetric($(`${name}-source`), s.running   ? (s.external ? 'Ngoài' : 'App')        : '--');
}

// ─── Button toggle ────────────────────────────────────────────────────────────
function toggleButtons(name, running) {
  const start  = $(`start-${name}`);
  const stop   = $(`stop-${name}`);
  const update = $(`update-${name}`);
  if (start)  start.disabled  = running;
  if (stop)   stop.disabled   = !running;
  if (update) update.disabled = running;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function showProgress(name) { const el = $(`${name}-progress`); if (el) el.style.display = 'block'; }
function hideProgress(name) { const el = $(`${name}-progress`); if (el) el.style.display = 'none'; }

// ─── Alert ────────────────────────────────────────────────────────────────────
function showAlert(name, message) {
  const card = $(`${name}-card`);
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
  card.querySelector('.service-header').insertAdjacentElement('afterend', alert);
  alert.querySelector('.alert-close').addEventListener('click', () => dismissAlert(name));
}

function dismissAlert(name) {
  const card  = $(`${name}-card`);
  const alert = card ? card.querySelector('.alert') : null;
  if (!alert) return;
  alert.classList.add('dismissing');
  setTimeout(() => alert.remove(), 200);
}

// ─── Log helpers ──────────────────────────────────────────────────────────────
const logUnread = {};

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

  // Unread badge khi log bị collapse
  const name = el.id.replace('-log', '');
  if (name && el.classList.contains('collapsed')) {
    logUnread[name] = (logUnread[name] || 0) + 1;
    const unreadEl = $(`${name}-log-unread`);
    if (unreadEl) { unreadEl.textContent = logUnread[name]; unreadEl.style.display = 'inline-block'; }
  }
}

function addCombinedLog(source, msg, type = 'info') {
  const el    = $('combined-log');
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

// ─── Ripple ───────────────────────────────────────────────────────────────────
function initRipple() {
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
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function initSkeletons(names) {
  names.forEach(name => {
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

module.exports = {
  $, escapeHtml, detectLogType, formatUptime,
  showToast, setStatus, updateMetrics, toggleButtons,
  showProgress, hideProgress, showAlert, dismissAlert,
  addLog, addCombinedLog, clearLog,
  initRipple, initSkeletons, logUnread
};
