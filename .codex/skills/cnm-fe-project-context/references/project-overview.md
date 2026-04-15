# CNM_FE Project Overview

## Stack

- React
- Vite
- React Router
- Axios
- SockJS + STOMP

## Main Files

- `src/main.jsx`: root providers
- `src/App.jsx`: route tree
- `src/Context/UserContext.jsx`: normalize user profile into FE shape
- `src/Context/ProtectedRoute.jsx`: route guard based on `localStorage.isLogin`
- `src/util/api/axiosConfig.js`: axios instance with `withCredentials: true`
- `src/util/api/index.jsx`: auth, profile, friend, device APIs
- `src/page/Zalo.jsx`: bootstrap current session and root chat shell
- `src/services/WebSocketService.js`: auth websocket for remote device logout

## Session Model

- Backend session is cookie-based
- FE also stores lightweight UI/session hints in `localStorage`
- This is a hybrid model, not pure stateless token-in-JS auth

## Current Local Storage Keys

- `isLogin`
- `deviceId`
- `userProfile`

## Important Constraint

Cookie session is the source of truth for authorization.

`localStorage.isLogin` is only a frontend shortcut and can become stale.
