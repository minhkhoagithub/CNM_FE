import chatHttpClient from "./chatHttpClient";

const unwrapResponseData = (response) => response.data?.data ?? response.data;

const resolveUploadedFileUrl = (payload) =>
  typeof payload === "string"
    ? payload.trim()
    : String(
        payload?.url ||
          payload?.fileUrl ||
          payload?.downloadUrl ||
          payload?.publicUrl ||
          payload?.attachmentUrl ||
          payload?.data?.url ||
          payload?.data?.fileUrl ||
          ""
      ).trim();

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

export const getMessageContextV1 = async (
  conversationId,
  { messageId, range = 50 } = {}
) => {
  const response = await chatHttpClient.get(`/messages/${conversationId}/context`, {
    params: {
      messageId,
      range,
    },
  });

  return unwrapResponseData(response);
};

export const markConversationSeen = async (
  conversationId,
  { lastReadMessageId } = {}
) => {
  const normalizedLastReadMessageId = Number(lastReadMessageId);
  const hasExplicitCursor =
    Number.isFinite(normalizedLastReadMessageId) && normalizedLastReadMessageId > 0;

  const response = await chatHttpClient.patch(
    `/messages/mark-seen/${conversationId}`,
    hasExplicitCursor ? { lastReadMessageId: normalizedLastReadMessageId } : null
  );
  return unwrapResponseData(response);
};

export const markConversationDelivered = async (
  conversationId,
  { lastDeliveredMessageId } = {}
) => {
  const normalizedLastDeliveredMessageId = Number(lastDeliveredMessageId);
  const hasExplicitCursor =
    Number.isFinite(normalizedLastDeliveredMessageId) &&
    normalizedLastDeliveredMessageId > 0;

  const response = await chatHttpClient.patch(
    `/messages/mark-delivered/${conversationId}`,
    hasExplicitCursor ? { lastDeliveredMessageId: normalizedLastDeliveredMessageId } : null
  );
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

export const pinMessageV1 = async (messageId, payload) => {
  const response = await chatHttpClient.patch(`/messages/${messageId}/pin`, payload);
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

  const payload = unwrapResponseData(response);
  const resolvedUrl = resolveUploadedFileUrl(payload);
  if (!resolvedUrl || payload?.url) {
    return payload;
  }

  return payload && typeof payload === "object" ? { ...payload, url: resolvedUrl } : { url: resolvedUrl };
};
