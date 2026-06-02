import {
  FiBell,
  FiMessageCircle,
  FiPhone,
  FiUserPlus,
  FiUsers,
  FiHeart,
  FiAtSign,
} from "react-icons/fi";

export const NOTIFICATION_META = {
  NEW_PRIVATE_MESSAGE: {
    icon: FiMessageCircle,
    fallbackTitle: "Tin nhắn mới",
    fallbackBody: "Bạn có tin nhắn mới",
  },
  NEW_GROUP_MESSAGE: {
    icon: FiUsers,
    fallbackTitle: "Tin nhắn nhóm mới",
    fallbackBody: "Bạn có tin nhắn mới trong nhóm",
  },
  GROUP_MENTION: {
    icon: FiAtSign,
    fallbackTitle: "Bạn được nhắc đến",
    fallbackBody: "Bạn được nhắc trong một cuộc trò chuyện",
  },
  REPLY_TO_MY_MESSAGE: {
    icon: FiMessageCircle,
    fallbackTitle: "Phản hồi mới",
    fallbackBody: "Bạn có một phản hồi mới",
  },
  REACTION_TO_MY_MESSAGE: {
    icon: FiHeart,
    fallbackTitle: "Cảm xúc mới",
    fallbackBody: "Có người đã bày tỏ cảm xúc về tin nhắn của bạn",
  },
  INCOMING_PRIVATE_CALL: {
    icon: FiPhone,
    fallbackTitle: "Cuộc gọi đến",
    fallbackBody: "Bạn có cuộc gọi đến",
  },
  MISSED_PRIVATE_CALL: {
    icon: FiPhone,
    fallbackTitle: "Cuộc gọi nhỡ",
    fallbackBody: "Bạn có cuộc gọi nhỡ",
  },
  GROUP_CALL_STARTED: {
    icon: FiPhone,
    fallbackTitle: "Cuộc gọi nhóm",
    fallbackBody: "Một cuộc gọi nhóm đã bắt đầu",
  },
  MISSED_GROUP_CALL: {
    icon: FiPhone,
    fallbackTitle: "Cuộc gọi nhóm nhỡ",
    fallbackBody: "Bạn có cuộc gọi nhóm nhỡ",
  },
  FRIEND_REQUEST_RECEIVED: {
    icon: FiUserPlus,
    fallbackTitle: "Lời mời kết bạn",
    fallbackBody: "Bạn có lời mời kết bạn mới",
  },
  FRIEND_REQUEST_ACCEPTED: {
    icon: FiUserPlus,
    fallbackTitle: "Kết bạn thành công",
    fallbackBody: "Lời mời kết bạn đã được chấp nhận",
  },
  POST_REACTION: {
    icon: FiHeart,
    fallbackTitle: "Cảm xúc bài viết",
    fallbackBody: "Có người đã bày tỏ cảm xúc về bài viết của bạn",
  },
  POST_COMMENT: {
    icon: FiMessageCircle,
    fallbackTitle: "Bình luận mới",
    fallbackBody: "Có bình luận mới trên bài viết của bạn",
  },
  COMMENT_REPLY: {
    icon: FiMessageCircle,
    fallbackTitle: "Trả lời bình luận",
    fallbackBody: "Có người đã trả lời bình luận của bạn",
  },
  COMMENT_MENTION: {
    icon: FiAtSign,
    fallbackTitle: "Bạn được nhắc trong bình luận",
    fallbackBody: "Bạn được nhắc trong một bình luận",
  },
  POST_TAGGED: {
    icon: FiAtSign,
    fallbackTitle: "Bạn được gắn thẻ",
    fallbackBody: "Bạn được gắn thẻ trong một bài viết",
  },
  POST_SHARED: {
    icon: FiMessageCircle,
    fallbackTitle: "Bài viết được chia sẻ",
    fallbackBody: "Có người đã chia sẻ bài viết của bạn",
  },
  REMINDER_CREATED: {
    icon: FiBell,
    fallbackTitle: "Nhắc hẹn mới",
    fallbackBody: "Bạn có một nhắc hẹn mới",
  },
  REMINDER_DUE: {
    icon: FiBell,
    fallbackTitle: "Nhắc hẹn đến giờ",
    fallbackBody: "Bạn có một nhắc hẹn đến hạn",
  },
  REMINDER_UPDATED: {
    icon: FiBell,
    fallbackTitle: "Nhắc hẹn cập nhật",
    fallbackBody: "Một nhắc hẹn đã được cập nhật",
  },
  REMINDER_CANCELLED: {
    icon: FiBell,
    fallbackTitle: "Nhắc hẹn đã hủy",
    fallbackBody: "Một nhắc hẹn đã bị hủy",
  },
};

export const getNotificationMeta = (type) =>
  NOTIFICATION_META[type] || {
    icon: FiBell,
    fallbackTitle: "Thông báo",
    fallbackBody: "Bạn có thông báo mới",
  };

export const getNotificationTitle = (notification) => {
  const meta = getNotificationMeta(notification?.type);
  return notification?.title || meta.fallbackTitle;
};

const pickFirstText = (...values) => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalizedValue = value.trim();
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return "";
};

const extractActorNameFromBody = (body) => {
  const normalizedBody = String(body || "").trim();
  const payloadSeparatorMatch = normalizedBody.match(
    /^(.+?):\s*(?:\[\[[A-Z_]+\]\]|(?:\{|\[)\s*")/
  );
  if (payloadSeparatorMatch?.[1]) {
    return payloadSeparatorMatch[1].trim();
  }

  const technicalMarkerIndex = normalizedBody.search(/\[\[[A-Z_]+\]\]/);
  if (technicalMarkerIndex <= 0) {
    return "";
  }

  return normalizedBody
    .slice(0, technicalMarkerIndex)
    .replace(/[:\s]+$/g, "")
    .trim();
};

const getNotificationActorName = (notification = {}) => {
  const metadata = notification?.metadata || {};

  return pickFirstText(
    metadata.actorName,
    metadata.callerName,
    metadata.senderDisplayName,
    metadata.senderName,
    metadata.displayName,
    notification.actorName,
    notification.callerName,
    notification.senderDisplayName,
    notification.senderName,
    extractActorNameFromBody(notification.body),
  );
};

const isTechnicalNotificationBody = (body) => {
  const normalizedBody = String(body || "").trim();
  return (
    /\[\[[A-Z_]+\]\]/.test(normalizedBody) ||
    /^(?:\{|\[)\s*"/.test(normalizedBody) ||
    /:\s*(?:\{|\[)\s*"/.test(normalizedBody)
  );
};

const getCallNotificationBody = (notification) => {
  const type = String(notification?.type || "").toUpperCase();
  const actorName = getNotificationActorName(notification) || "Ai đó";

  if (type === "MISSED_PRIVATE_CALL") {
    return `${actorName} đã gọi`;
  }
  if (type === "INCOMING_PRIVATE_CALL") {
    return `${actorName} đang gọi cho bạn`;
  }
  if (type === "GROUP_CALL_STARTED") {
    return `${actorName} đã bắt đầu cuộc gọi nhóm`;
  }
  if (type === "MISSED_GROUP_CALL") {
    return `${actorName} đã gọi nhóm`;
  }

  return `${actorName} đã gọi`;
};

const getSystemMessageNotificationBody = (notification) => {
  const body = String(notification?.body || "");
  const actorName = getNotificationActorName(notification) || "Ai đó";

  if (/"?callId"?\s*:/.test(body)) {
    return `${actorName} đã gọi`;
  }
  if (body.includes("[[POLL_VOTE]]")) {
    return `${actorName} đã bình chọn`;
  }
  if (body.includes("[[POLL_CREATE]]")) {
    return `${actorName} đã tạo bình chọn`;
  }
  if (body.includes("[[POLL_ADD_OPTION]]")) {
    return `${actorName} đã thêm phương án bình chọn`;
  }
  if (body.includes("[[GROUP_SYSTEM]]")) {
    return `${actorName} đã cập nhật cuộc trò chuyện`;
  }

  return "";
};

export const getNotificationBody = (notification) => {
  const meta = getNotificationMeta(notification?.type);
  const type = String(notification?.type || "").toUpperCase();
  const actorName = getNotificationActorName(notification) || "Ai đó";

  if (type.includes("CALL")) {
    return getCallNotificationBody(notification);
  }

  const systemBody = getSystemMessageNotificationBody(notification);
  if (systemBody) {
    return systemBody;
  }

  if (notification?.body && !isTechnicalNotificationBody(notification.body)) {
    return notification.body;
  }

  if (isTechnicalNotificationBody(notification?.body)) {
    if (type === "NEW_GROUP_MESSAGE" || type === "GROUP_MENTION") {
      return `${actorName} đã gửi một tin nhắn`;
    }
    if (type === "NEW_PRIVATE_MESSAGE") {
      return `${actorName} đã gửi một tin nhắn`;
    }
  }

  return meta.fallbackBody;
};
