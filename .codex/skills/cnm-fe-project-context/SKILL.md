---
name: cnm-fe-project-context
description: Project context for the CNM_FE React web app. Use when working on login, register, cookie-based auth, route guards, user context, device management, remote device logout, auth websocket subscriptions, or when you need a quick model of how the current web frontend talks to the backend.
---

# CNM_FE Project Context

Use this skill before changing auth, profile, route guard, device management, or realtime logout behavior in `CNM_FE`.

## Quick Start

- Read `references/project-overview.md` for app structure and runtime model.
- Read `references/auth-remote-logout-flow.md` for login, cookie auth, websocket contract, and device logout behavior.
- Treat auth as cookie-based first, localStorage-assisted second.

## Core Rules

- Assume `access token` and `refresh token` live in `HttpOnly cookie`.
- Do not write frontend logic that depends on reading token values from JavaScript.
- Keep authenticated HTTP requests on axios clients with `withCredentials: true`.
- WebSocket auth logout subscriptions must use `userId` from `UserContext`, not a token parsed from storage.
- Only force logout this browser when `event.deviceId` matches `localStorage.deviceId`.

## Current Mental Model

- `Login.jsx` writes `isLogin` and `deviceId` to `localStorage`.
- `Zalo.jsx` fetches `/users/profile` and hydrates `UserContext`.
- `ProtectedRoute.jsx` currently guards by `localStorage.isLogin`.
- `WebSocketService.js` connects to `/auth/ws`.
- Device logout requests can be sent over `/app/auth/logout-device`.
- Device logout notifications arrive on `/topic/auth/{userId}/device-logout`.

## References

- `references/project-overview.md`
- `references/auth-remote-logout-flow.md`
