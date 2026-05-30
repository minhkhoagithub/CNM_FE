export const buildNotificationQuery = (notification = {}) => {
  const params = new URLSearchParams();
  params.set("notification", "1");

  const copy = (key, value) => {
    if (value !== null && value !== undefined && String(value).trim()) {
      params.set(key, String(value));
    }
  };

  copy("type", notification.type);
  copy("targetType", notification.targetType);
  copy("targetId", notification.targetId);
  copy("conversationId", notification.conversationId);
  copy("messageId", notification.messageId);
  copy("postId", notification.postId);
  copy("commentId", notification.commentId);
  copy("callId", notification.callId || notification.metadata?.callId);
  copy(
    "reminderId",
    notification.targetType === "REMINDER"
      ? notification.targetId
      : notification.reminderId || notification.metadata?.reminderId
  );
  copy("notificationId", notification.id || notification.notificationId);
  copy("actorId", notification.actorId);

  return `/?${params.toString()}`;
};

export const getNotificationTargetKind = (notification = {}) => {
  const targetType = String(notification.targetType || "").toUpperCase();
  const type = String(notification.type || "").toUpperCase();

  if (targetType === "REMINDER" || type.startsWith("REMINDER")) {
    return "reminders";
  }
  if (targetType === "CONVERSATION" || targetType === "MESSAGE" || notification.conversationId) {
    return "conversation";
  }
  if (targetType === "POST" || targetType === "COMMENT" || notification.postId) {
    return "timeline";
  }
  if (targetType === "FRIEND_REQUEST" || type.startsWith("FRIEND_REQUEST")) {
    return "friends";
  }
  if (targetType === "CALL" || type.includes("CALL")) {
    return "call";
  }
  if (targetType === "USER") {
    return "profile";
  }

  return "notifications";
};

export const navigateToNotificationTarget = (notification, navigate) => {
  const href = buildNotificationQuery(notification);
  navigate(href);
  window.dispatchEvent(
    new CustomEvent("notification:navigate", {
      detail: {
        notification,
        kind: getNotificationTargetKind(notification),
      },
    }),
  );
};
