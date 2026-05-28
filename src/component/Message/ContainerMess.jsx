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
import { UserContext } from "../../Context/UserContext";
import { ContactContext } from "../../Context/ContactConext";
import Icon from "./Icon";
import { HiOutlineUserGroup } from "react-icons/hi2";
import { CiSearch } from "react-icons/ci";
import { IoVideocamOutline, IoCameraOutline, IoCallOutline, IoBarChartOutline, IoArrowUndoOutline, IoArrowDown } from "react-icons/io5";
import { AiOutlineLike, AiFillLike, AiOutlinePicture, AiOutlineSend } from "react-icons/ai";
import { IoMdClose, IoMdAttach,IoMdMore  } from "react-icons/io";
import { MdOutlineContactMail } from "react-icons/md";
import {
  RiCalendarTodoFill,
  RiEmojiStickerLine,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
} from "react-icons/ri";
import { RxDotFilled } from "react-icons/rx";
import {
  addOrUpdateReactionV1,
  deleteMessageV1,
  editMessageV1,
  getConversationMessages,
  getMessageContextV1,
  hideMessageV1,
  markConversationSeen,
  pinMessageV1,
  removeReactionV1,
  removeMessageForMeV1,
  sendMessageV1,
  sendTypingState,
  uploadAttachmentV1,
} from "../../services/chat/messageApi";
import chatRealtimeService from "../../services/chat/chatRealtimeService";
import { askAi, getChatSummary } from "../../services/ai/aiApi";
import { initiateGroupCallApi } from "../../services/call/groupCallApi";
import groupCallService from "../../services/call/GroupCallService";
import {
  RECALLED_MESSAGE_PLACEHOLDER,
  createReplyPreviewText,
  createAttachmentPreviewText,
  isImageAttachment,
  isVideoAttachment,
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
import { searchUsersV2, sendFriendRequestV2 } from "../../util/api";
import {
  USER_BLOCK_STATUS_CHANGED_EVENT,
  isUserBlockedByCurrentUser,
} from "../../services/userBlockApi";

const REACTION_OPTIONS = ["LIKE", "LOVE", "WOW", "HAHA"];
const POLL_CREATE_PREFIX = "[[POLL_CREATE]]";
const POLL_VOTE_PREFIX = "[[POLL_VOTE]]";
const POLL_ADD_OPTION_PREFIX = "[[POLL_ADD_OPTION]]";
const TYPING_DEBOUNCE_MS = 400;
const TYPING_IDLE_MS = 900;
const REMOTE_TYPING_TIMEOUT_MS = 3000;
const BLOCK_STATE_LOADING_MESSAGE = "Đang kiểm tra trạng thái chặn...";
const PRIVATE_BLOCKED_COMPOSER_MESSAGE =
  "Bạn đã chặn người dùng này. Bỏ chặn trong Thông tin hội thoại để trò chuyện lại.";
const PRIVATE_CONVERSATION_LABEL = "Người dùng";
const GROUP_CONVERSATION_LABEL = "Nhóm";
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
const isVideoFile = (file) => String(file?.type || "").startsWith("video/");

const formatCallDuration = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

const resolveCallLogTitle = (callLog) => {
  const normalizedType = String(callLog?.callType || "VOICE").toUpperCase();
  const normalizedStatus = String(callLog?.callStatus || "ENDED").toUpperCase();
  const isVideo = normalizedType === "VIDEO";

  if (normalizedStatus === "MISSED") {
    return isVideo ? "Cuộc gọi video nhỡ" : "Cuộc gọi nhỡ";
  }

  return isVideo ? "Cuộc gọi video" : "Cuộc gọi thoại";
};

const resolveCallLogSubtitle = (callLog, currentUserId, fallbackName) => {
  const normalizedStatus = String(callLog?.callStatus || "ENDED").toUpperCase();
  const isCaller = String(callLog?.callerId || "") === String(currentUserId || "");
  const actorLabel = isCaller ? "Bạn" : fallbackName || "Người kia";

  if (normalizedStatus === "MISSED") {
    return isCaller ? `${fallbackName || "Người kia"} đã bỏ lỡ cuộc gọi` : `${actorLabel} đã gọi`;
  }

  if (normalizedStatus === "REJECTED") {
    return isCaller ? `${fallbackName || "Người kia"} đã từ chối cuộc gọi` : "Bạn đã từ chối cuộc gọi";
  }

  if (normalizedStatus === "STARTED") {
    return `${callLog?.initiatorName || actorLabel} đã bắt đầu cuộc gọi`;
  }

  return isCaller ? "Bạn đã gọi" : `${actorLabel} đã gọi`;
};

const buildSelectedAttachment = (file, index) => ({
  id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
  file,
  fileName: file.name,
  contentType: file.type || "",
  previewUrl: isImageFile(file) || isVideoFile(file) ? URL.createObjectURL(file) : "",
  isImage: isImageFile(file),
  isVideo: isVideoFile(file),
});

const parseSystemMessage = (content) => {
  const normalizedContent = String(content || "").trim();

  if (!normalizedContent) {
    return null;
  }

  const matchers = [
    { kind: "poll_create", prefix: POLL_CREATE_PREFIX },
    { kind: "poll_vote", prefix: POLL_VOTE_PREFIX },
    { kind: "poll_add_option", prefix: POLL_ADD_OPTION_PREFIX },
  ];

  for (const matcher of matchers) {
    if (!normalizedContent.startsWith(matcher.prefix)) {
      continue;
    }

    try {
      return {
        kind: matcher.kind,
        payload: JSON.parse(normalizedContent.slice(matcher.prefix.length)),
      };
    } catch {
      return null;
    }
  }

  return null;
};

const buildPollMessageContent = (kind, payload) => {
  const serializedPayload = JSON.stringify(payload || {});
  if (kind === "poll_create") {
    return `${POLL_CREATE_PREFIX}${serializedPayload}`;
  }
  if (kind === "poll_vote") {
    return `${POLL_VOTE_PREFIX}${serializedPayload}`;
  }
  return `${POLL_ADD_OPTION_PREFIX}${serializedPayload}`;
};

const normalizeIdentifierToken = (value) => String(value || "").trim().toLowerCase();
const normalizePhoneToken = (value) =>
  String(value || "")
    .trim()
    .replace(/[\s.()-]/g, "")
    .toLowerCase();

const extractIdentifierToken = (text) => {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    return "";
  }

  const emailMatch = normalizedText.match(
    /^([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})$/i
  );
  if (emailMatch?.[1]) {
    return normalizeIdentifierToken(emailMatch[1]);
  }

  const compactPhone = normalizedText.replace(/[\s.()-]/g, "");
  if (/^\+?\d{8,15}$/.test(compactPhone)) {
    return normalizeIdentifierToken(compactPhone);
  }

  return "";
};

const resolveFriendStatusLabel = (status) => {
  const normalizedStatus = String(status || "").toUpperCase();
  if (normalizedStatus === "FRIEND") {
    return "Bạn bè";
  }
  if (normalizedStatus === "REQUEST_SENT") {
    return "Đã gửi lời mời";
  }
  if (normalizedStatus === "REQUEST_RECEIVED") {
    return "Đã nhận lời mời";
  }
  return "Kết bạn";
};

const URL_IN_TEXT_PATTERN =
  /((?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com|youtu\.be|youtube\.com|(?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/[^\s<>"'`]*)?)/gi;

const extractFirstUrlFromText = (text) => {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    return "";
  }

  const matcher = new RegExp(URL_IN_TEXT_PATTERN);
  const match = matcher.exec(normalizedText);
  return match?.[1] || "";
};

const normalizeUrlForPreview = (url) => {
  try {
    const rawUrl = String(url || "").trim();
    if (!rawUrl) {
      return "";
    }

    const candidateUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const parsed = new URL(candidateUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const trimUrlToken = (token) => String(token || "").replace(/[)\],.!?;:]+$/g, "");

const normalizePreviewTitle = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const renderLinkifiedText = (text, keyPrefix) => {
  const rawText = String(text || "");
  if (!rawText) {
    return rawText;
  }

  const matcher = new RegExp(URL_IN_TEXT_PATTERN);
  const parts = [];
  let lastIndex = 0;
  let match;
  let linkIndex = 0;

  while ((match = matcher.exec(rawText)) !== null) {
    const fullMatch = match[0] || "";
    const rawUrl = match[1] || "";
    const matchIndex = match.index;
    const normalizedUrl = normalizeUrlForPreview(trimUrlToken(rawUrl));

    if (!normalizedUrl) {
      continue;
    }

    if (matchIndex > lastIndex) {
      parts.push(rawText.slice(lastIndex, matchIndex));
    }

    parts.push(
      <a
        key={`${keyPrefix}-url-${linkIndex}`}
        href={normalizedUrl}
        target="_blank"
        rel="noreferrer"
        className="message-inline-link"
        onClick={(event) => event.stopPropagation()}
      >
        {fullMatch}
      </a>
    );

    lastIndex = matchIndex + fullMatch.length;
    linkIndex += 1;
  }

  if (lastIndex < rawText.length) {
    parts.push(rawText.slice(lastIndex));
  }

  return parts.length ? parts : rawText;
};

const resolveAttachmentTypeMeta = (attachment) => {
  const contentType = String(attachment?.contentType || "").toLowerCase();
  const fileName = String(attachment?.fileName || attachment?.name || "").toLowerCase();
  const ext = fileName.includes(".") ? fileName.split(".").pop() || "" : "";

  if (contentType.startsWith("application/pdf") || ext === "pdf") {
    return { icon: "📄", label: "PDF" };
  }
  if (
    contentType.includes("word") ||
    ["doc", "docx", "odt", "rtf"].includes(ext)
  ) {
    return { icon: "📝", label: "DOC" };
  }
  if (
    contentType.includes("spreadsheet") ||
    contentType.includes("excel") ||
    ["xls", "xlsx", "csv", "ods"].includes(ext)
  ) {
    return { icon: "📊", label: "XLS" };
  }
  if (
    contentType.includes("presentation") ||
    ["ppt", "pptx", "odp"].includes(ext)
  ) {
    return { icon: "📽", label: "PPT" };
  }
  if (
    contentType.startsWith("text/") ||
    ["txt", "md", "json", "xml", "yml", "yaml", "log"].includes(ext)
  ) {
    return { icon: "📃", label: "TXT" };
  }
  if (
    contentType.includes("zip") ||
    ["zip", "rar", "7z", "tar", "gz"].includes(ext)
  ) {
    return { icon: "🗜", label: "ZIP" };
  }

  return { icon: "📎", label: (ext || "FILE").slice(0, 6).toUpperCase() };
};

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
    return `${content} · ${attachmentCount} tệp đính kèm`;
  }

  if (content) {
    return content;
  }

  if (attachmentCount === 1) {
    return "1 tệp đính kèm";
  }

  if (attachmentCount > 1) {
    return `${attachmentCount} tệp đính kèm`;
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
      reason: "Tin nhắn đã thu hồi không thể chuyển tiếp.",
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
      reason: "Tin nhắn này không có nội dung để chuyển tiếp.",
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
      reason: "Tệp đính kèm này không thể chuyển tiếp an toàn.",
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
  truncateText(createReplyPreviewText(message), 90) || "Tin nhắn";

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
    return "Đang gõ tin nhắn...";
  }

  const namedTypingUsers = typingUsers
    .map((item) => String(item?.displayName || "").trim())
    .filter(Boolean);

  if (!namedTypingUsers.length) {
    return "Có người đang gõ tin nhắn...";
  }

  if (namedTypingUsers.length === 1) {
    return `${namedTypingUsers[0]} đang gõ tin nhắn...`;
  }

  if (namedTypingUsers.length === 2) {
    return `${namedTypingUsers[0]} và ${namedTypingUsers[1]} đang gõ tin nhắn...`;
  }

  return "Nhiều người đang gõ tin nhắn...";
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

const resolveMessageLinkUrl = (message, linkPreviewByUrl = {}) => {
  const contentUrl = normalizeUrlForPreview(extractFirstUrlFromText(message?.content));
  if (contentUrl) {
    return contentUrl;
  }

  const raw = message?.raw || {};
  const candidatePaths = [
    ["originalLinkUrl"],
    ["metadata", "url"],
    ["metadata", "link"],
    ["metadata", "linkUrl"],
    ["metadata", "originalLinkUrl"],
    ["metadata", "sourceUrl"],
    ["metadata", "targetUrl"],
    ["metadata", "originalUrl"],
    ["metadata", "canonicalUrl"],
    ["metadata", "previewUrl"],
    ["metadata", "linkPreview", "url"],
    ["metadata", "linkPreview", "originalUrl"],
    ["metadata", "linkPreview", "targetUrl"],
    ["linkPreview", "url"],
    ["linkPreview", "originalUrl"],
    ["link", "url"],
    ["url"],
    ["sourceUrl"],
    ["targetUrl"],
  ];

  for (const path of candidatePaths) {
    const value = getNestedValue(raw, path);
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }

    const normalizedUrl = normalizeUrlForPreview(extractFirstUrlFromText(value) || value);
    if (normalizedUrl) {
      return normalizedUrl;
    }
  }

  const normalizedMessageTitle = normalizePreviewTitle(message?.content);
  if (!normalizedMessageTitle) {
    return "";
  }

  for (const [storedUrl, preview] of Object.entries(linkPreviewByUrl || {})) {
    if (!preview) {
      continue;
    }

    const normalizedPreviewTitle = normalizePreviewTitle(preview?.title);
    if (!normalizedPreviewTitle || normalizedPreviewTitle !== normalizedMessageTitle) {
      continue;
    }

    const normalizedPreviewUrl = normalizeUrlForPreview(preview?.url || storedUrl);
    if (normalizedPreviewUrl) {
      return normalizedPreviewUrl;
    }
  }

  return "";
};

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
    return renderLinkifiedText(text, `${messageId || "msg"}-plain`);
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
    return renderLinkifiedText(text, `${messageId || "msg"}-nomention`);
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

  return parts.flatMap((part, index) =>
    typeof part === "string"
      ? renderLinkifiedText(part, `${messageId || "msg"}-part-${index}`)
      : part
  );
};


function ContainerMess({
  contactData,
  onOpenConversationImageGallery,
  isInfoPanelVisible = true,
  onToggleInfoPanel,
}) {
  const scrollRef = useRef(null);
  const messageScrollContainerRef = useRef(null);
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
    tableIcon: false,
  });
  const [selectedAttachments, setSelectedAttachments] = useState([]);
  const [activeIconSend, setActiveIconSend] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [mentionState, setMentionState] = useState(() => closeMentionState());
  const [isPeerBlocked, setIsPeerBlocked] = useState(false);
  const [isPeerBlockStateLoading, setIsPeerBlockStateLoading] = useState(false);
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
  const [openMessageMenuPlacement, setOpenMessageMenuPlacement] = useState("down");
  const [pinningMessageId, setPinningMessageId] = useState(null);
  const [isPinnedListExpanded, setIsPinnedListExpanded] = useState(false);
  const [isContextMode, setIsContextMode] = useState(false);
  const [contextLatestMessageId, setContextLatestMessageId] = useState(null);
  const [newMessagesSinceContext, setNewMessagesSinceContext] = useState(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [summaryState, setSummaryState] = useState({
    open: false,
    content: "",
    loading: false
  });
  const [isPollComposerOpen, setIsPollComposerOpen] = useState(false);
  const [isPollSubmitting, setIsPollSubmitting] = useState(false);
  const [pollDraft, setPollDraft] = useState({
    question: "",
    options: ["", ""],
    allowMultiple: true,
    allowAddOption: true,
    anonymousVotes: false,
    hideResultsBeforeVote: false,
  });
  const [newPollOptionById, setNewPollOptionById] = useState({});
  const [contactCardByToken, setContactCardByToken] = useState({});
  const [linkPreviewByUrl, setLinkPreviewByUrl] = useState({});
  const [selectedContactProfile, setSelectedContactProfile] = useState(null);
  const [isSendingFriendRequest, setIsSendingFriendRequest] = useState(false);
  const forwardNoticeTimeoutRef = useRef(null);
  const messageActionMenuRefs = useRef(new Map());
  const { userData } = useContext(UserContext);
  const {
    conversations,
    archivedConversations,
    selectedConversationId,
    currentConversationNormalized,
    updateConversationById,
  } = useContext(ContactContext);
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
  const isConversationDisbanded = Boolean(activeConversation?.isDisbanded);
  const isPrivateConversation = activeConversation?.type === "private";

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
  const peerUserId = isPrivateConversation ? activeConversation?.peerUserId || null : null;
  const canManagePrivateBlock =
    isPrivateConversation &&
    backendConversationId !== "AI_ASSISTANT" &&
    Boolean(peerUserId);
  const isComposerBlocked = canManagePrivateBlock && isPeerBlocked;
  const isComposerInteractionLocked =
    isConversationDisbanded || isComposerBlocked || isPeerBlockStateLoading;
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
  const conversationBackgroundColor =
    activeConversation?.backgroundColor || "#f4f7fb";
  const conversationBackgroundImageUrl =
    activeConversation?.backgroundImageUrl || "";
  const conversationBackgroundStyle = conversationBackgroundImageUrl
    ? {
        backgroundImage: `url(${conversationBackgroundImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundColor: "transparent",
      }
    : {
        background: conversationBackgroundColor,
      };

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
  const shouldSuppressComposerBlockError =
    isComposerBlocked && actionError === PRIVATE_BLOCKED_COMPOSER_MESSAGE;

  const getComposerLockMessage = useCallback(() => {
    if (isPeerBlockStateLoading) {
      return BLOCK_STATE_LOADING_MESSAGE;
    }

    if (isComposerBlocked) {
      return PRIVATE_BLOCKED_COMPOSER_MESSAGE;
    }

    return "";
  }, [isComposerBlocked, isPeerBlockStateLoading]);

  const guardComposerInteraction = useCallback(() => {
    const lockMessage = getComposerLockMessage();
    if (!lockMessage) {
      return true;
    }

    setActionError(lockMessage);
    return false;
  }, [getComposerLockMessage]);
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
  const currentConversationMemberRole = useMemo(() => {
    if (!currentUserId) {
      return "MEMBER";
    }

    const currentMember = conversationMembers.find(
      (member) => String(member?.userId || "") === String(currentUserId)
    );

    return String(currentMember?.role || "MEMBER").toUpperCase();
  }, [conversationMembers, currentUserId]);
  const canManagePinnedMessages = useMemo(() => {
    if (activeConversation?.type !== "group") {
      return true;
    }

    return ["OWNER", "ADMIN"].includes(currentConversationMemberRole);
  }, [activeConversation?.type, currentConversationMemberRole]);
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
        return memberIdentity?.displayName || fallbackName || "Người dùng";
      }

      return fallbackName || "Người dùng";
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
            ? `Người dùng ${String(senderId).slice(0, 8)}`
            : "Người dùng"),
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
    setOpenMessageMenuPlacement("down");
  }, []);

  const resolveMessageMenuPlacement = useCallback(
    (anchorElement, dropdownHeight = 220) => {
      const containerElement = messageScrollContainerRef.current;
      if (!anchorElement || !containerElement) {
        return "down";
      }

      const containerRect = containerElement.getBoundingClientRect();
      const anchorRect = anchorElement.getBoundingClientRect();
      const requiredHeight = Math.max(Number(dropdownHeight) || 0, 160) + 12;
      const spaceBelow = containerRect.bottom - anchorRect.bottom;
      const spaceAbove = anchorRect.top - containerRect.top;

      if (spaceBelow >= requiredHeight) {
        return "down";
      }

      if (spaceAbove >= requiredHeight) {
        return "up";
      }

      return spaceAbove > spaceBelow ? "up" : "down";
    },
    []
  );

  const setMessageActionMenuRef = useCallback((messageId, node) => {
    const normalizedId = String(messageId || "");
    if (!normalizedId) {
      return;
    }

    if (node) {
      messageActionMenuRefs.current.set(normalizedId, node);
      return;
    }

    messageActionMenuRefs.current.delete(normalizedId);
  }, []);

  const handleToggleMessageMenu = useCallback((messageId, anchorElement) => {
    setOpenMessageMenuId((currentValue) =>
      String(currentValue) === String(messageId) ? null : messageId
    );
    if (String(openMessageMenuId) === String(messageId)) {
      setOpenMessageMenuPlacement("down");
      return;
    }

    setOpenMessageMenuPlacement(resolveMessageMenuPlacement(anchorElement));
  }, [openMessageMenuId, resolveMessageMenuPlacement]);


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
      setActionError("Tin nhắn này không thể chuyển tiếp.");
      return;
    }

    const targetConversation = availableForwardConversations.find(
      (conversation) => String(conversation.id) === String(forwardTargetConversationId)
    );

    if (!targetConversation) {
      setActionError("Vui lòng chọn cuộc trò chuyện để chuyển tiếp.");
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
        `Đã chuyển tiếp tới ${getConversationDisplayName(targetConversation)}.`
      );
    } catch (error) {
      console.error("[WEB FORWARD ERROR]", error);
      setActionError("Không thể chuyển tiếp tin nhắn này.");
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
      if (
        !backendConversationId ||
        backendConversationId === "AI_ASSISTANT" ||
        isConversationDisbanded
      ) {
        return;
      }

      if ((isComposerBlocked || isPeerBlockStateLoading) && isTyping) {
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
    [backendConversationId, isComposerBlocked, isConversationDisbanded, isPeerBlockStateLoading]
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

    if (!backendConversationId || isConversationDisbanded) {
      return;
    }

    if (isComposerBlocked || isPeerBlockStateLoading) {
      if (typingDebounceTimeoutRef.current) {
        clearTimeout(typingDebounceTimeoutRef.current);
      }

      if (typingIdleTimeoutRef.current) {
        clearTimeout(typingIdleTimeoutRef.current);
      }

      void pushTypingState(false);
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
  }, [
    activeConversation?.type,
    backendConversationId,
    isComposerBlocked,
    isConversationDisbanded,
    isPeerBlockStateLoading,
    pushTypingState,
  ]);

  const insertEmojiIntoComposer = useCallback(
    (emoji) => {
      if (!guardComposerInteraction()) {
        return;
      }

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
    [backendConversationId, guardComposerInteraction, restoreComposerSelection, syncComposerState]
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
  const scrollToBottom = useCallback((behavior = "smooth") => {
    const containerElement = messageScrollContainerRef.current;
    if (!containerElement) {
      return;
    }

    containerElement.scrollTo({
      top: containerElement.scrollHeight,
      behavior,
    });
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!isContextMode && isNearBottom) {
      scrollToBottom("auto");
    }
  }, [isContextMode, isNearBottom, messages, scrollToBottom]);

  useEffect(() => {
    const containerElement = messageScrollContainerRef.current;
    if (!containerElement) {
      return undefined;
    }

    const handleScroll = () => {
      const distanceToBottom =
        containerElement.scrollHeight - containerElement.scrollTop - containerElement.clientHeight;
      setIsNearBottom(distanceToBottom <= 80);
    };

    handleScroll();
    containerElement.addEventListener("scroll", handleScroll);
    return () => {
      containerElement.removeEventListener("scroll", handleScroll);
    };
  }, [backendConversationId, messages.length]);

  useEffect(() => {
    selectedAttachmentsRef.current = selectedAttachments;
  }, [selectedAttachments]);

  useEffect(() => {
    setActiveIconSend(
      !isComposerInteractionLocked && Boolean(draftText || selectedAttachments.length > 0)
    );
  }, [draftText, isComposerInteractionLocked, selectedAttachments.length]);

  useEffect(() => {
    let shouldIgnore = false;

    if (!canManagePrivateBlock) {
      setIsPeerBlocked(false);
      setIsPeerBlockStateLoading(false);
      return () => {
        shouldIgnore = true;
      };
    }

    setIsPeerBlockStateLoading(true);

    const loadBlockState = async () => {
      try {
        const nextBlockedState = await isUserBlockedByCurrentUser(peerUserId);
        if (!shouldIgnore) {
          setIsPeerBlocked(nextBlockedState);
        }
      } catch (error) {
        console.error("Failed to load web block state for composer:", error);
        if (!shouldIgnore) {
          setIsPeerBlocked(false);
        }
      } finally {
        if (!shouldIgnore) {
          setIsPeerBlockStateLoading(false);
        }
      }
    };

    void loadBlockState();

    return () => {
      shouldIgnore = true;
    };
  }, [canManagePrivateBlock, peerUserId]);

  useEffect(() => {
    if (!canManagePrivateBlock || typeof window === "undefined") {
      return undefined;
    }

    const handleBlockStatusChanged = (event) => {
      const detail = event?.detail || {};
      if (String(detail.blockedUserId || "") !== String(peerUserId || "")) {
        return;
      }

      setIsPeerBlocked(Boolean(detail.isBlocked));
      setIsPeerBlockStateLoading(false);
    };

    window.addEventListener(
      USER_BLOCK_STATUS_CHANGED_EVENT,
      handleBlockStatusChanged
    );

    return () => {
      window.removeEventListener(
        USER_BLOCK_STATUS_CHANGED_EVENT,
        handleBlockStatusChanged
      );
    };
  }, [canManagePrivateBlock, peerUserId]);

  useEffect(() => {
    if (!isComposerInteractionLocked) {
      return;
    }

    if (typingDebounceTimeoutRef.current) {
      clearTimeout(typingDebounceTimeoutRef.current);
    }

    if (typingIdleTimeoutRef.current) {
      clearTimeout(typingIdleTimeoutRef.current);
    }

    setMenuControl((prevState) =>
      prevState.tableIcon ? { ...prevState, tableIcon: false } : prevState
    );
    setMentionState(closeMentionState());
    composerSelectionRef.current = null;
    inputMessage.current?.blur();
    void pushTypingState(false);
  }, [isComposerInteractionLocked, pushTypingState]);

  useEffect(() => {
    if (isPeerBlockStateLoading || isComposerBlocked) {
      return;
    }

    if (
      actionError === PRIVATE_BLOCKED_COMPOSER_MESSAGE ||
      actionError === BLOCK_STATE_LOADING_MESSAGE
    ) {
      setActionError("");
    }
  }, [actionError, isComposerBlocked, isPeerBlockStateLoading]);

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
        setOpenMessageMenuPlacement("down");
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, []);

  useEffect(() => {
    if (!openMessageMenuId) {
      return undefined;
    }

    const updatePlacement = () => {
      const menuContainer = messageActionMenuRefs.current.get(
        String(openMessageMenuId)
      );
      if (!menuContainer) {
        return;
      }

      const triggerElement = menuContainer.querySelector(
        ".message-action-menu-trigger"
      );
      const dropdownElement = menuContainer.querySelector(
        ".message-actions-dropdown"
      );

      setOpenMessageMenuPlacement(
        resolveMessageMenuPlacement(
          triggerElement || menuContainer,
          dropdownElement?.offsetHeight || 220
        )
      );
    };

    const frameId = window.requestAnimationFrame(updatePlacement);
    window.addEventListener("resize", updatePlacement);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updatePlacement);
    };
  }, [openMessageMenuId, resolveMessageMenuPlacement]);


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
    setOpenMessageMenuPlacement("down");
    setMentionState(closeMentionState());
    setIsContextMode(false);
    setContextLatestMessageId(null);
    setNewMessagesSinceContext(0);
    setHighlightedMessageId(null);
    setIsNearBottom(true);
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
          size: 200,
        });
        const page = mapMessagePage(response, {
          conversationId: backendConversationId,
          currentUserId,
        });
        setMessages(page.items);
        setIsContextMode(false);
        setContextLatestMessageId(page.items.length ? page.items[page.items.length - 1].id : null);
        setNewMessagesSinceContext(0);
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

          if (event.type === "MESSAGE_CREATED") {
            const mappedMessage = mapMessage(event.payload);
            const messageId = mappedMessage?.id || event.payload?.id;
            const isAlreadyVisible = messagesRef.current.some(
              (message) => String(message?.id || "") === String(messageId || "")
            );

            if (isContextMode && !isAlreadyVisible) {
              setNewMessagesSinceContext((prevCount) => prevCount + 1);
              if (messageId) {
                setContextLatestMessageId(messageId);
              }
              return;
            }

            upsertMessage(mappedMessage);
            if (messageId) {
              setContextLatestMessageId(messageId);
            }
            return;
          }

          if (event.type === "MESSAGE_UPDATED") {
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
    isContextMode,
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

  const handleChangeMenuControl = (event) => {
    if (!guardComposerInteraction()) {
      return;
    }

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
    if (!guardComposerInteraction()) {
      return;
    }

    insertEmojiIntoComposer(value);
  };

  const handleImagePickerOpen = () => {
    if (!guardComposerInteraction()) {
      return;
    }

    imageInputRef.current?.click();
  };

  const handleFilePickerOpen = () => {
    if (!guardComposerInteraction()) {
      return;
    }

    fileInputRef.current?.click();
  };

  const handleAttachmentPick = (event) => {
    if (!guardComposerInteraction()) {
      event.target.value = "";
      return;
    }

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

  const sendSystemMessage = useCallback(
    async (kind, payload) => {
      if (!backendConversationId) {
        throw new Error("Conversation unavailable");
      }

      const response = await sendMessageV1({
        conversationId: backendConversationId,
        content: buildPollMessageContent(kind, payload),
      });
      const nextMessage = mapMessage(response);
      upsertMessage(nextMessage);
      updateConversationPreview({
        messageText:
          kind === "poll_create"
            ? `Đã tạo bình chọn: ${String(payload?.question || "").trim()}`
            : "Đã cập nhật bình chọn",
        attachments: [],
        updatedAt: nextMessage.editedAt || nextMessage.createdAt,
      });
      return nextMessage;
    },
    [backendConversationId, upsertMessage, updateConversationPreview]
  );

  const handleOpenPollComposer = () => {
    setActionError("");
    setIsPollComposerOpen(true);
  };

  const handleClosePollComposer = () => {
    if (isPollSubmitting) {
      return;
    }

    setIsPollComposerOpen(false);
    setPollDraft({
      question: "",
      options: ["", ""],
      allowMultiple: true,
      allowAddOption: true,
      anonymousVotes: false,
      hideResultsBeforeVote: false,
    });
  };

  const handlePollOptionChange = (index, value) => {
    setPollDraft((prevState) => ({
      ...prevState,
      options: prevState.options.map((option, optionIndex) =>
        optionIndex === index ? value : option
      ),
    }));
  };

  const handleCreatePoll = useCallback(async () => {
    if (!backendConversationId || !activeConversation?.id || isPollSubmitting) {
      return;
    }

    const question = pollDraft.question.trim();
    const options = pollDraft.options
      .map((option) => option.trim())
      .filter(Boolean);

    if (!question) {
      setActionError("Vui lòng nhập câu hỏi bình chọn.");
      return;
    }

    if (options.length < 2) {
      setActionError("Bình chọn cần ít nhất 2 phương án.");
      return;
    }

    const pollId = `poll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      pollId,
      question,
      options: options.map((text, index) => ({
        id: `${pollId}-opt-${index + 1}`,
        text,
      })),
      allowMultiple: Boolean(pollDraft.allowMultiple),
      allowAddOption: Boolean(pollDraft.allowAddOption),
      anonymousVotes: Boolean(pollDraft.anonymousVotes),
      hideResultsBeforeVote: Boolean(pollDraft.hideResultsBeforeVote),
      creatorId: currentUserId,
      createdAt: new Date().toISOString(),
    };

    try {
      setIsPollSubmitting(true);
      setActionError("");
      await sendSystemMessage("poll_create", payload);
      handleClosePollComposer();
    } catch (error) {
      console.error("Failed to create poll:", error);
      setActionError("Không thể tạo bình chọn lúc này.");
    } finally {
      setIsPollSubmitting(false);
    }
  }, [
    activeConversation?.id,
    backendConversationId,
    currentUserId,
    handleClosePollComposer,
    isPollSubmitting,
    pollDraft.allowAddOption,
    pollDraft.allowMultiple,
    pollDraft.anonymousVotes,
    pollDraft.hideResultsBeforeVote,
    pollDraft.options,
    pollDraft.question,
    sendSystemMessage,
  ]);

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

    if (!guardComposerInteraction()) {
      return;
    }
    const rawComposerText = flag ? "👍" : inputMessage.current?.textContent || "";
    const messageText = rawComposerText.trim();
    const containsEmoji = EMOJI_PATTERN.test(rawComposerText);

    if (!messageText && selectedAttachments.length === 0) {
      return;
    }

    setActionError("");
    pushTypingState(false);

    if (!backendConversationId) {
      setActionError("Không tìm thấy cuộc trò chuyện để gửi tin nhắn.");
      return;
    }

    if (isConversationDisbanded) {
      setActionError("Nhóm đã được giải tán.");
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
      const linkUrl = normalizeUrlForPreview(extractFirstUrlFromText(messageText));
      const uploadedAttachments = selectedAttachments.length
        ? await Promise.all(
            selectedAttachments.map((attachment) => uploadAttachmentV1(attachment.file))
          )
        : [];
      const isLinkTextMessage = Boolean(linkUrl && messageText && uploadedAttachments.length === 0);
      const sendPayload = {
        conversationId: backendConversationId,
        ...(messageText ? { content: messageText } : {}),
        ...(uploadedAttachments.length ? { attachments: uploadedAttachments } : {}),
        ...(replyingToMessage?.id ? { replyToMessageId: replyingToMessage.id } : {}),
      };

      if (isLinkTextMessage) {
        sendPayload.originalLinkUrl = linkUrl;
        sendPayload.messageType = "TEXT";
      }

      const response = await sendMessageV1(sendPayload);

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
          ? "Không thể gửi tin nhắn trả lời."
          : selectedAttachments.length > 0
          ? "Không thể gửi tệp đính kèm."
          : "Không thể gửi tin nhắn."
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
    if ((event.key === "Enter" || event.key === "Escape") && !guardComposerInteraction()) {
      event.preventDefault();
      return;
    }

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
      setActionError("Không thể chỉnh sửa tin nhắn.");
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
      setActionError("Không thể thu hồi tin nhắn.");
    }
  };

  const handleHideMessage = async (messageId) => {
    try {
      await hideMessageV1(messageId);
      removeMessageById(messageId);
    } catch (error) {
      console.error("Failed to hide message:", error);
      setActionError("Không thể ẩn tin nhắn này.");
    }
  };

  const handleTogglePinMessage = useCallback(
    async (message) => {
      if (!message?.id || !canManagePinnedMessages) {
        return;
      }

      const nextPinned = !message?.pinnedAt;
      setPinningMessageId(String(message.id));

      try {
        const response = await pinMessageV1(message.id, { pinned: nextPinned });
        upsertMessage(mapMessage(response));
        handleCloseMessageMenu();
      } catch (error) {
        console.error("Failed to update pin state:", error);
        setActionError(nextPinned ? "Không thể ghim tin nhắn." : "Không thể bỏ ghim tin nhắn.");
      } finally {
        setPinningMessageId(null);
      }
    },
    [canManagePinnedMessages, handleCloseMessageMenu, upsertMessage]
  );

  const handleRemoveMessageForMe = async (messageId) => {
    try {
      await removeMessageForMeV1(messageId);
      removeMessageById(messageId);
    } catch (error) {
      console.error("Failed to remove message for current user:", error);
      setActionError("Không thể xóa tin nhắn trên máy này.");
    }
  };

  const handleReactionClick = async (message) => {
    if (isConversationDisbanded) {
      setActionError("Nhóm đã được giải tán.");
      return;
    }

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
      setActionError("Không thể cập nhật cảm xúc.");
    }
  };

  const handleQuickReaction = async (message, reactionType) => {
    if (isConversationDisbanded) {
      setActionError("Nhóm đã được giải tán.");
      return;
    }

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
      setActionError("Không thể cập nhật cảm xúc.");
    }
  };

  const handleJoinGroupCallFromLog = useCallback(
    (callLog) => {
      if (!callLog?.groupCallId) {
        return;
      }

      window.dispatchEvent(
        new CustomEvent("group-call-join-request", {
          detail: {
            ...callLog,
            conversationId: backendConversationId,
            callType: callLog.callType || callLog.raw?.type || "VOICE",
          },
        })
      );
    },
    [backendConversationId]
  );

  const renderCallLogMessage = useCallback(
    (item, index) => {
      const callLog = item.callLog || null;
      if (!callLog) {
        return null;
      }

      const isVideo = String(callLog.callType || "VOICE").toUpperCase() === "VIDEO";
      const callDuration = formatCallDuration(callLog.durationSeconds);
      const fallbackName =
        callLog.initiatorName ||
        item.senderDisplayName ||
        getConversationDisplayName(activeConversation);

      console.log("[CALL LOG RENDER]", {
        source: "web",
        messageId: item.id || null,
        conversationId: backendConversationId,
        callType: callLog.callType,
        callStatus: callLog.callStatus,
        durationSeconds: callLog.durationSeconds,
        callerId: callLog.callerId,
      });

      return (
        <li key={item.id || index}>
          <div className={`wrap-text-mess flex ${item.senderId === currentUserId ? "my-mess" : "you-mess"}`}>
            {item.senderId !== currentUserId && (
              <img
                src={item.senderAvatarUrl || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}
                alt={fallbackName}
                style={{ width: 40, height: 40, borderRadius: "50%", marginRight: 10 }}
              />
            )}
            <div className="detail-mess call-log-bubble">
              {item.senderId !== currentUserId && activeConversation?.type === "group" && (
                <p className="name-mess">{fallbackName}</p>
              )}
              <div className="call-log-header">
                <span className="call-log-icon">{isVideo ? "📹" : "📞"}</span>
                <p className="call-log-title">{resolveCallLogTitle(callLog)}</p>
              </div>
              <p className="call-log-subtitle">
                {resolveCallLogSubtitle(callLog, currentUserId, fallbackName)}
              </p>
              {callDuration ? <p className="call-log-duration">⏱ {callDuration}</p> : null}
              {callLog.groupCallId && activeConversation?.type === "group" ? (
                <button
                  className="message-action-btn primary call-log-action"
                  type="button"
                  onClick={() => handleJoinGroupCallFromLog(callLog)}
                  style={{ marginTop: '8px', width: '100%', borderRadius: '8px' }}
                >
                  Tham gia cuộc gọi
                </button>
              ) : null}
            </div>
          </div>
        </li>
      );
    },
    [activeConversation, backendConversationId, currentUserId, handleJoinGroupCallFromLog]
  );

  const normalizedMessages = useMemo(() => normalizeMessageList(messages), [messages]);
  const pollStateById = useMemo(() => {
    const nextPollStateById = new Map();

    normalizedMessages.forEach((message) => {
      const systemMessage = parseSystemMessage(message?.content);
      if (!systemMessage?.kind || !systemMessage.payload) {
        return;
      }

      if (systemMessage.kind === "poll_create") {
        const payload = systemMessage.payload;
        const pollId = String(payload.pollId || "");
        if (!pollId) {
          return;
        }

        nextPollStateById.set(pollId, {
          pollId,
          createMessageId: message?.id || null,
          question: String(payload.question || "").trim(),
          options: Array.isArray(payload.options)
            ? payload.options
                .map((option) => ({
                  id: String(option?.id || ""),
                  text: String(option?.text || "").trim(),
                }))
                .filter((option) => option.id && option.text)
            : [],
          settings: {
            allowMultiple: Boolean(payload.allowMultiple),
            allowAddOption: Boolean(payload.allowAddOption),
            anonymousVotes: Boolean(payload.anonymousVotes),
            hideResultsBeforeVote: Boolean(payload.hideResultsBeforeVote),
          },
          votesByUserId: {},
        });
      }

      if (systemMessage.kind === "poll_vote") {
        const payload = systemMessage.payload;
        const pollId = String(payload.pollId || "");
        const voterId = String(payload.voterId || "");
        const selectedOptionIds = Array.isArray(payload.selectedOptionIds)
          ? payload.selectedOptionIds.map((value) => String(value || "")).filter(Boolean)
          : [];
        const existingPoll = nextPollStateById.get(pollId);
        if (!existingPoll || !voterId) {
          return;
        }

        existingPoll.votesByUserId = {
          ...existingPoll.votesByUserId,
          [voterId]: selectedOptionIds,
        };
      }

      if (systemMessage.kind === "poll_add_option") {
        const payload = systemMessage.payload;
        const pollId = String(payload.pollId || "");
        const optionId = String(payload.optionId || "");
        const optionText = String(payload.optionText || "").trim();
        const existingPoll = nextPollStateById.get(pollId);
        if (!existingPoll || !optionId || !optionText) {
          return;
        }

        if (!existingPoll.options.some((option) => option.id === optionId)) {
          existingPoll.options = [
            ...existingPoll.options,
            { id: optionId, text: optionText },
          ];
        }
      }
    });

    return nextPollStateById;
  }, [normalizedMessages]);
  const displayMessages = useMemo(
    () =>
      normalizedMessages.filter((message) => {
        const systemMessage = parseSystemMessage(message?.content);
        return !systemMessage || systemMessage.kind === "poll_create";
      }),
    [normalizedMessages]
  );
  const pollStateByCreateMessageId = useMemo(() => {
    const nextMap = new Map();
    pollStateById.forEach((pollState) => {
      if (pollState?.createMessageId) {
        nextMap.set(String(pollState.createMessageId), pollState);
      }
    });
    return nextMap;
  }, [pollStateById]);

  const handleVotePoll = useCallback(
    async (pollId, optionId) => {
      const pollState = pollStateById.get(String(pollId));
      if (!pollState || !currentUserId || !optionId || isSending) {
        return;
      }

      const currentSelection = Array.isArray(pollState.votesByUserId?.[String(currentUserId)])
        ? pollState.votesByUserId[String(currentUserId)]
        : [];
      const hasSelected = currentSelection.includes(optionId);
      const nextSelection = pollState.settings.allowMultiple
        ? hasSelected
          ? currentSelection.filter((id) => id !== optionId)
          : [...currentSelection, optionId]
        : hasSelected
        ? []
        : [optionId];

      try {
        await sendSystemMessage("poll_vote", {
          pollId,
          voterId: currentUserId,
          selectedOptionIds: nextSelection,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to vote poll:", error);
        setActionError("Không thể gửi phiếu bầu.");
      }
    },
    [currentUserId, isSending, pollStateById, sendSystemMessage]
  );

  const handleAddPollOption = useCallback(
    async (pollId) => {
      const pollState = pollStateById.get(String(pollId));
      const optionText = String(newPollOptionById[pollId] || "").trim();
      if (!pollState || !pollState.settings.allowAddOption || !optionText) {
        return;
      }

      const optionId = `${pollId}-ext-${Date.now()}`;
      try {
        await sendSystemMessage("poll_add_option", {
          pollId,
          optionId,
          optionText,
          actorUserId: currentUserId,
          createdAt: new Date().toISOString(),
        });
        setNewPollOptionById((prevState) => ({
          ...prevState,
          [pollId]: "",
        }));
      } catch (error) {
        console.error("Failed to add poll option:", error);
        setActionError("Không thể thêm phương án bình chọn.");
      }
    },
    [currentUserId, newPollOptionById, pollStateById, sendSystemMessage]
  );

  const handleSendFriendRequestFromCard = useCallback(
    async (token, card) => {
      const targetUserId = card?.userId;
      if (!targetUserId || isSendingFriendRequest) {
        return;
      }

      try {
        setIsSendingFriendRequest(true);
        await sendFriendRequestV2({ receiverId: targetUserId });
        setContactCardByToken((prevState) => {
          if (token) {
            return {
              ...prevState,
              [token]: {
                ...(prevState[token] || card),
                relationshipStatus: "REQUEST_SENT",
              },
            };
          }

          const nextState = { ...prevState };
          Object.keys(nextState).forEach((entryToken) => {
            const entry = nextState[entryToken];
            if (String(entry?.userId || "") === String(targetUserId)) {
              nextState[entryToken] = {
                ...entry,
                relationshipStatus: "REQUEST_SENT",
              };
            }
          });
          return nextState;
        });
        setSelectedContactProfile((prevState) =>
          prevState && String(prevState.userId) === String(targetUserId)
            ? { ...prevState, relationshipStatus: "REQUEST_SENT" }
            : prevState
        );
      } catch (error) {
        console.error("Failed to send friend request from message card:", error);
        setActionError("Không thể gửi lời mời kết bạn.");
      } finally {
        setIsSendingFriendRequest(false);
      }
    },
    [isSendingFriendRequest]
  );

  useEffect(() => {
    const tokens = new Set();
    displayMessages.forEach((message) => {
      const systemMessage = parseSystemMessage(message?.content);
      if (systemMessage) {
        return;
      }
      const token = extractIdentifierToken(message?.content);
      if (token) {
        tokens.add(token);
      }
    });

    const unresolvedTokens = Array.from(tokens).filter(
      (token) => contactCardByToken[token] === undefined
    );
    if (!unresolvedTokens.length) {
      return;
    }

    let isUnmounted = false;
    unresolvedTokens.forEach((token) => {
      searchUsersV2({ keyword: token })
        .then((response) => {
          if (isUnmounted) {
            return;
          }

          const users = Array.isArray(response?.data) ? response.data : [];
          const normalizedToken = normalizeIdentifierToken(token);
          const normalizedPhone = normalizePhoneToken(token);
          const matchedUser =
            users.find((user) => {
              const userEmail = normalizeIdentifierToken(user?.email);
              const userPhone = normalizePhoneToken(user?.phone);
              return (
                (userEmail && userEmail === normalizedToken) ||
                (userPhone && userPhone === normalizedPhone)
              );
            }) ||
            users.find(
              (user) =>
                String(user?.userId || user?.id || user?._id || "") !==
                String(currentUserId || "")
            ) ||
            users[0] ||
            null;
          setContactCardByToken((prevState) => ({
            ...prevState,
            [token]: matchedUser
              ? {
                  userId: matchedUser.userId || matchedUser.id || matchedUser._id || null,
                  displayName:
                    matchedUser.displayName ||
                    matchedUser.username ||
                    matchedUser.phone ||
                    "Người dùng",
                  username: matchedUser.username || "",
                  phone: matchedUser.phone || "",
                  email: matchedUser.email || "",
                  avatarUrl: matchedUser.avatarUrl || matchedUser.avatar || "",
                  relationshipStatus: matchedUser.relationshipStatus || "NONE",
                }
              : null,
          }));
        })
        .catch(() => {
          if (isUnmounted) {
            return;
          }
          setContactCardByToken((prevState) => ({
            ...prevState,
            [token]: null,
          }));
        });
    });

    return () => {
      isUnmounted = true;
    };
  }, [contactCardByToken, currentUserId, displayMessages]);

  useEffect(() => {
    const urls = new Set();
    displayMessages.forEach((message) => {
      const systemMessage = parseSystemMessage(message?.content);
      if (systemMessage) {
        return;
      }
      const normalizedUrl = resolveMessageLinkUrl(message, linkPreviewByUrl);
      if (normalizedUrl) {
        urls.add(normalizedUrl);
      }
    });

    const unresolvedUrls = Array.from(urls).filter(
      (url) => linkPreviewByUrl[url] === undefined
    );
    if (!unresolvedUrls.length) {
      return;
    }

    let isUnmounted = false;
    unresolvedUrls.forEach((targetUrl) => {
      fetch(`https://jsonlink.io/api/extract?url=${encodeURIComponent(targetUrl)}`)
        .then((response) => response.json())
        .then((payload) => {
          if (isUnmounted) {
            return;
          }

          setLinkPreviewByUrl((prevState) => ({
            ...prevState,
            [targetUrl]: {
              title: payload?.title || "",
              description: payload?.description || "",
              image: payload?.images?.[0] || payload?.image || "",
              url: payload?.url || targetUrl,
              host: (() => {
                try {
                  return new URL(targetUrl).hostname;
                } catch {
                  return targetUrl;
                }
              })(),
            },
          }));
        })
        .catch(() => {
          if (isUnmounted) {
            return;
          }
          setLinkPreviewByUrl((prevState) => ({
            ...prevState,
            [targetUrl]: null,
          }));
        });
    });

    return () => {
      isUnmounted = true;
    };
  }, [displayMessages, linkPreviewByUrl]);
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
  const pinnedMessages = useMemo(
    () =>
      normalizedMessages
        .filter((message) => Boolean(message?.pinnedAt) && !message?.deletedAt)
        .sort(
          (leftMessage, rightMessage) =>
            new Date(rightMessage.pinnedAt || 0).getTime() -
            new Date(leftMessage.pinnedAt || 0).getTime()
        ),
    [normalizedMessages]
  );
  const newestPinnedMessage = pinnedMessages[0] || null;
  const extraPinnedCount = Math.max(0, pinnedMessages.length - 1);
  const resolvePinnedMessagePreview = useCallback((message) => {
    if (!message) {
      return "Tin nhắn";
    }

    if (message.content) {
      return truncateText(message.content, 120);
    }

    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    return createAttachmentPreviewText("", attachments) || "Tin nhắn";
  }, []);
  const scrollMessageIntoView = useCallback((messageId, options = {}) => {
    if (!messageId) {
      return false;
    }

    const containerElement = messageScrollContainerRef.current;
    const targetElement = document.getElementById(`message-row-${messageId}`);
    if (!containerElement || !targetElement) {
      return false;
    }

    const containerRect = containerElement.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const targetTopInContainer =
      targetRect.top - containerRect.top + containerElement.scrollTop;
    const offsetTop = options.offsetTop ?? 16;
    const nextScrollTop = Math.max(targetTopInContainer - offsetTop, 0);

    containerElement.scrollTo({
      behavior: options.behavior || "smooth",
      top: nextScrollTop,
    });
    return true;
  }, []);
  const flashMessageHighlight = useCallback((messageId) => {
    if (!messageId) {
      return;
    }

    setHighlightedMessageId(String(messageId));
    window.setTimeout(() => {
      setHighlightedMessageId((prevState) =>
        String(prevState || "") === String(messageId) ? null : prevState
      );
    }, 1600);
  }, []);
  const loadMessageContextAndJump = useCallback(
    async (messageId) => {
      if (!backendConversationId || !messageId) {
        return false;
      }

      setIsLoadingContext(true);
      setActionError("");

      try {
        const contextResponse = await getMessageContextV1(backendConversationId, {
          messageId,
          range: 50,
        });
        const contextItems = Array.isArray(contextResponse?.items)
          ? contextResponse.items.map(mapMessage)
          : [];
        setMessages(contextItems);
        setIsContextMode(true);
        setContextLatestMessageId(contextResponse?.latestMessageId || null);
        setNewMessagesSinceContext(0);

        const anchorMessageId = contextResponse?.anchorMessageId || messageId;
        window.setTimeout(() => {
          const found = scrollMessageIntoView(anchorMessageId, { behavior: "auto", offsetTop: 24 });
          if (found) {
            flashMessageHighlight(anchorMessageId);
          }
        }, 0);
        return true;
      } catch (error) {
        console.error("Failed to load message context:", error);
        setActionError("Không thể tải ngữ cảnh tin nhắn đã ghim.");
        return false;
      } finally {
        setIsLoadingContext(false);
      }
    },
    [backendConversationId, flashMessageHighlight, scrollMessageIntoView]
  );
  const handleJumpToMessage = useCallback(
    async (messageId) => {
      const found = scrollMessageIntoView(messageId, { behavior: "smooth", offsetTop: 24 });
      if (found) {
        flashMessageHighlight(messageId);
        return;
      }

      await loadMessageContextAndJump(messageId);
    },
    [flashMessageHighlight, loadMessageContextAndJump, scrollMessageIntoView]
  );
  const handleBackToLatest = useCallback(async () => {
    if (!backendConversationId || backendConversationId === "AI_ASSISTANT") {
      return;
    }

    if (!isContextMode) {
      scrollToBottom("smooth");
      return;
    }

    setIsLoadingContext(true);
    setActionError("");
    try {
      const response = await getConversationMessages(backendConversationId, {
        size: 50,
      });
      const page = mapMessagePage(response, {
        conversationId: backendConversationId,
        currentUserId,
      });
      setMessages(page.items);
      setIsContextMode(false);
      setContextLatestMessageId(page.items.length ? page.items[page.items.length - 1].id : null);
      setNewMessagesSinceContext(0);
      window.setTimeout(() => scrollToBottom("auto"), 0);
    } catch (error) {
      console.error("Failed to load latest messages:", error);
      setActionError("Không thể quay lại tin nhắn hiện tại.");
    } finally {
      setIsLoadingContext(false);
    }
  }, [backendConversationId, currentUserId, isContextMode, scrollToBottom]);
  const showReturnToLatestButton = isContextMode || !isNearBottom;
  useEffect(() => {
    if (!isContextMode && newMessagesSinceContext > 0) {
      setNewMessagesSinceContext(0);
    }
  }, [isContextMode, newMessagesSinceContext]);
  useEffect(() => {
    if (!isContextMode || !contextLatestMessageId) {
      return;
    }

    const hasLatestInCurrentList = normalizedMessages.some(
      (message) => String(message?.id || "") === String(contextLatestMessageId)
    );
    if (!hasLatestInCurrentList) {
      return;
    }

    setIsContextMode(false);
    setNewMessagesSinceContext(0);
  }, [contextLatestMessageId, isContextMode, normalizedMessages]);
  useEffect(() => {
    if (!pinnedMessages.length) {
      setIsPinnedListExpanded(false);
    }
  }, [pinnedMessages.length]);
  const pinnedPanelNode =
    pinnedMessages.length > 0 ? (
      <div className="pinned-panel" onClick={(event) => event.stopPropagation()}>
        <div className="pinned-panel-head">
          <p className="pinned-panel-title">
            {isPinnedListExpanded
              ? `Danh sách ghim (${pinnedMessages.length})`
              : "Tin nhắn"}
          </p>
          <div className="pinned-panel-actions">
            {extraPinnedCount > 0 && !isPinnedListExpanded ? (
              <button
                type="button"
                className="pinned-panel-toggle"
                onClick={() => setIsPinnedListExpanded(true)}
              >
                +{extraPinnedCount} ghim
              </button>
            ) : null}
            {isPinnedListExpanded ? (
              <button
                type="button"
                className="pinned-panel-toggle"
                onClick={() => setIsPinnedListExpanded(false)}
              >
                Thu gọn
              </button>
            ) : null}
          </div>
        </div>
        {isPinnedListExpanded ? (
          <div className="pinned-panel-list">
            {pinnedMessages.map((message) => {
              const senderIdentity = resolveMessageSenderIdentity(message);
              const messagePreview = resolvePinnedMessagePreview(message);

              return (
                <button
                  key={`pinned-${message.id}`}
                  type="button"
                  className="pinned-panel-item"
                  onClick={() => handleJumpToMessage(message.id)}
                >
                  <span className="pinned-panel-item-label">Tin nhắn</span>
                  <span className="pinned-panel-item-preview">
                    {senderIdentity.displayName}: {messagePreview}
                  </span>
                </button>
              );
            })}
          </div>
        ) : newestPinnedMessage ? (
          <button
            type="button"
            className="pinned-panel-item pinned-panel-item-single"
            onClick={() => handleJumpToMessage(newestPinnedMessage.id)}
          >
            <span className="pinned-panel-item-label">Tin nhắn</span>
            <span className="pinned-panel-item-preview">
              {resolveMessageSenderIdentity(newestPinnedMessage).displayName}:{" "}
              {resolvePinnedMessagePreview(newestPinnedMessage)}
            </span>
          </button>
        ) : null}
      </div>
    ) : null;
  const statusHint = typingStatusText
    ? typingStatusText
    : activeConversation?.lastActive && activeConversation.lastActive !== "Active"
    ? activeConversation.lastActive
    : "Đang hoạt động";
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
  const InfoPanelToggleIcon = isInfoPanelVisible
    ? RiSidebarFoldLine
    : RiSidebarUnfoldLine;
  const infoPanelToggleLabel = isInfoPanelVisible
    ? "Ẩn thông tin hội thoại"
    : "Hiện thông tin hội thoại";

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
          {typeof onToggleInfoPanel === "function" ? (
            <button
              type="button"
              className={`message-info-toggle ${
                isInfoPanelVisible ? "active" : ""
              }`}
              onClick={onToggleInfoPanel}
              title={infoPanelToggleLabel}
              aria-label={infoPanelToggleLabel}
              aria-pressed={isInfoPanelVisible}
            >
              <InfoPanelToggleIcon />
            </button>
          ) : null}
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
      <div
        className="infor-container"
        style={conversationBackgroundStyle}
        ref={messageScrollContainerRef}
      >
        <div>
          {pinnedPanelNode}
          <ul>
            {(backendConversationId === "AI_ASSISTANT" ? aiMessages : displayMessages).map((item, index) => {
              const isMine = item.senderId === currentUserId;
              const isAi = item.senderId === 'AI';

              if (item.isCallLog && !Boolean(item.deletedAt)) {
                const callLogNode = renderCallLogMessage(item, index);
                if (callLogNode) {
                  return callLogNode;
                }
              }

              const isDeleted = Boolean(item.deletedAt);
              const systemMessage = parseSystemMessage(item?.content);
              const pollState = item?.id
                ? pollStateByCreateMessageId.get(String(item.id)) || null
                : null;
              const visibleAttachments = isDeleted
                ? []
                : Array.isArray(item.attachments)
                ? item.attachments
                : [];
              const imageAttachments = visibleAttachments.filter(isImageAttachment);
              const videoAttachments = visibleAttachments.filter(isVideoAttachment);
              const fileAttachments = visibleAttachments.filter(
                (attachment) =>
                  !isImageAttachment(attachment) && !isVideoAttachment(attachment)
              );
              const canEdit =
                isMine && !isDeleted && !visibleAttachments.length && Boolean(item.content);
              const canDelete = isMine && !isDeleted;
              const canReply = Boolean(item.id) && !isDeleted;
              const isPinned = Boolean(item.pinnedAt);
              const canTogglePin = Boolean(item.id) && !isDeleted && canManagePinnedMessages;
              const isPinningThisMessage =
                String(pinningMessageId || "") === String(item.id || "");
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
                      "Người dùng";

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
                ? truncateText(item.replyTo.contentPreview || "Tin nhắn", 90)
                : "";
              const displayText = isDeleted
                ? RECALLED_MESSAGE_PLACEHOLDER
                : systemMessage?.kind === "poll_create"
                ? ""
                : item.content;
              const contactToken =
                !isDeleted && !systemMessage ? extractIdentifierToken(item?.content) : "";
              const contactCard = contactToken ? contactCardByToken[contactToken] : null;
              const messageLinkUrl =
                !isDeleted && !systemMessage
                  ? resolveMessageLinkUrl(item, linkPreviewByUrl)
                  : "";
              const messageLinkPreview = messageLinkUrl
                ? linkPreviewByUrl[messageLinkUrl]
                : null;
              const hasLinkInDisplayText = Boolean(extractFirstUrlFromText(displayText));
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
                  ref={index === displayMessages.length - 1 ? scrollRef : null}
                  key={item.id || `${item.createdAt}-${index}`}
                  id={item.id ? `message-row-${item.id}` : undefined}
                  className={`wrap-text-mess ${isMine ? "my-mess" : ""} ${
                    String(highlightedMessageId || "") === String(item.id || "")
                      ? "message-row-highlighted"
                      : ""
                  } ${
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
                            Hủy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {item.forwarded && !isDeleted ? (
                          <div className="message-forwarded-preview">
                            <p className="message-forwarded-label">Chuyển tiếp</p>
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
                              {replyPreviewSenderName || "Tin nhắn duoc tra loi"}
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
                        {videoAttachments.length > 0 && (
                          <div className="message-video-list">
                            {videoAttachments.map((attachment) => (
                              <video
                                className="message-video-player"
                                key={attachment.id || attachment.url}
                                controls
                                preload="metadata"
                              >
                                <source
                                  src={attachment.url}
                                  type={attachment.contentType || "video/mp4"}
                                />
                              </video>
                            ))}
                          </div>
                        )}
                        {fileAttachments.length > 0 && (
                          <div className="message-attachment-list">
                            {fileAttachments.map((attachment) => {
                              const fileMeta = resolveAttachmentTypeMeta(attachment);
                              return (
                                <a
                                  className="message-file-link"
                                  key={attachment.id || attachment.url}
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <span className={`message-file-type-badge badge-${fileMeta.label.toLowerCase()}`}>
                                    {fileMeta.icon} {fileMeta.label}
                                  </span>
                                  <span className="message-file-name">
                                    {attachment.fileName || "Tệp đính kèm"}
                                  </span>
                                </a>
                              );
                            })}
                          </div>
                        )}
                        {displayText ? (
                          <p
                            className={`text-mess ${
                              isDeleted ? "message-text-deleted" : ""
                            }`}
                          >
                            {!isDeleted && messageLinkUrl && !hasLinkInDisplayText ? (
                              <a
                                href={messageLinkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="message-inline-link message-inline-link-title"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {renderedDisplayText}
                              </a>
                            ) : (
                              renderedDisplayText
                            )}
                          </p>
                        ) : null}
                        {!isDeleted && messageLinkUrl ? (
                          <div className="message-link-preview-card">
                            {messageLinkPreview?.image ? (
                              <a
                                href={messageLinkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="message-link-preview-image-link"
                              >
                                <img
                                  className="message-link-preview-image"
                                  src={messageLinkPreview.image}
                                  alt={messageLinkPreview.title || "Link preview"}
                                />
                              </a>
                            ) : null}
                            <div className="message-link-preview-meta">
                              <a
                                className="message-link-preview-title message-link-preview-title-link"
                                href={messageLinkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {messageLinkPreview?.title || messageLinkUrl}
                              </a>
                              <p className="message-link-preview-desc">
                                {messageLinkPreview?.description ||
                                  messageLinkPreview?.host ||
                                  messageLinkUrl}
                              </p>
                              <a
                                className="message-link-preview-open"
                                href={messageLinkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Mở liên kết
                              </a>
                              <a
                                className="message-link-preview-raw"
                                href={messageLinkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {messageLinkUrl}
                              </a>
                            </div>
                          </div>
                        ) : null}
                        {!isDeleted && pollState ? (
                          <div className="poll-card">
                            <p className="poll-card-title">{pollState.question || "Bình chọn"}</p>
                            {pollState.options.map((option) => {
                              const votesByUserId = pollState.votesByUserId || {};
                              const totalVotes = Object.values(votesByUserId).reduce(
                                (total, selections) =>
                                  total + (Array.isArray(selections) ? selections.length : 0),
                                0
                              );
                              const optionVoteCount = Object.values(votesByUserId).reduce(
                                (total, selections) =>
                                  total +
                                  (Array.isArray(selections) &&
                                  selections.includes(option.id)
                                    ? 1
                                    : 0),
                                0
                              );
                              const votedOptions = Array.isArray(
                                votesByUserId[String(currentUserId)]
                              )
                                ? votesByUserId[String(currentUserId)]
                                : [];
                              const hasVotedThisOption = votedOptions.includes(option.id);
                              const hasVoted = votedOptions.length > 0;
                              const canRevealResult =
                                !pollState.settings.hideResultsBeforeVote || hasVoted;
                              const ratio =
                                totalVotes > 0
                                  ? Math.round((optionVoteCount / totalVotes) * 100)
                                  : 0;

                              return (
                                <button
                                  type="button"
                                  className={`poll-option-btn ${
                                    hasVotedThisOption ? "selected" : ""
                                  }`}
                                  key={option.id}
                                  onClick={() => handleVotePoll(pollState.pollId, option.id)}
                                >
                                  <span>{option.text}</span>
                                  {canRevealResult ? (
                                    <span className="poll-option-count">
                                      {optionVoteCount} ({ratio}%)
                                    </span>
                                  ) : (
                                    <span className="poll-option-count">Ẩn kết quả</span>
                                  )}
                                </button>
                              );
                            })}
                            {pollState.settings.allowAddOption ? (
                              <div className="poll-add-option-row">
                                <input
                                  type="text"
                                  value={newPollOptionById[pollState.pollId] || ""}
                                  placeholder="Thêm phương án"
                                  onChange={(event) =>
                                    setNewPollOptionById((prevState) => ({
                                      ...prevState,
                                      [pollState.pollId]: event.target.value,
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddPollOption(pollState.pollId)}
                                >
                                  Thêm
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {!isDeleted && contactToken && contactCard ? (
                          <div
                            className="message-contact-card"
                            onClick={() => setSelectedContactProfile(contactCard)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedContactProfile(contactCard);
                              }
                            }}
                          >
                            {contactCard.avatarUrl ? (
                              <img src={contactCard.avatarUrl} alt={contactCard.displayName} />
                            ) : (
                              <div className="message-contact-avatar-placeholder" />
                            )}
                            <div className="message-contact-meta">
                              <p>{contactCard.displayName}</p>
                              <span>{contactCard.username || contactCard.phone || contactToken}</span>
                            </div>
                            {String(contactCard.userId || "") !== String(currentUserId || "") ? (
                              <button
                                type="button"
                                className={`message-contact-action ${
                                  String(contactCard.relationshipStatus || "").toUpperCase() === "NONE"
                                    ? "primary"
                                    : "muted"
                                }`}
                                disabled={
                                  isSendingFriendRequest ||
                                  String(contactCard.relationshipStatus || "").toUpperCase() !==
                                    "NONE"
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleSendFriendRequestFromCard(contactToken, contactCard);
                                }}
                              >
                                {isSendingFriendRequest &&
                                String(contactCard.relationshipStatus || "").toUpperCase() ===
                                  "NONE"
                                  ? "Đang gửi..."
                                  : resolveFriendStatusLabel(contactCard.relationshipStatus)}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {item.editedAt && !isDeleted ? (
                          <p className="message-state-chip">Đã chỉnh sửa</p>
                        ) : null}
                        {isPinned && !isDeleted ? (
                          <p className="message-state-chip">Đã ghim</p>
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
                          aria-label={item.myReaction === "LIKE" ? "Bỏ thích" : "Thích"}
                          title={item.myReaction === "LIKE" ? "Bỏ thích" : "Thích"}
                          onClick={() => handleReactionClick(item)}
                        >
                          {item.myReaction === "LIKE" ? (
                            <AiFillLike style={{ fontSize: "16px", color: "var(--ui-primary)" }} />
                          ) : (
                            <AiOutlineLike style={{ fontSize: "16px" }} />
                          )}
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
                            aria-label="Trả lời"
                            title="Trả lời"
                            onClick={() => handleReplyToMessage(item)}
                          >
                            <IoArrowUndoOutline style={{ fontSize: "16px" }} />
                          </button>
                        ) : null}

                        <div
                          className="message-actions-menu"
                          data-open={String(openMessageMenuId) === String(item.id)}
                          ref={(node) => setMessageActionMenuRef(item.id, node)}
                        >
                          <button
                            className="message-action-menu-trigger"
                            type="button"
                            aria-label="Mở tác vụ tin nhắn"
                            aria-expanded={String(openMessageMenuId) === String(item.id)}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleToggleMessageMenu(item.id, event.currentTarget);
                            }}
                          >
                            <IoMdMore />
                          </button>

                          {String(openMessageMenuId) === String(item.id) ? (
                            <div
                              className={`message-actions-dropdown ${
                                openMessageMenuPlacement === "up"
                                  ? "message-actions-dropdown-up"
                                  : ""
                              }`}
                            >
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
                                Chuyển tiếp
                              </button>
                              {canTogglePin ? (
                                <button
                                  className="message-action-menu-item"
                                  type="button"
                                  disabled={isPinningThisMessage}
                                  onClick={() => {
                                    handleCloseMessageMenu();
                                    handleTogglePinMessage(item);
                                  }}
                                >
                                  {isPinningThisMessage
                                    ? "Đang xử lý..."
                                    : isPinned
                                    ? "Bỏ ghim"
                                    : "Ghim"}
                                </button>
                              ) : null}

                              {canEdit ? (
                                <button
                                  className="message-action-menu-item"
                                  type="button"
                                  onClick={() => {
                                    handleCloseMessageMenu();
                                    handleStartEditing(item);
                                  }}
                                >
                                  Sửa
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
                                  Thu hồi
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
                                Ẩn
                              </button>

                              <button
                                className="message-action-menu-item"
                                type="button"
                                onClick={() => {
                                  handleCloseMessageMenu();
                                  handleRemoveMessageForMe(item.id);
                                }}
                              >
                                Xóa phía tôi
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                    {!isDeleted && Array.isArray(item.reactions) && item.reactions.length > 0 ? (
                      <span className="message-reaction-summary">
                        {item.reactions
                          .filter((reaction) => Number(reaction.count || 0) > 0)
                          .map(
                            (reaction) =>
                              `${resolveReactionEmoji(reaction.type)} ${reaction.count}`
                          )
                          .join(' ')}
                      </span>
                    ) : null}
                    {groupReadReceiptSummary ? (
                      <p
                        className="group-read-receipt"
                        title={groupReadReceiptSummary.title}
                      >
                        {groupReadReceiptSummary.label}
                      </p>
                    ) : null}

                    {index === displayMessages.length - 1 ? (
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
      {showReturnToLatestButton ? (
        <button
          type="button"
          className="jump-latest-btn"
          onClick={handleBackToLatest}
          disabled={isLoadingContext}
          title="Về tin nhắn hiện tại"
        >
          <span className="jump-latest-btn-arrow" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <IoArrowDown style={{ fontSize: "16px" }} />
          </span>
          {isContextMode ? <span>Về hiện tại</span> : null}
          {newMessagesSinceContext > 0 ? (
            <span className="jump-latest-btn-badge">+{newMessagesSinceContext}</span>
          ) : null}
        </button>
      ) : null}
      <div className="footer-chat">
        <div className="chat-input flex">
          <div className="flex">
            <div className="wrap-set-icon">
              <RiEmojiStickerLine
                className={`icon-header ${isComposerInteractionLocked ? "composer-icon-disabled" : ""}`}
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
            <AiOutlinePicture
              className={`icon-header ${isComposerInteractionLocked ? "composer-icon-disabled" : ""}`}
              onClick={handleImagePickerOpen}
            />
            <IoMdAttach
              className={`icon-header ${isComposerInteractionLocked ? "composer-icon-disabled" : ""}`}
              onClick={handleFilePickerOpen}
            />
            <IoCameraOutline
              className={`icon-header ${isComposerInteractionLocked ? "composer-icon-disabled" : ""}`}
            />
            <MdOutlineContactMail
              className={`icon-header ${isComposerInteractionLocked ? "composer-icon-disabled" : ""}`}
            />
            {activeConversation?.type === "group" ? (
              <IoBarChartOutline className="icon-header" onClick={handleOpenPollComposer} />
            ) : null}
            <RiCalendarTodoFill
              className={`icon-header ${isComposerInteractionLocked ? "composer-icon-disabled" : ""}`}
            />
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
            {isComposerBlocked ? (
              <div className="composer-block-banner">
                <p>{PRIVATE_BLOCKED_COMPOSER_MESSAGE}</p>
              </div>
            ) : null}
            {replyingToMessage ? (
              <div className="composer-reply-banner">
                <div className="composer-reply-text">
                  <p className="composer-reply-label">
                    Trả lời {replyingToMessage.senderDisplayName || "tin nhắn"}
                  </p>
                  <p className="composer-reply-preview">
                    {replyingToMessage.contentPreview || "Tin nhắn"}
                  </p>
                </div>
                <button
                  className="composer-reply-close"
                  type="button"
                  onClick={handleCancelReply}
                  aria-label="Hủy trả lời"
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
                  ) : attachment.isVideo ? (
                    <video src={attachment.previewUrl} controls muted />
                  ) : (
                    <div className="selected-attachment-file">
                      <span className={`selected-attachment-file-badge badge-${resolveAttachmentTypeMeta(attachment).label.toLowerCase()}`}>
                        {resolveAttachmentTypeMeta(attachment).icon}{" "}
                        {resolveAttachmentTypeMeta(attachment).label}
                      </span>
                      <span className="selected-attachment-file-name">
                        {attachment.fileName}
                      </span>
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
                  <p className="mention-suggestion-empty">Không tìm thấy thành viên</p>
                )}
              </div>
            ) : null}
            <div
              className={`wrap-input-chat ${
                selectedAttachments.length > 0 ? "content-chat-height" : ""
              } ${isComposerInteractionLocked ? "composer-locked" : ""}${
                isComposerBlocked ? " blocked-composer" : ""
              }`}
              style={{
                maxHeight: selectedAttachments.length > 0 ? undefined : "170px",
              }}
            >
              <div
                contentEditable={!isComposerInteractionLocked}
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
                className={`icon-header icon-send-mess ${
                  activeIconSend ? "activeIconSend" : ""
                } ${isComposerInteractionLocked ? "composer-icon-disabled" : ""}`}
                style={{
                  color: "rgb(107 173 223)",
                  backgroundColor: "#dff3ff",
                  opacity: isSending || isComposerInteractionLocked ? 0.6 : 1,
                }}
                onClick={isComposerInteractionLocked ? undefined : handleSendMess}
              />
              <AiOutlineLike
                className={`icon-header ${isComposerInteractionLocked ? "composer-icon-disabled" : ""}`}
                onClick={
                  isComposerInteractionLocked
                    ? undefined
                    : (event) => handleSendMess(event, true)
                }
              />
            </div>
          </div>
        </form>
        {isForwardPickerOpen ? (
          <div className="forward-picker-overlay" onClick={handleCloseForwardPicker}>
            <div className="forward-picker-card" onClick={(event) => event.stopPropagation()}>
              <div className="forward-picker-header">
                <div>
                  <h3 className="forward-picker-title">Chuyển tiếp tin nhắn</h3>
                  <p className="forward-picker-subtitle">
                    {forwardingMessage?.previewText || "Chọn cuộc trò chuyện để gửi lại."}
                  </p>
                </div>
                <button
                  className="message-action-btn subtle"
                  type="button"
                  onClick={handleCloseForwardPicker}
                  aria-label="Đóng chuyển tiếp"
                >
                  <IoMdClose />
                </button>
              </div>
              <div className="forward-picker-search-row">
                <CiSearch className="forward-picker-search-icon" />
                <input
                  className="forward-picker-search-input"
                  type="text"
                  placeholder="Tìm cuộc trò chuyện"
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
                                {conversation.lastMessage || "Cuộc trò chuyện sẵn có"}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="forward-picker-empty">
                    Không tìm thấy cuộc trò chuyện phù hợp.
                  </p>
                )}
              </div>
              <div className="flex forward-picker-actions">
                <button
                  className="message-action-btn subtle"
                  type="button"
                  onClick={handleCloseForwardPicker}
                >
                  Hủy
                </button>
                <button
                  className="message-action-btn primary"
                  type="button"
                  onClick={handleConfirmForward}
                  disabled={!forwardTargetConversationId || isForwarding}
                >
                  {isForwarding ? "Đang gửi..." : "Gửi"}
                </button>
              </div>
              {actionError ? (
                <p className="composer-feedback-error forward-picker-error">{actionError}</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {isSending ? <p className="composer-feedback-hint">Đang gửi tin nhắn...</p> : null}
        {forwardNotice ? <p className="composer-feedback-success">{forwardNotice}</p> : null}
        {!isForwardPickerOpen && actionError && !shouldSuppressComposerBlockError ? (
          <p className="composer-feedback-error">{actionError}</p>
        ) : null}
        {isConversationDisbanded ? (
          <p className="composer-feedback-error">Nhóm đã được giải tán</p>
        ) : null}
        {isPollComposerOpen ? (
          <div className="forward-picker-overlay" onClick={handleClosePollComposer}>
            <div className="forward-picker-card poll-creator-card" onClick={(event) => event.stopPropagation()}>
              <div className="forward-picker-header">
                <div>
                  <h3 className="forward-picker-title">Tạo bình chọn mới</h3>
                  <p className="forward-picker-subtitle">
                    Tạo bình chọn trong nhóm để mọi người cùng tham gia.
                  </p>
                </div>
                <button
                  className="message-action-btn subtle"
                  type="button"
                  onClick={handleClosePollComposer}
                >
                  <IoMdClose />
                </button>
              </div>
              <div className="poll-form-body">
                <input
                  className="poll-question-input"
                  type="text"
                  placeholder="Đặt câu hỏi bình chọn"
                  value={pollDraft.question}
                  onChange={(event) =>
                    setPollDraft((prevState) => ({
                      ...prevState,
                      question: event.target.value,
                    }))
                  }
                />
                <div className="poll-options-editor">
                  {pollDraft.options.map((option, index) => (
                    <div className="poll-option-editor-row" key={`poll-option-${index}`}>
                      <input
                        type="text"
                        value={option}
                        placeholder={`Phương án ${index + 1}`}
                        onChange={(event) => handlePollOptionChange(index, event.target.value)}
                      />
                      {pollDraft.options.length > 2 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPollDraft((prevState) => ({
                              ...prevState,
                              options: prevState.options.filter((_, optionIndex) => optionIndex !== index),
                            }))
                          }
                        >
                          Xóa
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="message-action-btn subtle"
                    onClick={() =>
                      setPollDraft((prevState) => ({
                        ...prevState,
                        options: [...prevState.options, ""],
                      }))
                    }
                  >
                    Thêm phương án
                  </button>
                </div>
                <div className="poll-setting-list">
                  <label>
                    <input
                      type="checkbox"
                      checked={pollDraft.allowMultiple}
                      onChange={(event) =>
                        setPollDraft((prevState) => ({
                          ...prevState,
                          allowMultiple: event.target.checked,
                        }))
                      }
                    />
                    Chọn nhiều phương án
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={pollDraft.allowAddOption}
                      onChange={(event) =>
                        setPollDraft((prevState) => ({
                          ...prevState,
                          allowAddOption: event.target.checked,
                        }))
                      }
                    />
                    Có thể thêm phương án
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={pollDraft.anonymousVotes}
                      onChange={(event) =>
                        setPollDraft((prevState) => ({
                          ...prevState,
                          anonymousVotes: event.target.checked,
                        }))
                      }
                    />
                    Ẩn người bình chọn
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={pollDraft.hideResultsBeforeVote}
                      onChange={(event) =>
                        setPollDraft((prevState) => ({
                          ...prevState,
                          hideResultsBeforeVote: event.target.checked,
                        }))
                      }
                    />
                    Ẩn kết quả khi chưa bình chọn
                  </label>
                </div>
              </div>
              <div className="forward-picker-actions">
                <button className="message-action-btn subtle" type="button" onClick={handleClosePollComposer}>
                  Hủy
                </button>
                <button
                  className="message-action-btn primary"
                  type="button"
                  onClick={handleCreatePoll}
                  disabled={isPollSubmitting}
                >
                  {isPollSubmitting ? "Đang tạo..." : "Tạo"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {selectedContactProfile ? (
          <div
            className="forward-picker-overlay"
            onClick={() => setSelectedContactProfile(null)}
          >
            <div
              className="forward-picker-card profile-preview-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="forward-picker-header">
                <div>
                  <h3 className="forward-picker-title">Trang cá nhân</h3>
                  <p className="forward-picker-subtitle">
                    Xem thông tin người dùng từ danh thiếp trong đoạn chat.
                  </p>
                </div>
                <button
                  className="message-action-btn subtle"
                  type="button"
                  onClick={() => setSelectedContactProfile(null)}
                >
                  <IoMdClose />
                </button>
              </div>
              <div className="profile-preview-body">
                {selectedContactProfile.avatarUrl ? (
                  <img
                    src={selectedContactProfile.avatarUrl}
                    alt={selectedContactProfile.displayName}
                    className="profile-preview-avatar"
                  />
                ) : (
                  <div className="profile-preview-avatar profile-preview-avatar-placeholder" />
                )}
                <h4>{selectedContactProfile.displayName}</h4>
                <p>{selectedContactProfile.username || "Không có username"}</p>
                <p>{selectedContactProfile.phone || selectedContactProfile.email || ""}</p>
                {String(selectedContactProfile.userId || "") !== String(currentUserId || "") ? (
                  <button
                    type="button"
                    className={`message-contact-action large ${
                      String(selectedContactProfile.relationshipStatus || "").toUpperCase() ===
                      "NONE"
                        ? "primary"
                        : "muted"
                    }`}
                    disabled={
                      isSendingFriendRequest ||
                      String(selectedContactProfile.relationshipStatus || "").toUpperCase() !==
                        "NONE"
                    }
                    onClick={() =>
                      handleSendFriendRequestFromCard(
                        normalizeIdentifierToken(
                          selectedContactProfile.email || selectedContactProfile.phone || ""
                        ),
                        selectedContactProfile
                      )
                    }
                  >
                    {isSendingFriendRequest &&
                    String(selectedContactProfile.relationshipStatus || "").toUpperCase() ===
                      "NONE"
                      ? "Đang gửi..."
                      : resolveFriendStatusLabel(selectedContactProfile.relationshipStatus)}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
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



