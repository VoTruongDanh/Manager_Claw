const { spawn, exec } = require('child_process');
const http = require('http');

// ─── Registry of running processes ───────────────────────────────────────────
const processes = {};

const processInfo = {
  router:   { pid: null, startTime: null, port: 20128, externalPid: null },
  openclaw: { pid: null, startTime: null, port: 18789, externalPid: null }
};

// ─── Port check ───────────────────────────────────────────────────────────────
function checkPort(port) {
  return new Promise((resolve) => {
    exec(`netstat -ano | findstr ":${port} " | findstr "LISTENING"`, (err, stdout) => {
      if (stdout && stdout.trim()) {
        const pid = parseInt(stdout.trim().split(/\s+/).pop());
        resolve({ listening: true, pid: isNaN(pid) ? null : pid });
      } else {
        resolve({ listening: false, pid: null });
      }
    });
  });
}

// ─── Status snapshot ──────────────────────────────────────────────────────────
async function getStatus() {
  const [routerPort, openclawPort] = await Promise.all([
    checkPort(processInfo.router.port),
    checkPort(processInfo.openclaw.port)
  ]);

  for (const [key, portResult] of [['router', routerPort], ['openclaw', openclawPort]]) {
    if (portResult.listening) {
      processInfo[key].pid = portResult.pid;
      if (!processInfo[key].startTime) processInfo[key].startTime = Date.now();
      processInfo[key].externalPid = !processes[key] ? portResult.pid : null;
    } else if (!processes[key]) {
      processInfo[key].pid = null;
      processInfo[key].startTime = null;
      processInfo[key].externalPid = null;
    }
  }

  return {
    router: {
      running: routerPort.listening || !!processes.router,
      pid: processInfo.router.pid,
      startTime: processInfo.router.startTime,
      port: processInfo.router.port,
      external: !!processInfo.router.externalPid
    },
    openclaw: {
      running: openclawPort.listening || !!processes.openclaw,
      pid: processInfo.openclaw.pid,
      startTime: processInfo.openclaw.startTime,
      port: processInfo.openclaw.port,
      external: !!processInfo.openclaw.externalPid
    }
  };
}

// ─── Spawn ────────────────────────────────────────────────────────────────────
function spawnService({ key, label, cmd, args, statusCh, logCh, onStatus, onLog, onCrash }) {
  if (processes[key] && processes[key].pid) {
    onStatus({ running: true, message: `${label} đang chạy`, pid: processes[key].pid, startTime: processInfo[key].startTime, port: processInfo[key].port });
    return;
  }

  try {
    const proc = spawn(cmd, args, { windowsHide: true, detached: false, shell: true });
    processes[key] = proc;
    processInfo[key].pid = proc.pid;
    processInfo[key].startTime = Date.now();

    const startTimeout = setTimeout(async () => {
      const check = await checkPort(processInfo[key].port);
      if (!check.listening) {
        onStatus({ running: false, error: true, message: `${label} không khởi động được. Kiểm tra: npm list -g ${cmd}` });
      }
    }, 3000);

    proc.stdout.on('data', (d) => { clearTimeout(startTimeout); onLog(d.toString()); });
    proc.stderr.on('data', (d) => onLog(`ERROR: ${d.toString()}`));

    proc.on('error', (err) => {
      clearTimeout(startTimeout);
      processes[key] = null;
      processInfo[key].pid = null;
      processInfo[key].startTime = null;
      onStatus({ running: false, error: true, message: `Lỗi: ${err.message}` });
    });

    proc.on('close', (code) => {
      clearTimeout(startTimeout);
      processes[key] = null;
      processInfo[key].pid = null;
      processInfo[key].startTime = null;
      const crashed = code !== 0 && code !== null;
      onStatus({ running: false, message: code === 0 ? `${label} đã dừng` : `${label} dừng với lỗi (code: ${code})`, error: crashed });
      if (crashed) onCrash && onCrash(label, code);
    });

    onStatus({ running: true, message: `${label} đang khởi động...`, pid: proc.pid, startTime: processInfo[key].startTime, port: processInfo[key].port });
  } catch (err) {
    onStatus({ running: false, error: true, message: `Không thể khởi động: ${err.message}` });
  }
}

// ─── Stop ─────────────────────────────────────────────────────────────────────
function stopService({ key, label, onStatus }) {
  const proc = processes[key];
  const extPid = processInfo[key].externalPid;

  if (proc) {
    try { proc.kill('SIGTERM'); } catch (e) { exec(`taskkill /PID ${proc.pid} /F /T`, () => {}); }
    processes[key] = null;
    processInfo[key].pid = null;
    processInfo[key].startTime = null;
    onStatus({ running: false, message: `${label} đã dừng` });
  } else if (extPid) {
    exec(`taskkill /PID ${extPid} /F /T`, (err) => {
      if (!err) {
        processInfo[key].pid = null;
        processInfo[key].startTime = null;
        processInfo[key].externalPid = null;
        onStatus({ running: false, message: `${label} đã dừng (PID ${extPid})` });
      } else {
        onStatus({ running: false, error: true, message: `Không thể dừng ${label}: ${err.message}` });
      }
    });
  } else {
    onStatus({ running: false, message: `${label} không chạy` });
  }
}

// ─── Update (npm install -g) ──────────────────────────────────────────────────
function updatePackage({ pkg, label, onProgress, onDone }) {
  const proc = spawn('cmd.exe', ['/c', 'npm', 'install', '-g', pkg], { windowsHide: true });
  proc.stdout.on('data', (d) => onProgress({ label, message: d.toString() }));
  proc.stderr.on('data', (d) => onProgress({ label, message: d.toString() }));
  proc.on('close', (code) => onDone({ success: code === 0, label, code }));
}

function killAll() {
  if (processes.router)   try { processes.router.kill();   } catch (e) {}
  if (processes.openclaw) try { processes.openclaw.kill(); } catch (e) {}
}

module.exports = { getStatus, spawnService, stopService, updatePackage, killAll };
