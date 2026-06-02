import chatHttpClient from "../chat/chatHttpClient";

const unwrapResponseData = (response) => response?.data?.data ?? response?.data;

export const createConversationReminder = async (conversationId, payload) => {
  const response = await chatHttpClient.post(
    `/conversations/${conversationId}/reminders`,
    payload
  );
  return unwrapResponseData(response);
};

export const getConversationReminders = async (
  conversationId,
  { status = null, from = null, to = null, page = 0, size = 20 } = {}
) => {
  const params = { page, size };
  if (status) {
    params.status = status;
  }
  if (from) {
    params.from = from;
  }
  if (to) {
    params.to = to;
  }
  const response = await chatHttpClient.get(
    `/conversations/${conversationId}/reminders`,
    { params }
  );
  return unwrapResponseData(response);
};

export const getMyReminders = async ({
  status = null,
  scope = null,
  from = null,
  to = null,
  page = 0,
  size = 20,
} = {}) => {
  const params = { page, size };
  if (status) {
    params.status = status;
  }
  if (scope) {
    params.scope = scope;
  }
  if (from) {
    params.from = from;
  }
  if (to) {
    params.to = to;
  }
  const response = await chatHttpClient.get("/reminders", { params });
  return unwrapResponseData(response);
};

export const updateReminder = async (reminderId, payload) => {
  const response = await chatHttpClient.patch(`/reminders/${reminderId}`, payload);
  return unwrapResponseData(response);
};

export const deleteReminder = async (reminderId) => {
  const response = await chatHttpClient.delete(`/reminders/${reminderId}`);
  return unwrapResponseData(response);
};

export const cancelReminder = async (reminderId) => {
  const response = await chatHttpClient.post(`/reminders/${reminderId}/cancel`);
  return unwrapResponseData(response);
};

export const completeReminder = async (reminderId) => {
  const response = await chatHttpClient.post(`/reminders/${reminderId}/complete`);
  return unwrapResponseData(response);
};

export const ackReminder = async (reminderId) => {
  const response = await chatHttpClient.post(`/reminders/${reminderId}/ack`);
  return unwrapResponseData(response);
};

export const dismissReminder = async (reminderId) => {
  const response = await chatHttpClient.post(`/reminders/${reminderId}/dismiss`);
  return unwrapResponseData(response);
};
