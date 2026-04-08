const { $, escapeHtml } = require('../ui');

const ICON = {
  play:  `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3l8 5-8 5V3z"/></svg>`,
  stop:  `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8"/></svg>`,
  rst:   `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 00-.908-.417A4 4 0 118 4a.5.5 0 000-1z"/></svg>`,
  web:   `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/></svg>`,
  view:  `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>`,
  theme: `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>`
};

function init({ ipcRenderer, switchView, loadSettings }) {
  const overlay = $('command-overlay');
  const dialog = overlay.querySelector('.command-dialog');
  const input = $('command-input');
  const list = $('command-list');
  let activeIdx = -1;
  let filtered = [];

  const commands = [
    { label: 'Start 9Router', icon: ICON.play, action: () => { if (!$('start-router').disabled) $('start-router').click(); } },
    { label: 'Stop 9Router', icon: ICON.stop, action: () => { if (!$('stop-router').disabled) $('stop-router').click(); } },
    { label: 'Restart 9Router', icon: ICON.rst, action: () => $('restart-router').click() },
    { label: 'Start OpenClaw', icon: ICON.play, action: () => { if (!$('start-openclaw').disabled) $('start-openclaw').click(); } },
    { label: 'Stop OpenClaw', icon: ICON.stop, action: () => { if (!$('stop-openclaw').disabled) $('stop-openclaw').click(); } },
    { label: 'Restart OpenClaw', icon: ICON.rst, action: () => $('restart-openclaw').click() },
    { label: 'Khởi động tất cả', icon: ICON.play, action: () => $('start-all').click() },
    { label: 'Dừng tất cả', icon: ICON.stop, action: () => $('stop-all').click() },
    { label: 'Mở 9Router Dashboard', icon: ICON.web, action: () => ipcRenderer.send('open-browser', 'http://localhost:20128') },
    { label: 'Mở OpenClaw API', icon: ICON.web, action: () => ipcRenderer.send('open-browser', 'http://127.0.0.1:18789') },
    { label: 'Chuyển sang Dashboard', icon: ICON.view, action: () => switchView('dashboard') },
    { label: 'Chuyển sang Logs', icon: ICON.view, action: () => switchView('logs') },
    { label: 'Chuyển sang Settings', icon: ICON.view, action: () => { switchView('settings'); loadSettings(); } },
    { label: 'Chuyển sang Prompt', icon: ICON.view, action: () => switchView('prompts') },
    { label: 'Chuyển sang Link', icon: ICON.view, action: () => switchView('links') },
    { label: 'Mở Reset', icon: ICON.view, action: () => switchView('idmReset') },
    { label: 'Hẹn giờ tắt máy', icon: ICON.view, action: () => switchView('shutdown') },
    { label: 'Bật/Tắt Dark Mode', icon: ICON.theme, action: () => $('theme-toggle').click() },
    { label: 'Xóa tất cả logs', icon: ICON.stop, action: () => $('clear-all-logs').click() }
  ];

  function highlight(text, query) {
    if (!query) return escapeHtml(text);
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx))
      + '<mark>' + escapeHtml(text.slice(idx, idx + query.length)) + '</mark>'
      + escapeHtml(text.slice(idx + query.length));
  }

  function render(query) {
    filtered = commands.filter(command => command.label.toLowerCase().includes(query.toLowerCase()));
    activeIdx = filtered.length > 0 ? 0 : -1;
    list.innerHTML = filtered.length === 0
      ? '<li class="command-empty">Không tìm thấy lệnh</li>'
      : filtered.map((command, index) => `
          <li class="command-item${index === 0 ? ' active' : ''}" data-idx="${index}" role="option">
            <span class="command-item-icon">${command.icon}</span>
            <span>${highlight(command.label, query)}</span>
          </li>
        `).join('');

    list.querySelectorAll('.command-item').forEach((item) => {
      item.addEventListener('mouseenter', () => {
        activeIdx = Number(item.dataset.idx);
        updateActive();
      });
      item.addEventListener('click', () => {
        filtered[Number(item.dataset.idx)]?.action();
        close();
      });
    });
  }

  function updateActive() {
    list.querySelectorAll('.command-item').forEach((el, index) => {
      el.classList.toggle('active', index === activeIdx);
    });
    list.querySelector('.command-item.active')?.scrollIntoView({ block: 'nearest' });
  }

  function open() {
    overlay.style.display = 'flex';
    dialog.classList.remove('closing');
    input.value = '';
    render('');
    input.focus();
  }

  function close() {
    dialog.classList.add('closing');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 150);
  }

  input.addEventListener('input', () => render(input.value));
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  document.addEventListener('keydown', (event) => {
    if (overlay.style.display !== 'none') {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIdx = Math.min(activeIdx + 1, filtered.length - 1);
        updateActive();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        updateActive();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (activeIdx >= 0) {
          filtered[activeIdx]?.action();
          close();
        }
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        return;
      }
    }

    if (event.ctrlKey && event.key === 'k' && !event.shiftKey) {
      event.preventDefault();
      overlay.style.display !== 'none' ? close() : open();
    }
  });

  return { addCommand: (command) => commands.push(command) };
}

module.exports = { init };
