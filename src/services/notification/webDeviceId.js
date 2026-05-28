const WEB_DEVICE_ID_KEY = "webDeviceId";

const createId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

export const getOrCreateWebDeviceId = () => {
  const existing = localStorage.getItem(WEB_DEVICE_ID_KEY) || localStorage.getItem("deviceId");
  if (existing) {
    localStorage.setItem(WEB_DEVICE_ID_KEY, existing);
    return existing;
  }

  const nextId = createId();
  localStorage.setItem(WEB_DEVICE_ID_KEY, nextId);
  return nextId;
};
