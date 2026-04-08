const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const ANYDESK_SERVICE_CONF = path.join(process.env.APPDATA, 'AnyDesk', 'service.conf');
const ANYDESK_USER_CONF    = path.join(process.env.APPDATA, 'AnyDesk', 'user.conf');
const ANYDESK_CONF_DIR     = path.join(process.env.APPDATA, 'AnyDesk');

function run(cmd) {
  return new Promise(resolve => exec(cmd, () => resolve()));
}

function fileExists(p) {
  try { return fs.existsSync(p); } catch (_) { return false; }
}

function readUserConf() {
  try {
    if (fileExists(ANYDESK_USER_CONF)) return fs.readFileSync(ANYDESK_USER_CONF, 'utf8');
  } catch (_) {}
  return null;
}

function writeUserConf(data) {
  try {
    fs.mkdirSync(ANYDESK_CONF_DIR, { recursive: true });
    fs.writeFileSync(ANYDESK_USER_CONF, data, 'utf8');
    return true;
  } catch (_) { return false; }
}

/**
 * Lấy AnyDesk ID hiện tại từ service.conf
 * Dòng có dạng: ad.anynet.id=123456789
 */
function getAnyDeskId() {
  try {
    if (!fileExists(ANYDESK_SERVICE_CONF)) return null;
    const content = fs.readFileSync(ANYDESK_SERVICE_CONF, 'utf8');
    const match = content.match(/ad\.anynet\.id\s*=\s*(\d+)/);
    return match ? match[1] : null;
  } catch (_) { return null; }
}

/**
 * Kiểm tra AnyDesk có đang chạy không
 */
function checkAnyDeskRunning() {
  return new Promise(resolve => {
    exec('tasklist /FI "IMAGENAME eq AnyDesk.exe" /NH', (err, stdout) => {
      const running = !err && stdout.toLowerCase().includes('anydesk.exe');
      const id = getAnyDeskId();
      resolve({ running, id, hasServiceConf: fileExists(ANYDESK_SERVICE_CONF) });
    });
  });
}

/**
 * Reset AnyDesk ID (xóa service.conf) nhưng GIỮ user.conf (data + tài khoản liên kết)
 * 1. Kill AnyDesk
 * 2. Backup user.conf vào memory
 * 3. Xóa service.conf (reset ID)
 * 4. Restore user.conf
 */
async function resetAnyDeskId() {
  try {
    // Step 1: Kill AnyDesk
    await run('taskkill /F /IM AnyDesk.exe /T');
    await new Promise(r => setTimeout(r, 800));

    // Step 2: Backup user.conf
    const userConfBackup = readUserConf();

    // Step 3: Xóa service.conf để reset ID
    if (fileExists(ANYDESK_SERVICE_CONF)) {
      fs.unlinkSync(ANYDESK_SERVICE_CONF);
    }

    // Step 4: Restore user.conf (giữ data + tài khoản)
    if (userConfBackup !== null) {
      writeUserConf(userConfBackup);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { checkAnyDeskRunning, resetAnyDeskId, getAnyDeskId };
