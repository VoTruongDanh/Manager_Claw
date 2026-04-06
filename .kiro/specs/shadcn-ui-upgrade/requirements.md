# Requirements: shadcn/ui-Inspired UI Upgrade — Service Manager

## Overview

Service Manager là ứng dụng Electron quản lý hai background service: **OpenClaw** (gateway agent, port 18789) và **9Router** (AI routing service, port 20128). Giao diện hiện tại sử dụng Zinc/Slate monochrome design system thuần CSS — functional nhưng thiếu visual polish và feedback phong phú.

Mục tiêu của feature này là nâng cấp toàn bộ UI bằng cách lấy cảm hứng từ component patterns của [shadcn/ui](https://ui.shadcn.com/docs/components/), implement hoàn toàn bằng **thuần CSS + vanilla JS** (không dùng npm package shadcn, không dùng React/Tailwind) để tương thích với kiến trúc Electron hiện tại. Kết quả là một giao diện hiện đại hơn, có micro-animations, feedback rõ ràng hơn, và UX mượt mà hơn — mà không thay đổi bất kỳ logic nghiệp vụ nào trong `main.js`.

---

## User Stories

### Badge & Status
- **US-1:** Là người dùng, tôi muốn thấy trạng thái service (Running / Stopped / Starting / Error) được hiển thị dưới dạng Badge có màu sắc rõ ràng, để nhận biết nhanh mà không cần đọc text.
- **US-2:** Là người dùng, tôi muốn Badge trạng thái "Running" có hiệu ứng pulse animation, để biết service đang thực sự hoạt động.

### Tooltip
- **US-3:** Là người dùng, tôi muốn hover vào các button (Start, Stop, Restart, Update, Folder, Web UI) thì thấy tooltip mô tả hành động và phím tắt tương ứng, để không cần nhớ hết shortcut.
- **US-4:** Là người dùng, tôi muốn tooltip xuất hiện với animation fade-in mượt mà sau 400ms delay, để không bị distract khi chỉ di chuột qua.

### Progress Bar
- **US-5:** Là người dùng, khi nhấn Start service, tôi muốn thấy một progress bar indeterminate chạy bên dưới service card, để biết app đang xử lý chứ không bị treo.
- **US-6:** Là người dùng, khi chạy Update (npm install -g), tôi muốn thấy progress bar với phần trăm ước tính dựa trên output stream, để theo dõi tiến trình cập nhật.

### Separator
- **US-7:** Là người dùng, tôi muốn các section trong card (header, metrics, actions, log) được phân tách bằng Separator có visual rõ ràng hơn, để dễ scan layout.

### Skeleton Loading
- **US-8:** Là người dùng, khi app vừa mở và đang check status lần đầu, tôi muốn thấy skeleton placeholder thay vì giá trị "--", để biết dữ liệu đang được tải chứ không phải lỗi.

### Alert
- **US-9:** Là người dùng, khi service crash hoặc gặp lỗi, tôi muốn thấy Alert banner màu đỏ xuất hiện trong card tương ứng với message lỗi cụ thể, để biết ngay vấn đề mà không cần mở log.
- **US-10:** Là người dùng, tôi muốn Alert có nút dismiss (×) để đóng sau khi đã đọc, để không bị chiếm diện tích màn hình.

### Card Hover Effects
- **US-11:** Là người dùng, khi hover vào service card, tôi muốn thấy hiệu ứng elevation (box-shadow nâng lên) và border highlight mượt mà, để có cảm giác interactive.
- **US-12:** Là người dùng, khi service đang Running, tôi muốn card có subtle glow màu xanh lá, để phân biệt trực quan với card đang dừng.

### Collapsible Log Panel
- **US-13:** Là người dùng, tôi muốn có thể collapse/expand phần Console Output trong mỗi service card bằng một click vào header, để tiết kiệm không gian khi không cần xem log.
- **US-14:** Là người dùng, tôi muốn trạng thái collapsed/expanded của log panel được lưu vào localStorage, để không bị reset mỗi lần reload.

### Switch (thay Toggle)
- **US-15:** Là người dùng, tôi muốn các toggle trong Settings được thay bằng Switch component theo style shadcn/ui (thumb tròn, track có border, transition mượt), để trải nghiệm nhất quán và hiện đại hơn.
- **US-16:** Là người dùng, tôi muốn Switch có focus ring khi navigate bằng keyboard, để đảm bảo accessibility.

### Command Palette (Ctrl+K)
- **US-17:** Là người dùng, tôi muốn nhấn Ctrl+K để mở Command Palette overlay, để thực hiện nhanh các hành động (start/stop service, mở web UI, chuyển view, toggle theme) mà không cần dùng chuột.
- **US-18:** Là người dùng, tôi muốn gõ để filter danh sách lệnh trong Command Palette theo tên, để tìm nhanh lệnh cần dùng.
- **US-19:** Là người dùng, tôi muốn navigate Command Palette bằng phím mũi tên và Enter, và đóng bằng Escape, để dùng hoàn toàn bằng keyboard.

### Micro-animations
- **US-20:** Là người dùng, tôi muốn các button có ripple effect khi click, để có feedback xúc giác rõ ràng hơn.
- **US-21:** Là người dùng, tôi muốn Toast notification xuất hiện với slide-in từ phải và fade-out mượt mà, để không bị giật.
- **US-22:** Là người dùng, tôi muốn khi chuyển giữa các view (Dashboard / Logs / Settings), có fade transition nhẹ, để navigation cảm giác mượt mà.
- **US-23:** Là người dùng, tôi muốn các service card load vào với staggered fade-up animation, để trang không bị "pop" đột ngột.

---

## Functional Requirements

### FR-1: Badge Component
- **FR-1.1:** Implement CSS class `.badge` với các variant: `badge-success` (xanh lá), `badge-destructive` (đỏ), `badge-warning` (vàng), `badge-secondary` (xám), `badge-outline` (border only).
- **FR-1.2:** Thay thế `.status-indicator` hiện tại bằng Badge component. Badge hiển thị text trạng thái và status dot.
- **FR-1.3:** Badge variant `badge-success` khi service Running phải có `status-dot` với `animation: pulse`.
- **FR-1.4:** Badge phải responsive — không wrap text, có `white-space: nowrap`.

### FR-2: Tooltip Component
- **FR-2.1:** Implement tooltip thuần CSS sử dụng `[data-tooltip]` attribute + CSS `::before`/`::after` pseudo-elements, không dùng JS cho positioning cơ bản.
- **FR-2.2:** Tooltip xuất hiện sau 400ms delay (`transition-delay`) và fade in trong 150ms.
- **FR-2.3:** Tooltip tự động flip lên trên nếu element ở gần bottom viewport (implement bằng JS class `.tooltip-top` / `.tooltip-bottom`).
- **FR-2.4:** Tất cả button trong `.service-actions` phải có `data-tooltip` với mô tả + phím tắt nếu có.
- **FR-2.5:** Sidebar links (`9Router Web`, `OpenClaw API`) phải có tooltip hiển thị URL đầy đủ.

### FR-3: Progress Bar Component
- **FR-3.1:** Implement CSS class `.progress` (container) + `.progress-bar` (fill) với `transition: width 0.3s ease`.
- **FR-3.2:** Variant `.progress-indeterminate`: thanh chạy từ trái sang phải lặp vô hạn bằng CSS `@keyframes`.
- **FR-3.3:** Progress bar xuất hiện bên dưới `.service-header` khi service ở trạng thái `starting`, tự ẩn khi chuyển sang `running` hoặc `stopped`/`error`.
- **FR-3.4:** Khi update package, progress bar hiển thị với giá trị tăng dần (0% → 30% khi bắt đầu stream → 90% khi gần xong → 100% khi `update-result` nhận được).

### FR-4: Separator Component
- **FR-4.1:** Implement CSS class `.separator` (horizontal) và `.separator-vertical`.
- **FR-4.2:** Separator có `color: var(--border)`, height 1px (horizontal) hoặc width 1px (vertical).
- **FR-4.3:** Thay thế các `border-bottom: 1px solid var(--border)` inline trong card bằng `<hr class="separator">` element để semantic rõ hơn.

### FR-5: Skeleton Loading Component
- **FR-5.1:** Implement CSS class `.skeleton` với shimmer animation: gradient từ `var(--surface-2)` → `var(--border)` → `var(--surface-2)` chạy ngang.
- **FR-5.2:** Khi app khởi động và chưa nhận `status-update` lần đầu, các `.metric-value` hiển thị `<span class="skeleton" style="width:40px;height:18px">` thay vì text "--".
- **FR-5.3:** Skeleton tự remove và replace bằng giá trị thực khi data đến.
- **FR-5.4:** Skeleton phải có `border-radius: var(--r)` và `display: inline-block`.

### FR-6: Alert Component
- **FR-6.1:** Implement CSS class `.alert` với variants: `.alert-destructive` (đỏ), `.alert-warning` (vàng), `.alert-info` (xanh).
- **FR-6.2:** Alert có icon SVG bên trái, title bold, description text, và nút dismiss `×` bên phải.
- **FR-6.3:** Khi `handleServiceStatus` nhận `data.error = true`, inject Alert vào đầu service card tương ứng (sau `.service-header`).
- **FR-6.4:** Nút dismiss xóa Alert khỏi DOM với fade-out animation 200ms.
- **FR-6.5:** Chỉ hiển thị tối đa 1 Alert per service card tại một thời điểm (replace alert cũ nếu có).

### FR-7: Card Hover Effects
- **FR-7.1:** `.service-card:hover` có `box-shadow: 0 8px 24px rgba(0,0,0,0.12)` và `transform: translateY(-1px)` với `transition: all 0.2s var(--ease)`.
- **FR-7.2:** `.service-card.running` có `box-shadow: 0 0 0 2px var(--green), 0 4px 20px rgba(22,163,74,0.15)`.
- **FR-7.3:** `.service-card.error` có `box-shadow: 0 0 0 2px var(--red)`.
- **FR-7.4:** Card transition không được gây layout shift — dùng `transform` thay vì thay đổi `margin`/`padding`.

### FR-8: Collapsible Log Panel
- **FR-8.1:** Thêm chevron icon (▼/▲) vào `.log-header`. Click vào header toggle collapse/expand `.log-content`.
- **FR-8.2:** Collapse animation: `max-height` transition từ `180px` → `0` trong 250ms với `overflow: hidden`.
- **FR-8.3:** Trạng thái collapsed của từng log panel (`router-log`, `openclaw-log`) được persist vào `localStorage` với key `log-collapsed-{name}`.
- **FR-8.4:** Khi log panel collapsed và có log mới đến, hiển thị badge số đếm unread trên log header.
- **FR-8.5:** Chevron icon rotate 180° khi collapsed, với `transition: transform 250ms`.

### FR-9: Switch Component (thay Toggle)
- **FR-9.1:** Implement CSS class `.switch` (wrapper) + `.switch-thumb` (circle) thay thế `.toggle-switch` hiện tại.
- **FR-9.2:** Switch track: width 44px, height 24px, `border-radius: 12px`, border 2px solid `var(--border)` khi off, background `var(--green)` khi on.
- **FR-9.3:** Switch thumb: circle 18px, background white, `box-shadow: 0 1px 3px rgba(0,0,0,0.2)`, translate 0 → 20px khi on.
- **FR-9.4:** Transition: `background 200ms`, `transform 200ms` — cả hai dùng `cubic-bezier(0.4, 0, 0.2, 1)`.
- **FR-9.5:** Switch phải có `:focus-visible` ring: `outline: 2px solid var(--blue); outline-offset: 2px`.
- **FR-9.6:** HTML structure giữ nguyên `<input type="checkbox">` ẩn để tương thích với logic JS hiện tại.

### FR-10: Command Palette (Ctrl+K)
- **FR-10.1:** Overlay `.command-palette` xuất hiện khi nhấn Ctrl+K, đóng khi nhấn Escape hoặc click backdrop.
- **FR-10.2:** Overlay có backdrop `rgba(0,0,0,0.5)` với blur `backdrop-filter: blur(4px)`.
- **FR-10.3:** Dialog box: max-width 560px, centered, `border-radius: var(--r-lg)`, `box-shadow: 0 20px 60px rgba(0,0,0,0.3)`.
- **FR-10.4:** Input search ở đầu dialog, placeholder "Tìm lệnh...", auto-focus khi mở.
- **FR-10.5:** Danh sách lệnh mặc định:
  - Start 9Router / Stop 9Router / Restart 9Router
  - Start OpenClaw / Stop OpenClaw / Restart OpenClaw
  - Khởi động tất cả / Dừng tất cả
  - Mở 9Router Dashboard (web)
  - Mở OpenClaw API (web)
  - Chuyển sang Dashboard / Logs / Settings
  - Bật/Tắt Dark Mode
- **FR-10.6:** Filter real-time khi gõ: so sánh lowercase input với lowercase tên lệnh, highlight phần match bằng `<mark>`.
- **FR-10.7:** Navigate bằng ArrowUp/ArrowDown, thực thi bằng Enter. Item được highlight có background `var(--surface-2)`.
- **FR-10.8:** Command Palette không được conflict với shortcut Ctrl+1/2 hiện có.
- **FR-10.9:** Mở/đóng Command Palette có scale + fade animation: `transform: scale(0.95) → scale(1)`, `opacity: 0 → 1`, duration 150ms.

### FR-11: Micro-animations
- **FR-11.1:** Button ripple effect: khi click, tạo `<span class="ripple">` absolute positioned tại vị trí click, animate `transform: scale(0→4)` + `opacity: 1→0` trong 500ms, sau đó remove.
- **FR-11.2:** Toast notification: slide-in từ `translateX(120%)` → `translateX(0)` trong 300ms khi xuất hiện; slide-out `translateX(120%)` + `opacity: 0` khi dismiss.
- **FR-11.3:** View transition: khi `switchView()` được gọi, view mới fade in từ `opacity: 0, translateY(6px)` → `opacity: 1, translateY(0)` trong 200ms.
- **FR-11.4:** Service card stagger: card thứ nhất delay 0ms, card thứ hai delay 60ms — dùng `animation-delay` CSS.
- **FR-11.5:** Nav item active transition: background fill animate từ trái sang phải (dùng `::before` pseudo-element với `scaleX` transform).
- **FR-11.6:** Metric value update: khi giá trị PID hoặc uptime thay đổi từ "--" sang giá trị thực, text flash màu `var(--green)` trong 600ms.

---

## Non-functional Requirements

### NFR-1: Performance
- Tất cả animations phải dùng `transform` và `opacity` (GPU-accelerated), không animate `width`/`height`/`top`/`left` trực tiếp (ngoại trừ progress bar width có transition).
- Không có animation nào block main thread — tất cả dùng CSS transitions/animations.
- Command Palette filter phải responsive dưới 16ms (60fps) với danh sách ≤ 20 items.

### NFR-2: Compatibility
- Implement hoàn toàn bằng thuần CSS + vanilla JS, **không dùng npm package** nào mới.
- Tương thích với Chromium engine của Electron 28 (Chrome 120+).
- Không thay đổi bất kỳ logic nào trong `main.js` — chỉ sửa `index.html`, `style.css`, `renderer.js`.

### NFR-3: Accessibility
- Tất cả interactive elements phải có `:focus-visible` styles.
- Switch component phải hoạt động với keyboard (Space để toggle).
- Command Palette phải có `role="dialog"`, `aria-modal="true"`, và trap focus khi mở.
- Tooltip không được là nguồn thông tin duy nhất — button vẫn phải có `title` attribute fallback.

### NFR-4: Theme Support
- Tất cả component mới phải dùng CSS variables (`var(--bg)`, `var(--surface)`, `var(--border)`, v.v.) để tự động support cả light và dark theme.
- Skeleton shimmer gradient phải adapt theo theme.
- Command Palette backdrop blur phải hoạt động ở cả hai theme.

### NFR-5: Code Quality
- CSS mới được tổ chức theo section comments (`/* ─── Badge ─── */`, `/* ─── Tooltip ─── */`, v.v.) nhất quán với style hiện tại.
- Không duplicate CSS — tái sử dụng variables và existing utility classes.
- JS mới được thêm vào `renderer.js` theo pattern module-like hiện có, không dùng global variables không cần thiết.

### NFR-6: Backward Compatibility
- Tất cả IPC channels hiện có (`router-status`, `openclaw-status`, `router-log`, `openclaw-log`, `status-update`, v.v.) phải tiếp tục hoạt động không thay đổi.
- Keyboard shortcuts hiện có (Ctrl+1/2, Ctrl+Shift+1/2) phải tiếp tục hoạt động.
- Settings persistence (localStorage + settings.json) không bị ảnh hưởng.

---

## Out of Scope

- **Không dùng npm package shadcn/ui, Radix UI, Tailwind CSS, hoặc bất kỳ UI framework nào.**
- **Không thay đổi `main.js`** — mọi thay đổi chỉ ở frontend (index.html, style.css, renderer.js).
- Không thêm service mới ngoài 9Router và OpenClaw.
- Không implement dark mode mới — dark mode đã có sẵn, chỉ cần đảm bảo components mới tương thích.
- Không thay đổi layout tổng thể (sidebar + main content) hay navigation structure.
- Không implement responsive/mobile layout — đây là Electron desktop app với `minWidth: 900px`.
- Không thêm i18n/localization — giữ nguyên tiếng Việt hiện tại.
- Không implement drag-and-drop hay resize panels.
- Không thêm charts/graphs cho metrics (uptime, PID).
- Không thay đổi Tray menu hay global shortcuts đã có.
