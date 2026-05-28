import { registerDeviceToken } from "./notificationApi";
import { getOrCreateWebDeviceId } from "./webDeviceId";

const requiredConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseConfig = () =>
  Boolean(
    requiredConfig.apiKey &&
      requiredConfig.authDomain &&
      requiredConfig.projectId &&
      requiredConfig.messagingSenderId &&
      requiredConfig.appId &&
      import.meta.env.VITE_FIREBASE_VAPID_KEY,
  );

const isSupportedEnvironment = () =>
  typeof window !== "undefined" &&
  "Notification" in window &&
  "serviceWorker" in navigator;

const logWebPushSkip = (reason, details = {}) => {
  console.warn("[WebPush] Registration skipped", {
    reason,
    ...details,
  });
};

let messagingPromise = null;

const getMessagingInstance = async () => {
  if (!hasFirebaseConfig() || !isSupportedEnvironment()) {
    return null;
  }

  if (!messagingPromise) {
    messagingPromise = Promise.all([
      import("firebase/app"),
      import("firebase/messaging"),
    ]).then(async ([appModule, messagingModule]) => {
      const app =
        appModule.getApps().length > 0
          ? appModule.getApp()
          : appModule.initializeApp(requiredConfig);

      const supported = await messagingModule.isSupported().catch(() => false);
      if (!supported) {
        return null;
      }

      return messagingModule.getMessaging(app);
    });
  }

  return messagingPromise;
};

const buildServiceWorkerUrl = () => {
  const params = new URLSearchParams();
  Object.entries(requiredConfig).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
};

export const isWebPushConfigAvailable = () => hasFirebaseConfig();

export const registerWebPushToken = async () => {
  if (!hasFirebaseConfig()) {
    logWebPushSkip("WEB_PUSH_NOT_CONFIGURED", {
      missingVapidKey: !import.meta.env.VITE_FIREBASE_VAPID_KEY,
      missingProjectId: !requiredConfig.projectId,
      missingSenderId: !requiredConfig.messagingSenderId,
      missingAppId: !requiredConfig.appId,
    });
    return { registered: false, reason: "WEB_PUSH_NOT_CONFIGURED" };
  }

  if (!isSupportedEnvironment()) {
    logWebPushSkip("WEB_PUSH_UNSUPPORTED_ENVIRONMENT");
    return { registered: false, reason: "WEB_PUSH_UNSUPPORTED_ENVIRONMENT" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    logWebPushSkip("PERMISSION_DENIED", { permission });
    return { registered: false, reason: "PERMISSION_DENIED" };
  }

  const messaging = await getMessagingInstance();
  if (!messaging) {
    logWebPushSkip("MESSAGING_UNSUPPORTED");
    return { registered: false, reason: "MESSAGING_UNSUPPORTED" };
  }

  const { getToken } = await import("firebase/messaging");
  const registration = await navigator.serviceWorker.register(buildServiceWorkerUrl());
  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    logWebPushSkip("TOKEN_EMPTY");
    return { registered: false, reason: "TOKEN_EMPTY" };
  }

  try {
    await registerDeviceToken({
      deviceId: getOrCreateWebDeviceId(),
      platform: "WEB",
      provider: "FCM",
      token,
    });
  } catch (error) {
    console.warn("[WebPush] Backend token registration failed", {
      message: error?.message,
      status: error?.response?.status,
    });
    return { registered: false, reason: "TOKEN_REGISTRATION_FAILED" };
  }

  return { registered: true };
};

export const listenForForegroundPush = async (handler) => {
  const messaging = await getMessagingInstance();
  if (!messaging) {
    return () => {};
  }

  const { onMessage } = await import("firebase/messaging");
  return onMessage(messaging, handler);
};
