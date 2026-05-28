import SockJS from "sockjs-client";
import Stomp from "stompjs";

if (typeof global === "undefined") {
  window.global = window;
}

const resolveWebSocketUrl = () => {
  const apiBaseUrl =
    import.meta.env.VITE_BASE_API_URL || "http://localhost:8080/api/v1";
  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, "");
  const origin = normalizedApiBaseUrl.replace(/\/api\/v\d+$/, "");

  return `${origin}/ws`;
};

class WebSocketService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.listeners = {};
    this.currentUserId = null;
    this.connectionPromise = null;
    this.subscriptions = [];
  }

  connect(userId) {
    this.currentUserId = userId || this.getCurrentUserId();

    if (this.isConnected && this.client) {
      return Promise.resolve(this.client);
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        console.log("[WebSocket] Connecting to /ws...");

        const socket = new SockJS(resolveWebSocketUrl());
        const client = Stomp.over(socket);
        client.debug = () => {};
        this.client = client;

        client.connect(
          {},
          (frame) => {
            if (this.client !== client) {
              resolve(client);
              return;
            }

            console.log("[WebSocket] Connected to /ws");
            console.log("[WebSocket] Frame:", frame);
            this.isConnected = true;
            this.connectionPromise = null;
            this.setupSubscriptions(client);
            resolve(client);
          },
          (error) => {
            if (this.client === client) {
              this.client = null;
              this.isConnected = false;
            }
            this.connectionPromise = null;
            console.error("[WebSocket] Connection error:", error);
            reject(error);
          },
        );
      } catch (error) {
        this.connectionPromise = null;
        this.client = null;
        this.isConnected = false;
        console.error("[WebSocket] Socket creation error:", error);
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  setupSubscriptions(client = this.client) {
    if (!client || !this.isConnected) {
      return;
    }

    const userId = this.currentUserId || this.getCurrentUserId();
    if (!userId) {
      return;
    }

    try {
      this.clearSubscriptions();

      const subscribeJson = (topic, label, handler) => {
        const subscription = client.subscribe(topic, (message) => {
          try {
            handler(JSON.parse(message.body));
          } catch (error) {
            console.error(`[WebSocket] Error parsing ${label} message:`, error);
          }
        });

        if (subscription) {
          this.subscriptions.push(subscription);
        }
      };

      const deviceLogoutTopic = `/topic/auth/${userId}/device-logout`;
      subscribeJson(deviceLogoutTopic, "device-logout", (event) => {
        console.log("[WebSocket] Device logout notification:", event);
        this.emitEvent("device-logout", event);
      });

      const devicesTopic = `/topic/auth/${userId}/devices`;
      subscribeJson(devicesTopic, "devices", (event) => {
        console.log("[WebSocket] Devices list update:", event);
        this.emitEvent("devices-updated", event);
      });

      const deviceLoginRequestTopic = `/topic/auth/${userId}/device-login-request`;
      subscribeJson(deviceLoginRequestTopic, "device-login-request", (event) => {
        console.log("[WebSocket] Device login approval request:", event);
        this.emitEvent("device-login-request", event);
      });

      subscribeJson("/topic/auth/error", "auth-error", (error) => {
        console.error("[WebSocket] Error from server:", error);
        this.emitEvent("auth-error", error);
      });

      const callsTopic = `/topic/users/${userId}/calls`;
      subscribeJson(callsTopic, "calls", (event) => {
        console.log("[WebSocket] Call event:", event);

        if (event.type === "INCOMING_CALL") {
          this.emitEvent("incoming-call", event.payload);
        } else if (event.type === "CALL_ACCEPTED") {
          this.emitEvent("call-accepted", event.payload);
        } else if (event.type === "CALL_REJECTED") {
          this.emitEvent("call-rejected", event.payload);
        } else if (event.type === "CALL_ENDED") {
          this.emitEvent("call-ended", event.payload);
        } else if (event.type === "CALL_STATUS_CHANGED") {
          this.emitEvent("call-status", event.payload);
        } else if (event.type === "CALL_ACTION") {
          this.emitEvent("call-action", event.payload);
        }
      });

      const notificationsTopic = `/topic/users/${userId}/notifications`;
      subscribeJson(notificationsTopic, "notifications", (event) => {
        console.log("[WebSocket] Notification event:", event);
        this.emitEvent("notification", event);
      });

      console.log(`[WebSocket] Subscribed topics for userId: ${userId}`);
      console.log(`[WebSocket]    - ${deviceLogoutTopic}`);
      console.log(`[WebSocket]    - ${devicesTopic}`);
      console.log(`[WebSocket]    - ${deviceLoginRequestTopic}`);
      console.log('[WebSocket]    - /topic/auth/error');
      console.log(`[WebSocket]    - ${callsTopic}`);
      console.log(`[WebSocket]    - ${notificationsTopic}`);
    } catch (error) {
      console.error('[WebSocket] Error setting up subscriptions:', error);
    }
  }

  // --- Group Call Subscriptions (tách biệt khỏi 1-1) ---
  // Mỗi lần vào GroupChatScreen sẽ subscribe; rời màn hình sẽ unsubscribe.
  // Dùng Map để quản lý nhiều cuộc hội thoại nhóm đồng thời.

  subscribeGroupCall(conversationId) {
    if (!this.client || !this.isConnected) {
      console.warn('[WebSocket] Cannot subscribe group call: not connected');
      return;
    }
    if (!this._groupCallSubs) this._groupCallSubs = new Map();
    if (this._groupCallSubs.has(conversationId)) return; // Đã subscribe rồi

    const topic = `/topic/conversations/${conversationId}/calls`;
    const subscription = this.client.subscribe(topic, (message) => {
      try {
        const event = JSON.parse(message.body);
        console.log(`[WebSocket] Group call event on ${topic}:`, event);

        if (event.type === 'GROUP_CALL_INCOMING') {
          this.emitEvent('group-call-incoming', event.payload || event);
        } else if (event.type === 'GROUP_CALL_ENDED') {
          this.emitEvent('group-call-ended', event.payload || event);
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing group call event:', error);
      }
    });

    if (subscription) {
      this._groupCallSubs.set(conversationId, subscription);
      console.log(`[WebSocket] Subscribed group call topic: ${topic}`);
    }
  }

  unsubscribeGroupCall(conversationId) {
    if (!this._groupCallSubs) return;
    const subscription = this._groupCallSubs.get(conversationId);
    if (subscription) {
      try {
        subscription.unsubscribe();
        this._groupCallSubs.delete(conversationId);
        console.log(`[WebSocket] Unsubscribed group call topic for conversation: ${conversationId}`);
      } catch (error) {
        console.warn('[WebSocket] Error unsubscribing group call:', error);
      }
    }
  }

  logoutDevice(deviceId, platform) {
    if (!this.client || !this.isConnected) {
      console.error("[WebSocket] WebSocket not connected");
      throw new Error("WebSocket not connected");
    }

    try {
      console.log("[WebSocket] Sending logout device:", { deviceId, platform });
      this.client.send(
        "/app/auth/logout-device",
        {},
        JSON.stringify({ deviceId, platform }),
      );
    } catch (error) {
      console.error("[WebSocket] Error sending logout device:", error);
      throw error;
    }
  }

  getDevices() {
    if (!this.client || !this.isConnected) {
      console.error("[WebSocket] WebSocket not connected");
      throw new Error("WebSocket not connected");
    }

    try {
      console.log("[WebSocket] Requesting devices list");
      this.client.send("/app/auth/get-devices", {}, JSON.stringify({}));
    } catch (error) {
      console.error("[WebSocket] Error requesting devices:", error);
      throw error;
    }
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) {
      return;
    }

    this.listeners[event] = this.listeners[event].filter(
      (currentCallback) => currentCallback !== callback,
    );
  }

  emitEvent(event, data) {
    if (!this.listeners[event]) {
      return;
    }

    this.listeners[event].forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[WebSocket] Error in listener for ${event}:`, error);
      }
    });
  }

  getCurrentUserId() {
    try {
      const rawUserProfile = localStorage.getItem("userProfile");
      if (!rawUserProfile) {
        console.warn(
          "[WebSocket] No user profile found for websocket subscriptions",
        );
        return null;
      }

      const userProfile = JSON.parse(rawUserProfile);
      const userId = userProfile?.userId || userProfile?.id || userProfile?._id;
      if (!userId) {
        console.warn("[WebSocket] No userId found in stored user profile");
        return null;
      }

      return userId;
    } catch (error) {
      console.error(
        "[WebSocket] Error extracting userId for websocket subscriptions:",
        error,
      );
      return null;
    }
  }

  clearSubscriptions() {
    this.subscriptions.forEach((subscription) => {
      try {
        subscription.unsubscribe();
      } catch (error) {
        console.warn("[WebSocket] Error while unsubscribing:", error);
      }
    });
    this.subscriptions = [];
  }

  disconnect() {
    this.connectionPromise = null;
    this.clearSubscriptions();

    if (this.client && this.isConnected) {
      try {
        console.log("[WebSocket] Disconnecting...");
        this.client.disconnect(() => {
          console.log("[WebSocket] Disconnected");
          this.isConnected = false;
          this.listeners = {};
          this.currentUserId = null;
          this.client = null;
        });
      } catch (error) {
        console.error("[WebSocket] Error during disconnect:", error);
        this.isConnected = false;
        this.listeners = {};
        this.currentUserId = null;
        this.client = null;
      }
    } else {
      this.client = null;
      this.isConnected = false;
      this.currentUserId = null;
      console.warn("[WebSocket] No active connection to disconnect");
    }
  }

  isConnectionActive() {
    const status = this.isConnected ? "Connected" : "Disconnected";
    console.log(`[WebSocket] Status: ${status}`);
    return this.isConnected;
  }
}

export default new WebSocketService();
