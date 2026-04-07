const ui = require('../ui');

function init() {
  ui.$('clear-all-logs').addEventListener('click', () => {
    ui.clearLog(ui.$('combined-log'));
    ui.clearLog(ui.$('router-log'));
    ui.clearLog(ui.$('openclaw-log'));
  });
}

module.exports = { init };
