const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Kill IDM processes trước khi reset
 */
function killIDMProcesses() {
  return new Promise((resolve) => {
    exec('taskkill /F /IM IDMan.exe /T & taskkill /F /IM IEMonitor.exe /T', (err) => {
      // Không quan trọng nếu process không tồn tại
      resolve({ ok: true });
    });
  });
}

/**
 * Reset IDM trial bằng cách:
 * 1. Kill IDM processes
 * 2. Xóa registry keys (ConfigTime, MData)
 * 3. Reset Thread=1, Model=0x68
 * 4. Xóa folder %appdata%\IDM
 */
async function resetIDMTrial() {
  try {
    // Step 1: Kill processes
    await killIDMProcesses();

    // Step 2: Delete registry keys và reset values
    const regCommands = [
      'reg delete "HKEY_CURRENT_USER\\SOFTWARE\\DownloadManager" /v ConfigTime /f',
      'reg delete "HKEY_CURRENT_USER\\SOFTWARE\\Classes\\WOW6432Node\\CLSID\\{07999AC3-058B-40BF-984F-69EB1E554CA7}" /v MData /f',
      'reg add "HKEY_CURRENT_USER\\SOFTWARE\\Classes\\WOW6432Node\\CLSID\\{07999AC3-058B-40BF-984F-69EB1E554CA7}" /v Therad /t REG_DWORD /d 1 /f',
      'reg add "HKEY_CURRENT_USER\\SOFTWARE\\Classes\\WOW6432Node\\CLSID\\{07999AC3-058B-40BF-984F-69EB1E554CA7}" /v Model /t REG_DWORD /d 0x68 /f'
    ];

    for (const cmd of regCommands) {
      await new Promise((resolve, reject) => {
        exec(cmd, (err) => {
          if (err && !err.message.includes('unable to find')) {
            // Chỉ reject nếu không phải lỗi "key không tồn tại"
            return reject(err);
          }
          resolve();
        });
      });
    }

    // Step 3: Xóa folder %appdata%\IDM
    const idmFolder = path.join(process.env.APPDATA, 'IDM');
    if (fs.existsSync(idmFolder)) {
      await new Promise((resolve, reject) => {
        exec(`rmdir /S /Q "${idmFolder}"`, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Kiểm tra xem IDM có đang chạy không và số ngày trial còn lại
 */
function checkIDMRunning() {
  return new Promise((resolve) => {
    // Check process
    exec('tasklist /FI "IMAGENAME eq IDMan.exe"', (err, stdout) => {
      if (err) return resolve({ running: false, daysLeft: null, error: 'Không thể kiểm tra process' });
      const running = stdout.includes('IDMan.exe');
      
      // Check trial days left từ registry
      const regQuery = 'reg query "HKEY_CURRENT_USER\\SOFTWARE\\DownloadManager" /v FakeLastUsedTime';
      
      exec(regQuery, (regErr, regOut) => {
        let daysLeft = null;
        let installDate = null;
        
        if (!regErr && regOut) {
          try {
            // FakeLastUsedTime hoặc LastUsedTime chứa timestamp
            const match = regOut.match(/FakeLastUsedTime\s+REG_BINARY\s+([0-9A-Fa-f\s]+)/);
            if (match) {
              const hexData = match[1].replace(/\s/g, '');
              
              if (hexData.length >= 16) {
                // Parse 8 bytes little-endian FILETIME
                const bytes = [];
                for (let i = 0; i < 16; i += 2) {
                  bytes.push(parseInt(hexData.substr(i, 2), 16));
                }
                
                // Combine bytes to 64-bit integer (little-endian)
                let filetime = 0;
                for (let i = 0; i < 8; i++) {
                  filetime += bytes[i] * Math.pow(2, i * 8);
                }
                
                // Convert FILETIME (100-nanosecond intervals since 1601-01-01) to JS Date
                const FILETIME_EPOCH_DIFF = 116444736000000000n; // 100-ns intervals between 1601 and 1970
                const unixMs = Number((BigInt(Math.floor(filetime)) - FILETIME_EPOCH_DIFF) / 10000n);
                installDate = new Date(unixMs);
                
                const now = new Date();
                const daysPassed = Math.floor((now - installDate) / (1000 * 60 * 60 * 24));
                daysLeft = Math.max(0, 30 - daysPassed);
              }
            }
          } catch (e) {
            console.error('[IDM] Parse error:', e);
          }
        }
        
        // Nếu không parse được, thử cách đơn giản hơn
        if (daysLeft === null) {
          exec('reg query "HKEY_CURRENT_USER\\SOFTWARE\\DownloadManager"', (err2, out2) => {
            if (!err2 && out2) {
              // Nếu có key DownloadManager nghĩa là đã cài, giả sử còn trial
              // Không parse được chính xác thì báo "Không xác định"
              resolve({ running, daysLeft: null, hasRegistry: true });
            } else {
              resolve({ running, daysLeft: null, hasRegistry: false });
            }
          });
          return;
        }
        
        resolve({ running, daysLeft, installDate: installDate ? installDate.toISOString() : null });
      });
    });
  });
}

module.exports = { resetIDMTrial, checkIDMRunning, killIDMProcesses };
