import { setChatUserId } from "../../services/chat/chatSession";

const LOGIN_ROUTE = "/auth/login";
const AUTH_ROUTE_PREFIX = "/auth/";

let refreshPromise = null;
let authFailureHandled = false;

const clearWebSessionStorage = () => {
  localStorage.setItem("isLogin", "false");
  localStorage.removeItem("userProfile");
  localStorage.removeItem("deviceId");
  setChatUserId(null);
};

const isRefreshEndpoint = (url = "") => url.includes("/auth/refresh-token");

export const isWebSessionActive = () => localStorage.getItem("isLogin") === "true";

export const shouldAttemptWebAuthRefresh = (error, originalRequest) => {
  if (!isWebSessionActive()) {
    return false;
  }

  if (!error?.response || error.response.status !== 401 || !originalRequest) {
    return false;
  }

  if (originalRequest._retry || originalRequest._skipAuthRefresh) {
    return false;
  }

  return !isRefreshEndpoint(originalRequest.url);
};

export const getSharedWebRefreshPromise = (startRefresh) => {
  if (!refreshPromise) {
    console.log("[WEB AUTH REFRESH START]");
    refreshPromise = Promise.resolve()
      .then(startRefresh)
      .then((result) => {
        authFailureHandled = false;
        console.log("[WEB AUTH REFRESH SUCCESS]");
        return result;
      })
      .catch((error) => {
        console.error("[WEB AUTH REFRESH FAILURE]", error);
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

export const handleWebAuthFailure = () => {
  if (authFailureHandled) {
    return;
  }

  authFailureHandled = true;
  clearWebSessionStorage();

  const { pathname } = window.location;
  const isAuthRoute = pathname.startsWith(AUTH_ROUTE_PREFIX);

  if (!isAuthRoute && pathname !== LOGIN_ROUTE) {
    window.location.replace(LOGIN_ROUTE);
  }
};
