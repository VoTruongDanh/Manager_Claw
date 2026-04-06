# Tasks: shadcn/ui-Inspired UI Upgrade

## Phase 1: Foundation (CSS Variables + Base)
- [x] 1.1 Thêm CSS variables mới vào :root và [data-theme="dark"]
- [x] 1.2 Thêm animation timing tokens
- [x] 1.3 Thêm CSS section structure/comments

## Phase 2: Badge Component
- [x] 2.1 Implement .badge CSS với 4 variants
- [x] 2.2 Thay .status-indicator bằng .badge trong index.html (router + openclaw)
- [x] 2.3 Update setStatus() trong renderer.js để set badge variant

## Phase 3: Progress Bar
- [x] 3.1 Implement .progress + .progress-bar CSS
- [x] 3.2 Implement @keyframes progress-indeterminate
- [x] 3.3 Thêm showProgress(name) / hideProgress(name) functions trong renderer.js
- [x] 3.4 Inject progress bar vào service-header trong index.html
- [x] 3.5 Gọi showProgress khi starting, hideProgress khi running/stopped/error

## Phase 4: Skeleton Loading
- [x] 4.1 Implement .skeleton CSS với shimmer animation
- [x] 4.2 Thêm initSkeletons() function - replace metric values với skeleton spans
- [x] 4.3 Update updateMetrics() để remove skeleton khi data đến
- [x] 4.4 Thêm metric-flash animation khi value thay đổi từ '--'

## Phase 5: Alert Component
- [x] 5.1 Implement .alert CSS với variants destructive/warning/info
- [x] 5.2 Implement showAlert(name, message) / dismissAlert(name) functions
- [x] 5.3 Update handleServiceStatus() để gọi showAlert khi error
- [x] 5.4 Dismiss button event listener với fade-out animation

## Phase 6: Collapsible Log Panel
- [x] 6.1 Thêm chevron button vào log-header trong index.html (router + openclaw)
- [x] 6.2 Implement CSS max-height transition cho .log-content
- [x] 6.3 Implement initCollapsibleLogs() - load state từ localStorage
- [x] 6.4 Toggle collapse/expand với chevron rotation
- [x] 6.5 Unread badge counter khi collapsed + new log

## Phase 7: Switch Component
- [x] 7.1 Implement .switch CSS (track + thumb)
- [x] 7.2 Thay .toggle-switch HTML trong Settings view (index.html) - 3 switches
- [x] 7.3 Đảm bảo JS logic settings vẫn hoạt động với input[type=checkbox]
- [x] 7.4 Thêm :focus-visible styles

## Phase 8: Tooltip
- [x] 8.1 Implement CSS tooltip với [data-tooltip] attribute
- [x] 8.2 Thêm data-tooltip vào tất cả buttons trong service-actions (router + openclaw)
- [x] 8.3 Thêm data-tooltip vào sidebar links
- [x] 8.4 Implement initTooltips() JS cho flip detection

## Phase 9: Command Palette
- [x] 9.1 Thêm div.command-overlay HTML vào index.html trước </body>
- [x] 9.2 Implement CSS overlay + dialog + input + list
- [x] 9.3 Implement initCommandPalette() với commands array (15 items)
- [x] 9.4 Implement filter + highlight với <mark>
- [x] 9.5 Implement keyboard navigation (ArrowUp/Down/Enter/Escape)
- [x] 9.6 Implement focus trap
- [x] 9.7 Implement open/close animations (scale + opacity)
- [x] 9.8 Register Ctrl+K listener (không conflict với Ctrl+1/2)

## Phase 10: Micro-animations
- [x] 10.1 Implement ripple effect CSS + JS (mousedown listener trên .btn)
- [x] 10.2 Update showToast() với slide-in/out animation
- [x] 10.3 Update switchView() với fade transition
- [x] 10.4 Card hover effects (đã có một phần, polish thêm)
- [x] 10.5 Nav item active transition với ::before scaleX

## Phase 11: Integration & Polish
- [x] 11.1 Test tất cả IPC channels vẫn hoạt động
- [x] 11.2 Test dark mode với tất cả components mới
- [x] 11.3 Test keyboard shortcuts không bị conflict
- [x] 11.4 Test Settings save/load vẫn hoạt động
- [x] 11.5 Test auto-start services vẫn hoạt động
- [x] 11.6 Remove console.log debug statements

## Implementation Order (Priority)
1. Phase 1 (Foundation) - ✅ Done
2. Phase 9 (Command Palette) - ✅ Done
3. Phase 6 (Collapsible Log) - ✅ Done
4. Phase 2 (Badge) - ✅ Done
5. Phase 3 (Progress Bar) - ✅ Done
6. Phase 7 (Switch) - ✅ Done
7. Phase 5 (Alert) - ✅ Done
8. Phase 4 (Skeleton) - ✅ Done
9. Phase 8 (Tooltip) - ✅ Done
10. Phase 10 (Micro-animations) - ✅ Done
11. Phase 11 (Integration) - 🔄 In progress

## Estimated Effort
- Phase 1-10: ✅ Done
- Phase 11: ~30min (testing + polish)
- Total remaining: ~30min
