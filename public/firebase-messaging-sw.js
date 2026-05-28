/* global importScripts, firebase */

const CONFIG_URL = "/firebase-messaging-config.json";

const readConfigFromUrl = () => {
  try {
    const params = new URL(self.location.href).searchParams;
    const config = {
      apiKey: params.get("apiKey"),
      authDomain: params.get("authDomain"),
      projectId: params.get("projectId"),
      messagingSenderId: params.get("messagingSenderId"),
      appId: params.get("appId"),
    };

    return config.apiKey && config.messagingSenderId && config.appId ? config : null;
  } catch {
    return null;
  }
};

const buildTargetUrl = (data = {}) => {
  const params = new URLSearchParams();
  params.set("notification", "1");

  [
    "type",
    "targetType",
    "targetId",
    "conversationId",
    "messageId",
    "postId",
    "commentId",
    "callId",
    "notificationId",
    "actorId",
  ].forEach((key) => {
    if (data[key]) {
      params.set(key, String(data[key]));
    }
  });

  return `/?${params.toString()}`;
};

const initFirebaseMessaging = async () => {
  try {
    let config = readConfigFromUrl();
    if (!config) {
      const response = await fetch(CONFIG_URL, { cache: "no-store" });
      if (!response.ok) {
        return null;
      }
      config = await response.json();
    }

    if (!config?.apiKey || !config?.messagingSenderId || !config?.appId) {
      return null;
    }

    importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
    importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

    firebase.initializeApp(config);
    return firebase.messaging();
  } catch (error) {
    console.warn("[firebase-messaging-sw] Firebase messaging disabled", error);
    return null;
  }
};

initFirebaseMessaging().then((messaging) => {
  if (!messaging) {
    return;
  }

  messaging.onBackgroundMessage((payload) => {
    const data = payload?.data || {};
    const notification = payload?.notification || {};
    const title = notification.title || data.title || "Thông báo";
    const body = notification.body || data.body || "Bạn có thông báo mới";

    self.registration.showNotification(title, {
      body,
      data,
      icon: "/favicon.svg",
      tag: data.notificationId || data.targetId || undefined,
    });
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = buildTargetUrl(event.notification?.data || {});

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
      return undefined;
    }),
  );
});
