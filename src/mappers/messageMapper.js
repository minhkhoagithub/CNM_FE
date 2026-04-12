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

export const RECALLED_MESSAGE_PLACEHOLDER = "Tin nhan da duoc thu hoi";

const pickFirstText = (...values) => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmedValue = value.trim();
    if (trimmedValue) {
      return trimmedValue;
    }
  }

  return "";
};

const getAttachmentCount = (value) =>
  Array.isArray(value?.attachments)
    ? value.attachments.length
    : Array.isArray(value?.files)
    ? value.files.length
    : Array.isArray(value?.attachmentSnapshots)
    ? value.attachmentSnapshots.length
    : 0;

export const createReplyPreviewText = (value) => {
  if (value?.deletedAt || value?.deleted) {
    return RECALLED_MESSAGE_PLACEHOLDER;
  }

  const contentPreview = pickFirstText(
    value?.contentPreview,
    value?.content,
    value?.text,
    value?.message,
    value?.body
  );
  if (contentPreview) {
    return contentPreview;
  }

  const attachmentCount = getAttachmentCount(value);
  if (attachmentCount > 0) {
    return attachmentCount === 1
      ? "Da gui 1 tep dinh kem"
      : `Da gui ${attachmentCount} tep dinh kem`;
  }

  return "Tin nhan";
};

const mapReplyInfo = (replyTo) => {
  if (!replyTo) {
    return null;
  }

  return {
    messageId: replyTo.messageId || replyTo.replyToMessageId || replyTo.id || null,
    senderId: replyTo.senderId || replyTo.userId || null,
    senderDisplayName:
      pickFirstText(
        replyTo.senderDisplayName,
        replyTo.displayName,
        replyTo.sender?.displayName,
        replyTo.sender?.username,
        replyTo.user?.displayName,
        replyTo.user?.username
      ) || null,
    contentPreview: createReplyPreviewText(replyTo),
    type: replyTo.type || null,
  };
};

export const isImageAttachment = (attachment) => {
  const contentType = attachment?.contentType || "";
  const attachmentType = attachment?.type || "";

  return contentType.startsWith("image/") || attachmentType === "IMAGE";
};

export const mapMessage = (message) => {
  const deletedAt =
    message?.deletedAt ||
    (message?.deleted
      ? message?.updatedAt || message?.editedAt || message?.createdAt || null
      : null);
  const isDeleted = Boolean(deletedAt);
  const attachments =
    !isDeleted && Array.isArray(message?.attachments)
      ? message.attachments.map(mapAttachment)
      : [];

  return {
    id: message?.id || null,
    conversationId: message?.conversationId || null,
    senderId: message?.senderId || null,
    senderDisplayName:
      pickFirstText(
        message?.senderDisplayName,
        message?.senderName,
        message?.sender?.displayName,
        message?.sender?.username
      ) || null,
    content: isDeleted ? RECALLED_MESSAGE_PLACEHOLDER : message?.content || "",
    attachments,
    reactions:
      !isDeleted && Array.isArray(message?.reactions)
        ? message.reactions.map(mapReaction)
        : [],
    myReaction: isDeleted ? null : message?.myReaction || null,
    seen: Boolean(message?.seen),
    createdAt: message?.createdAt || null,
    editedAt: isDeleted ? null : message?.editedAt || null,
    deletedAt,
    replyTo: isDeleted
      ? null
      : mapReplyInfo(message?.replyTo || message?.reply || message?.replySnapshot),
    raw: message,
  };
};

const getMessageSortValue = (value) => {
  const timestamp = new Date(value || "").getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const compareMessageTimeline = (leftMessage, rightMessage) => {
  const timeDiff =
    getMessageSortValue(leftMessage?.createdAt) - getMessageSortValue(rightMessage?.createdAt);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  const leftId = Number(leftMessage?.id);
  const rightId = Number(rightMessage?.id);

  if (!Number.isNaN(leftId) && !Number.isNaN(rightId)) {
    return leftId - rightId;
  }

  return String(leftMessage?.id || "").localeCompare(String(rightMessage?.id || ""));
};

export const sortMessagesByTimeline = (messages) =>
  normalizeMessageList(messages).slice().sort(compareMessageTimeline);

export const mapMessagePage = (messagePage) => {
  const items = Array.isArray(messagePage?.items) ? messagePage.items : [];

  return {
    items: items.slice().reverse().map(mapMessage),
    nextCursor: messagePage?.nextCursor || null,
    hasMore: Boolean(messagePage?.hasMore),
    raw: messagePage,
  };
};

export const normalizeMessageList = (messages) => (Array.isArray(messages) ? messages : []);

export const upsertMessageItem = (messages, nextMessage) => {
  const normalizedMessages = normalizeMessageList(messages);

  if (!nextMessage?.id) {
    return sortMessagesByTimeline([...normalizedMessages, nextMessage]);
  }

  const existingIndex = normalizedMessages.findIndex(
    (message) => message.id === nextMessage.id
  );

  if (existingIndex === -1) {
    return sortMessagesByTimeline([...normalizedMessages, nextMessage]);
  }

  return sortMessagesByTimeline(
    normalizedMessages.map((message) =>
      message.id === nextMessage.id ? { ...message, ...nextMessage } : message
    )
  );
};

export const markMessageAsDeleted = (messages, messageId, deletedAt) =>
  normalizeMessageList(messages).map((message) =>
    message.id === messageId
      ? {
          ...message,
          deletedAt: deletedAt || message.deletedAt || new Date().toISOString(),
          content: RECALLED_MESSAGE_PLACEHOLDER,
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

// Remove-for-me is local-only visibility; do not convert it to a recalled placeholder.
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
