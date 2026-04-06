const { ipcRenderer } = require('electron');

// State management
const state = {
  router: {
    running: false,
    startTime: null,
    pid: null
  },
  openclaw: {
    running: false,
    startTime: null,
    pid: null
  }
};

// Elements
const routerStatus = document.getElementById('router-status');
const openclawStatus = document.getElementById('openclaw-status');
const routerLog = document.getElementById('router-log');
const openclawLog = document.getElementById('openclaw-log');
const routerUptime = document.getElementById('router-uptime');
const openclawUptime = document.getElementById('openclaw-uptime');
const routerPid = document.getElementById('router-pid');
const openclawPid = document.getElementById('openclaw-pid');

// Theme toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
});

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

// 9Router Controls
document.getElementById('start-router').addEventListener('click', () => {
  console.log('[RENDERER] Start router button clicked');
  const btn = document.getElementById('start-router');
  btn.classList.add('loading');
  setStatus(routerStatus, 'starting', 'Đang khởi động...');
  ipcRenderer.send('start-router');
  showToast('Đang khởi động 9Router...', 'info');
  
  // Remove loading after timeout
  setTimeout(() => btn.classList.remove('loading'), 3000);
});

document.getElementById('stop-router').addEventListener('click', () => {
  console.log('[RENDERER] Stop router button clicked');
  const btn = document.getElementById('stop-router');
  btn.classList.add('loading');
  ipcRenderer.send('stop-router');
  showToast('Đang dừng 9Router...', 'info');
  
  setTimeout(() => btn.classList.remove('loading'), 2000);
});

document.getElementById('open-router-folder').addEventListener('click', () => {
  ipcRenderer.send('open-folder', process.env.APPDATA + '\\npm\\node_modules\\9router');
});

document.getElementById('update-router').addEventListener('click', () => {
  const btn = document.getElementById('update-router');
  btn.classList.add('loading');
  btn.disabled = true;
  addLog(routerLog, '🔄 Đang cập nhật 9Router...', 'info');
  ipcRenderer.send('update-router');
  showToast('Đang cập nhật 9Router...', 'info');
});

document.getElementById('clear-router-log').addEventListener('click', () => {
  clearLog(routerLog);
});

// OpenClaw Controls
document.getElementById('start-openclaw').addEventListener('click', () => {
  console.log('[RENDERER] Start openclaw button clicked');
  const btn = document.getElementById('start-openclaw');
  btn.classList.add('loading');
  setStatus(openclawStatus, 'starting', 'Đang khởi động...');
  ipcRenderer.send('start-openclaw');
  showToast('Đang khởi động OpenClaw...', 'info');
  
  setTimeout(() => btn.classList.remove('loading'), 3000);
});

document.getElementById('stop-openclaw').addEventListener('click', () => {
  console.log('[RENDERER] Stop openclaw button clicked');
  const btn = document.getElementById('stop-openclaw');
  btn.classList.add('loading');
  ipcRenderer.send('stop-openclaw');
  showToast('Đang dừng OpenClaw...', 'info');
  
  setTimeout(() => btn.classList.remove('loading'), 2000);
});

document.getElementById('open-openclaw-folder').addEventListener('click', () => {
  ipcRenderer.send('open-folder', process.env.APPDATA + '\\npm\\node_modules\\openclaw');
});

document.getElementById('update-openclaw').addEventListener('click', () => {
  const btn = document.getElementById('update-openclaw');
  btn.classList.add('loading');
  btn.disabled = true;
  addLog(openclawLog, '🔄 Đang cập nhật OpenClaw...', 'info');
  ipcRenderer.send('update-openclaw');
  showToast('Đang cập nhật OpenClaw...', 'info');
});

document.getElementById('clear-openclaw-log').addEventListener('click', () => {
  clearLog(openclawLog);
});

// Quick Actions
document.getElementById('start-all').addEventListener('click', () => {
  setStatus(routerStatus, 'starting', 'Đang khởi động...');
  setStatus(openclawStatus, 'starting', 'Đang khởi động...');
  ipcRenderer.send('start-router');
  ipcRenderer.send('start-openclaw');
  showToast('Đang khởi động tất cả services...', 'info');
});

document.getElementById('stop-all').addEventListener('click', () => {
  ipcRenderer.send('stop-router');
  ipcRenderer.send('stop-openclaw');
  showToast('Đang dừng tất cả services...', 'info');
});

// IPC Listeners
ipcRenderer.on('router-status', (event, data) => {
  console.log('[RENDERER] router-status received:', data);
  
  const startBtn = document.getElementById('start-router');
  const stopBtn = document.getElementById('stop-router');
  
  startBtn.classList.remove('loading');
  stopBtn.classList.remove('loading');
  
  state.router.running = data.running;
  
  if (data.running) {
    state.router.startTime = data.startTime || Date.now();
    state.router.pid = data.pid;
    console.log('[RENDERER] Router state updated - running:', state.router.running, 'PID:', state.router.pid, 'StartTime:', state.router.startTime);
  } else {
    state.router.startTime = null;
    state.router.pid = null;
    console.log('[RENDERER] Router state updated - stopped');
  }
  
  const statusType = data.error ? 'error' : (data.running ? 'running' : 'stopped');
  setStatus(routerStatus, statusType, data.running ? 'Đang chạy' : 'Đã dừng');
  updateMetrics('router');
  addLog(routerLog, data.message, data.error ? 'error' : (data.running ? 'success' : 'info'));
  
  // Enable/disable buttons
  toggleButtons('router', data.running);
  
  if (data.running && !data.error) {
    showToast('9Router đã khởi động thành công', 'success');
  } else if (data.error) {
    showToast(data.message, 'error');
  }
});

ipcRenderer.on('router-log', (event, data) => {
  const type = detectLogType(data);
  addLog(routerLog, data, type);
});

ipcRenderer.on('openclaw-status', (event, data) => {
  console.log('[RENDERER] openclaw-status received:', data);
  
  const startBtn = document.getElementById('start-openclaw');
  const stopBtn = document.getElementById('stop-openclaw');
  
  startBtn.classList.remove('loading');
  stopBtn.classList.remove('loading');
  
  state.openclaw.running = data.running;
  
  if (data.running) {
    state.openclaw.startTime = data.startTime || Date.now();
    state.openclaw.pid = data.pid;
    console.log('[RENDERER] OpenClaw state updated - running:', state.openclaw.running, 'PID:', state.openclaw.pid, 'StartTime:', state.openclaw.startTime);
  } else {
    state.openclaw.startTime = null;
    state.openclaw.pid = null;
    console.log('[RENDERER] OpenClaw state updated - stopped');
  }
  
  const statusType = data.error ? 'error' : (data.running ? 'running' : 'stopped');
  setStatus(openclawStatus, statusType, data.running ? 'Đang chạy' : 'Đã dừng');
  updateMetrics('openclaw');
  addLog(openclawLog, data.message, data.error ? 'error' : (data.running ? 'success' : 'info'));
  
  // Enable/disable buttons
  toggleButtons('openclaw', data.running);
  
  if (data.running && !data.error) {
    showToast('OpenClaw đã khởi động thành công', 'success');
  } else if (data.error) {
    showToast(data.message, 'error');
  }
});

ipcRenderer.on('openclaw-log', (event, data) => {
  const type = detectLogType(data);
  addLog(openclawLog, data, type);
});

ipcRenderer.on('update-progress', (event, data) => {
  const logElement = data.app === '9Router' ? routerLog : openclawLog;
  addLog(logElement, data.message, 'info');
});

ipcRenderer.on('update-result', (event, data) => {
  const logElement = data.app === '9Router' ? routerLog : openclawLog;
  const btn = document.getElementById(data.app === '9Router' ? 'update-router' : 'update-openclaw');
  
  btn.classList.remove('loading');
  btn.disabled = false;
  
  if (data.success) {
    addLog(logElement, `✅ ${data.app} đã được cập nhật thành công!`, 'success');
    showToast(`${data.app} đã được cập nhật thành công`, 'success');
  } else {
    addLog(logElement, `❌ Cập nhật ${data.app} thất bại (code: ${data.code || 'unknown'})`, 'error');
    showToast(`Cập nhật ${data.app} thất bại`, 'error');
  }
});

ipcRenderer.on('status-update', (event, data) => {
  console.log('[RENDERER] status-update received:', data);
  
  // Update router
  state.router.running = data.router.running;
  state.router.pid = data.router.pid;
  state.router.startTime = data.router.startTime;
  
  console.log('[RENDERER] Router state from status-update:', state.router);
  
  // Update openclaw
  state.openclaw.running = data.openclaw.running;
  state.openclaw.pid = data.openclaw.pid;
  state.openclaw.startTime = data.openclaw.startTime;
  
  console.log('[RENDERER] OpenClaw state from status-update:', state.openclaw);
  
  setStatus(routerStatus, data.router.running ? 'running' : 'stopped', data.router.running ? 'Đang chạy' : 'Đã dừng');
  setStatus(openclawStatus, data.openclaw.running ? 'running' : 'stopped', data.openclaw.running ? 'Đang chạy' : 'Đã dừng');
  
  updateMetrics('router');
  updateMetrics('openclaw');
  
  toggleButtons('router', data.router.running);
  toggleButtons('openclaw', data.openclaw.running);
});

// Tray actions
ipcRenderer.on('tray-start-all', () => {
  document.getElementById('start-all').click();
});

ipcRenderer.on('tray-stop-all', () => {
  document.getElementById('stop-all').click();
});

ipcRenderer.on('tray-start-router', () => {
  document.getElementById('start-router').click();
});

ipcRenderer.on('tray-stop-router', () => {
  document.getElementById('stop-router').click();
});

ipcRenderer.on('tray-start-openclaw', () => {
  document.getElementById('start-openclaw').click();
});

ipcRenderer.on('tray-stop-openclaw', () => {
  document.getElementById('stop-openclaw').click();
});

// Helper Functions
function setStatus(statusElement, state, text) {
  const dot = statusElement.querySelector('.status-dot');
  const textElement = statusElement.querySelector('.status-text');
  const card = statusElement.closest('.service-card');
  
  dot.className = `status-dot ${state}`;
  textElement.textContent = text;
  
  // Update card border
  if (card) {
    card.classList.remove('running', 'error', 'stopped');
    if (state === 'running') {
      card.classList.add('running');
    } else if (state === 'error') {
      card.classList.add('error');
    }
  }
}

function addLog(logElement, message, type = 'info') {
  // Remove empty state if exists
  const emptyState = logElement.querySelector('.log-empty');
  if (emptyState) {
    emptyState.remove();
  }
  
  const timestamp = new Date().toLocaleTimeString('vi-VN');
  const logLine = document.createElement('div');
  logLine.className = 'log-line';
  
  const timestampSpan = document.createElement('span');
  timestampSpan.className = 'log-timestamp';
  timestampSpan.textContent = `[${timestamp}]`;
  
  const messageSpan = document.createElement('span');
  messageSpan.className = `log-${type}`;
  messageSpan.textContent = message;
  
  logLine.appendChild(timestampSpan);
  logLine.appendChild(messageSpan);
  logElement.appendChild(logLine);
  
  // Auto scroll to bottom
  logElement.scrollTop = logElement.scrollHeight;
  
  // Limit log lines to 100
  const lines = logElement.querySelectorAll('.log-line');
  if (lines.length > 100) {
    lines[0].remove();
  }
}

function clearLog(logElement) {
  logElement.innerHTML = '<div class="log-empty">Chưa có log</div>';
}

function detectLogType(message) {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('error') || lowerMessage.includes('failed') || lowerMessage.includes('❌')) {
    return 'error';
  }
  if (lowerMessage.includes('warning') || lowerMessage.includes('warn')) {
    return 'warning';
  }
  if (lowerMessage.includes('success') || lowerMessage.includes('✅') || lowerMessage.includes('started')) {
    return 'success';
  }
  return 'info';
}

function updateMetrics(service) {
  const serviceState = state[service];
  const uptimeElement = document.getElementById(`${service}-uptime`);
  const pidElement = document.getElementById(`${service}-pid`);
  
  console.log(`[RENDERER] updateMetrics(${service}):`, serviceState);
  
  // Always update PID if we have it, regardless of running state
  if (serviceState.pid) {
    pidElement.textContent = serviceState.pid;
    console.log(`[RENDERER] ${service} PID set to:`, serviceState.pid);
  } else {
    pidElement.textContent = '--';
  }
  
  // Update uptime if we have startTime
  if (serviceState.startTime) {
    const uptime = Date.now() - serviceState.startTime;
    uptimeElement.textContent = formatUptime(uptime);
    console.log(`[RENDERER] ${service} uptime updated:`, formatUptime(uptime));
  } else {
    uptimeElement.textContent = '--';
  }
  
  console.log(`[RENDERER] ${service} metrics updated - PID: ${pidElement.textContent}, Uptime: ${uptimeElement.textContent}`);
}

function toggleButtons(service, isRunning) {
  const startBtn = document.getElementById(`start-${service}`);
  const stopBtn = document.getElementById(`stop-${service}`);
  const updateBtn = document.getElementById(`update-${service}`);
  
  if (startBtn) startBtn.disabled = isRunning;
  if (stopBtn) stopBtn.disabled = !isRunning;
  if (updateBtn) updateBtn.disabled = isRunning;
}

function formatUptime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Update uptime every second
setInterval(() => {
  if (state.router.running && state.router.startTime) {
    const uptime = Date.now() - state.router.startTime;
    routerUptime.textContent = formatUptime(uptime);
  }
  
  if (state.openclaw.running && state.openclaw.startTime) {
    const uptime = Date.now() - state.openclaw.startTime;
    openclawUptime.textContent = formatUptime(uptime);
  }
}, 1000);

// Check status on load
setInterval(() => {
  console.log('[RENDERER] Periodic status check');
  ipcRenderer.send('check-status');
}, 3000);

// Initial status check
console.log('[RENDERER] Initial status check');
ipcRenderer.send('check-status');
