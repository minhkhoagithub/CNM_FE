import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { UserContext } from "./UserContext";
import chatRealtimeService from "../services/chat/chatRealtimeService";
import { setChatUserId } from "../services/chat/chatSession";
import {
  getBatchPresence,
  getConversationPresence,
  getUserPresence,
} from "../services/presence/presenceApi";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeUserId = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized || !UUID_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
};

const normalizePresenceEntry = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const normalizedUserId = normalizeUserId(item.userId);
  if (!normalizedUserId) {
    return null;
  }

  const normalizedLastSeenAt = item.lastSeenAt ? String(item.lastSeenAt) : null;

  return {
    userId: normalizedUserId,
    online: Boolean(item.online),
    lastSeenAt: normalizedLastSeenAt,
    updatedAt: item.occurredAt || new Date().toISOString(),
  };
};

const PresenceContext = createContext({
  getPresenceForUser: () => ({ online: false, lastSeenAt: null }),
  fetchUserPresence: async () => null,
  fetchBatchPresence: async () => [],
  fetchConversationPresence: async () => [],
});

const mergePresenceMap = (currentMap, items) => {
  if (!Array.isArray(items) || !items.length) {
    return currentMap;
  }

  const nextMap = { ...currentMap };
  items.forEach((item) => {
    const normalizedItem = normalizePresenceEntry(item);
    if (!normalizedItem) {
      return;
    }
    nextMap[normalizedItem.userId] = normalizedItem;
  });
  return nextMap;
};

export const PresenceProvider = ({ children }) => {
  const { userData } = useContext(UserContext);
  const [presenceByUserId, setPresenceByUserId] = useState({});
  const currentUserId = userData?.userId || userData?._id || null;

  const upsertPresenceItems = useCallback((items) => {
    setPresenceByUserId((prevState) => mergePresenceMap(prevState, items));
  }, []);

  const fetchUserPresence = useCallback(async (userId) => {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) {
      return null;
    }

    const response = await getUserPresence(normalizedUserId);
    upsertPresenceItems([response]);
    return normalizePresenceEntry(response);
  }, [upsertPresenceItems]);

  const fetchBatchPresence = useCallback(async (userIds) => {
    const normalizedUserIds = Array.from(
      new Set((Array.isArray(userIds) ? userIds : [])
        .map(normalizeUserId)
        .filter(Boolean))
    );
    if (!normalizedUserIds.length) {
      return [];
    }

    const response = await getBatchPresence(normalizedUserIds);
    const items = Array.isArray(response?.items) ? response.items : [];
    upsertPresenceItems(items);
    return items.map(normalizePresenceEntry).filter(Boolean);
  }, [upsertPresenceItems]);

  const fetchConversationPresence = useCallback(async (conversationId) => {
    if (!conversationId) {
      return [];
    }

    const response = await getConversationPresence(conversationId);
    const items = Array.isArray(response?.items) ? response.items : [];
    upsertPresenceItems(items);
    return items.map(normalizePresenceEntry).filter(Boolean);
  }, [upsertPresenceItems]);

  const getPresenceForUser = useCallback((userId) => {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) {
      return {
        userId: normalizedUserId,
        online: false,
        lastSeenAt: null,
        updatedAt: null,
      };
    }
    return (
      presenceByUserId[normalizedUserId] || {
        userId: normalizedUserId,
        online: false,
        lastSeenAt: null,
        updatedAt: null,
      }
    );
  }, [presenceByUserId]);

  useEffect(() => {
    if (!currentUserId) {
      return undefined;
    }

    setChatUserId(currentUserId);
    const subscriptionKey = `presence:user:${currentUserId}`;

    chatRealtimeService
      .subscribe(subscriptionKey, "/topic/presence", (event) => {
        const normalizedEvent = normalizePresenceEntry(event?.payload || event);
        if (!normalizedEvent) {
          return;
        }
        upsertPresenceItems([normalizedEvent]);
      })
      .catch((error) => {
        console.error("Failed to subscribe presence realtime:", error);
      });

    return () => {
      chatRealtimeService.unsubscribe(subscriptionKey);
      setPresenceByUserId({});
    };
  }, [currentUserId, upsertPresenceItems]);

  const contextValue = useMemo(() => ({
    getPresenceForUser,
    fetchUserPresence,
    fetchBatchPresence,
    fetchConversationPresence,
  }), [fetchBatchPresence, fetchConversationPresence, fetchUserPresence, getPresenceForUser]);

  return (
    <PresenceContext.Provider value={contextValue}>
      {children}
    </PresenceContext.Provider>
  );
};

export default PresenceContext;
