# Service Manager

Ứng dụng Electron để quản lý và giám sát các services trên máy tính (9Router, OpenClaw, và các tiện ích mở rộng).

---

## Chạy & Build

```bash
npm start          # chạy dev
npm run build      # build installer (NSIS/Windows)
```

---

## Cấu trúc dự án

```
src/
  main/                   ← Electron main process (Node.js)
    index.js              ← Entry point: tạo window, tray, shortcuts, lifecycle
    ipc.js                ← Tất cả ipcMain handlers; SERVICE_CONFIGS
    services.js           ← Spawn/stop/update process; port check
    settings.js           ← Load/save settings.json (userData)
    tray.js               ← System tray: menu, tooltip, balloon notify

  renderer/               ← UI (chạy trong BrowserWindow)
    index.js              ← Entry point: khởi tạo tất cả modules
    state.js              ← Runtime state của các services
    ui.js                 ← DOM helpers thuần túy (toast, badge, log, metrics...)
    views/
      dashboard.js        ← Service cards, IPC handlers status/log/update
      logs.js             ← View tổng hợp log
      settings.js         ← View cài đặt
    components/
      logPanel.js         ← Collapsible log + filter (All/Error/OK)
      commandPalette.js   ← Ctrl+K palette, có thể mở rộng

index.html                ← Shell HTML, load src/renderer/index.js
style.css                 ← Toàn bộ CSS (variables, components, dark mode)
```

---

## Bảo trì

### Sửa UI / style
- CSS variables ở đầu `style.css` (màu, spacing, animation speed)
- Mỗi component có section riêng được đánh dấu bằng comment `/* ─── ... */`

### Sửa logic service (start/stop/log)
- `src/main/services.js` — spawn, kill, port check
- `src/renderer/views/dashboard.js` — xử lý IPC phía UI

### Sửa settings
- `src/main/settings.js` — thêm field mới vào `DEFAULTS`
- `src/renderer/views/settings.js` — bind thêm input HTML tương ứng

### Sửa tray menu
- `src/main/tray.js` — hàm `updateMenu()`

---

## Thêm service mới

**1. Đăng ký service** — mở `src/main/ipc.js`, thêm vào `SERVICE_CONFIGS`:

```js
myservice: {
  key: 'myservice', label: 'My Service',
  cmd: 'myservice-cli', args: ['start'],
  statusCh: 'myservice-status', logCh: 'myservice-log'
}
```

**2. Thêm state** — mở `src/renderer/state.js`:

```js
myservice: { running: false, startTime: null, pid: null, external: false }
```

**3. Thêm card HTML** — copy một service card trong `index.html`, đổi tất cả `router` → `myservice`.

**4. Bind UI** — trong `src/renderer/views/dashboard.js`, gọi `bindService('myservice')` và thêm vào `initLogPanels` trong `src/renderer/index.js`.

---

## Thêm tiện ích máy tính (view mới)

**1. Tạo view** — `src/renderer/views/tools/mytool.js`:

```js
const ui = require('../ui');  // hoặc ../../ui tùy depth

function init() {
  // bind DOM events
}

module.exports = { init };
```

**2. Thêm nav item** — trong `index.html`, thêm `<a>` vào `.nav` và thêm `<div id="view-mytool">` vào `.main-content`.

**3. Đăng ký** — trong `src/renderer/index.js`:

```js
const mytool = require('./views/tools/mytool');
// thêm vào views object
views.mytool = ui.$('view-mytool');
// thêm nav listener
ui.$('nav-mytool').addEventListener('click', (e) => { e.preventDefault(); switchView('mytool'); });
// init
mytool.init();
```

**4. IPC nếu cần** — thêm handler vào `src/main/ipc.js` trong hàm `register()`.

---

## Thêm lệnh vào Command Palette (Ctrl+K)

```js
// trong bất kỳ module renderer nào
const palette = commandPalette.init(...); // hoặc lưu ref khi init
palette.addCommand({
  label: 'Tên lệnh hiển thị',
  icon: `<svg .../>`,
  action: () => { /* làm gì đó */ }
});
```

---

## Settings file

Lưu tại: `%APPDATA%\claw-router-manager\settings.json`

| Key | Mặc định | Mô tả |
|-----|----------|-------|
| `autoLaunch` | false | Khởi động cùng Windows |
| `startMinimized` | false | Ẩn xuống tray khi mở |
| `autoStartRouter` | false | Tự start 9Router khi app mở |
| `autoStartOpenclaw` | false | Tự start OpenClaw khi app mở |
| `minimizeToTray` | true | Ẩn xuống tray thay vì thoát khi đóng |
| `windowBounds` | auto | Vị trí và kích thước cửa sổ |
