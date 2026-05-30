const mapAttachment = (attachment) => ({
  id: attachment?.id || null,
  url: attachment?.url || "",
  storageKey: attachment?.storageKey || null,
  fileName: attachment?.fileName || attachment?.name || "",
  contentType: attachment?.contentType || "",
  fileSize: attachment?.fileSize || 0,
  type: attachment?.type || null,
  durationMs:
    Number.isFinite(Number(attachment?.durationMs)) && Number(attachment?.durationMs) >= 0
      ? Number(attachment?.durationMs)
      : null,
  waveform: Array.isArray(attachment?.waveform)
    ? attachment.waveform
        .map((sample) => Number(sample))
        .filter((sample) => Number.isFinite(sample))
    : null,
  audioFormat:
    typeof attachment?.audioFormat === "string" && attachment.audioFormat.trim()
      ? attachment.audioFormat.trim()
      : null,
});

const mapReaction = (reaction) => ({
  type: reaction?.type || null,
  count: Number(reaction?.count || 0),
});

export const RECALLED_MESSAGE_PLACEHOLDER = "Tin nhắn da duoc thu hoi";

const normalizeUserId = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return String(value).trim();
};

const pickReadUserId = (value) =>
  normalizeUserId(
    typeof value === "object"
      ? value.userId ||
          value.readerUserId ||
          value.seenByUserId ||
          value.id ||
          value._id ||
          value.user?.userId ||
          value.user?.id ||
          value.profile?.userId
      : value
  );

const mapReadUser = (value) => {
  const userId = pickReadUserId(value);
  if (!userId) {
    return null;
  }

  return {
    userId,
    displayName:
      pickFirstText(
        value?.displayName,
        value?.username,
        value?.name,
        value?.user?.displayName,
        value?.user?.username,
        value?.profile?.displayName,
        value?.profile?.username
      ) || "",
    avatarUrl:
      pickFirstText(
        value?.avatarUrl,
        value?.avatar,
        value?.user?.avatarUrl,
        value?.user?.avatar,
        value?.profile?.avatarUrl
      ) || "",
    seenAt: value?.seenAt || value?.readAt || value?.updatedAt || null,
    raw: value,
  };
};

const uniqueReadUsers = (items) => {
  const seenUserIds = new Set();

  return (Array.isArray(items) ? items : [])
    .map(mapReadUser)
    .filter(Boolean)
    .filter((item) => {
      const normalizedUserId = String(item.userId);
      if (seenUserIds.has(normalizedUserId)) {
        return false;
      }

      seenUserIds.add(normalizedUserId);
      return true;
    });
};

const mapReadReceipts = (message) => {
  if (!message || typeof message !== "object") {
    return {
      seenByUserIds: [],
      seenByUsers: [],
      source: "none",
    };
  }

  const idSources = [
    message.seenByUserIds,
    message.seenUserIds,
    message.readByUserIds,
    message.readUserIds,
    message.readerUserIds,
  ].find((items) => Array.isArray(items) && items.length);
  const userSources = [
    message.seenBy,
    message.seenUsers,
    message.readBy,
    message.readUsers,
    message.readers,
  ].find((items) => Array.isArray(items) && items.length);
  const statusSources = [
    message.statuses,
    message.messageStatuses,
    message.deliveryStatuses,
  ].find((items) => Array.isArray(items) && items.length);

  if (Array.isArray(userSources) && userSources.length) {
    const seenByUsers = uniqueReadUsers(userSources);
    return {
      seenByUserIds: seenByUsers.map((item) => item.userId),
      seenByUsers,
      source: "user-list",
    };
  }

  if (Array.isArray(idSources) && idSources.length) {
    const seenByUsers = uniqueReadUsers(idSources);
    return {
      seenByUserIds: seenByUsers.map((item) => item.userId),
      seenByUsers,
      source: "user-id-list",
    };
  }

  if (Array.isArray(statusSources) && statusSources.length) {
    const seenByUsers = uniqueReadUsers(
      statusSources.filter(
        (item) => String(item?.status || "").toUpperCase() === "SEEN"
      )
    );
    return {
      seenByUserIds: seenByUsers.map((item) => item.userId),
      seenByUsers,
      source: "status-list",
    };
  }

  return {
    seenByUserIds: [],
    seenByUsers: [],
    source: message.seen == null ? "none" : "viewer-seen-flag",
  };
};

const getStorage = () =>
  typeof window !== "undefined" && window.localStorage ? window.localStorage : null;

const buildRecallStorageKey = (conversationId, currentUserId) =>
  conversationId && currentUserId
    ? `web:recalled-messages:${currentUserId}:${conversationId}`
    : null;

const buildForwardedStorageKey = (conversationId, currentUserId) =>
  conversationId && currentUserId
    ? `web:forwarded-messages:${currentUserId}:${conversationId}`
    : null;

const readPersistedRecalledMessages = ({ conversationId, currentUserId }) => {
  const storageKey = buildRecallStorageKey(conversationId, currentUserId);
  const storage = getStorage();

  if (!storageKey || !storage) {
    return [];
  }

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.log("[WEB RECALL MAP]", "Failed to read persisted recalled messages", {
      conversationId,
      currentUserId,
      error,
    });
    return [];
  }
};

const writePersistedRecalledMessages = ({
  conversationId,
  currentUserId,
  items,
}) => {
  const storageKey = buildRecallStorageKey(conversationId, currentUserId);
  const storage = getStorage();

  if (!storageKey || !storage) {
    return;
  }

  try {
    if (!items.length) {
      storage.removeItem(storageKey);
      return;
    }

    storage.setItem(storageKey, JSON.stringify(items));
  } catch (error) {
    console.log("[WEB RECALL MAP]", "Failed to persist recalled messages", {
      conversationId,
      currentUserId,
      count: items.length,
      error,
    });
  }
};

const normalizeForwardedMetadata = (item) => {
  if (!item && item !== 0) {
    return null;
  }

  if (typeof item === "string" || typeof item === "number") {
    return {
      id: String(item),
      forwardedFrom: null,
    };
  }

  if (typeof item !== "object") {
    return null;
  }

  const normalizedId = item?.id == null ? "" : String(item.id);
  if (!normalizedId) {
    return null;
  }

  const forwardedFromMessageId =
    item?.forwardedFrom?.messageId == null
      ? null
      : String(item.forwardedFrom.messageId);
  const forwardedFromSenderName =
    [
      item?.forwardedFrom?.senderDisplayName,
      item?.forwardedFromSenderName,
      item?.senderDisplayName,
    ].find((value) => typeof value === "string" && value.trim()) || null;

  return {
    id: normalizedId,
    forwardedFrom:
      forwardedFromMessageId || forwardedFromSenderName
        ? {
            messageId: forwardedFromMessageId,
            senderDisplayName: forwardedFromSenderName,
          }
        : null,
  };
};

const mapForwardedFrom = (message) => {
  const forwardedFromMessageId =
    message?.forwardedFrom?.messageId ??
    message?.metadata?.forwardedFrom?.messageId ??
    message?.raw?.forwardedFrom?.messageId ??
    null;
  const forwardedFromSenderName =
    [
      message?.forwardedFrom?.senderDisplayName,
      message?.metadata?.forwardedFrom?.senderDisplayName,
      message?.raw?.forwardedFrom?.senderDisplayName,
      message?.forwardedFromSenderName,
      message?.metadata?.forwardedFromSenderName,
      message?.raw?.forwardedFromSenderName,
    ].find((value) => typeof value === "string" && value.trim()) || null;

  if (!forwardedFromMessageId && !forwardedFromSenderName) {
    return null;
  }

  return {
    messageId:
      forwardedFromMessageId == null ? null : String(forwardedFromMessageId),
    senderDisplayName: forwardedFromSenderName,
  };
};

const readPersistedForwardedMessages = ({ conversationId, currentUserId }) => {
  const storageKey = buildForwardedStorageKey(conversationId, currentUserId);
  const storage = getStorage();

  if (!storageKey || !storage) {
    return [];
  }

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(normalizeForwardedMetadata).filter(Boolean)
      : [];
  } catch (error) {
    console.log("[WEB FORWARD SEND]", "Failed to read persisted forwarded messages", {
      conversationId,
      currentUserId,
      error,
    });
    return [];
  }
};

const writePersistedForwardedMessages = ({
  conversationId,
  currentUserId,
  items,
}) => {
  const storageKey = buildForwardedStorageKey(conversationId, currentUserId);
  const storage = getStorage();

  if (!storageKey || !storage) {
    return;
  }

  try {
    if (!items.length) {
      storage.removeItem(storageKey);
      return;
    }

    storage.setItem(storageKey, JSON.stringify(items));
  } catch (error) {
    console.log("[WEB FORWARD SEND]", "Failed to persist forwarded messages", {
      conversationId,
      currentUserId,
      count: items.length,
      error,
    });
  }
};

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
      ? "Đã gửi 1 tệp đính kèm"
      : `Đã gửi ${attachmentCount} tệp đính kèm`;
  }

  return "Tin nhắn";
};

const mapReplyInfo = (replyTo) => {
  if (!replyTo) {
    return null;
  }

  const replyMessageId = replyTo.messageId || replyTo.replyToMessageId || replyTo.id || null;
  const replySenderUserId = replyTo.senderId || replyTo.userId || null;
  const senderDisplayName =
    pickFirstText(
      replyTo.senderDisplayName,
      replyTo.displayName,
      replyTo.sender?.displayName,
      replyTo.sender?.username,
      replyTo.user?.displayName,
      replyTo.user?.username
    ) || null;
  const senderAvatarUrl =
    pickFirstText(
      replyTo.senderAvatarUrl,
      replyTo.senderAvatar,
      replyTo.avatarUrl,
      replyTo.avatar,
      replyTo.sender?.avatarUrl,
      replyTo.sender?.avatar,
      replyTo.user?.avatarUrl,
      replyTo.user?.avatar
    ) || null;

  console.log("[WEB REPLY SENDER]", {
    senderId: replySenderUserId,
    senderDisplayName,
    senderAvatarUrl,
  });

  return {
    messageId: replyMessageId,
    senderId: replySenderUserId,
    senderDisplayName,
    senderAvatarUrl,
    contentPreview: createReplyPreviewText(replyTo),
    type: replyTo.type || null,
  };
};

const getAttachmentFileExtension = (attachment) => {
  const fileName = String(attachment?.fileName || attachment?.name || "")
    .trim()
    .toLowerCase();
  if (!fileName.includes(".")) {
    return "";
  }

  return fileName.split(".").pop() || "";
};

const CALL_LOG_TYPES = new Set(["CALL_LOG", "CALL", "SYSTEM_CALL"]);

const parseDurationSeconds = (value) => {
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) && normalizedValue > 0
    ? Math.floor(normalizedValue)
    : null;
};

const parseCallLog = (message) => {
  const normalizedType = String(message?.type || "").toUpperCase();
  if (!CALL_LOG_TYPES.has(normalizedType)) {
    return null;
  }

  let payload = {};
  if (typeof message?.content === "string" && message.content.trim()) {
    try {
      payload = JSON.parse(message.content);
    } catch {
      payload = {};
    }
  }

  const callType = pickFirstText(
    payload?.callType,
    payload?.type,
    message?.callType,
    message?.raw?.callType
  )
    .toUpperCase()
    .trim();
  const callStatus = pickFirstText(
    payload?.status,
    payload?.callStatus,
    message?.status,
    message?.raw?.status
  )
    .toUpperCase()
    .trim();

  return {
    raw: payload,
    callType: callType || "VOICE",
    callStatus: callStatus || (payload?.groupCallId ? "STARTED" : "ENDED"),
    durationSeconds: parseDurationSeconds(
      payload?.durationSeconds ?? payload?.duration
    ),
    callerId:
      pickFirstText(
        payload?.callerId,
        payload?.senderId,
        message?.callerId,
        message?.senderId
      ) || null,
    groupCallId: payload?.groupCallId || null,
    channel: payload?.channel || null,
    sfuUrl: payload?.sfuUrl || null,
    initiatorName:
      pickFirstText(
        payload?.initiatorName,
        payload?.callerName,
        message?.senderDisplayName
      ) || null,
    conversationType:
      pickFirstText(payload?.conversationType).toUpperCase() || null,
  };
};

export const isImageAttachment = (attachment) => {
  const contentType = String(attachment?.contentType || "").toLowerCase();
  const attachmentType = String(attachment?.type || "").toUpperCase();
  const ext = getAttachmentFileExtension(attachment);

  return (
    contentType.startsWith("image/") ||
    attachmentType === "IMAGE" ||
    ["gif", "jpg", "jpeg", "png", "webp", "bmp", "svg", "heic", "heif"].includes(ext)
  );
};

export const isVideoAttachment = (attachment) => {
  const contentType = String(attachment?.contentType || "").toLowerCase();
  const attachmentType = String(attachment?.type || "").toUpperCase();
  const ext = getAttachmentFileExtension(attachment);

  return (
    contentType.startsWith("video/") ||
    attachmentType === "VIDEO" ||
    ["mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv", "flv", "3gp"].includes(ext)
  );
};

export const isAudioAttachment = (attachment) => {
  const contentType = String(attachment?.contentType || "").toLowerCase();
  const attachmentType = String(attachment?.type || "").toUpperCase();
  const ext = getAttachmentFileExtension(attachment);

  return (
    contentType.startsWith("audio/") ||
    attachmentType === "AUDIO" ||
    ["mp3", "wav", "ogg", "m4a", "aac", "opus", "flac", "webm"].includes(ext)
  );
};

const resolveDeletedAt = (message) =>
  message?.deletedAt ||
  (message?.deleted
    ? message?.updatedAt || message?.editedAt || message?.createdAt || null
    : null);

export const mapMessage = (message) => {
  const deletedAt = resolveDeletedAt(message);
  const isDeleted = Boolean(deletedAt);
  const attachments =
    !isDeleted && Array.isArray(message?.attachments)
      ? message.attachments.map(mapAttachment)
      : [];
  const forwardedFrom = mapForwardedFrom(message);
  const forwarded = Boolean(
    message?.forwarded ||
      message?.isForwarded ||
      forwardedFrom ||
      message?.metadata?.forwarded ||
      message?.raw?.forwarded
  );
  const readReceipts = isDeleted
    ? { seenByUserIds: [], seenByUsers: [], source: "deleted" }
    : mapReadReceipts(message);
  const callLog = isDeleted ? null : parseCallLog(message);

  if (isDeleted) {
    console.log("[WEB RECALL MAP]", {
      source: "backend-message",
      messageId: message?.id ?? null,
      conversationId: message?.conversationId ?? null,
      deletedAt,
    });
  }
  console.log("[WEB GROUP READ MAP]", {
    messageId: message?.id || null,
    conversationId: message?.conversationId || null,
    seenField: message?.seen ?? null,
    receiptSource: readReceipts.source,
    seenByCount: readReceipts.seenByUserIds.length,
  });
  console.log("[WEB MESSAGE SENDER]", {
    messageId: message?.id || null,
    senderId: message?.senderId || null,
    senderDisplayName:
      pickFirstText(
        message?.senderDisplayName,
        message?.senderName,
        message?.sender?.displayName,
        message?.sender?.username
      ) || null,
    senderAvatarUrl:
      pickFirstText(
        message?.senderAvatarUrl,
        message?.senderAvatar,
        message?.sender?.avatarUrl,
        message?.sender?.avatar
      ) || null,
  });
  if (callLog) {
    console.log("[CALL LOG MAP]", {
      source: "web-message",
      messageId: message?.id ?? null,
      conversationId: message?.conversationId ?? null,
      callType: callLog.callType,
      callStatus: callLog.callStatus,
      durationSeconds: callLog.durationSeconds,
      callerId: callLog.callerId,
    });
  }

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
    senderAvatarUrl:
      pickFirstText(
        message?.senderAvatarUrl,
        message?.senderAvatar,
        message?.sender?.avatarUrl,
        message?.sender?.avatar
      ) || null,
    content: isDeleted ? RECALLED_MESSAGE_PLACEHOLDER : message?.content || "",
    attachments,
    reactions:
      !isDeleted && Array.isArray(message?.reactions)
        ? message.reactions.map(mapReaction)
        : [],
    myReaction: isDeleted ? null : message?.myReaction || null,
    seen: message?.seen == null ? null : Boolean(message.seen),
    forwarded,
    forwardedFrom,
    seenByUserIds: readReceipts.seenByUserIds,
    seenByUsers: readReceipts.seenByUsers,
    readReceiptSource: readReceipts.source,
    type: message?.type || "TEXT",
    isCallLog: Boolean(callLog),
    callType: callLog?.callType || null,
    callStatus: callLog?.callStatus || null,
    durationSeconds: callLog?.durationSeconds || null,
    callerId: callLog?.callerId || null,
    callLog,
    pinnedAt: isDeleted ? null : message?.pinnedAt || null,
    createdAt: message?.createdAt || null,
    editedAt: isDeleted ? null : message?.editedAt || null,
    deletedAt,
    replyTo: isDeleted
      ? null
      : mapReplyInfo(message?.replyTo || message?.reply || message?.replySnapshot),
    raw: {
      ...message,
      deletedAt,
      deleted: isDeleted,
      attachments,
      reactions:
        !isDeleted && Array.isArray(message?.reactions)
          ? message.reactions
          : [],
      replyTo: isDeleted
        ? null
        : message?.replyTo || message?.reply || message?.replySnapshot || null,
      content: isDeleted ? null : message?.content || "",
      editedAt: isDeleted ? null : message?.editedAt || null,
      myReaction: isDeleted ? null : message?.myReaction || null,
      seen: isDeleted ? null : message?.seen ?? null,
      pinnedAt: isDeleted ? null : message?.pinnedAt || null,
      forwarded,
      forwardedFrom,
      seenByUserIds: readReceipts.seenByUserIds,
      seenByUsers: readReceipts.seenByUsers,
      readReceiptSource: readReceipts.source,
      isCallLog: Boolean(callLog),
      callType: callLog?.callType || null,
      callStatus: callLog?.callStatus || null,
      durationSeconds: callLog?.durationSeconds || null,
      callerId: callLog?.callerId || null,
      callLog,
    },
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

const buildRecalledMessage = (message, deletedAt) => ({
  ...message,
  content: RECALLED_MESSAGE_PLACEHOLDER,
  attachments: [],
  reactions: [],
  myReaction: null,
  editedAt: null,
  deletedAt: deletedAt || message?.deletedAt || new Date().toISOString(),
  replyTo: null,
  raw: {
    ...(message?.raw || {}),
    id: message?.id || message?.raw?.id || null,
    conversationId:
      message?.conversationId || message?.raw?.conversationId || null,
    senderId: message?.senderId || message?.raw?.senderId || null,
    content: null,
    deletedAt: deletedAt || message?.deletedAt || new Date().toISOString(),
    deleted: true,
    replyTo: null,
    attachments: [],
    reactions: [],
    myReaction: null,
    editedAt: null,
  },
});

export const persistRecalledMessageSnapshot = ({
  conversationId,
  currentUserId,
  message,
  deletedAt,
}) => {
  if (!conversationId || !currentUserId || !message?.id) {
    return;
  }

  const currentItems = readPersistedRecalledMessages({
    conversationId,
    currentUserId,
  });
  const nextMessage = buildRecalledMessage(message, deletedAt);
  const nextItems = [
    ...currentItems.filter((item) => String(item.id) !== String(nextMessage.id)),
    nextMessage,
  ].sort(compareMessageTimeline);

  writePersistedRecalledMessages({
    conversationId,
    currentUserId,
    items: nextItems,
  });
};

export const removePersistedRecalledMessage = ({
  conversationId,
  currentUserId,
  messageId,
}) => {
  if (!conversationId || !currentUserId || !messageId) {
    return;
  }

  const currentItems = readPersistedRecalledMessages({
    conversationId,
    currentUserId,
  });

  writePersistedRecalledMessages({
    conversationId,
    currentUserId,
    items: currentItems.filter((item) => String(item.id) !== String(messageId)),
  });
};

export const mergePersistedRecalledMessages = ({
  conversationId,
  currentUserId,
  messages,
}) => {
  const normalizedMessages = normalizeMessageList(messages);
  const persistedItems = readPersistedRecalledMessages({
    conversationId,
    currentUserId,
  });

  if (!persistedItems.length) {
    return normalizedMessages;
  }

  const nextMessages = new Map(
    normalizedMessages.map((message) => [String(message.id), message])
  );

  persistedItems.forEach((persistedItem) => {
    const existingMessage = nextMessages.get(String(persistedItem.id));
    nextMessages.set(
      String(persistedItem.id),
      existingMessage
        ? buildRecalledMessage(existingMessage, persistedItem.deletedAt)
        : buildRecalledMessage(persistedItem, persistedItem.deletedAt)
    );
  });

  console.log("[WEB RECALL MAP]", {
    conversationId,
    backendCount: normalizedMessages.length,
    persistedCount: persistedItems.length,
    mergedCount: nextMessages.size,
  });

  return sortMessagesByTimeline([...nextMessages.values()]);
};

export const mergePersistedForwardedFlags = ({
  conversationId,
  currentUserId,
  messages,
}) => {
  const normalizedMessages = normalizeMessageList(messages);
  const forwardedMessages = readPersistedForwardedMessages({
    conversationId,
    currentUserId,
  });
  const forwardedMessageMap = new Map(
    forwardedMessages.map((item) => [String(item.id), item.forwardedFrom || null])
  );

  if (!forwardedMessageMap.size) {
    return normalizedMessages;
  }

  return normalizedMessages.map((message) =>
    forwardedMessageMap.has(String(message?.id))
      ? {
          ...message,
          forwarded: true,
          forwardedFrom:
            forwardedMessageMap.get(String(message?.id)) || message?.forwardedFrom || null,
          raw: {
            ...(message?.raw || {}),
            forwarded: true,
            forwardedFrom:
              forwardedMessageMap.get(String(message?.id)) || message?.raw?.forwardedFrom || null,
          },
        }
      : message
  );
};

export const mapMessagePage = (messagePage, options = {}) => {
  const items = Array.isArray(messagePage?.items) ? messagePage.items : [];
  const mappedItems = items.slice().reverse().map(mapMessage);
  const recalledMergedItems = mergePersistedRecalledMessages({
    conversationId: options.conversationId || null,
    currentUserId: options.currentUserId || null,
    messages: mappedItems,
  });

  return {
    items: mergePersistedForwardedFlags({
      conversationId: options.conversationId || null,
      currentUserId: options.currentUserId || null,
      messages: recalledMergedItems,
    }),
    nextCursor: messagePage?.nextCursor || null,
    hasMore: Boolean(messagePage?.hasMore),
    raw: messagePage,
  };
};

export const persistForwardedMessageFlag = ({
  conversationId,
  currentUserId,
  messageId,
  forwardedFrom,
}) => {
  if (!conversationId || !currentUserId || !messageId) {
    return;
  }

  const currentMessages = readPersistedForwardedMessages({
    conversationId,
    currentUserId,
  });
  const normalizedMessageId = String(messageId);
  const nextMessages = [
    ...currentMessages.filter((item) => String(item.id) !== normalizedMessageId),
    {
      id: normalizedMessageId,
      forwardedFrom:
        forwardedFrom?.messageId || forwardedFrom?.senderDisplayName
          ? {
              messageId:
                forwardedFrom?.messageId == null ? null : String(forwardedFrom.messageId),
              senderDisplayName: forwardedFrom?.senderDisplayName || null,
            }
          : null,
    },
  ];

  writePersistedForwardedMessages({
    conversationId,
    currentUserId,
    items: nextMessages,
  });
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
      message.id === nextMessage.id
        ? {
            ...message,
            ...nextMessage,
            forwarded:
              nextMessage.forwarded === undefined
                ? message.forwarded || false
                : nextMessage.forwarded,
            forwardedFrom:
              nextMessage.forwardedFrom === undefined
                ? message.forwardedFrom || null
                : nextMessage.forwardedFrom,
          }
        : message
    )
  );
};

export const markMessageAsDeleted = (messages, messageId, deletedAt) =>
  normalizeMessageList(messages).map((message) =>
    String(message.id) === String(messageId)
      ? buildRecalledMessage(message, deletedAt)
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

export const updateMessageReadReceipt = (messages, payload = {}) => {
  const messageId = payload.messageId || payload.id || null;
  const userId = normalizeUserId(payload.userId || payload.readerUserId);
  const status = String(payload.status || "").toUpperCase();

  if (!messageId || !userId || status !== "SEEN") {
    return normalizeMessageList(messages);
  }

  return normalizeMessageList(messages).map((message) => {
    if (String(message.id) !== String(messageId)) {
      return message;
    }

    const currentUsers = Array.isArray(message.seenByUsers)
      ? message.seenByUsers
      : [];
    const nextUsers = uniqueReadUsers([
      ...currentUsers,
      {
        userId,
        seenAt: payload.updatedAt || payload.seenAt || null,
        raw: payload,
      },
    ]);
    const nextUserIds = nextUsers.map((item) => item.userId);

    console.log("[WEB GROUP READ MAP]", {
      source: "status-event",
      messageId,
      userId,
      seenByCount: nextUserIds.length,
    });

    return {
      ...message,
      seenByUserIds: nextUserIds,
      seenByUsers: nextUsers,
      readReceiptSource: "status-event",
      raw: {
        ...(message.raw || {}),
        seenByUserIds: nextUserIds,
        seenByUsers: nextUsers,
        readReceiptSource: "status-event",
      },
    };
  });
};

// Remove-for-me is local-only visibility; do not convert it to a recalled placeholder.
export const removeMessageItem = (messages, messageId) =>
  normalizeMessageList(messages).filter((message) => String(message.id) !== String(messageId));

export const createAttachmentPreviewText = (messageText, attachments) => {
  if (messageText) {
    return messageText;
  }

  if (!attachments.length) {
    return "";
  }

  if (
    attachments.length === 1 &&
    isAudioAttachment(attachments[0]) &&
    !isImageAttachment(attachments[0]) &&
    !isVideoAttachment(attachments[0])
  ) {
    return "Đã gửi tin nhắn thoại";
  }

  return attachments.length === 1
    ? "Đã gửi 1 tệp đính kèm"
    : `Đã gửi ${attachments.length} tệp đính kèm`;
};



