# CNM_FE Project Context

## Tong quan

`CNM_FE` la frontend web React + Vite cho he thong chat.

Main areas:

- auth pages: `src/page/Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`
- root page: `src/page/Zalo.jsx`
- main chat shell: `src/page/Chat.jsx`
- user state: `src/Context/UserContext.jsx`
- auth route guard: `src/Context/ProtectedRoute.jsx`
- axios config: `src/util/api/axiosConfig.js`
- auth websocket: `src/services/WebSocketService.js`

## Auth model

`access token` va `refresh token` duoc backend luu trong `HttpOnly cookie`.

Frontend JS:

- khong doc token truc tiep
- gui request auth bang `withCredentials: true`

Tuy vay, web hien tai van giu them:

- `localStorage.isLogin`
- `localStorage.deviceId`
- `localStorage.userProfile`

De route guard va khoi tao UI nhanh hon.

## Luong login hien tai

1. User submit credentials o `Login.jsx`
2. FE goi `userLogin(...)`
3. Backend set cookie session
4. FE luu `isLogin = true`
5. FE luu `deviceId`
6. FE set `UserContext.userData`
7. `Zalo.jsx` se fetch lai `/users/profile` de dong bo profile

## Luong remote device logout

### Backend contract

- websocket endpoint: `/auth/ws`
- send logout request: `/app/auth/logout-device`
- receive event: `/topic/auth/{userId}/device-logout`

### Web behavior

- `Zalo.jsx` connect auth websocket sau khi co `userData.userId`
- khi nhan `device-logout`, web chi logout ngay neu:
  `event.deviceId === localStorage.deviceId`
- neu event la cho thiet bi khac, UI chi can cap nhat list device, khong duoc logout tab hien tai

### Device management

Hai noi co the trigger logout-device:

- `src/component/Setting/DeviceManager.jsx`
- `src/page/Chat.jsx`

Priority:

1. neu websocket dang active, gui `/app/auth/logout-device`
2. neu websocket loi, fallback ve REST `/api/v1/auth/logout-device`

## Diem can de y

- `ProtectedRoute.jsx` dang dua tren `localStorage.isLogin`, khong phai cookie state thuần
- vi vay neu cookie het han ma `isLogin` van true, app se phu thuoc vao `Zalo.jsx` goi `/users/profile` de phat hien session da mat
- codebase hien co hybrid state:
  cookie cho auth that
  localStorage cho route/UI state
