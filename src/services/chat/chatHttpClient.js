import axios from "axios";
import { resolveChatUserId } from "./chatSession";

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

export default chatHttpClient;
