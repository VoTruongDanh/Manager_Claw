// Trạng thái runtime của các services — single source of truth cho renderer
const state = {
  router:   { running: false, startTime: null, pid: null, external: false },
  openclaw: { running: false, startTime: null, pid: null, external: false }
};

module.exports = state;
