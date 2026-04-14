import React, {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "../../resource/style/Chat/containermess.css";
import { ThemeContext } from "../../Context/ThemeContext";
import { UserContext } from "../../Context/UserContext";
import { ContactContext } from "../../Context/ContactConext";
import Icon from "./Icon";
import { HiOutlineUserGroup } from "react-icons/hi2";
import { CiSearch } from "react-icons/ci";
import { IoVideocamOutline, IoCameraOutline, IoCallOutline } from "react-icons/io5";
import { AiOutlineLike, AiOutlinePicture, AiOutlineSend } from "react-icons/ai";
import { IoMdClose, IoMdAttach } from "react-icons/io";
import { TbBackground } from "react-icons/tb";
import { MdOutlineContactMail } from "react-icons/md";
import { RiCalendarTodoFill, RiEmojiStickerLine } from "react-icons/ri";
import { RxDotFilled } from "react-icons/rx";
import {
  addOrUpdateReactionV1,
  deleteMessageV1,
  editMessageV1,
  getConversationMessages,
  hideMessageV1,
  markConversationSeen,
  removeReactionV1,
  removeMessageForMeV1,
  sendMessageV1,
  sendTypingState,
  uploadAttachmentV1,
} from "../../services/chat/messageApi";
import chatRealtimeService from "../../services/chat/chatRealtimeService";
import { mapConversationMembers } from "../../mappers/conversationMapper";
import {
  RECALLED_MESSAGE_PLACEHOLDER,
  createReplyPreviewText,
  createAttachmentPreviewText,
  isImageAttachment,
  mapMessage,
  mapMessagePage,
  markMessageAsDeleted,
  normalizeMessageList,
  persistRecalledMessageSnapshot,
  removeMessageItem,
  removePersistedRecalledMessage,
  updateMessageReactionSummary,
  upsertMessageItem,
} from "../../mappers/messageMapper";

const codeBackground = [
  "#34568B",
  "rgb(8 108 167)",
  "#a183b3",
  "#88b04b",
  "#b565a7",
  "#dd4124",
  "#d65076",
  "#5b5ea6",
  "#9b2335",
  "#abdde6",
  "#f3bcb6",
  "#ffccb6",
  "#ff968a",
  "#8fcaca",
  "#f4f3f3",
  "#b4426e",
];

const REACTION_OPTIONS = ["LIKE", "LOVE", "HAHA"];
const TYPING_DEBOUNCE_MS = 400;
const TYPING_IDLE_MS = 1200;
const REMOTE_TYPING_TIMEOUT_MS = 3000;
const PRIVATE_CONVERSATION_LABEL = "Nguoi dung";
const GROUP_CONVERSATION_LABEL = "Nhom";
const REACTION_LABELS = {
  LIKE: "👍",
  LOVE: "❤️",
  HAHA: "😂",
};

const getConversationDisplayName = (conversation) =>
  conversation?.displayName ||
  conversation?.trustedDisplayName ||
  conversation?.peerDisplayName ||
  (conversation?.type === "group" ? GROUP_CONVERSATION_LABEL : PRIVATE_CONVERSATION_LABEL);

const getConversationAvatarUrl = (conversation) =>
  conversation?.avatarUrl || conversation?.trustedAvatarUrl || conversation?.peerAvatarUrl || "";

const isReusableForwardAttachment = (attachment) =>
  Boolean(attachment?.url && (attachment?.storageKey || attachment?.id));

const formatTime = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const isImageFile = (file) => String(file?.type || "").startsWith("image/");

const buildSelectedAttachment = (file, index) => ({
  id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
  file,
  fileName: file.name,
  contentType: file.type || "",
  previewUrl: isImageFile(file) ? URL.createObjectURL(file) : "",
  isImage: isImageFile(file),
});

const applyLocalReactionChange = (message, nextReaction) => {
  const reactionMap = new Map(
    (Array.isArray(message?.reactions) ? message.reactions : []).map((reaction) => [
      reaction.type,
      Number(reaction.count || 0),
    ])
  );
  const previousReaction = message?.myReaction || null;

  if (previousReaction && reactionMap.has(previousReaction)) {
    reactionMap.set(previousReaction, Math.max(0, reactionMap.get(previousReaction) - 1));
  }

  if (nextReaction) {
    reactionMap.set(nextReaction, Number(reactionMap.get(nextReaction) || 0) + 1);
  }

  return {
    reactions: Array.from(reactionMap.entries())
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({ type, count })),
    myReaction: nextReaction,
  };
};

const truncateText = (value, maxLength = 90) => {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "";
  }

  return normalizedValue.length > maxLength
    ? `${normalizedValue.slice(0, maxLength - 3)}...`
    : normalizedValue;
};

const buildForwardMessageSummary = (message) => {
  const content = truncateText(message?.content || "", 90);
  const attachmentCount = Array.isArray(message?.attachments)
    ? message.attachments.length
    : 0;

  if (content && attachmentCount) {
    return `${content} · ${attachmentCount} tep dinh kem`;
  }

  if (content) {
    return content;
  }

  if (attachmentCount === 1) {
    return "1 tep dinh kem";
  }

  if (attachmentCount > 1) {
    return `${attachmentCount} tep dinh kem`;
  }

  return "";
};

const buildForwardDraft = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments.map((attachment) => ({ ...attachment }))
    : [];
  const content = String(message?.content || "").trim();
  const deletedAt = message?.deletedAt || null;
  const hasAttachments = attachments.length > 0;
  const attachmentsAreReusable =
    !hasAttachments || attachments.every(isReusableForwardAttachment);
  const hasUsableContent = Boolean(content);

  if (deletedAt) {
    return {
      canForward: false,
      reason: "Tin nhan da thu hoi khong the chuyen tiep.",
      id: message?.id || null,
      content,
      attachments,
      deletedAt,
      type: message?.type || null,
      previewText: buildForwardMessageSummary(message),
      hasUsableContent,
      hasAttachments,
      attachmentsAreReusable,
    };
  }

  if (!hasUsableContent && !hasAttachments) {
    return {
      canForward: false,
      reason: "Tin nhan nay khong co noi dung de chuyen tiep.",
      id: message?.id || null,
      content,
      attachments,
      deletedAt,
      type: message?.type || null,
      previewText: buildForwardMessageSummary(message),
      hasUsableContent,
      hasAttachments,
      attachmentsAreReusable,
    };
  }

  if (hasAttachments && !attachmentsAreReusable) {
    return {
      canForward: false,
      reason: "Tep dinh kem nay khong the chuyen tiep an toan.",
      id: message?.id || null,
      content,
      attachments,
      deletedAt,
      type: message?.type || null,
      previewText: buildForwardMessageSummary(message),
      hasUsableContent,
      hasAttachments,
      attachmentsAreReusable,
    };
  }

  return {
    canForward: true,
    reason: "",
    id: message?.id || null,
    content,
    attachments,
    deletedAt,
    type: message?.type || (hasAttachments ? "ATTACHMENT" : "TEXT"),
    previewText: buildForwardMessageSummary(message),
    hasUsableContent,
    hasAttachments,
    attachmentsAreReusable,
  };
};

const buildReplyPreview = (message) =>
  truncateText(createReplyPreviewText(message), 90) || "Tin nhan";

const normalizeTypingPayload = (event) => {
  const payload =
    event?.payload && typeof event.payload === "object" ? event.payload : event;

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const senderId = payload.senderId || payload.userId || payload.actorUserId || null;
  const isTyping = payload.isTyping ?? payload.typing;

  if (!senderId || typeof isTyping !== "boolean") {
    return null;
  }

  return {
    senderId,
    isTyping,
    conversationId: payload.conversationId || payload.chatId || null,
    displayName: payload.displayName || payload.senderDisplayName || payload.senderName || "",
    raw: payload,
  };
};

const resolveTypingStatusText = (typingUsers, conversationType) => {
  if (!typingUsers.length) {
    return "";
  }

  if (conversationType !== "group") {
    return "Dang go tin nhan...";
  }

  const namedTypingUsers = typingUsers
    .map((item) => String(item?.displayName || "").trim())
    .filter(Boolean);

  if (!namedTypingUsers.length) {
    return "Co nguoi dang go tin nhan...";
  }

  if (namedTypingUsers.length === 1) {
    return `${namedTypingUsers[0]} dang go tin nhan...`;
  }

  if (namedTypingUsers.length === 2) {
    return `${namedTypingUsers[0]} va ${namedTypingUsers[1]} dang go tin nhan...`;
  }

  return "Nhieu nguoi dang go tin nhan...";
};

const EMOJI_PATTERN = /[\p{Extended_Pictographic}\uFE0F\u200D]/u;


function ContainerMess({ contactData }) {
  const scrollRef = useRef(null);
  const inputMessage = useRef(null);
  const composerSelectionRef = useRef(null);
  const fileInputRef = useRef(null);
  const selectedAttachmentsRef = useRef([]);
  const messagesRef = useRef([]);
  const typingStateRef = useRef(false);
  const typingDebounceTimeoutRef = useRef(null);
  const typingIdleTimeoutRef = useRef(null);
  const remoteTypingTimeoutsRef = useRef(new Map());
  const [messages, setMessages] = useState([]);
  const [menuControl, setMenuControl] = useState({
    tableColor: false,
    tableIcon: false,
  });
  const [selectedAttachments, setSelectedAttachments] = useState([]);
  const [activeIconSend, setActiveIconSend] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [actionError, setActionError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [isForwardPickerOpen, setIsForwardPickerOpen] = useState(false);
  const [forwardTargetConversationId, setForwardTargetConversationId] = useState("");
  const [isForwarding, setIsForwarding] = useState(false);
  const [forwardNotice, setForwardNotice] = useState("");
  const forwardNoticeTimeoutRef = useRef(null);
  const { userData } = useContext(UserContext);
  const {
    conversations,
    archivedConversations,
    selectedConversationId,
    currentConversationNormalized,
    updateConversationById,
  } = useContext(ContactContext);
  const { theme, handleChangeTheme } = useContext(ThemeContext);
  const currentUserId = userData?.userId || userData?._id || null;
  const currentUserDisplayName =
    userData?.displayName || userData?.username || "Ban";
  const activeConversation = useMemo(() => {
    if (currentConversationNormalized?.id) {
      return currentConversationNormalized;
    }

    if (
      contactData?.id &&
      (!selectedConversationId || String(contactData.id) === String(selectedConversationId))
    ) {
      return contactData;
    }

    return null;
  }, [contactData, currentConversationNormalized, selectedConversationId]);
  const backendConversationId = activeConversation?.id || null;
  const conversationName =
    activeConversation?.displayName ||
    activeConversation?.trustedDisplayName ||
    (activeConversation?.type === "group"
      ? GROUP_CONVERSATION_LABEL
      : PRIVATE_CONVERSATION_LABEL);
  const conversationAvatar =
    activeConversation?.avatarUrl ||
    activeConversation?.trustedAvatarUrl ||
    null;

  const availableForwardConversations = useMemo(() => {
    const mergedConversations = [
      ...(Array.isArray(conversations) ? conversations : []),
      ...(Array.isArray(archivedConversations) ? archivedConversations : []),
    ];
    const seenConversationIds = new Set();

    return mergedConversations.filter((conversation) => {
      if (!conversation?.id) {
        return false;
      }

      if (String(conversation.id) === String(backendConversationId)) {
        return false;
      }

      const normalizedId = String(conversation.id);
      if (seenConversationIds.has(normalizedId)) {
        return false;
      }

      seenConversationIds.add(normalizedId);
      return true;
    });
  }, [archivedConversations, backendConversationId, conversations]);
  const currentUserAvatar = userData?.avatarUrl || userData?.avatar || null;
  const conversationMembers = useMemo(
    () =>
      mapConversationMembers(
        Array.isArray(activeConversation?.members) && activeConversation.members.length
          ? { members: activeConversation.members }
          : activeConversation?.raw || activeConversation
      ),
    [activeConversation]
  );
  const memberNameMap = useMemo(
    () =>
      new Map(
        conversationMembers
          .filter((member) => member?.userId)
          .map((member) => [String(member.userId), member.displayName || ""])
      ),
    [conversationMembers]
  );
  const renderAvatar = (avatarUrl, className = "", alt = "") =>
    avatarUrl ? (
      <img className={className} src={avatarUrl} alt={alt} />
    ) : (
      <div
        className={className}
        aria-hidden="true"
        style={{
          backgroundColor: "#e9eef5",
          borderRadius: "50%",
          minWidth: className ? undefined : 40,
          minHeight: className ? undefined : 40,
        }}
      />
    );
  const resolveUserDisplayName = useCallback(
    (userId, fallbackName = "") => {
      if (userId && String(userId) === String(currentUserId)) {
        return currentUserDisplayName;
      }

      if (userId && memberNameMap.has(String(userId))) {
        return memberNameMap.get(String(userId)) || fallbackName || "Nguoi dung";
      }

      return fallbackName || "Nguoi dung";
    },
    [currentUserDisplayName, currentUserId, memberNameMap]
  );
  const buildReplyTarget = useCallback(
    (message) => ({
      id: message?.id || null,
      senderId: message?.senderId || null,
      senderDisplayName: resolveUserDisplayName(
        message?.senderId,
        message?.senderDisplayName
      ),
      contentPreview: buildReplyPreview(message),
      type:
        message?.type ||
        (Array.isArray(message?.attachments) && message.attachments.length
          ? "ATTACHMENT"
          : "TEXT"),
    }),
    [resolveUserDisplayName]
  );

  const clearForwardState = useCallback(() => {
    setForwardingMessage(null);
    setIsForwardPickerOpen(false);
    setForwardTargetConversationId("");
  }, []);

  const handleOpenForwardPicker = useCallback(
    (message) => {
      const forwardDraft = buildForwardDraft(message);

      console.log("[WEB FORWARD SELECT]", {
        conversationId: backendConversationId,
        messageId: forwardDraft.id,
        type: forwardDraft.type,
        deletedAt: forwardDraft.deletedAt,
        attachmentsCount: forwardDraft.attachments.length,
        canForward: forwardDraft.canForward,
      });

      if (!forwardDraft.canForward) {
        console.log("[WEB FORWARD ERROR]", {
          conversationId: backendConversationId,
          messageId: forwardDraft.id,
          reason: forwardDraft.reason,
        });
        setActionError(forwardDraft.reason);
        return;
      }

      setActionError("");
      setForwardNotice("");
      setForwardingMessage(forwardDraft);
      setForwardTargetConversationId("");
      setIsForwardPickerOpen(true);
    },
    [backendConversationId]
  );

  const handleCloseForwardPicker = useCallback(() => {
    clearForwardState();
  }, [clearForwardState]);

  const forwardingMessageId = forwardingMessage?.id || null;

  const handlePickForwardTarget = useCallback(
    (conversation) => {
      if (!conversation?.id) {
        return;
      }

      setForwardTargetConversationId(conversation.id);

      console.log("[WEB FORWARD PICK TARGET]", {
        messageId: forwardingMessageId,
        targetConversationId: conversation.id,
        targetConversationName: getConversationDisplayName(conversation),
      });
    },
    [forwardingMessageId]
  );

  const handleConfirmForward = useCallback(async () => {
    if (!forwardingMessage?.canForward) {
      setActionError("Tin nhan nay khong the chuyen tiep.");
      return;
    }

    const targetConversation = availableForwardConversations.find(
      (conversation) => String(conversation.id) === String(forwardTargetConversationId)
    );

    if (!targetConversation) {
      setActionError("Vui long chon cuoc tro chuyen de chuyen tiep.");
      return;
    }

    setActionError("");
    setIsForwarding(true);

    const forwardPayload = {
      conversationId: targetConversation.id,
      ...(forwardingMessage.content ? { content: forwardingMessage.content } : {}),
      ...(forwardingMessage.attachments.length
        ? { attachments: forwardingMessage.attachments }
        : {}),
    };

    console.log("[WEB FORWARD SEND]", {
      sourceConversationId: backendConversationId,
      targetConversationId: targetConversation.id,
      messageId: forwardingMessage.id,
      contentLength: forwardingMessage.content.length,
      attachmentsCount: forwardingMessage.attachments.length,
      type: forwardingMessage.type,
    });

    try {
      const response = await sendMessageV1(forwardPayload);

      updateConversationById(targetConversation.id, {
        lastMessage: createAttachmentPreviewText(
          forwardingMessage.content,
          forwardingMessage.attachments
        ),
        lastMessageTime: response?.createdAt || new Date().toISOString(),
        unreadCount: 0,
      });

      clearForwardState();
      setForwardNotice(
        `Da chuyen tiep toi ${getConversationDisplayName(targetConversation)}.`
      );
    } catch (error) {
      console.error("[WEB FORWARD ERROR]", error);
      setActionError("Khong the chuyen tiep tin nhan nay.");
    } finally {
      setIsForwarding(false);
    }
  }, [
    availableForwardConversations,
    backendConversationId,
    clearForwardState,
    forwardingMessage,
    forwardTargetConversationId,
    updateConversationById,
  ]);

  const pushTypingState = useCallback(
    async (isTyping) => {
      if (!backendConversationId) {
        return;
      }

      if (typingStateRef.current === isTyping) {
        return;
      }

      typingStateRef.current = isTyping;
      console.log("[WEB TYPING SEND]", {
        conversationId: backendConversationId,
        isTyping,
        timestamp: Date.now(),
      });

      try {
        await sendTypingState(backendConversationId, isTyping);
      } catch {}
    },
    [backendConversationId]
  );

  const captureComposerSelection = useCallback(() => {
    const composer = inputMessage.current;
    const selection = window.getSelection?.();

    if (!composer || !selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!composer.contains(range.commonAncestorContainer)) {
      return;
    }

    composerSelectionRef.current = range.cloneRange();
  }, []);

  const restoreComposerSelection = useCallback(() => {
    const composer = inputMessage.current;
    const selection = window.getSelection?.();

    if (!composer || !selection) {
      return null;
    }

    let range = composerSelectionRef.current;
    if (
      !range ||
      !composer.contains(range.commonAncestorContainer) ||
      range.startContainer == null
    ) {
      if (selection.rangeCount > 0 && composer.contains(selection.anchorNode)) {
        range = selection.getRangeAt(0).cloneRange();
      } else {
        range = document.createRange();
        range.selectNodeContents(composer);
        range.collapse(false);
      }
    }

    selection.removeAllRanges();
    selection.addRange(range);
    composerSelectionRef.current = range.cloneRange();
    return range;
  }, []);

  const syncComposerState = useCallback(() => {
    const currentComposerValue = inputMessage.current?.textContent || "";
    const currentText = currentComposerValue.trim();
    setDraftText(currentText);

    if (!backendConversationId) {
      return;
    }

    const shouldSendTyping = Boolean(currentText);

    if (typingDebounceTimeoutRef.current) {
      clearTimeout(typingDebounceTimeoutRef.current);
    }

    if (shouldSendTyping && !typingStateRef.current) {
      void pushTypingState(true);
    } else {
      typingDebounceTimeoutRef.current = setTimeout(() => {
        pushTypingState(shouldSendTyping);
      }, TYPING_DEBOUNCE_MS);
    }

    if (typingIdleTimeoutRef.current) {
      clearTimeout(typingIdleTimeoutRef.current);
    }

    if (shouldSendTyping) {
      typingIdleTimeoutRef.current = setTimeout(() => {
        pushTypingState(false);
      }, TYPING_IDLE_MS);
    }
  }, [backendConversationId, pushTypingState]);

  const insertEmojiIntoComposer = useCallback(
    (emoji) => {
      const composer = inputMessage.current;
      if (!composer || !emoji) {
        return;
      }

      const range = restoreComposerSelection();
      if (!range) {
        return;
      }

      composer.focus();
      range.deleteContents();

      const textNode = document.createTextNode(emoji);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);

      const selection = window.getSelection?.();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }

      composerSelectionRef.current = range.cloneRange();

      console.log("[WEB EMOJI INSERT]", {
        conversationId: backendConversationId,
        emoji,
        composerText: composer.textContent || "",
      });

      syncComposerState();

      console.log("[WEB EMOJI SYNC]", {
        conversationId: backendConversationId,
        composerText: composer.textContent || "",
        draftText: composer.textContent?.trim() || "",
      });

      requestAnimationFrame(() => {
        composer.focus();
      });
    },
    [backendConversationId, restoreComposerSelection, syncComposerState]
  );

  const resetComposer = useCallback(() => {
    if (inputMessage.current) {
      inputMessage.current.textContent = "";
    }

    composerSelectionRef.current = null;

    selectedAttachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });

    setSelectedAttachments([]);
    setDraftText("");
    setActiveIconSend(false);

    if (typingDebounceTimeoutRef.current) {
      clearTimeout(typingDebounceTimeoutRef.current);
    }

    if (typingIdleTimeoutRef.current) {
      clearTimeout(typingIdleTimeoutRef.current);
    }

    pushTypingState(false);
  }, [pushTypingState, selectedAttachments]);

  const updateConversationPreview = useCallback(
    ({ messageText, attachments, updatedAt }) => {
      if (!backendConversationId) {
        return;
      }

      updateConversationById(backendConversationId, {
        lastMessage: createAttachmentPreviewText(messageText, attachments),
        lastMessageTime: updatedAt || new Date().toISOString(),
        unreadCount: 0,
      });
    },
    [backendConversationId, updateConversationById]
  );

  const upsertMessage = useCallback((nextMessage) => {
    setMessages((prevMessages) => upsertMessageItem(prevMessages, nextMessage));
  }, []);

  const markMessageDeleted = useCallback((messageId, deletedAt) => {
    const targetMessage =
      messagesRef.current.find((message) => String(message.id) === String(messageId)) || null;

    if (targetMessage && backendConversationId && currentUserId) {
      persistRecalledMessageSnapshot({
        conversationId: backendConversationId,
        currentUserId,
        message: targetMessage,
        deletedAt,
      });
    }

    setMessages((prevMessages) => markMessageAsDeleted(prevMessages, messageId, deletedAt));
  }, [backendConversationId, currentUserId]);

  const removeMessageById = useCallback((messageId) => {
    if (backendConversationId && currentUserId) {
      removePersistedRecalledMessage({
        conversationId: backendConversationId,
        currentUserId,
        messageId,
      });
    }

    setMessages((prevMessages) => removeMessageItem(prevMessages, messageId));
  }, [backendConversationId, currentUserId]);

  const syncMessageReactionSummary = useCallback((messageId, reactions, myReaction) => {
    setMessages((prevMessages) =>
      updateMessageReactionSummary(prevMessages, messageId, reactions, myReaction)
    );
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    selectedAttachmentsRef.current = selectedAttachments;
  }, [selectedAttachments]);

  useEffect(() => {
    setActiveIconSend(Boolean(draftText || selectedAttachments.length > 0));
  }, [draftText, selectedAttachments.length]);

  useEffect(() => {
    console.log("[WEB TYPING STATE]", {
      conversationId: backendConversationId,
      typingUsers,
    });
  }, [backendConversationId, typingUsers]);

  useEffect(() => {
    return () => {
      selectedAttachmentsRef.current.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });

      if (typingDebounceTimeoutRef.current) {
        clearTimeout(typingDebounceTimeoutRef.current);
      }

      if (typingIdleTimeoutRef.current) {
        clearTimeout(typingIdleTimeoutRef.current);
      }

      if (forwardNoticeTimeoutRef.current) {
        clearTimeout(forwardNoticeTimeoutRef.current);
      }

      remoteTypingTimeoutsRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      remoteTypingTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      pushTypingState(false);
    };
  }, [pushTypingState]);

  useEffect(() => {
    setTypingUsers([]);
    setReplyingToMessage(null);
    clearForwardState();
    typingStateRef.current = false;
    if (typingDebounceTimeoutRef.current) {
      clearTimeout(typingDebounceTimeoutRef.current);
    }
    if (typingIdleTimeoutRef.current) {
      clearTimeout(typingIdleTimeoutRef.current);
    }
    remoteTypingTimeoutsRef.current.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    remoteTypingTimeoutsRef.current.clear();
  }, [backendConversationId, clearForwardState]);

  useEffect(() => {
    if (!forwardNotice) {
      return undefined;
    }

    if (forwardNoticeTimeoutRef.current) {
      clearTimeout(forwardNoticeTimeoutRef.current);
    }

    forwardNoticeTimeoutRef.current = setTimeout(() => {
      setForwardNotice("");
    }, 2200);

    return () => {
      if (forwardNoticeTimeoutRef.current) {
        clearTimeout(forwardNoticeTimeoutRef.current);
      }
    };
  }, [forwardNotice]);

  useEffect(() => {
    const fetchMessages = async () => {
      setActionError("");
      setEditingMessageId(null);

      if (!backendConversationId) {
        setMessages([]);
        return;
      }

      try {
        const response = await getConversationMessages(backendConversationId, {
          size: 50,
        });
        const page = mapMessagePage(response, {
          conversationId: backendConversationId,
          currentUserId,
        });
        setMessages(page.items);
        await markConversationSeen(backendConversationId);
        updateConversationById(backendConversationId, { unreadCount: 0 });
      } catch (error) {
        console.error("Failed to load backend conversation messages:", error);
        setMessages([]);
      }
    };

    fetchMessages();
  }, [backendConversationId, currentUserId, updateConversationById]);

  useEffect(() => {
    if (!backendConversationId) {
      return undefined;
    }

    const subscriptionKey = `chat:conversation:${backendConversationId}`;
    chatRealtimeService
      .subscribe(
        subscriptionKey,
        `/topic/conversations/${backendConversationId}`,
        (event) => {
          if (!event?.type) {
            return;
          }

          if (event.type === "MESSAGE_CREATED" || event.type === "MESSAGE_UPDATED") {
            upsertMessage(mapMessage(event.payload));
            return;
          }

          if (event.type === "MESSAGE_DELETED") {
            console.log("[WEB RECALL REALTIME]", {
              conversationId: backendConversationId,
              messageId: event.payload?.messageId || event.payload?.id || null,
              deletedAt: event.payload?.deletedAt || null,
              foundInState: messagesRef.current.some(
                (message) =>
                  String(message.id) ===
                  String(event.payload?.messageId || event.payload?.id || "")
              ),
            });
            markMessageDeleted(
              event.payload?.messageId || event.payload?.id,
              event.payload?.deletedAt
            );
            return;
          }

          if (event.type === "MESSAGE_REACTION_UPDATED") {
            syncMessageReactionSummary(
              event.payload?.messageId,
              event.payload?.summary,
              event.payload?.actorUserId === currentUserId
                ? event.payload?.actorReaction
                : undefined
            );
          }
        }
      )
      .catch((error) => {
        console.error("Failed to subscribe to conversation realtime updates:", error);
      });

    return () => {
      chatRealtimeService.unsubscribe(subscriptionKey);
    };
  }, [
    backendConversationId,
    currentUserId,
    markMessageDeleted,
    syncMessageReactionSummary,
    upsertMessage,
  ]);

  useEffect(() => {
    if (!backendConversationId) {
      setTypingUsers([]);
      return undefined;
    }

    const subscriptionKey = `chat:conversation:${backendConversationId}:typing`;
    chatRealtimeService
      .subscribe(subscriptionKey, `/topic/typing/${backendConversationId}`, (event) => {
        const typingEvent = normalizeTypingPayload(event);
        console.log("[WEB TYPING RECEIVE]", {
          conversationId: backendConversationId,
          raw: event,
          normalized: typingEvent,
        });
        if (!typingEvent) {
          return;
        }

        if (
          typingEvent.conversationId &&
          String(typingEvent.conversationId) !== String(backendConversationId)
        ) {
          return;
        }

        if (String(typingEvent.senderId) === String(currentUserId)) {
          return;
        }

        const typingUserId = String(typingEvent.senderId);
        const resolvedDisplayName = resolveUserDisplayName(
          typingUserId,
          typingEvent.displayName
        );
        const currentTimeout = remoteTypingTimeoutsRef.current.get(typingUserId);
        if (currentTimeout) {
          clearTimeout(currentTimeout);
        }

        console.log("[WEB TYPING STATE]", {
          senderId: typingUserId,
          isTyping: typingEvent.isTyping,
          displayName: resolvedDisplayName,
        });

        if (typingEvent.isTyping) {
          setTypingUsers((prevState) => {
            const nextState = prevState.filter(
              (item) => String(item.userId) !== typingUserId
            );
            return [
              ...nextState,
              {
                userId: typingUserId,
                displayName: resolvedDisplayName,
              },
            ];
          });

          const timeoutId = setTimeout(() => {
            console.log("[WEB TYPING STATE]", {
              senderId: typingUserId,
              isTyping: false,
              reason: "timeout",
            });
            setTypingUsers((prevState) =>
              prevState.filter((item) => String(item.userId) !== typingUserId)
            );
            remoteTypingTimeoutsRef.current.delete(typingUserId);
          }, REMOTE_TYPING_TIMEOUT_MS);
          remoteTypingTimeoutsRef.current.set(typingUserId, timeoutId);
          return;
        }

        remoteTypingTimeoutsRef.current.delete(typingUserId);
        setTypingUsers((prevState) =>
          prevState.filter((item) => String(item.userId) !== typingUserId)
        );
      })
      .catch((error) => {
        console.error("Failed to subscribe to typing updates:", error);
      });

    return () => {
      chatRealtimeService.unsubscribe(subscriptionKey);
      setTypingUsers([]);
      remoteTypingTimeoutsRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      remoteTypingTimeoutsRef.current.clear();
    };
  }, [backendConversationId, currentUserId, resolveUserDisplayName]);

  const handleSeenMess = useCallback(() => {
    if (!backendConversationId) {
      return;
    }

    markConversationSeen(backendConversationId)
      .then(() => {
        updateConversationById(backendConversationId, { unreadCount: 0 });
      })
      .catch((error) => {
        console.error("Failed to mark conversation as seen:", error);
      });
  }, [backendConversationId, updateConversationById]);

  const handleSetBackground = (backgroundColor) => {
    handleChangeTheme(backgroundColor);
    setMenuControl((prevState) => ({ ...prevState, tableColor: false }));
  };

  const handleChangeMenuControl = (event) => {
    const name = event.target.getAttribute("name");
    if (!name) {
      return;
    }

    setMenuControl((prevState) => ({
      ...prevState,
      [name]: !prevState[name],
    }));
  };

  const handleGetIcon = (value) => {
    insertEmojiIntoComposer(value);
  };

  const handleFilePickerOpen = () => {
    fileInputRef.current?.click();
  };

  const handleAttachmentPick = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    setSelectedAttachments((prevState) => [
      ...prevState,
      ...files.map((file, index) => buildSelectedAttachment(file, index)),
    ]);
    event.target.value = "";
  };

  const handleRemoveSelectedAttachment = (attachmentId) => {
    setSelectedAttachments((prevState) => {
      const targetAttachment = prevState.find((attachment) => attachment.id === attachmentId);
      if (targetAttachment?.previewUrl) {
        URL.revokeObjectURL(targetAttachment.previewUrl);
      }

      return prevState.filter((attachment) => attachment.id !== attachmentId);
    });
  };

  const handleSendMess = async (event, flag = false) => {
    event?.preventDefault?.();
    const rawComposerText = flag ? "👍" : inputMessage.current?.textContent || "";
    const messageText = rawComposerText.trim();
    const containsEmoji = EMOJI_PATTERN.test(rawComposerText);

    if (!messageText && selectedAttachments.length === 0) {
      return;
    }

    setActionError("");
    pushTypingState(false);

    if (!backendConversationId) {
      setActionError("Khong tim thay cuoc tro chuyen de gui tin nhan.");
      return;
    }

    setIsSending(true);

    if (containsEmoji) {
      console.log("[WEB EMOJI SEND]", {
        conversationId: backendConversationId,
        rawComposerText,
        messageText,
        attachmentsCount: selectedAttachments.length,
        replyingToMessageId: replyingToMessage?.id || null,
      });
    }

    try {
      const uploadedAttachments = selectedAttachments.length
        ? await Promise.all(
            selectedAttachments.map((attachment) => uploadAttachmentV1(attachment.file))
          )
        : [];

      const response = await sendMessageV1({
        conversationId: backendConversationId,
        ...(messageText ? { content: messageText } : {}),
        ...(uploadedAttachments.length ? { attachments: uploadedAttachments } : {}),
        ...(replyingToMessage?.id ? { replyToMessageId: replyingToMessage.id } : {}),
      });

      const nextMessage = mapMessage(response);
      upsertMessage(nextMessage);
      updateConversationPreview({
        messageText,
        attachments: uploadedAttachments,
        updatedAt: nextMessage.editedAt || nextMessage.createdAt,
      });
      resetComposer();
      setReplyingToMessage(null);
    } catch (error) {
      console.error("Failed to send message:", error);
      setActionError(
        replyingToMessage
          ? "Khong the gui tin nhan tra loi."
          : selectedAttachments.length > 0
          ? "Khong the gui tep dinh kem."
          : "Khong the gui tin nhan."
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleReplyToMessage = (message) => {
    setReplyingToMessage(buildReplyTarget(message));
    setActionError("");
    inputMessage.current?.focus();
  };

  const handleCancelReply = () => {
    setReplyingToMessage(null);
  };

  const handleButtonSendMess = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMess(event);
    }
  };

  const handleStartEditing = (message) => {
    setEditingMessageId(message.id);
    setEditingText(message.content || "");
    setActionError("");
  };

  const handleCancelEditing = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const handleSaveEdit = async (messageId) => {
    const nextText = editingText.trim();
    if (!nextText) {
      return;
    }

    try {
      const response = await editMessageV1(messageId, { content: nextText });
      upsertMessage(mapMessage(response));
      handleCancelEditing();
    } catch (error) {
      console.error("Failed to edit message:", error);
      setActionError("Khong the chinh sua tin nhan.");
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await deleteMessageV1(messageId);
      console.log("[WEB RECALL LOCAL]", {
        action: "unsend",
        conversationId: backendConversationId,
        messageId,
      });
      markMessageDeleted(messageId, new Date().toISOString());
    } catch (error) {
      console.error("Failed to delete message:", error);
      setActionError("Khong the thu hoi tin nhan.");
    }
  };

  const handleHideMessage = async (messageId) => {
    try {
      await hideMessageV1(messageId);
      removeMessageById(messageId);
    } catch (error) {
      console.error("Failed to hide message:", error);
      setActionError("Khong the an tin nhan nay.");
    }
  };

  const handleRemoveMessageForMe = async (messageId) => {
    try {
      await removeMessageForMeV1(messageId);
      removeMessageById(messageId);
    } catch (error) {
      console.error("Failed to remove message for current user:", error);
      setActionError("Khong the xoa tin nhan tren may nay.");
    }
  };

  const handleReactionClick = async (message) => {
    try {
      if (message.myReaction === "LIKE") {
        await removeReactionV1(message.id);
        const nextReactionState = applyLocalReactionChange(message, null);
        syncMessageReactionSummary(
          message.id,
          nextReactionState.reactions,
          nextReactionState.myReaction
        );
        return;
      }

      await addOrUpdateReactionV1(message.id, "LIKE");
      const nextReactionState = applyLocalReactionChange(message, "LIKE");

      syncMessageReactionSummary(
        message.id,
        nextReactionState.reactions,
        nextReactionState.myReaction
      );
    } catch (error) {
      console.error("Failed to update reaction:", error);
      setActionError("Khong the cap nhat cam xuc.");
    }
  };

  const handleQuickReaction = async (message, reactionType) => {
    try {
      if (message.myReaction === reactionType) {
        await removeReactionV1(message.id);
        const nextReactionState = applyLocalReactionChange(message, null);
        syncMessageReactionSummary(
          message.id,
          nextReactionState.reactions,
          nextReactionState.myReaction
        );
        return;
      }

      await addOrUpdateReactionV1(message.id, reactionType);
      const nextReactionState = applyLocalReactionChange(message, reactionType);
      syncMessageReactionSummary(
        message.id,
        nextReactionState.reactions,
        nextReactionState.myReaction
      );
    } catch (error) {
      console.error("Failed to update reaction:", error);
      setActionError("Khong the cap nhat cam xuc.");
    }
  };

  const normalizedMessages = useMemo(() => normalizeMessageList(messages), [messages]);
  const typingStatusText = useMemo(
    () => resolveTypingStatusText(typingUsers, activeConversation?.type),
    [activeConversation?.type, typingUsers]
  );
  const statusHint = typingStatusText
    ? typingStatusText
    : activeConversation?.lastActive && activeConversation.lastActive !== "Active"
    ? activeConversation.lastActive
    : "Dang hoat dong";
  console.log("[WEB TYPING RENDER]", {
    typingUsers,
    currentConversationId: backendConversationId,
    typingStatusText,
  });
  // Keep status UI intentionally minimal for now; live message-status topic wiring can come later.
  const lastOwnMessageId = useMemo(() => {
    const ownMessages = normalizedMessages.filter((message) => message.senderId === currentUserId);

    return ownMessages.length ? ownMessages[ownMessages.length - 1].id : null;
  }, [currentUserId, normalizedMessages]);

  const handleStartCall = useCallback((type) => {
    if (!activeConversation) return;

    if (activeConversation.type === "group" || !activeConversation.peerUserId) {
      alert("Chức năng gọi nhóm chưa được hỗ trợ.");
      return;
    }

    const event = new CustomEvent('start-call-request', { 
      detail: { type, calleeId: activeConversation.peerUserId, peerId: currentUserId } 
    });
    window.dispatchEvent(event);
  }, [activeConversation, currentUserId]);

  return (
    <div className="container-containermess" onClick={handleSeenMess}>
      <div className="top-container flex">
        <div className="flex">
          <div className="zavatar">
            {renderAvatar(conversationAvatar)}
          </div>
          <div className="friend-mess-infor">
            <h3>{conversationName}</h3>
            <div>
              {typingStatusText ? (
                <div className="typing-indicator">
                  <p>{statusHint}</p>
                  <span className="typing-indicator-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              ) : activeConversation?.lastActive && activeConversation.lastActive !== "Active" ? (
                <p>{statusHint}</p>
              ) : (
                <div className="flex">
                  <RxDotFilled style={{ fontSize: "20px", color: "#30a04b" }} />
                  <p>{statusHint}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="group-choice flex">
          <HiOutlineUserGroup className="icon-header" />
          <CiSearch className="icon-header" />
          <IoCallOutline className="icon-header" onClick={() => handleStartCall("VOICE")} />
          <IoVideocamOutline className="icon-header" onClick={() => handleStartCall("VIDEO")} />
        </div>
      </div>
      <div className="infor-container" style={{ backgroundColor: theme }}>
        <div>
          <ul>
            {normalizedMessages.map((item, index) => {
              const isMine = item.senderId === currentUserId;
              const isDeleted = Boolean(item.deletedAt);
              const visibleAttachments = isDeleted ? [] : item.attachments;
              const imageAttachments = visibleAttachments.filter(isImageAttachment);
              const fileAttachments = visibleAttachments.filter(
                (attachment) => !isImageAttachment(attachment)
              );
              const canEdit =
                isMine && !isDeleted && !visibleAttachments.length && Boolean(item.content);
              const canDelete = isMine && !isDeleted;
              const canReply = Boolean(item.id) && !isDeleted;
              const replyPreviewSenderName = !isDeleted && item.replyTo
                ? resolveUserDisplayName(
                    item.replyTo.senderId,
                    item.replyTo.senderDisplayName
                  )
                : "";
              const replyPreviewText = !isDeleted && item.replyTo
                ? truncateText(item.replyTo.contentPreview || "Tin nhan", 90)
                : "";
              const displayText = isDeleted
                ? RECALLED_MESSAGE_PLACEHOLDER
                : item.content;

              return (
                <li
                  ref={index === normalizedMessages.length - 1 ? scrollRef : null}
                  key={item.id || `${item.createdAt}-${index}`}
                  className={`wrap-text-mess ${isMine ? "my-mess" : ""} ${
                    item.deletedAt ? "message-row-deleted" : ""
                  } flex`}
                >
                  {renderAvatar(
                    isMine ? currentUserAvatar : conversationAvatar,
                    "",
                    ""
                  )}
                  <div
                    className={`detail-mess ${
                      isDeleted ? "detail-mess-deleted" : ""
                    } ${fileAttachments.length ? "detail-mess-has-files" : ""}`}
                  >
                    {!isMine && <p className="name-mess">{conversationName}</p>}
                    {editingMessageId === item.id ? (
                      <div className="message-edit-card">
                        <textarea
                          className="message-edit-input"
                          value={editingText}
                          onChange={(event) => setEditingText(event.target.value)}
                        />
                        <div className="flex message-action-row">
                          <button
                            className="message-action-btn primary"
                            type="button"
                            onClick={() => handleSaveEdit(item.id)}
                          >
                            Luu
                          </button>
                          <button
                            className="message-action-btn subtle"
                            type="button"
                            onClick={handleCancelEditing}
                          >
                            Huy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {!isDeleted && item.replyTo ? (
                          <div className="message-reply-preview">
                            <p className="message-reply-sender">
                              {replyPreviewSenderName || "Tin nhan duoc tra loi"}
                            </p>
                            <p className="message-reply-text">{replyPreviewText}</p>
                          </div>
                        ) : null}
                        {imageAttachments.length > 0 && (
                          <ul className="list-imgs-mess flex">
                            {imageAttachments.map((attachment) => (
                              <li key={attachment.id || attachment.url}>
                                <img
                                  src={attachment.url}
                                  alt={attachment.fileName || ""}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                        {fileAttachments.length > 0 && (
                          <div className="message-attachment-list">
                            {fileAttachments.map((attachment) => (
                              <a
                                className="message-file-link"
                                key={attachment.id || attachment.url}
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {attachment.fileName || "Tep dinh kem"}
                              </a>
                            ))}
                          </div>
                        )}
                        {displayText ? (
                          <p
                            className={`text-mess ${
                              isDeleted ? "message-text-deleted" : ""
                            }`}
                          >
                            {displayText}
                          </p>
                        ) : null}
                        {item.editedAt && !isDeleted ? (
                          <p className="message-state-chip">Da chinh sua</p>
                        ) : null}
                      </>
                    )}
                    {!isDeleted && (
                      <div className="flex message-action-row">
                        <button
                          className={`message-action-btn ${
                            item.myReaction === "LIKE" ? "active-reaction" : "subtle"
                          }`}
                          type="button"
                          onClick={() => handleReactionClick(item)}
                        >
                          {item.myReaction === "LIKE" ? "Bo like" : "Like"}
                        </button>
                        {REACTION_OPTIONS.map((reactionType) => (
                          <button
                            className={`message-reaction-btn ${
                              item.myReaction === reactionType ? "active-reaction" : ""
                            }`}
                            key={reactionType}
                            type="button"
                            onClick={() => handleQuickReaction(item, reactionType)}
                          >
                            {REACTION_LABELS[reactionType]}
                          </button>
                        ))}
                        {canReply ? (
                          <button
                            className="message-action-btn subtle"
                            type="button"
                            onClick={() => handleReplyToMessage(item)}
                          >
                            Tra loi
                          </button>
                        ) : null}
                        <button
                          className="message-action-btn subtle"
                          type="button"
                          onClick={() => handleOpenForwardPicker(item)}
                        >
                          Chuyen tiep
                        </button>
                        {canEdit ? (
                          <button
                            className="message-action-btn subtle"
                            type="button"
                            onClick={() => handleStartEditing(item)}
                          >
                            Sua
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            className="message-action-btn danger-soft"
                            type="button"
                            onClick={() => handleDeleteMessage(item.id)}
                          >
                            Thu hoi
                          </button>
                        ) : null}
                        <button
                          className="message-action-btn subtle"
                          type="button"
                          onClick={() => handleHideMessage(item.id)}
                        >
                          An
                        </button>
                        <button
                          className="message-action-btn subtle"
                          type="button"
                          onClick={() => handleRemoveMessageForMe(item.id)}
                        >
                          Xoa cho toi
                        </button>
                        {Array.isArray(item.reactions) && item.reactions.length > 0 ? (
                          <span className="message-reaction-summary">
                            {item.reactions
                              .filter((reaction) => Number(reaction.count || 0) > 0)
                              .map(
                                (reaction) =>
                                  `${REACTION_LABELS[reaction.type] || reaction.type} ${
                                    reaction.count
                                  }`
                              )
                              .join(" ")}
                          </span>
                        ) : null}
                      </div>
                    )}
                    {index === normalizedMessages.length - 1 ? (
                      <div className="time-mess">
                        <p>
                          {formatTime(item.editedAt || item.createdAt)}
                          {item.id === lastOwnMessageId && item.seen ? " • Da xem" : ""}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="footer-chat">
        <div className="chat-input flex">
          <div className="flex">
            <div className="wrap-set-icon">
              <RiEmojiStickerLine
                className="icon-header"
                name="tableIcon"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleChangeMenuControl}
              />
              {menuControl.tableIcon ? (
                <div className="wrap-seticon">
                  <Icon handleGetIcon={handleGetIcon} />
                </div>
              ) : null}
            </div>
            <AiOutlinePicture className="icon-header" onClick={handleFilePickerOpen} />
            <IoMdAttach className="icon-header" onClick={handleFilePickerOpen} />
            <IoCameraOutline className="icon-header" />
            <MdOutlineContactMail className="icon-header" />
            <RiCalendarTodoFill className="icon-header" />
            <div className="wrap-setbackground">
              <TbBackground
                name="tableColor"
                onClick={handleChangeMenuControl}
                className="icon-header"
              />
              {menuControl.tableColor ? (
                <div className="set-background set-background-active">
                  <ul className="ul-set-background flex">
                    {codeBackground.map((value) => (
                      <li
                        key={value}
                        onClick={() => handleSetBackground(value)}
                        style={{ backgroundColor: value }}
                      >
                        &nbsp;
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <form onSubmit={handleSendMess}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={handleAttachmentPick}
          />
          <div className="chat-input-web">
            {replyingToMessage ? (
              <div className="composer-reply-banner">
                <div className="composer-reply-text">
                  <p className="composer-reply-label">
                    Tra loi {replyingToMessage.senderDisplayName || "tin nhan"}
                  </p>
                  <p className="composer-reply-preview">
                    {replyingToMessage.contentPreview || "Tin nhan"}
                  </p>
                </div>
                <button
                  className="composer-reply-close"
                  type="button"
                  onClick={handleCancelReply}
                  aria-label="Huy tra loi"
                >
                  <IoMdClose />
                </button>
              </div>
            ) : null}
            <ul className="list-img flex">
              {selectedAttachments.map((attachment) => (
                <li key={attachment.id} className="selected-attachment-card">
                  {attachment.isImage ? (
                    <img src={attachment.previewUrl} alt={attachment.fileName} />
                  ) : (
                    <div className="selected-attachment-file">
                      {attachment.fileName}
                    </div>
                  )}
                  <p onClick={() => handleRemoveSelectedAttachment(attachment.id)}>
                    <IoMdClose />
                  </p>
                </li>
              ))}
            </ul>
            <div
              className={`wrap-input-chat ${
                selectedAttachments.length > 0 ? "content-chat-height" : ""
              }`}
              style={{
                maxHeight: selectedAttachments.length > 0 ? undefined : "170px",
              }}
            >
              <div
                contentEditable
                suppressContentEditableWarning
                spellCheck="false"
                className="contentEditable"
                ref={inputMessage}
                onInput={syncComposerState}
                onFocus={captureComposerSelection}
                onKeyUp={captureComposerSelection}
                onMouseUp={captureComposerSelection}
                onSelect={captureComposerSelection}
                onKeyDown={handleButtonSendMess}
              />
            </div>
            <div className="flex">
              <AiOutlineSend
                className={`icon-header icon-send-mess ${activeIconSend ? "activeIconSend" : ""}`}
                style={{
                  color: "rgb(107 173 223)",
                  backgroundColor: "#dff3ff",
                  opacity: isSending ? 0.6 : 1,
                }}
                onClick={handleSendMess}
              />
              <AiOutlineLike className="icon-header" onClick={(event) => handleSendMess(event, true)} />
            </div>
          </div>
        </form>
        {isForwardPickerOpen ? (
          <div className="forward-picker-overlay" onClick={handleCloseForwardPicker}>
            <div className="forward-picker-card" onClick={(event) => event.stopPropagation()}>
              <div className="forward-picker-header">
                <div>
                  <h3 className="forward-picker-title">Chuyen tiep tin nhan</h3>
                  <p className="forward-picker-subtitle">
                    {forwardingMessage?.previewText || "Chon cuoc tro chuyen de gui lai."}
                  </p>
                </div>
                <button
                  className="message-action-btn subtle"
                  type="button"
                  onClick={handleCloseForwardPicker}
                  aria-label="Dong chuyen tiep"
                >
                  <IoMdClose />
                </button>
              </div>
              <div className="forward-picker-body">
                {availableForwardConversations.length > 0 ? (
                  <ul className="forward-target-list">
                    {availableForwardConversations.map((conversation) => {
                      const conversationName = getConversationDisplayName(conversation);
                      const conversationAvatar = getConversationAvatarUrl(conversation);
                      const isSelected =
                        String(conversation.id) === String(forwardTargetConversationId);

                      return (
                        <li key={conversation.id}>
                          <button
                            className={`forward-target-row ${isSelected ? "selected" : ""}`}
                            type="button"
                            onClick={() => handlePickForwardTarget(conversation)}
                          >
                            {renderAvatar(
                              conversationAvatar,
                              "forward-target-avatar-image",
                              conversationName
                            )}
                            <span className="forward-target-meta">
                              <strong>{conversationName}</strong>
                              <span>
                                {conversation.lastMessage || "Cuoc tro chuyen san co"}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="forward-picker-empty">
                    Khong co cuoc tro chuyen nao de chuyen tiep.
                  </p>
                )}
              </div>
              <div className="flex forward-picker-actions">
                <button
                  className="message-action-btn subtle"
                  type="button"
                  onClick={handleCloseForwardPicker}
                >
                  Huy
                </button>
                <button
                  className="message-action-btn primary"
                  type="button"
                  onClick={handleConfirmForward}
                  disabled={!forwardTargetConversationId || isForwarding}
                >
                  {isForwarding ? "Dang gui..." : "Gui"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {isSending ? <p className="composer-feedback-hint">Dang gui tin nhan...</p> : null}
        {forwardNotice ? <p className="composer-feedback-success">{forwardNotice}</p> : null}
        {actionError ? (
          <p className="composer-feedback-error">{actionError}</p>
        ) : null}
      </div>
    </div>
  );
}

export default memo(ContainerMess);
