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
import {
  getConversations,
  openOrCreatePrivateConversationV1,
} from "../services/chat/conversationApi";
import chatRealtimeService from "../services/chat/chatRealtimeService";
import {
  mapConversationList,
  mergeConversationPatch,
  normalizeConversationInput,
} from "../mappers/conversationMapper";

export const ContactContext = createContext(null);

const ACTIVE_CONVERSATION_SCOPE = "active";
const ARCHIVED_CONVERSATION_SCOPE = "archived";
const isDevelopmentMode = Boolean(import.meta.env?.DEV);

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

const getAllConversations = (conversationLists) => [
  ...conversationLists[ACTIVE_CONVERSATION_SCOPE],
  ...conversationLists[ARCHIVED_CONVERSATION_SCOPE],
];

const findConversationInLists = (conversationLists, conversationId) =>
  getAllConversations(conversationLists).find(
    (conversation) => conversation.id === conversationId
  ) || null;

const summarizeConversation = (conversation) =>
  conversation
    ? {
        id: conversation.id,
        type: conversation.type,
        displayName: conversation.displayName,
        trustedDisplayName: conversation.trustedDisplayName,
        customName: conversation.customName,
        peerUserId: conversation.peerUserId,
        peerDisplayName: conversation.peerDisplayName,
        trustedAvatarUrl: conversation.trustedAvatarUrl,
        muted: conversation.muted,
        pinned: conversation.pinned,
        archived: conversation.archived,
      }
    : null;

const logConversationState = (label, payload) => {
  if (!isDevelopmentMode) {
    return;
  }

  console.debug(`[conversation-state] ${label}`, payload);
};

export const ContactProvider = ({ children }) => {
  const fetchContact = useRef(null);
  const [conversationLists, setConversationLists] = useState({
    [ACTIVE_CONVERSATION_SCOPE]: [],
    [ARCHIVED_CONVERSATION_SCOPE]: [],
  });
  const [selectedConversationId, setSelectedConversationId] = useState(null);

  const { userData } = useContext(UserContext);
  const currentUserId = userData?.userId || userData?._id || null;

  const normalizeConversationForState = useCallback(
    (conversation, meta = {}) => {
      const normalizedConversation = normalizeConversationInput(conversation, {
        currentUserId,
      });

      if (normalizedConversation?.type === "private") {
        logConversationState("normalize/private", {
          source: meta.source || "unknown",
          conversationId: normalizedConversation.id,
          trustedDisplayName: normalizedConversation.trustedDisplayName,
          trustedAvatarUrl: normalizedConversation.trustedAvatarUrl,
          peerUserId: normalizedConversation.peerUserId,
          peerDisplayName: normalizedConversation.peerDisplayName,
          peerAvatarUrl: normalizedConversation.peerAvatarUrl,
          customName: normalizedConversation.customName,
        });
      }

      return normalizedConversation;
    },
    [currentUserId]
  );

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
      const currentConversation = findConversationInLists(prevState, conversationId);

      if (!currentConversation) {
        return prevState;
      }

      const nextConversationPatch =
        typeof updater === "function" ? updater(currentConversation) : updater;
      const nextConversationInput = mergeConversationPatch(
        currentConversation,
        nextConversationPatch
      );
      const nextConversation = normalizeConversationForState(nextConversationInput, {
        source: "updateConversationById",
      });
      if (!nextConversation?.id) {
        return prevState;
      }

      logConversationState("write/updateConversationById", {
        conversationId,
        patch: nextConversationPatch,
        before: summarizeConversation(currentConversation),
        after: summarizeConversation(nextConversation),
      });

      return upsertConversationIntoLists(prevState, nextConversation);
    });
  }, [normalizeConversationForState]);

  const upsertNormalizedConversation = useCallback((conversation, meta = {}) => {
    const conversationId = conversation?.id || conversation?.raw?.id || null;
    if (!conversationId) {
      return;
    }

    setConversationLists((prevState) => {
      const currentConversation = findConversationInLists(prevState, conversationId);
      const nextConversationInput = currentConversation
        ? mergeConversationPatch(currentConversation, conversation)
        : conversation;
      const nextConversation = normalizeConversationForState(nextConversationInput, {
        source: meta.source || "upsertConversation",
      });

      if (!nextConversation?.id) {
        return prevState;
      }

      logConversationState("write/upsertConversation", {
        source: meta.source || "unknown",
        before: summarizeConversation(currentConversation),
        after: summarizeConversation(nextConversation),
      });

      return upsertConversationIntoLists(prevState, nextConversation);
    });
  }, [normalizeConversationForState]);

  const applyConversationStatusPayload = useCallback((payload) => {
    if (!payload?.conversationId || !payload?.status) {
      return;
    }

    if (payload.status === "DELETED") {
      logConversationState("write/statusDeleted", {
        conversationId: payload.conversationId,
      });
      setConversationLists((prevState) =>
        removeConversationFromLists(prevState, payload.conversationId)
      );
      setSelectedConversationId((prevState) =>
        prevState === payload.conversationId ? null : prevState
      );
      return;
    }

    if (payload.status === "SEEN") {
      updateConversationById(payload.conversationId, { unreadCount: 0 });
    }
  }, [updateConversationById]);

  const handleConversationRealtimeEvent = useCallback((event) => {
    if (!event || event.type !== "CONVERSATION_UPDATED") {
      return;
    }

    if (event.payload?.status) {
      applyConversationStatusPayload(event.payload);
      return;
    }

    upsertNormalizedConversation(event.payload, { source: "realtime" });
  }, [applyConversationStatusPayload, upsertNormalizedConversation]);

  const fetchConversation = useCallback(
    async ({ archived = false } = {}) => {
      if (!userData) {
        return [];
      }

      const scope = archived ? ARCHIVED_CONVERSATION_SCOPE : ACTIVE_CONVERSATION_SCOPE;

      const conversations = await getConversations({ archived });
      const normalizedItems = mapConversationList(conversations, { currentUserId });
      logConversationState("write/fetchConversation", {
        scope,
        count: normalizedItems.length,
      });
      updateConversationScope(scope, normalizedItems);
      return normalizedItems;
    },
    [currentUserId, updateConversationScope, userData]
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
    if (!selectedConversationId) {
      return null;
    }

    return findConversationInLists(conversationLists, selectedConversationId);
  }, [conversationLists, selectedConversationId]);

  useEffect(() => {
    logConversationState("selectedConversation/resolve", {
      selectedConversationId,
      resolvedConversation: summarizeConversation(currentConversationNormalized),
    });
  }, [currentConversationNormalized, selectedConversationId]);

  const openConversation = useCallback((conversation) => {
    const normalizedConversation = normalizeConversationForState(conversation, {
      source: "openConversation",
    });

    if (!normalizedConversation?.id) {
      return null;
    }

    setSelectedConversationId(normalizedConversation.id);
    upsertNormalizedConversation(conversation, { source: "openConversation" });
    return normalizedConversation;
  }, [normalizeConversationForState, upsertNormalizedConversation]);

  const openPrivateConversationForUser = useCallback(
    async (targetUser) => {
      const targetUserId =
        targetUser?.userId || targetUser?._id || targetUser?.id || null;

      if (!targetUserId) {
        throw new Error("Participant user id is required");
      }

      const nextConversation = await openOrCreatePrivateConversationV1(targetUserId);
      return openConversation(nextConversation);
    },
    [openConversation]
  );

  const clearSelectedConversation = useCallback(() => {
    setSelectedConversationId(null);
  }, []);

  const removeConversationById = useCallback((conversationId) => {
    if (!conversationId) {
      return;
    }

    logConversationState("write/removeConversationById", {
      conversationId,
    });
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
        openPrivateConversationForUser,
        clearSelectedConversation,
        updateConversationById,
        removeConversationById,
      }}
    >
      {children}
    </ContactContext.Provider>
  );
};
