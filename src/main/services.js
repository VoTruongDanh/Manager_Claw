const { spawn, exec } = require('child_process');

const processes = {};
const serviceConfigs = {};
const serviceHooks = {};
const autoHealHistory = {};

const processInfo = {
  router: {
    pid: null,
    startTime: null,
    port: 20128,
    externalPid: null,
    expectedRunning: false,
    stopping: false,
    unresponsiveSince: null
  },
  openclaw: {
    pid: null,
    startTime: null,
    port: 18789,
    externalPid: null,
    expectedRunning: false,
    stopping: false,
    unresponsiveSince: null
  }
};

let autoHealEnabled = false;
let monitorTimer = null;

function checkPort(port) {
  return new Promise((resolve) => {
    exec(`netstat -ano | findstr ":${port} " | findstr "LISTENING"`, (err, stdout) => {
      if (stdout && stdout.trim()) {
        const pid = parseInt(stdout.trim().split(/\s+/).pop(), 10);
        resolve({ listening: true, pid: Number.isNaN(pid) ? null : pid });
      } else {
        resolve({ listening: false, pid: null });
      }
    });
  });
}

function getHooks(key) {
  return serviceHooks[key] || {};
}

function emitStatus(key, payload) {
  getHooks(key).onStatus && getHooks(key).onStatus(payload);
}

function emitLog(key, message) {
  getHooks(key).onLog && getHooks(key).onLog(message);
}

function emitCrash(key, label, code) {
  getHooks(key).onCrash && getHooks(key).onCrash(label, code);
}

function emitAutoHeal(key, label, reason, attempt) {
  getHooks(key).onAutoHeal && getHooks(key).onAutoHeal(label, reason, attempt);
}

function rememberConfig(config) {
  if (!config || !config.key) return null;
  serviceConfigs[config.key] = { ...(serviceConfigs[config.key] || {}), ...config };
  if (!autoHealHistory[config.key]) autoHealHistory[config.key] = [];
  return serviceConfigs[config.key];
}

function resetRuntime(key, { clearExpectation = false } = {}) {
  processes[key] = null;
  processInfo[key].pid = null;
  processInfo[key].startTime = null;
  processInfo[key].externalPid = null;
  processInfo[key].stopping = false;
  processInfo[key].unresponsiveSince = null;
  if (clearExpectation) processInfo[key].expectedRunning = false;
}

function canAutoHeal(key) {
  const now = Date.now();
  autoHealHistory[key] = (autoHealHistory[key] || []).filter((ts) => now - ts < 60 * 60 * 1000);
  return autoHealHistory[key].length < 3;
}

function registerAutoHeal(key) {
  autoHealHistory[key] = (autoHealHistory[key] || []).filter((ts) => Date.now() - ts < 60 * 60 * 1000);
  autoHealHistory[key].push(Date.now());
  return autoHealHistory[key].length;
}

async function attemptAutoHeal(key, reason) {
  const cfg = serviceConfigs[key];
  if (!cfg || !autoHealEnabled || !processInfo[key].expectedRunning) return false;

  if (!canAutoHeal(key)) {
    emitLog(key, `[auto-heal] Bo qua ${cfg.label}: da restart 3 lan trong 1 gio`);
    processInfo[key].unresponsiveSince = Date.now();
    return false;
  }

  const attempt = registerAutoHeal(key);
  emitLog(key, `[auto-heal] Restart ${cfg.label} (${reason}) [${attempt}/3]`);
  emitAutoHeal(key, cfg.label, reason, attempt);
  restartService({ key, reason: 'auto-heal', silentStopStatus: true });
  return true;
}

function registerService(config, hooks = {}) {
  rememberConfig(config);
  serviceHooks[config.key] = { ...(serviceHooks[config.key] || {}), ...hooks };
  ensureMonitor();
}

async function getStatus() {
  const keys = Object.keys(processInfo);
  const portChecks = await Promise.all(keys.map((key) => checkPort(processInfo[key].port)));

  keys.forEach((key, index) => {
    const portResult = portChecks[index];
    const info = processInfo[key];

    if (portResult.listening) {
      info.pid = portResult.pid;
      if (!info.startTime) info.startTime = Date.now();
      info.externalPid = !processes[key] ? portResult.pid : null;
      info.unresponsiveSince = null;
    } else if (!processes[key] && !info.expectedRunning) {
      resetRuntime(key, { clearExpectation: false });
    }
  });

  return {
    router: {
      running: portChecks[0].listening || !!processes.router,
      pid: processInfo.router.pid,
      startTime: processInfo.router.startTime,
      port: processInfo.router.port,
      external: !!processInfo.router.externalPid
    },
    openclaw: {
      running: portChecks[1].listening || !!processes.openclaw,
      pid: processInfo.openclaw.pid,
      startTime: processInfo.openclaw.startTime,
      port: processInfo.openclaw.port,
      external: !!processInfo.openclaw.externalPid
    }
  };
}

function spawnService(config = {}) {
  const cfg = rememberConfig(config.cmd ? config : { ...(serviceConfigs[config.key] || {}), ...config });
  if (!cfg || !cfg.key || !cfg.cmd) return;

  if (processes[cfg.key] && processes[cfg.key].pid) {
    emitStatus(cfg.key, {
      running: true,
      message: `${cfg.label} dang chay`,
      pid: processes[cfg.key].pid,
      startTime: processInfo[cfg.key].startTime,
      port: processInfo[cfg.key].port
    });
    return;
  }

  try {
    processInfo[cfg.key].expectedRunning = config.expectedRunning !== false;
    processInfo[cfg.key].stopping = false;
    processInfo[cfg.key].externalPid = null;
    processInfo[cfg.key].unresponsiveSince = null;

    const proc = spawn(cfg.cmd, cfg.args || [], {
      windowsHide: true,
      detached: false,
      shell: true
    });

    processes[cfg.key] = proc;
    processInfo[cfg.key].pid = proc.pid;
    processInfo[cfg.key].startTime = Date.now();

    // OpenClaw cần thời gian khởi động lâu hơn (5-6s), Router nhanh hơn (2-3s)
    const startTimeoutDuration = cfg.key === 'openclaw' ? 8000 : 3000;
    const startTimeout = setTimeout(async () => {
      const check = await checkPort(processInfo[cfg.key].port);
      if (!check.listening) {
        emitStatus(cfg.key, {
          running: false,
          error: true,
          message: `${cfg.label} khong khoi dong duoc. Kiem tra: npm list -g ${cfg.cmd}`
        });
      }
    }, startTimeoutDuration);

    proc.stdout.on('data', (data) => {
      clearTimeout(startTimeout);
      processInfo[cfg.key].unresponsiveSince = null;
      emitLog(cfg.key, data.toString());
    });

    proc.stderr.on('data', (data) => {
      emitLog(cfg.key, `ERROR: ${data.toString()}`);
    });

    proc.on('error', (err) => {
      clearTimeout(startTimeout);
      resetRuntime(cfg.key, { clearExpectation: false });
      emitStatus(cfg.key, { running: false, error: true, message: `Loi: ${err.message}` });
    });

    proc.on('close', (code) => {
      clearTimeout(startTimeout);
      const wasStopping = processInfo[cfg.key].stopping;
      const shouldAutoHeal = processInfo[cfg.key].expectedRunning && !wasStopping;
      resetRuntime(cfg.key, { clearExpectation: false });

      if (!wasStopping) {
        const crashed = code !== 0 && code !== null;
        emitStatus(cfg.key, {
          running: false,
          error: crashed,
          message: code === 0 ? `${cfg.label} da dung` : `${cfg.label} dung voi loi (code: ${code})`
        });
        if (crashed) emitCrash(cfg.key, cfg.label, code);
      }

      if (shouldAutoHeal) {
        attemptAutoHeal(cfg.key, code === 0 ? 'dung bat ngo' : `crash code ${code}`);
      }
    });

    emitStatus(cfg.key, {
      running: true,
      message: `${cfg.label} dang khoi dong...`,
      pid: proc.pid,
      startTime: processInfo[cfg.key].startTime,
      port: processInfo[cfg.key].port
    });
  } catch (err) {
    emitStatus(cfg.key, {
      running: false,
      error: true,
      message: `Khong the khoi dong: ${err.message}`
    });
  }
}

function stopService({ key, keepExpectedRunning = false, silentStatus = false } = {}) {
  const cfg = serviceConfigs[key];
  if (!cfg) return;

  const proc = processes[key];
  const extPid = processInfo[key].externalPid;

  processInfo[key].expectedRunning = keepExpectedRunning;
  processInfo[key].stopping = !!proc;
  processInfo[key].unresponsiveSince = null;

  if (proc) {
    try {
      proc.kill('SIGTERM');
    } catch (err) {
      exec(`taskkill /PID ${proc.pid} /F /T`, () => {});
    }

    if (!silentStatus) {
      emitStatus(key, { running: false, message: `${cfg.label} da dung` });
    }
    return;
  }

  processInfo[key].stopping = false;

  if (extPid) {
    exec(`taskkill /PID ${extPid} /F /T`, (err) => {
      if (!err) {
        resetRuntime(key, { clearExpectation: !keepExpectedRunning });
        if (!silentStatus) emitStatus(key, { running: false, message: `${cfg.label} da dung (PID ${extPid})` });
      } else if (!silentStatus) {
        emitStatus(key, {
          running: false,
          error: true,
          message: `Khong the dung ${cfg.label}: ${err.message}`
        });
      }
    });
  } else if (!silentStatus) {
    emitStatus(key, { running: false, message: `${cfg.label} khong chay` });
  }
}

function restartService({ key, reason = 'manual', silentStopStatus = false } = {}) {
  const cfg = serviceConfigs[key];
  if (!cfg) return;

  processInfo[key].expectedRunning = true;
  processInfo[key].unresponsiveSince = null;

  const hasLiveProcess = !!processes[key] || !!processInfo[key].externalPid;
  if (reason === 'manual') {
    emitLog(key, `Dang restart ${cfg.label}...`);
  }

  if (hasLiveProcess) {
    stopService({ key, keepExpectedRunning: true, silentStatus: silentStopStatus });
    setTimeout(() => spawnService({ key, expectedRunning: true }), 1500);
  } else {
    spawnService({ key, expectedRunning: true });
  }
}

function updatePackage({ pkg, label, onProgress, onDone }) {
  const proc = spawn('cmd.exe', ['/c', 'npm', 'install', '-g', pkg], { windowsHide: true });
  proc.stdout.on('data', (data) => onProgress({ label, message: data.toString() }));
  proc.stderr.on('data', (data) => onProgress({ label, message: data.toString() }));
  proc.on('close', (code) => onDone({ success: code === 0, label, code }));
}

function setAutoHealEnabled(enabled) {
  autoHealEnabled = !!enabled;
}

async function monitorServices() {
  if (!autoHealEnabled) return;

  const entries = Object.entries(processInfo);
  const checks = await Promise.all(entries.map(([, info]) => checkPort(info.port)));

  for (let index = 0; index < entries.length; index += 1) {
    const [key, info] = entries[index];
    const portResult = checks[index];

    if (!info.expectedRunning) {
      info.unresponsiveSince = null;
      continue;
    }

    if (portResult.listening) {
      info.unresponsiveSince = null;
      continue;
    }

    if (!info.unresponsiveSince) {
      info.unresponsiveSince = Date.now();
      continue;
    }

    if (Date.now() - info.unresponsiveSince >= 30000) {
      info.unresponsiveSince = Date.now();
      await attemptAutoHeal(key, 'khong phan hoi hon 30s');
    }
  }
}

function ensureMonitor() {
  if (monitorTimer) return;
  monitorTimer = setInterval(() => {
    monitorServices().catch(() => {});
  }, 5000);
}

function killAll() {
  autoHealEnabled = false;
  Object.keys(processes).forEach((key) => {
    processInfo[key].expectedRunning = false;
    processInfo[key].stopping = true;
    if (processes[key]) {
      try {
        processes[key].kill();
      } catch (err) {}
    }
  });
}

ensureMonitor();

module.exports = {
  getStatus,
  killAll,
  registerService,
  restartService,
  setAutoHealEnabled,
  spawnService,
  stopService,
  updatePackage
};
