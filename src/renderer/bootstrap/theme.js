function initThemeToggle({ root, storage, toggleButton }) {
  const savedTheme = storage.getItem('theme') || 'light';
  root.setAttribute('data-theme', savedTheme);

  if (!toggleButton) return savedTheme;

  toggleButton.addEventListener('click', () => {
    const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', nextTheme);
    storage.setItem('theme', nextTheme);
  });

  return savedTheme;
}

module.exports = { initThemeToggle };
