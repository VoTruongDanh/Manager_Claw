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
    Object.entries(navMap).forEach(([navId, viewName]) => {
      const navElement = ui.$(navId);
      if (!navElement) return;

      navElement.addEventListener('click', (event) => {
        event.preventDefault();
        switchView(viewName);
      });
    });
  }

  return { bindNavigation, switchView };
}

module.exports = { createNavigator };
