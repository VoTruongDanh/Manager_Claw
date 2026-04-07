const { ipcRenderer } = require('electron');
const { $, showToast } = require('../../ui');

// ─── State ────────────────────────────────────────────────────────────────────
let countdownInterval = null;
let targetTime        = null; // timestamp khi máy sẽ tắt
let isScheduled       = false;

// ─── Preset buttons (phút) ───────────────────────────────────────────────────
const PRESETS = [5, 10, 15, 30, 60, 120];

function init() {
  renderPresets();
  bindEvents();
  bindIPC();
}

// ─── Render preset buttons ────────────────────────────────────────────────────
function renderPresets() {
  const container = $('shutdown-presets');
  container.innerHTML = PRESETS.map(min =>
    `<button class="btn btn-secondary btn-sm shutdown-preset" data-minutes="${min}">
      ${min >= 60 ? (min / 60) + 'h' : min + 'm'}
    </button>`
  ).join('');

  container.querySelectorAll('.shutdown-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const minutes = +btn.dataset.minutes;
      $('shutdown-hours').value   = Math.floor(minutes / 60);
      $('shutdown-minutes').value = minutes % 60;
      $('shutdown-seconds').value = 0;
    });
  });
}

// ─── Bind events ─────────────────────────────────────────────────────────────
function bindEvents() {
  $('shutdown-start-btn').addEventListener('click', () => {
    if (isScheduled) return;
    const totalSeconds = getTotalSeconds();
    if (totalSeconds <= 0) { showToast('Nhập thời gian hợp lệ', 'error'); return; }
    const mode = $('shutdown-mode').value; // 'shutdown' | 'restart'
    ipcRenderer.send('shutdown-schedule', { seconds: totalSeconds, mode });
  });

  $('shutdown-cancel-btn').addEventListener('click', () => {
    ipcRenderer.send('shutdown-cancel');
  });

  $('shutdown-now-btn').addEventListener('click', () => {
    if (!confirm('Tắt máy ngay bây giờ?')) return;
    ipcRenderer.send('shutdown-now');
  });

  // Cho phép nhập Enter để bắt đầu
  ['shutdown-hours', 'shutdown-minutes', 'shutdown-seconds'].forEach(id => {
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('shutdown-start-btn').click();
    });
  });
}

// ─── IPC responses ────────────────────────────────────────────────────────────
function bindIPC() {
  ipcRenderer.on('shutdown-scheduled', (_, result) => {
    if (!result.ok) {
      showToast('Lỗi: ' + result.error, 'error');
      return;
    }
    const totalSeconds = getTotalSeconds();
    const mode = $('shutdown-mode').value;
    isScheduled = true;
    targetTime  = Date.now() + totalSeconds * 1000;
    startCountdown(mode);
    setScheduledUI(true, mode);
    showToast(`Đã hẹn ${mode === 'restart' ? 'khởi động lại' : 'tắt máy'} sau ${formatDuration(totalSeconds)}`, 'success');
  });

  ipcRenderer.on('shutdown-cancelled', (_, result) => {
    stopCountdown();
    isScheduled = false;
    targetTime  = null;
    setScheduledUI(false);
    showToast(result.ok ? 'Đã hủy lệnh tắt máy' : 'Không có lệnh nào đang chờ', result.ok ? 'success' : 'info');
  });
}

// ─── Countdown ────────────────────────────────────────────────────────────────
function startCountdown(mode) {
  stopCountdown();
  updateCountdownDisplay();
  countdownInterval = setInterval(() => {
    const remaining = Math.max(0, targetTime - Date.now());
    updateCountdownDisplay(remaining);
    if (remaining <= 0) {
      stopCountdown();
      isScheduled = false;
      setScheduledUI(false);
    }
  }, 500);
}

function stopCountdown() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  $('shutdown-countdown').textContent = '--:--:--';
  $('shutdown-countdown-bar').style.width = '0%';
}

function updateCountdownDisplay(remainingMs) {
  if (remainingMs === undefined) remainingMs = targetTime ? Math.max(0, targetTime - Date.now()) : 0;
  const totalMs   = getTotalSeconds() * 1000;
  const remaining = Math.ceil(remainingMs / 1000);
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  $('shutdown-countdown').textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;

  // Progress bar (đếm ngược từ 100% → 0%)
  const pct = totalMs > 0 ? (remainingMs / totalMs) * 100 : 0;
  $('shutdown-countdown-bar').style.width = pct + '%';

  // Đổi màu khi gần hết
  const bar = $('shutdown-countdown-bar');
  bar.classList.toggle('danger', pct < 20);
  bar.classList.toggle('warning', pct >= 20 && pct < 40);
}

// ─── UI state ─────────────────────────────────────────────────────────────────
function setScheduledUI(scheduled, mode) {
  const startBtn  = $('shutdown-start-btn');
  const cancelBtn = $('shutdown-cancel-btn');
  const inputs    = ['shutdown-hours', 'shutdown-minutes', 'shutdown-seconds', 'shutdown-mode'];
  const label     = mode === 'restart' ? 'Khởi động lại' : 'Tắt máy';

  startBtn.disabled  = scheduled;
  cancelBtn.disabled = !scheduled;
  inputs.forEach(id => { $(id).disabled = scheduled; });
  document.querySelectorAll('.shutdown-preset').forEach(b => b.disabled = scheduled);

  $('shutdown-status-text').textContent = scheduled
    ? `Đang đếm ngược — ${label} sẽ thực hiện lúc ${new Date(targetTime).toLocaleTimeString('vi-VN')}`
    : 'Chưa hẹn giờ';
  $('shutdown-status-dot').className = 'status-dot ' + (scheduled ? 'running' : 'stopped');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTotalSeconds() {
  const h = parseInt($('shutdown-hours').value)   || 0;
  const m = parseInt($('shutdown-minutes').value) || 0;
  const s = parseInt($('shutdown-seconds').value) || 0;
  return h * 3600 + m * 60 + s;
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = { init };
