import React, { useEffect, useRef, useState } from "react";
import { FiBell } from "react-icons/fi";
import { useNotifications } from "../../Context/NotificationContext";
import NotificationDropdown from "./NotificationDropdown";

export default function NotificationBell({ onViewAll }) {
  const { unreadCount, loadUnreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    void loadUnreadCount();
  }, [loadUnreadCount]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="notification-bell-wrap" ref={ref}>
      <button
        className={`notification-bell-btn ${open ? "active" : ""}`}
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Thông báo"
      >
        <FiBell />
        {unreadCount > 0 ? (
          <span className="notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <NotificationDropdown
          onViewAll={() => {
            setOpen(false);
            onViewAll?.();
          }}
        />
      ) : null}
    </div>
  );
}
