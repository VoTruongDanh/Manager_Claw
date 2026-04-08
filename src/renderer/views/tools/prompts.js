const { ipcRenderer, clipboard } = require('electron');
const ui = require('../../ui');

let prompts = [];
let editingId = null;

function init() {
  const form = ui.$('prompt-form');
  if (!form) return;

  form.addEventListener('submit', handleSubmit);
  ui.$('prompt-cancel-btn').addEventListener('click', resetForm);
  ui.$('prompt-refresh-btn').addEventListener('click', load);
  ui.$('prompt-list').addEventListener('click', handleListClick);

  load();
}

async function load() {
  try {
    const data = await ipcRenderer.invoke('library-get-all');
    prompts = Array.isArray(data.prompts) ? data.prompts : [];
    render();
  } catch (error) {
    ui.showToast(`Không tải được Prompt: ${error.message}`, 'error');
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const name = ui.$('prompt-name').value.trim();
  const content = ui.$('prompt-content').value.trim();

  try {
    const wasEditing = !!editingId;
    const result = await ipcRenderer.invoke('prompt-save', {
      id: editingId,
      name,
      content
    });

    prompts = result.prompts || [];
    render();
    resetForm();
    ui.showToast(wasEditing ? 'Đã cập nhật prompt' : 'Đã lưu prompt', 'success');
  } catch (error) {
    ui.showToast(error.message, 'error');
  }
}

async function handleListClick(event) {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;

  const card = actionEl.closest('.library-item');
  if (!card) return;

  const prompt = prompts.find(item => item.id === card.dataset.id);
  if (!prompt) return;

  const action = actionEl.dataset.action;

  if (action === 'copy') {
    clipboard.writeText(prompt.content);
    ui.showToast(`Đã copy prompt "${prompt.name}"`, 'success');
    return;
  }

  if (action === 'edit') {
    editingId = prompt.id;
    ui.$('prompt-name').value = prompt.name;
    ui.$('prompt-content').value = prompt.content;
    ui.$('prompt-form-title').textContent = 'Chỉnh sửa prompt';
    ui.$('prompt-form-desc').textContent = 'Cập nhật tên và nội dung rồi lưu lại.';
    ui.$('prompt-submit-label').textContent = 'Lưu thay đổi';
    ui.$('prompt-cancel-btn').style.display = 'inline-flex';
    ui.$('prompt-name').focus();
    return;
  }

  if (action === 'delete') {
    if (!confirm(`Xóa prompt "${prompt.name}"?`)) return;

    try {
      const result = await ipcRenderer.invoke('prompt-delete', prompt.id);
      prompts = result.prompts || [];
      if (editingId === prompt.id) resetForm();
      render();
      ui.showToast('Đã xóa prompt', 'success');
    } catch (error) {
      ui.showToast(error.message, 'error');
    }
  }
}

function resetForm() {
  editingId = null;
  ui.$('prompt-form').reset();
  ui.$('prompt-form-title').textContent = 'Tạo prompt mới';
  ui.$('prompt-form-desc').textContent = 'Lưu prompt dùng nhiều lần để copy nhanh khi cần.';
  ui.$('prompt-submit-label').textContent = 'Lưu prompt';
  ui.$('prompt-cancel-btn').style.display = 'none';
}

function render() {
  const list = ui.$('prompt-list');
  const total = prompts.length;
  ui.$('prompt-count').textContent = `${total} prompt`;

  if (!total) {
    list.innerHTML = `
      <div class="library-empty">
        <div class="library-empty-icon">P</div>
        <h3>Chưa có prompt nào</h3>
        <p>Tạo prompt đầu tiên để lưu các mẫu dùng lặp lại, copy nhanh hơn và dễ quản lý hơn.</p>
      </div>
    `;
    return;
  }

  const sorted = [...prompts].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  list.innerHTML = sorted.map((prompt) => `
    <article class="library-item" data-id="${prompt.id}">
      <div class="library-item-main">
        <div class="library-item-head">
          <div>
            <h3>${ui.escapeHtml(prompt.name)}</h3>
            <p class="library-meta">Cập nhật ${formatDate(prompt.updatedAt)}${prompt.createdAt !== prompt.updatedAt ? ` • Tạo ${formatDate(prompt.createdAt)}` : ''}</p>
          </div>
          <span class="badge badge-secondary">Prompt</span>
        </div>
        <pre class="library-content">${ui.escapeHtml(prompt.content)}</pre>
      </div>
      <div class="library-actions">
        <button class="btn btn-secondary btn-sm" data-action="copy">Copy</button>
        <button class="btn btn-secondary btn-sm" data-action="edit">Sửa</button>
        <button class="btn btn-danger btn-sm" data-action="delete">Xóa</button>
      </div>
    </article>
  `).join('');
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
