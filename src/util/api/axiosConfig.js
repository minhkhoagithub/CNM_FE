import axios from "axios";
import {
  getSharedWebRefreshPromise,
  handleWebAuthFailure,
  shouldAttemptWebAuthRefresh,
} from "./authSession";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_BASE_API_URL || "http://localhost:8080/api/v1",
  withCredentials: true,
});

apiClient.interceptors.response.use(
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
            baseURL: apiClient.defaults.baseURL,
            withCredentials: true,
          },
        ),
      );

      console.log("[WEB AUTH RETRY REQUEST]", originalRequest.url);
      return apiClient(originalRequest);
    } catch (refreshError) {
      handleWebAuthFailure();
      return Promise.reject(refreshError);
    }
  },
);

export default apiClient;
