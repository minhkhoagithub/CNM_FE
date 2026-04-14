import SockJS from 'sockjs-client';
import Stomp from 'stompjs';

// Polyfill for browser environment
if (typeof global === 'undefined') {
  window.global = window;
}

class WebSocketService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.listeners = {}; // Store event listeners

    // Reconnection state
    this._userId = null;
    this._reconnectTimer = null;
    this._reconnectDelay = 2000;       // Start at 2s
    this._maxReconnectDelay = 30000;   // Max 30s
    this._shouldReconnect = false;     // Only reconnect if we intentionally connected
  }

  connect(userId) {
    // If already connected or connecting, don't start a new connection
    if (this.isConnected && this._userId === userId) {
      console.log('[WebSocket] Đã kết nối, bỏ qua kết nối mới');
      return Promise.resolve(this.client);
    }

    // Save userId for reconnection
    this._userId = userId;
    this._shouldReconnect = true;

    // Clear any pending reconnect timer
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    // Setup page unload listener to clean up session
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.disconnect());
    }

    return this._doConnect();
  }

  _doConnect() {
    return new Promise((resolve, reject) => {
      try {
        console.log('[WebSocket] Đang kết nối đến /auth/ws...');
        
        const socket = new SockJS('http://localhost:8080/auth/ws');
        this.client = Stomp.over(socket);

        // Tắt debug spam từ STOMP (heartbeat frames)
        this.client.debug = () => {};

        this.client.connect({}, (frame) => {
          console.log('[WebSocket] ✅ Kết nối thành công đến /auth/ws');
          this.isConnected = true;
          this._reconnectDelay = 2000; // Reset delay on success

          if (this._userId) {
            this._setupSubscriptions(this._userId);
          } else {
            console.warn('[WebSocket] ⚠️ Không có userId, không thể subscribe topics');
          }

          resolve(this.client);
        }, (error) => {
          console.error('[WebSocket] ❌ Lỗi khi kết nối:', error);
          this.isConnected = false;
          this._scheduleReconnect();
          reject(error);
        });
      } catch (error) {
        console.error('[WebSocket] ❌ Lỗi tạo WebSocket:', error);
        this.isConnected = false;
        this._scheduleReconnect();
        reject(error);
      }
    });
  }

  _scheduleReconnect() {
    if (!this._shouldReconnect) {
      return; // User disconnected intentionally, don't reconnect
    }

    if (this._reconnectTimer) {
      return; // Already scheduled
    }

    console.log(`[WebSocket] 🔄 Sẽ thử kết nối lại sau ${this._reconnectDelay / 1000}s...`);

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      console.log('[WebSocket] 🔄 Đang thử kết nối lại...');

      this._doConnect().then(() => {
        console.log('[WebSocket] ✅ Kết nối lại thành công!');
      }).catch(() => {
        // Increase delay with exponential backoff
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay);
      });
    }, this._reconnectDelay);
  }

  _setupSubscriptions(userId) {
    if (!this.client || !this.isConnected || !userId) {
      return;
    }

    try {
      // 1. Subscribe to device logout notifications
      const deviceLogoutTopic = `/topic/auth/${userId}/device-logout`;
      this.client.subscribe(deviceLogoutTopic, (message) => {
        try {
          const event = JSON.parse(message.body);
          console.log('[WebSocket] Device logout notification:', event);
          this.emitEvent('device-logout', event);
        } catch (e) {
          console.error('[WebSocket] Error parsing device-logout message:', e);
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
      console.error('[WebSocket] WebSocket not connected');
      throw new Error('WebSocket not connected');
    }

    const payload = {
      deviceId: deviceId,
      platform: platform
    };

    try {
      console.log('[WebSocket] Sending logout device:', payload);
      this.client.send('/app/auth/logout-device', {}, JSON.stringify(payload));
    } catch (error) {
      console.error('[WebSocket] Error sending logout device:', error);
      throw error;
    }
  }

  getDevices() {
    if (!this.client || !this.isConnected) {
      console.error('[WebSocket] WebSocket not connected');
      throw new Error('WebSocket not connected');
    }

    try {
      console.log('[WebSocket] Requesting devices list');
      this.client.send('/app/auth/get-devices', {}, JSON.stringify({}));
    } catch (error) {
      console.error('[WebSocket] Error requesting devices:', error);
      throw error;
    }
  }

  // Event listener management
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  emitEvent(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[WebSocket] Error in listener for ${event}:`, error);
        }
      });
    }
  }

  disconnect() {
    this._shouldReconnect = false; // Prevent auto-reconnect

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this.client && this.isConnected) {
      try {
        console.log('[WebSocket] Đang ngắt kết nối...');
        this.client.disconnect(() => {
          console.log('[WebSocket] Đã ngắt kết nối thành công');
          this.isConnected = false;
          this.listeners = {};
        });
      } catch (error) {
        console.error('[WebSocket] Error during disconnect:', error);
        this.isConnected = false;
        this.listeners = {};
      }
    } else {
      console.warn('[WebSocket] Không có kết nối để ngắt');
    }

    this._userId = null;
  }

  isConnectionActive() {
    const status = this.isConnected ? 'Đang kết nối' : 'Chưa kết nối';
    console.log(`[WebSocket] Trạng thái: ${status}`);
    return this.isConnected;
  }
}

export default new WebSocketService();
