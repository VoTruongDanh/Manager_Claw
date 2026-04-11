const fs = require('fs');
const path = require('path');

function readPartial(rootDir, relativePath) {
  const filePath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(rootDir, relativePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing HTML partial: ${filePath}`);
  }

  return fs.readFileSync(filePath, 'utf8');
}

function mountHtmlPartials({ document, rootDir }) {
  let pass = 0;

  while (true) {
    const placeholders = Array.from(document.querySelectorAll('[data-include]'));
    if (!placeholders.length) return;

    pass += 1;
    if (pass > 20) {
      throw new Error('Nested HTML partials exceeded safe limit');
    }

    placeholders.forEach((node) => {
      const relativePath = node.getAttribute('data-include');
      node.outerHTML = readPartial(rootDir, relativePath);
    });
  }
}

module.exports = { mountHtmlPartials };
