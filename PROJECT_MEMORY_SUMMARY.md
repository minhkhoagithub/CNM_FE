# CNM_FE Memory Summary

Tai lieu nay duoc viet chi dua tren bo nho lam viec hien co, khong doc them file nao o thoi diem tao.

## Muc tieu du an

`CNM_FE` la frontend web cho he thong chat theo phong cach Zalo, dung React + Vite.

## Nhung gi da xac nhan trong bo nho

### 1. Auth model

- Backend luu access token va refresh token trong `HttpOnly cookie`.
- Frontend van giu mot so UI/auth state trong `localStorage`, nhu:
  - `isLogin`
  - `userProfile`
  - `deviceId`

Y nghia:

- cookie dung cho auth that
- localStorage dung de bootstrap giao dien va route guard

### 2. WebSocket auth

- Co service auth websocket rieng cho web.
- Service cu da co logic doc `localStorage.accessToken`.
- Diem nay sai neu token nam trong `HttpOnly cookie`, vi JavaScript khong doc duoc token.

Huong da duoc sua trong bo nho:

- dung `userProfile.userId` de biet subscribe topic nao
- khong co gang giai ma JWT tu client nua
- web socket url duoc suy ra tu base API, khong hardcode `localhost`

### 3. Van de da tung gap

- Log `No access token found`
- STOMP connect spam log
- `InvalidStateError` khi subscribe som
- `/profile` va `/conversations` bi goi lap vo han

### 4. Nguyen nhan da duoc xac dinh

- React StrictMode trong dev lam effect/connect goi lap
- context function identity khong on dinh gay render loop
- `Zalo.jsx` goi profile lai theo dependency thay doi
- `ContactConext` refetch conversations khi object auth doi lien tuc

### 5. Cach da xu ly trong bo nho

- `WebSocketService.connect()` duoc lam theo huong idempotent hon
- chan stale callback cua client cu
- tat debug STOMP de giam spam console
- `setUserData` trong `UserContext` duoc on dinh hon
- `ContactConext` refetch theo `currentUserId` thay vi theo ca object user

## Cac man/luong noi bat nho duoc

- `Login`
- `Register`
- `ForgotPassword`
- `Zalo`
- `Chat`
- quan ly thiet bi / remote logout qua websocket

## Ghi chu

- Day la ban tom tat theo tri nho, khong phai tai lieu audit tu codebase.
- Neu can mo ta chinh xac theo source hien tai, can doc lai code.
