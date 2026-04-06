# Design: shadcn/ui-Inspired UI Upgrade

## Architecture
- Files thay đổi: index.html, style.css, renderer.js (KHÔNG sửa main.js)
- CSS tổ chức theo sections với comment headers
- JS theo pattern hiện có trong renderer.js

## Component Specs

### Badge (thay status-indicator)
HTML: `<span class="badge badge-success"><span class="status-dot running"></span> Đang chạy</span>`
CSS: padding 4px 10px, border-radius 20px, font-size 12px, font-weight 600
Variants: badge-success (green bg 10%), badge-destructive (red bg 10%), badge-warning (amber bg 10%), badge-secondary (surface-2)

### Tooltip
Dùng data-tooltip attribute + CSS ::after pseudo-element
CSS: position absolute, opacity 0 → 1, transition-delay 400ms
JS: thêm class tooltip-top nếu element.getBoundingClientRect().bottom > window.innerHeight - 100

### Progress Bar
HTML: `<div class="progress"><div class="progress-bar"></div></div>`
Indeterminate: @keyframes progress-indeterminate, translateX(-100%) → translateX(400%)
Determinate: width transition 0.3s ease
Inject vào service-header khi state = starting, remove khi running/stopped

### Skeleton
CSS: background linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%)
background-size: 200% 100%, animation: shimmer 1.5s infinite
Dùng cho metric-value khi chưa có data

### Alert
HTML: `<div class="alert alert-destructive"><svg>...</svg><div><p class="alert-title">Lỗi</p><p class="alert-desc">message</p></div><button class="alert-close">×</button></div>`
Inject sau service-header khi error, dismiss với fade-out 200ms

### Collapsible Log
Thêm chevron button vào log-header
CSS: .log-content max-height transition 250ms
localStorage key: log-collapsed-router, log-collapsed-openclaw
Unread badge khi collapsed + new log arrives

### Switch (thay toggle-switch)
Giữ input[type=checkbox] ẩn, thêm .switch-track + .switch-thumb
Track: 44x24px, border 2px solid var(--border), border-radius 12px
Thumb: 16x16px circle, translateX(0→20px)
:focus-visible outline: 2px solid var(--blue)

### Command Palette
HTML: overlay div.command-overlay > div.command-dialog > input.command-input + ul.command-list
Backdrop: rgba(0,0,0,0.5) + backdrop-filter blur(4px)
Dialog: max-width 560px, scale(0.95)→scale(1) + opacity 0→1, 150ms
Commands array: 15 items với label, icon, action function
Filter: input event → filter + highlight match với <mark>
Keyboard: ArrowUp/Down navigate, Enter execute, Escape close
Trap focus trong dialog

### Micro-animations
Ripple: mousedown → create span.ripple absolute, scale(0→4) opacity(1→0) 500ms, remove after
Toast: translateX(120%)→0 slide-in 300ms, reverse on dismiss
View transition: opacity 0 translateY(6px) → opacity 1 translateY(0) 200ms
Stagger: card:nth-child(2) animation-delay 60ms
Metric flash: khi value thay đổi từ '--', add class .metric-flash (color green 600ms)

## State Management
```
// Thêm vào state object trong renderer.js
logCollapsed: { router: false, openclaw: false }
logUnread: { router: 0, openclaw: 0 }
initialLoadDone: false
commandPaletteOpen: false
```

## CSS Variables cần thêm
```css
--green-subtle: rgba(22,163,74,0.1);
--red-subtle: rgba(220,38,38,0.1);
--amber-subtle: rgba(217,119,6,0.1);
--blue-subtle: rgba(37,99,235,0.1);
--animation-fast: 150ms;
--animation-normal: 250ms;
--animation-slow: 500ms;
```

## Integration Points trong renderer.js
1. handleServiceStatus() → inject Alert nếu error, show/hide progress bar
2. addLog() → increment unread nếu collapsed, apply log filter
3. switchView() → add fade transition
4. updateMetrics() → add skeleton on init, flash on update
5. Thêm initCommandPalette() function
6. Thêm initCollapsibleLogs() function
7. Thêm initRipple() function
8. Thêm initTooltips() function (JS part cho flip detection)

## File Change Summary
index.html:
- Thêm div.command-overlay trước </body>
- Thêm chevron button vào log-header
- Thêm data-tooltip attributes vào buttons
- Thay .toggle-switch bằng .switch structure

style.css:
- Thêm sections: Badge, Tooltip, Progress, Skeleton, Alert, Collapsible, Switch, Command Palette, Ripple, Transitions

renderer.js:
- Thêm ~200 lines cho các init functions
- Sửa handleServiceStatus, addLog, switchView, updateMetrics
