import axios from "axios";
import { resolveChatUserId } from "./chatSession";
import {
  getSharedWebRefreshPromise,
  handleWebAuthFailure,
  shouldAttemptWebAuthRefresh,
} from "../../util/api/authSession";

const chatHttpClient = axios.create({
  baseURL: import.meta.env.VITE_BASE_API_URL || "http://localhost:8080/api/v1",
  withCredentials: true,
});

chatHttpClient.interceptors.request.use((config) => {
  const nextConfig = { ...config };
  const currentUserId = resolveChatUserId();

  if (currentUserId) {
    nextConfig.headers = {
      ...(config.headers || {}),
      "x-user-id": currentUserId,
    };
  }

  return nextConfig;
});

chatHttpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!shouldAttemptWebAuthRefresh(error, originalRequest)) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      await getSharedWebRefreshPromise(() =>
        axios.post(
          "/auth/refresh-token",
          {},
          {
            baseURL: chatHttpClient.defaults.baseURL,
            withCredentials: true,
          },
        ),
      );

      console.log("[WEB AUTH RETRY REQUEST]", originalRequest.url);
      return chatHttpClient(originalRequest);
    } catch (refreshError) {
      handleWebAuthFailure();
      return Promise.reject(refreshError);
    }
  },
);

export default chatHttpClient;
