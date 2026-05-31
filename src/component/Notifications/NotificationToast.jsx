import React from "react";
import { FiX } from "react-icons/fi";
import {
  getNotificationBody,
  getNotificationMeta,
  getNotificationTitle,
} from "../../services/notification/notificationMapping";

export default function NotificationToast({ notification, onDismiss, onOpen }) {
  if (!notification) {
    return null;
  }

  const meta = getNotificationMeta(notification?.type);
  const Icon = meta.icon;

  return (
    <div className="notification-top-toast-stack" role="status" aria-live="polite">
      <article className="notification-top-toast">
        <div className="notification-top-toast-header">
          <img
            className="notification-top-toast-app-icon"
            src="/favicon.svg"
            alt=""
            aria-hidden="true"
          />
          <span className="notification-top-toast-app-name">zalo-ui-web</span>
          <button
            className="notification-top-toast-close"
            type="button"
            aria-label="Đóng thông báo"
            onClick={(event) => {
              event.stopPropagation();
              onDismiss?.();
            }}
          >
            <FiX />
          </button>
        </div>
        <button
          className="notification-top-toast-body"
          type="button"
          onClick={() => onOpen?.(notification)}
        >
          <span className="notification-top-toast-icon">
            <Icon />
          </span>
          <span className="notification-top-toast-content">
            <strong>{getNotificationTitle(notification)}</strong>
            <span>{getNotificationBody(notification)}</span>
          </span>
        </button>
      </article>
    </div>
  );
}
