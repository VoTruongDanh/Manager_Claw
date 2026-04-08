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

  try {
    const wasEditing = !!editingId;
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
    ui.$('link-form-desc').textContent = 'Cập nhật link và trạng thái đọc để theo dõi dễ hơn.';
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
  ui.$('link-form-desc').textContent = 'Gom link cần đọc vào một chỗ, có trạng thái để xử lý nhanh.';
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
        <p>Lưu lại các link cần đọc, đánh dấu nhanh đã đọc/chưa đọc và sắp xếp theo cách bạn muốn.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = sortLinks(links, currentSort).map((link) => `
    <article class="library-item ${link.read ? 'is-read' : 'is-unread'}" data-id="${link.id}">
      <div class="library-item-main">
        <div class="library-item-head">
          <div>
            <h3>${ui.escapeHtml(link.name)}</h3>
            <a href="#" class="library-link" data-action="open">${ui.escapeHtml(link.url)}</a>
          </div>
          <span class="badge ${link.read ? 'badge-secondary' : 'badge-warning'}">${link.read ? 'Đã đọc' : 'Chưa đọc'}</span>
        </div>
        <div class="library-meta-row">
          <span class="library-meta">Cập nhật ${formatDate(link.updatedAt)}</span>
          <span class="library-meta">Tạo ${formatDate(link.createdAt)}</span>
        </div>
      </div>
      <div class="library-actions">
        <button class="btn ${link.read ? 'btn-secondary' : 'btn-success'} btn-sm" data-action="toggle-read">${link.read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc'}</button>
        <button class="btn btn-secondary btn-sm" data-action="edit">Sửa</button>
        <button class="btn btn-danger btn-sm" data-action="delete">Xóa</button>
      </div>
    </article>
  `).join('');
}

function sortLinks(items, sortKey) {
  const next = [...items];

  if (sortKey === 'latest') {
    return next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  if (sortKey === 'name') {
    return next.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }

  return next.sort((a, b) => {
    if (!!a.read !== !!b.read) return a.read ? 1 : -1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
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
