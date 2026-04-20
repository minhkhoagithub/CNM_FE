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
  hasConversationMemberPayload,
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
        memberCount: Array.isArray(conversation.members)
          ? conversation.members.length
          : 0,
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

      if (normalizedConversation?.type === "group") {
        console.log("[WEB PHASE2 GROUP MEMBERS]", {
          source: meta.source || "unknown",
          conversationId: normalizedConversation.id,
          hasAuthoritativeMembers: Array.isArray(normalizedConversation.members),
          memberCount: Array.isArray(normalizedConversation.members)
            ? normalizedConversation.members.length
            : 0,
          displayName: normalizedConversation.displayName,
          trustedDisplayName: normalizedConversation.trustedDisplayName,
          avatarUrl: normalizedConversation.avatarUrl || "",
          trustedAvatarUrl: normalizedConversation.trustedAvatarUrl || "",
        });
        console.log("[WEB PHASE2 CANONICAL UPSERT]", {
          source: meta.source || "unknown",
          conversationId: normalizedConversation.id,
          memberCount: Array.isArray(normalizedConversation.members)
            ? normalizedConversation.members.length
            : 0,
          roles: Array.isArray(normalizedConversation.members)
            ? normalizedConversation.members.map((member) => ({
                userId: member.userId,
                role: member.role,
              }))
            : [],
        });
        console.log("[WEB PHASE2 GROUP MEMBERS]", {
          source: meta.source || "unknown",
          conversationId: normalizedConversation.id,
          memberCount: Array.isArray(normalizedConversation.members)
            ? normalizedConversation.members.length
            : 0,
          members: Array.isArray(normalizedConversation.members)
            ? normalizedConversation.members.map((member) => ({
                userId: member.userId,
                username: member.username || "",
                hasDisplayName: Boolean(member.displayName),
                hasAvatarUrl: Boolean(member.avatarUrl),
                role: member.role || "MEMBER",
              }))
            : [],
        });
      }

      return normalizedConversation;
    },
    [currentUserId]
  );

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
      console.log("[WEB PHASE2 UNREAD SYNC]", {
        source: "status-payload",
        conversationId: payload.conversationId,
        status: payload.status,
        appliedUnreadCount: 0,
      });
      updateConversationById(payload.conversationId, { unreadCount: 0 });
    }
  }, [updateConversationById]);

  const handleConversationRealtimeEvent = useCallback((event) => {
    if (!event || event.type !== "CONVERSATION_UPDATED") {
      return;
    }

    if (event.payload?.status) {
      console.log("[WEB PHASE2 UNREAD SYNC]", {
        kind: "status",
        conversationId: event.payload.conversationId,
        status: event.payload.status,
      });
      applyConversationStatusPayload(event.payload);
      return;
    }

    if (String(event.payload?.type || "").toUpperCase() === "GROUP") {
      console.log("[GROUP RENAME SYNC]", {
        source: "web-conversation-updated",
        conversationId: event.payload?.id,
        displayName: event.payload?.displayName,
        name: event.payload?.name,
      });
      console.log("[WEB PHASE2 CANONICAL UPSERT]", {
        kind: "conversation",
        conversationId: event.payload?.id,
        hasMembers: hasConversationMemberPayload(event.payload),
        memberCount: Array.isArray(event.payload?.members)
          ? event.payload.members.length
          : 0,
        unreadCount: Number(event.payload?.unreadCount ?? 0),
        payloadShape: hasConversationMemberPayload(event.payload)
          ? "member-payload"
          : "partial-metadata",
      });
    }

    if (event.payload?.id || event.payload?.conversationId) {
      console.log("[WEB PHASE2 UNREAD SYNC]", {
        source: "conversation-refresh",
        conversationId: event.payload?.id || event.payload?.conversationId,
        unreadCount: Number(event.payload?.unreadCount ?? 0),
        hasUnreadField:
          Object.prototype.hasOwnProperty.call(event.payload || {}, "unreadCount") ||
          Object.prototype.hasOwnProperty.call(event.payload?.raw || {}, "unreadCount"),
      });
    }

    upsertNormalizedConversation(event.payload, { source: "realtime" });
  }, [applyConversationStatusPayload, upsertNormalizedConversation]);

  const fetchConversation = useCallback(
    async ({ archived = false } = {}) => {
      if (!currentUserId) {
        return [];
      }

      const scope = archived ? ARCHIVED_CONVERSATION_SCOPE : ACTIVE_CONVERSATION_SCOPE;

      const conversations = await getConversations({ archived });
      const normalizedItems = mapConversationList(conversations, { currentUserId });
      logConversationState("write/fetchConversation", {
        scope,
        count: normalizedItems.length,
      });
      setConversationLists((prevState) => ({
        ...prevState,
        [scope]: sortConversationList(
          normalizedItems
            .map((conversation) => {
              const currentConversation = findConversationInLists(
                prevState,
                conversation.id
              );
              const nextConversationInput = currentConversation
                ? mergeConversationPatch(currentConversation, conversation)
                : conversation;

              return normalizeConversationForState(nextConversationInput, {
                source: "fetchConversation",
              });
            })
            .filter(Boolean)
        ),
      }));
      return normalizedItems;
    },
    [currentUserId, normalizeConversationForState]
  );

  const fetchArchivedConversations = useCallback(async () => {
    return fetchConversation({ archived: true });
  }, [fetchConversation]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    Promise.resolve().then(() => {
      fetchConversation();
    });
  }, [currentUserId, fetchConversation]);

  useEffect(() => {
    if (!currentUserId) {
      return undefined;
    }

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
  }, [currentUserId, fetchConversation]);

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
