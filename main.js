const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;
let processes = {
  router: null,
  openclaw: null
};

// Process metadata
let processInfo = {
  router: { pid: null, startTime: null, port: 20128 },
  openclaw: { pid: null, startTime: null, port: 18789 }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    frame: true,
    backgroundColor: '#f5f5f5'
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Dùng PNG thay vì ICO để tránh lỗi
  const iconPath = path.join(__dirname, 'icon.png');
  const fallbackIcon = path.join(__dirname, 'icon.ico');
  
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = iconPath;
  } else if (fs.existsSync(fallbackIcon)) {
    trayIcon = fallbackIcon;
  } else {
    // Tạo nativeImage trống nếu không có icon
    const { nativeImage } = require('electron');
    trayIcon = nativeImage.createEmpty();
  }
  
  try {
    tray = new Tray(trayIcon);
  } catch (e) {
    console.log('[MAIN] Tray icon error, using empty:', e.message);
    const { nativeImage } = require('electron');
    tray = new Tray(nativeImage.createEmpty());
  }
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🚀 Mở ứng dụng',
      click: () => {
        mainWindow.show();
      }
    },
    { type: 'separator' },
    {
      label: '▶️ Khởi động tất cả',
      click: () => {
        mainWindow.webContents.send('tray-start-all');
      }
    },
    {
      label: '⏹️ Dừng tất cả',
      click: () => {
        mainWindow.webContents.send('tray-stop-all');
      }
    },
    { type: 'separator' },
    {
      label: '9Router',
      submenu: [
        {
          label: '▶️ Khởi động',
          click: () => {
            mainWindow.webContents.send('tray-start-router');
          }
        },
        {
          label: '⏹️ Dừng',
          click: () => {
            mainWindow.webContents.send('tray-stop-router');
          }
        }
      ]
    },
    {
      label: 'OpenClaw',
      submenu: [
        {
          label: '▶️ Khởi động',
          click: () => {
            mainWindow.webContents.send('tray-start-openclaw');
          }
        },
        {
          label: '⏹️ Dừng',
          click: () => {
            mainWindow.webContents.send('tray-stop-openclaw');
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: '❌ Thoát',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Quản lý OpenClaw & 9Router');
  tray.setContextMenu(contextMenu);

  // Double click để mở cửa sổ
  tray.on('double-click', () => {
    mainWindow.show();
  });
}

// Khởi động 9Router
ipcMain.on('start-router', (event) => {
  console.log('[MAIN] start-router received');
  
  if (processes.router && processes.router.pid) {
    console.log('[MAIN] Router already running, PID:', processes.router.pid);
    event.reply('router-status', { 
      running: true, 
      message: '9Router đang chạy',
      pid: processes.router.pid,
      startTime: processInfo.router.startTime,
      port: processInfo.router.port
    });
    return;
  }

  try {
    // Spawn directly without checking - let error event handle if command not found
    processes.router = spawn('9router', [], {
      windowsHide: true,
      detached: false,
      shell: true
    });

    processInfo.router.pid = processes.router.pid;
    processInfo.router.startTime = Date.now();
    
    console.log('[MAIN] Router spawned, PID:', processInfo.router.pid, 'StartTime:', processInfo.router.startTime);

    // Set a timeout to check if process actually started
    const startTimeout = setTimeout(() => {
      if (!processes.router || processes.router.exitCode !== null) {
        console.log('[MAIN] Router failed to start within timeout');
        event.reply('router-status', { 
          running: false, 
          error: true,
          message: '9Router không khởi động được. Kiểm tra: npm list -g 9router' 
        });
      }
    }, 2000);

    processes.router.stdout.on('data', (data) => {
      clearTimeout(startTimeout);
      console.log('[MAIN] Router stdout:', data.toString());
      event.reply('router-log', data.toString());
    });

    processes.router.stderr.on('data', (data) => {
      console.log('[MAIN] Router stderr:', data.toString());
      event.reply('router-log', `ERROR: ${data.toString()}`);
    });

    processes.router.on('error', (error) => {
      clearTimeout(startTimeout);
      console.log('[MAIN] Router error:', error.message);
      event.reply('router-status', { 
        running: false, 
        error: true,
        message: `Lỗi: ${error.message}. Cài đặt: npm install -g 9router` 
      });
      processes.router = null;
      processInfo.router.pid = null;
      processInfo.router.startTime = null;
      broadcastStatus();
    });

    processes.router.on('close', (code) => {
      clearTimeout(startTimeout);
      console.log('[MAIN] Router closed, code:', code);
      processes.router = null;
      processInfo.router.pid = null;
      processInfo.router.startTime = null;
      
      const message = code === 0 
        ? '9Router đã dừng' 
        : `9Router đã dừng với lỗi (code: ${code})`;
      
      event.reply('router-status', { 
        running: false, 
        message,
        error: code !== 0
      });
      broadcastStatus();
    });

    // Send initial status immediately
    const statusData = { 
      running: true, 
      message: '9Router đang khởi động...',
      pid: processes.router.pid,
      startTime: processInfo.router.startTime,
      port: processInfo.router.port
    };
    
    console.log('[MAIN] Sending router-status:', statusData);
    event.reply('router-status', statusData);
    broadcastStatus();
  } catch (error) {
    console.log('[MAIN] Router start exception:', error.message);
    event.reply('router-status', { 
      running: false, 
      error: true,
      message: `Không thể khởi động: ${error.message}` 
    });
  }
});

// Dừng 9Router
ipcMain.on('stop-router', (event) => {
  console.log('[MAIN] stop-router received');
  
  if (processes.router) {
    try {
      console.log('[MAIN] Killing router process, PID:', processes.router.pid);
      processes.router.kill();
      processes.router = null;
      processInfo.router.pid = null;
      processInfo.router.startTime = null;
      
      const statusData = { running: false, message: '9Router đã dừng' };
      console.log('[MAIN] Sending router-status:', statusData);
      event.reply('router-status', statusData);
      
      // Send immediate status update
      broadcastStatus();
    } catch (error) {
      console.log('[MAIN] Router stop error:', error.message);
      event.reply('router-status', { 
        running: false, 
        error: true,
        message: `Lỗi khi dừng: ${error.message}` 
      });
    }
  } else {
    console.log('[MAIN] Router not running');
    event.reply('router-status', { running: false, message: '9Router không chạy' });
  }
});

// Khởi động OpenClaw
ipcMain.on('start-openclaw', (event) => {
  console.log('[MAIN] start-openclaw received');
  
  if (processes.openclaw && processes.openclaw.pid) {
    console.log('[MAIN] OpenClaw already running, PID:', processes.openclaw.pid);
    event.reply('openclaw-status', { 
      running: true, 
      message: 'OpenClaw đang chạy',
      pid: processes.openclaw.pid,
      startTime: processInfo.openclaw.startTime,
      port: processInfo.openclaw.port
    });
    return;
  }

  try {
    // Spawn directly without checking - let error event handle if command not found
    processes.openclaw = spawn('openclaw', ['gateway'], {
      windowsHide: true,
      detached: false,
      shell: true
    });

    processInfo.openclaw.pid = processes.openclaw.pid;
    processInfo.openclaw.startTime = Date.now();
    
    console.log('[MAIN] OpenClaw spawned, PID:', processInfo.openclaw.pid, 'StartTime:', processInfo.openclaw.startTime);

    // Set a timeout to check if process actually started
    const startTimeout = setTimeout(() => {
      if (!processes.openclaw || processes.openclaw.exitCode !== null) {
        console.log('[MAIN] OpenClaw failed to start within timeout');
        event.reply('openclaw-status', { 
          running: false, 
          error: true,
          message: 'OpenClaw không khởi động được. Kiểm tra: npm list -g openclaw' 
        });
      }
    }, 2000);

    processes.openclaw.stdout.on('data', (data) => {
      clearTimeout(startTimeout);
      console.log('[MAIN] OpenClaw stdout:', data.toString());
      event.reply('openclaw-log', data.toString());
    });

    processes.openclaw.stderr.on('data', (data) => {
      console.log('[MAIN] OpenClaw stderr:', data.toString());
      event.reply('openclaw-log', `ERROR: ${data.toString()}`);
    });

    processes.openclaw.on('error', (error) => {
      clearTimeout(startTimeout);
      console.log('[MAIN] OpenClaw error:', error.message);
      event.reply('openclaw-status', { 
        running: false, 
        error: true,
        message: `Lỗi: ${error.message}. Cài đặt: npm install -g openclaw` 
      });
      processes.openclaw = null;
      processInfo.openclaw.pid = null;
      processInfo.openclaw.startTime = null;
      broadcastStatus();
    });

    processes.openclaw.on('close', (code) => {
      clearTimeout(startTimeout);
      console.log('[MAIN] OpenClaw closed, code:', code);
      processes.openclaw = null;
      processInfo.openclaw.pid = null;
      processInfo.openclaw.startTime = null;
      
      const message = code === 0 
        ? 'OpenClaw đã dừng' 
        : `OpenClaw đã dừng với lỗi (code: ${code})`;
      
      event.reply('openclaw-status', { 
        running: false, 
        message,
        error: code !== 0
      });
      broadcastStatus();
    });

    // Send initial status immediately
    const statusData = { 
      running: true, 
      message: 'OpenClaw đang khởi động...',
      pid: processes.openclaw.pid,
      startTime: processInfo.openclaw.startTime,
      port: processInfo.openclaw.port
    };
    
    console.log('[MAIN] Sending openclaw-status:', statusData);
    event.reply('openclaw-status', statusData);
    broadcastStatus();
  } catch (error) {
    console.log('[MAIN] OpenClaw start exception:', error.message);
    event.reply('openclaw-status', { 
      running: false, 
      error: true,
      message: `Không thể khởi động: ${error.message}` 
    });
  }
});

// Dừng OpenClaw
ipcMain.on('stop-openclaw', (event) => {
  console.log('[MAIN] stop-openclaw received');
  
  if (processes.openclaw) {
    try {
      console.log('[MAIN] Killing openclaw process, PID:', processes.openclaw.pid);
      processes.openclaw.kill();
      processes.openclaw = null;
      processInfo.openclaw.pid = null;
      processInfo.openclaw.startTime = null;
      
      const statusData = { running: false, message: 'OpenClaw đã dừng' };
      console.log('[MAIN] Sending openclaw-status:', statusData);
      event.reply('openclaw-status', statusData);
      
      // Send immediate status update
      broadcastStatus();
    } catch (error) {
      console.log('[MAIN] OpenClaw stop error:', error.message);
      event.reply('openclaw-status', { 
        running: false, 
        error: true,
        message: `Lỗi khi dừng: ${error.message}` 
      });
    }
  } else {
    console.log('[MAIN] OpenClaw not running');
    event.reply('openclaw-status', { running: false, message: 'OpenClaw không chạy' });
  }
});

// Mở thư mục
ipcMain.on('open-folder', (event, folderPath) => {
  exec(`explorer "${folderPath}"`, (error) => {
    if (error) {
      event.reply('folder-error', error.message);
    }
  });
});

// Cập nhật 9Router
ipcMain.on('update-router', (event) => {
  const updateProcess = spawn('cmd.exe', ['/c', 'npm', 'install', '-g', '9router'], {
    windowsHide: true
  });

  updateProcess.stdout.on('data', (data) => {
    event.reply('update-progress', { app: '9Router', message: data.toString() });
  });

  updateProcess.stderr.on('data', (data) => {
    event.reply('update-progress', { app: '9Router', message: data.toString() });
  });

  updateProcess.on('close', (code) => {
    if (code === 0) {
      event.reply('update-result', { success: true, app: '9Router' });
    } else {
      event.reply('update-result', { success: false, app: '9Router', code });
    }
  });
});

// Cập nhật OpenClaw
ipcMain.on('update-openclaw', (event) => {
  const updateProcess = spawn('cmd.exe', ['/c', 'npm', 'install', '-g', 'openclaw'], {
    windowsHide: true
  });

  updateProcess.stdout.on('data', (data) => {
    event.reply('update-progress', { app: 'OpenClaw', message: data.toString() });
  });

  updateProcess.stderr.on('data', (data) => {
    event.reply('update-progress', { app: 'OpenClaw', message: data.toString() });
  });

  updateProcess.on('close', (code) => {
    if (code === 0) {
      event.reply('update-result', { success: true, app: 'OpenClaw' });
    } else {
      event.reply('update-result', { success: false, app: 'OpenClaw', code });
    }
  });
});

// Kiểm tra port có đang listen không
function checkPort(port) {
  return new Promise((resolve) => {
    exec(`netstat -ano | findstr ":${port} " | findstr "LISTENING"`, (error, stdout) => {
      if (stdout && stdout.trim()) {
        // Extract PID from last column
        const match = stdout.trim().split(/\s+/).pop();
        const pid = parseInt(match);
        resolve({ listening: true, pid: isNaN(pid) ? null : pid });
      } else {
        resolve({ listening: false, pid: null });
      }
    });
  });
}

// Kiểm tra trạng thái bằng port
async function checkStatusByPort() {
  const [routerResult, openclawResult] = await Promise.all([
    checkPort(processInfo.router.port),
    checkPort(processInfo.openclaw.port)
  ]);

  // Update processInfo nếu detect được từ port
  if (routerResult.listening && !processes.router) {
    processInfo.router.pid = routerResult.pid;
    if (!processInfo.router.startTime) {
      processInfo.router.startTime = Date.now();
    }
  } else if (!routerResult.listening && !processes.router) {
    processInfo.router.pid = null;
    processInfo.router.startTime = null;
  }

  if (openclawResult.listening && !processes.openclaw) {
    processInfo.openclaw.pid = openclawResult.pid;
    if (!processInfo.openclaw.startTime) {
      processInfo.openclaw.startTime = Date.now();
    }
  } else if (!openclawResult.listening && !processes.openclaw) {
    processInfo.openclaw.pid = null;
    processInfo.openclaw.startTime = null;
  }

  return {
    router: {
      running: routerResult.listening || !!processes.router,
      pid: processInfo.router.pid,
      startTime: processInfo.router.startTime,
      port: processInfo.router.port
    },
    openclaw: {
      running: openclawResult.listening || !!processes.openclaw,
      pid: processInfo.openclaw.pid,
      startTime: processInfo.openclaw.startTime,
      port: processInfo.openclaw.port
    }
  };
}

// Kiểm tra trạng thái
ipcMain.on('check-status', async (event) => {
  const statusData = await checkStatusByPort();
  console.log('[MAIN] check-status (port-based):', JSON.stringify(statusData));
  event.reply('status-update', statusData);
});

// Broadcast status to all windows
async function broadcastStatus() {
  const statusData = await checkStatusByPort();
  console.log('[MAIN] Broadcasting status:', JSON.stringify(statusData));
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-update', statusData);
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  if (processes.router) processes.router.kill();
  if (processes.openclaw) processes.openclaw.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
