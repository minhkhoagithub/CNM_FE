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
import NotificationToast from "../component/Notifications/NotificationToast";
import { getNotificationTargetKind } from "../services/notification/notificationNavigation";
import { getUserSettings } from "../util/api";

const NotificationContext = createContext(null);
export const NOTIFICATION_SETTINGS_CHANGED_EVENT = "notification-settings-changed";

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
  const [topToastNotification, setTopToastNotification] = useState(null);
  const nextCursorRef = useRef(null);
  const topToastTimeoutRef = useRef(null);
  const notificationSoundAudioContextRef = useRef(null);
  const notificationSoundEnabledRef = useRef(true);
  const lastNotificationSoundKeyRef = useRef("");

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

  const dismissTopToast = useCallback(() => {
    if (topToastTimeoutRef.current) {
      clearTimeout(topToastTimeoutRef.current);
      topToastTimeoutRef.current = null;
    }
    setTopToastNotification(null);
  }, []);

  const showTopToast = useCallback((notification) => {
    if (!notification) {
      return;
    }

    if (topToastTimeoutRef.current) {
      clearTimeout(topToastTimeoutRef.current);
    }
    setTopToastNotification(notification);
    topToastTimeoutRef.current = setTimeout(() => {
      setTopToastNotification(null);
      topToastTimeoutRef.current = null;
    }, 6500);
  }, []);

  const ensureNotificationAudioContext = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      return null;
    }

    const currentContext = notificationSoundAudioContextRef.current;
    if (!currentContext || currentContext.state === "closed") {
      notificationSoundAudioContextRef.current = new AudioContextConstructor();
    }

    return notificationSoundAudioContextRef.current;
  }, []);

  const playNotificationSound = useCallback(() => {
    if (!notificationSoundEnabledRef.current) {
      return;
    }

    const audioContext = ensureNotificationAudioContext();
    if (!audioContext) {
      return;
    }

    const startSound = () => {
      if (audioContext.state === "closed") {
        return;
      }

      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.26);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    };

    if (audioContext.state === "suspended") {
      void audioContext.resume().then(startSound).catch(() => {});
      return;
    }

    startSound();
  }, [ensureNotificationAudioContext]);

  const playNotificationSoundForNotification = useCallback(
    (notification) => {
      const notificationId =
        notification?.id ||
        notification?.notificationId ||
        notification?.targetId ||
        notification?.messageId ||
        notification?.reminderId ||
        "";
      const notificationKey = [
        notification?.type || "notification",
        notificationId || notification?.createdAt || notification?.body || "",
      ].join(":");

      if (notificationKey && notificationKey === lastNotificationSoundKeyRef.current) {
        return;
      }

      lastNotificationSoundKeyRef.current = notificationKey;
      playNotificationSound();
    },
    [playNotificationSound],
  );

  const openTopToast = useCallback(
    async (notification) => {
      dismissTopToast();
      if (notification?.id && notification?.unread) {
        await markRead(notification.id).catch(() => {});
      }
      window.dispatchEvent(
        new CustomEvent("notification:navigate", {
          detail: {
            notification,
            kind: getNotificationTargetKind(notification),
          },
        })
      );
    },
    [dismissTopToast, markRead]
  );

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
    let isMounted = true;

    getUserSettings()
      .then((response) => {
        if (!isMounted) {
          return;
        }

        const payload = response?.data?.data ?? response?.data ?? {};
        const soundEnabled = payload?.settings?.notifications?.soundEnabled;
        if (typeof soundEnabled === "boolean") {
          notificationSoundEnabledRef.current = soundEnabled;
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleSettingsChanged = (event) => {
      const soundEnabled = event?.detail?.notifications?.soundEnabled;
      if (typeof soundEnabled === "boolean") {
        notificationSoundEnabledRef.current = soundEnabled;
      }
    };

    window.addEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    return () => window.removeEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      const audioContext = ensureNotificationAudioContext();
      if (audioContext?.state === "suspended") {
        void audioContext.resume().catch(() => {});
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      const audioContext = notificationSoundAudioContextRef.current;
      notificationSoundAudioContextRef.current = null;
      if (audioContext?.state !== "closed") {
        void audioContext?.close?.().catch(() => {});
      }
    };
  }, [ensureNotificationAudioContext]);

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
        showTopToast(event.notification);
        playNotificationSoundForNotification(event.notification);
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
  }, [loadUnreadCount, playNotificationSoundForNotification, showTopToast]);

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
      const data = payload?.data || {};
      const notification = payload?.notification || {};
      const foregroundNotification = {
        id: data.id || data.notificationId || data.targetId || `${Date.now()}`,
        type: data.type,
        title: notification.title || data.title,
        body: notification.body || data.body,
        targetType: data.targetType,
        targetId: data.targetId,
        conversationId: data.conversationId,
        messageId: data.messageId,
        reminderId: data.reminderId,
        metadata: data,
        unread: true,
        createdAt: new Date().toISOString(),
      };
      showTopToast(foregroundNotification);
      playNotificationSoundForNotification(foregroundNotification);
      void loadUnreadCount();
    })
      .then((unsub) => {
        unsubscribe = typeof unsub === "function" ? unsub : () => {};
      })
      .catch(() => {});

    return () => unsubscribe();
  }, [loadUnreadCount, playNotificationSoundForNotification, showTopToast]);

  useEffect(
    () => () => {
      if (topToastTimeoutRef.current) {
        clearTimeout(topToastTimeoutRef.current);
      }
    },
    []
  );

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
      <NotificationToast
        notification={topToastNotification}
        onDismiss={dismissTopToast}
        onOpen={openTopToast}
      />
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
