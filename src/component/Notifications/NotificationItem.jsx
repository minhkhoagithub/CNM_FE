import React from "react";
import {
  getNotificationBody,
  getNotificationMeta,
  getNotificationTitle,
} from "../../services/notification/notificationMapping";

const formatTime = (value) => {
  if (!value) return "Vừa xong";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Vừa xong";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
};

export default function NotificationItem({ notification, onOpen, onDelete }) {
  const meta = getNotificationMeta(notification?.type);
  const Icon = meta.icon;

  return (
    <div
      className={`notification-item ${notification?.unread ? "unread" : ""}`}
      onClick={() => onOpen?.(notification)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen?.(notification);
      }}
    >
      <div className="notification-item-icon">
        <Icon />
      </div>
      <div className="notification-item-body">
        <div className="notification-item-title">
          {getNotificationTitle(notification)}
        </div>
        <div className="notification-item-text">
          {getNotificationBody(notification)}
        </div>
        <div className="notification-item-time">
          {formatTime(notification?.createdAt)}
        </div>
      </div>
      {notification?.unread ? <span className="notification-unread-dot" /> : null}
      {onDelete ? (
        <button
          className="notification-delete-btn"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(notification);
          }}
          title="Ẩn thông báo"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
