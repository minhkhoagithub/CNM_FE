# Dev Browser Guide (CNM Project)

## 1) dev-browser là gì

`dev-browser` là CLI điều khiển browser bằng script JavaScript sandboxed (QuickJS) với API Playwright `page`.
Nó phù hợp để AI agent/Codex verify Web UI thực tế sau khi sửa code: mở trang local, thao tác UI, đọc console/page errors, kiểm tra network fail, chụp screenshot, snapshot DOM.

Lưu ý quan trọng:
- Script chạy trong QuickJS sandbox, **không phải Node.js**.
- Không dùng được `require`, `import`, `process.env`, `fs`.
- Dùng lệnh `dev-browser --headless run <script-file>` là ổn định nhất trên PowerShell.

## 2) Khi nào nên dùng

Nên dùng khi:
- Vừa sửa UI/layout/style và cần kiểm tra render thực tế.
- Vừa sửa flow người dùng (login/register/modal/form/navigation) và cần thao tác thử.
- Cần bắt lỗi runtime mà đọc code không thấy (console error, page error, request fail).

Không thay thế test chính thức (Playwright/Cypress/Jest), chỉ dùng như lớp verify nhanh hỗ trợ AI-assisted E2E.

## 3) Cài đặt

```powershell
npm install -g dev-browser
dev-browser install
dev-browser --help
npm list -g dev-browser --depth=0
```

Trong môi trường hiện tại, `dev-browser --version` không hỗ trợ; lấy version qua `npm list -g`.

## 4) Chạy frontend trước khi test

Web frontend chính hiện tại: `CNM_FE` (React + Vite).

```powershell
cd D:\HKII-2025-2026\CNM_Project\CNM_FE
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

URL local mặc định dùng trong scripts: `http://127.0.0.1:5173`.
Route auth chính: `/auth/login`, `/auth/register`, `/auth/forgot-password`.

## 5) Mở trang local bằng dev-browser

```powershell
cd D:\HKII-2025-2026\CNM_Project\CNM_FE
npm run browser:smoke
```

Kết quả mong đợi:
- In `URL`, `Title`, `Body length`.
- Không crash browser/script.

## 6) Kiểm tra console errors

```powershell
cd D:\HKII-2025-2026\CNM_Project\CNM_FE
npm run browser:console
```

Script thu thập:
- Browser console `error`.
- `pageerror` (runtime exception).
- `requestfailed`.
- HTTP `5xx`.

Nếu có `pageerror` hoặc `console error`, script sẽ fail để tránh bỏ qua lỗi nghiêm trọng.

## 7) Kiểm tra form/login/basic flow

Flow cơ bản không cần account:
- mở login page;
- đọc link nội bộ;
- điều hướng qua route auth.

```powershell
cd D:\HKII-2025-2026\CNM_Project\CNM_FE
npm run browser:navigation
```

Nếu cần login thật:
1. Tìm test account/seed trong README, `.env.example`, test setup trước.
2. Chỉ dùng account local test.
3. Không hardcode credential vào repo.
4. Không log lộ password/token.

Mẫu dùng biến môi trường (không commit file tạm):

```powershell
if (-not $env:E2E_EMAIL -or -not $env:E2E_PASSWORD) {
  throw "Missing E2E_EMAIL or E2E_PASSWORD"
}
```

## 8) Chụp screenshot

```powershell
cd D:\HKII-2025-2026\CNM_Project\CNM_FE
npm run browser:screenshot
```

Screenshot được lưu qua helper `saveScreenshot(...)` tại thư mục temp của dev-browser (in path ra console).

## 9) Inspect DOM / Snapshot

Mẫu script nhanh:

```js
const page = await browser.getPage("inspect-main");
await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
const snap = await page.snapshotForAI({ track: "main", depth: 4 });
console.log(snap.full);
```

Dùng khi cần khám phá selector/structure trước khi click/fill.

## 10) Checklist cho Codex mỗi lần sửa UI

Trước khi sửa:
1. Đọc code màn hình/route liên quan.
2. Xác định URL + route cần verify.
3. Kiểm tra frontend đã chạy chưa.
4. Nếu cần API, xác nhận backend/service phụ trợ đã chạy.

Sau khi sửa:
1. Chạy `smoke-home.js`.
2. Chạy `check-console.js`.
3. Chạy flow liên quan (`basic-navigation.js` hoặc script đặc thù).
4. Chụp screenshot nếu thay đổi giao diện đáng kể.
5. Báo cáo theo format:

```txt
Dev-browser verification:
- URL tested:
- Mode: headless/headed
- Pages/routes checked:
- Main interactions:
- Console errors:
- Page errors:
- Network/API issues:
- Screenshot path:
- Result: PASS/FAIL/PARTIAL
- Notes:
```

## Ghi chú thực tế cho project này

- FE `CNM_FE` gọi API mặc định về `http://localhost:8080/api/v1` nếu thiếu `VITE_BASE_API_URL`.
- Backend nằm ở `CNM_Project_BE` (Spring Boot), có phụ thuộc Postgres/Redis qua Docker Compose.
- Nếu chỉ verify render/login UI, có thể test trước khi bật backend; khi verify flow data/API thì cần backend + DB/Redis đầy đủ.
