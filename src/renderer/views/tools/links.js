const { ipcRenderer } = require('electron');
const ui = require('../../ui');

let links = [];
let editingId = null;
let currentSort = 'unread';

function init() {
  const form = ui.$('link-form');
  if (!form) return;

  form.addEventListener('submit', handleSubmit);
  ui.$('link-cancel-btn').addEventListener('click', resetForm);
  ui.$('link-refresh-btn').addEventListener('click', load);
  ui.$('link-sort').addEventListener('change', (event) => {
    currentSort = event.target.value;
    render();
  });
  ui.$('link-list').addEventListener('click', handleListClick);

  load();
}

async function load() {
  try {
    const data = await ipcRenderer.invoke('library-get-all');
    links = Array.isArray(data.links) ? data.links : [];
    render();
  } catch (error) {
    ui.showToast(`Không tải được Link: ${error.message}`, 'error');
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const form = ui.$('link-form');
  const submitBtn = form.querySelector('button[type="submit"]');

  try {
    const wasEditing = !!editingId;
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    const result = await ipcRenderer.invoke('link-save', {
      id: editingId,
      name: ui.$('link-name').value.trim(),
      url: ui.$('link-url').value.trim(),
      read: ui.$('link-read').checked
    });

    links = result.links || [];
    render();
    resetForm();
    ui.showToast(wasEditing ? 'Đã cập nhật link' : 'Đã lưu link', 'success');
  } catch (error) {
    ui.showToast(error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
  }
}

async function handleListClick(event) {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  event.preventDefault();

  const card = actionEl.closest('.library-item');
  if (!card) return;

  const link = links.find(item => item.id === card.dataset.id);
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

function resetForm() {
  editingId = null;
  ui.$('link-form').reset();
  ui.$('link-form-title').textContent = 'Lưu link mới';
  ui.$('link-form-desc').textContent = 'Lưu link với title/favicon để quét nhanh trong danh sách.';
  ui.$('link-submit-label').textContent = 'Lưu link';
  ui.$('link-cancel-btn').style.display = 'none';
}

function render() {
  const list = ui.$('link-list');
  const unreadCount = links.filter(item => !item.read).length;
  ui.$('link-count').textContent = `${links.length} link`;
  ui.$('link-unread-count').textContent = `${unreadCount} chưa đọc`;

  if (!links.length) {
    list.innerHTML = `
      <div class="library-empty">
        <div class="library-empty-icon">L</div>
        <h3>Chưa có link nào</h3>
        <p>Lưu link cần đọc, ghim link quan trọng lên trên và xem nhanh title/favicon ngay trong danh sách.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = sortLinks(links, currentSort).map((link) => `
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
          <span class="badge ${link.read ? 'badge-secondary' : 'badge-warning'}">${link.read ? 'Đã đọc' : 'Chưa đọc'}</span>
        </div>
        <a href="#" class="library-link" data-action="open">${ui.escapeHtml(link.url)}</a>
        <div class="library-meta-row">
          <span class="library-meta">${ui.escapeHtml(getPreviewHost(link))}</span>
          <span class="library-meta">Cập nhật ${formatDate(link.updatedAt)}</span>
        </div>
      </div>
      <div class="library-actions">
        <button class="btn-icon library-pin-btn ${link.pinned ? 'is-active' : ''}" data-action="toggle-pin" title="${link.pinned ? 'Bỏ ghim' : 'Ghim'}">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="${link.pinned ? 'currentColor' : 'none'}" stroke="currentColor">
            <path d="M10 2l2.5 5 5.5.5-4 3.5 1 5.5-5-3-5 3 1-5.5-4-3.5 5.5-.5L10 2z"/>
          </svg>
        </button>
        <button class="btn btn-secondary btn-sm" data-action="toggle-read">${link.read ? 'Chưa đọc' : 'Xong'}</button>
        <button class="btn-icon btn-secondary btn-sm" data-action="edit">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
        </button>
        <button class="btn-icon btn-danger btn-sm" data-action="delete">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </article>
  `).join('');
}

function renderThumbnail(link) {
  const icon = link?.preview?.favicon;
  if (icon) {
    return `<img src="${escapeAttr(icon)}" alt="" loading="lazy">`;
  }
  const host = getPreviewHost(link);
  const letter = host ? host.replace('www.', '').charAt(0).toUpperCase() : 'L';
  return `<span style="font-weight:700;color:var(--text-3);font-size:18px">${letter}</span>`;
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

function getPreviewTitle(link) {
  return link?.preview?.title || link?.name || link?.preview?.hostname || 'Không có preview';
}

function getPreviewHost(link) {
  return link?.preview?.hostname || safeHost(link?.url);
}

function renderPreviewIcon(link) {
  const icon = link?.preview?.favicon;
  if (icon) {
    return `<img class="link-preview-icon" src="${escapeAttr(icon)}" alt="" loading="lazy">`;
  }

  const fallback = getPreviewHost(link).slice(0, 1).toUpperCase() || 'L';
  return `<span class="link-preview-icon is-fallback">${ui.escapeHtml(fallback)}</span>`;
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
  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

module.exports = { init, load };
