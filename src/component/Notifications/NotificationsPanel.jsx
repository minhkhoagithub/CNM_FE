import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../Context/NotificationContext";
import { navigateToNotificationTarget } from "../../services/notification/notificationNavigation";
import NotificationItem from "./NotificationItem";

export default function NotificationsPanel() {
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const {
    items,
    hasMore,
    loading,
    error,
    loadNotifications,
    markRead,
    markAllRead,
    hideNotification,
  } = useNotifications();

  useEffect(() => {
    void loadNotifications({ reset: true, unreadOnly });
  }, [loadNotifications, unreadOnly]);

  const handleOpen = async (notification) => {
    if (notification?.id && notification?.unread) {
      await markRead(notification.id).catch(() => {});
    }
    navigateToNotificationTarget(notification, navigate);
  };

  const handleDelete = async (notification) => {
    if (notification?.id) {
      await hideNotification(notification.id).catch(() => {});
    }
  };

  return (
    <div className="notifications-panel">
      <div className="notifications-panel-header">
        <div>
          <h2>Thông báo</h2>
          <p>Theo dõi tin nhắn, cuộc gọi, bạn bè và hoạt động bảng tin.</p>
        </div>
        <div className="notifications-panel-actions">
          <label>
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => setUnreadOnly(event.target.checked)}
            />
            Chưa đọc
          </label>
          <button type="button" onClick={() => void markAllRead()}>
            Đánh dấu đọc hết
          </button>
        </div>
      </div>

      {error ? <div className="notification-panel-error">{error}</div> : null}
      {loading && items.length === 0 ? (
        <div className="notification-panel-empty">Đang tải thông báo...</div>
      ) : items.length === 0 ? (
        <div className="notification-panel-empty">Không có thông báo phù hợp.</div>
      ) : (
        <div className="notifications-panel-list">
          {items.map((item) => (
            <NotificationItem
              key={item.id}
              notification={item}
              onOpen={handleOpen}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {hasMore ? (
        <button
          className="notification-load-more"
          type="button"
          disabled={loading}
          onClick={() => void loadNotifications({ reset: false, unreadOnly })}
        >
          {loading ? "Đang tải..." : "Tải thêm"}
        </button>
      ) : null}
    </div>
  );
}
