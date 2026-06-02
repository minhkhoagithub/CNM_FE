import SockJS from "sockjs-client";
import Stomp from "stompjs";
import { resolveChatUserId } from "./chatSession";

const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_BASE_API_URL || "http://localhost:8080/api/v1";

const resolveRealtimeUrls = () => {
  try {
    const apiUrl = new URL(DEFAULT_API_BASE_URL);
    return [`${apiUrl.origin}/ws`, `${apiUrl.origin}/auth/ws`];
  } catch {
    const origin = `${DEFAULT_API_BASE_URL.replace(/\/api\/v1\/?$/, "")}`;
    return [`${origin}/ws`, `${origin}/auth/ws`];
  }
};

const sockJsOptions = {
  transports: ["websocket", "xhr-streaming", "xhr-polling"],
};

const parseRealtimeMessage = (message) => {
  if (!message?.body) {
    return null;
  }

  try {
    return JSON.parse(message.body);
  } catch {
    return message.body;
  }
};

class ChatRealtimeService {
  constructor() {
    this.client = null;
    this.connectPromise = null;
    this.subscriptions = new Map();
    this.connectedUserId = null;

    // Setup page unload listener to clean up session
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.disconnect());
    }
  }

  async connect() {
    const targetUserId = resolveChatUserId() || null;

    if (this.client?.connected) {
      if (this.connectedUserId !== targetUserId) {
        this.disconnect();
      } else {
        return this.client;
      }
    }

    if (this.client?.connected) {
      return this.client;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const urls = resolveRealtimeUrls();
      let currentIndex = 0;

      const tryConnect = () => {
        if (currentIndex >= urls.length) {
          this.connectPromise = null;
          reject(new Error("Failed to connect websocket on all configured endpoints."));
          return;
        }

        const targetUrl = urls[currentIndex];
        currentIndex += 1;

        try {
          const socket = new SockJS(targetUrl, null, sockJsOptions);
          const client = Stomp.over(socket);
          client.debug = () => {};
          client.reconnect_delay = 5000;

          client.connect(
            {
              ...(resolveChatUserId() ? { "x-user-id": resolveChatUserId() } : {}),
            },
            () => {
              this.client = client;
              this.connectedUserId = targetUserId;
              this.connectPromise = null;
              resolve(client);
            },
            () => {
              try {
                client.disconnect(() => {});
              } catch {}
              tryConnect();
            }
          );
        } catch {
          tryConnect();
        }
      };

      tryConnect();
    });

    return this.connectPromise;
  }

  async subscribe(key, destination, handler) {
    const client = await this.connect();
    this.unsubscribe(key);

    const subscription = client.subscribe(destination, (message) => {
      handler(parseRealtimeMessage(message), message);
    });

    this.subscriptions.set(key, subscription);
    return subscription;
  }

  unsubscribe(key) {
    const subscription = this.subscriptions.get(key);
    if (!subscription) {
      return;
    }

    subscription.unsubscribe();
    this.subscriptions.delete(key);
  }

  disconnect() {
    this.subscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    this.subscriptions.clear();

    if (this.client?.connected) {
      this.client.disconnect(() => {});
    }

    this.client = null;
    this.connectPromise = null;
    this.connectedUserId = null;
  }
}

export default new ChatRealtimeService();
