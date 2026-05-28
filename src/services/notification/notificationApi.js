import apiClient from "../../util/api/axiosConfig";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

export const getNotifications = async ({
  cursor = null,
  limit = 20,
  unreadOnly = false,
} = {}) => {
  const response = await apiClient.get("/notifications", {
    params: {
      ...(cursor ? { cursor } : {}),
      limit,
      unreadOnly,
    },
  });
  return unwrap(response);
};

export const getUnreadCount = async () => {
  const response = await apiClient.get("/notifications/unread-count");
  return unwrap(response);
};

export const markNotificationRead = async (notificationId) => {
  const response = await apiClient.patch(`/notifications/${notificationId}/read`);
  return unwrap(response);
};

export const markAllNotificationsRead = async () => {
  const response = await apiClient.patch("/notifications/read-all");
  return unwrap(response);
};

export const deleteNotification = async (notificationId) => {
  const response = await apiClient.delete(`/notifications/${notificationId}`);
  return unwrap(response);
};

export const registerDeviceToken = async ({
  deviceId,
  platform,
  provider,
  token,
}) => {
  const response = await apiClient.post("/device-tokens", {
    deviceId,
    platform,
    provider,
    token,
  });
  return unwrap(response);
};

export const revokeDeviceToken = async ({ deviceId, platform }) => {
  const response = await apiClient.delete(
    `/device-tokens/${encodeURIComponent(deviceId)}`,
    {
      params: platform ? { platform } : undefined,
    },
  );
  return unwrap(response);
};
