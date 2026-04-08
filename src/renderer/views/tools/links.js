const { ipcRenderer } = require('electron');
const ui = require('../../ui');

let links = [];
let editingId = null;
let currentSort = 'unread';
let currentFilter = 'all';
let syncUrl = '';

function init() {
  const form = ui.$('link-form');
  if (!form) return;

  form.addEventListener('submit', handleSubmit);
  ui.$('link-cancel-btn').addEventListener('click', resetForm);
  ui.$('link-refresh-btn').addEventListener('click', handleRefresh);
  ui.$('link-sort').addEventListener('change', (event) => {
    currentSort = event.target.value;
    render();
  });
  ui.$('link-filter').addEventListener('change', (event) => {
    currentFilter = event.target.value;
    render();
  });
  ui.$('link-list').addEventListener('click', handleListClick);
  ui.$('link-export-btn').addEventListener('click', handleExport);
  ui.$('link-import-btn').addEventListener('click', handleImport);

  ui.$('link-sync-settings-btn').addEventListener('click', openSyncModal);
  ui.$('link-sync-close-btn').addEventListener('click', closeSyncModal);
  ui.$('link-sync-cancel-btn').addEventListener('click', closeSyncModal);
  ui.$('link-sync-form').addEventListener('submit', handleSyncSubmit);
  ui.$('link-sync-modal').addEventListener('click', (event) => {
    if (event.target === ui.$('link-sync-modal')) closeSyncModal();
  });
  document.addEventListener('keydown', handleKeydown);

  load();
}

async function load(options = {}) {
  const { sync = false, silent = false } = options;

  try {
    const data = sync
      ? await ipcRenderer.invoke('link-sync-now')
      : await ipcRenderer.invoke('library-get-all');

    links = Array.isArray(data.links) ? data.links : [];
    syncUrl = typeof data.sync_url === 'string' ? data.sync_url : '';
    syncInputWithState();
    render();

    if (sync && !silent) {
      ui.showToast(formatSyncMessage(data), data.skipped ? 'info' : 'success');
    }

    return data;
  } catch (error) {
    ui.showToast(
      sync ? `Không sync được Link: ${error.message}` : `Không tải được Link: ${error.message}`,
      'error'
    );
    return null;
  }
}

async function handleRefresh() {
  const refreshBtn = ui.$('link-refresh-btn');
  setButtonBusy(refreshBtn, true);
  await load({ sync: true });
  setButtonBusy(refreshBtn, false);
}

async function handleExport() {
  const exportBtn = ui.$('link-export-btn');
  try {
    setButtonBusy(exportBtn, true);
    const result = await ipcRenderer.invoke('link-export');
    if (result?.cancelled) return;
    ui.showToast(`Đã xuất file: ${result.path}`, 'success');
  } catch (error) {
    ui.showToast(`Không xuất được file: ${error.message}`, 'error');
  } finally {
    setButtonBusy(exportBtn, false);
  }
}

async function handleImport() {
  const importBtn = ui.$('link-import-btn');
  try {
    setButtonBusy(importBtn, true);
    const result = await ipcRenderer.invoke('link-import');
    if (result?.cancelled) return;

    await load({ sync: false, silent: true });
    ui.showToast(
      `Đã nhập ${result.importedCount || 0} link, thêm ${result.addedCount || 0}, bỏ qua ${result.duplicateCount || 0} trùng`,
      'success'
    );
  } catch (error) {
    ui.showToast(`Không nhập được file: ${error.message}`, 'error');
  } finally {
    setButtonBusy(importBtn, false);
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const form = ui.$('link-form');
  const submitBtn = form.querySelector('button[type="submit"]');

  try {
    const wasEditing = !!editingId;
    setButtonBusy(submitBtn, true);

    const result = await ipcRenderer.invoke('link-save', {
      id: editingId,
      name: ui.$('link-name').value.trim(),
      url: ui.$('link-url').value.trim(),
      category: ui.$('link-category').value || '',
      read: ui.$('link-read').checked
    });

    links = result.links || [];
    render();
    resetForm();
    ui.showToast(wasEditing ? 'Đã cập nhật link' : 'Đã lưu link', 'success');
  } catch (error) {
    ui.showToast(error.message, 'error');
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

async function handleListClick(event) {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  event.preventDefault();

  const card = actionEl.closest('.library-item');
  if (!card) return;

  const link = links.find((item) => item.id === card.dataset.id);
  if (!link) return;

  const action = actionEl.dataset.action;

  if (action === 'toggle-read') {
    try {
      const result = await ipcRenderer.invoke('link-toggle-read', {
        id: link.id,
        read: !link.read
      });
      links = result.links || [];
      render();
      ui.showToast(link.read ? 'Đã chuyển sang chưa đọc' : 'Đã đánh dấu đã đọc', 'success');
    } catch (error) {
      ui.showToast(error.message, 'error');
    }
    return;
  }

  if (action === 'toggle-pin') {
    try {
      const result = await ipcRenderer.invoke('link-toggle-pin', {
        id: link.id,
        pinned: !link.pinned
      });
      links = result.links || [];
      render();
      ui.showToast(link.pinned ? 'Đã bỏ ghim link' : 'Đã ghim link lên đầu', 'success');
    } catch (error) {
      ui.showToast(error.message, 'error');
    }
    return;
  }

  if (action === 'open') {
    ipcRenderer.send('open-browser', link.url);
    return;
  }

  if (action === 'edit') {
    editingId = link.id;
    ui.$('link-name').value = link.name;
    ui.$('link-url').value = link.url;
    ui.$('link-read').checked = !!link.read;
    ui.$('link-category').value = link.category || '';
    ui.$('link-form-title').textContent = 'Chỉnh sửa link';
    ui.$('link-form-desc').textContent = 'Cập nhật link và hệ thống sẽ làm mới preview nếu URL thay đổi.';
    ui.$('link-submit-label').textContent = 'Lưu thay đổi';
    ui.$('link-cancel-btn').style.display = 'inline-flex';
    ui.$('link-name').focus();
    return;
  }

  if (action === 'delete') {
    if (!confirm(`Xóa link "${link.name}"?`)) return;
    try {
      const result = await ipcRenderer.invoke('link-delete', link.id);
      links = result.links || [];
      if (editingId === link.id) resetForm();
      render();
      ui.showToast('Đã xóa link', 'success');
    } catch (error) {
      ui.showToast(error.message, 'error');
    }
  }
}

function openSyncModal() {
  syncInputWithState();
  ui.$('link-sync-modal').style.display = 'flex';
  ui.$('link-sync-url').focus();
  ui.$('link-sync-url').select();
}

function closeSyncModal() {
  ui.$('link-sync-modal').style.display = 'none';
}

function handleKeydown(event) {
  if (event.key === 'Escape' && ui.$('link-sync-modal').style.display !== 'none') {
    closeSyncModal();
  }
}

async function handleSyncSubmit(event) {
  event.preventDefault();

  const form = ui.$('link-sync-form');
  const submitBtn = form.querySelector('button[type="submit"]');

  try {
    setButtonBusy(submitBtn, true);
    const result = await ipcRenderer.invoke('link-sync-save', ui.$('link-sync-url').value.trim());
    syncUrl = result.sync_url || '';
    syncInputWithState();

    const syncResult = await load({ sync: true, silent: true });
    if (!syncResult) return;

    closeSyncModal();
    ui.showToast(formatSyncMessage(syncResult), syncResult.skipped ? 'info' : 'success');
  } catch (error) {
    ui.showToast(error.message, 'error');
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

function syncInputWithState() {
  const input = ui.$('link-sync-url');
  if (!input) return;
  input.value = syncUrl || '';
}

function resetForm() {
  editingId = null;
  ui.$('link-form').reset();
  ui.$('link-category').value = '';
  ui.$('link-form-title').textContent = 'Lưu link mới';
  ui.$('link-form-desc').textContent = 'Lưu link với title/favicon để quét nhanh trong danh sách.';
  ui.$('link-submit-label').textContent = 'Lưu link';
  ui.$('link-cancel-btn').style.display = 'none';
}

function render() {
  const list = ui.$('link-list');
  const unreadCount = links.filter((item) => !item.read).length;
  ui.$('link-count').textContent = `${links.length} link`;
  ui.$('link-unread-count').textContent = `${unreadCount} chưa đọc`;
  ui.$('link-sync-settings-btn').title = syncUrl || 'Chưa cấu hình Google Sheets CSV';

  const filtered = filterLinks(links, currentFilter);
  if (!filtered.length) {
    list.innerHTML = `
      <div class="library-empty">
        <div class="library-empty-icon">L</div>
        <h3>Chưa có link nào</h3>
        <p>Lưu link cần đọc, ghim link quan trọng lên trên và sync thêm bằng Google Sheets CSV khi cần.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = sortLinks(filtered, currentSort).map((link) => `
    <article class="library-item link-item ${link.read ? 'is-read' : 'is-unread'} ${link.pinned ? 'is-pinned' : ''}" data-id="${link.id}">
      <div class="link-thumbnail">
        ${renderThumbnail(link)}
      </div>
      <div class="library-item-main">
        <div class="library-item-head">
          <div class="link-title-row">
            <h3>${ui.escapeHtml(link.name)}</h3>
            ${link.pinned ? '<span class="link-pin-indicator">Pinned</span>' : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="badge badge-secondary">${getCategoryLabel(link.category)}</span>
            <span class="badge ${link.read ? 'badge-secondary' : 'badge-warning'}">${link.read ? 'Đã đọc' : 'Chưa đọc'}</span>
          </div>
        </div>
        <a href="#" class="library-link" data-action="open">${ui.escapeHtml(link.url)}</a>
        <div class="library-meta-row">
          <span class="library-meta">${ui.escapeHtml(getPreviewHost(link))}</span>
          <span class="library-meta">${formatDate(link.updatedAt)}</span>
        </div>
        <div class="library-actions">
          <div class="library-actions-left">
            <button class="btn-icon library-pin-btn ${link.pinned ? 'is-active' : ''}" data-action="toggle-pin" title="${link.pinned ? 'Bỏ ghim' : 'Ghim'}">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="${link.pinned ? 'currentColor' : 'none'}" stroke="currentColor">
                <path d="M10 2l2.5 5 5.5.5-4 3.5 1 5.5-5-3-5 3 1-5.5-4-3.5 5.5-.5L10 2z"/>
              </svg>
            </button>
            <button class="btn btn-secondary btn-sm" data-action="toggle-read">${link.read ? 'Chưa đọc' : 'Xong'}</button>
          </div>
          <div class="library-actions-right">
            <button class="btn-icon btn-secondary btn-sm" data-action="edit">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            </button>
            <button class="btn-icon btn-danger btn-sm" data-action="delete">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
            </button>
          </div>
        </div>
      </div>
    </article>
  `).join('');
}

function formatSyncMessage(result = {}) {
  if (result.skipped) return 'Chưa cấu hình link Google Sheet hoặc CSV để sync';

  const fragments = [`Đã đọc ${result.importedCount || 0} dòng CSV`];
  if (typeof result.addedCount === 'number') {
    fragments.push(`thêm ${result.addedCount} link mới`);
  }
  if (result.duplicateCount) {
    fragments.push(`bỏ qua ${result.duplicateCount} link trùng`);
  }
  return fragments.join(', ');
}

function setButtonBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('loading', busy);
}

function renderThumbnail(link) {
  const image = link?.preview?.thumbnail;
  if (image) {
    return `<img src="${escapeAttr(image)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">`;
  }

  const icon = link?.preview?.favicon;
  if (icon) {
    return `<img src="${escapeAttr(icon)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">`;
  }

  const category = (link?.category || '').toLowerCase();
  if (category === 'sheet') {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-weight:800;font-size:22px;border-radius:8px">SHEET</div>`;
  }

  const host = getPreviewHost(link);
  const letter = host ? host.replace('www.', '').charAt(0).toUpperCase() : 'L';
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${color};color:#fff;font-weight:800;font-size:32px;border-radius:8px">${letter}</div>`;
}

function filterLinks(items, filterKey) {
  if (!Array.isArray(items)) return [];
  if (!filterKey || filterKey === 'all') return [...items];
  return items.filter((item) => (item?.category || 'auto') === filterKey);
}

function getCategoryLabel(category) {
  const key = (category || 'auto').toLowerCase();
  const map = {
    auto: 'Tự động',
    work: 'Công việc',
    study: 'Học tập',
    tool: 'Tool/Dev',
    sheet: 'Sheet/Excel',
    social: 'Mạng XH',
    other: 'Khác'
  };
  return map[key] || 'Tự động';
}

function sortLinks(items, sortKey) {
  const next = [...items];

  return next.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;

    if (sortKey === 'latest') {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    }

    if (sortKey === 'name') {
      return a.name.localeCompare(b.name, 'vi');
    }

    if (!!a.read !== !!b.read) return a.read ? 1 : -1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function getPreviewHost(link) {
  return link?.preview?.hostname || safeHost(link?.url);
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return '';
  }
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(value) {
  if (!value) return '--';
  const date = new Date(value);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

module.exports = { init, load };