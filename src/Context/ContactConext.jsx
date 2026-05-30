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
import { setChatUserId } from "../services/chat/chatSession";
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

const unwrapConversationRealtimePayload = (event) => {
  if (!event || typeof event !== "object") {
    return { eventType: "", payload: null };
  }

  const extractEnvelopePayload = (value) => {
    let current = value;
    let depth = 0;
    while (
      current &&
      typeof current === "object" &&
      current.payload &&
      typeof current.payload === "object" &&
      depth < 4
    ) {
      const currentKeys = Object.keys(current);
      const looksLikeEnvelope =
        currentKeys.length <= 3 &&
        (currentKeys.includes("type") ||
          currentKeys.includes("payload") ||
          currentKeys.includes("timestamp"));
      if (!looksLikeEnvelope) {
        break;
      }
      current = current.payload;
      depth += 1;
    }
    return current;
  };

  const eventType = String(event?.type || event?.payload?.type || "").toUpperCase();
  const unwrapped = extractEnvelopePayload(event);
  const dataPayload =
    unwrapped?.data && typeof unwrapped.data === "object" ? unwrapped.data : unwrapped;
  const payload =
    dataPayload?.id || !dataPayload?.conversationId
      ? dataPayload
      : {
          ...dataPayload,
          id: dataPayload.conversationId,
        };

  return { eventType, payload };
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
        isDisbanded: Boolean(payload?.isDisbanded),
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
    if (!event) {
      return;
    }

    const { eventType, payload } = unwrapConversationRealtimePayload(event);
    const hasConversationMetadata = Boolean(
      payload &&
        (payload.id ||
          payload.conversationId ||
          payload.name ||
          payload.displayName ||
          payload.avatarUrl ||
          payload.groupAvatarUrl ||
          payload.members ||
          payload.status)
    );
    const isConversationUpdatedEvent =
      eventType === "CONVERSATION_UPDATED" || hasConversationMetadata;

    if (!isConversationUpdatedEvent) {
      return;
    }

    const normalizedStatus = String(payload?.status || "").toUpperCase();
    const isConversationStatusEvent =
      Boolean(payload?.conversationId) &&
      (normalizedStatus === "SEEN" || normalizedStatus === "DELETED");

    if (isConversationStatusEvent) {
      console.log("[WEB PHASE2 UNREAD SYNC]", {
        kind: "status",
        conversationId: payload.conversationId,
        status: payload.status,
      });
      applyConversationStatusPayload(payload);
      return;
    }

    if (String(payload?.type || "").toUpperCase() === "GROUP") {
      console.log("[GROUP RENAME SYNC]", {
        source: "web-conversation-updated",
        conversationId: payload?.id,
        displayName: payload?.displayName,
        name: payload?.name,
      });
      console.log("[WEB PHASE2 CANONICAL UPSERT]", {
        kind: "conversation",
        conversationId: payload?.id,
        hasMembers: hasConversationMemberPayload(payload),
        memberCount: Array.isArray(payload?.members)
          ? payload.members.length
          : 0,
        unreadCount: Number(payload?.unreadCount ?? 0),
        payloadShape: hasConversationMemberPayload(payload)
          ? "member-payload"
          : "partial-metadata",
      });
    }

    if (payload?.id || payload?.conversationId) {
      console.log("[WEB PHASE2 UNREAD SYNC]", {
        source: "conversation-refresh",
        conversationId: payload?.id || payload?.conversationId,
        unreadCount: Number(payload?.unreadCount ?? 0),
        hasUnreadField:
          Object.prototype.hasOwnProperty.call(payload || {}, "unreadCount") ||
          Object.prototype.hasOwnProperty.call(payload?.raw || {}, "unreadCount"),
      });
    }

    upsertNormalizedConversation(payload, { source: "realtime" });
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
    setChatUserId(currentUserId);

    const subscriptionKey = `chat:user:${currentUserId}:conversations`;
    chatRealtimeService
      .subscribe(
        subscriptionKey,
        `/topic/users/${currentUserId}/conversations`,
        (event, rawMessage) => {
          if (isDevelopmentMode) {
            console.debug("[conversation-realtime/raw]", {
              userId: currentUserId,
              destination: `/topic/users/${currentUserId}/conversations`,
              eventType: event?.type || null,
              hasPayload: Boolean(event?.payload),
              payloadKeys:
                event && typeof event === "object" ? Object.keys(event) : [],
              rawBodyLength: rawMessage?.body ? String(rawMessage.body).length : 0,
            });
          }
          handleConversationRealtimeEvent(event);
        }
      )
      .catch((error) => {
        console.error("Failed to subscribe to conversation realtime updates:", error);
      });

    return () => {
      chatRealtimeService.unsubscribe(subscriptionKey);
    };
  }, [handleConversationRealtimeEvent, userData?._id, userData?.userId]);

  useEffect(() => {
    const currentUserId = userData?.userId || userData?._id;
    const conversationId = selectedConversationId;
    if (!currentUserId || !conversationId) {
      return undefined;
    }
    setChatUserId(currentUserId);

    const subscriptionKey = `chat:conversation:${conversationId}:conversations`;
    chatRealtimeService
      .subscribe(
        subscriptionKey,
        `/topic/conversations/${conversationId}`,
        (event, rawMessage) => {
          if (isDevelopmentMode) {
            console.debug("[conversation-realtime/raw]", {
              userId: currentUserId,
              destination: `/topic/conversations/${conversationId}`,
              eventType: event?.type || null,
              hasPayload: Boolean(event?.payload),
              payloadKeys:
                event && typeof event === "object" ? Object.keys(event) : [],
              rawBodyLength: rawMessage?.body ? String(rawMessage.body).length : 0,
            });
          }
          handleConversationRealtimeEvent(event);
        }
      )
      .catch((error) => {
        console.error("Failed to subscribe to room conversation realtime updates:", error);
      });

    return () => {
      chatRealtimeService.unsubscribe(subscriptionKey);
    };
  }, [
    handleConversationRealtimeEvent,
    selectedConversationId,
    userData?._id,
    userData?.userId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleStorageSync = (event) => {
      if (event.key !== "conversation-rename-sync" || !event.newValue) {
        return;
      }

      try {
        const payload = JSON.parse(event.newValue);
        const conversationId = payload?.conversationId;
        const nextName = String(payload?.name || "").trim();
        if (!conversationId || !nextName) {
          return;
        }

        updateConversationById(conversationId, {
          name: nextName,
          displayName: nextName,
          trustedDisplayName: nextName,
        });
      } catch {}
    };

    window.addEventListener("storage", handleStorageSync);
    return () => {
      window.removeEventListener("storage", handleStorageSync);
    };
  }, [updateConversationById]);

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
