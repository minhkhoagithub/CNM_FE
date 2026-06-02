import chatHttpClient from "../chat/chatHttpClient";

const unwrapResponseData = (response) => response?.data?.data ?? response?.data;

export const getUserPresence = async (userId) => {
  const response = await chatHttpClient.get(`/presence/users/${userId}`);
  return unwrapResponseData(response);
};

export const getBatchPresence = async (userIds = []) => {
  const response = await chatHttpClient.post("/presence/users/batch", {
    userIds,
  });
  return unwrapResponseData(response);
};

export const getConversationPresence = async (conversationId) => {
  const response = await chatHttpClient.get(`/presence/conversations/${conversationId}`);
  return unwrapResponseData(response);
};

