const { ipcRenderer } = require('electron');
const ui = require('../ui');

const HISTORY_LIMIT = 30;
const LINE_COLORS = {
  cpu: '#2563eb',
  ram: '#16a34a'
};

const history = {
  router: { cpu: [], ram: [] },
  openclaw: { cpu: [], ram: [] }
};

function pushSample(list, value) {
  list.push(value);
  if (list.length > HISTORY_LIMIT) list.shift();
}

function formatPercent(value, running) {
  return running ? `${value.toFixed(1)}%` : '--';
}

function setMetricValue(key, type, value, running) {
  const el = ui.$(`${key}-${type}-value`);
  if (el) el.textContent = formatPercent(value, running);
}

function drawLine(ctx, values, color, width, height, padding) {
  if (!values.length) return;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  values.forEach((value, index) => {
    const x = padding + ((width - padding * 2) / Math.max(values.length - 1, 1)) * index;
    const y = height - padding - ((height - padding * 2) * Math.min(Math.max(value, 0), 100)) / 100;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

function drawChart(key) {
  const canvas = ui.$(`${key}-metrics-chart`);
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(canvas.clientWidth || 320, 320);
  const height = Math.max(canvas.clientHeight || 160, 160);

  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }

  const ctx = canvas.getContext('2d');
  const padding = 18;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(127,127,127,0.18)';
  ctx.lineWidth = 1;
  [0, 25, 50, 75, 100].forEach((mark) => {
    const y = height - padding - ((height - padding * 2) * mark) / 100;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  });

  drawLine(ctx, history[key].cpu, LINE_COLORS.cpu, width, height, padding);
  drawLine(ctx, history[key].ram, LINE_COLORS.ram, width, height, padding);
}

function renderMetrics(payload) {
  const services = payload.services || {};

  ['router', 'openclaw'].forEach((key) => {
    const data = services[key] || {};
    const running = !!data.running && !!data.pid;
    const cpu = running ? Number(data.cpu || 0) : 0;
    const ram = running ? Number(data.ram || 0) : 0;

    pushSample(history[key].cpu, cpu);
    pushSample(history[key].ram, ram);
    setMetricValue(key, 'cpu', cpu, running);
    setMetricValue(key, 'ram', ram, running);
    drawChart(key);
  });
}

function init() {
  ipcRenderer.on('process-metrics', (_, payload) => renderMetrics(payload));

  const requestMetrics = () => ipcRenderer.send('get-process-metrics');
  requestMetrics();
  setInterval(requestMetrics, 2000);

  window.addEventListener('resize', () => {
    drawChart('router');
    drawChart('openclaw');
  });
}

module.exports = { init };
