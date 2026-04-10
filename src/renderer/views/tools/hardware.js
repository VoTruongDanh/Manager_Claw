const { ipcRenderer } = require('electron');
const ui = require('../../ui');

let currentData = null;
let refreshInterval = null;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function renderSystemInfo(data) {
  if (!data) return '<div class="hw-empty">Không có dữ liệu</div>';
  
  return `
    <div class="hw-grid">
      <div class="hw-item"><span class="hw-label">Hostname</span><span class="hw-value">${ui.escapeHtml(data.hostname)}</span></div>
      <div class="hw-item"><span class="hw-label">OS</span><span class="hw-value">${ui.escapeHtml(data.osName)}</span></div>
      <div class="hw-item"><span class="hw-label">Version</span><span class="hw-value">${ui.escapeHtml(data.osVersion)}</span></div>
      <div class="hw-item"><span class="hw-label">Build</span><span class="hw-value">${ui.escapeHtml(data.osBuild)}</span></div>
      <div class="hw-item"><span class="hw-label">Architecture</span><span class="hw-value">${ui.escapeHtml(data.osArch)}</span></div>
      <div class="hw-item"><span class="hw-label">Manufacturer</span><span class="hw-value">${ui.escapeHtml(data.manufacturer)}</span></div>
      <div class="hw-item"><span class="hw-label">Model</span><span class="hw-value">${ui.escapeHtml(data.model)}</span></div>
      <div class="hw-item"><span class="hw-label">BIOS</span><span class="hw-value">${ui.escapeHtml(data.biosManufacturer)} ${ui.escapeHtml(data.biosVersion)}</span></div>
      <div class="hw-item"><span class="hw-label">Uptime</span><span class="hw-value">${formatUptime(data.uptime)}</span></div>
    </div>
  `;
}

function renderCPUInfo(data) {
  if (!data) return '<div class="hw-empty">Không có dữ liệu</div>';
  
  return `
    <div class="hw-grid">
      <div class="hw-item hw-full"><span class="hw-label">Model</span><span class="hw-value">${ui.escapeHtml(data.model)}</span></div>
      <div class="hw-item"><span class="hw-label">Physical Cores</span><span class="hw-value">${data.physicalCores || data.cores}</span></div>
      <div class="hw-item"><span class="hw-label">Logical Cores</span><span class="hw-value">${data.logicalCores || data.cores}</span></div>
      <div class="hw-item"><span class="hw-label">Max Speed</span><span class="hw-value">${data.maxSpeed || data.speed} MHz</span></div>
      <div class="hw-item"><span class="hw-label">Current Speed</span><span class="hw-value">${data.currentSpeed || data.speed} MHz</span></div>
      <div class="hw-item"><span class="hw-label">Usage</span><span class="hw-value">${data.usage}%</span></div>
    </div>
  `;
}

function renderMemoryInfo(data) {
  if (!data) return '<div class="hw-empty">Không có dữ liệu</div>';
  
  let slotsHtml = '';
  if (data.slots && data.slots.length > 0) {
    slotsHtml = data.slots.map((slot, index) => `
      <div class="hw-mem-slot">
        <span class="hw-mem-slot-label">Slot ${index + 1}</span>
        <span class="hw-mem-slot-value">${formatBytes(slot.capacity)} @ ${slot.speed} MHz</span>
        <span class="hw-mem-slot-info">${ui.escapeHtml(slot.manufacturer)}</span>
      </div>
    `).join('');
  }
  
  return `
    <div class="hw-grid">
      <div class="hw-item"><span class="hw-label">Total</span><span class="hw-value">${formatBytes(data.total)}</span></div>
      <div class="hw-item"><span class="hw-label">Used</span><span class="hw-value">${formatBytes(data.used)}</span></div>
      <div class="hw-item"><span class="hw-label">Free</span><span class="hw-value">${formatBytes(data.free)}</span></div>
      <div class="hw-item"><span class="hw-label">Usage</span><span class="hw-value">${data.usagePercent}%</span></div>
    </div>
    ${slotsHtml ? `<div class="hw-mem-slots">${slotsHtml}</div>` : ''}
  `;
}

function renderDiskInfo(data) {
  if (!data || data.length === 0) return '<div class="hw-empty">Không có dữ liệu</div>';
  
  return data.map(disk => `
    <div class="hw-disk-item">
      <div class="hw-disk-header">
        <span class="hw-disk-drive">${ui.escapeHtml(disk.drive)}</span>
        <span class="hw-disk-name">${ui.escapeHtml(disk.volumeName || 'Local Disk')}</span>
        <span class="hw-disk-fs">${ui.escapeHtml(disk.fileSystem)}</span>
      </div>
      <div class="hw-disk-bar">
        <div class="hw-disk-bar-fill" style="width: ${disk.usagePercent}%"></div>
      </div>
      <div class="hw-disk-info">
        <span>${formatBytes(disk.used)} / ${formatBytes(disk.total)}</span>
        <span>${disk.usagePercent}% used</span>
      </div>
    </div>
  `).join('');
}

function renderGPUInfo(data) {
  if (!data || data.length === 0) return '<div class="hw-empty">Không có dữ liệu</div>';
  
  return data.map((gpu, index) => `
    <div class="hw-gpu-item">
      <div class="hw-gpu-header">GPU ${index + 1}</div>
      <div class="hw-grid">
        <div class="hw-item hw-full"><span class="hw-label">Name</span><span class="hw-value">${ui.escapeHtml(gpu.name)}</span></div>
        <div class="hw-item"><span class="hw-label">Memory</span><span class="hw-value">${gpu.memory > 0 ? formatBytes(gpu.memory) : 'N/A'}</span></div>
        <div class="hw-item"><span class="hw-label">Driver</span><span class="hw-value">${ui.escapeHtml(gpu.driver)}</span></div>
        <div class="hw-item hw-full"><span class="hw-label">Resolution</span><span class="hw-value">${ui.escapeHtml(gpu.resolution)}</span></div>
      </div>
    </div>
  `).join('');
}

function renderNetworkInfo(data) {
  if (!data || data.length === 0) return '<div class="hw-empty">Không có dữ liệu</div>';
  
  return data.map(adapter => `
    <div class="hw-net-item ${adapter.internal ? 'hw-net-internal' : ''}">
      <div class="hw-net-name">${ui.escapeHtml(adapter.name)}</div>
      <div class="hw-grid">
        <div class="hw-item"><span class="hw-label">IPv4</span><span class="hw-value">${ui.escapeHtml(adapter.ipv4)}</span></div>
        <div class="hw-item"><span class="hw-label">IPv6</span><span class="hw-value">${ui.escapeHtml(adapter.ipv6)}</span></div>
        <div class="hw-item hw-full"><span class="hw-label">MAC</span><span class="hw-value">${ui.escapeHtml(adapter.mac)}</span></div>
      </div>
    </div>
  `).join('');
}

function renderBatteryInfo(data) {
  if (!data) {
    return '<div class="hw-empty">Không có pin (Desktop PC)</div>';
  }
  
  return `
    <div class="hw-grid">
      <div class="hw-item"><span class="hw-label">Status</span><span class="hw-value">${ui.escapeHtml(data.status)}</span></div>
      <div class="hw-item"><span class="hw-label">Charge</span><span class="hw-value">${data.chargeRemaining}%</span></div>
      <div class="hw-item"><span class="hw-label">Runtime</span><span class="hw-value">${data.estimatedRunTime > 0 ? `${data.estimatedRunTime} min` : 'N/A'}</span></div>
    </div>
  `;
}

function renderAllData(data) {
  if (!data) return;
  
  ui.$('hw-system-content').innerHTML = renderSystemInfo(data.system);
  ui.$('hw-cpu-content').innerHTML = renderCPUInfo(data.cpu);
  ui.$('hw-memory-content').innerHTML = renderMemoryInfo(data.memory);
  ui.$('hw-disk-content').innerHTML = renderDiskInfo(data.disk);
  ui.$('hw-gpu-content').innerHTML = renderGPUInfo(data.gpu);
  ui.$('hw-network-content').innerHTML = renderNetworkInfo(data.network);
  ui.$('hw-battery-content').innerHTML = renderBatteryInfo(data.battery);
  
  const timestamp = new Date(data.timestamp).toLocaleString('vi-VN');
  ui.$('hw-last-update').textContent = `Cập nhật lúc: ${timestamp}`;
}

async function loadHardwareInfo() {
  const btn = ui.$('hw-refresh-btn');
  btn.disabled = true;
  btn.classList.add('loading');
  
  try {
    const result = await ipcRenderer.invoke('hardware-get-all');
    if (result.ok) {
      currentData = result.data;
      renderAllData(result.data);
      ui.showToast('Đã cập nhật thông tin phần cứng', 'success');
    } else {
      ui.showToast(`Lỗi: ${result.error}`, 'error');
    }
  } catch (error) {
    ui.showToast(`Lỗi: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

function toggleAutoRefresh() {
  const checkbox = ui.$('hw-auto-refresh');
  
  if (checkbox.checked) {
    refreshInterval = setInterval(loadHardwareInfo, 5000);
    ui.showToast('Bật tự động làm mới (5s)', 'info');
  } else {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
    ui.showToast('Tắt tự động làm mới', 'info');
  }
}

function init() {
  ui.$('hw-refresh-btn').addEventListener('click', loadHardwareInfo);
  ui.$('hw-auto-refresh').addEventListener('change', toggleAutoRefresh);
  
  // Copy buttons
  document.querySelectorAll('.hw-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      if (!currentData || !currentData[section]) {
        ui.showToast('Không có dữ liệu để copy', 'error');
        return;
      }
      
      const text = JSON.stringify(currentData[section], null, 2);
      navigator.clipboard.writeText(text);
      ui.showToast(`Đã copy ${section} info`, 'success');
    });
  });
}

function load() {
  if (!currentData) {
    loadHardwareInfo();
  }
}

module.exports = { init, load };
