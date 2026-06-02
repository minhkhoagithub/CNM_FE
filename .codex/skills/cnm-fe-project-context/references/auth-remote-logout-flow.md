# Auth And Remote Device Logout Flow

## Login

1. User submits credentials in `Login.jsx`
2. FE calls `/auth/login`
3. Backend sets `HttpOnly cookie`
4. FE stores `isLogin = true`
5. FE stores `deviceId`
6. FE puts profile-ish data into `UserContext`
7. `Zalo.jsx` later fetches `/users/profile` for fresh profile data

## Route Guard

`ProtectedRoute.jsx` currently checks only:

```txt
localStorage.isLogin === "true"
```

That means route access and backend session are not exactly the same thing.

## Current User Bootstrap

`Zalo.jsx` is the place that reconciles them:

- if `isLogin` is true, call `/users/profile`
- if profile returns successfully, keep user in app
- if profile fails, session is effectively invalid

## Remote Device Logout

### Backend contract

- websocket endpoint: `/auth/ws`
- send request: `/app/auth/logout-device`
- receive event: `/topic/auth/{userId}/device-logout`

### Web rule

Every browser for the same account may hear the same topic event.

So FE must always check:

```txt
event.deviceId === localStorage.deviceId
```

Only if true:

- clear `isLogin`
- clear `userProfile`
- clear `deviceId`
- clear `UserContext`
- navigate to `/auth/login`

If false:

- do not logout current browser
- only update device list UI if needed

## Device Management UI

Current places:

- `src/component/Setting/DeviceManager.jsx`
- `src/page/Chat.jsx`

Preferred behavior:

1. use websocket logout when connected
2. fallback to REST logout-device when websocket is unavailable
