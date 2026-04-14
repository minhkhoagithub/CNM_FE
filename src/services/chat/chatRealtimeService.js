import SockJS from "sockjs-client";
import Stomp from "stompjs";
import { resolveChatUserId } from "./chatSession";

const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_BASE_API_URL || "http://localhost:8080/api/v1";

const resolveRealtimeUrl = () => {
  try {
    const apiUrl = new URL(DEFAULT_API_BASE_URL);
    return `${apiUrl.origin}/ws`;
  } catch {
    return `${DEFAULT_API_BASE_URL.replace(/\/api\/v1\/?$/, "")}/ws`;
  }
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

    // Setup page unload listener to clean up session
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.disconnect());
    }
  }

  async connect() {
    if (this.client?.connected) {
      return this.client;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        const socket = new SockJS(resolveRealtimeUrl());
        const client = Stomp.over(socket);
        client.debug = () => {};

        client.connect(
          {
            ...(resolveChatUserId() ? { "x-user-id": resolveChatUserId() } : {}),
          },
          () => {
            this.client = client;
            resolve(client);
          },
          (error) => {
            this.connectPromise = null;
            reject(error);
          }
        );
      } catch (error) {
        this.connectPromise = null;
        reject(error);
      }
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
  }
}

export default new ChatRealtimeService();
