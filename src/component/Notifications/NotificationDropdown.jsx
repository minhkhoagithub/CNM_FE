import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../Context/NotificationContext";
import { navigateToNotificationTarget } from "../../services/notification/notificationNavigation";
import NotificationItem from "./NotificationItem";

export default function NotificationDropdown({ onViewAll }) {
  const navigate = useNavigate();
  const {
    items,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
    registerPush,
    pushStatus,
  } = useNotifications();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleOpen = async (notification) => {
    if (notification?.id && notification?.unread) {
      await markRead(notification.id).catch(() => {});
    }
    navigateToNotificationTarget(notification, navigate);
  };

  return (
    <div className="notification-dropdown">
      <div className="notification-dropdown-header">
        <strong>Thông báo</strong>
        <div className="notification-dropdown-actions">
          {pushStatus !== "registered" ? (
            <button type="button" onClick={() => void registerPush()}>
              Bật push
            </button>
          ) : null}
          <button type="button" onClick={() => void markAllRead()}>
            Đọc hết
          </button>
        </div>
      </div>
      <div className="notification-dropdown-list">
        {loading && items.length === 0 ? (
          <div className="notification-empty">Đang tải thông báo...</div>
        ) : error ? (
          <div className="notification-empty">{error}</div>
        ) : items.length === 0 ? (
          <div className="notification-empty">Chưa có thông báo.</div>
        ) : (
          items.slice(0, 8).map((item) => (
            <NotificationItem key={item.id} notification={item} onOpen={handleOpen} />
          ))
        )}
      </div>
      <button className="notification-view-all" type="button" onClick={onViewAll}>
        Xem tất cả
      </button>
    </div>
  );
}
