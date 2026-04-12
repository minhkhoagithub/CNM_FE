/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useEffect,
  useState,
  useContext,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { UserContext } from "./UserContext";
import { getConversations } from "../services/chat/conversationApi";
import chatRealtimeService from "../services/chat/chatRealtimeService";
import { mapConversation, mapConversationList } from "../mappers/conversationMapper";

export const ContactContext = createContext(null);

const ACTIVE_CONVERSATION_SCOPE = "active";
const ARCHIVED_CONVERSATION_SCOPE = "archived";

const compareConversations = (leftConversation, rightConversation) => {
  if (Boolean(leftConversation?.pinned) !== Boolean(rightConversation?.pinned)) {
    return rightConversation?.pinned ? 1 : -1;
  }

  const leftTime = leftConversation?.lastMessageTime
    ? new Date(leftConversation.lastMessageTime).getTime()
    : 0;
  const rightTime = rightConversation?.lastMessageTime
    ? new Date(rightConversation.lastMessageTime).getTime()
    : 0;

  return rightTime - leftTime;
};

const sortConversationList = (conversations) =>
  [...conversations].sort(compareConversations);

const removeConversationFromLists = (conversationLists, conversationId) => ({
  [ACTIVE_CONVERSATION_SCOPE]: conversationLists[ACTIVE_CONVERSATION_SCOPE].filter(
    (conversation) => conversation.id !== conversationId
  ),
  [ARCHIVED_CONVERSATION_SCOPE]: conversationLists[ARCHIVED_CONVERSATION_SCOPE].filter(
    (conversation) => conversation.id !== conversationId
  ),
});

const upsertConversationIntoLists = (conversationLists, conversation) => {
  const nextConversationLists = removeConversationFromLists(
    conversationLists,
    conversation.id
  );

  if (conversation.archived) {
    return {
      [ACTIVE_CONVERSATION_SCOPE]: nextConversationLists[ACTIVE_CONVERSATION_SCOPE],
      [ARCHIVED_CONVERSATION_SCOPE]: sortConversationList([
        ...nextConversationLists[ARCHIVED_CONVERSATION_SCOPE],
        conversation,
      ]),
    };
  }

  return {
    [ACTIVE_CONVERSATION_SCOPE]: sortConversationList([
      ...nextConversationLists[ACTIVE_CONVERSATION_SCOPE],
      conversation,
    ]),
    [ARCHIVED_CONVERSATION_SCOPE]: nextConversationLists[ARCHIVED_CONVERSATION_SCOPE],
  };
};

const normalizeConversationType = (conversation) =>
  String(conversation?.raw?.type || conversation?.type || "private").toLowerCase() ===
  "group"
    ? "group"
    : "private";

const resolveTrustedDisplayName = (conversation, normalizedType) => {
  if (conversation?.trustedDisplayName) {
    return conversation.trustedDisplayName;
  }

  const trustedSource = conversation?.raw || conversation || {};

  if (normalizedType === "private") {
    return (
      trustedSource.peerDisplayName ||
      conversation?.peerDisplayName ||
      trustedSource.displayName ||
      trustedSource.name ||
      ""
    );
  }

  return trustedSource.displayName || trustedSource.name || "";
};

const resolveTrustedAvatarUrl = (conversation, normalizedType) => {
  if (conversation?.trustedAvatarUrl) {
    return conversation.trustedAvatarUrl;
  }

  const trustedSource = conversation?.raw || conversation || {};

  if (normalizedType === "private") {
    return (
      trustedSource.peerAvatarUrl ||
      conversation?.peerAvatarUrl ||
      trustedSource.avatarUrl ||
      ""
    );
  }

  return trustedSource.avatarUrl || "";
};

const mergeConversationPatch = (currentConversation, patch) => {
  if (!currentConversation) {
    return patch || null;
  }

  if (!patch) {
    return currentConversation;
  }

  const nextRawPatch =
    patch.raw && typeof patch.raw === "object" ? patch.raw : null;

  return {
    ...currentConversation,
    ...patch,
    peerUserId:
      Object.prototype.hasOwnProperty.call(patch, "peerUserId")
        ? patch.peerUserId
        : currentConversation.peerUserId,
    peerDisplayName:
      Object.prototype.hasOwnProperty.call(patch, "peerDisplayName")
        ? patch.peerDisplayName
        : currentConversation.peerDisplayName,
    peerAvatarUrl:
      Object.prototype.hasOwnProperty.call(patch, "peerAvatarUrl")
        ? patch.peerAvatarUrl
        : currentConversation.peerAvatarUrl,
    trustedDisplayName:
      Object.prototype.hasOwnProperty.call(patch, "trustedDisplayName")
        ? patch.trustedDisplayName
        : currentConversation.trustedDisplayName,
    trustedAvatarUrl:
      Object.prototype.hasOwnProperty.call(patch, "trustedAvatarUrl")
        ? patch.trustedAvatarUrl
        : currentConversation.trustedAvatarUrl,
    raw: nextRawPatch
      ? {
          ...(currentConversation.raw || {}),
          ...nextRawPatch,
        }
      : currentConversation.raw || currentConversation,
  };
};

const normalizeConversationInput = (conversation) => {
  if (!conversation) {
    return null;
  }

  if (conversation.id) {
    const normalizedType = normalizeConversationType(conversation);
    const trustedDisplayName = resolveTrustedDisplayName(conversation, normalizedType);
    const trustedAvatarUrl = resolveTrustedAvatarUrl(conversation, normalizedType);
    const customName =
      typeof conversation.customName === "string" && conversation.customName.trim()
        ? conversation.customName.trim()
        : null;
    const finalDisplayName = customName || trustedDisplayName;

    return {
      id: conversation.id || null,
      title: finalDisplayName,
      displayName: finalDisplayName,
      trustedDisplayName,
      avatar: trustedAvatarUrl,
      avatarUrl: trustedAvatarUrl,
      trustedAvatarUrl,
      unreadCount: Number(conversation.unreadCount || 0),
      lastMessage: conversation.lastMessage || "",
      lastMessageTime: conversation.lastMessageTime || null,
      muted: Boolean(conversation.muted),
      archived: Boolean(conversation.archived),
      pinned: Boolean(conversation.pinned),
      notificationLevel: conversation.notificationLevel || "ALL",
      customName,
      peerUserId: conversation.peerUserId || null,
      peerDisplayName: conversation.peerDisplayName || null,
      peerAvatarUrl: conversation.peerAvatarUrl || null,
      members: Array.isArray(conversation.members)
        ? conversation.members
        : Array.isArray(conversation.member)
        ? conversation.member
        : [],
      type: normalizedType,
      raw: conversation.raw || conversation,
    };
  }

  return mapConversation(conversation);
};

export const ContactProvider = ({ children }) => {
  const fetchContact = useRef(null);
  const [conversationLists, setConversationLists] = useState({
    [ACTIVE_CONVERSATION_SCOPE]: [],
    [ARCHIVED_CONVERSATION_SCOPE]: [],
  });
  const [selectedConversationId, setSelectedConversationId] = useState(null);

  const { userData } = useContext(UserContext);

  const updateConversationScope = useCallback((scope, updater) => {
    setConversationLists((prevState) => ({
      ...prevState,
      [scope]:
        typeof updater === "function"
          ? updater(prevState[scope])
          : Array.isArray(updater)
          ? updater
          : prevState[scope],
    }));
  }, []);

  const updateConversationById = useCallback((conversationId, updater) => {
    if (!conversationId) {
      return;
    }

    setConversationLists((prevState) => {
      const allConversations = [
        ...prevState[ACTIVE_CONVERSATION_SCOPE],
        ...prevState[ARCHIVED_CONVERSATION_SCOPE],
      ];
      const currentConversation = allConversations.find(
        (conversation) => conversation.id === conversationId
      );

      if (!currentConversation) {
        return prevState;
      }

      const nextConversationPatch =
        typeof updater === "function" ? updater(currentConversation) : updater;
      const nextConversationInput = mergeConversationPatch(
        currentConversation,
        nextConversationPatch
      );

      const nextConversation = normalizeConversationInput(nextConversationInput);
      if (!nextConversation?.id) {
        return prevState;
      }

      return upsertConversationIntoLists(prevState, nextConversation);
    });
  }, []);

  const upsertNormalizedConversation = useCallback((conversation) => {
    if (!conversation?.id) {
      return;
    }

    setConversationLists((prevState) => upsertConversationIntoLists(prevState, conversation));
  }, []);

  const applyConversationStatusPayload = useCallback((payload) => {
    if (!payload?.conversationId || !payload?.status) {
      return;
    }

    if (payload.status === "DELETED") {
      setConversationLists((prevState) =>
        removeConversationFromLists(prevState, payload.conversationId)
      );
      setSelectedConversationId((prevState) =>
        prevState === payload.conversationId ? null : prevState
      );
      return;
    }

    if (payload.status === "SEEN") {
      setConversationLists((prevState) => ({
        [ACTIVE_CONVERSATION_SCOPE]: prevState[ACTIVE_CONVERSATION_SCOPE].map(
          (conversation) =>
            conversation.id === payload.conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation
        ),
        [ARCHIVED_CONVERSATION_SCOPE]: prevState[ARCHIVED_CONVERSATION_SCOPE].map(
          (conversation) =>
            conversation.id === payload.conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation
        ),
      }));
    }
  }, []);

  const handleConversationRealtimeEvent = useCallback((event) => {
    if (!event || event.type !== "CONVERSATION_UPDATED") {
      return;
    }

    if (event.payload?.status) {
      applyConversationStatusPayload(event.payload);
      return;
    }

    upsertNormalizedConversation(mapConversation(event.payload));
  }, [applyConversationStatusPayload, upsertNormalizedConversation]);

  const fetchConversation = useCallback(
    async ({ archived = false } = {}) => {
      if (!userData) {
        return [];
      }

      const scope = archived ? ARCHIVED_CONVERSATION_SCOPE : ACTIVE_CONVERSATION_SCOPE;

      const conversations = await getConversations({ archived });
      const normalizedItems = mapConversationList(conversations);
      updateConversationScope(scope, normalizedItems);
      return normalizedItems;
    },
    [updateConversationScope, userData]
  );

  const fetchArchivedConversations = useCallback(async () => {
    return fetchConversation({ archived: true });
  }, [fetchConversation]);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchConversation();
    });
  }, [fetchConversation]);

  useEffect(() => {
    if (fetchContact.current) {
      clearTimeout(fetchContact.current);
    }

    fetchContact.current = setTimeout(() => {
      fetchConversation();
    }, 30000);

    return () => {
      if (fetchContact.current) {
        clearTimeout(fetchContact.current);
      }
    };
  }, [fetchConversation]);

  useEffect(() => {
    const currentUserId = userData?.userId || userData?._id;

    if (!currentUserId) {
      chatRealtimeService.disconnect();
      return undefined;
    }

    const subscriptionKey = `chat:user:${currentUserId}:conversations`;
    chatRealtimeService
      .subscribe(
        subscriptionKey,
        `/topic/users/${currentUserId}/conversations`,
        handleConversationRealtimeEvent
      )
      .catch((error) => {
        console.error("Failed to subscribe to conversation realtime updates:", error);
      });

    return () => {
      chatRealtimeService.unsubscribe(subscriptionKey);
    };
  }, [handleConversationRealtimeEvent, userData?._id, userData?.userId]);

  const normalizedConversations = conversationLists[ACTIVE_CONVERSATION_SCOPE];
  const archivedConversations = conversationLists[ARCHIVED_CONVERSATION_SCOPE];

  const currentConversationNormalized = useMemo(() => {
    const allConversations = [...normalizedConversations, ...archivedConversations];
    return (
      allConversations.find((conversation) => conversation.id === selectedConversationId) ||
      null
    );
  }, [archivedConversations, normalizedConversations, selectedConversationId]);

  const openConversation = useCallback((conversation) => {
    const normalizedConversation = normalizeConversationInput(conversation);

    if (!normalizedConversation?.id) {
      return null;
    }

    setConversationLists((prevState) =>
      upsertConversationIntoLists(prevState, normalizedConversation)
    );

    setSelectedConversationId(normalizedConversation.id);
    return normalizedConversation;
  }, []);

  const clearSelectedConversation = useCallback(() => {
    setSelectedConversationId(null);
  }, []);

  const removeConversationById = useCallback((conversationId) => {
    if (!conversationId) {
      return;
    }

    setConversationLists((prevState) =>
      removeConversationFromLists(prevState, conversationId)
    );
    setSelectedConversationId((prevState) =>
      prevState === conversationId ? null : prevState
    );
  }, []);

  return (
    <ContactContext.Provider
      value={{
        conversations: normalizedConversations,
        normalizedConversations,
        upsertConversation: upsertNormalizedConversation,
        archivedConversations,
        fetchConversation,
        fetchArchivedConversations,
        currentConversationNormalized,
        selectedConversationId,
        openConversation,
        clearSelectedConversation,
        updateConversationById,
        removeConversationById,
      }}
    >
      {children}
    </ContactContext.Provider>
  );
};
