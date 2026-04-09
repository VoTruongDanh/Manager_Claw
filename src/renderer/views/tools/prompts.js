const { ipcRenderer, clipboard } = require('electron');
const ui = require('../../ui');

let prompts = [];
let editingId = null;

function init() {
  const form = ui.$('prompt-form');
  if (!form) return;

  form.addEventListener('submit', handleSubmit);
  ui.$('prompt-cancel-btn').addEventListener('click', () => {
    resetForm();
    closeModal();
  });
  ui.$('prompt-list').addEventListener('click', handleListClick);

  const openBtn = ui.$('prompt-open-modal-btn');
  const closeBtn = ui.$('prompt-modal-close-btn');
  const modal = ui.$('prompt-modal');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      resetForm();
      openModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      resetForm();
      closeModal();
    });
  }

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        resetForm();
        closeModal();
      }
    });
  }

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
    closeModal();
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
    ui.$('prompt-form-title').textContent = 'Chỉnh sửa';
    ui.$('prompt-submit-label').textContent = 'Lưu thay đổi';
    openModal();
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
  ui.$('prompt-form-title').textContent = 'Tên prompt';
  ui.$('prompt-submit-label').textContent = 'Lưu prompt';
}

function render() {
  const list = ui.$('prompt-list');
  const total = prompts.length;
  ui.$('prompt-count').textContent = `${total} prompt`;

  if (!total) {
    list.innerHTML = `
      <div class="library-empty">
        <div class="library-empty-icon">
          <svg width="32" height="32" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h7a1 1 0 000-2H4V5h12v3a1 1 0 102 0V5a2 2 0 00-2-2H4z"/>
            <path d="M15 10a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z"/>
            <path d="M6 8a1 1 0 011-1h5a1 1 0 010 2H7A1 1 0 016 8zm0 4a1 1 0 011-1h3a1 1 0 010 2H7a1 1 0 01-1-1z"/>
          </svg>
        </div>
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
          <h3>${ui.escapeHtml(prompt.name)}</h3>
          <p class="library-meta">${formatDate(prompt.updatedAt)}</p>
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

function openModal() {
  const modal = ui.$('prompt-modal');
  if (!modal) return;
  modal.style.display = 'flex';
}

function closeModal() {
  const modal = ui.$('prompt-modal');
  if (!modal) return;
  modal.style.display = 'none';
}

module.exports = { init, load };
