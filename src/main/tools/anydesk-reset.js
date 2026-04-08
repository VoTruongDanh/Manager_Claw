const { exec } = require('child_process');
const path = require('path');
const fs   = require('fs');

// AnyDesk lưu ID trong system.conf tại %PROGRAMDATA%\AnyDesk
// user.conf (tài khoản liên kết) tại %APPDATA%\AnyDesk
const PROGRAMDATA_DIR = process.env.PROGRAMDATA || 'C:\\ProgramData';
const APPDATA_DIR     = process.env.APPDATA;

const SYSTEM_CONF     = path.join(PROGRAMDATA_DIR, 'AnyDesk', 'system.conf');
const SERVICE_CONF    = path.join(PROGRAMDATA_DIR, 'AnyDesk', 'service.conf');
const USER_CONF       = path.join(APPDATA_DIR,     'AnyDesk', 'user.conf');

function run(cmd) {
  return new Promise(resolve => exec(cmd, () => resolve()));
}

function readFile(p) {
  try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; } catch (_) { return null; }
}

/**
 * Lấy AnyDesk ID từ system.conf (%PROGRAMDATA%\AnyDesk\system.conf)
 * Dòng: ad.anynet.id=1400134884
 */
function getAnyDeskId() {
  const content = readFile(SYSTEM_CONF);
  if (!content) return null;
  const m = content.match(/^ad\.anynet\.id\s*=\s*(\d+)/m);
  return m ? m[1] : null;
}

function formatId(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/\D/g, '');
  // Format 9 chữ số → "123 456 789"
  if (s.length === 9) return `${s.slice(0,3)} ${s.slice(3,6)} ${s.slice(6)}`;
  if (s.length === 10) return `${s.slice(0,3)} ${s.slice(3,6)} ${s.slice(6)}`;
  return s;
}

/** Kiểm tra AnyDesk đang chạy + lấy ID */
function checkAnyDeskRunning() {
  return new Promise(resolve => {
    exec('tasklist /FI "IMAGENAME eq AnyDesk.exe" /NH', (err, stdout) => {
      const running = !err && stdout.toLowerCase().includes('anydesk.exe');
      const rawId   = getAnyDeskId();
      resolve({
        running,
        id:    formatId(rawId),
        rawId,
        hasSystemConf: fs.existsSync(SYSTEM_CONF),
      });
    });
  });
}

/**
 * Reset AnyDesk ID:
 * 1. Kill AnyDesk
 * 2. Backup user.conf (tài khoản liên kết) vào memory
 * 3. Xóa service.conf + system.conf (reset ID)
 * 4. Restore user.conf
 */
async function resetAnyDeskId() {
  try {
    // Step 1: Kill
    await run('taskkill /F /IM AnyDesk.exe /T');
    await new Promise(r => setTimeout(r, 1000));

    // Step 2: Backup user.conf
    const userConfData = readFile(USER_CONF);

    // Step 3: Xóa service.conf và system.conf để reset ID
    for (const f of [SERVICE_CONF, SYSTEM_CONF]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
    }

    // Step 4: Restore user.conf (giữ tài khoản liên kết)
    if (userConfData !== null) {
      try {
        fs.mkdirSync(path.dirname(USER_CONF), { recursive: true });
        fs.writeFileSync(USER_CONF, userConfData, 'utf8');
      } catch (_) {}
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { checkAnyDeskRunning, resetAnyDeskId };
