import chatHttpClient from "./chatHttpClient";
import { mapConversation } from "../../mappers/conversationMapper";

const unwrapResponseData = (response) => response.data?.data ?? response.data;

export const getConversations = async ({ archived = false } = {}) => {
  const response = await chatHttpClient.get("/conversations", {
    params: { archived },
  });

  return unwrapResponseData(response);
};

export const getCreatedConversations = async ({ archived = false } = {}) => {
  const response = await chatHttpClient.get("/conversations/created-by-me", {
    params: { archived },
  });

  return unwrapResponseData(response);
};

export const createConversationV1 = async (payload) => {
  const response = await chatHttpClient.post("/conversations", payload);
  return unwrapResponseData(response);
};

export const openOrCreatePrivateConversationV1 = async (participantUserId) => {
  if (!participantUserId) {
    throw new Error("Participant user id is required");
  }

  const conversation = await createConversationV1({
    type: "PRIVATE",
    participantIds: [participantUserId],
  });

  return mapConversation(conversation);
};

export const updateConversationMuteV1 = async (conversationId, muted) => {
  const response = await chatHttpClient.patch(`/conversations/${conversationId}/mute`, {
    muted,
  });
  return unwrapResponseData(response);
};

export const updateConversationArchiveV1 = async (conversationId, archived) => {
  const response = await chatHttpClient.patch(`/conversations/${conversationId}/archive`, {
    archived,
  });
  return unwrapResponseData(response);
};

export const updateConversationPinV1 = async (conversationId, pinned) => {
  const response = await chatHttpClient.patch(`/conversations/${conversationId}/pin`, {
    pinned,
  });
  return unwrapResponseData(response);
};

export const updateConversationNotificationLevelV1 = async (
  conversationId,
  notificationLevel
) => {
  const response = await chatHttpClient.patch(
    `/conversations/${conversationId}/notification-level`,
    {
      notificationLevel,
    }
  );
  return unwrapResponseData(response);
};

export const updateConversationCustomNameV1 = async (conversationId, customName) => {
  const response = await chatHttpClient.patch(
    `/conversations/${conversationId}/custom-name`,
    {
      customName,
    }
  );
  return unwrapResponseData(response);
};

export const updateConversationAvatarV1 = async (conversationId, avatarUrl) => {
  const response = await chatHttpClient.patch(`/conversations/${conversationId}/avatar`, {
    avatarUrl,
  });
  return unwrapResponseData(response);
};

export const addConversationMemberV1 = async (conversationId, userId) => {
  const response = await chatHttpClient.post(`/conversations/${conversationId}/members`, {
    userId,
  });
  return unwrapResponseData(response);
};

export const removeConversationMemberV1 = async (conversationId, memberUserId) => {
  const response = await chatHttpClient.delete(
    `/conversations/${conversationId}/members/${memberUserId}`
  );
  return unwrapResponseData(response);
};

export const leaveConversationV1 = async (conversationId) => {
  const response = await chatHttpClient.post(`/conversations/${conversationId}/leave`);
  return unwrapResponseData(response);
};

export const transferConversationOwnershipV1 = async (conversationId, userId) => {
  const response = await chatHttpClient.post(
    `/conversations/${conversationId}/transfer-ownership`,
    { userId }
  );
  return unwrapResponseData(response);
};

export const promoteConversationAdminV1 = async (conversationId, userId) => {
  const response = await chatHttpClient.post(`/conversations/${conversationId}/admins`, {
    userId,
  });
  return unwrapResponseData(response);
};

export const demoteConversationAdminV1 = async (conversationId, targetUserId) => {
  const response = await chatHttpClient.delete(
    `/conversations/${conversationId}/admins/${targetUserId}`
  );
  return unwrapResponseData(response);
};

export const closeConversationV1 = async (conversationId) => {
  const response = await chatHttpClient.delete(`/conversations/${conversationId}`);
  return unwrapResponseData(response);
};
