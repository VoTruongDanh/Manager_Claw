function createNavigator({ ui, views, onViewEnter }) {
  function switchView(name) {
    Object.entries(views).forEach(([key, element]) => {
      if (!element) return;

      element.style.display = key === name ? '' : 'none';
      if (key === name) {
        element.classList.remove('view-enter');
        void element.offsetWidth;
        element.classList.add('view-enter');
      }
    });

    document.querySelectorAll('.nav-item').forEach((element) => element.classList.remove('active'));
    const activeNav = ui.$(`nav-${name}`);
    if (activeNav) activeNav.classList.add('active');

    if (typeof onViewEnter === 'function') {
      onViewEnter(name);
    }
  }

  function bindNavigation(navMap) {
    // Event delegation: bind click event to document
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[id^="nav-"]');
      if (!target) return;

      const viewName = navMap[target.id];
      if (!viewName) return;

      event.preventDefault();
      event.stopPropagation();
      console.log(`Switching to view: ${viewName}`);
      switchView(viewName);
    }, true);
  }

  return { bindNavigation, switchView };
}

module.exports = { createNavigator };
