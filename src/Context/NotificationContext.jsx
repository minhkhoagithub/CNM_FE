import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import WebSocketService from "../services/WebSocketService";
import {
  deleteNotification as deleteNotificationApi,
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  revokeDeviceToken,
} from "../services/notification/notificationApi";
import { listenForForegroundPush, registerWebPushToken } from "../services/notification/webPushService";
import { getOrCreateWebDeviceId } from "../services/notification/webDeviceId";

const NotificationContext = createContext(null);

const normalizeCount = (payload) =>
  Number(payload?.unreadCount ?? payload?.count ?? payload ?? 0) || 0;

export const NotificationProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pushStatus, setPushStatus] = useState("idle");
  const nextCursorRef = useRef(null);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  const loadUnreadCount = useCallback(async () => {
    const payload = await getUnreadCount();
    setUnreadCount(normalizeCount(payload));
  }, []);

  const loadNotifications = useCallback(async ({ reset = true, unreadOnly = false } = {}) => {
    setLoading(true);
    setError("");
    try {
      const payload = await getNotifications({
        cursor: reset ? null : nextCursorRef.current,
        limit: 20,
        unreadOnly,
      });
      const nextItems = Array.isArray(payload?.items) ? payload.items : [];
      setItems((current) => (reset ? nextItems : [...current, ...nextItems]));
      setNextCursor(payload?.nextCursor ?? null);
      setHasMore(Boolean(payload?.hasMore));
    } catch (err) {
      console.error("[NotificationContext] loadNotifications failed", err);
      setError("Không thể tải thông báo.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadNotifications({ reset: true }), loadUnreadCount()]);
  }, [loadNotifications, loadUnreadCount]);

  const markRead = useCallback(async (notificationId) => {
    const updated = await markNotificationRead(notificationId);
    setItems((current) =>
      current.map((item) =>
        item.id === notificationId ? { ...item, ...updated, unread: false, readAt: updated?.readAt || new Date().toISOString() } : item,
      ),
    );
    await loadUnreadCount();
    return updated;
  }, [loadUnreadCount]);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setItems((current) =>
      current.map((item) => ({
        ...item,
        unread: false,
        readAt: item.readAt || new Date().toISOString(),
      })),
    );
    setUnreadCount(0);
  }, []);

  const hideNotification = useCallback(async (notificationId) => {
    await deleteNotificationApi(notificationId);
    setItems((current) => current.filter((item) => item.id !== notificationId));
    await loadUnreadCount();
  }, [loadUnreadCount]);

  const registerPush = useCallback(async () => {
    setPushStatus("checking");
    try {
      const result = await registerWebPushToken();
      setPushStatus(result.registered ? "registered" : result.reason || "unavailable");
      return result;
    } catch (err) {
      console.warn("[NotificationContext] Web push registration skipped", err);
      setPushStatus("failed");
      return { registered: false, reason: "FAILED" };
    }
  }, []);

  const revokeWebPush = useCallback(async () => {
    try {
      await revokeDeviceToken({
        deviceId: getOrCreateWebDeviceId(),
        platform: "WEB",
      });
    } catch (err) {
      console.warn("[NotificationContext] revoke web token failed", err);
    }
  }, []);

  const clearState = useCallback(() => {
    setItems([]);
    setUnreadCount(0);
    setNextCursor(null);
    setHasMore(false);
    setError("");
  }, []);

  useEffect(() => {
    const handleNotificationRealtime = (event) => {
      const eventType = event?.eventType || event?.type;
      if (event?.unreadCount !== undefined) {
        setUnreadCount(normalizeCount(event));
      }

      if (eventType === "NOTIFICATION_CREATED" && event?.notification) {
        setItems((current) => {
          if (current.some((item) => item.id === event.notification.id)) {
            return current;
          }
          return [event.notification, ...current].slice(0, 50);
        });
        if (event?.unreadCount === undefined) {
          void loadUnreadCount();
        }
      }

      if (eventType === "NOTIFICATION_READ" && event?.notificationId) {
        setItems((current) =>
          current.map((item) =>
            item.id === event.notificationId
              ? { ...item, unread: false, readAt: item.readAt || new Date().toISOString() }
              : item,
          ),
        );
        if (event?.unreadCount === undefined) {
          void loadUnreadCount();
        }
      }

      if (eventType === "NOTIFICATIONS_READ_ALL") {
        setItems((current) =>
          current.map((item) => ({
            ...item,
            unread: false,
            readAt: item.readAt || new Date().toISOString(),
          })),
        );
        setUnreadCount(0);
      }
    };

    WebSocketService.on("notification", handleNotificationRealtime);
    return () => WebSocketService.off("notification", handleNotificationRealtime);
  }, [loadUnreadCount]);

  useEffect(() => {
    const onFocus = () => {
      void loadUnreadCount();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadUnreadCount]);

  useEffect(() => {
    let unsubscribe = () => {};
    listenForForegroundPush((payload) => {
      console.log("[NotificationContext] foreground push", payload?.data || payload);
      void loadUnreadCount();
    })
      .then((unsub) => {
        unsubscribe = typeof unsub === "function" ? unsub : () => {};
      })
      .catch(() => {});

    return () => unsubscribe();
  }, [loadUnreadCount]);

  const value = useMemo(
    () => ({
      items,
      unreadCount,
      nextCursor,
      hasMore,
      loading,
      error,
      pushStatus,
      refresh,
      loadNotifications,
      loadUnreadCount,
      markRead,
      markAllRead,
      hideNotification,
      registerPush,
      revokeWebPush,
      clearState,
    }),
    [
      items,
      unreadCount,
      nextCursor,
      hasMore,
      loading,
      error,
      pushStatus,
      refresh,
      loadNotifications,
      loadUnreadCount,
      markRead,
      markAllRead,
      hideNotification,
      registerPush,
      revokeWebPush,
      clearState,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
};
