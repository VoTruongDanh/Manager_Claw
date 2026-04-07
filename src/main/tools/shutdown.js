const { exec } = require('child_process');

/**
 * Lên lịch tắt máy sau `seconds` giây (Windows shutdown /s /t)
 * Trả về { ok, error }
 */
function scheduleShutdown(seconds) {
  return new Promise((resolve) => {
    exec(`shutdown /s /t ${seconds}`, (err) => {
      if (err) resolve({ ok: false, error: err.message });
      else     resolve({ ok: true });
    });
  });
}

/**
 * Hủy lệnh tắt máy đang chờ
 */
function cancelShutdown() {
  return new Promise((resolve) => {
    exec('shutdown /a', (err) => {
      // /a trả lỗi nếu không có lệnh nào đang chờ — vẫn ok
      resolve({ ok: !err, error: err ? err.message : null });
    });
  });
}

/**
 * Tắt máy ngay lập tức
 */
function shutdownNow() {
  return new Promise((resolve) => {
    exec('shutdown /s /t 0', (err) => {
      resolve({ ok: !err, error: err ? err.message : null });
    });
  });
}

/**
 * Khởi động lại máy sau `seconds` giây
 */
function scheduleRestart(seconds) {
  return new Promise((resolve) => {
    exec(`shutdown /r /t ${seconds}`, (err) => {
      if (err) resolve({ ok: false, error: err.message });
      else     resolve({ ok: true });
    });
  });
}

module.exports = { scheduleShutdown, cancelShutdown, shutdownNow, scheduleRestart };
