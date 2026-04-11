import chatHttpClient from "./chatHttpClient";

const unwrapResponseData = (response) => response.data?.data ?? response.data;

export const getConversationMessages = async (conversationId, { cursor = null, size = 50 } = {}) => {
  const response = await chatHttpClient.get(`/messages/${conversationId}`, {
    params: {
      size,
      ...(cursor ? { cursor } : {}),
    },
  });

  return unwrapResponseData(response);
};

export const sendMessageV1 = async (payload) => {
  const response = await chatHttpClient.post("/messages", payload);
  return unwrapResponseData(response);
};

export const markConversationSeen = async (conversationId) => {
  const response = await chatHttpClient.patch(`/messages/mark-seen/${conversationId}`);
  return unwrapResponseData(response);
};

export const sendTypingState = async (conversationId, isTyping) => {
  const response = await chatHttpClient.post(`/messages/typing/${conversationId}`, null, {
    params: { isTyping },
  });

  return unwrapResponseData(response);
};

export const editMessageV1 = async (messageId, payload) => {
  const response = await chatHttpClient.patch(`/messages/${messageId}`, payload);
  return unwrapResponseData(response);
};

export const deleteMessageV1 = async (messageId) => {
  const response = await chatHttpClient.delete(`/messages/${messageId}`);
  return unwrapResponseData(response);
};

export const addOrUpdateReactionV1 = async (messageId, reactionType) => {
  const response = await chatHttpClient.put(`/messages/${messageId}/reaction`, {
    reactionType,
  });
  return unwrapResponseData(response);
};

export const removeReactionV1 = async (messageId) => {
  const response = await chatHttpClient.delete(`/messages/${messageId}/reaction`);
  return unwrapResponseData(response);
};

export const hideMessageV1 = async (messageId) => {
  const response = await chatHttpClient.post(`/messages/${messageId}/hide`);
  return unwrapResponseData(response);
};

export const removeMessageForMeV1 = async (messageId) => {
  const response = await chatHttpClient.patch(`/messages/${messageId}/remove-for-me`);
  return unwrapResponseData(response);
};

export const uploadAttachmentV1 = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await chatHttpClient.post("/messages/attachments/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return unwrapResponseData(response);
};
