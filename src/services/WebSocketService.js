import SockJS from "sockjs-client";
import Stomp from "stompjs";

// Polyfill for browser environment
if (typeof global === "undefined") {
  window.global = window;
}

const resolveWebSocketUrl = () => {
  const apiBaseUrl =
    import.meta.env.VITE_BASE_API_URL || "http://localhost:8080/api/v1";
  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/$/, "");
  const origin = normalizedApiBaseUrl.replace(/\/api\/v\d+$/, "");

  return `${origin}/auth/ws`;
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
        console.log("[WebSocket] Connecting to /auth/ws...");

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

            console.log("[WebSocket] Connected to /auth/ws");
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
        console.error("[WebSocket] Socket creation error:", error);
        this.isConnected = false;
        this._scheduleReconnect();
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  setupSubscriptions(client = this.client) {
    if (client && this.isConnected) {
      const userId = this.currentUserId || this.getCurrentUserId();
      if (userId) {
        try {
          this.clearSubscriptions();

          const deviceLogoutTopic = `/topic/auth/${userId}/device-logout`;
          const deviceLogoutSubscription = client.subscribe(deviceLogoutTopic, (message) => {
            try {
              const event = JSON.parse(message.body);
              console.log("[WebSocket] Device logout notification:", event);
              this.emitEvent("device-logout", event);
            } catch (error) {
              console.error(
                "[WebSocket] Error parsing device-logout message:",
                error,
              );
            }
          });
          this.subscriptions.push(deviceLogoutSubscription);

          const devicesTopic = `/topic/auth/${userId}/devices`;
          const devicesSubscription = client.subscribe(devicesTopic, (message) => {
            try {
              const event = JSON.parse(message.body);
              console.log("[WebSocket] Devices list update:", event);
              this.emitEvent("devices-updated", event);
            } catch (error) {
              console.error("[WebSocket] Error parsing devices message:", error);
            }
          });
          this.subscriptions.push(devicesSubscription);

          const deviceLoginRequestTopic = `/topic/auth/${userId}/device-login-request`;
          const deviceLoginRequestSubscription = client.subscribe(deviceLoginRequestTopic, (message) => {
            try {
              const event = JSON.parse(message.body);
              console.log("[WebSocket] Device login approval request:", event);
              this.emitEvent("device-login-request", event);
            } catch (error) {
              console.error("[WebSocket] Error parsing device-login-request message:", error);
            }
          });
          this.subscriptions.push(deviceLoginRequestSubscription);

          const authErrorSubscription = client.subscribe("/topic/auth/error", (message) => {
            try {
              const error = JSON.parse(message.body);
              console.error("[WebSocket] Error from server:", error);
              this.emitEvent("auth-error", error);
            } catch (parseError) {
              console.error(
                "[WebSocket] Error parsing error message:",
                parseError,
              );
            }
          });
          this.subscriptions.push(authErrorSubscription);
        } catch (error) {
          console.error("[WebSocket] Error setting up subscriptions:", error);
        }
      });

      // 2. Subscribe to devices list updates
      const devicesTopic = `/topic/auth/${userId}/devices`;
      this.client.subscribe(devicesTopic, (message) => {
        try {
          const event = JSON.parse(message.body);
          console.log('[WebSocket] Devices list update:', event);
          this.emitEvent('devices-updated', event);
        } catch (e) {
          console.error('[WebSocket] Error parsing devices message:', e);
        }
      });

      // 3. Subscribe to error messages
      this.client.subscribe('/topic/auth/error', (message) => {
        try {
          const error = JSON.parse(message.body);
          console.error('[WebSocket] Error from server:', error);
          this.emitEvent('auth-error', error);
        } catch (e) {
          console.error('[WebSocket] Error parsing error message:', e);
        }
      });

      // 4. Subscribe to INCOMING_CALL & CALL_ACCEPTED
      const callsTopic = `/topic/users/${userId}/calls`;
      this.client.subscribe(callsTopic, (message) => {
        try {
          const event = JSON.parse(message.body);
          console.log('[WebSocket] 📞 CALL EVENT:', event);
          if (event.type === 'INCOMING_CALL') {
            console.log('[WebSocket] 📞 Incoming call from:', event.payload?.callerName);
            this.emitEvent('incoming-call', event.payload);
          } else if (event.type === 'CALL_ACCEPTED') {
            console.log('[WebSocket] ✅ Call accepted');
            this.emitEvent('call-accepted', event.payload);
          } else if (event.type === 'CALL_REJECTED') {
            console.log('[WebSocket] ❌ Call rejected');
            this.emitEvent('call-rejected', event.payload);
          } else if (event.type === 'CALL_ENDED') {
            console.log('[WebSocket] 👋 Call ended');
            this.emitEvent('call-ended', event.payload);
          } else if (event.type === 'CALL_STATUS_CHANGED') {
            this.emitEvent('call-status', event.payload);
          } else if (event.type === 'CALL_ACTION') {
            this.emitEvent('call-action', event.payload);
          }
        } catch (e) {
          console.error('[WebSocket] Error parsing calls message:', e);
        }
      });

      console.log(`[WebSocket] ✅ Đã subscribe tất cả topics cho userId: ${userId}`);
      console.log(`[WebSocket]    - ${deviceLogoutTopic}`);
      console.log(`[WebSocket]    - ${devicesTopic}`);
      console.log(`[WebSocket]    - ${callsTopic}`);

    } catch (e) {
      console.error('[WebSocket] ❌ Error setting up subscriptions:', e);
    }
  }

  logoutDevice(deviceId, platform) {
    if (!this.client || !this.isConnected) {
      console.error("[WebSocket] WebSocket not connected");
      throw new Error("WebSocket not connected");
    }

    const payload = {
      deviceId,
      platform,
    };

    try {
      console.log("[WebSocket] Sending logout device:", payload);
      this.client.send("/app/auth/logout-device", {}, JSON.stringify(payload));
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
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(
        (currentCallback) => currentCallback !== callback,
      );
    }
  }

  emitEvent(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[WebSocket] Error in listener for ${event}:`, error);
        }
      });
    }
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
      console.warn("[WebSocket] No active connection to disconnect");
    }

    this._userId = null;
  }

  isConnectionActive() {
    const status = this.isConnected ? "Connected" : "Disconnected";
    console.log(`[WebSocket] Status: ${status}`);
    return this.isConnected;
  }
}

export default new WebSocketService();
