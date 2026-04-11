const mapAttachment = (attachment) => ({
  id: attachment?.id || null,
  url: attachment?.url || "",
  storageKey: attachment?.storageKey || null,
  fileName: attachment?.fileName || "",
  contentType: attachment?.contentType || "",
  fileSize: attachment?.fileSize || 0,
  type: attachment?.type || null,
});

const mapReaction = (reaction) => ({
  type: reaction?.type || null,
  count: Number(reaction?.count || 0),
});

const mapReplyInfo = (replyTo) => {
  if (!replyTo) {
    return null;
  }

  return {
    messageId: replyTo.messageId || null,
    senderId: replyTo.senderId || null,
    contentPreview: replyTo.contentPreview || "",
    type: replyTo.type || null,
  };
};

export const isImageAttachment = (attachment) => {
  const contentType = attachment?.contentType || "";
  const attachmentType = attachment?.type || "";

  return contentType.startsWith("image/") || attachmentType === "IMAGE";
};

export const mapMessage = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments.map(mapAttachment)
    : [];
  const deletedAt =
    message?.deletedAt ||
    (message?.deleted
      ? message?.updatedAt || message?.editedAt || message?.createdAt || null
      : null);

  return {
    id: message?.id || null,
    conversationId: message?.conversationId || null,
    senderId: message?.senderId || null,
    content: message?.content || "",
    attachments,
    reactions: Array.isArray(message?.reactions)
      ? message.reactions.map(mapReaction)
      : [],
    myReaction: message?.myReaction || null,
    seen: Boolean(message?.seen),
    createdAt: message?.createdAt || null,
    editedAt: message?.editedAt || null,
    deletedAt,
    replyTo: mapReplyInfo(message?.replyTo),
    raw: message,
  };
};

export const mapMessagePage = (messagePage) => {
  const items = Array.isArray(messagePage?.items) ? messagePage.items : [];

  return {
    items: items.map(mapMessage),
    nextCursor: messagePage?.nextCursor || null,
    hasMore: Boolean(messagePage?.hasMore),
    raw: messagePage,
  };
};

export const normalizeMessageList = (messages) => (Array.isArray(messages) ? messages : []);

export const upsertMessageItem = (messages, nextMessage) => {
  const normalizedMessages = normalizeMessageList(messages);

  if (!nextMessage?.id) {
    return [...normalizedMessages, nextMessage];
  }

  const existingIndex = normalizedMessages.findIndex(
    (message) => message.id === nextMessage.id
  );

  if (existingIndex === -1) {
    return [...normalizedMessages, nextMessage];
  }

  return normalizedMessages.map((message) =>
    message.id === nextMessage.id ? { ...message, ...nextMessage } : message
  );
};

export const markMessageAsDeleted = (messages, messageId, deletedAt) =>
  normalizeMessageList(messages).map((message) =>
    message.id === messageId
      ? {
          ...message,
          deletedAt: deletedAt || message.deletedAt || new Date().toISOString(),
          content: "Tin nhan da duoc thu hoi",
          attachments: [],
          reactions: [],
          myReaction: null,
          editedAt: null,
          replyTo: null,
        }
      : message
  );

export const updateMessageReactionSummary = (
  messages,
  messageId,
  reactions,
  myReaction
) =>
  normalizeMessageList(messages).map((message) =>
    message.id === messageId
      ? {
          ...message,
          reactions: Array.isArray(reactions) ? reactions : message.reactions || [],
          myReaction:
            myReaction === undefined ? message.myReaction || null : myReaction || null,
        }
      : message
  );

export const removeMessageItem = (messages, messageId) =>
  normalizeMessageList(messages).filter((message) => message.id !== messageId);

export const createAttachmentPreviewText = (messageText, attachments) => {
  if (messageText) {
    return messageText;
  }

  if (!attachments.length) {
    return "";
  }

  return attachments.length === 1
    ? "Da gui 1 tep dinh kem"
    : `Da gui ${attachments.length} tep dinh kem`;
};
