// Collapsible log panel + filter logic
const { $, logUnread } = require('../ui');

function initLogPanels(names) {
  names.forEach(name => {
    const logEl    = $(`${name}-log`);
    const header   = $(`${name}-log-header`);
    const chevron  = $(`${name}-log-chevron`);
    const unreadEl = $(`${name}-log-unread`);
    const collapsed = localStorage.getItem(`log-collapsed-${name}`) === 'true';

    logEl.classList.add(collapsed ? 'collapsed' : 'expanded');
    if (collapsed) chevron.classList.add('collapsed');

    header.addEventListener('click', (e) => {
      if (e.target.closest('.log-filters') || e.target.closest(`#clear-${name}-log`)) return;
      const isCollapsed = logEl.classList.contains('collapsed');
      logEl.classList.toggle('collapsed', !isCollapsed);
      logEl.classList.toggle('expanded', isCollapsed);
      chevron.classList.toggle('collapsed', !isCollapsed);
      localStorage.setItem(`log-collapsed-${name}`, String(!isCollapsed));
      if (isCollapsed) {
        logUnread[name] = 0;
        if (unreadEl) { unreadEl.style.display = 'none'; unreadEl.textContent = ''; }
      }
    });
  });
}

function initLogFilters() {
  document.querySelectorAll('.log-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const logId  = btn.dataset.log;
      const filter = btn.dataset.filter;
      const logEl  = $(logId);

      btn.closest('.log-filters').querySelectorAll('.log-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      logEl.querySelectorAll('.log-line').forEach(line => {
        line.style.display = (filter === 'all' || line.querySelector(`.log-${filter}`)) ? '' : 'none';
      });
    });
  });
}

module.exports = { initLogPanels, initLogFilters };
