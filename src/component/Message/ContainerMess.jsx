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
import PresenceContext from "../../Context/PresenceContext";
import MessageProcessingContext from "../../Context/MessageProcessingContext";
import Icon from "./Icon";
import { HiOutlineUserGroup, HiOutlineUserPlus } from "react-icons/hi2";
import { CiSearch } from "react-icons/ci";
import {
  IoVideocamOutline,
  IoMicOutline,
  IoStop,
  IoPlay,
  IoCallOutline,
  IoBarChartOutline,
  IoArrowUndoOutline,
  IoArrowDown,
  IoAddOutline,
  IoCheckboxOutline,
  IoEyeOffOutline,
  IoPersonOutline,
  IoTrashOutline,
  IoDocumentTextOutline,
  IoChevronDownOutline,
  IoChevronUpOutline,
} from "react-icons/io5";
import { AiOutlineBell, AiOutlineLike, AiFillLike, AiOutlinePicture, AiOutlineSend, AiOutlinePushpin } from "react-icons/ai";
import { IoMdClose, IoMdAttach,IoMdMore  } from "react-icons/io";
import {
  RiCalendarTodoFill,
  RiEmojiStickerLine,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
} from "react-icons/ri";
import {
  addOrUpdateReactionV1,
  deleteMessageV1,
  editMessageV1,
  getConversationMessages,
  getMessageContextV1,
  hideMessageV1,
  markConversationDelivered,
  markConversationSeen,
  pinMessageV1,
  removeReactionV1,
  removeMessageForMeV1,
  sendMessageV1,
  sendTypingState,
  uploadAttachmentV1,
} from "../../services/chat/messageApi";
import {
  ackReminder,
  cancelReminder,
  completeReminder,
  createConversationReminder,
  dismissReminder,
  getConversationReminders,
} from "../../services/reminder/reminderApi";
import chatRealtimeService from "../../services/chat/chatRealtimeService";
import { askAi, getChatSummary } from "../../services/ai/aiApi";
import { getGroupCallStatusApi, initiateGroupCallApi } from "../../services/call/groupCallApi";
import groupCallService from "../../services/call/GroupCallService";
import {
  RECALLED_MESSAGE_PLACEHOLDER,
  createReplyPreviewText,
  createAttachmentPreviewText,
  isAudioAttachment,
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
  updateMessageReactionSummary,
  upsertMessageItem,
} from "../../mappers/messageMapper";
import { searchUsersV2, sendFriendRequestV2 } from "../../util/api";
import {
  USER_BLOCK_STATUS_CHANGED_EVENT,
  isUserBlockedByCurrentUser,
} from "../../services/userBlockApi";
import VoiceMessageBubble from "./VoiceMessageBubble";
import {
  getProcessingJob,
  requestDictationSpeechToText,
} from "../../services/messageProcessing/messageProcessingApi";
import { getLinkPreview } from "../../services/chat/linkPreviewApi";

const REACTION_OPTIONS = ["LIKE", "LOVE", "WOW", "HAHA"];
const POLL_CREATE_PREFIX = "[[POLL_CREATE]]";
const POLL_VOTE_PREFIX = "[[POLL_VOTE]]";
const POLL_ADD_OPTION_PREFIX = "[[POLL_ADD_OPTION]]";
const GROUP_SYSTEM_PREFIX = "[[GROUP_SYSTEM]]";
const VOICE_RECORDING_MAX_DURATION_MS = 300000;
const VOICE_WAVEFORM_SAMPLE_SIZE = 64;
const DICTATION_RECORDING_MAX_DURATION_MS = 90000;
const DICTATION_POLL_INTERVAL_MS = 2500;
const DICTATION_MAX_POLL_ATTEMPTS = 20;
const TYPING_DEBOUNCE_MS = 400;
const TYPING_IDLE_MS = 900;
const REMOTE_TYPING_TIMEOUT_MS = 3000;
const BLOCK_STATE_LOADING_MESSAGE = "Đang kiểm tra trạng thái chặn...";
const PRIVATE_BLOCKED_COMPOSER_MESSAGE =
  "Bạn đã chặn người dùng này. Bỏ chặn trong Thông tin hội thoại để trò chuyện lại.";
const PRIVATE_CONVERSATION_LABEL = "Người dùng";
const GROUP_CONVERSATION_LABEL = "Nhóm";
const MAX_READ_RECEIPT_AVATARS = 5;
const MESSAGE_CURSOR_SYNC_THROTTLE_MS = 700;
const MESSAGE_CURSOR_SYNC_CHANNEL = "chat:message-cursor-sync";
const MESSAGE_CURSOR_SYNC_STORAGE_KEY = "chat:message-cursor-sync:payload";
const REACTION_LABELS = {
  LIKE: "👍",
  LOVE: "❤️",
  HAHA: "😂",
};

const parseReadCursorMessageId = (value) => {
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) && normalizedValue > 0
    ? normalizedValue
    : null;
};

const isCursorAdvanced = (nextCursor, currentCursor) => {
  if (nextCursor == null) {
    return false;
  }

  if (currentCursor == null) {
    return true;
  }

  return nextCursor > currentCursor;
};

const parseReadCursorTimestamp = (value) => {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const findLastMessageIndexAtOrBeforeCursor = (sortedMessageIds, cursorMessageId) => {
  if (!Array.isArray(sortedMessageIds) || !sortedMessageIds.length) {
    return -1;
  }

  const normalizedCursorMessageId = parseReadCursorMessageId(cursorMessageId);
  if (normalizedCursorMessageId == null) {
    return -1;
  }

  let leftIndex = 0;
  let rightIndex = sortedMessageIds.length - 1;
  let matchedIndex = -1;

  while (leftIndex <= rightIndex) {
    const middleIndex = Math.floor((leftIndex + rightIndex) / 2);
    const middleMessageId = sortedMessageIds[middleIndex];

    if (middleMessageId <= normalizedCursorMessageId) {
      matchedIndex = middleIndex;
      leftIndex = middleIndex + 1;
    } else {
      rightIndex = middleIndex - 1;
    }
  }

  return matchedIndex;
};

const mergeConversationReadStateEntry = (currentState, incomingState) => {
  if (!incomingState?.userId) {
    return currentState || null;
  }

  if (!currentState) {
    return {
      ...incomingState,
      userId: String(incomingState.userId),
    };
  }

  const nextState = {
    ...currentState,
    userId: String(incomingState.userId),
    conversationId:
      incomingState.conversationId || currentState.conversationId || null,
    displayName: incomingState.displayName || currentState.displayName || "",
    avatarUrl: incomingState.avatarUrl || currentState.avatarUrl || "",
  };

  const incomingDeliveredCursor = parseReadCursorMessageId(
    incomingState.lastDeliveredMessageId
  );
  const currentDeliveredCursor = parseReadCursorMessageId(
    currentState.lastDeliveredMessageId
  );
  if (isCursorAdvanced(incomingDeliveredCursor, currentDeliveredCursor)) {
    nextState.lastDeliveredMessageId = incomingDeliveredCursor;
    nextState.deliveredAt =
      incomingState.deliveredAt || incomingState.lastDeliveredAt || null;
  } else if (incomingDeliveredCursor === currentDeliveredCursor) {
    const incomingDeliveredAt = parseReadCursorTimestamp(
      incomingState.deliveredAt || incomingState.lastDeliveredAt
    );
    const currentDeliveredAt = parseReadCursorTimestamp(
      currentState.deliveredAt || currentState.lastDeliveredAt
    );
    if (incomingDeliveredAt >= currentDeliveredAt && incomingDeliveredAt > 0) {
      nextState.deliveredAt =
        incomingState.deliveredAt || incomingState.lastDeliveredAt || null;
    }
  }

  const incomingReadCursor = parseReadCursorMessageId(incomingState.lastReadMessageId);
  const currentReadCursor = parseReadCursorMessageId(currentState.lastReadMessageId);
  if (isCursorAdvanced(incomingReadCursor, currentReadCursor)) {
    nextState.lastReadMessageId = incomingReadCursor;
    nextState.lastReadAt = incomingState.lastReadAt || null;
  } else if (incomingReadCursor === currentReadCursor) {
    const incomingReadAt = parseReadCursorTimestamp(incomingState.lastReadAt);
    const currentReadAt = parseReadCursorTimestamp(currentState.lastReadAt);
    if (incomingReadAt >= currentReadAt && incomingReadAt > 0) {
      nextState.lastReadAt = incomingState.lastReadAt || null;
    }
  }

  return nextState;
};

const createReadStateByUserIdMap = (items) => {
  const nextStateMap = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item?.userId) {
      return;
    }

    const userKey = String(item.userId);
    const existingState = nextStateMap.get(userKey);
    const mergedState = mergeConversationReadStateEntry(existingState, {
      ...item,
      userId: userKey,
    });

    if (mergedState) {
      nextStateMap.set(userKey, mergedState);
    }
  });
  return nextStateMap;
};

const buildAvatarFallbackLabel = (displayName, userId) => {
  const normalizedDisplayName = String(displayName || "").trim();
  if (normalizedDisplayName) {
    return normalizedDisplayName.charAt(0).toUpperCase();
  }

  const normalizedUserId = String(userId || "").trim();
  return normalizedUserId ? normalizedUserId.charAt(0).toUpperCase() : "?";
};

const resolveMemberAvatarUrl = (member) => {
  if (!member || typeof member !== "object") {
    return "";
  }

  return (
    member.avatarUrl ||
    member.avatar ||
    member.profilePicture ||
    member.profileImage ||
    member.photoUrl ||
    member.imageUrl ||
    member.user?.avatarUrl ||
    member.user?.avatar ||
    member.userProfile?.avatarUrl ||
    member.userProfile?.avatar ||
    ""
  );
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

const resolveForwardAttachmentType = (attachment) => {
  const normalizedType = String(attachment?.type || "").toUpperCase();
  if (["IMAGE", "VIDEO", "AUDIO", "FILE"].includes(normalizedType)) {
    return normalizedType;
  }

  if (isImageAttachment(attachment)) {
    return "IMAGE";
  }
  if (isVideoAttachment(attachment)) {
    return "VIDEO";
  }
  if (isAudioAttachment(attachment)) {
    return "AUDIO";
  }

  return "FILE";
};

const resolveForwardAttachmentFileName = (attachment, type) => {
  const currentFileName = String(attachment?.fileName || attachment?.name || "").trim();
  if (currentFileName) {
    return currentFileName;
  }

  const contentType = String(attachment?.contentType || "").toLowerCase();
  if (contentType === "image/gif") {
    return "forwarded.gif";
  }

  return {
    IMAGE: "forwarded-image",
    VIDEO: "forwarded-video",
    AUDIO: "forwarded-audio",
    FILE: "forwarded-file",
  }[type];
};

const normalizeForwardAttachment = (attachment) => {
  const url = String(attachment?.url || "").trim();
  if (!url) {
    return null;
  }

  const type = resolveForwardAttachmentType(attachment);
  const parsedFileSize = Number(attachment?.fileSize);
  const normalizedAttachment = {
    url,
    storageKey: attachment?.storageKey || "",
    fileName: resolveForwardAttachmentFileName(attachment, type),
    contentType: attachment?.contentType || "",
    fileSize:
      Number.isFinite(parsedFileSize) && parsedFileSize >= 0
        ? Math.trunc(parsedFileSize)
        : 0,
    type,
  };

  if (type === "AUDIO") {
    const parsedDurationMs = Number(attachment?.durationMs);
    if (Number.isFinite(parsedDurationMs) && parsedDurationMs > 0) {
      normalizedAttachment.durationMs = Math.trunc(parsedDurationMs);
    }
    if (Array.isArray(attachment?.waveform)) {
      normalizedAttachment.waveform = attachment.waveform;
    }
    if (attachment?.audioFormat) {
      normalizedAttachment.audioFormat = attachment.audioFormat;
    }
  }

  return normalizedAttachment;
};

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

const REMINDER_STATUS_LABELS = {
  SCHEDULED: "Đã lên lịch",
  DUE: "Đến hạn",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const REMINDER_PARTICIPANT_STATUS_LABELS = {
  PENDING: "Chờ phản hồi",
  ACKNOWLEDGED: "Đã xác nhận",
  DISMISSED: "Đã bỏ qua",
  DONE: "Đã xong",
};

const formatReminderDateTime = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const isSystemMessageType = (message) =>
  String(message?.type || message?.raw?.type || "").toUpperCase() === "SYSTEM";

const isReminderSystemMessage = (message) =>
  isSystemMessageType(message) &&
  normalizeSearchText(message?.content).includes("nhac hen");

const getTimelineItemTime = (item) => {
  const value =
    item?.__timelineType === "reminder"
      ? item?.reminder?.createdAt || item?.reminder?.remindAt
      : item?.createdAt;
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

const formatPresenceStatusText = (online, lastSeenAt, fallbackText) => {
  if (online) {
    return "Đang hoạt động";
  }

  if (lastSeenAt) {
    const date = new Date(lastSeenAt);
    if (!Number.isNaN(date.getTime())) {
      const diffMs = Date.now() - date.getTime();
      if (diffMs < 60 * 1000) {
        return "Vừa truy cập";
      }
      const diffMinutes = Math.floor(diffMs / (60 * 1000));
      if (diffMinutes < 60) {
        return `Hoạt động ${diffMinutes} phút trước`;
      }
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
        return `Hoạt động ${diffHours} giờ trước`;
      }
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) {
        return `Hoạt động ${diffDays} ngày trước`;
      }
      return `Hoạt động ${date.toLocaleDateString("vi-VN")}`;
    }
  }

  const fallback = String(fallbackText || "").trim();
  if (fallback && fallback !== "Active") {
    return fallback;
  }

  return "Không hoạt động";
};

const isImageFile = (file) => String(file?.type || "").startsWith("image/");
const isVideoFile = (file) => String(file?.type || "").startsWith("video/");
const isAudioFile = (file) => String(file?.type || "").startsWith("audio/");

const pickRecorderMimeType = () => {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return "";
  }

  const preferredTypes = [
    "audio/mpeg",
    "audio/mp3",
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];

  return preferredTypes.find((type) => window.MediaRecorder.isTypeSupported(type)) || "";
};

const resolveAudioFormatFromMimeType = (mimeType) => {
  const normalized = String(mimeType || "").toLowerCase();
  if (!normalized) {
    return "audio";
  }

  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "mp3";
  }
  if (normalized.includes("webm")) {
    return "webm";
  }
  if (normalized.includes("ogg")) {
    return "ogg";
  }
  if (normalized.includes("mp4") || normalized.includes("m4a")) {
    return "m4a";
  }
  if (normalized.includes("wav")) {
    return "wav";
  }
  if (normalized.includes("aac")) {
    return "aac";
  }

  return normalized.split("/").pop()?.split(";")[0] || "audio";
};

const formatRecordingDuration = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const toDateTimeLocalValue = (dateValue) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const buildDefaultReminderLocalValue = () => {
  const date = new Date(Date.now() + 30 * 60 * 1000);
  date.setSeconds(0, 0);
  return toDateTimeLocalValue(date);
};

const parseLocalDateTimeToIso = (localValue) => {
  if (!localValue) {
    return "";
  }
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString();
};

const resolveBrowserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const clampWaveSample = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(1, Math.max(0, numeric));
};

const buildFallbackWaveformSamples = (size = VOICE_WAVEFORM_SAMPLE_SIZE) =>
  Array.from({ length: size }, (_, index) => {
    const angle = (index / Math.max(1, size - 1)) * Math.PI * 3;
    return clampWaveSample(Math.abs(Math.sin(angle)) * 0.75 + 0.2);
  });

const generateWaveformFromBlob = async (audioBlob, samples = VOICE_WAVEFORM_SAMPLE_SIZE) => {
  if (!audioBlob || typeof window === "undefined") {
    return buildFallbackWaveformSamples(samples);
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return buildFallbackWaveformSamples(samples);
  }

  const audioContext = new AudioContextClass();
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(channelData.length / samples));
    const waveform = [];

    for (let index = 0; index < samples; index += 1) {
      const start = index * step;
      const end = Math.min(channelData.length, start + step);
      let peak = 0;

      for (let cursor = start; cursor < end; cursor += 1) {
        const amplitude = Math.abs(channelData[cursor] || 0);
        if (amplitude > peak) {
          peak = amplitude;
        }
      }

      waveform.push(clampWaveSample(peak));
    }

    const maxPeak = Math.max(...waveform, 0);
    if (maxPeak > 0) {
      return waveform.map((value) => clampWaveSample(value / maxPeak));
    }

    return buildFallbackWaveformSamples(samples);
  } catch (error) {
    console.error("Failed to decode voice waveform:", error);
    return buildFallbackWaveformSamples(samples);
  } finally {
    await audioContext.close().catch(() => {});
  }
};

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

const TERMINAL_CALL_LOG_STATUSES = new Set([
  "ENDED",
  "MISSED",
  "REJECTED",
  "CANCELLED",
  "BUSY",
]);
const LIVE_GROUP_CALL_STATUSES = new Set([
  "STARTED",
  "RINGING",
  "ONGOING",
  "ACTIVE",
  "IN_PROGRESS",
]);
const CHECKING_GROUP_CALL_STATUS = "CHECKING";

const normalizeCallLogStatus = (callLog) =>
  String(callLog?.callStatus || callLog?.raw?.status || "ENDED").toUpperCase();

const isTerminalCallLogStatus = (callLog) =>
  TERMINAL_CALL_LOG_STATUSES.has(normalizeCallLogStatus(callLog));

const normalizeGroupCallStatusValue = (value) =>
  String(value || "").trim().toUpperCase();

const resolveExplicitGroupCallStatus = (callLog) =>
  normalizeGroupCallStatusValue(
    callLog?.raw?.status ||
      callLog?.raw?.callStatus ||
      callLog?.status ||
      ""
  );

const resolveEffectiveGroupCallStatus = (callLog, trackedStatus) => {
  const normalizedTrackedStatus = normalizeGroupCallStatusValue(trackedStatus);
  if (normalizedTrackedStatus) {
    return normalizedTrackedStatus;
  }

  const explicitStatus = resolveExplicitGroupCallStatus(callLog);
  return explicitStatus || CHECKING_GROUP_CALL_STATUS;
};

const isLiveGroupCallStatus = (status) =>
  LIVE_GROUP_CALL_STATUSES.has(normalizeGroupCallStatusValue(status));

const isEndedGroupCallStatus = (status) => {
  const normalizedStatus = normalizeGroupCallStatusValue(status);
  return (
    TERMINAL_CALL_LOG_STATUSES.has(normalizedStatus) ||
    normalizedStatus === "COMPLETED" ||
    normalizedStatus === "CLOSED"
  );
};

const getCallLogIdentity = (message) => {
  const callLog = message?.callLog || null;
  if (!callLog) {
    return null;
  }

  const raw = callLog.raw || {};
  const callId =
    callLog.callId ||
    raw.callId ||
    raw.id ||
    message?.callId ||
    message?.raw?.callId ||
    null;
  const groupCallId =
    callLog.groupCallId ||
    raw.groupCallId ||
    message?.groupCallId ||
    message?.raw?.groupCallId ||
    null;

  if (callId) {
    return `private:${callId}`;
  }

  if (groupCallId) {
    return `group:${groupCallId}`;
  }

  return null;
};

const getCallLogTimeValue = (message) => {
  const callLog = message?.callLog || {};
  const raw = callLog.raw || {};
  const time = Date.parse(
    raw.endedAt ||
      raw.startedAt ||
      message?.createdAt ||
      message?.raw?.createdAt ||
      ""
  );

  if (Number.isFinite(time)) {
    return time;
  }

  const numericMessageId = Number(message?.id);
  return Number.isFinite(numericMessageId) ? numericMessageId : 0;
};

const shouldPreferCallLogMessage = (currentMessage, nextMessage) => {
  const currentCallLog = currentMessage?.callLog || {};
  const nextCallLog = nextMessage?.callLog || {};
  const currentIsTerminal = isTerminalCallLogStatus(currentCallLog);
  const nextIsTerminal = isTerminalCallLogStatus(nextCallLog);

  if (currentIsTerminal !== nextIsTerminal) {
    return nextIsTerminal;
  }

  const currentIsMissed = normalizeCallLogStatus(currentCallLog) === "MISSED";
  const nextIsMissed = normalizeCallLogStatus(nextCallLog) === "MISSED";
  if (currentIsMissed !== nextIsMissed) {
    return nextIsMissed;
  }

  const currentDuration = Number(currentCallLog.durationSeconds || 0);
  const nextDuration = Number(nextCallLog.durationSeconds || 0);
  if (currentDuration !== nextDuration) {
    return nextDuration > currentDuration;
  }

  return getCallLogTimeValue(nextMessage) >= getCallLogTimeValue(currentMessage);
};

const shouldRenderCallLogMessage = (message) => {
  const callLog = message?.callLog || null;
  if (!callLog) {
    return false;
  }

  if (isTerminalCallLogStatus(callLog)) {
    return true;
  }

  return Boolean(callLog.groupCallId);
};

const compactCallLogMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return messages;
  }

  if (messages.length <= 1) {
    return messages.filter(
      (message) =>
        !message?.isCallLog ||
        (!message?.deletedAt && shouldRenderCallLogMessage(message))
    );
  }

  const selectedCallLogByIdentity = new Map();

  messages.forEach((message, index) => {
    if (!message?.isCallLog || message?.deletedAt || !shouldRenderCallLogMessage(message)) {
      return;
    }

    const identity = getCallLogIdentity(message);
    if (!identity) {
      return;
    }

    const currentSelection = selectedCallLogByIdentity.get(identity);
    if (
      !currentSelection ||
      shouldPreferCallLogMessage(currentSelection.message, message)
    ) {
      selectedCallLogByIdentity.set(identity, { index, message });
    }
  });

  const selectedCallLogIndexes = new Set(
    Array.from(selectedCallLogByIdentity.values()).map((entry) => entry.index)
  );

  return messages.filter((message, index) => {
    if (!message?.isCallLog) {
      return true;
    }

    if (message?.deletedAt || !shouldRenderCallLogMessage(message)) {
      return false;
    }

    const identity = getCallLogIdentity(message);
    return identity ? selectedCallLogIndexes.has(index) : true;
  });
};

const buildSelectedAttachment = (file, index) => ({
  id: `${file.name || "clipboard-file"}-${file.size}-${file.lastModified}-${index}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`,
  file,
  fileName: file.name || "clipboard-file",
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
    { kind: "group_system", prefix: GROUP_SYSTEM_PREFIX },
  ];

  for (const matcher of matchers) {
    if (!normalizedContent.startsWith(matcher.prefix)) {
      continue;
    }

    try {
      const payload = JSON.parse(normalizedContent.slice(matcher.prefix.length).trim());
      return {
        kind:
          matcher.kind === "group_system"
            ? payload?.kind || matcher.kind
            : matcher.kind,
        payload,
      };
    } catch {
      return null;
    }
  }

  return null;
};

const resolveGroupSystemMessageText = (systemMessage, options = {}) => {
  const payload = systemMessage?.payload || {};
  const kind = String(systemMessage?.kind || payload.kind || "");
  const actorName = String(options.actorName || payload.actorName || "Ai đó");
  const targetName = String(options.targetName || payload.targetName || "một thành viên");
  const groupName = String(payload.name || payload.conversationName || "nhóm");

  switch (kind) {
    case "group_member_added":
      return `${actorName} đã thêm ${targetName} vào nhóm`;
    case "group_member_removed":
      return `${actorName} đã xóa ${targetName} khỏi nhóm`;
    case "group_left":
      return `${actorName} đã rời nhóm`;
    case "group_admin_promoted":
      return `${actorName} đã cấp phó nhóm cho ${targetName}`;
    case "group_admin_demoted":
      return `${actorName} đã thu hồi phó nhóm của ${targetName}`;
    case "group_owner_transferred":
      return `${actorName} đã chuyển quyền trưởng nhóm cho ${targetName}`;
    case "group_renamed":
      return `${actorName} đã đổi tên nhóm thành "${groupName}"`;
    case "group_avatar_changed":
      return `${actorName} đã cập nhật ảnh nhóm`;
    case "group_background_changed":
      return `${actorName} đã đổi nền chat`;
    case "group_nickname_changed": {
      const nickname = String(payload.nickname || "").trim();
      if (nickname) {
        return `${actorName} đã đổi biệt danh của ${targetName} thành "${nickname}"`;
      }
      return `${actorName} đã xóa biệt danh của ${targetName}`;
    }
    case "group_disbanded":
      return `${actorName} đã giải tán nhóm`;
    default:
      return "";
  }
};

const resolveSystemUserNameFallback = (member) => {
  if (!member || typeof member !== "object") {
    return "";
  }

  const nickname = String(member.nickname || "").trim().toLowerCase();
  const displayName = String(member.displayName || "").trim();
  const username = String(member.username || "").trim();

  if (displayName && nickname && displayName.toLowerCase() === nickname) {
    return username || displayName;
  }

  return displayName || username;
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

const trimUrlToken = (token) => String(token || "").replace(/[)\],.!?;:]+$/g, "");
const normalizeUrlScanText = (text) => String(text || "").replace(/\u00A0/g, " ").trim();

const extractFirstUrlFromText = (text) => {
  const normalizedText = normalizeUrlScanText(text);
  if (!normalizedText) {
    return "";
  }

  const matcher = new RegExp(URL_IN_TEXT_PATTERN);
  const match = matcher.exec(normalizedText);
  const matchedUrl = trimUrlToken(match?.[1] || "");
  if (matchedUrl) {
    return matchedUrl;
  }

  // Fallback matcher for URLs not covered by the strict regex pattern.
  const tokens = normalizedText.split(/\s+/).map((token) => trimUrlToken(token));
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    if (!/^https?:\/\//i.test(token) && (!token.includes(".") || token.includes("@"))) {
      continue;
    }
    const normalizedUrl = normalizeUrlForPreview(token);
    if (normalizedUrl) {
      return token;
    }
  }

  return "";
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

const extractFirstUrlFromHtml = (html) => {
  const htmlContent = String(html || "").trim();
  if (!htmlContent) {
    return "";
  }

  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");
      const anchors = Array.from(doc.querySelectorAll("a[href]"));
      for (const anchor of anchors) {
        const href = String(anchor.getAttribute("href") || "").trim();
        const normalized = normalizeUrlForPreview(href);
        if (normalized) {
          return normalized;
        }
      }
    } catch {
      // Fallback to regex below
    }
  }

  const hrefMatch = htmlContent.match(/href\s*=\s*["']([^"']+)["']/i);
  if (hrefMatch?.[1]) {
    return normalizeUrlForPreview(hrefMatch[1]);
  }

  return "";
};

const extractFirstUrlFromComposerNode = (composerNode) => {
  if (!composerNode) {
    return "";
  }

  const textUrl = normalizeUrlForPreview(
    trimUrlToken(extractFirstUrlFromText(composerNode.textContent || ""))
  );
  if (textUrl) {
    return textUrl;
  }

  if (typeof composerNode.querySelectorAll === "function") {
    const anchors = Array.from(composerNode.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      const href = String(anchor.getAttribute("href") || "").trim();
      const normalized = normalizeUrlForPreview(href);
      if (normalized) {
        return normalized;
      }
    }
  }

  return extractFirstUrlFromHtml(composerNode.innerHTML || "");
};

const resolvePreviewHost = (url) => {
  try {
    const parsed = new URL(String(url || ""));
    return String(parsed.hostname || "")
      .replace(/^www\./i, "")
      .trim();
  } catch {
    return String(url || "").trim();
  }
};

const getPresetLinkPreviewByHost = (host) => {
  const normalizedHost = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./i, "");

  if (
    normalizedHost === "youtube.com" ||
    normalizedHost.endsWith(".youtube.com") ||
    normalizedHost === "youtu.be" ||
    normalizedHost.endsWith(".youtu.be")
  ) {
    return {
      title: "YouTube",
      description:
        "Thưởng thức video và nhạc bạn yêu thích, tải nội dung do bạn sáng tạo lên và chia sẻ nội dung đó với gia đình, bạn bè và mọi người trên YouTube.",
      image: "https://www.youtube.com/img/desktop/yt_1200.png",
    };
  }

  return null;
};

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

const applyLocalReactionChange = (message, nextReaction, currentUserId) => {
  const normalizedCurrentUserId = String(currentUserId || "");
  const reactionMap = new Map(
    (Array.isArray(message?.reactions) ? message.reactions : []).map((reaction) => [
      reaction.type,
      {
        count: Number(reaction.count || 0),
        userIds: Array.isArray(reaction.userIds)
          ? reaction.userIds.map((userId) => String(userId || "")).filter(Boolean)
          : [],
      },
    ])
  );
  const previousReaction = message?.myReaction || null;

  if (previousReaction && reactionMap.has(previousReaction)) {
    const previousReactionState = reactionMap.get(previousReaction);
    reactionMap.set(previousReaction, {
      count: Math.max(0, previousReactionState.count - 1),
      userIds: normalizedCurrentUserId
        ? previousReactionState.userIds.filter((userId) => userId !== normalizedCurrentUserId)
        : previousReactionState.userIds,
    });
  }

  if (nextReaction) {
    const nextReactionState = reactionMap.get(nextReaction) || { count: 0, userIds: [] };
    reactionMap.set(nextReaction, {
      count: nextReactionState.count + 1,
      userIds:
        normalizedCurrentUserId && !nextReactionState.userIds.includes(normalizedCurrentUserId)
          ? [...nextReactionState.userIds, normalizedCurrentUserId]
          : nextReactionState.userIds,
    });
  }

  return {
    reactions: Array.from(reactionMap.entries())
      .filter(([, reaction]) => reaction.count > 0)
      .map(([type, reaction]) => ({ type, ...reaction })),
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
  const sourceAttachments = Array.isArray(message?.attachments)
    ? message.attachments
    : [];
  const attachments = sourceAttachments.map(normalizeForwardAttachment).filter(Boolean);
  const content = String(message?.content || "").trim();
  const deletedAt = message?.deletedAt || null;
  const hasAttachments = sourceAttachments.length > 0;
  const attachmentsAreReusable =
    !hasAttachments || attachments.length === sourceAttachments.length;
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
const MENTION_QUERY_PATTERN = /^[^\s@]*$/;
const MENTION_TOKEN_PATTERN = /(^|[^A-Za-z0-9._-])@([A-Za-z0-9._-]+)/g;

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
    .replace(/[^A-Za-z0-9._-]/g, "");

const normalizeMentionHandleFromLabel = (value) => {
  const normalizedValue = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ".")
    .trim();
  return normalizeMentionHandle(normalizedValue);
};

const resolveConversationType = (value) => {
  const normalizedType = String(value || "").trim().toLowerCase();

  if (!normalizedType) {
    return "private";
  }

  if (
    normalizedType === "group" ||
    normalizedType.includes("group") ||
    normalizedType.includes("channel") ||
    normalizedType.includes("community")
  ) {
    return "group";
  }

  return "private";
};

const getNestedValue = (value, path) =>
  path.reduce((currentValue, key) => currentValue?.[key], value);

const resolveMessageLinkUrl = (message, linkPreviewByUrl = {}) => {
  const contentUrl = normalizeUrlForPreview(
    trimUrlToken(extractFirstUrlFromText(message?.content))
  );
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

    const normalizedUrl = normalizeUrlForPreview(
      trimUrlToken(extractFirstUrlFromText(value) || value)
    );
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

const extractMentionHandlesFromText = (text) => {
  if (!text) {
    return [];
  }

  const matches = [];
  const pattern = /(^|[^A-Za-z0-9._-])@([A-Za-z0-9._-]+)/g;
  String(text).replace(pattern, (match, prefix, handle) => {
    if (handle) {
      matches.push(handle.toLowerCase());
    }
    return match;
  });

  return matches;
};

const extractMentionHandlesFromMessage = (message) => {
  const handleSet = new Set(
    extractMentionHandlesFromText(message?.content).map((value) =>
      String(value || "").toLowerCase()
    )
  );

  const rawMentionSources = [
    message?.raw?.mentions,
    message?.raw?.mentionedUsers,
    message?.raw?.mentionUsers,
    message?.raw?.metadata?.mentions,
    message?.raw?.meta?.mentions,
  ].filter((source) => Array.isArray(source) && source.length > 0);

  rawMentionSources.forEach((sourceItems) => {
    sourceItems.forEach((item) => {
      if (typeof item === "string") {
        const normalizedValue = normalizeMentionHandle(item).toLowerCase();
        if (normalizedValue) {
          handleSet.add(normalizedValue);
        }
        return;
      }

      const candidateValues = [
        normalizeMentionHandle(item?.username),
        normalizeMentionHandleFromLabel(item?.displayName),
        normalizeMentionHandle(item?.userId || item?.id),
      ]
        .filter(Boolean)
        .map((value) => value.toLowerCase());

      candidateValues.forEach((value) => handleSet.add(value));
    });
  });

  return handleSet;
};

const buildMentionPayloadFromMessageText = (
  messageText,
  mentionCandidates,
  currentUserId,
  selectedMentions = []
) => {
  const normalizedMessageText = String(messageText || "");
  const mentionPayloadByUserId = new Map();
  const normalizedCurrentUserId = String(currentUserId || "");

  const addCandidateToPayload = (candidate) => {
    const normalizedUserId = String(candidate?.userId || "").trim();
    if (!normalizedUserId || normalizedUserId === normalizedCurrentUserId) {
      return;
    }
    if (mentionPayloadByUserId.has(normalizedUserId)) {
      return;
    }
    mentionPayloadByUserId.set(normalizedUserId, {
      userId: candidate.userId,
      displayName: candidate.displayName || candidate.username || "",
    });
  };

  const normalizedSelectedMentions = Array.isArray(selectedMentions)
    ? selectedMentions
    : [];
  const selectedMentionUserIds = new Set();

  normalizedSelectedMentions.forEach((selectedMention) => {
    const userId = String(selectedMention?.userId || "").trim();
    if (!userId) {
      return;
    }

    const selectedDisplayToken = String(
      selectedMention?.displayMentionToken ||
        selectedMention?.displayToken ||
        (selectedMention?.displayName ? `@${selectedMention.displayName}` : "")
    ).trim();
    const selectedHandleToken = String(
      selectedMention?.mentionToken ||
        (selectedMention?.username ? `@${selectedMention.username}` : "")
    ).trim();
    const appearsInMessage =
      (selectedDisplayToken && normalizedMessageText.includes(selectedDisplayToken)) ||
      (selectedHandleToken && normalizedMessageText.includes(selectedHandleToken));
    if (!appearsInMessage) {
      return;
    }

    selectedMentionUserIds.add(userId);
    addCandidateToPayload(selectedMention);
  });

  if (!Array.isArray(mentionCandidates) || !mentionCandidates.length) {
    return Array.from(mentionPayloadByUserId.values());
  }

  const mentionedHandles = new Set(extractMentionHandlesFromText(normalizedMessageText));

  mentionCandidates
    .filter((candidate) => {
      const candidateHandles = Array.isArray(candidate?.handles)
        ? candidate.handles
        : [candidate?.username];
      const normalizedUserId = String(candidate?.userId || "").trim();
      if (selectedMentionUserIds.has(normalizedUserId)) {
        return true;
      }

      const displayMentionToken = String(
        candidate?.displayMentionToken || `@${candidate?.displayName || ""}`
      ).trim();
      const appearsViaDisplayToken =
        displayMentionToken && normalizedMessageText.includes(displayMentionToken);
      if (appearsViaDisplayToken) {
        return true;
      }

      return candidateHandles.some((handle) => {
        const normalizedHandle = String(handle || "").toLowerCase();
        return normalizedHandle && mentionedHandles.has(normalizedHandle);
      });
    })
    .forEach((candidate) => addCandidateToPayload(candidate));

  return Array.from(mentionPayloadByUserId.values());
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
  const effectiveCaretOffset =
    caretOffset == null ? String(text || "").length : caretOffset;

  const prefixText = String(text || "").slice(0, effectiveCaretOffset);
  const triggerStart = prefixText.lastIndexOf("@");

  if (triggerStart < 0) {
    return closeMentionState();
  }

  const previousChar = triggerStart > 0 ? prefixText[triggerStart - 1] : "";
  if (previousChar && /[A-Za-z0-9._-]/.test(previousChar)) {
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
    caretOffset: effectiveCaretOffset,
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
  onOpenAddMember,
}) {
  const scrollRef = useRef(null);
  const messageScrollContainerRef = useRef(null);
  const inputMessage = useRef(null);
  const messageSearchInputRef = useRef(null);
  const composerSelectionRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const voiceOptionPickerRef = useRef(null);
  const voiceRecorderRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceTimerRef = useRef(null);
  const voiceAutoStopTimeoutRef = useRef(null);
  const voiceRecordingStartedAtRef = useRef(null);
  const isStoppingVoiceRecordingRef = useRef(false);
  const voiceCancelPendingRef = useRef(false);
  const voiceMimeTypeRef = useRef("");
  const voicePreviewUrlRef = useRef(null);
  const voicePreviewAudioRef = useRef(null);
  const dictationRecorderRef = useRef(null);
  const dictationStreamRef = useRef(null);
  const dictationChunksRef = useRef([]);
  const dictationTimerRef = useRef(null);
  const dictationAutoStopTimeoutRef = useRef(null);
  const dictationStartedAtRef = useRef(null);
  const dictationMimeTypeRef = useRef("");
  const dictationCancelPendingRef = useRef(false);
  const selectedAttachmentsRef = useRef([]);
  const messagesRef = useRef([]);
  const typingStateRef = useRef(false);
  const typingDebounceTimeoutRef = useRef(null);
  const typingIdleTimeoutRef = useRef(null);
  const remoteTypingTimeoutsRef = useRef(new Map());
  const groupCallStatusRequestedRef = useRef(new Set());
  const lastMarkedSeenRef = useRef({
    conversationId: null,
    lastReadMessageId: null,
  });
  const lastMarkedDeliveredRef = useRef({
    conversationId: null,
    lastDeliveredMessageId: null,
  });
  const markCursorSyncTimeoutRef = useRef(null);
  const markCursorSyncInFlightRef = useRef(false);
  const markCursorSyncPendingRef = useRef(false);
  const cursorSyncChannelRef = useRef(null);
  const composerInputRowRef = useRef(null);
  const cursorSyncTabIdRef = useRef(
    `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );
  const [messages, setMessages] = useState([]);
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [activeMessageSearchIndex, setActiveMessageSearchIndex] = useState(-1);
  const [memberReadStates, setMemberReadStates] = useState([]);
  const [openReadReceiptTooltipMessageId, setOpenReadReceiptTooltipMessageId] =
    useState(null);
  const [openReactionDetails, setOpenReactionDetails] = useState(null);
  const [menuControl, setMenuControl] = useState({
    tableIcon: false,
  });
  const [selectedAttachments, setSelectedAttachments] = useState([]);
  const [voiceRecorderState, setVoiceRecorderState] = useState("idle");
  const [voiceRecordingMs, setVoiceRecordingMs] = useState(0);
  const [voicePreview, setVoicePreview] = useState(null);
  const [voicePreviewPlaybackMs, setVoicePreviewPlaybackMs] = useState(0);
  const [isVoicePreviewPlaying, setIsVoicePreviewPlaying] = useState(false);
  const [dictationState, setDictationState] = useState("idle");
  const [dictationRecordingMs, setDictationRecordingMs] = useState(0);
  const [dictationJobId, setDictationJobId] = useState(null);
  const [dictationError, setDictationError] = useState("");
  const [isVoiceOptionOpen, setIsVoiceOptionOpen] = useState(false);
  const [activeIconSend, setActiveIconSend] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [mentionState, setMentionState] = useState(() => closeMentionState());
  const [mentionPanelPosition, setMentionPanelPosition] = useState({
    left: 16,
    bottom: 72,
    width: 360,
  });
  const [groupCallStatusById, setGroupCallStatusById] = useState(new Map());
  const [selectedComposerMentions, setSelectedComposerMentions] = useState([]);
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
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [isReminderSubmitting, setIsReminderSubmitting] = useState(false);
  const [reminderError, setReminderError] = useState("");
  const [reminderNotice, setReminderNotice] = useState("");
  const [reminderDraft, setReminderDraft] = useState(() => ({
    title: "",
    description: "",
    remindAtLocal: buildDefaultReminderLocalValue(),
    timezone: resolveBrowserTimeZone(),
  }));
  const [conversationReminderState, setConversationReminderState] = useState({
    loading: false,
    error: "",
    items: [],
    conversationId: null,
  });
  const [conversationReminderActionLoadingById, setConversationReminderActionLoadingById] =
    useState({});
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
  const [composerDetectedUrl, setComposerDetectedUrl] = useState("");
  const [dismissedComposerPreviewUrl, setDismissedComposerPreviewUrl] = useState("");
  const [selectedContactProfile, setSelectedContactProfile] = useState(null);
  const [isSendingFriendRequest, setIsSendingFriendRequest] = useState(false);
  const forwardNoticeTimeoutRef = useRef(null);
  const reminderNoticeTimeoutRef = useRef(null);
  const messageActionMenuRefs = useRef(new Map());
  const { userData } = useContext(UserContext);
  const {
    conversations,
    archivedConversations,
    selectedConversationId,
    currentConversationNormalized,
    upsertConversation,
    updateConversationById,
  } = useContext(ContactContext);
  const { fetchBatchPresence, getPresenceForUser } = useContext(PresenceContext);
  const { getJobRealtime } = useContext(MessageProcessingContext);
  const currentUserId = userData?.userId || userData?._id || null;
  const dictationRealtimeEvent = getJobRealtime(dictationJobId);
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
  const activeConversationType = resolveConversationType(activeConversation?.type);
  const isAiConversation =
    String(activeConversation?.id || "") === "AI_ASSISTANT" ||
    activeConversationType === "ai";
  const hasMultipleOtherMembers =
    Array.isArray(activeConversation?.members) && activeConversation.members.length >= 2;
  const hasGroupFlag =
    Boolean(activeConversation?.isGroup) ||
    Boolean(activeConversation?.raw?.isGroup) ||
    Boolean(activeConversation?.groupId) ||
    Boolean(activeConversation?.raw?.groupId);
  const isGroupConversation =
    activeConversationType === "group" ||
    hasGroupFlag ||
    (!activeConversation?.peerUserId && hasMultipleOtherMembers);
  const isPrivateConversation = !isGroupConversation;

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
  const directPeerUserId =
    activeConversation?.peerUserId || activeConversation?.raw?.peerUserId || null;
  const peerUserId = isPrivateConversation ? directPeerUserId : null;
  const mentionFeatureEnabled = Boolean(
    backendConversationId && (isGroupConversation || !directPeerUserId)
  );
  const peerPresence = useMemo(
    () => (peerUserId ? getPresenceForUser(peerUserId) : null),
    [getPresenceForUser, peerUserId]
  );
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
    (isGroupConversation
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
        "--conversation-background-color": "transparent",
        "--conversation-background-image": `url(${conversationBackgroundImageUrl})`,
      }
    : {
        "--conversation-background-color": conversationBackgroundColor,
        "--conversation-background-image": "none",
      };

  useEffect(() => {
    if (!isPrivateConversation || !peerUserId) {
      return;
    }
    fetchBatchPresence([peerUserId]).catch((error) => {
      console.error("Failed to fetch peer presence:", error);
    });
  }, [fetchBatchPresence, isPrivateConversation, peerUserId]);

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
  const composerLinkUrl = useMemo(() => {
    const directTextUrl = normalizeUrlForPreview(
      trimUrlToken(extractFirstUrlFromText(draftText))
    );
    if (directTextUrl) {
      return directTextUrl;
    }
    return normalizeUrlForPreview(trimUrlToken(composerDetectedUrl));
  }, [composerDetectedUrl, draftText]);
  const activeComposerPreviewUrl = useMemo(() => {
    if (!composerLinkUrl) {
      return "";
    }
    if (String(composerLinkUrl) === String(dismissedComposerPreviewUrl)) {
      return "";
    }
    return composerLinkUrl;
  }, [composerLinkUrl, dismissedComposerPreviewUrl]);
  const composerLinkPreview = activeComposerPreviewUrl
    ? linkPreviewByUrl[activeComposerPreviewUrl]
    : null;
  const isComposerLinkPreviewLoading = Boolean(
    activeComposerPreviewUrl &&
      linkPreviewByUrl[activeComposerPreviewUrl] === undefined
  );
  const composerPreviewTargetUrl = useMemo(
    () =>
      normalizeUrlForPreview(
        trimUrlToken(composerLinkPreview?.url || activeComposerPreviewUrl)
      ) || activeComposerPreviewUrl,
    [activeComposerPreviewUrl, composerLinkPreview?.url]
  );
  const composerLinkPreviewImage = useMemo(
    () =>
      String(
        composerLinkPreview?.image ||
          composerLinkPreview?.thumbnailUrl ||
          composerLinkPreview?.thumbnail ||
          composerLinkPreview?.imageUrl ||
          ""
      ).trim(),
    [
      composerLinkPreview?.image,
      composerLinkPreview?.thumbnailUrl,
      composerLinkPreview?.thumbnail,
      composerLinkPreview?.imageUrl,
    ]
  );
  const composerPreviewHost = useMemo(() => {
    if (composerLinkPreview?.host) {
      return String(composerLinkPreview.host).replace(/^www\./i, "");
    }
    return resolvePreviewHost(composerPreviewTargetUrl);
  }, [composerPreviewTargetUrl, composerLinkPreview?.host]);
  const composerPresetLinkPreview = useMemo(
    () => getPresetLinkPreviewByHost(composerPreviewHost),
    [composerPreviewHost]
  );
  const effectiveComposerLinkPreviewImage =
    composerLinkPreviewImage || composerPresetLinkPreview?.image || "";
  const composerLinkPreviewTitle = useMemo(
    () =>
      String(
        composerLinkPreview?.title ||
          composerPresetLinkPreview?.title ||
          composerLinkPreview?.siteName ||
          composerPreviewHost ||
          composerPreviewTargetUrl ||
          ""
      ).trim(),
    [
      composerLinkPreview?.title,
      composerPresetLinkPreview?.title,
      composerLinkPreview?.siteName,
      composerPreviewHost,
      composerPreviewTargetUrl,
    ]
  );
  const composerLinkPreviewDescription = useMemo(
    () =>
      String(
        composerLinkPreview?.description ||
          composerLinkPreview?.summary ||
          composerPresetLinkPreview?.description ||
          ""
      ).trim(),
    [
      composerLinkPreview?.description,
      composerLinkPreview?.summary,
      composerPresetLinkPreview?.description,
    ]
  );

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
              displayName:
                String(member.nickname || "").trim() ||
                member.displayName ||
                member.username ||
                "",
              avatarUrl: resolveMemberAvatarUrl(member),
              username: member.username || "",
              nickname: String(member.nickname || "").trim(),
            },
          ])
      ),
    [conversationMembers]
  );
  const readStateByUserId = useMemo(
    () => createReadStateByUserIdMap(memberReadStates),
    [memberReadStates]
  );
  const upsertMemberReadState = useCallback((nextState) => {
    if (!nextState?.userId) {
      return;
    }

    const normalizedUserId = String(nextState.userId);
    setMemberReadStates((prevStates) => {
      const nextStateMap = createReadStateByUserIdMap(prevStates);
      const currentState = nextStateMap.get(normalizedUserId) || null;
      const mergedState = mergeConversationReadStateEntry(currentState, {
        ...nextState,
        userId: normalizedUserId,
      });

      if (!mergedState) {
        return prevStates;
      }

      nextStateMap.set(normalizedUserId, mergedState);
      return Array.from(nextStateMap.values());
    });
  }, []);
  const publishLocalCursorSync = useCallback(
    ({
      conversationId,
      lastReadMessageId = null,
      lastDeliveredMessageId = null,
      readAt = null,
      deliveredAt = null,
    }) => {
      if (
        !conversationId ||
        String(conversationId) === "AI_ASSISTANT" ||
        typeof window === "undefined"
      ) {
        return;
      }

      const payload = {
        conversationId: String(conversationId),
        lastReadMessageId: parseReadCursorMessageId(lastReadMessageId),
        lastDeliveredMessageId: parseReadCursorMessageId(lastDeliveredMessageId),
        readAt: readAt || null,
        deliveredAt: deliveredAt || null,
        tabId: cursorSyncTabIdRef.current,
        updatedAt: new Date().toISOString(),
      };

      if (cursorSyncChannelRef.current) {
        try {
          cursorSyncChannelRef.current.postMessage(payload);
        } catch (error) {
          console.warn("Failed to broadcast cursor sync via BroadcastChannel:", error);
        }
      }

      try {
        window.localStorage.setItem(
          MESSAGE_CURSOR_SYNC_STORAGE_KEY,
          JSON.stringify(payload)
        );
      } catch {
        // Storage is best-effort fallback for tabs without BroadcastChannel.
      }
    },
    []
  );
  const applyExternalCursorSync = useCallback(
    (payload) => {
      if (!payload || typeof payload !== "object") {
        return;
      }

      const payloadConversationId = String(payload.conversationId || "");
      if (
        !payloadConversationId ||
        payloadConversationId !== String(backendConversationId || "") ||
        payload.tabId === cursorSyncTabIdRef.current
      ) {
        return;
      }

      const incomingLastDeliveredMessageId = parseReadCursorMessageId(
        payload.lastDeliveredMessageId
      );
      if (incomingLastDeliveredMessageId != null) {
        const currentDeliveredState = lastMarkedDeliveredRef.current;
        const currentDeliveredCursor = parseReadCursorMessageId(
          currentDeliveredState?.lastDeliveredMessageId
        );
        if (isCursorAdvanced(incomingLastDeliveredMessageId, currentDeliveredCursor)) {
          lastMarkedDeliveredRef.current = {
            conversationId: payloadConversationId,
            lastDeliveredMessageId: incomingLastDeliveredMessageId,
          };
        }

        if (currentUserId) {
          upsertMemberReadState({
            conversationId: payloadConversationId,
            userId: currentUserId,
            lastDeliveredMessageId: incomingLastDeliveredMessageId,
            deliveredAt: payload.deliveredAt || payload.updatedAt || null,
          });
        }
      }

      const incomingLastReadMessageId = parseReadCursorMessageId(
        payload.lastReadMessageId
      );
      if (incomingLastReadMessageId != null) {
        const currentSeenState = lastMarkedSeenRef.current;
        const currentSeenCursor = parseReadCursorMessageId(
          currentSeenState?.lastReadMessageId
        );
        if (isCursorAdvanced(incomingLastReadMessageId, currentSeenCursor)) {
          lastMarkedSeenRef.current = {
            conversationId: payloadConversationId,
            lastReadMessageId: incomingLastReadMessageId,
          };
        }

        if (currentUserId) {
          upsertMemberReadState({
            conversationId: payloadConversationId,
            userId: currentUserId,
            lastReadMessageId: incomingLastReadMessageId,
            lastReadAt: payload.readAt || payload.updatedAt || null,
          });
        }
      }
    },
    [backendConversationId, currentUserId, upsertMemberReadState]
  );
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleStorage = (event) => {
      if (event.key !== MESSAGE_CURSOR_SYNC_STORAGE_KEY || !event.newValue) {
        return;
      }

      try {
        const payload = JSON.parse(event.newValue);
        applyExternalCursorSync(payload);
      } catch {
        // Ignore malformed localStorage payload.
      }
    };

    window.addEventListener("storage", handleStorage);

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(MESSAGE_CURSOR_SYNC_CHANNEL);
      channel.onmessage = (event) => {
        applyExternalCursorSync(event?.data);
      };
      cursorSyncChannelRef.current = channel;

      return () => {
        window.removeEventListener("storage", handleStorage);
        try {
          channel.close();
        } catch {
          // No-op.
        }
        if (cursorSyncChannelRef.current === channel) {
          cursorSyncChannelRef.current = null;
        }
      };
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [applyExternalCursorSync]);
  const mentionCandidates = useMemo(() => {
    if (!mentionFeatureEnabled) {
      return [];
    }

    const fallbackMembersFromReadState = (Array.isArray(memberReadStates) ? memberReadStates : [])
      .filter((stateItem) => stateItem?.userId)
      .map((stateItem) => ({
        userId: stateItem.userId,
        username: stateItem.username || "",
        displayName: stateItem.displayName || "",
        nickname: "",
        avatarUrl: stateItem.avatarUrl || "",
      }));
    const fallbackMembersFromMessageSenders = (Array.isArray(messages) ? messages : [])
      .filter((messageItem) => messageItem?.senderId)
      .map((messageItem) => ({
        userId: messageItem.senderId,
        username:
          messageItem?.raw?.sender?.username ||
          messageItem?.raw?.senderUsername ||
          messageItem?.raw?.username ||
          "",
        displayName:
          messageItem.senderDisplayName ||
          messageItem?.raw?.senderDisplayName ||
          messageItem?.raw?.sender?.displayName ||
          "",
        nickname: "",
        avatarUrl:
          messageItem.senderAvatarUrl ||
          messageItem?.raw?.senderAvatarUrl ||
          messageItem?.raw?.sender?.avatarUrl ||
          "",
      }));

    const sourceMembers = conversationMembers.length
      ? conversationMembers
      : [...fallbackMembersFromReadState, ...fallbackMembersFromMessageSenders];
    const seenUserIds = new Set();
    const usedHandles = new Set();
    let skippedMissingHandleCount = 0;

    const buildUniqueHandle = (baseHandle) => {
      const normalizedBaseHandle = normalizeMentionHandle(baseHandle);
      if (!normalizedBaseHandle) {
        return "";
      }

      let nextHandle = normalizedBaseHandle;
      let suffix = 2;
      while (usedHandles.has(nextHandle.toLowerCase())) {
        nextHandle = `${normalizedBaseHandle}.${suffix}`;
        suffix += 1;
      }
      usedHandles.add(nextHandle.toLowerCase());
      return nextHandle;
    };

    const nextCandidates = sourceMembers
      .filter((member) => member?.userId)
      .filter((member) => String(member.userId) !== String(currentUserId))
      .map((member) => {
        const normalizedUserId = String(member.userId || "").trim();
        const primaryHandle = buildUniqueHandle(
          normalizeMentionHandle(member.username) ||
            normalizeMentionHandle(resolveMemberUsername(member)) ||
            normalizeMentionHandleFromLabel(member.nickname) ||
            normalizeMentionHandleFromLabel(member.displayName) ||
            normalizeMentionHandle(normalizedUserId)
        );

        if (!primaryHandle) {
          skippedMissingHandleCount += 1;
          return null;
        }

        const candidateHandles = Array.from(
          new Set(
            [
              primaryHandle,
              normalizeMentionHandle(member.username),
              normalizeMentionHandle(resolveMemberUsername(member)),
              normalizeMentionHandleFromLabel(member.nickname),
              normalizeMentionHandleFromLabel(member.displayName),
              normalizeMentionHandle(normalizedUserId),
            ]
              .filter(Boolean)
              .map((value) => value.toLowerCase())
          )
        );

        return {
          userId: member.userId,
          displayName:
            String(member.nickname || "").trim() ||
            member.displayName ||
            member.username ||
            primaryHandle,
          username: primaryHandle,
          mentionToken: `@${primaryHandle}`,
          displayMentionToken: `@${
            String(member.nickname || "").trim() ||
            member.displayName ||
            member.username ||
            primaryHandle
          }`,
          avatarUrl: resolveMemberAvatarUrl(member) || member.avatarUrl || "",
          handles: candidateHandles,
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
      source: conversationMembers.length
        ? "canonical-members"
        : "member-read-message-fallback",
      memberCount: conversationMembers.length,
      fallbackMemberCount: fallbackMembersFromReadState.length,
      fallbackSenderCount: fallbackMembersFromMessageSenders.length,
      candidateCount: nextCandidates.length,
      skippedMissingHandleCount,
      candidates: nextCandidates.map((candidate) => ({
        userId: candidate.userId,
        username: candidate.username,
        handles: candidate.handles,
        displayName: candidate.displayName,
      })),
    });

    return nextCandidates;
  }, [
    backendConversationId,
    conversationMembers,
    currentUserId,
    mentionFeatureEnabled,
    memberReadStates,
    messages,
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
        const handles = Array.isArray(candidate.handles) ? candidate.handles : [];
        return (
          !normalizedQuery ||
          username.includes(normalizedQuery) ||
          displayName.includes(normalizedQuery) ||
          handles.some((handle) => handle.includes(normalizedQuery))
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
  const updateMentionPanelPosition = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const anchor = composerInputRowRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const width = Math.min(360, Math.max(260, rect.width - 24, viewportWidth - 32));
    const left = Math.min(
      Math.max(rect.left + 12, 12),
      Math.max(12, viewportWidth - width - 12)
    );
    const bottom = Math.min(
      Math.max(viewportHeight - rect.top + 8, 56),
      Math.max(56, viewportHeight - 20)
    );

    setMentionPanelPosition({ left, bottom, width });
  }, []);

  useEffect(() => {
    if (!mentionState.open) {
      return undefined;
    }

    updateMentionPanelPosition();
    window.addEventListener("resize", updateMentionPanelPosition);
    window.addEventListener("scroll", updateMentionPanelPosition, true);

    return () => {
      window.removeEventListener("resize", updateMentionPanelPosition);
      window.removeEventListener("scroll", updateMentionPanelPosition, true);
    };
  }, [
    matchedMentionCandidates.length,
    mentionState.open,
    selectedAttachments.length,
    updateMentionPanelPosition,
  ]);
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
      const isGroupConversation =
        String(activeConversation?.type || "").toLowerCase() === "group";
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
          (isGroupConversation
            ? fallbackIdentity?.displayName || dtoDisplayName
            : dtoDisplayName || fallbackIdentity?.displayName) ||
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
      activeConversation?.type,
      backendConversationId,
      currentUserAvatar,
      currentUserDisplayName,
      currentUserId,
      memberIdentityMap,
    ]
  );
  const resolveReadStateIdentity = useCallback(
    (userId) => {
      const normalizedUserId = String(userId || "");
      if (!normalizedUserId) {
        return {
          displayName: "Người dùng",
          avatarUrl: "",
        };
      }

      if (normalizedUserId === String(currentUserId || "")) {
        return {
          displayName: currentUserDisplayName || "Bạn",
          avatarUrl: currentUserAvatar || "",
        };
      }

      const memberIdentity = memberIdentityMap.get(normalizedUserId);
      if (memberIdentity) {
        return {
          displayName: memberIdentity.displayName || "Người dùng",
          avatarUrl: memberIdentity.avatarUrl || "",
        };
      }

      if (
        isPrivateConversation &&
        peerUserId &&
        normalizedUserId === String(peerUserId)
      ) {
        return {
          displayName: getConversationDisplayName(activeConversation) || "Người dùng",
          avatarUrl: getConversationAvatarUrl(activeConversation) || "",
        };
      }

      return {
        displayName: normalizedUserId,
        avatarUrl: "",
      };
    },
    [
      activeConversation,
      currentUserAvatar,
      currentUserDisplayName,
      currentUserId,
      isPrivateConversation,
      memberIdentityMap,
      peerUserId,
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

  useEffect(() => {
    const handleForwardGalleryImage = (event) => {
      const image = event?.detail?.image || null;
      if (!image?.url) {
        return;
      }

      handleOpenForwardPicker({
        id: image.messageId || image.id || image.url,
        content: "",
        type: "IMAGE",
        senderDisplayName: image.senderDisplayName || getConversationDisplayName(activeConversation),
        attachments: [
          {
            id: image.id || image.messageId || image.url,
            url: image.url,
            storageKey: image.storageKey || "",
            fileName: image.fileName || "Ảnh đã chia sẻ",
            contentType: image.contentType || "image/*",
            fileSize: image.fileSize || 0,
            type: "IMAGE",
          },
        ],
      });
    };

    window.addEventListener("web:gallery-forward-image", handleForwardGalleryImage);
    return () => {
      window.removeEventListener("web:gallery-forward-image", handleForwardGalleryImage);
    };
  }, [activeConversation, handleOpenForwardPicker]);

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
        lastMessageSenderId: currentUserId,
        lastMessageTime: response?.createdAt || new Date().toISOString(),
        unreadCount: 0,
      });

      clearForwardState();
      setForwardNotice(
        `Đã chuyển tiếp tới ${getConversationDisplayName(targetConversation)}.`
      );
    } catch (error) {
      console.error("[WEB FORWARD ERROR]", {
        error,
        status: error?.response?.status || null,
        response: error?.response?.data || null,
      });
      setActionError(
        error?.response?.data?.message ||
          "Không thể chuyển tiếp tin nhắn này."
      );
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

    if (!composer) {
      return;
    }

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (composer.contains(range.commonAncestorContainer)) {
        composerSelectionRef.current = range.cloneRange();
      }
    }

    if (mentionFeatureEnabled) {
      const currentComposerValue = composer.textContent || "";
      setMentionState(
        resolveActiveMentionQuery(
          currentComposerValue,
          getComposerCaretTextOffset(composer)
        )
      );
    }
  }, [mentionFeatureEnabled]);

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
    const detectedUrl = extractFirstUrlFromComposerNode(composer);
    setDraftText(currentText);
    setComposerDetectedUrl(detectedUrl);
    setSelectedComposerMentions((prevState) => {
      if (!Array.isArray(prevState) || !prevState.length) {
        return prevState;
      }

      const normalizedComposerText = String(currentComposerValue || "");
      const nextState = prevState.filter((item) => {
        const displayToken = String(
          item?.displayMentionToken ||
            item?.displayToken ||
            (item?.displayName ? `@${item.displayName}` : "")
        ).trim();
        const handleToken = String(
          item?.mentionToken || (item?.username ? `@${item.username}` : "")
        ).trim();
        return (
          (displayToken && normalizedComposerText.includes(displayToken)) ||
          (handleToken && normalizedComposerText.includes(handleToken))
        );
      });

      return nextState.length === prevState.length ? prevState : nextState;
    });
    setMentionState(
      mentionFeatureEnabled
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
    backendConversationId,
    mentionFeatureEnabled,
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
    setComposerDetectedUrl("");
    setActiveIconSend(false);
    setDismissedComposerPreviewUrl("");
    setMentionState(closeMentionState());
    setSelectedComposerMentions([]);

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
        lastMessageSenderId: currentUserId,
        lastMessageTime: updatedAt || new Date().toISOString(),
        unreadCount: 0,
      });
    },
    [backendConversationId, currentUserId, updateConversationById]
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
    if (composerLinkUrl) {
      return;
    }
    if (dismissedComposerPreviewUrl) {
      setDismissedComposerPreviewUrl("");
    }
  }, [composerLinkUrl, dismissedComposerPreviewUrl]);

  useEffect(() => {
    if (!activeComposerPreviewUrl) {
      return;
    }
    if (linkPreviewByUrl[activeComposerPreviewUrl] !== undefined) {
      return;
    }

    let isCancelled = false;
    getLinkPreview(activeComposerPreviewUrl)
      .then((payload) => {
        if (isCancelled) {
          return;
        }
        setLinkPreviewByUrl((prevState) => ({
          ...prevState,
          [activeComposerPreviewUrl]: {
            title: payload?.title || "",
            description: payload?.description || "",
            image: payload?.image || "",
            url: payload?.url || activeComposerPreviewUrl,
            host:
              payload?.host ||
              resolvePreviewHost(payload?.url || activeComposerPreviewUrl),
          },
        }));
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }
        setLinkPreviewByUrl((prevState) => ({
          ...prevState,
          [activeComposerPreviewUrl]: null,
        }));
      });

    return () => {
      isCancelled = true;
    };
  }, [activeComposerPreviewUrl, linkPreviewByUrl]);

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
    setIsVoiceOptionOpen(false);
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
      if (!event.target.closest(".message-reaction-summary-wrap")) {
        setOpenReactionDetails(null);
      }

      if (
        voiceOptionPickerRef.current &&
        !voiceOptionPickerRef.current.contains(event.target)
      ) {
        setIsVoiceOptionOpen(false);
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
      if (reminderNoticeTimeoutRef.current) {
        clearTimeout(reminderNoticeTimeoutRef.current);
      }

      remoteTypingTimeoutsRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      remoteTypingTimeoutsRef.current.clear();

      if (voiceTimerRef.current) {
        clearInterval(voiceTimerRef.current);
        voiceTimerRef.current = null;
      }
      if (voiceAutoStopTimeoutRef.current) {
        clearTimeout(voiceAutoStopTimeoutRef.current);
        voiceAutoStopTimeoutRef.current = null;
      }
      if (voicePreviewUrlRef.current) {
        URL.revokeObjectURL(voicePreviewUrlRef.current);
        voicePreviewUrlRef.current = null;
      }
      if (voiceStreamRef.current) {
        voiceStreamRef.current.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
      }
      if (dictationTimerRef.current) {
        clearInterval(dictationTimerRef.current);
        dictationTimerRef.current = null;
      }
      if (dictationAutoStopTimeoutRef.current) {
        clearTimeout(dictationAutoStopTimeoutRef.current);
        dictationAutoStopTimeoutRef.current = null;
      }
      if (dictationStreamRef.current) {
        dictationStreamRef.current.getTracks().forEach((track) => track.stop());
        dictationStreamRef.current = null;
      }
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
    setOpenReactionDetails(null);
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
    setVoicePreview((previousPreview) => {
      if (previousPreview?.previewUrl) {
        URL.revokeObjectURL(previousPreview.previewUrl);
      }
      voicePreviewUrlRef.current = null;
      return null;
    });
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (voiceAutoStopTimeoutRef.current) {
      clearTimeout(voiceAutoStopTimeoutRef.current);
      voiceAutoStopTimeoutRef.current = null;
    }
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }
    voiceRecorderRef.current = null;
    voiceChunksRef.current = [];
    voiceMimeTypeRef.current = "";
    voiceRecordingStartedAtRef.current = null;
    voiceCancelPendingRef.current = false;
    isStoppingVoiceRecordingRef.current = false;
    setVoiceRecorderState("idle");
    setVoiceRecordingMs(0);
    if (dictationTimerRef.current) {
      clearInterval(dictationTimerRef.current);
      dictationTimerRef.current = null;
    }
    if (dictationAutoStopTimeoutRef.current) {
      clearTimeout(dictationAutoStopTimeoutRef.current);
      dictationAutoStopTimeoutRef.current = null;
    }
    if (dictationStreamRef.current) {
      dictationStreamRef.current.getTracks().forEach((track) => track.stop());
      dictationStreamRef.current = null;
    }
    dictationRecorderRef.current = null;
    dictationChunksRef.current = [];
    dictationStartedAtRef.current = null;
    dictationMimeTypeRef.current = "";
    setDictationState("idle");
    setDictationRecordingMs(0);
    setDictationJobId(null);
    setDictationError("");
    setIsReminderModalOpen(false);
    setIsReminderSubmitting(false);
    setReminderError("");
    setReminderDraft({
      title: "",
      description: "",
      remindAtLocal: buildDefaultReminderLocalValue(),
      timezone: resolveBrowserTimeZone(),
    });
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
    if (!reminderNotice) {
      return undefined;
    }

    if (reminderNoticeTimeoutRef.current) {
      clearTimeout(reminderNoticeTimeoutRef.current);
    }

    reminderNoticeTimeoutRef.current = setTimeout(() => {
      setReminderNotice("");
    }, 2200);

    return () => {
      if (reminderNoticeTimeoutRef.current) {
        clearTimeout(reminderNoticeTimeoutRef.current);
      }
    };
  }, [reminderNotice]);

  useEffect(() => {
    const fetchMessages = async () => {
      setActionError("");
      setEditingMessageId(null);

      if (!backendConversationId || backendConversationId === "AI_ASSISTANT") {
        if (!backendConversationId) {
          setMessages([]);
        }
        setMemberReadStates([]);
        lastMarkedSeenRef.current = {
          conversationId: backendConversationId || null,
          lastReadMessageId: null,
        };
        lastMarkedDeliveredRef.current = {
          conversationId: backendConversationId || null,
          lastDeliveredMessageId: null,
        };
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
        setMemberReadStates(Array.isArray(page.memberReadStates) ? page.memberReadStates : []);
        setIsContextMode(false);
        setContextLatestMessageId(page.items.length ? page.items[page.items.length - 1].id : null);
        setNewMessagesSinceContext(0);
        const latestMessageId = page.items.length
          ? parseReadCursorMessageId(page.items[page.items.length - 1].id)
          : null;
        await markConversationDelivered(backendConversationId, {
          lastDeliveredMessageId: latestMessageId,
        });
        lastMarkedDeliveredRef.current = {
          conversationId: backendConversationId,
          lastDeliveredMessageId: latestMessageId,
        };
        await markConversationSeen(backendConversationId, {
          lastReadMessageId: latestMessageId,
        });
        lastMarkedSeenRef.current = {
          conversationId: backendConversationId,
          lastReadMessageId: latestMessageId,
        };
        publishLocalCursorSync({
          conversationId: backendConversationId,
          lastReadMessageId: latestMessageId,
          lastDeliveredMessageId: latestMessageId,
          readAt: new Date().toISOString(),
          deliveredAt: new Date().toISOString(),
        });
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
  }, [backendConversationId, currentUserId, publishLocalCursorSync, updateConversationById]);

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
            const mappedSystemMessage = parseSystemMessage(mappedMessage?.content);
            const mappedSystemKind = String(mappedSystemMessage?.kind || "");
            const mappedSystemPayload = mappedSystemMessage?.payload || {};
            const mappedConversationId =
              mappedMessage?.conversationId || event.payload?.conversationId || backendConversationId;
            const messageId = mappedMessage?.id || event.payload?.id;
            const isAlreadyVisible = messagesRef.current.some(
              (message) => String(message?.id || "") === String(messageId || "")
            );

            if (
              mappedConversationId &&
              mappedSystemKind === "group_renamed" &&
              String(mappedSystemPayload?.name || "").trim()
            ) {
              const nextGroupName = String(mappedSystemPayload.name || "").trim();
              updateConversationById(mappedConversationId, {
                name: nextGroupName,
                displayName: nextGroupName,
                trustedDisplayName: nextGroupName,
              });
            }

            if (
              mappedConversationId &&
              mappedSystemKind === "group_avatar_changed" &&
              String(mappedSystemPayload?.avatarUrl || "").trim()
            ) {
              const nextAvatarUrl = String(mappedSystemPayload.avatarUrl || "").trim();
              updateConversationById(mappedConversationId, {
                avatarUrl: nextAvatarUrl,
                trustedAvatarUrl: nextAvatarUrl,
              });
            }

            if (
              mappedConversationId &&
              mappedSystemKind === "group_nickname_changed" &&
              mappedSystemPayload?.targetUserId
            ) {
              const targetUserId = String(mappedSystemPayload.targetUserId);
              const nickname = String(mappedSystemPayload.nickname || "").trim();
              updateConversationById(mappedConversationId, (currentConversation) => {
                const currentMembers = Array.isArray(currentConversation?.members)
                  ? currentConversation.members
                  : [];

                if (!currentMembers.length) {
                  return currentConversation;
                }

                return {
                  __memberMergeMode: "replace",
                  members: currentMembers.map((member) =>
                    String(member?.userId || "") === targetUserId
                      ? {
                          ...member,
                          nickname,
                        }
                      : member
                  ),
                };
              });
            }

            if (isReminderSystemMessage(mappedMessage)) {
              window.dispatchEvent(
                new CustomEvent("web:conversation-reminder-changed", {
                  detail: { conversationId: mappedConversationId },
                })
              );
            }

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
            return;
          }

          if (event.type === "MESSAGE_DELIVERY_UPDATED") {
            const payload =
              event.payload && typeof event.payload === "object"
                ? event.payload
                : {};
            const payloadConversationId = String(
              payload.conversationId || backendConversationId || ""
            );
            if (
              !payload.userId ||
              payloadConversationId !== String(backendConversationId || "")
            ) {
              return;
            }

            const payloadLastDeliveredMessageId = parseReadCursorMessageId(
              payload.lastDeliveredMessageId
            );
            if (payloadLastDeliveredMessageId == null) {
              return;
            }

            upsertMemberReadState({
              conversationId: payload.conversationId || backendConversationId,
              userId: payload.userId,
              lastDeliveredMessageId: payloadLastDeliveredMessageId,
              deliveredAt:
                payload.deliveredAt || payload.lastDeliveredAt || null,
            });
            return;
          }

          if (event.type === "MESSAGE_READ_RECEIPT_UPDATED") {
            const payload =
              event.payload && typeof event.payload === "object"
                ? event.payload
                : {};
            const payloadConversationId = String(
              payload.conversationId || backendConversationId || ""
            );
            if (
              !payload.userId ||
              payloadConversationId !== String(backendConversationId || "")
            ) {
              return;
            }

            const payloadLastReadMessageId = parseReadCursorMessageId(
              payload.lastReadMessageId
            );
            if (payloadLastReadMessageId == null) {
              return;
            }

            upsertMemberReadState({
              conversationId: payload.conversationId || backendConversationId,
              userId: payload.userId,
              lastReadMessageId: payloadLastReadMessageId,
              lastReadAt: payload.readAt || payload.lastReadAt || null,
            });
            return;
          }

          if (event.type === "CONVERSATION_UPDATED") {
            const payloadConversationId =
              event.payload?.id || event.payload?.conversationId || backendConversationId;
            if (!payloadConversationId) {
              return;
            }

            const hasCanonicalConversationPayload = Boolean(
              event.payload?.id ||
                event.payload?.raw?.id ||
                event.payload?.members ||
                event.payload?.type ||
                event.payload?.name ||
                event.payload?.displayName ||
                event.payload?.avatarUrl ||
                event.payload?.groupAvatarUrl
            );

            // Prefer canonical upsert when backend sends conversation metadata,
            // but normalize missing `id` from `conversationId` to avoid dropping updates.
            if (hasCanonicalConversationPayload) {
              const normalizedConversationPayload = event.payload?.id
                ? event.payload
                : {
                    ...(event.payload || {}),
                    id: payloadConversationId,
                  };
              upsertConversation(normalizedConversationPayload);
              return;
            }

            // Fallback for partial payloads broadcast on conversation topic.
            updateConversationById(payloadConversationId, event.payload || {});
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
    updateConversationById,
    upsertMemberReadState,
    upsertConversation,
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

  const markConversationCursorNow = useCallback(async (explicitLatestMessageId = null) => {
    if (
      !backendConversationId ||
      backendConversationId === "AI_ASSISTANT" ||
      markCursorSyncInFlightRef.current
    ) {
      if (markCursorSyncInFlightRef.current) {
        markCursorSyncPendingRef.current = true;
      }
      return;
    }

    const latestVisibleMessageId =
      parseReadCursorMessageId(explicitLatestMessageId) ??
      parseReadCursorMessageId(
        messagesRef.current.length > 0
          ? messagesRef.current[messagesRef.current.length - 1]?.id
          : null
      );

    if (latestVisibleMessageId == null) {
      return;
    }

    const previousMarkedState = lastMarkedSeenRef.current;
    const previousMarkedCursor = parseReadCursorMessageId(
      previousMarkedState?.lastReadMessageId
    );
    const shouldMarkSeen = !(
      String(previousMarkedState?.conversationId || "") ===
        String(backendConversationId || "") &&
      previousMarkedCursor != null &&
      previousMarkedCursor >= latestVisibleMessageId
    );

    const previousDeliveredState = lastMarkedDeliveredRef.current;
    const previousDeliveredCursor = parseReadCursorMessageId(
      previousDeliveredState?.lastDeliveredMessageId
    );
    const shouldMarkDelivered = !(
      String(previousDeliveredState?.conversationId || "") ===
        String(backendConversationId || "") &&
      previousDeliveredCursor != null &&
      previousDeliveredCursor >= latestVisibleMessageId
    );

    if (!shouldMarkSeen && !shouldMarkDelivered) {
      return;
    }

    markCursorSyncInFlightRef.current = true;
    let deliveredAt = null;
    let readAt = null;

    try {
      if (shouldMarkDelivered) {
        try {
          await markConversationDelivered(backendConversationId, {
            lastDeliveredMessageId: latestVisibleMessageId,
          });
          deliveredAt = new Date().toISOString();
          lastMarkedDeliveredRef.current = {
            conversationId: backendConversationId,
            lastDeliveredMessageId: latestVisibleMessageId,
          };
        } catch (error) {
          console.error("Failed to mark conversation as delivered:", error);
        }
      }

      if (shouldMarkSeen) {
        try {
          await markConversationSeen(backendConversationId, {
            lastReadMessageId: latestVisibleMessageId,
          });
          readAt = new Date().toISOString();
          lastMarkedSeenRef.current = {
            conversationId: backendConversationId,
            lastReadMessageId: latestVisibleMessageId,
          };
          console.log("[WEB PHASE2 UNREAD SYNC]", {
            source: "open-conversation-mark-seen",
            conversationId: backendConversationId,
            appliedUnreadCount: 0,
          });
          updateConversationById(backendConversationId, { unreadCount: 0 });
        } catch (error) {
          console.error("Failed to mark conversation as seen:", error);
        }
      }

      if (shouldMarkSeen || shouldMarkDelivered) {
        publishLocalCursorSync({
          conversationId: backendConversationId,
          lastReadMessageId: shouldMarkSeen
            ? latestVisibleMessageId
            : previousMarkedCursor,
          lastDeliveredMessageId: shouldMarkDelivered
            ? latestVisibleMessageId
            : previousDeliveredCursor,
          readAt,
          deliveredAt,
        });
      }
    } finally {
      markCursorSyncInFlightRef.current = false;
      if (markCursorSyncPendingRef.current) {
        markCursorSyncPendingRef.current = false;
        window.setTimeout(() => {
          void markConversationCursorNow();
        }, 0);
      }
    }
  }, [backendConversationId, publishLocalCursorSync, updateConversationById]);
  const scheduleMarkConversationCursor = useCallback(
    (forceImmediate = false, explicitLatestMessageId = null) => {
      if (!backendConversationId || backendConversationId === "AI_ASSISTANT") {
        return;
      }

      if (forceImmediate) {
        if (markCursorSyncTimeoutRef.current) {
          clearTimeout(markCursorSyncTimeoutRef.current);
          markCursorSyncTimeoutRef.current = null;
        }
        void markConversationCursorNow(explicitLatestMessageId);
        return;
      }

      if (markCursorSyncTimeoutRef.current) {
        return;
      }

      markCursorSyncTimeoutRef.current = setTimeout(() => {
        markCursorSyncTimeoutRef.current = null;
        void markConversationCursorNow(explicitLatestMessageId);
      }, MESSAGE_CURSOR_SYNC_THROTTLE_MS);
    },
    [backendConversationId, markConversationCursorNow]
  );
  const handleSeenMess = useCallback(() => {
    scheduleMarkConversationCursor(false);
  }, [scheduleMarkConversationCursor]);
  useEffect(() => {
    return () => {
      if (markCursorSyncTimeoutRef.current) {
        clearTimeout(markCursorSyncTimeoutRef.current);
        markCursorSyncTimeoutRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    setOpenReadReceiptTooltipMessageId(null);
    setSelectedComposerMentions([]);
    markCursorSyncPendingRef.current = false;
    if (markCursorSyncTimeoutRef.current) {
      clearTimeout(markCursorSyncTimeoutRef.current);
      markCursorSyncTimeoutRef.current = null;
    }
  }, [backendConversationId]);

  const handleChangeMenuControl = (event) => {
    if (!guardComposerInteraction()) {
      return;
    }

    const name = event.target.getAttribute("name");
    if (!name) {
      return;
    }

    setIsVoiceOptionOpen(false);
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

  const handleGetGif = async (gif) => {
    if (!guardComposerInteraction() || !gif?.url || !backendConversationId) {
      return;
    }

    const attachmentPayload = {
      url: gif.url,
      storageKey: "",
      fileName: `${gif.id || "gif"}.gif`,
      contentType: "image/gif",
      fileSize: 0,
      type: "IMAGE",
    };

    try {
      setActionError("");
      setMenuControl((prevState) => ({ ...prevState, tableIcon: false }));
      const response = await sendMessageV1({
        conversationId: backendConversationId,
        attachments: [attachmentPayload],
        ...(replyingToMessage?.id ? { replyToMessageId: replyingToMessage.id } : {}),
      });

      const nextMessage = mapMessage(response);
      upsertMessage(nextMessage);
      updateConversationPreview({
        messageText: "Đã gửi GIF",
        attachments: [attachmentPayload],
        updatedAt: nextMessage.editedAt || nextMessage.createdAt,
      });
      setReplyingToMessage(null);
    } catch (error) {
      console.error("Failed to send GIF:", error);
      setActionError("Không thể gửi GIF.");
    }
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

  const appendSelectedAttachmentFiles = useCallback((files) => {
    const nextFiles = Array.from(files || []).filter((file) => file instanceof File);
    if (!nextFiles.length) {
      return false;
    }

    setSelectedAttachments((prevState) => [
      ...prevState,
      ...nextFiles.map((file, index) => buildSelectedAttachment(file, index)),
    ]);

    return true;
  }, []);

  const handleAttachmentPick = (event) => {
    if (!guardComposerInteraction()) {
      event.target.value = "";
      return;
    }

    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    appendSelectedAttachmentFiles(files);
    event.target.value = "";
  };

  const handleComposerPaste = useCallback(
    (event) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return;
      }

      const itemFiles = Array.from(clipboardData.items || [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter(Boolean);
      const clipboardFiles = Array.from(clipboardData.files || []);
      const pastedFiles = itemFiles.length ? itemFiles : clipboardFiles;

      if (!pastedFiles.length) {
        return;
      }

      event.preventDefault();

      if (!guardComposerInteraction()) {
        return;
      }

      const didAppend = appendSelectedAttachmentFiles(pastedFiles);
      if (didAppend) {
        setActionError("");
        requestAnimationFrame(() => {
          inputMessage.current?.focus();
        });
      }
    },
    [appendSelectedAttachmentFiles, guardComposerInteraction]
  );

  const clearVoiceTimers = useCallback(() => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }

    if (voiceAutoStopTimeoutRef.current) {
      clearTimeout(voiceAutoStopTimeoutRef.current);
      voiceAutoStopTimeoutRef.current = null;
    }
  }, []);

  const stopVoiceStreamTracks = useCallback(() => {
    if (!voiceStreamRef.current) {
      return;
    }

    voiceStreamRef.current.getTracks().forEach((track) => {
      track.stop();
    });
    voiceStreamRef.current = null;
  }, []);

  const clearVoicePreview = useCallback(() => {
    setVoicePreview((previousPreview) => {
      if (previousPreview?.previewUrl) {
        URL.revokeObjectURL(previousPreview.previewUrl);
      }
      voicePreviewUrlRef.current = null;
      return null;
    });
  }, []);

  const resetVoiceComposer = useCallback(
    ({ keepPreview = false } = {}) => {
      clearVoiceTimers();
      stopVoiceStreamTracks();
      voiceChunksRef.current = [];
      voiceRecordingStartedAtRef.current = null;
      voiceRecorderRef.current = null;
      voiceCancelPendingRef.current = false;
      voiceMimeTypeRef.current = "";
      isStoppingVoiceRecordingRef.current = false;
      setVoiceRecordingMs(0);
      setVoiceRecorderState("idle");
      if (!keepPreview) {
        clearVoicePreview();
      }
    },
    [clearVoicePreview, clearVoiceTimers, stopVoiceStreamTracks]
  );

  const handleVoiceRecorderStop = useCallback(
    async (requestedByCancel = false) => {
      const startedAt = voiceRecordingStartedAtRef.current || Date.now();
      const durationMs = Math.min(
        VOICE_RECORDING_MAX_DURATION_MS,
        Math.max(0, Date.now() - startedAt)
      );
      const chunks = Array.isArray(voiceChunksRef.current)
        ? [...voiceChunksRef.current]
        : [];
      const resolvedMimeType = voiceMimeTypeRef.current || "audio/webm";

      clearVoiceTimers();
      stopVoiceStreamTracks();
      voiceRecorderRef.current = null;
      voiceRecordingStartedAtRef.current = null;
      voiceChunksRef.current = [];
      voiceMimeTypeRef.current = "";

      if (requestedByCancel || !chunks.length) {
        setVoiceRecorderState("idle");
        setVoiceRecordingMs(0);
        return;
      }

      try {
        const blob = new Blob(chunks, { type: resolvedMimeType || "audio/webm" });
        const waveform = await generateWaveformFromBlob(blob, VOICE_WAVEFORM_SAMPLE_SIZE);
        const audioFormat = resolveAudioFormatFromMimeType(resolvedMimeType);
        const fileExtension = audioFormat === "audio" ? "webm" : audioFormat;
        const file = new File(
          [blob],
          `voice-message-${Date.now()}.${fileExtension}`,
          { type: resolvedMimeType || "audio/webm" }
        );

        clearVoicePreview();
        const previewUrl = URL.createObjectURL(blob);
        voicePreviewUrlRef.current = previewUrl;
        setVoicePreview({
          blob,
          file,
          previewUrl,
          durationMs,
          waveform,
          audioFormat,
          mimeType: resolvedMimeType || "audio/webm",
        });
        setVoiceRecordingMs(durationMs);
        setVoiceRecorderState("preview");

        if (durationMs >= VOICE_RECORDING_MAX_DURATION_MS) {
          setActionError("Tin nhắn thoại tối đa 5 phút.");
        }
      } catch (error) {
        console.error("Failed to finalize voice recording:", error);
        setVoiceRecorderState("idle");
        setActionError("Không thể xử lý bản ghi âm.");
      }
    },
    [clearVoicePreview, clearVoiceTimers, setActionError, stopVoiceStreamTracks]
  );

  const stopVoiceRecording = useCallback(
    ({ cancel = false } = {}) => {
      const recorder = voiceRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        if (cancel) {
          resetVoiceComposer();
        }
        return;
      }

      if (isStoppingVoiceRecordingRef.current) {
        return;
      }

      voiceCancelPendingRef.current = cancel;
      isStoppingVoiceRecordingRef.current = true;
      setVoiceRecorderState("processing");

      try {
        recorder.requestData?.();
      } catch (error) {
        console.warn("Voice recorder requestData failed:", error);
      }

      recorder.stop();
    },
    [resetVoiceComposer]
  );

  const handleStartVoiceRecording = useCallback(async () => {
    if (!guardComposerInteraction()) {
      return;
    }

    if (
      typeof window === "undefined" ||
      !navigator?.mediaDevices ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setActionError("Trình duyệt không hỗ trợ ghi âm.");
      return;
    }

    if (voiceRecorderState === "recording" || voiceRecorderState === "processing") {
      return;
    }
    if (
      dictationState === "recording" ||
      dictationState === "processing" ||
      dictationState === "stopping"
    ) {
      setActionError("Đang nhập giọng nói. Hãy hoàn tất trước khi ghi âm tin nhắn thoại.");
      return;
    }

    setActionError("");
    clearVoicePreview();
    setVoiceRecordingMs(0);
    setVoiceRecorderState("requestingPermission");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const selectedMimeType = pickRecorderMimeType();
      const recorder = selectedMimeType
        ? new window.MediaRecorder(stream, { mimeType: selectedMimeType })
        : new window.MediaRecorder(stream);

      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      voiceMimeTypeRef.current = recorder.mimeType || selectedMimeType || "audio/webm";
      voiceChunksRef.current = [];
      voiceRecordingStartedAtRef.current = Date.now();
      voiceCancelPendingRef.current = false;
      isStoppingVoiceRecordingRef.current = false;
      setVoiceRecorderState("recording");

      recorder.ondataavailable = (event) => {
        if (event?.data && event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("Voice recorder error:", event);
        setActionError("Không thể ghi âm lúc này.");
        resetVoiceComposer();
      };

      recorder.onstop = async () => {
        const shouldCancel = voiceCancelPendingRef.current;
        voiceCancelPendingRef.current = false;
        isStoppingVoiceRecordingRef.current = false;
        await handleVoiceRecorderStop(shouldCancel);
      };

      recorder.start(250);

      voiceTimerRef.current = setInterval(() => {
        if (!voiceRecordingStartedAtRef.current) {
          return;
        }
        const elapsed = Date.now() - voiceRecordingStartedAtRef.current;
        setVoiceRecordingMs(Math.min(VOICE_RECORDING_MAX_DURATION_MS, elapsed));
      }, 200);

      voiceAutoStopTimeoutRef.current = setTimeout(() => {
        stopVoiceRecording({ cancel: false });
      }, VOICE_RECORDING_MAX_DURATION_MS);
    } catch (error) {
      console.error("Failed to start voice recording:", error);
      setVoiceRecorderState("idle");
      setActionError("Bạn chưa cấp quyền micro hoặc trình duyệt từ chối ghi âm.");
      resetVoiceComposer({ keepPreview: true });
    }
  }, [
    clearVoicePreview,
    guardComposerInteraction,
    resetVoiceComposer,
    setActionError,
    stopVoiceRecording,
    voiceRecorderState,
    dictationState,
  ]);

  const handleCancelVoiceRecording = useCallback(() => {
    clearVoicePreview();
    const recorder = voiceRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      stopVoiceRecording({ cancel: true });
      return;
    }

    resetVoiceComposer();
  }, [clearVoicePreview, resetVoiceComposer, stopVoiceRecording]);

  useEffect(() => {
    const audio = voicePreviewAudioRef.current;
    if (!audio || !voicePreview?.previewUrl) {
      setVoicePreviewPlaybackMs(0);
      setIsVoicePreviewPlaying(false);
      return undefined;
    }

    const handleTimeUpdate = () => {
      setVoicePreviewPlaybackMs(Math.round((audio.currentTime || 0) * 1000));
    };
    const handleEnded = () => {
      audio.currentTime = 0;
      setVoicePreviewPlaybackMs(0);
      setIsVoicePreviewPlaying(false);
    };
    const handlePause = () => setIsVoicePreviewPlaying(false);
    const handlePlaying = () => setIsVoicePreviewPlaying(true);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("playing", handlePlaying);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("playing", handlePlaying);
      setVoicePreviewPlaybackMs(0);
      setIsVoicePreviewPlaying(false);
    };
  }, [voicePreview?.previewUrl]);

  const handleToggleVoicePreviewPlayback = useCallback(async () => {
    const audio = voicePreviewAudioRef.current;
    if (!audio) {
      return;
    }

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
    } catch (error) {
      console.error("Failed to play voice preview:", error);
      setActionError("Không thể phát bản ghi âm.");
    }
  }, []);

  const handleSeekVoicePreview = useCallback(
    (event) => {
      const audio = voicePreviewAudioRef.current;
      if (!audio || !voicePreview?.durationMs) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
      const nextTimeMs = Math.max(0, Math.min(voicePreview.durationMs, ratio * voicePreview.durationMs));
      audio.currentTime = nextTimeMs / 1000;
      setVoicePreviewPlaybackMs(nextTimeMs);
    },
    [voicePreview?.durationMs]
  );

  const handleSendVoiceMessage = useCallback(async () => {
    if (!guardComposerInteraction()) {
      return;
    }

    if (!voicePreview?.file) {
      setActionError("Không tìm thấy bản ghi để gửi.");
      return;
    }

    if (!backendConversationId) {
      setActionError("Không tìm thấy cuộc trò chuyện để gửi tin nhắn.");
      return;
    }

    if (isConversationDisbanded) {
      setActionError("Nhóm đã được giải tán.");
      return;
    }

    setActionError("");
    setIsSending(true);

    try {
      const uploadResult = await uploadAttachmentV1(voicePreview.file);
      const attachmentPayload = {
        ...uploadResult,
        type: "AUDIO",
        durationMs: voicePreview.durationMs,
        waveform: Array.isArray(voicePreview.waveform) ? voicePreview.waveform : [],
        audioFormat: voicePreview.audioFormat || resolveAudioFormatFromMimeType(voicePreview.mimeType),
      };

      const response = await sendMessageV1({
        conversationId: backendConversationId,
        messageType: "AUDIO",
        attachments: [attachmentPayload],
        ...(replyingToMessage?.id ? { replyToMessageId: replyingToMessage.id } : {}),
      });

      const nextMessage = mapMessage(response);
      upsertMessage(nextMessage);
      updateConversationPreview({
        messageText: "",
        attachments: [attachmentPayload],
        updatedAt: nextMessage.editedAt || nextMessage.createdAt,
      });
      clearVoicePreview();
      resetVoiceComposer({ keepPreview: true });
      setReplyingToMessage(null);
    } catch (error) {
      console.error("Failed to send voice message:", error);
      setActionError("Không thể gửi tin nhắn thoại.");
    } finally {
      setIsSending(false);
    }
  }, [
    backendConversationId,
    clearVoicePreview,
    guardComposerInteraction,
    isConversationDisbanded,
    replyingToMessage?.id,
    resetVoiceComposer,
    updateConversationPreview,
    upsertMessage,
    voicePreview,
  ]);

  const clearDictationTimers = useCallback(() => {
    if (dictationTimerRef.current) {
      clearInterval(dictationTimerRef.current);
      dictationTimerRef.current = null;
    }
    if (dictationAutoStopTimeoutRef.current) {
      clearTimeout(dictationAutoStopTimeoutRef.current);
      dictationAutoStopTimeoutRef.current = null;
    }
  }, []);

  const stopDictationStreamTracks = useCallback(() => {
    if (!dictationStreamRef.current) {
      return;
    }
    dictationStreamRef.current.getTracks().forEach((track) => track.stop());
    dictationStreamRef.current = null;
  }, []);

  const resetDictationState = useCallback(() => {
    clearDictationTimers();
    stopDictationStreamTracks();
    dictationRecorderRef.current = null;
    dictationChunksRef.current = [];
    dictationStartedAtRef.current = null;
    dictationMimeTypeRef.current = "";
    dictationCancelPendingRef.current = false;
    setDictationRecordingMs(0);
    setDictationState("idle");
  }, [clearDictationTimers, stopDictationStreamTracks]);

  const appendTranscriptToComposer = useCallback(
    (transcript) => {
      const normalizedTranscript = String(transcript || "").trim();
      const composer = inputMessage.current;
      if (!normalizedTranscript || !composer || isComposerInteractionLocked) {
        return;
      }

      const currentText = composer.textContent || "";
      const separator =
        currentText.length === 0 || /\s$/.test(currentText) ? "" : " ";
      const nextText = `${currentText}${separator}${normalizedTranscript}`;

      composer.textContent = nextText;
      composer.focus();
      setComposerCaretTextOffset(composer, nextText.length);
      composerSelectionRef.current = window.getSelection?.()?.rangeCount
        ? window.getSelection().getRangeAt(0).cloneRange()
        : null;
      setDraftText(nextText.trim());
      syncComposerState();
    },
    [isComposerInteractionLocked, syncComposerState]
  );

  const resolveDictationFailureMessage = useCallback(
    (jobPayload) => {
      const backendMessage = String(jobPayload?.errorMessage || "").trim();
      const normalized = backendMessage.toLowerCase();
      if (normalized.includes("timeout") || normalized.includes("timed out")) {
        return "Hệ thống xử lý chậm hơn bình thường. Vui lòng thử lại.";
      }
      if (normalized.includes("too many") || normalized.includes("quá nhiều")) {
        return "Bạn đang gửi quá nhiều yêu cầu chuyển giọng nói. Vui lòng thử lại sau.";
      }
      if (normalized.includes("unsupported") || normalized.includes("định dạng")) {
        return "Định dạng âm thanh chưa được hỗ trợ.";
      }
      if (normalized.includes("401") || normalized.includes("403")) {
        return "Dịch vụ chuyển giọng nói hiện chưa sẵn sàng. Vui lòng thử lại sau.";
      }
      if (backendMessage) {
        return backendMessage;
      }
      return "Không thể chuyển giọng nói thành văn bản. Vui lòng thử lại.";
    },
    []
  );

  const applyDictationJobResult = useCallback(
    (jobPayload) => {
      const normalizedStatus = String(jobPayload?.status || "").toUpperCase();

      if (normalizedStatus === "COMPLETED") {
        const transcript = String(jobPayload?.resultText || "").trim();
        if (transcript) {
          appendTranscriptToComposer(transcript);
        }
        setDictationState("idle");
        setDictationRecordingMs(0);
        setDictationJobId(null);
        setDictationError("");
        return;
      }

      if (normalizedStatus === "FAILED") {
        setDictationState("failed");
        setDictationRecordingMs(0);
        setDictationJobId(null);
        setDictationError(resolveDictationFailureMessage(jobPayload));
      }
    },
    [appendTranscriptToComposer, resolveDictationFailureMessage]
  );

  const stopDictationRecording = useCallback(
    ({ cancel = false } = {}) => {
      const recorder = dictationRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        if (cancel) {
          resetDictationState();
        }
        return;
      }

      if (cancel) {
        dictationCancelPendingRef.current = true;
        dictationChunksRef.current = [];
      }

      setDictationState("stopping");
      try {
        recorder.requestData?.();
      } catch (error) {
        console.warn("Dictation recorder requestData failed:", error);
      }
      recorder.stop();
    },
    [resetDictationState]
  );

  const handleStartDictation = useCallback(async () => {
    if (!guardComposerInteraction()) {
      return;
    }
    if (!backendConversationId || backendConversationId === "AI_ASSISTANT") {
      setDictationError("Không thể dùng nhập giọng nói ở hội thoại hiện tại.");
      return;
    }
    if (
      typeof window === "undefined" ||
      typeof window.MediaRecorder === "undefined" ||
      !navigator?.mediaDevices
    ) {
      setDictationError("Trình duyệt không hỗ trợ ghi âm.");
      return;
    }
    if (voiceRecorderState === "recording" || voiceRecorderState === "processing") {
      setDictationError("Đang ghi âm tin nhắn thoại. Hãy hoàn tất trước khi nhập giọng nói.");
      return;
    }
    if (
      dictationState === "recording" ||
      dictationState === "processing" ||
      dictationState === "stopping"
    ) {
      return;
    }

    setDictationError("");
    setDictationJobId(null);
    setDictationRecordingMs(0);
    setDictationState("requestingPermission");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const selectedMimeType = pickRecorderMimeType();
      const recorder = selectedMimeType
        ? new window.MediaRecorder(stream, { mimeType: selectedMimeType })
        : new window.MediaRecorder(stream);

      dictationStreamRef.current = stream;
      dictationRecorderRef.current = recorder;
      dictationMimeTypeRef.current = recorder.mimeType || selectedMimeType || "audio/webm";
      dictationChunksRef.current = [];
      dictationStartedAtRef.current = Date.now();
      setDictationState("recording");
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          setDictationError("Kết nối micro bị ngắt.");
          setDictationState("failed");
          resetDictationState();
        };
      });

      recorder.ondataavailable = (event) => {
        if (event?.data && event.data.size > 0) {
          dictationChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setDictationError("Không thể ghi âm lúc này.");
        resetDictationState();
      };

      recorder.onstop = async () => {
        const wasCancelled = Boolean(dictationCancelPendingRef.current);
        dictationCancelPendingRef.current = false;
        const chunks = Array.isArray(dictationChunksRef.current)
          ? [...dictationChunksRef.current]
          : [];
        const durationMs = Math.min(
          DICTATION_RECORDING_MAX_DURATION_MS,
          Math.max(0, Date.now() - (dictationStartedAtRef.current || Date.now()))
        );

        clearDictationTimers();
        stopDictationStreamTracks();
        dictationRecorderRef.current = null;
        dictationStartedAtRef.current = null;

        if (wasCancelled) {
          setDictationError("");
          resetDictationState();
          return;
        }

        if (!chunks.length) {
          resetDictationState();
          return;
        }

        try {
          setDictationState("processing");
          const mimeType = dictationMimeTypeRef.current || "audio/webm";
          const blob = new Blob(chunks, { type: mimeType });
          const audioFormat = resolveAudioFormatFromMimeType(mimeType);
          const createdJob = await requestDictationSpeechToText({
            conversationId: backendConversationId,
            audioBlob: blob,
            language: "vi",
            audioFormat,
            durationMs,
          });

          setDictationState("processing");
          setDictationRecordingMs(durationMs);
          setDictationJobId(createdJob?.id || null);
          applyDictationJobResult(createdJob);
        } catch (error) {
          const responseMessage =
            error?.response?.data?.message || error?.response?.data?.error;
          setDictationError(
            String(responseMessage || "Không thể chuyển giọng nói thành văn bản. Vui lòng thử lại.")
          );
          setDictationState("failed");
          setDictationRecordingMs(0);
          setDictationJobId(null);
        } finally {
          dictationChunksRef.current = [];
          dictationMimeTypeRef.current = "";
        }
      };

      recorder.start(250);
      dictationTimerRef.current = setInterval(() => {
        if (!dictationStartedAtRef.current) {
          return;
        }
        const elapsed = Date.now() - dictationStartedAtRef.current;
        setDictationRecordingMs(Math.min(DICTATION_RECORDING_MAX_DURATION_MS, elapsed));
      }, 200);
      dictationAutoStopTimeoutRef.current = setTimeout(() => {
        stopDictationRecording({ cancel: false });
      }, DICTATION_RECORDING_MAX_DURATION_MS);
    } catch (error) {
      const errorName = String(error?.name || "").toLowerCase();
      let message = "Không thể dùng micro lúc này. Vui lòng thử lại.";
      if (errorName.includes("notallowed")) {
        message = "Bạn chưa cấp quyền micro.";
      } else if (errorName.includes("notfound")) {
        message = "Không tìm thấy thiết bị micro.";
      } else if (errorName.includes("notreadable")) {
        message = "Micro đang được ứng dụng khác sử dụng.";
      }
      setDictationState("failed");
      setDictationError(message);
      resetDictationState();
    }
  }, [
    applyDictationJobResult,
    backendConversationId,
    clearDictationTimers,
    dictationState,
    guardComposerInteraction,
    resetDictationState,
    stopDictationRecording,
    stopDictationStreamTracks,
    voiceRecorderState,
  ]);

  const handleCancelDictation = useCallback(() => {
    const recorder = dictationRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      stopDictationRecording({ cancel: true });
      return;
    }
    setDictationJobId(null);
    setDictationError("");
    resetDictationState();
  }, [resetDictationState, stopDictationRecording]);

  const isVoiceRecordingActive = voiceRecorderState === "recording";
  const isDictationRecordingActive = dictationState === "recording";
  const isVoiceModeBusy =
    voiceRecorderState === "requestingPermission" ||
    voiceRecorderState === "processing" ||
    dictationState === "requestingPermission" ||
    dictationState === "processing";
  const isVoiceModeDisabled = isComposerInteractionLocked || isVoiceModeBusy;

  const handleVoiceModeClick = useCallback(() => {
    if (isVoiceModeDisabled) {
      return;
    }

    if (isVoiceRecordingActive) {
      setIsVoiceOptionOpen(false);
      stopVoiceRecording({ cancel: false });
      return;
    }

    if (isDictationRecordingActive) {
      setIsVoiceOptionOpen(false);
      stopDictationRecording({ cancel: false });
      return;
    }

    if (!guardComposerInteraction()) {
      return;
    }

    setMenuControl((prevState) =>
      prevState.tableIcon ? { ...prevState, tableIcon: false } : prevState
    );
    setIsVoiceOptionOpen((value) => !value);
  }, [
    guardComposerInteraction,
    isDictationRecordingActive,
    isVoiceModeDisabled,
    isVoiceRecordingActive,
    stopDictationRecording,
    stopVoiceRecording,
  ]);

  const handleSelectVoiceRecording = useCallback(() => {
    setIsVoiceOptionOpen(false);
    void handleStartVoiceRecording();
  }, [handleStartVoiceRecording]);

  const handleSelectDictation = useCallback(() => {
    setIsVoiceOptionOpen(false);
    void handleStartDictation();
  }, [handleStartDictation]);

  useEffect(() => {
    if (!dictationJobId || dictationState !== "processing") {
      return undefined;
    }

    let active = true;
    let attempts = 0;
    const intervalId = setInterval(async () => {
      attempts += 1;
      if (attempts > DICTATION_MAX_POLL_ATTEMPTS) {
        clearInterval(intervalId);
        setDictationState("failed");
        setDictationJobId(null);
        setDictationError("Quá thời gian chờ, vui lòng thử lại.");
        return;
      }
      try {
        const refreshedJob = await getProcessingJob(dictationJobId);
        if (!active || !refreshedJob) {
          return;
        }
        applyDictationJobResult(refreshedJob);
      } catch {
        // Keep silent while waiting for realtime/poll fallback.
      }
    }, DICTATION_POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [applyDictationJobResult, dictationJobId, dictationState]);

  useEffect(() => {
    if (!dictationRealtimeEvent || !dictationJobId) {
      return;
    }
    if (String(dictationRealtimeEvent.jobId || "") !== String(dictationJobId)) {
      return;
    }
    if (String(dictationRealtimeEvent.jobType || "").toUpperCase() !== "STT") {
      return;
    }
    if (String(dictationRealtimeEvent.jobScope || "").toUpperCase() !== "DICTATION") {
      return;
    }

    applyDictationJobResult(dictationRealtimeEvent);
  }, [applyDictationJobResult, dictationJobId, dictationRealtimeEvent]);

  useEffect(() => {
    const voiceHotkeyActive =
      voiceRecorderState === "recording" || voiceRecorderState === "preview";
    const dictationHotkeyActive = dictationState === "recording";
    if (!voiceHotkeyActive && !dictationHotkeyActive) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key !== "Escape") {
        return;
      }
      if (voiceHotkeyActive) {
        handleCancelVoiceRecording();
      }
      if (dictationHotkeyActive) {
        handleCancelDictation();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [dictationState, handleCancelDictation, handleCancelVoiceRecording, voiceRecorderState]);

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

  const handleOpenReminderModal = useCallback(() => {
    if (!backendConversationId || isComposerInteractionLocked || isConversationDisbanded) {
      return;
    }

    setReminderError("");
    setReminderDraft({
      title: "",
      description: "",
      remindAtLocal: buildDefaultReminderLocalValue(),
      timezone: resolveBrowserTimeZone(),
    });
    setIsReminderModalOpen(true);
  }, [backendConversationId, isComposerInteractionLocked, isConversationDisbanded]);

  useEffect(() => {
    const handleOpenReminderFromExternal = (event) => {
      const targetConversationId = event?.detail?.conversationId || null;
      if (
        targetConversationId &&
        String(targetConversationId) !== String(backendConversationId || "")
      ) {
        return;
      }
      handleOpenReminderModal();
    };

    window.addEventListener(
      "web:open-conversation-reminder-modal",
      handleOpenReminderFromExternal
    );
    return () => {
      window.removeEventListener(
        "web:open-conversation-reminder-modal",
        handleOpenReminderFromExternal
      );
    };
  }, [backendConversationId, handleOpenReminderModal]);

  const handleCloseReminderModal = useCallback(() => {
    if (isReminderSubmitting) {
      return;
    }
    setIsReminderModalOpen(false);
    setReminderError("");
  }, [isReminderSubmitting]);

  const handleCreateReminder = useCallback(async () => {
    if (!backendConversationId || isReminderSubmitting) {
      return;
    }

    const title = String(reminderDraft.title || "").trim();
    const description = String(reminderDraft.description || "").trim();
    const remindAtIso = parseLocalDateTimeToIso(reminderDraft.remindAtLocal);

    if (!title) {
      setReminderError("Vui lòng nhập tiêu đề nhắc hẹn.");
      return;
    }
    if (!remindAtIso) {
      setReminderError("Vui lòng chọn thời gian hợp lệ.");
      return;
    }

    const remindAtTime = new Date(remindAtIso).getTime();
    if (!Number.isFinite(remindAtTime) || remindAtTime < Date.now() - 60_000) {
      setReminderError("Thời gian nhắc hẹn phải ở hiện tại hoặc tương lai.");
      return;
    }

    try {
      setIsReminderSubmitting(true);
      setReminderError("");
      await createConversationReminder(backendConversationId, {
        title,
        description: description || null,
        remindAt: remindAtIso,
        timezone: reminderDraft.timezone || resolveBrowserTimeZone(),
      });

      setIsReminderModalOpen(false);
      setReminderNotice("Đã tạo nhắc hẹn.");
      setReminderDraft({
        title: "",
        description: "",
        remindAtLocal: buildDefaultReminderLocalValue(),
        timezone: resolveBrowserTimeZone(),
      });
      window.dispatchEvent(
        new CustomEvent("web:conversation-reminder-changed", {
          detail: { conversationId: backendConversationId },
        })
      );
      window.dispatchEvent(new CustomEvent("web:reminders-global-refresh"));
    } catch (error) {
      setReminderError(
        error?.response?.data?.message ||
          error?.message ||
          "Không thể tạo nhắc hẹn lúc này."
      );
    } finally {
      setIsReminderSubmitting(false);
    }
  }, [backendConversationId, isReminderSubmitting, reminderDraft]);

  const loadConversationReminderCards = useCallback(
    async ({ silent = false } = {}) => {
      if (!backendConversationId || backendConversationId === "AI_ASSISTANT") {
        setConversationReminderState({
          loading: false,
          error: "",
          items: [],
          conversationId: backendConversationId || null,
        });
        return;
      }

      setConversationReminderState((prevState) => ({
        ...prevState,
        loading: !silent,
        error: "",
        conversationId: backendConversationId,
      }));

      try {
        const response = await getConversationReminders(backendConversationId, {
          page: 0,
          size: 50,
        });
        const items = Array.isArray(response?.items) ? response.items : [];
        setConversationReminderState({
          loading: false,
          error: "",
          items: items.sort((left, right) => {
            const leftTime = new Date(left?.createdAt || left?.remindAt || 0).getTime();
            const rightTime = new Date(right?.createdAt || right?.remindAt || 0).getTime();
            return leftTime - rightTime;
          }),
          conversationId: backendConversationId,
        });
      } catch (error) {
        setConversationReminderState({
          loading: false,
          error:
            error?.response?.data?.message ||
            error?.message ||
            "Không thể tải lịch hẹn của đoạn chat.",
          items: [],
          conversationId: backendConversationId,
        });
      }
    },
    [backendConversationId]
  );

  useEffect(() => {
    void loadConversationReminderCards();
  }, [loadConversationReminderCards]);

  useEffect(() => {
    const handleConversationReminderChanged = (event) => {
      const changedConversationId =
        event?.detail?.conversationId || event?.detail?.id || null;
      if (
        changedConversationId &&
        String(changedConversationId) !== String(backendConversationId || "")
      ) {
        return;
      }
      void loadConversationReminderCards({ silent: true });
    };

    window.addEventListener(
      "web:conversation-reminder-changed",
      handleConversationReminderChanged
    );
    return () => {
      window.removeEventListener(
        "web:conversation-reminder-changed",
        handleConversationReminderChanged
      );
    };
  }, [backendConversationId, loadConversationReminderCards]);

  const handleConversationReminderAction = useCallback(
    async (reminderId, action) => {
      if (!reminderId) {
        return;
      }

      const key = String(reminderId);
      setConversationReminderActionLoadingById((prevState) => ({
        ...prevState,
        [key]: true,
      }));

      try {
        if (action === "ACK") {
          await ackReminder(reminderId);
          setReminderNotice("Đã xác nhận nhắc hẹn.");
        } else if (action === "DISMISS") {
          await dismissReminder(reminderId);
          setReminderNotice("Đã bỏ qua nhắc hẹn.");
        } else if (action === "COMPLETE") {
          await completeReminder(reminderId);
          setReminderNotice("Đã hoàn thành nhắc hẹn.");
        } else if (action === "CANCEL") {
          await cancelReminder(reminderId);
          setReminderNotice("Đã hủy nhắc hẹn.");
        }

        window.dispatchEvent(
          new CustomEvent("web:conversation-reminder-changed", {
            detail: { conversationId: backendConversationId },
          })
        );
        window.dispatchEvent(new CustomEvent("web:reminders-global-refresh"));
        await loadConversationReminderCards({ silent: true });
      } catch (error) {
        setActionError(
          error?.response?.data?.message ||
            error?.message ||
            "Không thể cập nhật nhắc hẹn."
        );
      } finally {
        setConversationReminderActionLoadingById((prevState) => ({
          ...prevState,
          [key]: false,
        }));
      }
    },
    [backendConversationId, loadConversationReminderCards]
  );

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
    if (
      voiceRecorderState === "recording" ||
      voiceRecorderState === "processing" ||
      dictationState === "recording"
    ) {
      setActionError("Vui lòng dừng ghi âm trước khi gửi tin nhắn.");
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
      const linkUrl =
        normalizeUrlForPreview(extractFirstUrlFromText(messageText)) ||
        extractFirstUrlFromComposerNode(inputMessage.current) ||
        composerLinkUrl ||
        "";
      const uploadedAttachments = selectedAttachments.length
        ? await Promise.all(
            selectedAttachments.map((attachment) => uploadAttachmentV1(attachment.file))
          )
        : [];
      const mentionPayload =
        mentionFeatureEnabled
          ? buildMentionPayloadFromMessageText(
              messageText,
              mentionCandidates,
              currentUserId,
              selectedComposerMentions
            )
          : [];
      const hasUrlInTextContent = Boolean(
        normalizeUrlForPreview(extractFirstUrlFromText(messageText))
      );
      const normalizedComposerText = String(messageText || "").trim();
      const shouldUseLinkAsMessageContent =
        Boolean(linkUrl) &&
        !hasUrlInTextContent &&
        uploadedAttachments.length === 0 &&
        (!normalizedComposerText ||
          normalizePreviewTitle(normalizedComposerText) ===
            normalizePreviewTitle(composerLinkPreviewTitle));
      const outboundText = shouldUseLinkAsMessageContent
        ? linkUrl
        : normalizedComposerText;
      const isLinkTextMessage = Boolean(
        linkUrl && outboundText && uploadedAttachments.length === 0
      );
      const sendPayload = {
        conversationId: backendConversationId,
        ...(outboundText ? { content: outboundText } : {}),
        ...(uploadedAttachments.length ? { attachments: uploadedAttachments } : {}),
        ...(mentionPayload.length ? { mentions: mentionPayload } : {}),
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
        messageText: outboundText,
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

  const handleDismissComposerLinkPreview = useCallback(() => {
    if (!composerLinkUrl) {
      return;
    }
    setDismissedComposerPreviewUrl(composerLinkUrl);
  }, [composerLinkUrl]);

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
      const displayToken = String(
        candidate.displayMentionToken || `@${candidate.displayName || candidate.username || ""}`
      ).trim();
      const insertionToken = displayToken || candidate.mentionToken;
      const insertion = `${insertionToken} `;
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
      setSelectedComposerMentions((prevState) => {
        const nextState = Array.isArray(prevState) ? [...prevState] : [];
        const targetUserId = String(candidate.userId || "").trim();
        if (!targetUserId) {
          return nextState;
        }

        const existedIndex = nextState.findIndex(
          (item) => String(item?.userId || "").trim() === targetUserId
        );
        const nextMentionEntry = {
          userId: candidate.userId,
          username: candidate.username,
          mentionToken: candidate.mentionToken,
          displayName: candidate.displayName,
          displayMentionToken: insertionToken,
          handles: Array.isArray(candidate.handles) ? candidate.handles : [],
        };

        if (existedIndex >= 0) {
          nextState[existedIndex] = nextMentionEntry;
          return nextState;
        }

        nextState.push(nextMentionEntry);
        return nextState;
      });

      console.log("[WEB GROUP MENTION INSERT]", {
        conversationId: backendConversationId,
        userId: candidate.userId,
        token: insertionToken,
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
        const nextReactionState = applyLocalReactionChange(message, null, currentUserId);
        syncMessageReactionSummary(
          message.id,
          nextReactionState.reactions,
          nextReactionState.myReaction
        );
        return;
      }

      await addOrUpdateReactionV1(message.id, "LIKE");
      const nextReactionState = applyLocalReactionChange(message, "LIKE", currentUserId);

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
        const nextReactionState = applyLocalReactionChange(message, null, currentUserId);
        syncMessageReactionSummary(
          message.id,
          nextReactionState.reactions,
          nextReactionState.myReaction
        );
        return;
      }

      await addOrUpdateReactionV1(message.id, reactionType);
      const nextReactionState = applyLocalReactionChange(message, reactionType, currentUserId);
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

      const trackedStatus = groupCallStatusById.get(String(callLog.groupCallId));
      const effectiveStatus = resolveEffectiveGroupCallStatus(callLog, trackedStatus);
      if (!isLiveGroupCallStatus(effectiveStatus)) {
        return;
      }

      window.dispatchEvent(
        new CustomEvent("group-call-join-request", {
          detail: {
            ...callLog,
            conversationId: backendConversationId,
            callType: callLog.callType || callLog.raw?.type || "VOICE",
            type: callLog.type || callLog.callType || callLog.raw?.type || "VOICE",
          },
        })
      );
    },
    [backendConversationId, groupCallStatusById]
  );

  const renderCallLogMessage = useCallback(
    (item, index) => {
      const callLog = item.callLog || null;
      if (!callLog) {
        return null;
      }

      const isVideo = String(callLog.callType || "VOICE").toUpperCase() === "VIDEO";
      const normalizedCallStatus = String(callLog.callStatus || "ENDED").toUpperCase();
      const isMissedCall = normalizedCallStatus === "MISSED";
      const isCallMine = String(item.senderId || "") === String(currentUserId || "");
      const callDuration = formatCallDuration(callLog.durationSeconds);
      const fallbackName =
        callLog.initiatorName ||
        item.senderDisplayName ||
        getConversationDisplayName(activeConversation);
      const CallLogIcon = isVideo ? IoVideocamOutline : IoCallOutline;
      const groupCallId = String(callLog.groupCallId || "").trim();
      const trackedGroupCallStatus = groupCallId
        ? groupCallStatusById.get(groupCallId)
        : "";
      const effectiveGroupCallStatus = resolveEffectiveGroupCallStatus(
        callLog,
        trackedGroupCallStatus
      );
      const canJoinGroupCall =
        Boolean(groupCallId) &&
        activeConversation?.type === "group" &&
        isLiveGroupCallStatus(effectiveGroupCallStatus);
      const groupCallStatusLabel =
        effectiveGroupCallStatus === CHECKING_GROUP_CALL_STATUS
          ? "\u0110ang ki\u1ec3m tra..."
          : canJoinGroupCall
          ? "\u0110ang di\u1ec5n ra"
          : "\u0110\u00e3 k\u1ebft th\u00fac";

      console.log("[CALL LOG RENDER]", {
        source: "web",
        messageId: item.id || null,
        conversationId: backendConversationId,
        callType: callLog.callType,
        callStatus: callLog.callStatus,
        effectiveGroupCallStatus,
        durationSeconds: callLog.durationSeconds,
        callerId: callLog.callerId,
      });

      return (
        <li key={item.id || index}>
          <div
            className={`wrap-text-mess flex call-log-message-row ${
              isCallMine ? "my-mess" : "you-mess"
            }`}
          >
            {!isCallMine && (
              <img
                src={item.senderAvatarUrl || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}
                alt={fallbackName}
                className="call-log-avatar"
              />
            )}
            <div className="message-bubble-stack call-log-stack">
            <div
              className={`detail-mess call-log-bubble ${
                isVideo ? "call-log-bubble--video" : "call-log-bubble--voice"
              } ${isMissedCall ? "call-log-bubble--missed" : ""}`}
            >
              {!isCallMine && activeConversation?.type === "group" && (
                <p className="name-mess">{fallbackName}</p>
              )}
              <div className="call-log-header">
                <span
                  className={`call-log-icon call-log-icon-rendered ${
                    isVideo ? "video" : "voice"
                  } ${isMissedCall ? "missed" : ""}`}
                >
                  <CallLogIcon />
                </span>
                <span className="call-log-icon">{isVideo ? "📹" : "📞"}</span>
                <p className="call-log-title">{resolveCallLogTitle(callLog)}</p>
              </div>
              <p className="call-log-subtitle">
                {resolveCallLogSubtitle(callLog, currentUserId, fallbackName)}
              </p>
              {callDuration ? <p className="call-log-duration">⏱ {callDuration}</p> : null}
              {groupCallId && activeConversation?.type === "group" ? (
                canJoinGroupCall ? (
                <button
                  className="message-action-btn primary call-log-action"
                  type="button"
                  onClick={() => handleJoinGroupCallFromLog(callLog)}
                >
                  <CallLogIcon />
                  Tham gia cuộc gọi
                </button>
                ) : (
                  <span
                    className={`call-log-status-pill ${
                      effectiveGroupCallStatus === CHECKING_GROUP_CALL_STATUS
                        ? "call-log-status-pill-checking"
                        : "call-log-status-pill-ended"
                    }`}
                  >
                    {groupCallStatusLabel}
                  </span>
                )
              ) : null}
            </div>
          </div>
          </div>
        </li>
      );
    },
    [activeConversation, backendConversationId, currentUserId, handleJoinGroupCallFromLog]
  );

  const normalizedMessages = useMemo(() => normalizeMessageList(messages), [messages]);

  useEffect(() => {
    const groupCallIds = Array.from(
      new Set(
        normalizedMessages
          .map((message) => String(message?.callLog?.groupCallId || "").trim())
          .filter(Boolean)
      )
    );

    if (!groupCallIds.length) {
      return undefined;
    }

    let cancelled = false;
    const missingGroupCallIds = groupCallIds.filter((groupCallId) => {
      if (groupCallStatusRequestedRef.current.has(groupCallId)) {
        return false;
      }
      groupCallStatusRequestedRef.current.add(groupCallId);
      return true;
    });

    if (!missingGroupCallIds.length) {
      return undefined;
    }

    setGroupCallStatusById((current) => {
      const next = new Map(current);
      missingGroupCallIds.forEach((groupCallId) => {
        if (!next.has(groupCallId)) {
          next.set(groupCallId, CHECKING_GROUP_CALL_STATUS);
        }
      });
      return next;
    });

    missingGroupCallIds.forEach((groupCallId) => {
      getGroupCallStatusApi(groupCallId)
        .then((statusInfo) => {
          if (cancelled) {
            return;
          }

          const nextStatus = normalizeGroupCallStatusValue(
            statusInfo?.isEnded ? "ENDED" : statusInfo?.status || "ENDED"
          );
          setGroupCallStatusById((current) => {
            const next = new Map(current);
            next.set(groupCallId, nextStatus || "ENDED");
            return next;
          });
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setGroupCallStatusById((current) => {
            const next = new Map(current);
            next.set(groupCallId, "ENDED");
            return next;
          });
        });
    });

    return () => {
      cancelled = true;
    };
  }, [normalizedMessages]);

  useEffect(() => {
    const handleGroupCallEnded = (event) => {
      const payload = event?.detail || event || {};
      const groupCallId = String(payload?.groupCallId || payload?.id || "").trim();
      if (!groupCallId) {
        return;
      }

      groupCallStatusRequestedRef.current.add(groupCallId);
      setGroupCallStatusById((current) => {
        const next = new Map(current);
        next.set(groupCallId, "ENDED");
        return next;
      });
    };

    window.addEventListener("group-call-ended", handleGroupCallEnded);
    return () => window.removeEventListener("group-call-ended", handleGroupCallEnded);
  }, []);

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
      compactCallLogMessages(normalizedMessages).filter((message) => {
        const systemMessage = parseSystemMessage(message?.content);
        if (!systemMessage) {
          return true;
        }

        if (systemMessage.kind === "poll_create") {
          return true;
        }

        return String(systemMessage.kind || "").startsWith("group_");
      }),
    [normalizedMessages]
  );
  const messageReadReceiptByMessageId = useMemo(() => {
    const readReceiptsByMessageId = new Map();
    const ownVisibleMessages = displayMessages
      .filter(
        (message) =>
          Boolean(message?.id) &&
          !message?.deletedAt &&
          String(message?.senderId || "") === String(currentUserId || "")
      )
      .map((message) => ({
        key: String(message.id),
        numericId: parseReadCursorMessageId(message.id),
      }))
      .filter((message) => message.numericId != null);

    if (!ownVisibleMessages.length) {
      return readReceiptsByMessageId;
    }

    const ownVisibleMessageIds = ownVisibleMessages.map((message) => message.numericId);

    const assignReaderToLastSeenOwnMessage = (reader, lastReadMessageId) => {
      const targetIndex = findLastMessageIndexAtOrBeforeCursor(
        ownVisibleMessageIds,
        lastReadMessageId
      );
      if (targetIndex < 0) {
        return;
      }

      const targetMessageKey = ownVisibleMessages[targetIndex].key;
      const currentReaders = readReceiptsByMessageId.get(targetMessageKey) || [];
      readReceiptsByMessageId.set(targetMessageKey, [...currentReaders, reader]);
    };

    if (isPrivateConversation) {
      if (!peerUserId) {
        return readReceiptsByMessageId;
      }

      const peerState = readStateByUserId.get(String(peerUserId));
      const peerLastReadMessageId = parseReadCursorMessageId(
        peerState?.lastReadMessageId
      );
      if (peerLastReadMessageId != null) {
        const peerIdentity = resolveReadStateIdentity(peerUserId);
        assignReaderToLastSeenOwnMessage(
          {
            userId: String(peerUserId),
            displayName: peerIdentity.displayName,
            avatarUrl: peerIdentity.avatarUrl,
            lastReadAt: peerState?.lastReadAt || null,
          },
          peerLastReadMessageId
        );
      }
    } else {
      readStateByUserId.forEach((readState, userIdKey) => {
        if (!userIdKey || userIdKey === String(currentUserId || "")) {
          return;
        }

        const userLastReadMessageId = parseReadCursorMessageId(
          readState?.lastReadMessageId
        );
        if (userLastReadMessageId == null) {
          return;
        }

        const readerIdentity = resolveReadStateIdentity(userIdKey);
        assignReaderToLastSeenOwnMessage(
          {
            userId: userIdKey,
            displayName: readerIdentity.displayName,
            avatarUrl: readerIdentity.avatarUrl,
            lastReadAt: readState?.lastReadAt || null,
          },
          userLastReadMessageId
        );
      });
    }

    readReceiptsByMessageId.forEach((readers, messageId) => {
      const sortedReaders = [...readers].sort(
        (leftReader, rightReader) =>
          parseReadCursorTimestamp(rightReader.lastReadAt) -
          parseReadCursorTimestamp(leftReader.lastReadAt)
      );
      readReceiptsByMessageId.set(messageId, sortedReaders);
    });

    return readReceiptsByMessageId;
  }, [
    currentUserId,
    displayMessages,
    isPrivateConversation,
    peerUserId,
    readStateByUserId,
    resolveReadStateIdentity,
  ]);
  const privateDeliveryStatusByMessageId = useMemo(() => {
    const deliveryStatusByMessageId = new Map();
    if (!isPrivateConversation || !peerUserId) {
      return deliveryStatusByMessageId;
    }

    const peerState = readStateByUserId.get(String(peerUserId));
    const peerLastReadMessageId = parseReadCursorMessageId(
      peerState?.lastReadMessageId
    );
    const peerLastDeliveredMessageId = parseReadCursorMessageId(
      peerState?.lastDeliveredMessageId
    );

    displayMessages.forEach((message) => {
      if (
        !message?.id ||
        message?.deletedAt ||
        String(message?.senderId || "") !== String(currentUserId || "")
      ) {
        return;
      }

      const messageId = parseReadCursorMessageId(message.id);
      if (messageId == null) {
        return;
      }

      if (peerLastReadMessageId != null && peerLastReadMessageId >= messageId) {
        deliveryStatusByMessageId.set(String(message.id), "READ");
        return;
      }

      if (
        peerLastDeliveredMessageId != null &&
        peerLastDeliveredMessageId >= messageId
      ) {
        deliveryStatusByMessageId.set(String(message.id), "DELIVERED");
        return;
      }

      deliveryStatusByMessageId.set(String(message.id), "SENT");
    });

    return deliveryStatusByMessageId;
  }, [currentUserId, displayMessages, isPrivateConversation, peerUserId, readStateByUserId]);
  useEffect(() => {
    if (
      !backendConversationId ||
      backendConversationId === "AI_ASSISTANT" ||
      !displayMessages.length
    ) {
      return;
    }

    scheduleMarkConversationCursor(false);
  }, [
    backendConversationId,
    displayMessages.length,
    scheduleMarkConversationCursor,
  ]);
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
      getLinkPreview(targetUrl)
        .then((payload) => {
          if (isUnmounted) {
            return;
          }

          setLinkPreviewByUrl((prevState) => ({
            ...prevState,
            [targetUrl]: {
              title: payload?.title || "",
              description: payload?.description || "",
              image: payload?.image || "",
              url: payload?.url || targetUrl,
              host: payload?.host || (() => {
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
      setMemberReadStates(Array.isArray(page.memberReadStates) ? page.memberReadStates : []);
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
  const currentUserMentionHandles = useMemo(() => {
    const mentionHandles = new Set();
    const addHandle = (value) => {
      const normalizedValue = normalizeMentionHandle(value).toLowerCase();
      if (normalizedValue) {
        mentionHandles.add(normalizedValue);
      }
    };
    const addLabelHandle = (value) => {
      const normalizedValue = normalizeMentionHandleFromLabel(value).toLowerCase();
      if (normalizedValue) {
        mentionHandles.add(normalizedValue);
      }
    };

    addHandle(currentUserId ? String(currentUserId) : "");
    addHandle(userData?.username || "");
    addLabelHandle(userData?.displayName || "");

    const currentMember = conversationMembers.find(
      (member) => String(member?.userId || "") === String(currentUserId || "")
    );
    if (currentMember) {
      addHandle(currentMember.username || "");
      addLabelHandle(currentMember.nickname || "");
      addLabelHandle(currentMember.displayName || "");
    }

    return mentionHandles;
  }, [conversationMembers, currentUserId, userData?.displayName, userData?.username]);
  const currentUserReadCursorMessageId = useMemo(() => {
    const currentReadState = readStateByUserId.get(String(currentUserId || ""));
    const readCursorFromState = parseReadCursorMessageId(currentReadState?.lastReadMessageId);
    if (readCursorFromState != null) {
      return readCursorFromState;
    }

    if (
      String(lastMarkedSeenRef.current?.conversationId || "") ===
      String(backendConversationId || "")
    ) {
      return parseReadCursorMessageId(lastMarkedSeenRef.current?.lastReadMessageId);
    }

    return null;
  }, [backendConversationId, currentUserId, readStateByUserId]);
  const latestUnreadMentionedMessageId = useMemo(() => {
    if (!isGroupConversation || !currentUserMentionHandles.size) {
      return null;
    }

    for (let index = displayMessages.length - 1; index >= 0; index -= 1) {
      const message = displayMessages[index];
      if (!message?.id || message?.deletedAt) {
        continue;
      }

      if (String(message?.senderId || "") === String(currentUserId || "")) {
        continue;
      }

      if (parseSystemMessage(message?.content) || isSystemMessageType(message)) {
        continue;
      }

      const normalizedMessageId = parseReadCursorMessageId(message.id);
      if (
        normalizedMessageId != null &&
        currentUserReadCursorMessageId != null &&
        normalizedMessageId <= currentUserReadCursorMessageId
      ) {
        continue;
      }

      const messageHandles = extractMentionHandlesFromMessage(message);
      const isMentioned = Array.from(currentUserMentionHandles).some((handle) =>
        messageHandles.has(handle)
      );

      if (isMentioned) {
        return message.id;
      }
    }

    return null;
  }, [
    currentUserId,
    currentUserMentionHandles,
    currentUserReadCursorMessageId,
    displayMessages,
    isGroupConversation,
  ]);
  const latestDisplayMessageId =
    displayMessages.length > 0 ? displayMessages[displayMessages.length - 1]?.id : null;
  const showJumpToMentionButton = Boolean(
    isGroupConversation &&
      latestUnreadMentionedMessageId &&
      (!isNearBottom ||
        String(latestUnreadMentionedMessageId) !== String(latestDisplayMessageId || ""))
  );
  const reminderTimelineItems = useMemo(() => {
    if (
      !backendConversationId ||
      backendConversationId === "AI_ASSISTANT" ||
      conversationReminderState.conversationId !== backendConversationId
    ) {
      return [];
    }

    return (conversationReminderState.items || [])
      .filter((reminder) => reminder?.id)
      .map((reminder) => ({
        __timelineType: "reminder",
        id: `reminder-${reminder.id}`,
        reminder,
        createdAt: reminder.createdAt || reminder.remindAt || null,
        senderId: reminder.createdBy || null,
        type: "REMINDER_CARD",
      }));
  }, [
    backendConversationId,
    conversationReminderState.conversationId,
    conversationReminderState.items,
  ]);
  const renderedMessageList = useMemo(() => {
    if (backendConversationId === "AI_ASSISTANT") {
      return aiMessages;
    }

    if (isContextMode || !reminderTimelineItems.length) {
      return displayMessages;
    }

    return [...displayMessages, ...reminderTimelineItems].sort((leftItem, rightItem) => {
      const timeDelta = getTimelineItemTime(leftItem) - getTimelineItemTime(rightItem);
      if (timeDelta !== 0) {
        return timeDelta;
      }

      if (leftItem.__timelineType === "reminder" && !rightItem.__timelineType) {
        return 1;
      }
      if (!leftItem.__timelineType && rightItem.__timelineType === "reminder") {
        return -1;
      }
      return String(leftItem.id || "").localeCompare(String(rightItem.id || ""));
    });
  }, [aiMessages, backendConversationId, displayMessages, isContextMode, reminderTimelineItems]);
  const messageSearchMatches = useMemo(() => {
    const normalizedQuery = normalizeSearchText(messageSearchQuery).trim();
    if (!normalizedQuery) {
      return [];
    }

    return renderedMessageList.filter(
      (item) =>
        item?.id &&
        item.__timelineType !== "reminder" &&
        normalizeSearchText(item?.content).includes(normalizedQuery)
    );
  }, [messageSearchQuery, renderedMessageList]);
  const handleOpenMessageSearch = useCallback(() => {
    setIsMessageSearchOpen(true);
    window.setTimeout(() => messageSearchInputRef.current?.focus(), 0);
  }, []);
  const handleCloseMessageSearch = useCallback(() => {
    setIsMessageSearchOpen(false);
    setMessageSearchQuery("");
    setActiveMessageSearchIndex(-1);
  }, []);
  const handleNavigateMessageSearch = useCallback(
    (direction) => {
      if (!messageSearchMatches.length) {
        return;
      }

      setActiveMessageSearchIndex((previousIndex) => {
        const currentIndex =
          previousIndex >= 0 && previousIndex < messageSearchMatches.length
            ? previousIndex
            : messageSearchMatches.length - 1;
        return (
          (currentIndex + direction + messageSearchMatches.length) %
          messageSearchMatches.length
        );
      });
    },
    [messageSearchMatches.length]
  );
  useEffect(() => {
    if (!messageSearchQuery.trim() || !messageSearchMatches.length) {
      setActiveMessageSearchIndex(-1);
      return;
    }

    setActiveMessageSearchIndex((previousIndex) =>
      previousIndex >= 0 && previousIndex < messageSearchMatches.length
        ? previousIndex
        : messageSearchMatches.length - 1
    );
  }, [messageSearchMatches.length, messageSearchQuery]);
  useEffect(() => {
    if (
      !isMessageSearchOpen ||
      activeMessageSearchIndex < 0 ||
      activeMessageSearchIndex >= messageSearchMatches.length
    ) {
      return;
    }

    const messageId = messageSearchMatches[activeMessageSearchIndex]?.id;
    if (!messageId) {
      return;
    }

    void handleJumpToMessage(messageId);
  }, [
    activeMessageSearchIndex,
    handleJumpToMessage,
    isMessageSearchOpen,
    messageSearchMatches,
  ]);
  useEffect(() => {
    setIsMessageSearchOpen(false);
    setMessageSearchQuery("");
    setActiveMessageSearchIndex(-1);
  }, [backendConversationId]);
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
            <AiOutlinePushpin />
            <span>Tin ghim</span>
          </p>
          <div className="pinned-panel-actions">
            {extraPinnedCount > 0 ? (
              <button
                type="button"
                className="pinned-panel-toggle"
                onClick={() => setIsPinnedListExpanded((value) => !value)}
                aria-expanded={isPinnedListExpanded}
              >
                <span>{pinnedMessages.length}</span>
                {isPinnedListExpanded ? <IoChevronUpOutline /> : <IoChevronDownOutline />}
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
                  <span className="pinned-panel-item-label">
                    <AiOutlinePushpin />
                    {senderIdentity.displayName}
                  </span>
                  <span className="pinned-panel-item-preview">
                    {messagePreview}
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
            <span className="pinned-panel-item-label">
              <AiOutlinePushpin />
              {resolveMessageSenderIdentity(newestPinnedMessage).displayName}
            </span>
            <span className="pinned-panel-item-preview">
              {resolvePinnedMessagePreview(newestPinnedMessage)}
            </span>
          </button>
        ) : null}
      </div>
    ) : null;
  const statusHint = typingStatusText
    ? typingStatusText
    : isPrivateConversation
    ? formatPresenceStatusText(
        Boolean(peerPresence?.online),
        peerPresence?.lastSeenAt,
        activeConversation?.lastActive
      )
    : activeConversation?.lastActive && activeConversation.lastActive !== "Active"
    ? activeConversation.lastActive
    : "Đang hoạt động";
  const isStatusOnline = isPrivateConversation
    ? Boolean(peerPresence?.online)
    : !activeConversation?.lastActive || activeConversation.lastActive === "Active";
  const handleJumpToLatestMention = useCallback(() => {
    if (!latestUnreadMentionedMessageId) {
      return;
    }

    void handleJumpToMessage(latestUnreadMentionedMessageId);
  }, [handleJumpToMessage, latestUnreadMentionedMessageId]);
  console.log("[WEB TYPING RENDER]", {
    typingUsers,
    currentConversationId: backendConversationId,
    typingStatusText,
  });
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
          type: type.toUpperCase(), // VIDEO/VOICE
          callType: type.toUpperCase(),
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
              ) : !isGroupConversation && !isAiConversation ? (
                <div className="conversation-presence-row">
                  <span
                    className={`presence-dot ${
                      isStatusOnline ? "presence-dot--online" : "presence-dot--offline"
                    }`}
                    aria-label={isStatusOnline ? "Đang hoạt động" : "Không hoạt động"}
                  />
                  <p>{statusHint}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="group-choice flex">
          {getUnreadCount() >= 5 && (
            <div 
              className="header-action-icon ai-summary-btn" 
              title="Tóm tắt tin nhắn bằng AI" 
              onClick={handleOpenAiSummaryInChat}
              style={{ color: '#0084ff', fontWeight: 'bold' }}
            >
              ✨
            </div>
          )}
          <CiSearch
            className={`header-action-icon message-search-trigger ${
              isMessageSearchOpen ? "active" : ""
            }`}
            onClick={handleOpenMessageSearch}
            title="Tìm tin nhắn trong cuộc trò chuyện"
          />
          {activeConversation?.type === 'group' ? (
            <>
              <IoCallOutline className="header-action-icon" onClick={() => handleStartGroupCall("VOICE")} />
              <IoVideocamOutline className="header-action-icon" onClick={() => handleStartGroupCall("VIDEO")} />
            </>
          ) : (
            <>
              <IoCallOutline className="header-action-icon" onClick={() => handleStartCall("VOICE")} />
              <IoVideocamOutline className="header-action-icon" onClick={() => handleStartCall("VIDEO")} />
            </>
          )}

          {activeConversation?.type === 'group' && (
            <HiOutlineUserPlus
              className="header-action-icon"
              onClick={onOpenAddMember}
              title="Thêm thành viên vào nhóm"
            />
          )}

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
        </div>
      </div>
      {isMessageSearchOpen ? (
        <form
          className="message-search-panel"
          onClick={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            handleNavigateMessageSearch(-1);
          }}
        >
          <CiSearch className="message-search-panel-icon" aria-hidden="true" />
          <input
            ref={messageSearchInputRef}
            type="text"
            value={messageSearchQuery}
            onChange={(event) => setMessageSearchQuery(event.target.value)}
            placeholder="Tìm trong cuộc trò chuyện"
            aria-label="Tìm tin nhắn trong cuộc trò chuyện"
          />
          <span className="message-search-count">
            {messageSearchQuery.trim()
              ? `${
                  activeMessageSearchIndex >= 0 ? activeMessageSearchIndex + 1 : 0
                }/${messageSearchMatches.length}`
              : ""}
          </span>
          <button
            type="button"
            className="message-search-nav-btn"
            onClick={() => handleNavigateMessageSearch(-1)}
            disabled={!messageSearchMatches.length}
            title="Kết quả trước"
            aria-label="Kết quả trước"
          >
            <IoChevronUpOutline />
          </button>
          <button
            type="button"
            className="message-search-nav-btn"
            onClick={() => handleNavigateMessageSearch(1)}
            disabled={!messageSearchMatches.length}
            title="Kết quả sau"
            aria-label="Kết quả sau"
          >
            <IoChevronDownOutline />
          </button>
          <button
            type="button"
            className="message-search-nav-btn"
            onClick={handleCloseMessageSearch}
            title="Đóng tìm kiếm"
            aria-label="Đóng tìm kiếm"
          >
            <IoMdClose />
          </button>
        </form>
      ) : null}
      <div
        className="infor-container"
        style={conversationBackgroundStyle}
        ref={messageScrollContainerRef}
      >
        <div>
          {pinnedPanelNode}
          <ul>
            {renderedMessageList.map((item, index) => {
              const isMine = item.senderId === currentUserId;
              const isAi = item.senderId === 'AI';

              if (item.__timelineType === "reminder") {
                const reminder = item.reminder || {};
                const reminderId = String(reminder.id || "");
                const isCreator = String(reminder.createdBy || "") === String(currentUserId || "");
                const myParticipant = Array.isArray(reminder.participants)
                  ? reminder.participants.find(
                      (participant) =>
                        String(participant?.userId || "") === String(currentUserId || "")
                    ) || null
                  : null;
                const statusCode = String(reminder.status || "SCHEDULED").toUpperCase();
                const isCancelled = statusCode === "CANCELLED";
                const isCompleted = statusCode === "COMPLETED";
                const isActionLoading = Boolean(
                  conversationReminderActionLoadingById[reminderId]
                );
                const participantCount = Array.isArray(reminder.participants)
                  ? reminder.participants.length
                  : 0;

                return (
                  <li
                    ref={index === renderedMessageList.length - 1 ? scrollRef : null}
                    key={item.id || `${reminderId}-${index}`}
                    id={item.id ? `message-row-${item.id}` : undefined}
                    className="conversation-reminder-row"
                  >
                    <article
                      className={`conversation-reminder-card status-${statusCode.toLowerCase()}`}
                    >
                      <div className="conversation-reminder-card-main">
                        <span className="conversation-reminder-card-icon" aria-hidden="true">
                          <RiCalendarTodoFill />
                        </span>
                        <div className="conversation-reminder-card-content">
                          <div className="conversation-reminder-card-head">
                            <p className="conversation-reminder-card-title">
                              {reminder.title || "Nhắc hẹn"}
                            </p>
                            <span
                              className={`conversation-reminder-status status-${statusCode.toLowerCase()}`}
                            >
                              {REMINDER_STATUS_LABELS[statusCode] || reminder.status || "N/A"}
                            </span>
                          </div>
                          <p className="conversation-reminder-card-time">
                            {formatReminderDateTime(reminder.remindAt)}
                            {participantCount ? ` • ${participantCount} người` : ""}
                          </p>
                          {reminder.description ? (
                            <p className="conversation-reminder-card-desc">
                              {reminder.description}
                            </p>
                          ) : null}
                          <div className="conversation-reminder-card-meta">
                            <span>
                              Tạo bởi {reminder.createdByName || "một thành viên"}
                            </span>
                            {myParticipant ? (
                              <span>
                                {REMINDER_PARTICIPANT_STATUS_LABELS[
                                  String(myParticipant.status || "").toUpperCase()
                                ] ||
                                  myParticipant.status ||
                                  ""}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {!isCancelled && !isCompleted ? (
                        <div className="conversation-reminder-actions">
                          {isCreator ? (
                            <button
                              type="button"
                              className="message-action-btn subtle"
                              disabled={isActionLoading}
                              onClick={() =>
                                handleConversationReminderAction(reminderId, "CANCEL")
                              }
                            >
                              Hủy
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="message-action-btn primary"
                            disabled={isActionLoading}
                            onClick={() =>
                              handleConversationReminderAction(reminderId, "COMPLETE")
                            }
                          >
                            Hoàn thành
                          </button>
                          {!isCreator && myParticipant?.status !== "DISMISSED" ? (
                            <button
                              type="button"
                              className="message-action-btn subtle"
                              disabled={isActionLoading}
                              onClick={() =>
                                handleConversationReminderAction(reminderId, "ACK")
                              }
                            >
                              Xác nhận
                            </button>
                          ) : null}
                          {!isCreator && myParticipant?.status !== "DONE" ? (
                            <button
                              type="button"
                              className="message-action-btn subtle"
                              disabled={isActionLoading}
                              onClick={() =>
                                handleConversationReminderAction(reminderId, "DISMISS")
                              }
                            >
                              Bỏ qua
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  </li>
                );
              }

              if (item.isCallLog && !Boolean(item.deletedAt)) {
                const callLogNode = renderCallLogMessage(item, index);
                if (callLogNode) {
                  return callLogNode;
                }
              }

              const isDeleted = Boolean(item.deletedAt);
              const systemMessage = parseSystemMessage(item?.content);
              const resolveTimelineSystemDisplay = (message) => {
                if (!message || message.deletedAt) {
                  return null;
                }

                const parsedSystemMessage = parseSystemMessage(message?.content);
                if (!parsedSystemMessage && isSystemMessageType(message)) {
                  const text = String(message?.content || "").trim();
                  if (!text) {
                    return null;
                  }

                  return {
                    message,
                    text,
                    title: message.createdAt
                      ? new Date(message.createdAt).toLocaleString("vi-VN")
                      : undefined,
                    timeLabel: message.createdAt
                      ? new Date(message.createdAt).toLocaleString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                      : "",
                  };
                }

                if (!parsedSystemMessage) {
                  return null;
                }

                const systemPayload = parsedSystemMessage?.payload || {};
                const actorName = String(
                  systemPayload?.actorName ||
                    message?.senderDisplayName ||
                    resolveSystemUserNameFallback(
                      conversationMembers.find(
                        (member) =>
                          String(member?.userId || "") === String(message?.senderId || "")
                      )
                    ) ||
                    "Ai đó"
                ).trim();
                const targetName = (() => {
                  const targetUserId = String(systemPayload?.targetUserId || "").trim();
                  if (targetUserId) {
                    return (
                      String(systemPayload?.targetName || "").trim() ||
                      resolveSystemUserNameFallback(
                        conversationMembers.find(
                          (member) => String(member?.userId || "") === targetUserId
                        )
                      ) ||
                      "một thành viên"
                    );
                  }
                  return String(systemPayload?.targetName || "một thành viên").trim();
                })();
                const text = resolveGroupSystemMessageText(parsedSystemMessage, {
                  actorName,
                  targetName,
                });

                if (!text) {
                  return null;
                }

                return {
                  message,
                  text,
                  title: message.createdAt
                    ? new Date(message.createdAt).toLocaleString("vi-VN")
                    : undefined,
                  timeLabel: message.createdAt
                    ? new Date(message.createdAt).toLocaleString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })
                    : "",
                };
              };
              const currentGroupSystemDisplay = resolveTimelineSystemDisplay(item);
              if (currentGroupSystemDisplay) {
                if (resolveTimelineSystemDisplay(renderedMessageList[index - 1])) {
                  return null;
                }

                const groupedSystemMessages = [];
                for (let cursor = index; cursor < renderedMessageList.length; cursor += 1) {
                  const nextGroupSystemDisplay = resolveTimelineSystemDisplay(renderedMessageList[cursor]);
                  if (!nextGroupSystemDisplay) {
                    break;
                  }
                  groupedSystemMessages.push(nextGroupSystemDisplay);
                }
                const shouldAttachScrollRef = groupedSystemMessages.some(
                  ({ message }) =>
                    String(message?.id || "") ===
                    String(renderedMessageList[renderedMessageList.length - 1]?.id || "")
                );

                if (groupedSystemMessages.length > 1) {
                  return (
                    <li
                      ref={shouldAttachScrollRef ? scrollRef : null}
                      key={`group-system-${item.id || item.createdAt || index}`}
                      className="group-system-message-row"
                    >
                      <details className="group-system-message-dropdown">
                        <summary className="group-system-message-chip">
                          <span className="group-system-message-icon" aria-hidden="true">
                            <AiOutlineBell />
                          </span>
                          <span className="group-system-message-text">
                            {groupedSystemMessages.length} cập nhật hội thoại
                          </span>
                          <span className="group-system-message-time">
                            {currentGroupSystemDisplay.timeLabel}
                          </span>
                          <IoChevronDownOutline className="group-system-message-chevron" />
                        </summary>
                        <div className="group-system-message-dropdown-list">
                          {groupedSystemMessages.map((entry) => (
                            <button
                              type="button"
                              key={entry.message.id || entry.message.createdAt || entry.text}
                              className="group-system-message-dropdown-item"
                              onClick={() => handleJumpToMessage(entry.message.id)}
                            >
                              <span>{entry.text}</span>
                              {entry.timeLabel ? <small>{entry.timeLabel}</small> : null}
                            </button>
                          ))}
                        </div>
                      </details>
                    </li>
                  );
                }

                return (
                  <li
                    ref={index === renderedMessageList.length - 1 ? scrollRef : null}
                    key={item.id || `${item.createdAt}-${index}`}
                    id={item.id ? `message-row-${item.id}` : undefined}
                    className="group-system-message-row"
                    title={currentGroupSystemDisplay.title}
                  >
                    <span className="group-system-message-chip">
                      <span className="group-system-message-icon" aria-hidden="true">
                        <AiOutlineBell />
                      </span>
                      <span className="group-system-message-text">
                        {currentGroupSystemDisplay.text}
                      </span>
                      {currentGroupSystemDisplay.timeLabel ? (
                        <span className="group-system-message-time">
                          {currentGroupSystemDisplay.timeLabel}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              }
              const pollState = item?.id
                ? pollStateByCreateMessageId.get(String(item.id)) || null
                : null;
              const visibleAttachments = isDeleted
                ? []
                : Array.isArray(item.attachments)
                ? item.attachments
                : [];
              const isAudioMessage = String(item?.type || "").toUpperCase() === "AUDIO";
              const imageAttachments = visibleAttachments.filter(isImageAttachment);
              const videoAttachments = visibleAttachments.filter(
                (attachment) => !isAudioMessage && isVideoAttachment(attachment)
              );
              const audioAttachments = visibleAttachments.filter(
                (attachment) =>
                  !isImageAttachment(attachment) &&
                  !isVideoAttachment(attachment) &&
                  (isAudioAttachment(attachment) ||
                    isAudioMessage)
              );
              const fileAttachments = visibleAttachments.filter(
                (attachment) =>
                  !isImageAttachment(attachment) &&
                  !isVideoAttachment(attachment) &&
                  !isAudioAttachment(attachment)
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
                    const replyMemberIdentity = memberIdentityMap.get(
                      String(item.replyTo.senderId || "")
                    );
                    const isGroupConversation =
                      String(activeConversation?.type || "").toLowerCase() === "group";
                    const resolvedReplySenderName =
                      (isGroupConversation
                        ? replyMemberIdentity?.displayName ||
                          item.replyTo.senderDisplayName
                        : item.replyTo.senderDisplayName ||
                          replyMemberIdentity?.displayName) ||
                      (item.replyTo.senderId &&
                      String(item.replyTo.senderId) === String(currentUserId)
                        ? currentUserDisplayName
                        : replyMemberIdentity?.displayName) ||
                      "Người dùng";

                    console.log("[WEB REPLY SENDER]", {
                      conversationId: backendConversationId,
                      messageId: item.id || null,
                      senderId: item.replyTo.senderId || null,
                      mappedDisplayName: resolvedReplySenderName,
                      mappedAvatarUrl: item.replyTo.senderAvatarUrl || replyMemberIdentity?.avatarUrl || "",
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
              const messageLinkPreviewTargetUrl = normalizeUrlForPreview(
                trimUrlToken(messageLinkPreview?.url || messageLinkUrl)
              ) || messageLinkUrl;
              const messageLinkPreviewImage = String(
                messageLinkPreview?.image ||
                  messageLinkPreview?.thumbnailUrl ||
                  messageLinkPreview?.thumbnail ||
                  messageLinkPreview?.imageUrl ||
                  ""
              ).trim();
              const messageLinkPreviewHost = String(
                messageLinkPreview?.host ||
                  resolvePreviewHost(messageLinkPreviewTargetUrl)
              )
                .replace(/^www\./i, "")
                .trim();
              const messagePresetLinkPreview =
                getPresetLinkPreviewByHost(messageLinkPreviewHost);
              const effectiveMessageLinkPreviewImage =
                messageLinkPreviewImage || messagePresetLinkPreview?.image || "";
              const messageLinkPreviewTitle = String(
                messageLinkPreview?.title ||
                  messagePresetLinkPreview?.title ||
                  messageLinkPreview?.siteName ||
                  messageLinkPreviewHost ||
                  messageLinkPreviewTargetUrl
              ).trim();
              const messageLinkPreviewDescription = String(
                messageLinkPreview?.description ||
                  messageLinkPreview?.summary ||
                  messagePresetLinkPreview?.description ||
                  ""
              ).trim();
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
              const messageReadReceipts =
                messageReadReceiptByMessageId.get(String(item.id || "")) || [];
              const visibleMessageReadReceipts = messageReadReceipts.slice(
                0,
                MAX_READ_RECEIPT_AVATARS
              );
              const hiddenReadReceiptCount = Math.max(
                0,
                messageReadReceipts.length - visibleMessageReadReceipts.length
              );
              const messageReadReceiptTooltip = messageReadReceipts
                .map((reader) => reader.displayName || String(reader.userId || ""))
                .filter(Boolean)
                .join(", ");
              const isReadReceiptTooltipOpen =
                String(openReadReceiptTooltipMessageId || "") ===
                String(item.id || "");
              const visibleMessageReactions = Array.isArray(item.reactions)
                ? item.reactions.filter((reaction) => Number(reaction.count || 0) > 0)
                : [];
              const activeReactionDetails =
                String(openReactionDetails?.messageId || "") === String(item.id || "")
                  ? visibleMessageReactions.find(
                      (reaction) => reaction.type === openReactionDetails?.reactionType
                    ) || null
                  : null;
              const activeReactionUsers = Array.isArray(activeReactionDetails?.userIds)
                ? activeReactionDetails.userIds.map((userId) => ({
                    userId,
                    ...resolveReadStateIdentity(userId),
                  }))
                : [];
              const privateDeliveryStatus =
                isPrivateConversation && isMine
                  ? privateDeliveryStatusByMessageId.get(String(item.id || "")) ||
                    "SENT"
                  : null;

              return (
                <li
                  ref={index === renderedMessageList.length - 1 ? scrollRef : null}
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
                  <div className="message-bubble-stack">
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
                            <p className="message-forwarded-meta">
                              <span className="message-forwarded-meta-label">Người gửi gốc</span>
                              <strong>{forwardedFromSenderName || "Không rõ"}</strong>
                            </p>
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
                              <div
                                className="message-video-card"
                                key={attachment.id || attachment.url}
                              >
                                <video
                                  className="message-video-player"
                                  controls
                                  playsInline
                                  preload="metadata"
                                >
                                  <source
                                    src={attachment.url}
                                    type={attachment.contentType || "video/mp4"}
                                  />
                                  <a href={attachment.url} target="_blank" rel="noreferrer">
                                    Tải video
                                  </a>
                                </video>
                              </div>
                            ))}
                          </div>
                        )}
                        {audioAttachments.length > 0 ? (
                          <div className="message-audio-list">
                            {audioAttachments.map((attachment) => (
                              <VoiceMessageBubble
                                key={attachment.id || attachment.url}
                                attachment={attachment}
                                messageId={item.id}
                                isMine={isMine}
                              />
                            ))}
                          </div>
                        ) : null}
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
                            {effectiveMessageLinkPreviewImage ? (
                              <a
                                href={messageLinkPreviewTargetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="message-link-preview-image-link"
                              >
                                <img
                                  className="message-link-preview-image"
                                  src={effectiveMessageLinkPreviewImage}
                                  alt={messageLinkPreviewTitle || "Link preview"}
                                />
                              </a>
                            ) : (
                              <a
                                href={messageLinkPreviewTargetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="message-link-preview-fallback"
                              >
                                {messageLinkPreviewHost || "Liên kết"}
                              </a>
                            )}
                            <div className="message-link-preview-meta">
                              <a
                                className="message-link-preview-title message-link-preview-title-link"
                                href={messageLinkPreviewTargetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {messageLinkPreviewTitle}
                              </a>
                              {messageLinkPreviewDescription ? (
                                <p className="message-link-preview-desc">
                                  {messageLinkPreviewDescription}
                                </p>
                              ) : null}
                              <a
                                className="message-link-preview-raw"
                                href={messageLinkPreviewTargetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {messageLinkPreviewHost || messageLinkPreviewTargetUrl}
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
                          <p className="message-state-chip message-state-chip-icon" title="Đã ghim">
                            <AiOutlinePushpin />
                          </p>
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

                         <div
                           className="message-reaction-picker"
                         >
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
                              {isMine && audioAttachments.length > 0 ? (
                                <button
                                  className="message-action-menu-item"
                                  type="button"
                                  onClick={() => {
                                    handleCloseMessageMenu();
                                    window.dispatchEvent(
                                      new CustomEvent("web:voice-transcript-request", {
                                        detail: {
                                          messageId: item.id,
                                          attachmentId: audioAttachments[0]?.id || null,
                                        },
                                      })
                                    );
                                  }}
                                >
                                  Chuyển thành văn bản
                                </button>
                              ) : null}
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
                    {!isDeleted && visibleMessageReactions.length > 0 ? (
                      <span className="message-reaction-summary message-reaction-summary-wrap">
                        {visibleMessageReactions.map((reaction) => (
                          <button
                            className={`message-reaction-summary-item ${
                              item.myReaction === reaction.type ? "active" : ""
                            }`}
                            key={reaction.type}
                            type="button"
                            title={
                              isGroupConversation
                                ? "Xem thành viên đã thả cảm xúc"
                                : undefined
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!isGroupConversation) {
                                return;
                              }
                              setOpenReactionDetails((currentDetails) =>
                                String(currentDetails?.messageId || "") === String(item.id || "") &&
                                currentDetails?.reactionType === reaction.type
                                  ? null
                                  : {
                                      messageId: item.id,
                                      reactionType: reaction.type,
                                    }
                              );
                            }}
                          >
                            <span aria-hidden="true">{resolveReactionEmoji(reaction.type)}</span>
                            <strong>{reaction.count}</strong>
                          </button>
                        ))}
                        {isGroupConversation && activeReactionDetails ? (
                          <span
                            className="message-reaction-details-popover"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span className="message-reaction-details-title">
                              <span aria-hidden="true">
                                {resolveReactionEmoji(activeReactionDetails.type)}
                              </span>
                              <strong>{activeReactionDetails.count}</strong>
                            </span>
                            <span className="message-reaction-details-list">
                              {activeReactionUsers.length > 0 ? (
                                activeReactionUsers.map((reactionUser) => (
                                  <span
                                    className="message-reaction-details-user"
                                    key={String(reactionUser.userId)}
                                  >
                                    {renderAvatar(
                                      reactionUser.avatarUrl,
                                      "message-reaction-details-avatar",
                                      reactionUser.displayName
                                    )}
                                    <span>{reactionUser.displayName}</span>
                                  </span>
                                ))
                              ) : (
                                <span className="message-reaction-details-empty">
                                  Chưa có dữ liệu thành viên
                                </span>
                              )}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    </div>
                    <div className="message-bottom-meta">
                    {messageReadReceipts.length > 0 ? (
                      <div
                        className="message-read-receipts"
                        title={messageReadReceiptTooltip || undefined}
                        role="button"
                        tabIndex={0}
                        onMouseEnter={() =>
                          setOpenReadReceiptTooltipMessageId(String(item.id || ""))
                        }
                        onMouseLeave={() =>
                          setOpenReadReceiptTooltipMessageId((currentMessageId) =>
                            String(currentMessageId || "") === String(item.id || "")
                              ? null
                              : currentMessageId
                          )
                        }
                        onClick={() =>
                          setOpenReadReceiptTooltipMessageId((currentMessageId) =>
                            String(currentMessageId || "") === String(item.id || "")
                              ? null
                              : String(item.id || "")
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setOpenReadReceiptTooltipMessageId((currentMessageId) =>
                              String(currentMessageId || "") === String(item.id || "")
                                ? null
                                : String(item.id || "")
                            );
                          } else if (event.key === "Escape") {
                            setOpenReadReceiptTooltipMessageId((currentMessageId) =>
                              String(currentMessageId || "") === String(item.id || "")
                                ? null
                                : currentMessageId
                            );
                          }
                        }}
                      >
                        {visibleMessageReadReceipts.map((reader) => {
                          const resolvedReaderAvatarUrl =
                            reader.avatarUrl ||
                            resolveReadStateIdentity(reader.userId)?.avatarUrl ||
                            "";
                          return (
                            <span
                              className="message-read-receipt-avatar"
                              key={`${item.id}-${reader.userId}`}
                              aria-label={`Đã xem: ${
                                reader.displayName || String(reader.userId || "")
                              }`}
                            >
                              {resolvedReaderAvatarUrl ? (
                                <img
                                  src={resolvedReaderAvatarUrl}
                                  alt={reader.displayName || "Người dùng"}
                                />
                              ) : (
                                <span className="message-read-receipt-avatar-fallback">
                                  {buildAvatarFallbackLabel(
                                    reader.displayName,
                                    reader.userId
                                  )}
                                </span>
                              )}
                            </span>
                          );
                        })}
                        {hiddenReadReceiptCount > 0 ? (
                          <span className="message-read-receipt-more">
                            +{hiddenReadReceiptCount}
                          </span>
                        ) : null}
                        {isReadReceiptTooltipOpen ? (
                          <div className="message-read-receipts-tooltip">
                            {messageReadReceipts.map((reader) => {
                              const resolvedReaderAvatarUrl =
                                reader.avatarUrl ||
                                resolveReadStateIdentity(reader.userId)?.avatarUrl ||
                                "";
                              return (
                                <div
                                  className="message-read-receipts-tooltip-item"
                                  key={`${item.id}-reader-${reader.userId}`}
                                >
                                  <span className="message-read-receipts-tooltip-avatar">
                                    {resolvedReaderAvatarUrl ? (
                                      <img
                                        src={resolvedReaderAvatarUrl}
                                        alt={reader.displayName || "Người dùng"}
                                      />
                                    ) : (
                                      <span className="message-read-receipt-avatar-fallback">
                                        {buildAvatarFallbackLabel(
                                          reader.displayName,
                                          reader.userId
                                        )}
                                      </span>
                                    )}
                                  </span>
                                  <span className="message-read-receipts-tooltip-name">
                                    {reader.displayName ||
                                      String(reader.userId || "Người dùng")}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {index === renderedMessageList.length - 1 ? (
                      <div className="time-mess">
                        <p>
                          {formatTime(item.editedAt || item.createdAt)}
                          {isPrivateConversation &&
                          isMine &&
                          privateDeliveryStatus &&
                          privateDeliveryStatus !== "READ" ? (
                            <span
                              className={`message-delivery-status message-delivery-status-${privateDeliveryStatus.toLowerCase()}`}
                              title={
                                privateDeliveryStatus === "DELIVERED"
                                  ? "Đã nhận"
                                  : "Đã gửi"
                              }
                            >
                              {privateDeliveryStatus === "SENT" ? " ✓" : " ✓✓"}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    ) : null}
                    </div>
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
      {showReturnToLatestButton || showJumpToMentionButton ? (
        <div className="jump-floating-stack">
          {showJumpToMentionButton ? (
            <button
              type="button"
              className="jump-mention-btn"
              onClick={handleJumpToLatestMention}
              disabled={isLoadingContext}
              title="Đến tin nhắn gần nhất nhắc đến bạn"
            >
              <span className="jump-mention-btn-icon">@</span>
              <span>Nhắc đến bạn</span>
            </button>
          ) : null}
          {showReturnToLatestButton ? (
            <button
              type="button"
              className="jump-latest-btn"
              onClick={handleBackToLatest}
              disabled={isLoadingContext}
              title="Về tin nhắn hiện tại"
            >
              <span
                className="jump-latest-btn-arrow"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <IoArrowDown style={{ fontSize: "16px" }} />
              </span>
              {isContextMode ? <span>Về hiện tại</span> : null}
              {newMessagesSinceContext > 0 ? (
                <span className="jump-latest-btn-badge">+{newMessagesSinceContext}</span>
              ) : null}
            </button>
          ) : null}
        </div>
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
                  <Icon handleGetIcon={handleGetIcon} handleGetGif={handleGetGif} />
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
            <div className="voice-option-picker" ref={voiceOptionPickerRef}>
            <button
              type="button"
              className={`icon-header icon-header-btn ${
                isVoiceModeDisabled ? "composer-icon-disabled" : ""
              } ${
                voiceRecorderState === "recording" ||
                dictationState === "recording"
                  ? "voice-recording-active"
                  : ""
              }`}
              onClick={isVoiceModeDisabled ? undefined : handleVoiceModeClick}
              aria-label={
                voiceRecorderState === "recording" ||
                dictationState === "recording"
                  ? "Dừng ghi âm"
                  : "Bắt đầu ghi âm tin nhắn thoại"
              }
            >
              {voiceRecorderState === "recording" ||
              dictationState === "recording" ? (
                <IoStop />
              ) : (
                <IoMicOutline />
              )}
            </button>
              {isVoiceOptionOpen ? (
                <div className="voice-option-menu">
                  <button
                    type="button"
                    className="voice-option-tab"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={handleSelectVoiceRecording}
                  >
                    <IoMicOutline />
                    <span>Ghi âm</span>
                  </button>
                  <button
                    type="button"
                    className="voice-option-tab"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={handleSelectDictation}
                  >
                    <IoDocumentTextOutline />
                    <span>Nhập giọng nói</span>
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              style={{ display: "none" }}
              className={`icon-header icon-header-btn ${
                isComposerInteractionLocked ||
                dictationState === "processing" ||
                dictationState === "stopping" ||
                voiceRecorderState === "recording" ||
                voiceRecorderState === "processing"
                  ? "composer-icon-disabled"
                  : ""
              } ${dictationState === "recording" ? "voice-recording-active" : ""}`}
              onClick={
                isComposerInteractionLocked ||
                dictationState === "processing" ||
                dictationState === "stopping" ||
                voiceRecorderState === "recording" ||
                voiceRecorderState === "processing"
                  ? undefined
                  : dictationState === "recording"
                  ? () => stopDictationRecording({ cancel: false })
                  : handleStartDictation
              }
              aria-label={
                dictationState === "recording"
                  ? "Dừng nhập giọng nói"
                  : "Nhập văn bản bằng giọng nói"
              }
              title={
                dictationState === "recording"
                  ? "Dừng nhập giọng nói"
                  : "Nhập văn bản bằng giọng nói"
              }
            >
              {dictationState === "recording" ? <IoStop /> : <IoMicOutline />}
            </button>
            {activeConversation?.type === "group" ? (
              <IoBarChartOutline className="icon-header" onClick={handleOpenPollComposer} />
            ) : null}
            <RiCalendarTodoFill
              className={`icon-header ${isComposerInteractionLocked ? "composer-icon-disabled" : ""}`}
              onClick={isComposerInteractionLocked ? undefined : handleOpenReminderModal}
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
                <div className="composer-reply-text composer-reply-inline">
                  <p className="composer-reply-label">
                    Trả lời {replyingToMessage.senderDisplayName || "tin nhắn"}
                  </p>
                  <span className="composer-reply-divider">•</span>
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
            {voiceRecorderState === "requestingPermission" ? (
              <div className="voice-recorder-status">
                Đang xin quyền micro...
              </div>
            ) : null}
            {voiceRecorderState === "recording" ? (
              <div className="voice-recorder-panel">
                <div className="voice-recorder-left">
                  <span className="voice-recorder-dot" />
                  <span className="voice-recorder-label">Đang ghi âm</span>
                  <span className="voice-recorder-timer">
                    {formatRecordingDuration(voiceRecordingMs)}
                  </span>
                </div>
                <div className="voice-recorder-actions">
                  <button
                    className="voice-recorder-btn subtle"
                    type="button"
                    onClick={handleCancelVoiceRecording}
                  >
                    Hủy
                  </button>
                  <button
                    className="voice-recorder-btn primary"
                    type="button"
                    onClick={() => stopVoiceRecording({ cancel: false })}
                  >
                    Dừng
                  </button>
                </div>
              </div>
            ) : null}
            {voiceRecorderState === "processing" ? (
              <div className="voice-recorder-status">Đang xử lý bản ghi âm...</div>
            ) : null}
            {voiceRecorderState === "preview" && voicePreview ? (
              <div className="voice-preview-panel">
                <div className="voice-preview-meta">
                  <span className="voice-preview-title">Bản ghi âm</span>
                  <span className="voice-preview-duration">
                    {formatRecordingDuration(voicePreview.durationMs)}
                  </span>
                </div>
                <audio
                  className="voice-preview-audio"
                  ref={voicePreviewAudioRef}
                  src={voicePreview.previewUrl}
                  preload="metadata"
                />
                <div className="voice-preview-player">
                  <button
                    type="button"
                    className="voice-preview-play-btn"
                    onClick={handleToggleVoicePreviewPlayback}
                    aria-label={isVoicePreviewPlaying ? "Tạm dừng bản ghi âm" : "Phát bản ghi âm"}
                  >
                    {isVoicePreviewPlaying ? <IoStop /> : <IoPlay />}
                  </button>
                  <div
                    className="voice-preview-progress"
                    role="slider"
                    tabIndex={0}
                    aria-label="Tiến độ bản ghi âm"
                    aria-valuemin={0}
                    aria-valuemax={Math.max(0, Math.round((voicePreview.durationMs || 0) / 1000))}
                    aria-valuenow={Math.max(0, Math.round(voicePreviewPlaybackMs / 1000))}
                    onClick={handleSeekVoicePreview}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void handleToggleVoicePreviewPlayback();
                      }
                    }}
                  >
                    <span
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            voicePreview.durationMs
                              ? (voicePreviewPlaybackMs / voicePreview.durationMs) * 100
                              : 0
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="voice-preview-actions">
                  <button
                    className="voice-recorder-btn subtle"
                    type="button"
                    onClick={handleCancelVoiceRecording}
                    disabled={isSending}
                  >
                    Hủy
                  </button>
                  <button
                    className="voice-recorder-btn primary"
                    type="button"
                    onClick={handleSendVoiceMessage}
                    disabled={isSending}
                  >
                    Gửi thoại
                  </button>
                </div>
              </div>
            ) : null}
            {dictationState === "requestingPermission" ? (
              <div className="voice-recorder-status">Đang xin quyền micro để nhập giọng nói...</div>
            ) : null}
            {dictationState === "recording" ? (
              <div className="voice-recorder-panel dictation-recorder-panel">
                <div className="voice-recorder-left">
                  <span className="voice-recorder-dot" />
                  <span className="voice-recorder-label">Đang nghe để nhập văn bản</span>
                  <span className="voice-recorder-timer">
                    {formatRecordingDuration(dictationRecordingMs)}
                  </span>
                </div>
                <div className="voice-recorder-actions">
                  <button
                    className="voice-recorder-btn subtle"
                    type="button"
                    onClick={handleCancelDictation}
                  >
                    Hủy
                  </button>
                  <button
                    className="voice-recorder-btn primary"
                    type="button"
                    onClick={() => stopDictationRecording({ cancel: false })}
                  >
                    Dừng
                  </button>
                </div>
              </div>
            ) : null}
            {dictationState === "processing" ? (
              <div className="voice-recorder-status">Đang chuyển giọng nói thành văn bản...</div>
            ) : null}
            {dictationState === "stopping" ? (
              <div className="voice-recorder-status">Đang hoàn tất ghi âm...</div>
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
            {activeComposerPreviewUrl ? (
              <div className="composer-link-preview">
                <div className="composer-link-preview-card">
                  <button
                    type="button"
                    className="composer-link-preview-close"
                    aria-label="Ẩn xem trước liên kết"
                    onClick={handleDismissComposerLinkPreview}
                  >
                    <IoMdClose />
                  </button>
                  {effectiveComposerLinkPreviewImage ? (
                    <a
                      href={composerPreviewTargetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="composer-link-preview-image-link"
                    >
                      <img
                        className="composer-link-preview-image"
                        src={effectiveComposerLinkPreviewImage}
                        alt={composerLinkPreviewTitle || "Link preview"}
                      />
                    </a>
                  ) : (
                    <a
                      href={composerPreviewTargetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="composer-link-preview-fallback"
                    >
                      {composerPreviewHost || "Liên kết"}
                    </a>
                  )}
                  <div className="composer-link-preview-meta">
                    <a
                      className="composer-link-preview-title"
                      href={composerPreviewTargetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {composerLinkPreviewTitle}
                    </a>
                    <p className="composer-link-preview-desc">
                      {isComposerLinkPreviewLoading
                        ? "Đang tải thông tin liên kết..."
                        : composerLinkPreviewDescription ||
                          "Xem trước liên kết trước khi gửi."}
                    </p>
                    <a
                      className="composer-link-preview-host"
                      href={composerPreviewTargetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {composerPreviewHost || composerPreviewTargetUrl}
                    </a>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="composer-input-row" ref={composerInputRowRef}>
              {mentionFeatureEnabled && mentionState.open ? (
                <div
                  className="mention-suggestion-panel mention-suggestion-panel-above-composer mention-suggestion-panel-fixed"
                  style={{
                    "--mention-panel-left": `${mentionPanelPosition.left}px`,
                    "--mention-panel-bottom": `${mentionPanelPosition.bottom}px`,
                    "--mention-panel-width": `${mentionPanelPosition.width}px`,
                  }}
                >
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
                          <span>{candidate.displayMentionToken || `@${candidate.displayName}`}</span>
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
                  data-placeholder={`Nhập @, tin nhắn tới ${conversationName}`}
                  className="contentEditable"
                  ref={inputMessage}
                  onInput={syncComposerState}
                  onFocus={captureComposerSelection}
                  onKeyUp={captureComposerSelection}
                  onMouseUp={captureComposerSelection}
                  onSelect={captureComposerSelection}
                  onKeyDown={handleButtonSendMess}
                  onPaste={handleComposerPaste}
                />
              </div>
              <div className="composer-submit-actions">
                <button
                  type="button"
                  className={`composer-action-btn composer-action-btn-like ${
                    isComposerInteractionLocked ? "composer-icon-disabled" : ""
                  }`}
                  onClick={
                    isComposerInteractionLocked
                      ? undefined
                      : (event) => handleSendMess(event, true)
                  }
                  disabled={
                    voiceRecorderState === "recording" ||
                    voiceRecorderState === "processing" ||
                    dictationState === "recording"
                  }
                  aria-label="Gửi lượt thích"
                >
                  <AiOutlineLike />
                </button>
                <button
                  type="submit"
                  className={`composer-action-btn composer-action-btn-send ${
                    activeIconSend ? "activeIconSend" : ""
                  } ${isComposerInteractionLocked ? "composer-icon-disabled" : ""}`}
                  disabled={
                    isComposerInteractionLocked ||
                    isSending ||
                    voiceRecorderState === "recording" ||
                    voiceRecorderState === "processing" ||
                    dictationState === "recording"
                  }
                  aria-label="Gửi tin nhắn"
                >
                  <AiOutlineSend />
                </button>
              </div>
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
        {isReminderModalOpen ? (
          <div className="forward-picker-overlay" onClick={handleCloseReminderModal}>
            <div
              className="forward-picker-card reminder-create-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="forward-picker-header">
                <div>
                  <h3 className="forward-picker-title">Tạo nhắc hẹn</h3>
                  <p className="forward-picker-subtitle">
                    Tạo lịch nhắc cho hội thoại hiện tại.
                  </p>
                </div>
                <button
                  type="button"
                  className="message-action-btn subtle"
                  onClick={handleCloseReminderModal}
                  disabled={isReminderSubmitting}
                  aria-label="Đóng tạo nhắc hẹn"
                >
                  <IoMdClose />
                </button>
              </div>
              <div className="reminder-create-form">
                <label className="reminder-create-field">
                  <span>Tiêu đề</span>
                  <input
                    type="text"
                    value={reminderDraft.title}
                    onChange={(event) =>
                      setReminderDraft((prevState) => ({
                        ...prevState,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Ví dụ: Họp nhóm CNM"
                    maxLength={255}
                  />
                </label>
                <label className="reminder-create-field">
                  <span>Mô tả</span>
                  <textarea
                    value={reminderDraft.description}
                    onChange={(event) =>
                      setReminderDraft((prevState) => ({
                        ...prevState,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Ghi chú thêm (không bắt buộc)"
                    rows={3}
                    maxLength={1000}
                  />
                </label>
                <label className="reminder-create-field">
                  <span>Thời gian nhắc</span>
                  <input
                    type="datetime-local"
                    value={reminderDraft.remindAtLocal}
                    onChange={(event) =>
                      setReminderDraft((prevState) => ({
                        ...prevState,
                        remindAtLocal: event.target.value,
                      }))
                    }
                  />
                </label>
                {reminderError ? (
                  <p className="composer-feedback-error reminder-create-error">{reminderError}</p>
                ) : null}
                <div className="flex forward-picker-actions">
                  <button
                    type="button"
                    className="message-action-btn subtle"
                    onClick={handleCloseReminderModal}
                    disabled={isReminderSubmitting}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="message-action-btn primary"
                    onClick={handleCreateReminder}
                    disabled={isReminderSubmitting}
                  >
                    {isReminderSubmitting ? "Đang tạo..." : "Tạo nhắc hẹn"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {isSending ? <p className="composer-feedback-hint">Đang gửi tin nhắn...</p> : null}
        {forwardNotice ? <p className="composer-feedback-success">{forwardNotice}</p> : null}
        {reminderNotice ? <p className="composer-feedback-success">{reminderNotice}</p> : null}
        {dictationError ? <p className="composer-feedback-error">{dictationError}</p> : null}
        {!isForwardPickerOpen &&
        !isPollComposerOpen &&
        !isReminderModalOpen &&
        actionError &&
        !shouldSuppressComposerBlockError ? (
          <p className="composer-feedback-error">{actionError}</p>
        ) : null}
        {isConversationDisbanded ? (
          <p className="composer-feedback-error">Nhóm đã được giải tán</p>
        ) : null}
        {isPollComposerOpen ? (
          <div className="forward-picker-overlay" onClick={handleClosePollComposer}>
            <div className="forward-picker-card poll-creator-card" onClick={(event) => event.stopPropagation()}>
              <div className="poll-creator-header">
                <div className="poll-creator-heading">
                  <h3 className="poll-creator-title">Tạo bình chọn mới</h3>
                  <p className="poll-creator-subtitle">
                    Đặt một câu hỏi bình chọn trong nhóm cho mọi người cùng tham gia.
                  </p>
                </div>
                <button
                  className="poll-creator-close-btn"
                  type="button"
                  onClick={handleClosePollComposer}
                  aria-label="Đóng tạo bình chọn"
                >
                  <IoMdClose />
                </button>
              </div>
              <div className="poll-form-body">
                <section className="poll-form-section">
                  <label className="poll-field-label" htmlFor="poll-question-input">
                    Đặt câu hỏi bình chọn
                  </label>
                  <div className="poll-question-wrapper">
                    <input
                      id="poll-question-input"
                      className="poll-question-input"
                      type="text"
                      placeholder="Nhập câu hỏi tại đây..."
                      value={pollDraft.question}
                      maxLength={100}
                      onChange={(event) =>
                        setPollDraft((prevState) => ({
                          ...prevState,
                          question: event.target.value,
                        }))
                      }
                    />
                    <span className="poll-question-counter">{pollDraft.question.length}/100</span>
                  </div>
                </section>
                <section className="poll-form-section">
                  <p className="poll-field-label">Các phương án</p>
                  <div className="poll-options-editor">
                    {pollDraft.options.map((option, index) => (
                      <div className="poll-option-editor-row" key={`poll-option-${index}`}>
                        <span className="poll-option-radio" aria-hidden="true" />
                        <input
                          type="text"
                          value={option}
                          placeholder={`Phương án ${index + 1}`}
                          onChange={(event) => handlePollOptionChange(index, event.target.value)}
                        />
                        {pollDraft.options.length > 2 ? (
                          <button
                            className="poll-option-remove-btn"
                            type="button"
                            onClick={() =>
                              setPollDraft((prevState) => ({
                                ...prevState,
                                options: prevState.options.filter(
                                  (_, optionIndex) => optionIndex !== index
                                ),
                              }))
                            }
                            aria-label={`Xóa phương án ${index + 1}`}
                          >
                            <IoTrashOutline />
                          </button>
                        ) : (
                          <span className="poll-option-remove-placeholder" />
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="poll-add-option-btn"
                      onClick={() =>
                        setPollDraft((prevState) => ({
                          ...prevState,
                          options: [...prevState.options, ""],
                        }))
                      }
                    >
                      <IoAddOutline />
                      Thêm phương án
                    </button>
                  </div>
                </section>
                <section className="poll-form-section poll-settings-section">
                  <h4 className="poll-settings-title">Cài đặt nâng cao</h4>
                  <div className="poll-setting-list">
                    <label className="poll-setting-item">
                      <span className="poll-setting-icon">
                        <IoCheckboxOutline />
                      </span>
                      <span className="poll-setting-text">Chọn nhiều phương án</span>
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
                    </label>
                    <label className="poll-setting-item">
                      <span className="poll-setting-icon">
                        <IoAddOutline />
                      </span>
                      <span className="poll-setting-text">Có thể thêm phương án</span>
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
                    </label>
                    <label className="poll-setting-item">
                      <span className="poll-setting-icon">
                        <IoPersonOutline />
                      </span>
                      <span className="poll-setting-text">Ẩn người bình chọn</span>
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
                    </label>
                    <label className="poll-setting-item">
                      <span className="poll-setting-icon">
                        <IoEyeOffOutline />
                      </span>
                      <span className="poll-setting-text">Ẩn kết quả khi chưa bình chọn</span>
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
                    </label>
                  </div>
                </section>
                {actionError ? (
                  <p className="composer-feedback-error poll-creator-error">{actionError}</p>
                ) : null}
              </div>
              <div className="poll-creator-footer">
                <button className="message-action-btn subtle poll-footer-btn" type="button" onClick={handleClosePollComposer}>
                  Hủy
                </button>
                <button
                  className="message-action-btn primary poll-footer-btn"
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



