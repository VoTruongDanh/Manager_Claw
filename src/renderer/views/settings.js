const { ipcRenderer } = require('electron');
const ui = require('../ui');

let lastSavedState = {};

function load() {
  ipcRenderer.send('get-settings');
}

function markDirty() {
  const badge = ui.$('settings-dirty-badge');
  if (badge) badge.style.display = 'inline-flex';
}

function markClean() {
  const badge = ui.$('settings-dirty-badge');
  if (badge) badge.style.display = 'none';
}

function getCurrentState() {
  return {
    autoLaunch:        ui.$('setting-auto-launch').checked,
    autoHeal:          ui.$('setting-auto-heal').checked,
    startMinimized:    ui.$('setting-start-minimized').checked,
    autoStartRouter:   ui.$('setting-auto-router').checked,
    autoStartOpenclaw: ui.$('setting-auto-openclaw').checked,
    minimizeToTray:    ui.$('setting-minimize-tray').checked
  };
}

function isDirty() {
  const current = getCurrentState();
  return JSON.stringify(current) !== JSON.stringify(lastSavedState);
}

function init() {
  ipcRenderer.on('settings-data', (_, s) => {
    ui.$('setting-auto-launch').checked     = !!s.autoLaunch;
    ui.$('setting-auto-heal').checked       = !!s.autoHeal;
    ui.$('setting-start-minimized').checked = !!s.startMinimized;
    ui.$('setting-auto-router').checked     = !!s.autoStartRouter;
    ui.$('setting-auto-openclaw').checked   = !!s.autoStartOpenclaw;
    ui.$('setting-minimize-tray').checked   = s.minimizeToTray !== false;
    ui.$('settings-path-text').textContent  = s._path || '...';
    lastSavedState = getCurrentState();
    markClean();
  });

  ipcRenderer.on('settings-saved', () => {
    lastSavedState = getCurrentState();
    markClean();
    ui.showToast('Đã lưu cài đặt', 'success');
  });

  ipcRenderer.on('app-version', (_, v) => {
    ui.$('app-version-text').textContent = `v${v}`;
  });

  ['setting-auto-launch', 'setting-auto-heal', 'setting-start-minimized', 'setting-auto-router', 'setting-auto-openclaw', 'setting-minimize-tray'].forEach(id => {
    const el = ui.$(id);
    if (el) el.addEventListener('change', () => { if (isDirty()) markDirty(); else markClean(); });
  });

  ui.$('save-settings-btn').addEventListener('click', () => {
    const current = getCurrentState();
    ipcRenderer.send('set-auto-heal', current.autoHeal);
    ipcRenderer.send('save-settings', current);
  });

  // Copy-Paste Sync
  ui.$('copypaste-upload-btn').addEventListener('click', handleCopyPasteUpload);
  ui.$('copypaste-download-btn').addEventListener('click', handleCopyPasteDownload);
  
  loadCopyPasteInfo();
}

async function loadCopyPasteInfo() {
  try {
    const info = await ipcRenderer.invoke('copypaste-get-info');
    
    ui.$('copypaste-current-code').textContent = info.code || '--';
    ui.$('copypaste-upload-time').textContent = info.uploadedAt 
      ? new Date(info.uploadedAt).toLocaleString('vi-VN')
      : '--';
    ui.$('copypaste-download-time').textContent = info.downloadedAt
      ? new Date(info.downloadedAt).toLocaleString('vi-VN')
      : '--';
  } catch (error) {
    console.error('Failed to load copy-paste info:', error);
  }
}

async function handleCopyPasteUpload() {
  const btn = ui.$('copypaste-upload-btn');
  btn.disabled = true;
  btn.classList.add('loading');
  
  try {
    const result = await ipcRenderer.invoke('copypaste-upload');
    
    if (result.ok) {
      ui.$('copypaste-current-code').textContent = result.code;
      ui.$('copypaste-upload-time').textContent = new Date(result.timestamp).toLocaleString('vi-VN');
      
      // Copy code to clipboard
      navigator.clipboard.writeText(result.code);
      
      ui.showToast(`Upload thành công! Code: ${result.code} (đã copy)`, 'success');
    } else {
      ui.showToast(`Upload thất bại: ${result.error}`, 'error');
    }
  } catch (error) {
    ui.showToast(`Lỗi: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

async function handleCopyPasteDownload() {
  const code = prompt('Nhập code để download cấu hình:');
  
  if (!code || !code.trim()) {
    return;
  }
  
  const btn = ui.$('copypaste-download-btn');
  btn.disabled = true;
  btn.classList.add('loading');
  
  try {
    const result = await ipcRenderer.invoke('copypaste-download', code.trim());
    
    if (result.ok) {
      ui.$('copypaste-current-code').textContent = code.trim();
      ui.$('copypaste-download-time').textContent = new Date(result.timestamp).toLocaleString('vi-VN');
      
      ui.showToast('Download thành công! Đang tải lại cấu hình...', 'success');
      
      // Reload settings
      setTimeout(() => {
        load();
        ui.showToast('Đã áp dụng cấu hình mới', 'success');
      }, 500);
    } else {
      ui.showToast(`Download thất bại: ${result.error}`, 'error');
    }
  } catch (error) {
    ui.showToast(`Lỗi: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

module.exports = { init, load };
