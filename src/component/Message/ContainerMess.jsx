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
import { IoMdClose, IoMdAttach,IoMdMore  } from "react-icons/io";
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
import { askAi, getChatSummary } from "../../services/ai/aiApi";
import GroupCallMessageItem from "../Call/GroupCallMessageItem";
import { initiateGroupCallApi } from "../../services/call/groupCallApi";
import groupCallService from "../../services/call/GroupCallService";
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
  persistForwardedMessageFlag,
  removeMessageItem,
  removePersistedRecalledMessage,
  updateMessageReadReceipt,
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

const REACTION_OPTIONS = ["LIKE", "LOVE", "WOW", "HAHA"];
const TYPING_DEBOUNCE_MS = 400;
const TYPING_IDLE_MS = 900;
const REMOTE_TYPING_TIMEOUT_MS = 3000;
const PRIVATE_CONVERSATION_LABEL = "Nguoi dung";
const GROUP_CONVERSATION_LABEL = "Nhom";
const REACTION_LABELS = {
  LIKE: "👍",
  LOVE: "❤️",
  HAHA: "😂",
};

const getReactionEmoji = (reactionType) =>
  REACTION_LABELS[reactionType] || (reactionType === "WOW" ? "ðŸ˜®" : reactionType);

const getConversationDisplayName = (conversation) =>
  conversation?.displayName ||
  conversation?.trustedDisplayName ||
  conversation?.peerDisplayName ||
  (conversation?.type === "group" ? GROUP_CONVERSATION_LABEL : PRIVATE_CONVERSATION_LABEL);

const resolveReactionEmoji = (reactionType) =>
  ({
    LIKE: "\uD83D\uDC4D",
    LOVE: "\u2764\uFE0F",
    WOW: "\uD83D\uDE2E",
    HAHA: "\uD83D\uDE02",
  }[reactionType] || reactionType);

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
    senderDisplayName:
      message?.senderDisplayName ||
      message?.raw?.senderDisplayName ||
      message?.raw?.senderName ||
      null,
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
const MENTION_QUERY_PATTERN = /^[A-Za-z0-9._]*$/;
const MENTION_TOKEN_PATTERN = /(^|[^A-Za-z0-9._])@([A-Za-z0-9._]+)/g;

const closeMentionState = () => ({
  open: false,
  query: "",
  triggerStart: -1,
  caretOffset: 0,
});

const normalizeMentionHandle = (value) =>
  String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^A-Za-z0-9._]/g, "");

const getNestedValue = (value, path) =>
  path.reduce((currentValue, key) => currentValue?.[key], value);

const resolveMemberUsername = (member) => {
  const usernamePaths = [
    ["username"],
    ["raw", "username"],
    ["raw", "user", "username"],
    ["raw", "friend", "username"],
    ["raw", "profile", "username"],
    ["raw", "sender", "username"],
    ["raw", "receiver", "username"],
  ];

  for (const path of usernamePaths) {
    const username = normalizeMentionHandle(getNestedValue(member, path));
    if (username) {
      return username;
    }
  }

  return "";
};

const getComposerCaretTextOffset = (composer) => {
  const selection = window.getSelection?.();

  if (!composer || !selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!composer.contains(range.commonAncestorContainer)) {
    return null;
  }

  const prefixRange = range.cloneRange();
  prefixRange.selectNodeContents(composer);
  prefixRange.setEnd(range.endContainer, range.endOffset);
  return prefixRange.toString().length;
};

const setComposerCaretTextOffset = (composer, offset) => {
  if (!composer) {
    return;
  }

  if (!composer.firstChild) {
    composer.appendChild(document.createTextNode(""));
  }

  const targetOffset = Math.max(0, offset);
  const walker = document.createTreeWalker(composer, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  let remainingOffset = targetOffset;
  let targetNode = null;
  let targetNodeOffset = 0;

  while (currentNode) {
    const textLength = currentNode.textContent?.length || 0;
    if (remainingOffset <= textLength) {
      targetNode = currentNode;
      targetNodeOffset = remainingOffset;
      break;
    }

    remainingOffset -= textLength;
    currentNode = walker.nextNode();
  }

  if (!targetNode) {
    targetNode = composer.lastChild;
    targetNodeOffset = targetNode?.textContent?.length || 0;
  }

  const range = document.createRange();
  range.setStart(targetNode, targetNodeOffset);
  range.collapse(true);

  const selection = window.getSelection?.();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
};

const resolveActiveMentionQuery = (text, caretOffset) => {
  if (caretOffset == null) {
    return closeMentionState();
  }

  const prefixText = String(text || "").slice(0, caretOffset);
  const triggerStart = prefixText.lastIndexOf("@");

  if (triggerStart < 0) {
    return closeMentionState();
  }

  const previousChar = triggerStart > 0 ? prefixText[triggerStart - 1] : "";
  if (previousChar && /[A-Za-z0-9._]/.test(previousChar)) {
    return closeMentionState();
  }

  const query = prefixText.slice(triggerStart + 1);
  if (!MENTION_QUERY_PATTERN.test(query)) {
    return closeMentionState();
  }

  return {
    open: true,
    query,
    triggerStart,
    caretOffset,
  };
};

const renderMentionAwareText = (text, { enabled, messageId, conversationId } = {}) => {
  if (!enabled || !text) {
    return text;
  }

  const messageText = String(text);
  const parts = [];
  const matches = [];
  let lastIndex = 0;

  messageText.replace(MENTION_TOKEN_PATTERN, (match, prefix, handle, offset) => {
    const mentionStart = offset + prefix.length;
    const mentionEnd = mentionStart + handle.length + 1;

    if (offset > lastIndex) {
      parts.push(messageText.slice(lastIndex, offset));
    }

    if (prefix) {
      parts.push(messageText.slice(offset, mentionStart));
    }

    const mentionText = messageText.slice(mentionStart, mentionEnd);
    matches.push(mentionText);
    parts.push(
      <span className="message-mention-token" key={`${messageId || "msg"}-${mentionStart}`}>
        {mentionText}
      </span>
    );

    lastIndex = mentionEnd;
    return match;
  });

  if (!matches.length) {
    return text;
  }

  if (lastIndex < messageText.length) {
    parts.push(messageText.slice(lastIndex));
  }

  console.log("[WEB GROUP MENTION RENDER]", {
    conversationId,
    messageId,
    mentionCount: matches.length,
    mentions: matches,
  });

  return parts;
};


function ContainerMess({ contactData, onOpenConversationImageGallery }) {
  const scrollRef = useRef(null);
  const inputMessage = useRef(null);
  const composerSelectionRef = useRef(null);
  const imageInputRef = useRef(null);
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
  const [mentionState, setMentionState] = useState(() => closeMentionState());
  const [actionError, setActionError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [isForwardPickerOpen, setIsForwardPickerOpen] = useState(false);
  const [forwardTargetConversationId, setForwardTargetConversationId] = useState("");
  const [forwardSearchQuery, setForwardSearchQuery] = useState("");
  const [isForwarding, setIsForwarding] = useState(false);
  const [forwardNotice, setForwardNotice] = useState("");
  const [openMessageMenuId, setOpenMessageMenuId] = useState(null);
  const [aiMessages, setAiMessages] = useState([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [summaryState, setSummaryState] = useState({
    open: false,
    content: "",
    loading: false
  });
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

  // Listener cho sự kiện mở tóm tắt AI từ Sidebar
  useEffect(() => {
    const handleOpenSummary = async (event) => {
      const { conversationId } = event.detail;
      if (!conversationId || !currentUserId) return;

      setSummaryState({ open: true, content: "", loading: true });
      try {
        const result = await getChatSummary(conversationId, currentUserId);
        setSummaryState({ open: true, content: result, loading: false });
      } catch (error) {
        setSummaryState({ open: true, content: "Không thể lấy tóm tắt lúc này.", loading: false });
      }
    };

    window.addEventListener('OPEN_AI_SUMMARY', handleOpenSummary);
    return () => window.removeEventListener('OPEN_AI_SUMMARY', handleOpenSummary);
  }, [currentUserId]);

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
  const filteredForwardConversations = useMemo(() => {
    const normalizedQuery = String(forwardSearchQuery || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return availableForwardConversations;
    }

    return availableForwardConversations.filter((conversation) => {
      const displayName = getConversationDisplayName(conversation).toLowerCase();
      const lastMessage = String(conversation?.lastMessage || "").toLowerCase();
      return (
        displayName.includes(normalizedQuery) ||
        lastMessage.includes(normalizedQuery)
      );
    });
  }, [availableForwardConversations, forwardSearchQuery]);
  const currentUserAvatar = userData?.avatarUrl || userData?.avatar || null;
  const conversationMembers = useMemo(
    () => (Array.isArray(activeConversation?.members) ? activeConversation.members : []),
    [activeConversation?.members]
  );
  const memberIdentityMap = useMemo(
    () =>
      new Map(
        conversationMembers
          .filter((member) => member?.userId)
          .map((member) => [
            String(member.userId),
            {
              displayName: member.displayName || member.username || "",
              avatarUrl: member.avatarUrl || "",
              username: member.username || "",
            },
          ])
      ),
    [conversationMembers]
  );
  const mentionCandidates = useMemo(() => {
    if (activeConversation?.type !== "group") {
      return [];
    }

    const seenUserIds = new Set();
    let skippedMissingUsernameCount = 0;
    const nextCandidates = conversationMembers
      .filter((member) => member?.userId)
      .filter((member) => String(member.userId) !== String(currentUserId))
      .map((member) => {
        const mentionHandle = normalizeMentionHandle(
          member.username || resolveMemberUsername(member)
        );

        if (!mentionHandle) {
          skippedMissingUsernameCount += 1;
          return null;
        }

        return {
          userId: member.userId,
          displayName: member.displayName || member.username || mentionHandle,
          username: mentionHandle,
          mentionToken: `@${mentionHandle}`,
          avatarUrl: member.avatarUrl || "",
        };
      })
      .filter(Boolean)
      .filter((candidate) => {
        const normalizedUserId = String(candidate.userId);
        if (seenUserIds.has(normalizedUserId)) {
          return false;
        }

        seenUserIds.add(normalizedUserId);
        return true;
      });

    console.log("[WEB PHASE2 MENTION SOURCE]", {
      conversationId: backendConversationId,
      source: "canonical-members",
      memberCount: conversationMembers.length,
      candidateCount: nextCandidates.length,
      skippedMissingUsernameCount,
      candidates: nextCandidates.map((candidate) => ({
        userId: candidate.userId,
        username: candidate.username,
        displayName: candidate.displayName,
      })),
    });

    return nextCandidates;
  }, [
    activeConversation?.type,
    backendConversationId,
    conversationMembers,
    currentUserId,
  ]);
  const matchedMentionCandidates = useMemo(() => {
    if (!mentionState.open) {
      return [];
    }

    const normalizedQuery = mentionState.query.toLowerCase();
    const matches = mentionCandidates
      .filter((candidate) => {
        const username = candidate.username.toLowerCase();
        const displayName = String(candidate.displayName || "").toLowerCase();
        return (
          !normalizedQuery ||
          username.includes(normalizedQuery) ||
          displayName.includes(normalizedQuery)
        );
      })
      .slice(0, 6);

    console.log("[WEB PHASE2 MENTION SOURCE]", {
      conversationId: backendConversationId,
      source: "query-match",
      query: mentionState.query,
      matchCount: matches.length,
      matches: matches.map((candidate) => candidate.username),
    });

    return matches;
  }, [backendConversationId, mentionCandidates, mentionState.open, mentionState.query]);
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
      const normalizedUserId = userId ? String(userId) : "";
      if (normalizedUserId && normalizedUserId === String(currentUserId)) {
        return currentUserDisplayName;
      }

      if (normalizedUserId && memberIdentityMap.has(normalizedUserId)) {
        const memberIdentity = memberIdentityMap.get(normalizedUserId);
        return memberIdentity?.displayName || fallbackName || "Nguoi dung";
      }

      return fallbackName || "Nguoi dung";
    },
    [currentUserDisplayName, currentUserId, memberIdentityMap]
  );
  const resolveMessageSenderIdentity = useCallback(
    (message) => {
      const senderId = message?.senderId || null;
      const dtoDisplayName =
        message?.senderDisplayName ||
        message?.raw?.senderDisplayName ||
        message?.raw?.senderName ||
        message?.raw?.sender?.displayName ||
        message?.raw?.sender?.username ||
        "";
      const dtoAvatarUrl =
        message?.senderAvatarUrl ||
        message?.raw?.senderAvatarUrl ||
        message?.raw?.senderAvatar ||
        message?.raw?.sender?.avatarUrl ||
        message?.raw?.sender?.avatar ||
        "";
      const fallbackIdentity = senderId
        ? memberIdentityMap.get(String(senderId))
        : null;
      const resolvedIdentity = {
        displayName:
          dtoDisplayName ||
          fallbackIdentity?.displayName ||
          (senderId && String(senderId) === String(currentUserId)
            ? currentUserDisplayName
            : senderId
            ? `Nguoi dung ${String(senderId).slice(0, 8)}`
            : "Nguoi dung"),
        avatarUrl:
          dtoAvatarUrl ||
          fallbackIdentity?.avatarUrl ||
          (senderId && String(senderId) === String(currentUserId)
            ? currentUserAvatar || ""
            : ""),
        source: dtoDisplayName || dtoAvatarUrl ? "message-dto" : fallbackIdentity ? "canonical-member-fallback" : "minimal-fallback",
      };

      console.log("[WEB MESSAGE SENDER]", {
        conversationId: backendConversationId,
        messageId: message?.id || null,
        senderId,
        mappedDisplayName: resolvedIdentity.displayName,
        mappedAvatarUrl: resolvedIdentity.avatarUrl,
        source: resolvedIdentity.source,
      });

      return resolvedIdentity;
    },
    [
      backendConversationId,
      currentUserAvatar,
      currentUserDisplayName,
      currentUserId,
      memberIdentityMap,
    ]
  );
  const handleCloseMessageMenu = useCallback(() => {
    setOpenMessageMenuId(null);
  }, []);

  const handleToggleMessageMenu = useCallback((messageId) => {
    setOpenMessageMenuId((currentValue) =>
      String(currentValue) === String(messageId) ? null : messageId
    );
  }, []);


  const buildReplyTarget = useCallback(
    (message) => ({
      id: message?.id || null,
      senderId: message?.senderId || null,
      senderDisplayName:
        message?.senderDisplayName ||
        message?.raw?.senderDisplayName ||
        resolveMessageSenderIdentity(message).displayName,
      senderAvatarUrl:
        message?.senderAvatarUrl ||
        message?.raw?.senderAvatarUrl ||
        resolveMessageSenderIdentity(message).avatarUrl,
      contentPreview: buildReplyPreview(message),
      type:
        message?.type ||
        (Array.isArray(message?.attachments) && message.attachments.length
          ? "ATTACHMENT"
          : "TEXT"),
    }),
    [resolveMessageSenderIdentity]
  );

  const clearForwardState = useCallback(() => {
    setForwardingMessage(null);
    setIsForwardPickerOpen(false);
    setForwardTargetConversationId("");
    setForwardSearchQuery("");
  }, []);

  const handleOpenForwardPicker = useCallback(
    (message) => {
      const forwardDraft = buildForwardDraft(message);

      console.log("[WEB FORWARD OPEN]", {
        conversationId: backendConversationId,
        messageId: forwardDraft.id,
        type: forwardDraft.type,
        deletedAt: forwardDraft.deletedAt,
        attachmentsCount: forwardDraft.attachments.length,
        canForward: forwardDraft.canForward,
        availableConversationCount: availableForwardConversations.length,
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
      setForwardSearchQuery("");
      setIsForwardPickerOpen(true);
    },
    [availableForwardConversations.length, backendConversationId]
  );

  const handleCloseForwardPicker = useCallback(() => {
    setActionError("");
    clearForwardState();
  }, [clearForwardState]);

  const forwardingMessageId = forwardingMessage?.id || null;

  const handlePickForwardTarget = useCallback(
    (conversation) => {
      if (!conversation?.id) {
        return;
      }

      setForwardTargetConversationId(conversation.id);

      console.log("[WEB FORWARD SELECT]", {
        messageId: forwardingMessageId,
        targetConversationId: conversation.id,
        targetConversationName: getConversationDisplayName(conversation),
      });
    },
    [forwardingMessageId]
  );

  const handleConfirmForward = useCallback(async () => {
    if (isForwarding) {
      return;
    }

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
      const forwardedMessageId = response?.id || response?.messageId || null;

      persistForwardedMessageFlag({
        conversationId: targetConversation.id,
        currentUserId,
        messageId: forwardedMessageId,
        forwardedFrom: {
          messageId: forwardingMessage.id,
          senderDisplayName: forwardingMessage.senderDisplayName || null,
        },
      });

      if (String(targetConversation.id) === String(backendConversationId)) {
        const mappedForwardedMessage = mapMessage({
          ...response,
          forwarded: true,
          forwardedFrom: {
            messageId: forwardingMessage.id,
            senderDisplayName: forwardingMessage.senderDisplayName || null,
          },
        });

        setMessages((currentMessages) =>
          upsertMessageItem(currentMessages, mappedForwardedMessage)
        );
      }

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
    currentUserId,
    forwardingMessage,
    forwardTargetConversationId,
    isForwarding,
    persistForwardedMessageFlag,
    updateConversationById,
  ]);

  const pushTypingState = useCallback(
    async (isTyping) => {
      if (!backendConversationId || backendConversationId === "AI_ASSISTANT") {
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
    const composer = inputMessage.current;
    const currentComposerValue = composer?.textContent || "";
    const currentText = currentComposerValue.trim();
    setDraftText(currentText);
    setMentionState(
      activeConversation?.type === "group"
        ? resolveActiveMentionQuery(
            currentComposerValue,
            getComposerCaretTextOffset(composer)
          )
        : closeMentionState()
    );

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
  }, [activeConversation?.type, backendConversationId, pushTypingState]);

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
    setMentionState(closeMentionState());

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
    const handleDocumentClick = (event) => {
      if (!event.target.closest(".message-actions-menu")) {
        setOpenMessageMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, []);


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
    setOpenMessageMenuId(null);
    setMentionState(closeMentionState());
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

      if (!backendConversationId || backendConversationId === "AI_ASSISTANT") {
        if (!backendConversationId) setMessages([]);
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
        console.log("[WEB PHASE2 UNREAD SYNC]", {
          source: "initial-message-fetch",
          conversationId: backendConversationId,
          appliedUnreadCount: 0,
        });
        updateConversationById(backendConversationId, { unreadCount: 0 });
      } catch (error) {
        console.error("Failed to load backend conversation messages:", error);
        setMessages([]);
      }
    };

    fetchMessages();
  }, [backendConversationId, currentUserId, updateConversationById]);

  // Khởi tạo và đồng bộ tin nhắn AI từ Local Storage
  useEffect(() => {
    if (backendConversationId === "AI_ASSISTANT") {
      const stored = localStorage.getItem(`ai_chat_${currentUserId}`);
      if (stored) {
        setAiMessages(JSON.parse(stored));
      } else {
        setAiMessages([{
          id: 'welcome',
          senderId: 'AI',
          content: 'Xin chào! Tôi là Trợ lý AI. Tôi có thể giúp gì cho bạn?',
          createdAt: new Date().toISOString()
        }]);
      }
    }
  }, [backendConversationId, currentUserId]);

  useEffect(() => {
    if (backendConversationId === "AI_ASSISTANT") {
      localStorage.setItem(`ai_chat_${currentUserId}`, JSON.stringify(aiMessages));
    }
  }, [aiMessages, backendConversationId, currentUserId]);

  useEffect(() => {
    if (!backendConversationId || backendConversationId === "AI_ASSISTANT") {
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

  // --- Group Call WebSocket Subscription (Web - Tách biệt) ---
  useEffect(() => {
    if (!backendConversationId || activeConversation?.type !== 'group') {
      return undefined;
    }

    const subscriptionKey = `chat:conversation:${backendConversationId}:calls`;
    chatRealtimeService.subscribe(
      subscriptionKey,
      `/topic/conversations/${backendConversationId}/calls`,
      (payload) => {
        const eventType = payload?.type;
        const data = payload?.payload || payload;
        
        console.log('[WEB] Group Call Event Received:', { eventType, data });

        if (eventType === 'GROUP_CALL_INCOMING') {
          // Gửi event lên window để Zalo.jsx bắt được và hiện Modal nhận cuộc gọi
          window.dispatchEvent(new CustomEvent('group-call-incoming', { detail: data }));
        } else if (eventType === 'GROUP_CALL_ENDED') {
          window.dispatchEvent(new CustomEvent('group-call-ended', { detail: data }));
        }
      }
    ).catch(err => console.error('[WEB] Subscribe group calls error:', err));

    return () => {
      chatRealtimeService.unsubscribe(subscriptionKey);
    };
  }, [backendConversationId, activeConversation?.type]);

  useEffect(() => {
    if (!backendConversationId || backendConversationId === "AI_ASSISTANT") {
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
    if (!backendConversationId || backendConversationId === "AI_ASSISTANT") {
      return;
    }

    markConversationSeen(backendConversationId)
      .then(() => {
        console.log("[WEB PHASE2 UNREAD SYNC]", {
          source: "open-conversation-mark-seen",
          conversationId: backendConversationId,
          appliedUnreadCount: 0,
        });
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

  const handleImagePickerOpen = () => {
    imageInputRef.current?.click();
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

    // Xử lý gửi tin nhắn cho AI Assistant
    if (backendConversationId === "AI_ASSISTANT") {
      const userMsg = {
        id: `user-${Date.now()}`,
        senderId: currentUserId,
        content: messageText,
        createdAt: new Date().toISOString()
      };
      setAiMessages(prev => [...prev, userMsg]);
      resetComposer();
      setIsAiLoading(true);

      try {
        const aiResponseContent = await askAi(messageText);
        const aiMsg = {
          id: `ai-${Date.now()}`,
          senderId: 'AI',
          content: aiResponseContent,
          createdAt: new Date().toISOString()
        };
        setAiMessages(prev => [...prev, aiMsg]);
      } catch (error) {
        setAiMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          senderId: 'AI',
          content: 'Xin lỗi, tôi đang gặp trục trặc kỹ thuật. Vui lòng thử lại sau.',
          createdAt: new Date().toISOString()
        }]);
      } finally {
        setIsAiLoading(false);
        setIsSending(false);
      }
      return;
    }

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

  const handleSelectMentionCandidate = useCallback(
    (candidate) => {
      const composer = inputMessage.current;
      if (!composer || !candidate?.mentionToken || !mentionState.open) {
        return;
      }

      const currentText = composer.textContent || "";
      const caretOffset = mentionState.caretOffset;
      const beforeMention = currentText.slice(0, mentionState.triggerStart);
      const afterMention = currentText.slice(caretOffset);
      const insertion = `${candidate.mentionToken} `;
      const nextText = `${beforeMention}${insertion}${afterMention}`;
      const nextCaretOffset = beforeMention.length + insertion.length;

      composer.textContent = nextText;
      composer.focus();
      setComposerCaretTextOffset(composer, nextCaretOffset);
      composerSelectionRef.current = window.getSelection?.()?.rangeCount
        ? window.getSelection().getRangeAt(0).cloneRange()
        : null;

      setDraftText(nextText.trim());
      setMentionState(closeMentionState());

      console.log("[WEB GROUP MENTION INSERT]", {
        conversationId: backendConversationId,
        userId: candidate.userId,
        token: candidate.mentionToken,
        nextTextLength: nextText.length,
      });

      syncComposerState();
    },
    [
      backendConversationId,
      mentionState.caretOffset,
      mentionState.open,
      mentionState.triggerStart,
      syncComposerState,
    ]
  );

  const handleButtonSendMess = (event) => {
    if (mentionState.open && event.key === "Escape") {
      event.preventDefault();
      setMentionState(closeMentionState());
      return;
    }

    if (
      mentionState.open &&
      event.key === "Enter" &&
      !event.shiftKey &&
      matchedMentionCandidates.length > 0
    ) {
      event.preventDefault();
      handleSelectMentionCandidate(matchedMentionCandidates[0]);
      return;
    }

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
      console.log("[WEB REACTION]", {
        messageId: message.id,
        previousReaction: message.myReaction || null,
        nextReaction: message.myReaction === "LIKE" ? null : "LIKE",
      });
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
      console.log("[WEB REACTION]", {
        messageId: message.id,
        previousReaction: message.myReaction || null,
        nextReaction: message.myReaction === reactionType ? null : reactionType,
      });
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
  useEffect(() => {
    if (activeConversation?.type !== "group" || !backendConversationId || !currentUserId) {
      return undefined;
    }

    const ownGroupMessageIds = normalizedMessages
      .filter(
        (message) =>
          message?.id &&
          !message.deletedAt &&
          String(message.senderId) === String(currentUserId)
      )
      .map((message) => message.id);

    if (!ownGroupMessageIds.length) {
      return undefined;
    }

    ownGroupMessageIds.forEach((messageId) => {
      const subscriptionKey = `chat:message:${messageId}:status`;
      chatRealtimeService
        .subscribe(subscriptionKey, `/topic/messages/${messageId}/status`, (event) => {
          const payload =
            event?.payload && typeof event.payload === "object" ? event.payload : event;

          if (!payload?.messageId && !payload?.id) {
            return;
          }

          console.log("[WEB GROUP READ MAP]", {
            source: "status-topic",
            conversationId: backendConversationId,
            messageId: payload.messageId || payload.id,
            userId: payload.userId || null,
            status: payload.status || "",
          });

          setMessages((prevMessages) =>
            updateMessageReadReceipt(prevMessages, payload)
          );
        })
        .catch((error) => {
          console.error("[WEB GROUP READ MAP]", {
            source: "status-topic-subscribe-failed",
            conversationId: backendConversationId,
            messageId,
            error,
          });
        });
    });

    return () => {
      ownGroupMessageIds.forEach((messageId) => {
        chatRealtimeService.unsubscribe(`chat:message:${messageId}:status`);
      });
    };
  }, [
    activeConversation?.type,
    backendConversationId,
    currentUserId,
    normalizedMessages,
  ]);

  const buildGroupReadReceiptSummary = useCallback(
    (message) => {
      if (
        activeConversation?.type !== "group" ||
        !message?.id ||
        message.deletedAt ||
        String(message.senderId) !== String(currentUserId)
      ) {
        return null;
      }

      const seenByUserIds = Array.isArray(message.seenByUserIds)
        ? message.seenByUserIds
        : [];
      const otherSeenUserIds = seenByUserIds.filter(
        (userId) => String(userId) !== String(currentUserId)
      );

      if (!otherSeenUserIds.length) {
        console.log("[WEB GROUP READ RENDER]", {
          conversationId: backendConversationId,
          messageId: message.id,
          source: message.readReceiptSource || "none",
          decision: "no-known-other-readers",
          viewerSeenFlag: message.seen,
        });
        return null;
      }

      const resolvedReaders = otherSeenUserIds.map((userId) => {
        const memberIdentity = memberIdentityMap.get(String(userId));
        return {
          userId,
          displayName: memberIdentity?.displayName || "",
          source: memberIdentity ? "canonical-member" : "unknown",
        };
      });
      const knownNames = resolvedReaders
        .map((reader) => reader.displayName)
        .filter(Boolean);
      const label =
        knownNames.length === 1 && otherSeenUserIds.length === 1
          ? `Da xem boi ${knownNames[0]}`
          : knownNames.length > 1 && knownNames.length <= 3 && knownNames.length === otherSeenUserIds.length
          ? `Da xem boi ${knownNames.join(", ")}`
          : `Da xem boi ${otherSeenUserIds.length} nguoi`;
      const title = knownNames.length
        ? knownNames.join(", ")
        : `${otherSeenUserIds.length} thanh vien da xem`;

      console.log("[WEB GROUP READ MEMBERS]", {
        conversationId: backendConversationId,
        messageId: message.id,
        readerCount: otherSeenUserIds.length,
        resolvedReaders,
      });
      console.log("[WEB GROUP READ RENDER]", {
        conversationId: backendConversationId,
        messageId: message.id,
        source: message.readReceiptSource || "unknown",
        label,
      });

      return { label, title };
    },
    [
      activeConversation?.type,
      backendConversationId,
      currentUserId,
      memberIdentityMap,
    ]
  );

  useEffect(() => {
    if (activeConversation?.type !== "group") {
      return;
    }

    const senderIds = Array.from(
      new Set(
        normalizedMessages
          .map((message) => message.senderId)
          .filter(Boolean)
          .map((senderId) => String(senderId))
      )
    );
    const unresolvedSenderIds = senderIds.filter(
      (senderId) =>
        String(senderId) !== String(currentUserId) &&
        !memberIdentityMap.has(senderId)
    );

    console.log("[WEB MESSAGE SENDER]", {
      conversationId: backendConversationId,
      source: "canonical-members",
      memberCount: conversationMembers.length,
      messageCount: normalizedMessages.length,
      senderCount: senderIds.length,
      unresolvedSenderIds,
    });
  }, [
    activeConversation?.type,
    backendConversationId,
    conversationMembers.length,
    currentUserId,
    memberIdentityMap,
    normalizedMessages,
  ]);
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

  const handleStartGroupCall = useCallback(async (type) => {
    if (!backendConversationId) return;
    try {
      console.log("[WEB] Initiating group call:", { type, conversationId: backendConversationId });
      const callData = await initiateGroupCallApi(backendConversationId, type);
      
      // Chuyển hướng ngay lập tức (Host mode)
      const event = new CustomEvent('group-call-join-request', { 
        detail: {
          ...callData,
          initiatorId: currentUserId,
          initiatorName: userData?.displayName || "Bạn",
          type: type.toUpperCase() // VIDEO/VOICE
        } 
      });
      window.dispatchEvent(event);
    } catch (error) {
      console.error("[WEB] Failed to initiate group call:", error);
      alert("Không thể khởi tạo cuộc gọi nhóm.");
    }
  }, [backendConversationId, currentUserId, userData]);

  const handleOpenAiSummaryInChat = async () => {
    if (!backendConversationId || !currentUserId) return;
    setSummaryState({ open: true, content: "", loading: true });
    try {
      const result = await getChatSummary(backendConversationId, currentUserId);
      setSummaryState({ open: true, content: result, loading: false });
    } catch (error) {
      setSummaryState({ open: true, content: "Không thể lấy tóm tắt lúc này.", loading: false });
    }
  };

  const getUnreadCount = () => {
    const conv = conversations.find(c => c.id === backendConversationId) || 
                 archivedConversations.find(c => c.id === backendConversationId);
    return Number(conv?.unreadCount || 0);
  };

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
          {getUnreadCount() >= 5 && (
            <div 
              className="icon-header ai-summary-btn" 
              title="Tóm tắt tin nhắn bằng AI" 
              onClick={handleOpenAiSummaryInChat}
              style={{ color: '#0084ff', fontWeight: 'bold' }}
            >
              ✨
            </div>
          )}
          <HiOutlineUserGroup className="icon-header" />
          <CiSearch className="icon-header" />
          {activeConversation?.type === 'group' ? (
            <>
              <IoCallOutline className="icon-header" onClick={() => handleStartGroupCall("VOICE")} />
              <IoVideocamOutline className="icon-header" onClick={() => handleStartGroupCall("VIDEO")} />
            </>
          ) : (
            <>
              <IoCallOutline className="icon-header" onClick={() => handleStartCall("VOICE")} />
              <IoVideocamOutline className="icon-header" onClick={() => handleStartCall("VIDEO")} />
            </>
          )}
        </div>
      </div>
      <div className="infor-container" style={{ backgroundColor: theme }}>
        <div>
          <ul>
            {(backendConversationId === "AI_ASSISTANT" ? aiMessages : normalizedMessages).map((item, index) => {
              const isMine = item.senderId === currentUserId;
              const isAi = item.senderId === 'AI';

              // Render Group Call Log (Tin nhắn thông báo cuộc gọi)
              if (item.type === 'CALL_LOG') {
                return (
                  <GroupCallMessageItem 
                    key={item.id || index}
                    message={item}
                    isMine={isMine}
                    onJoin={(callData) => {
                      // Gửi event để Zalo.jsx xử lý việc tham gia cuộc gọi
                      window.dispatchEvent(new CustomEvent('group-call-join-request', { detail: callData }));
                    }}
                  />
                );
              }

              const isDeleted = Boolean(item.deletedAt);
              const visibleAttachments = isDeleted ? [] : (item.attachments || []);
              const imageAttachments = visibleAttachments.filter(attachment => attachment && isImageAttachment(attachment));
              const fileAttachments = visibleAttachments.filter(
                (attachment) => attachment && !isImageAttachment(attachment)
              );
              const canEdit =
                isMine && !isDeleted && !visibleAttachments.length && Boolean(item.content);
              const canDelete = isMine && !isDeleted;
              const canReply = Boolean(item.id) && !isDeleted;
              const forwardDraft = buildForwardDraft(item);
              const canForwardMessage = forwardDraft.canForward;
              const replyPreviewSenderName = !isDeleted && item.replyTo
                ? (() => {
                    const resolvedReplySenderName =
                      item.replyTo.senderDisplayName ||
                      (item.replyTo.senderId &&
                      String(item.replyTo.senderId) === String(currentUserId)
                        ? currentUserDisplayName
                        : memberIdentityMap.get(String(item.replyTo.senderId || ""))?.displayName) ||
                      "Nguoi dung";

                    console.log("[WEB REPLY SENDER]", {
                      conversationId: backendConversationId,
                      messageId: item.id || null,
                      senderId: item.replyTo.senderId || null,
                      mappedDisplayName: resolvedReplySenderName,
                      mappedAvatarUrl:
                        item.replyTo.senderAvatarUrl ||
                        memberIdentityMap.get(String(item.replyTo.senderId || ""))?.avatarUrl ||
                        "",
                    });

                    return resolvedReplySenderName;
                  })()
                : "";
              const replyPreviewText = !isDeleted && item.replyTo
                ? truncateText(item.replyTo.contentPreview || "Tin nhan", 90)
                : "";
              const displayText = isDeleted
                ? RECALLED_MESSAGE_PLACEHOLDER
                : item.content;
              const renderedDisplayText = renderMentionAwareText(displayText, {
                enabled: activeConversation?.type === "group" && !isDeleted,
                conversationId: backendConversationId,
                messageId: item.id,
              });
              const senderIdentity = resolveMessageSenderIdentity(item);
              const forwardedFromSenderName =
                item?.forwardedFrom?.senderDisplayName ||
                item?.raw?.forwardedFrom?.senderDisplayName ||
                "";
              if (item.forwarded && !isDeleted) {
                console.log("[WEB FORWARD RENDER]", {
                  conversationId: backendConversationId,
                  messageId: item.id,
                  forwardedFromMessageId:
                    item?.forwardedFrom?.messageId || item?.raw?.forwardedFrom?.messageId || null,
                  forwardedFromSenderName: forwardedFromSenderName || null,
                });
              }
              const groupReadReceiptSummary = buildGroupReadReceiptSummary(item);

              return (
                <li
                  ref={index === normalizedMessages.length - 1 ? scrollRef : null}
                  key={item.id || `${item.createdAt}-${index}`}
                  className={`wrap-text-mess ${isMine ? "my-mess" : ""} ${
                    item.deletedAt ? "message-row-deleted" : ""
                  } flex`}
                >
                  {isAi ? (
                    <img className="" src="https://cdn-icons-png.flaticon.com/512/4712/4712035.png" alt="AI" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                  ) : (
                    renderAvatar(senderIdentity.avatarUrl, "", senderIdentity.displayName)
                  )}
                  <div
                    className={`detail-mess ${
                      isDeleted ? "detail-mess-deleted" : ""
                    } ${fileAttachments.length ? "detail-mess-has-files" : ""}`}
                  >
                    {!isMine && !isAi && (
                      <p className="name-mess">{senderIdentity.displayName}</p>
                    )}
                    {isAi && <p className="name-mess">Trợ lý AI</p>}
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
                        {item.forwarded && !isDeleted ? (
                          <div className="message-forwarded-preview">
                            <p className="message-forwarded-label">Chuyen tiep</p>
                            {forwardedFromSenderName ? (
                              <p className="message-forwarded-meta">
                                tu {forwardedFromSenderName}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
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
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onOpenConversationImageGallery?.({
                                      id: attachment.id || attachment.url,
                                      url: attachment.url,
                                      fileName: attachment.fileName || "",
                                    });
                                  }}
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
                            {renderedDisplayText}
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

                        <div className="message-reaction-picker">
                          <button
                            className={`message-reaction-trigger ${
                              item.myReaction && item.myReaction !== "LIKE"
                                ? "active-reaction"
                                : "subtle"
                            }`}
                            type="button"
                            aria-label="Mo bang cam xuc"
                          >
                            <RiEmojiStickerLine />
                          </button>

                          <div className="message-reaction-popover">
                            {REACTION_OPTIONS.map((reactionType) => (
                              <button
                                className={`message-reaction-btn ${
                                  item.myReaction === reactionType ? "active-reaction" : ""
                                }`}
                                key={reactionType}
                                type="button"
                                onClick={() => handleQuickReaction(item, reactionType)}
                              >
                                {resolveReactionEmoji(reactionType)}
                              </button>
                            ))}
                          </div>
                        </div>

                        {canReply ? (
                          <button
                            className="message-action-btn subtle"
                            type="button"
                            onClick={() => handleReplyToMessage(item)}
                          >
                            Tra loi
                          </button>
                        ) : null}

                        <div className="message-actions-menu">
                          <button
                            className="message-action-menu-trigger"
                            type="button"
                            aria-label="Mo tac vu tin nhan"
                            aria-expanded={String(openMessageMenuId) === String(item.id)}
                            onClick={() => handleToggleMessageMenu(item.id)}
                          >
                            <IoMdMore />
                          </button>

                          {String(openMessageMenuId) === String(item.id) ? (
                            <div className="message-actions-dropdown">
                              <button
                                className="message-action-menu-item"
                                type="button"
                                disabled={!canForwardMessage}
                                title={!canForwardMessage ? forwardDraft.reason : undefined}
                                onClick={() => {
                                  if (!canForwardMessage) {
                                    return;
                                  }
                                  handleCloseMessageMenu();
                                  handleOpenForwardPicker(item);
                                }}
                              >
                                Chuyen tiep
                              </button>

                              {canEdit ? (
                                <button
                                  className="message-action-menu-item"
                                  type="button"
                                  onClick={() => {
                                    handleCloseMessageMenu();
                                    handleStartEditing(item);
                                  }}
                                >
                                  Sua
                                </button>
                              ) : null}

                              {canDelete ? (
                                <button
                                  className="message-action-menu-item danger"
                                  type="button"
                                  onClick={() => {
                                    handleCloseMessageMenu();
                                    handleDeleteMessage(item.id);
                                  }}
                                >
                                  Thu hoi
                                </button>
                              ) : null}

                              <button
                                className="message-action-menu-item"
                                type="button"
                                onClick={() => {
                                  handleCloseMessageMenu();
                                  handleHideMessage(item.id);
                                }}
                              >
                                An
                              </button>

                              <button
                                className="message-action-menu-item"
                                type="button"
                                onClick={() => {
                                  handleCloseMessageMenu();
                                  handleRemoveMessageForMe(item.id);
                                }}
                              >
                                Xoa cho toi
                              </button>
                            </div>
                          ) : null}
                        </div>

                        {Array.isArray(item.reactions) && item.reactions.length > 0 ? (
                          <span className="message-reaction-summary">
                            {item.reactions
                              .filter((reaction) => Number(reaction.count || 0) > 0)
                              .map(
                                (reaction) =>
                                  `${resolveReactionEmoji(reaction.type)} ${reaction.count}`
                              )
                              .join(" ")}
                          </span>
                        ) : null}
                      </div>
                    )}
                    {groupReadReceiptSummary ? (
                      <p
                        className="group-read-receipt"
                        title={groupReadReceiptSummary.title}
                      >
                        {groupReadReceiptSummary.label}
                      </p>
                    ) : null}

                    {index === normalizedMessages.length - 1 ? (
                      <div className="time-mess">
                        <p>
                          {formatTime(item.editedAt || item.createdAt)}
                          {activeConversation?.type !== "group" &&
                          item.id === lastOwnMessageId &&
                          item.seen
                            ? " • Da xem"
                            : ""}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {isAiLoading && (
              <li className="wrap-text-mess flex">
                <img src="https://cdn-icons-png.flaticon.com/512/4712/4712035.png" alt="AI" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                <div className="detail-mess">
                  <p className="name-mess">Trợ lý AI</p>
                  <p className="text-mess">Đang suy nghĩ...</p>
                </div>
              </li>
            )}
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
            <AiOutlinePicture className="icon-header" onClick={handleImagePickerOpen} />
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
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handleAttachmentPick}
          />
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
            {activeConversation?.type === "group" && mentionState.open ? (
              <div className="mention-suggestion-panel">
                {matchedMentionCandidates.length > 0 ? (
                  matchedMentionCandidates.map((candidate) => (
                    <button
                      className="mention-suggestion-row"
                      key={candidate.userId}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelectMentionCandidate(candidate)}
                    >
                      {renderAvatar(
                        candidate.avatarUrl,
                        "mention-suggestion-avatar",
                        candidate.displayName
                      )}
                      <span className="mention-suggestion-meta">
                        <strong>{candidate.displayName}</strong>
                        <span>{candidate.mentionToken}</span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="mention-suggestion-empty">Khong tim thay thanh vien</p>
                )}
              </div>
            ) : null}
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
              <div className="forward-picker-search-row">
                <CiSearch className="forward-picker-search-icon" />
                <input
                  className="forward-picker-search-input"
                  type="text"
                  placeholder="Tim cuoc tro chuyen"
                  value={forwardSearchQuery}
                  onChange={(event) => setForwardSearchQuery(event.target.value)}
                />
              </div>
              <div className="forward-picker-body">
                {filteredForwardConversations.length > 0 ? (
                  <ul className="forward-target-list">
                    {filteredForwardConversations.map((conversation) => {
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
                    Khong tim thay cuoc tro chuyen phu hop.
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
              {actionError ? (
                <p className="composer-feedback-error forward-picker-error">{actionError}</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {isSending ? <p className="composer-feedback-hint">Dang gui tin nhan...</p> : null}
        {forwardNotice ? <p className="composer-feedback-success">{forwardNotice}</p> : null}
        {!isForwardPickerOpen && actionError ? (
          <p className="composer-feedback-error">{actionError}</p>
        ) : null}
      </div>

      {/* AI Summary Modal */}
      {summaryState.open && (
        <div className="ai-summary-overlay" style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex',
          justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)'
        }}>
          <div className="ai-summary-modal" style={{
            backgroundColor: 'white', width: '500px', maxWidth: '90%',
            borderRadius: '12px', padding: '24px', position: 'relative',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <h2 style={{ margin: '0 0 16px', color: '#0068ff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ✨ Tóm tắt bằng AI
            </h2>
            <div style={{ 
              maxHeight: '400px', overflowY: 'auto', lineHeight: '1.6', color: '#444',
              whiteSpace: 'pre-wrap'
            }}>
              {summaryState.loading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>Đang phân tích tin nhắn...</div>
              ) : summaryState.content}
            </div>
            <button 
              onClick={() => setSummaryState({ ...summaryState, open: false })}
              style={{
                marginTop: '24px', width: '100%', padding: '10px',
                backgroundColor: '#0068ff', color: 'white', border: 'none',
                borderRadius: '6px', cursor: 'pointer', fontWeight: '500'
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ContainerMess);
