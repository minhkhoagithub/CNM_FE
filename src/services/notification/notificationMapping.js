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

export const getNotificationBody = (notification) => {
  const meta = getNotificationMeta(notification?.type);
  return notification?.body || meta.fallbackBody;
};
