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
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        console.log('[WebSocket] Đang kết nối đến /auth/ws...');
        
        // Lazy load and create socket
        const socket = new SockJS('http://localhost:8080/auth/ws');
        this.client = Stomp.over(socket);

        this.client.connect({}, (frame) => {
          console.log('[WebSocket] Kết nối thành công đến /auth/ws');
          console.log('[WebSocket] Frame:', frame);
          this.isConnected = true;
          this.setupSubscriptions();
          resolve(this.client);
        }, (error) => {
          console.error('[WebSocket] Lỗi khi kết nối:', error);
          this.isConnected = false;
          reject(error);
        });
      } catch (error) {
        console.error('[WebSocket] Lỗi tạo WebSocket:', error);
        this.isConnected = false;
        reject(error);
      }
    });
  }

  setupSubscriptions() {
    // Subscribe to device logout notifications
    if (this.client && this.isConnected) {
      const userId = this.getUserIdFromToken();
      if (userId) {
        try {
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

          // Subscribe to devices list updates
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

          // Subscribe to error messages
          this.client.subscribe('/topic/auth/error', (message) => {
            try {
              const error = JSON.parse(message.body);
              console.error('[WebSocket] Error from server:', error);
              this.emitEvent('auth-error', error);
            } catch (e) {
              console.error('[WebSocket] Error parsing error message:', e);
            }
          });
        } catch (e) {
          console.error('[WebSocket] Error setting up subscriptions:', e);
        }
      }
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

  getUserIdFromToken() {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.warn('[WebSocket] No access token found');
        return null;
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        console.warn('[WebSocket] Invalid token format');
        return null;
      }

      const payload = JSON.parse(atob(parts[1]));
      return payload.userId;
    } catch (error) {
      console.error('[WebSocket] Error extracting userId from token:', error);
      return null;
    }
  }

  disconnect() {
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
  }

  isConnectionActive() {
    const status = this.isConnected ? 'Đang kết nối' : 'Chưa kết nối';
    console.log(`[WebSocket] Trạng thái: ${status}`);
    return this.isConnected;
  }
}

export default new WebSocketService();
