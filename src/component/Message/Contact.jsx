import React, {
  useEffect,
  useState,
  useContext,
  useRef,
  memo,
  useMemo,
  useCallback,
} from "react";
import { UserContext } from "../../Context/UserContext";
import { ContactContext } from "../../Context/ContactConext";
import PresenceContext from "../../Context/PresenceContext";
import "../../resource/style/Chat/contact.css";
import { CiSearch } from "react-icons/ci";
import { HiOutlineUserPlus } from "react-icons/hi2";
import { HiOutlineUserGroup } from "react-icons/hi2";
import { IoIosMore } from "react-icons/io";
import { IoMdClose } from "react-icons/io";
import { IoTriangle } from "react-icons/io5";
import { BsBellSlashFill, BsFillCameraFill, BsPinAngleFill } from "react-icons/bs";
import {
  createConversationV1,
  updateConversationAvatarV1,
  updateConversationArchiveV1,
  updateConversationMuteV1,
  updateConversationPinV1,
} from "../../services/chat/conversationApi";
import chatRealtimeService from "../../services/chat/chatRealtimeService";
import {
  getFriendRealtimeDestination,
  isFriendRealtimeEvent,
} from "../../services/friendRealtimeService";
import {
  CLOSE_FRIEND_STATUS_CHANGED_EVENT,
  getCloseFriendIdsForCurrentUser,
} from "../../services/closeFriendApi";
import { searchMessagesV1, uploadAttachmentV1 } from "../../services/chat/messageApi";
import {
  mapConversation,
  resolveConversationPreviewText,
} from "../../mappers/conversationMapper";
import {
  isAudioAttachment,
  isImageAttachment,
  isVideoAttachment,
} from "../../mappers/messageMapper";
import {
  GROUP_LABEL_OPTIONS,
  resolveGroupLabelMeta,
} from "../../constants/groupConversationLabels";
import "../../resource/style/AddressBook/menuContact.css";
import {
  crudFriend,
  getUserByPhone,
  getFriendsV2,
  searchUsersV2,
  sendFriendRequestV2,
} from "../../util/api";
import { mapFriendOptions } from "../../mappers/friendOptionMapper";

const mapSearchUserToUi = (item) => ({
  _id: item.userId,
  userId: item.userId,
  displayName: item.displayName || item.username,
  username: item.username || item.displayName,
  avatarUrl: item.avatarUrl || "",
  avatar: item.avatarUrl || "",
  relationshipStatus: item.relationshipStatus || "NONE",
});
const getFriendActionMeta = (relationshipStatus) => {
  switch (relationshipStatus) {
    case "FRIEND":
      return { label: "Bạn bè", disabled: true };
    case "REQUEST_SENT":
      return { label: "Đã gửi lời mời", disabled: true };
    case "REQUEST_RECEIVED":
      return { label: "Đã nhận lời mời", disabled: true };
    default:
      return { label: "Kết bạn", disabled: false };
  }
};


const getUnreadConversationCount = (conversation) =>
  Number(conversation?.unreadCount || 0);
const PRIVATE_CONVERSATION_LABEL = "Người dùng";
const GROUP_CONVERSATION_LABEL = "Nhóm";
const GROUP_LABEL_FILTER_ALL = "ALL";

const getConversationDisplayName = (conversation) =>
  conversation?.displayName ||
  conversation?.trustedDisplayName ||
  (conversation?.type === "group"
    ? GROUP_CONVERSATION_LABEL
    : PRIVATE_CONVERSATION_LABEL);

const getConversationAvatarUrl = (conversation) =>
  conversation?.avatarUrl || conversation?.trustedAvatarUrl || "";

const normalizeContactSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("vi");

const getSidebarSearchItemKey = (item) =>
  item?.id
    ? `conversation:${item.id}`
    : `contact:${item?.userId || item?._id || item?.username || ""}`;

const isGroupConversationItem = (conversation) =>
  String(conversation?.type || "").toLowerCase() === "group" ||
  Boolean(conversation?.isGroup) ||
  Boolean(conversation?.raw?.isGroup) ||
  Boolean(conversation?.groupId) ||
  Boolean(conversation?.raw?.groupId);

const getConversationLastMessageSenderId = (conversation) => {
  const rawLastMessage = conversation?.raw?.lastMessage;
  return (
    conversation?.lastMessageSenderId ||
    conversation?.raw?.lastMessageSenderId ||
    conversation?.raw?.lastMessageSenderUserId ||
    conversation?.raw?.lastSenderId ||
    rawLastMessage?.senderId ||
    rawLastMessage?.senderUserId ||
    rawLastMessage?.userId ||
    rawLastMessage?.sender?.id ||
    rawLastMessage?.sender?.userId ||
    ""
  );
};

const LAST_PREVIEW_URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/i;

const stripSelfColonPrefix = (value) =>
  String(value || "")
    .trim()
    .replace(/^Bạn\s*:\s*/i, "")
    .trim();

const stripSelfActorPrefix = (value) =>
  stripSelfColonPrefix(value).replace(/^Bạn\s+/i, "").trim();

const lowerFirstPreviewChar = (value) => {
  const content = String(value || "").trim();
  return content ? `${content.charAt(0).toLocaleLowerCase("vi-VN")}${content.slice(1)}` : "";
};

const getConversationLastMessageAttachments = (conversation) => {
  const rawLastMessage = conversation?.raw?.lastMessage;
  const candidates = [
    rawLastMessage?.attachments,
    rawLastMessage?.files,
    conversation?.raw?.lastMessageAttachments,
    conversation?.lastMessageAttachments,
    conversation?.raw?.attachments,
    conversation?.attachments,
  ];

  return candidates.find((items) => Array.isArray(items) && items.length) || [];
};

const getConversationLastMessageType = (conversation) => {
  const rawLastMessage = conversation?.raw?.lastMessage;
  return String(
    rawLastMessage?.messageType ||
      rawLastMessage?.type ||
      conversation?.raw?.lastMessageType ||
      conversation?.lastMessageType ||
      ""
  ).toUpperCase();
};

const isGifPreviewAttachment = (attachment) => {
  const contentType = String(attachment?.contentType || "").toLowerCase();
  const fileName = String(attachment?.fileName || attachment?.name || "").toLowerCase();
  const attachmentType = String(attachment?.type || "").toUpperCase();

  return (
    contentType === "image/gif" ||
    attachmentType === "GIF" ||
    fileName.endsWith(".gif")
  );
};

const resolveAttachmentPreviewAction = (attachments, messageType = "") => {
  const normalizedType = String(messageType || "").toUpperCase();
  const attachmentCount = Array.isArray(attachments) ? attachments.length : 0;
  const firstAttachment = attachmentCount ? attachments[0] : { type: normalizedType };

  if (attachmentCount > 1) {
    if (attachments.every((attachment) => isImageAttachment(attachment))) {
      return `đã gửi ${attachmentCount} ảnh`;
    }
    return `đã gửi ${attachmentCount} file`;
  }

  if (
    attachmentCount === 1 &&
    (isGifPreviewAttachment(firstAttachment) || normalizedType === "GIF")
  ) {
    return "đã gửi một GIF";
  }

  if (
    attachmentCount === 1 &&
    (isImageAttachment(firstAttachment) || normalizedType === "IMAGE")
  ) {
    return "đã gửi một ảnh";
  }

  if (
    attachmentCount === 1 &&
    (isAudioAttachment(firstAttachment) || normalizedType === "AUDIO")
  ) {
    return "đã gửi một đoạn ghi âm";
  }

  if (
    attachmentCount === 1 &&
    (isVideoAttachment(firstAttachment) || normalizedType === "VIDEO")
  ) {
    return "đã gửi một video";
  }

  if (
    attachmentCount === 1 ||
    ["ATTACHMENT", "FILE", "DOCUMENT"].includes(normalizedType)
  ) {
    return "đã gửi 1 file";
  }

  if (normalizedType === "GIF") {
    return "đã gửi một GIF";
  }

  if (["IMAGE", "PHOTO"].includes(normalizedType)) {
    return "đã gửi một ảnh";
  }

  if (["AUDIO", "VOICE", "VOICE_MESSAGE"].includes(normalizedType)) {
    return "đã gửi một đoạn ghi âm";
  }

  if (normalizedType === "VIDEO") {
    return "đã gửi một video";
  }

  if (["LINK", "URL"].includes(normalizedType)) {
    return "đã gửi một liên kết";
  }

  return "";
};

const normalizeMediaPreviewAction = (conversation, preview) => {
  const messageType = getConversationLastMessageType(conversation);
  const attachments = getConversationLastMessageAttachments(conversation);
  const attachmentPreview = resolveAttachmentPreviewAction(attachments, messageType);

  if (attachmentPreview) {
    return attachmentPreview;
  }

  const content = String(preview || "").trim();
  if (!content) {
    return "";
  }

  if (
    /^(?:đã\s+)?gửi.*(?:tin nhắn thoại|đoạn ghi âm|voice|audio)/i.test(content) ||
    /^(?:tin nhắn thoại|đoạn ghi âm|voice|audio)$/i.test(content)
  ) {
    return "đã gửi một đoạn ghi âm";
  }

  if (/^(?:đã\s+)?gửi.*\bgif\b/i.test(content) || /^gif$/i.test(content)) {
    return "đã gửi một GIF";
  }

  if (
    /^(?:đã\s+)?gửi.*(?:hình ảnh|ảnh|image|photo)/i.test(content) ||
    /^(?:hình ảnh|ảnh|image|photo)$/i.test(content)
  ) {
    return "đã gửi một ảnh";
  }

  if (/^(?:đã\s+)?gửi.*video/i.test(content) || /^video$/i.test(content)) {
    return "đã gửi một video";
  }

  if (
    /^(?:đã\s+)?gửi.*(?:tệp đính kèm|đính kèm|tệp|file)/i.test(content) ||
    /^\d+\s*(?:tệp đính kèm|đính kèm|tệp|file)$/i.test(content)
  ) {
    const count = Number(content.match(/\d+/)?.[0] || 1);
    return count > 1 ? `đã gửi ${count} file` : "đã gửi 1 file";
  }

  if (LAST_PREVIEW_URL_PATTERN.test(content)) {
    return "đã gửi một liên kết";
  }

  return content;
};

const formatConversationPreviewBySender = (
  conversation,
  currentUserId,
  preview,
  options = {}
) => {
  const content = String(preview || "").trim();
  if (!content) {
    return "";
  }

  const senderId = options.senderId || getConversationLastMessageSenderId(conversation);
  const isCurrentUserSender =
    currentUserId && senderId && String(senderId) === String(currentUserId);

  if (!isCurrentUserSender) {
    return stripSelfColonPrefix(
      options.isCall ? content : normalizeMediaPreviewAction(conversation, content)
    );
  }

  const normalizedContent = options.isCall
    ? lowerFirstPreviewChar(stripSelfActorPrefix(content))
    : normalizeMediaPreviewAction(conversation, stripSelfColonPrefix(content));

  return normalizedContent ? `Bạn: ${normalizedContent}` : "";
};

const parseCallPreviewPayload = (value) => {
  if (!value) {
    return null;
  }

  const payload =
    typeof value === "string"
      ? (() => {
          const content = value.trim();
          if (!content.startsWith("{")) {
            return null;
          }
          try {
            return JSON.parse(content);
          } catch {
            return null;
          }
        })()
      : value && typeof value === "object"
      ? value
      : null;

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const hasCallLogShape = Boolean(
    payload.callId ||
      payload.groupCallId ||
      payload.callType ||
      payload.status ||
      payload.callStatus ||
      payload.callerId
  );

  return hasCallLogShape ? payload : null;
};

const getConversationCallPayload = (conversation) => {
  const rawLastMessage = conversation?.raw?.lastMessage;
  return (
    parseCallPreviewPayload(rawLastMessage?.content) ||
    parseCallPreviewPayload(rawLastMessage) ||
    parseCallPreviewPayload(conversation?.lastMessage)
  );
};

const resolveCallPreviewText = (conversation, currentUserId) => {
  const payload = getConversationCallPayload(conversation);
  if (!payload) {
    return "";
  }

  const status = String(payload.status || payload.callStatus || "ENDED").toUpperCase();
  const callerId = payload.callerId || payload.senderId || "";
  const isCaller =
    currentUserId && callerId && String(callerId) === String(currentUserId);
  const isGroup = isGroupConversationItem(conversation);
  const actorName =
    payload.initiatorName ||
    payload.callerName ||
    payload.actorName ||
    (isCaller ? "Bạn" : getConversationDisplayName(conversation));

  if (status === "MISSED") {
    if (isGroup) {
      return "Cuộc gọi nhóm nhỡ";
    }
    return isCaller ? "Cuộc gọi nhỡ" : `Cuộc gọi nhỡ từ ${actorName}`;
  }

  if (status === "REJECTED") {
    return isCaller ? "Cuộc gọi bị từ chối" : "Bạn đã từ chối cuộc gọi";
  }

  if (status === "CANCELLED" || status === "BUSY") {
    return "Cuộc gọi không thành công";
  }

  if (isGroup) {
    return `${actorName} đã bắt đầu cuộc gọi nhóm`;
  }

  return isCaller ? "Bạn đã gọi" : `${actorName} đã gọi`;
};

const getConversationPreview = (conversation, currentUserId) => {
  const callPreview = resolveCallPreviewText(conversation, currentUserId);
  if (callPreview) {
    const callPayload = getConversationCallPayload(conversation);
    return formatConversationPreviewBySender(conversation, currentUserId, callPreview, {
      isCall: true,
      senderId: callPayload?.callerId || callPayload?.senderId || "",
    });
  }

  const preview =
    resolveConversationPreviewText(conversation?.lastMessage) ||
    `Gửi lời chào đến ${getConversationDisplayName(conversation)}`;
  return formatConversationPreviewBySender(conversation, currentUserId, preview);
};

const formatPresenceLastSeenText = (value) => {
  if (!value) {
    return "Không hoạt động";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không hoạt động";
  }

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
};

const resolveConversationPresenceStatus = (conversation, getPresenceForUser) => {
  const normalizedType = String(conversation?.type || "").toLowerCase();
  if (normalizedType === "private") {
    const peerUserId = String(conversation?.peerUserId || "").trim();
    if (peerUserId) {
      const presence = getPresenceForUser(peerUserId);
      if (presence?.online) {
        return {
          online: true,
          text: "Đang hoạt động",
        };
      }
      return {
        online: false,
        text: formatPresenceLastSeenText(presence?.lastSeenAt),
      };
    }
  }

  if (conversation?.lastActive === "Active") {
    return {
      online: true,
      text: "Đang hoạt động",
    };
  }

  if (conversation?.lastActive) {
    return {
      online: false,
      text: conversation.lastActive,
    };
  }

  return {
    online: false,
    text: "Không hoạt động",
  };
};

const getApiErrorMessage = (error, fallback) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  fallback;

const resolveConversationGroupLabel = (conversation) => {
  if (!isGroupConversationItem(conversation)) {
    return null;
  }

  return resolveGroupLabelMeta(
    conversation?.groupLabel,
    conversation?.groupLabelDisplayName || "",
    conversation?.groupLabelColor || ""
  );
};

function Contact({
  handleChangeContact,
  showPageAddressBook,
}) {
  const [textSearch, setTextSearch] = useState("");
  const [isSearch, setIsSearch] = useState({
    state: false,
    recent: true,
    response: false,
  });
  const [dataSearch, setDataSearch] = useState({
    recent: [],
    response: [],
    loading: false,
    error: "",
  });
  const [addUser, setAddUser] = useState({
    friend: false,
    group: false,
  });
  const [allMessActive, setAllMessActive] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [openConversationMenuId, setOpenConversationMenuId] = useState(null);
  const [conversationSettingsError, setConversationSettingsError] = useState("");
  const [pendingConversationId, setPendingConversationId] = useState(null);
  const [closeFriendIds, setCloseFriendIds] = useState(() => new Set());
  const [selectedGroupLabelFilter, setSelectedGroupLabelFilter] = useState(
    GROUP_LABEL_FILTER_ALL
  );

  const [dataUserPhone, setDataUserPhone] = useState({
    username: "",
    show: false,
    data: null,
    state: null,
    cancel: null,
    unfriend: null,
    checkId: null,
  });
  const [friendSearch, setFriendSearch] = useState({
  keyword: "",
  loading: false,
  searched: false,
  results: [],
  error: "",
});

  const [dataCreateGr, setDataCreateGr] = useState({
    username: "",
    listMember: [],
    showAvt: false,
    avatar: null,
    avatarFile: null,
    avatarPreview: "",
  });
  const [friendOptions, setFriendOptions] = useState([]);
  const [friendOptionsState, setFriendOptionsState] = useState({
    loading: false,
    loaded: false,
    attempted: false,
    error: "",
  });
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState("");
  const groupAvatarInputRef = useRef(null);
  const listAvatarGr = [
    "https://res.zaloapp.com/pc/avt_group/1_family.jpg",
    "https://res.zaloapp.com/pc/avt_group/2_family.jpg",
    "https://res.zaloapp.com/pc/avt_group/3_family.jpg",
    "https://res.zaloapp.com/pc/avt_group/4_work.jpg",
    "https://res.zaloapp.com/pc/avt_group/5_work.jpg",
    "https://res.zaloapp.com/pc/avt_group/6_work.jpg",
    "https://res.zaloapp.com/pc/avt_group/7_friends.jpg",
    "https://res.zaloapp.com/pc/avt_group/8_friends.jpg",
    "https://res.zaloapp.com/pc/avt_group/9_friends.jpg",
    "https://res.zaloapp.com/pc/avt_group/10_school.jpg",
    "https://res.zaloapp.com/pc/avt_group/11_school.jpg",
    "https://res.zaloapp.com/pc/avt_group/12_school.jpg",
  ];
  const {
    conversations,
    fetchConversation,
    fetchArchivedConversations,
    upsertConversation,
    archivedConversations,
    selectedConversationId,
    updateConversationById,
  } = useContext(ContactContext);
  const { fetchBatchPresence, getPresenceForUser } = useContext(PresenceContext);
  const { userData } = useContext(UserContext);
  const currentUserId = userData?._id || userData?.userId || null;
  const getRecentSearchStorageKey = (userId) =>
  `message-user-search:${userId || "guest"}`;

const getSearchItemId = (item) => item?.userId || item?._id || item?.id || null;

  const searchTimeout = useRef(null);
  const searchRequestIdRef = useRef(0);
  const baseDisplayedConversationList = useMemo(
    () =>
      (showArchived ? archivedConversations : conversations)?.filter(
        (conversation) => conversation.id !== "AI_ASSISTANT"
      ) || [],
    [archivedConversations, conversations, showArchived]
  );
  const displayedConversationList = useMemo(() => {
    if (selectedGroupLabelFilter === GROUP_LABEL_FILTER_ALL) {
      return baseDisplayedConversationList;
    }

    return baseDisplayedConversationList.filter((conversation) => {
      const groupLabelMeta = resolveConversationGroupLabel(conversation);
      return (
        String(conversation?.type || "").toLowerCase() === "group" &&
        String(groupLabelMeta?.code || "").toUpperCase() === selectedGroupLabelFilter
      );
    });
  }, [baseDisplayedConversationList, selectedGroupLabelFilter]);
  const displayedConversationListNotSeen = useMemo(
    () =>
      displayedConversationList.filter(
        (item) => getUnreadConversationCount(item) > 0
      ),
    [displayedConversationList]
  );

  useEffect(() => {
    const peerUserIds = displayedConversationList
      .filter((conversation) => String(conversation?.type || "").toLowerCase() === "private")
      .map((conversation) => conversation?.peerUserId)
      .filter(Boolean);

    if (!peerUserIds.length) {
      return;
    }

    fetchBatchPresence(peerUserIds).catch((error) => {
      console.error("Failed to fetch presence for conversation list:", error);
    });
  }, [displayedConversationList, fetchBatchPresence]);
  const isGroupLabelFilterActive =
    selectedGroupLabelFilter !== GROUP_LABEL_FILTER_ALL;
  const loadCloseFriendIds = useCallback(async () => {
    if (!currentUserId) {
      setCloseFriendIds(new Set());
      return;
    }

    try {
      const nextCloseFriendIds = await getCloseFriendIdsForCurrentUser();
      setCloseFriendIds(nextCloseFriendIds);
    } catch (error) {
      console.error("Failed to load close friend list:", error);
      setCloseFriendIds(new Set());
    }
  }, [currentUserId]);

  useEffect(() => {
    void loadCloseFriendIds();
  }, [loadCloseFriendIds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleCloseFriendSync = (event) => {
      const friendId = String(event?.detail?.friendId || "").trim();
      if (!friendId) {
        return;
      }

      const isCloseFriend = Boolean(event?.detail?.isCloseFriend);
      setCloseFriendIds((prevState) => {
        const nextState = new Set(prevState);
        if (isCloseFriend) {
          nextState.add(friendId);
        } else {
          nextState.delete(friendId);
        }
        return nextState;
      });
    };

    window.addEventListener(CLOSE_FRIEND_STATUS_CHANGED_EVENT, handleCloseFriendSync);
    return () => {
      window.removeEventListener(CLOSE_FRIEND_STATUS_CHANGED_EVENT, handleCloseFriendSync);
    };
  }, []);

  const isCloseFriendConversation = useCallback(
    (conversation) => {
      if (!conversation || String(conversation.type || "").toLowerCase() !== "private") {
        return false;
      }

      const peerUserId = String(conversation.peerUserId || "").trim();
      if (!peerUserId) {
        return false;
      }

      return closeFriendIds.has(peerUserId);
    },
    [closeFriendIds]
  );
  const loadFriendOptionsForCreateGroup = useCallback(async () => {
    const currentUserId = userData?._id || userData?.userId;

    if (!currentUserId) {
      return;
    }

    if (
      friendOptionsState.loading ||
      friendOptionsState.loaded ||
      friendOptionsState.attempted
    ) {
      return;
    }

    setFriendOptionsState({
      loading: true,
      loaded: false,
      attempted: true,
      error: "",
    });

    console.log("[WEB GROUP FRIEND OPTIONS CREATE]", {
      status: "loading",
      currentUserId,
    });

    try {
      const response = await getFriendsV2();
      const nextFriends = mapFriendOptions(response.data);

      console.log("[WEB GROUP FRIEND OPTIONS CREATE]", {
        status: "loaded",
        count: nextFriends.length,
      });

      setFriendOptions(nextFriends);
      setFriendOptionsState({
        loading: false,
        loaded: true,
        attempted: true,
        error: "",
      });
    } catch (error) {
      console.error("[WEB GROUP FRIEND OPTIONS CREATE]", error);
      setFriendOptionsState({
        loading: false,
        loaded: false,
        attempted: true,
        error: "Không thể tải danh sách bạn bè.",
      });
    }
  }, [
    friendOptionsState.loaded,
    friendOptionsState.loading,
    friendOptionsState.attempted,
    userData?._id,
    userData?.userId,
  ]);

  useEffect(() => {
    if (addUser.group) {
      loadFriendOptionsForCreateGroup();
    }
  }, [addUser.group, loadFriendOptionsForCreateGroup]);

  useEffect(() => {
    const handleDocumentClick = () => setOpenConversationMenuId(null);
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  // useEffect(() => {
  //   const local = localStorage.getItem("user-search");
  //   if (local !== null) {
  //     setDataSearch((prevState) => {
  //       return {
  //         ...prevState,
  //         recent: JSON.parse(local),
  //       };
  //     });
  //   }
  // }, []);
  useEffect(() => {
  try {
    const userId = userData?._id || userData?.userId || "guest";
    const storageKey = getRecentSearchStorageKey(userId);
    const local = localStorage.getItem(storageKey);

    setDataSearch((prevState) => ({
      ...prevState,
      recent: local ? JSON.parse(local) : [],
    }));
  } catch {
    setDataSearch((prevState) => ({
      ...prevState,
      recent: [],
    }));
  }
}, [userData?._id, userData?.userId]);


  useEffect(() => {
    if (textSearch === "") {
      clearTimeout(searchTimeout.current);
      searchRequestIdRef.current += 1;
      setDataSearch((prevState) => ({
        ...prevState,
        response: [],
        loading: false,
        error: "",
      }));
      setIsSearch((prevState) => {
        return {
          ...prevState,
          recent: true,
          response: false,
        };
      });
    }
  }, [textSearch]);

  // const handleSearchDb = (value) => {
  //   if (value !== "") {
  //     if (searchTimeout.current) {
  //       clearTimeout(searchTimeout.current);
  //     }
  //     searchTimeout.current = setTimeout(async () => {
  //       const response = await getFriendByName({
  //         friendName: value,
  //         userId: userData._id,
  //       });
  //       if (response.status === 200) {
  //         setDataSearch((prevState) => {
  //           return {
  //             ...prevState,
  //             response: response.data,
  //           };
  //         });
  //       } else {
  //         setDataSearch((prevState) => {
  //           return {
  //             ...prevState,
  //             response: [],
  //           };
  //         });
  //       }
  //       setIsSearch((prevState) => {
  //         return {
  //           ...prevState,
  //           response: true,
  //           recent: false,
  //         };
  //       });
  //     }, 300);
  //   }
  // };

const handleSearchDb = (value) => {
  const keyword = String(value || "").trim();
  if (searchTimeout.current) {
    clearTimeout(searchTimeout.current);
  }

  if (!keyword) {
    return;
  }

  const requestId = searchRequestIdRef.current + 1;
  searchRequestIdRef.current = requestId;
  setDataSearch((prevState) => ({
    ...prevState,
    loading: true,
    error: "",
  }));

  searchTimeout.current = setTimeout(async () => {
    const normalizedKeyword = normalizeContactSearchText(keyword);
    const localConversationResults = baseDisplayedConversationList
      .filter((conversation) => {
        const displayName = normalizeContactSearchText(
          getConversationDisplayName(conversation)
        );
        const preview = normalizeContactSearchText(
          getConversationPreview(conversation, currentUserId)
        );
        return displayName.includes(normalizedKeyword) || preview.includes(normalizedKeyword);
      })
      .map((conversation) => ({
        ...conversation,
        _searchMatch: {
          type: "conversation",
          content: getConversationPreview(conversation, currentUserId),
        },
      }));

    const [usersResult, messagesResult] = await Promise.allSettled([
      searchUsersV2({ keyword }),
      searchMessagesV1(keyword),
    ]);

    if (requestId !== searchRequestIdRef.current) {
      return;
    }

    const matchedUsers =
      usersResult.status === "fulfilled" && Array.isArray(usersResult.value?.data)
        ? usersResult.value.data
            .filter((item) => item.relationshipStatus === "FRIEND")
            .map(mapSearchUserToUi)
        : [];
    const matchedMessages =
      messagesResult.status === "fulfilled" && Array.isArray(messagesResult.value)
        ? messagesResult.value
        : [];
    const conversationById = new Map(
      baseDisplayedConversationList.map((conversation) => [
        String(conversation?.id || ""),
        conversation,
      ])
    );
    const privateConversationByPeerId = new Map(
      baseDisplayedConversationList
        .filter((conversation) => String(conversation?.type || "").toLowerCase() === "private")
        .map((conversation) => [
          String(conversation?.peerUserId || ""),
          conversation,
        ])
    );
    const mergedResults = new Map();

    localConversationResults.forEach((conversation) => {
      mergedResults.set(getSidebarSearchItemKey(conversation), conversation);
    });
    matchedMessages.forEach((message) => {
      const conversation = conversationById.get(String(message?.conversationId || ""));
      if (!conversation) {
        return;
      }

      const resultKey = getSidebarSearchItemKey(conversation);
      if (mergedResults.get(resultKey)?._searchMatch?.type === "message") {
        return;
      }

      mergedResults.set(resultKey, {
        ...conversation,
        _searchMatch: {
          type: "message",
          content: message?.content || "",
          senderDisplayName: message?.senderDisplayName || "",
        },
      });
    });
    matchedUsers.forEach((user) => {
      const privateConversation = privateConversationByPeerId.get(String(user?.userId || ""));
      const result = privateConversation
        ? {
            ...privateConversation,
            _searchMatch: {
              type: "contact",
              content: "Liên hệ trong danh sách bạn bè",
            },
          }
        : user;
      const resultKey = getSidebarSearchItemKey(result);
      if (!mergedResults.has(resultKey)) {
        mergedResults.set(resultKey, result);
      }
    });

    setDataSearch((prevState) => ({
      ...prevState,
      response: Array.from(mergedResults.values()),
      loading: false,
      error:
        usersResult.status === "rejected" && messagesResult.status === "rejected"
          ? "Không thể tìm kiếm lúc này."
          : "",
    }));

    setIsSearch((prevState) => ({
      ...prevState,
      response: true,
      recent: false,
    }));
  }, 300);
};


  const handleChangeTextSearch = (e) => {
    let data = e.target.value;
    setTextSearch(data);
    handleSearchDb(data);
  };

  const handleChangeShowMessSeen = (value) => {
    setAllMessActive(value);
  };

  const handleChangeIsSearch = (value) => {
    setIsSearch((prevState) => {
      return {
        ...prevState,
        state: value,
      };
    });
    if (!value) {
      searchRequestIdRef.current += 1;
      setTextSearch("");
    }
  };

  const handleToggleArchivedView = async () => {
    setConversationSettingsError("");

    if (!showArchived) {
      try {
        await fetchArchivedConversations();
      } catch (error) {
        console.error("Failed to load archived conversations:", error);
        setConversationSettingsError("Không thể tải danh sách lưu trữ.");
        return;
      }
    }

    setShowArchived((prevState) => !prevState);
  };

  const handleConversationSettingChange = async (event, conversation, action) => {
    event.stopPropagation();

    const conversationId = conversation?.id;
    if (!conversationId) {
      return;
    }

    setConversationSettingsError("");
    setPendingConversationId(conversationId);

    try {
      if (action === "pin") {
        const nextPinned = !conversation.pinned;
        await updateConversationPinV1(conversationId, nextPinned);
        updateConversationById(conversationId, { pinned: nextPinned });
      }

      if (action === "archive") {
        const nextArchived = !conversation.archived;
        await updateConversationArchiveV1(conversationId, nextArchived);
        updateConversationById(conversationId, { archived: nextArchived });
      }

      if (action === "mute") {
        const nextMuted = !conversation.muted;
        await updateConversationMuteV1(conversationId, nextMuted);
        updateConversationById(conversationId, { muted: nextMuted });
      }
    } catch (error) {
      console.error("Failed to update conversation setting:", error);
      setConversationSettingsError("Không thể cập nhật thiết lập hội thoại.");
    } finally {
      setPendingConversationId(null);
    }
  };

  // const handleChoiceContact = (value) => {
  //   storeLocal(value);
  //   handleChangeContact({ ...value, userId: userData._id });
  //   setIsSearch((prevState) => {
  //     return {
  //       ...prevState,
  //       state: false,
  //     };
  //   });
  //   setTextSearch("");
  // };

  const handleChoiceContact = (value) => {
    storeLocal(value);
    handleChangeContact({
      ...value,
      userId: value?.userId || value?._id,
    });
    setIsSearch((prevState) => {
      return {
        ...prevState,
        state: false,
      };
    });
    setTextSearch("");
  };


  // const storeLocal = (value) => {
  //   setDataSearch((prevState) => {
  //     const filterRecent = prevState.recent.filter((x) => x._id !== value._id);
  //     return {
  //       response: prevState.response,
  //       recent: [value, ...filterRecent],
  //     };
  //   });
  //   localStorage.setItem("user-search", JSON.stringify(dataSearch.recent));
  // };

const storeLocal = (value) => {
  const userId = userData?._id || userData?.userId || "guest";
  const storageKey = getRecentSearchStorageKey(userId);
  const selectedId = getSearchItemId(value);

  const nextRecent = [
    value,
    ...dataSearch.recent.filter((item) => getSearchItemId(item) !== selectedId),
  ].slice(0, 10);

  setDataSearch((prevState) => ({
    ...prevState,
    recent: nextRecent,
  }));

  localStorage.setItem(storageKey, JSON.stringify(nextRecent));
};



  // const handleShowAddFriend = (value) => {
  //   setAddUser((prevState) => {
  //     return {
  //       ...prevState,
  //       friend: value,
  //     };
  //   });

  //   if (!value) {
  //     setDataUserPhone({
  //       username: "",
  //       show: false,
  //       data: null,
  //       state: null,
  //       cancel: null,
  //     });
  //   }
  // };

  const handleShowAddFriend = (value) => {
  setAddUser((prevState) => ({
    ...prevState,
    friend: value,
  }));

  if (!value) {
    setFriendSearch({
      keyword: "",
      loading: false,
      searched: false,
      results: [],
      error: "",
    });
  }
};


  const handleShowAddGroup = (value) => {
    if (value) {
      setCreateGroupError("");
      if (friendOptionsState.error) {
        setFriendOptionsState((prevState) => ({
          ...prevState,
          attempted: false,
          error: "",
        }));
      }
    }

    setAddUser((prevState) => {
      return {
        ...prevState,
        group: value,
      };
    });

    if (!value && !isCreatingGroup) {
      setCreateGroupError("");
    }
  };

  const handleAddMember = (value) => {
    if (!value || isCreatingGroup) {
      return;
    }

    setDataCreateGr((prevState) => {
      const check = prevState.listMember.includes(value);
      if (check) {
        const filter = prevState.listMember.filter((item) => item !== value);
        return {
          ...prevState,
          listMember: [...filter],
        };
      }

      return {
        ...prevState,
        listMember: [value, ...prevState.listMember],
      };
    });
    setCreateGroupError("");
  };

  const handleCreateGroup = async () => {
    if (isCreatingGroup) {
      return;
    }

    const groupName = String(dataCreateGr.username || "").trim();
    const participantIds = dataCreateGr.listMember.filter(Boolean);

    if (!groupName) {
      setCreateGroupError("Vui lòng nhập tên nhóm.");
      return;
    }

    if (participantIds.length < 2) {
      console.log("[GROUP VALIDATION]", {
        source: "web-message-create",
        participantCount: participantIds.length,
      });
      setCreateGroupError("Vui lòng chọn ít nhất 2 thành viên.");
      return;
    }

    setCreateGroupError("");
    setIsCreatingGroup(true);

    console.log("[WEB GROUP CREATE SUBMIT]", {
      groupNameLength: groupName.length,
      participantCount: participantIds.length,
    });

    try {
      const response = await createConversationV1({
        type: "GROUP",
        name: groupName,
        participantIds,
      });
      const createdConversationId = response?.id;
      const selectedAvatarUrl = String(dataCreateGr.avatar || "").trim();
      const selectedAvatarFile = dataCreateGr.avatarFile || null;
      const selectedMembers = friendOptions
        .filter((friend) =>
          participantIds.some(
            (participantId) => String(participantId) === String(friend.userId)
          )
        )
        .map((friend) => ({
          userId: friend.userId,
          username: friend.username || "",
          displayName: friend.displayName || friend.username || String(friend.userId),
          avatarUrl: friend.avatarUrl || friend.avatar || "",
          role: "MEMBER",
        }));
      const currentUserId = userData?.userId || userData?._id || null;
      const currentUserMember = currentUserId
        ? {
            userId: currentUserId,
            username: userData?.username || "",
            displayName: userData?.displayName || userData?.username || "Ban",
            avatarUrl: userData?.avatarUrl || userData?.avatar || "",
            role: "OWNER",
          }
        : null;
      const nextMembers = [
        ...(currentUserMember ? [currentUserMember] : []),
        ...selectedMembers,
      ];
      const createdConversationPayload = Array.isArray(response?.members)
        ? response
        : {
            ...response,
            members: nextMembers,
            raw: {
              ...(response?.raw || response || {}),
              members: nextMembers,
            },
          };
      let nextConversation = mapConversation({
        ...createdConversationPayload,
      });

      upsertConversation(nextConversation);
      console.log("[WEB PHASE2 GROUP MEMBERS]", {
        source: "create-group",
        conversationId: nextConversation?.id,
        usedBackendMembers: Array.isArray(response?.members),
        memberCount: Array.isArray(nextConversation?.members)
          ? nextConversation.members.length
          : 0,
      });
      console.log("[WEB GROUP METADATA SYNC]", {
        source: "create-group",
        conversationId: nextConversation?.id,
        displayName: nextConversation?.displayName,
        avatarUrl: nextConversation?.avatarUrl || "",
      });

      if (createdConversationId && (selectedAvatarFile || selectedAvatarUrl)) {
        console.log("[GROUP AVATAR UPLOAD]", {
          source: "web-message-create",
          status: "submitting",
          conversationId: createdConversationId,
          uploadMode: selectedAvatarFile ? "file" : "url",
        });

        try {
          let resolvedAvatarUrl = selectedAvatarUrl;
          if (selectedAvatarFile) {
            const uploadResult = await uploadAttachmentV1(selectedAvatarFile);
            resolvedAvatarUrl = String(uploadResult?.url || "").trim();
          }

          if (!resolvedAvatarUrl) {
            throw new Error("Missing uploaded avatar URL");
          }

          const avatarResponse = await updateConversationAvatarV1(
            createdConversationId,
            resolvedAvatarUrl
          );
          const avatarConversationPayload = Array.isArray(avatarResponse?.members)
            ? avatarResponse
            : {
                ...avatarResponse,
                members: nextMembers,
                raw: {
                  ...(avatarResponse?.raw || avatarResponse || {}),
                  members: nextMembers,
                },
              };
          nextConversation = mapConversation({
            ...avatarConversationPayload,
          });
          upsertConversation(nextConversation);
          console.log("[WEB PHASE2 GROUP MEMBERS]", {
            source: "create-group-avatar-followup",
            conversationId: nextConversation?.id,
            usedBackendMembers: Array.isArray(avatarResponse?.members),
            memberCount: Array.isArray(nextConversation?.members)
              ? nextConversation.members.length
              : 0,
          });
          console.log("[GROUP AVATAR UPLOAD]", {
            source: "web-message-create",
            status: "success",
            conversationId: createdConversationId,
            avatarUrl: nextConversation?.avatarUrl || "",
          });
          console.log("[WEB GROUP METADATA SYNC]", {
            source: "create-group-avatar-followup",
            conversationId: nextConversation?.id,
            displayName: nextConversation?.displayName,
            avatarUrl: nextConversation?.avatarUrl || "",
          });
        } catch (avatarError) {
          console.error("[GROUP AVATAR UPLOAD]", {
            source: "web-message-create",
            status: "failed",
            conversationId: createdConversationId,
            error: avatarError,
          });
          setConversationSettingsError(
            "Đã tạo nhóm, nhưng không thể cập nhật ảnh đại diện."
          );
        }
      }

      handleChangeContact(nextConversation);
      handleShowAddGroup(false);
      setDataCreateGr({
        username: "",
        listMember: [],
        showAvt: false,
        avatar: null,
        avatarFile: null,
        avatarPreview: "",
      });
    } catch (error) {
      console.error("[WEB GROUP CREATE SUBMIT]", error);
      setCreateGroupError(
        getApiErrorMessage(error, "Không thể tạo nhóm. Vui lòng thử lại.")
      );
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleShowAvatarGr = (value) => {
    setDataCreateGr((prevState) => {
      return {
        ...prevState,
        showAvt: value,
      };
    });
  };

  const handleChoiceAvatarGr = (value) => {
    console.log("[GROUP AVATAR PICK]", {
      source: "web-message-create",
      mode: "preset",
      value,
    });
    setDataCreateGr((prevState) => {
      return {
        ...prevState,
        avatar: value,
        avatarFile: null,
        avatarPreview: value,
      };
    });
  };

  const handleChangURl = (e) => {
    const nextValue = e.target.value;
    setDataCreateGr((prevState) => {
      return {
        ...prevState,
        avatar: nextValue,
        avatarFile: null,
        avatarPreview: nextValue,
      };
    });
  };

  const handleGroupAvatarFilePick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    console.log("[GROUP AVATAR PICK]", {
      source: "web-message-create",
      mode: "file",
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
    });
    setDataCreateGr((prevState) => {
      return {
        ...prevState,
        avatar: null,
        avatarFile: file,
        avatarPreview: previewUrl,
      };
    });
  };

  const handleRemoveGroupAvatar = () => {
    setDataCreateGr((prevState) => {
      return {
        ...prevState,
        avatar: null,
        avatarFile: null,
        avatarPreview: "",
      };
    });
  };

  const handleSaveAvatarGr = () => {
    if (String(dataCreateGr.avatar || "").trim()) {
      handleShowAvatarGr(false);
    }
  };
  const handleChangeNameGr = (e) => {
    setCreateGroupError("");
    setDataCreateGr((prevState) => {
      return {
        ...prevState,
        username: e.target.value,
      };
    });
  };
  // const handleChangePhone = (e) => {
  //   setDataUserPhone((prevState) => {
  //     return {
  //       ...prevState,
  //       username: e.target.value,
  //     };
  //   });
  // };
  const handleChangeSearchKeyword = (e) => {
  setFriendSearch((prevState) => ({
    ...prevState,
    keyword: e.target.value,
    error: "",
  }));
};

  const handleFindUserByPhone = async () => {
    if (dataUserPhone.username !== "") {
      const response = await getUserByPhone({
        phone: dataUserPhone.username,
        id: userData._id,
      });
      if (response.status === 200) {
        setDataUserPhone({
          username: "",
          show: true,
          data: response.data.data,
          state: response.data.state,
          cancel: response.data.cancel ? response.data.cancel : null,
          unfriend: response.data.unfriend ? response.data.unfriend : null,
        });
      } else {
        setDataUserPhone({
          username: "",
          show: false,
          data: null,
          state: response.data.state,
          cancel: null,
          unfriend: null,
        });
      }
    }
  };

  const handleFindUsersForAddFriend = async () => {
  const keyword = friendSearch.keyword.trim();

  if (!keyword) {
    setFriendSearch((prevState) => ({
      ...prevState,
      searched: true,
      results: [],
      error: "Vui lòng nhập tên, username, họ tên hoặc số điện thoại",
    }));
    return;
  }

  setFriendSearch((prevState) => ({
    ...prevState,
    loading: true,
    searched: false,
    error: "",
  }));

  try {
    const response = await searchUsersV2({ keyword });

    const results = Array.isArray(response.data)
      ? response.data.map(mapSearchUserToUi)
      : [];

    setFriendSearch((prevState) => ({
      ...prevState,
      loading: false,
      searched: true,
      results,
      error: "",
    }));
  } catch (error) {
    console.error("Failed to search users for add friend:", error);

    setFriendSearch((prevState) => ({
      ...prevState,
      loading: false,
      searched: true,
      results: [],
      error: "Không thể tìm kiếm lúc này",
    }));
  }
};

  const handleCRUDFriend = async (friendId, state) => {
    const response = await crudFriend({
      userId: userData._id,
      friendId: friendId,
      state: state,
    });

    if (response.status === 200) {
      fetchConversation();
    }
  };
const handleSendFriendRequestFromSearch = async (user) => {
  if (!user?.userId || user.relationshipStatus !== "NONE") {
    return;
  }

  try {
    const response = await sendFriendRequestV2({ receiverId: user.userId });

    if (response.status === 200) {
      setFriendSearch((prevState) => ({
        ...prevState,
        results: prevState.results.map((item) =>
          item.userId === user.userId
            ? { ...item, relationshipStatus: "REQUEST_SENT" }
            : item
        ),
      }));
    }
  } catch (error) {
    console.error("Failed to send friend request:", error);
  }
};

useEffect(() => {
  if (!currentUserId) {
    return undefined;
  }

  const subscriptionKey = `message-contact:friends:${currentUserId}`;
  chatRealtimeService
    .subscribe(
      subscriptionKey,
      getFriendRealtimeDestination(currentUserId),
      async (event) => {
        if (!isFriendRealtimeEvent(event)) {
          return;
        }

        if (addUser.group) {
          try {
            const response = await getFriendsV2();
            setFriendOptions(mapFriendOptions(response.data));
            setFriendOptionsState((prevState) => ({
              ...prevState,
              loaded: true,
              loading: false,
              attempted: true,
              error: "",
            }));
          } catch (error) {
            console.error("Failed to refresh message friend options:", error);
          }
        }

        const keyword = String(friendSearch.keyword || "").trim();
        if (addUser.friend && keyword) {
          try {
            const response = await searchUsersV2({ keyword });
            const results = Array.isArray(response.data)
              ? response.data.map(mapSearchUserToUi)
              : [];

            setFriendSearch((prevState) => ({
              ...prevState,
              loading: false,
              searched: true,
              results,
              error: "",
            }));
          } catch (error) {
            console.error("Failed to refresh message friend search:", error);
          }
        }
      }
    )
    .catch((error) => {
      console.error("Failed to subscribe friend realtime in message contact:", error);
    });

  return () => {
    chatRealtimeService.unsubscribe(subscriptionKey);
  };
}, [addUser.friend, addUser.group, currentUserId, friendSearch.keyword]);

const handleClearRecentSearch = () => {
  const userId = userData?._id || userData?.userId || "guest";
  const storageKey = getRecentSearchStorageKey(userId);

  setDataSearch((prevState) => ({
    ...prevState,
    recent: [],
  }));

  localStorage.removeItem(storageKey);
};

const isCreateGroupSubmitDisabled =
  isCreatingGroup ||
  !String(dataCreateGr.username || "").trim() ||
  dataCreateGr.listMember.length < 2;

  return (
    <>
      <div className="contact-container-contact">
        <div className="contact-contact-search ">
          <div className="flex">
            <div className="contact-group-search flex">
              <CiSearch className="icon-search" />
              <input
                type="text"
                value={textSearch}
                onChange={handleChangeTextSearch}
                placeholder="Tìm kiếm"
                onClick={() => handleChangeIsSearch(true)}
              />
            </div>
            {isSearch.state ? (
              <div className="btn-close-search">
                <p onClick={() => handleChangeIsSearch(false)}>Đóng</p>
              </div>
            ) : (
              <div className="contact-group-add-user flex">
                <HiOutlineUserPlus
                  className="icon-user-contact"
                  onClick={() => handleShowAddFriend(true)}
                />
                <HiOutlineUserGroup
                  className="icon-user-contact"
                  onClick={() => handleShowAddGroup(true)}
                />
              </div>
            )}
            <div className="add-friend-group">
              {addUser.friend && (
                <div className="screen-mask">
                  <div className="wrap-add modal-add-friend">
                    <div className="header-add-friend flex">
                      <p>Add Friend</p>
                      <IoMdClose
                        className="btn-close"
                        onClick={() => handleShowAddFriend(false)}
                      />
                    </div>
                    
                    <div className="modal-body-content">
                      <div className="search-input-container">
                        <svg className="search-input-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.608 10.608Z" />
                        </svg>
                        <input
                          type="text"
                          value={friendSearch.keyword}
                          onChange={handleChangeSearchKeyword}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleFindUsersForAddFriend()
                            }
                          }}
                          placeholder="Enter name, username, or phone number"
                        />
                      </div>
                      <div className="modal-section-label">SEARCH RESULTS</div>
                      <div className="friend-search-results-wrapper">
                        {friendSearch.error ? (
                          <div className="search-error-message">{friendSearch.error}</div>
                        ) : null}

                        {friendSearch.searched &&
                        friendSearch.results.length === 0 &&
                        !friendSearch.error ? (
                          <div className="search-empty-box">
                            <div className="empty-icon-circle flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                              </svg>
                            </div>
                            <p>No results yet. Enter a friend's details above to find them on Nexus.</p>
                          </div>
                        ) : null}

                        {!friendSearch.searched && !friendSearch.error ? (
                          <div className="search-empty-box">
                            <div className="empty-icon-circle flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                              </svg>
                            </div>
                            <p>No results yet. Enter a friend's details above to find them on Nexus.</p>
                          </div>
                        ) : null}

                        {friendSearch.results.length > 0 && (
                          <div className="friend-search-results-list">
                            {friendSearch.results.map((user) => {
                              const action = getFriendActionMeta(user.relationshipStatus)
                              return (
                                <div key={user.userId} className="friend-search-item flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="friend-search-avatar">
                                      {user.avatar || user.avatarUrl ? (
                                        <img src={user.avatar || user.avatarUrl} alt="" />
                                      ) : (
                                        <div className="avatar-initials">
                                          {(user.displayName || user.username || '?').charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <p className="username">{user.displayName || user.username}</p>
                                      {user.username ? (
                                        <p className="friend-search-subtitle">@{user.username}</p>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div>
                                    <button
                                      className="btn-add-friend-action"
                                      disabled={action.disabled}
                                      onClick={() => handleSendFriendRequestFromSearch(user)}
                                    >
                                      {action.label}
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="modal-footer flex">
                      <button className="btn-cancel" type="button" onClick={() => handleShowAddFriend(false)}>
                        Cancel
                      </button>
                      <button
                        className="btn-submit"
                        type="button"
                        onClick={handleFindUsersForAddFriend}
                        disabled={friendSearch.loading}
                      >
                        {friendSearch.loading ? 'Searching...' : 'Search'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {dataCreateGr.showAvt && (
                <div className="screen-mask" style={{ zIndex: 12001 }}>
                  <div className="choice-avatar-gr">
                    <div className="header-add-friend flex">
                      <p>Cập nhật ảnh đại diện</p>
                      <IoMdClose
                        className="btn-close"
                        onClick={() => handleShowAvatarGr(false)}
                      />
                    </div>
                    <div className="input-number-group">
                      <CiSearch className="icon-search" />
                      <input
                        type="text"
                        placeholder="Nhập url hình ảnh"
                        value={dataCreateGr.avatar}
                        onChange={handleChangURl}
                      />
                    </div>
                    <div>
                      <ul className="ex-avatar flex">
                        {listAvatarGr?.map((item, index) => (
                          <li
                            key={index}
                            onClick={() => handleChoiceAvatarGr(item)}
                          >
                            <img
                              src={item}
                              alt=""
                              className={
                                item === dataCreateGr.avatar
                                  ? "ex-avatar-choice"
                                  : ""
                              }
                            />
                          </li>
                        ))}
                      </ul>
                      <div
                        className="btn-find-friend flex"
                        style={{ position: "relative" }}
                      >
                        <button onClick={() => handleShowAvatarGr(false)}>
                          Hủy
                        </button>
                        <button
                          onClick={handleSaveAvatarGr}
                          style={{ backgroundColor: "#0068ff", color: "white" }}
                        >
                          Cập nhật
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {addUser.group && (
                <div className="screen-mask">
                  <div className="wrap-add wrap-add-group">
                    <div className="header-add-friend flex">
                      <p>Create Group</p>
                      <IoMdClose
                        className="btn-close"
                        onClick={() => handleShowAddGroup(false)}
                      />
                    </div>
                    
                    <div className="modal-body-content">
                      <input
                        ref={groupAvatarInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handleGroupAvatarFilePick}
                      />
                      
                      <div className="group-info-inputs-container flex">
                        <div className="group-avatar-dashed-picker-wrapper">
                          <div 
                            className="group-avatar-dashed-picker flex items-center justify-center"
                            onClick={() => handleShowAvatarGr(true)}
                          >
                            {dataCreateGr.avatarPreview || dataCreateGr.avatar ? (
                              <img
                                src={dataCreateGr.avatarPreview || dataCreateGr.avatar}
                                alt="Group Preview"
                                className="group-avatar-preview-img"
                              />
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 camera-svg">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                              </svg>
                            )}
                            <div 
                              className="avatar-add-badge flex items-center justify-center"
                              onClick={(e) => {
                                e.stopPropagation()
                                groupAvatarInputRef.current?.click()
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                            </div>
                          </div>
                        </div>

                        <div className="group-name-input-wrapper flex flex-col">
                          <div className="modal-section-label">GROUP NAME</div>
                          <div className="input-number group">
                            <input
                              type="text"
                              placeholder="Enter group name..."
                              onChange={handleChangeNameGr}
                              value={dataCreateGr.username}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="modal-section-label" style={{ marginTop: 24 }}>SELECT MEMBERS</div>
                      
                      <div className="search-input-container">
                        <svg className="search-input-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.608 10.608Z" />
                        </svg>
                        <input
                          type="text"
                          placeholder="Enter name or phone..."
                        />
                      </div>

                      <div className="list-contact">
                        {friendOptionsState.loading ? (
                          <p className="contact-feedback-error">
                            Loading friends list...
                          </p>
                        ) : null}
                        {!friendOptionsState.loading && friendOptionsState.error ? (
                          <p className="contact-feedback-error">
                            {friendOptionsState.error}
                          </p>
                        ) : null}
                        {!friendOptionsState.loading &&
                        !friendOptionsState.error &&
                        friendOptionsState.loaded &&
                        friendOptions.length === 0 ? (
                          <p className="contact-feedback-error">
                            No friends available to create group.
                          </p>
                        ) : null}
                        {friendOptions &&
                          friendOptions.map((item, index) => {
                            const isChecked = dataCreateGr.listMember.includes(item.userId)
                            // Generate visual status matching the mockup
                            const statuses = ['Online', 'Last seen 2h ago', 'Busy', 'Offline']
                            const statusIdx = Math.abs(String(item.userId).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % statuses.length
                            const statusText = statuses[statusIdx]

                            return (
                              <li
                                key={item.userId || index}
                                onClick={() => handleAddMember(item.userId)}
                                className="contact-member-item"
                              >
                                <div className="contact-detial-conversation flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="contact-avatar-friend">
                                      {item.avatarUrl ? (
                                        <img src={item.avatarUrl} alt="" />
                                      ) : (
                                        <div className="avatar-initials">
                                          {(item.displayName || '?').charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                    <div className="contact-overview-mess">
                                      <h3>{item.displayName}</h3>
                                      <span className={`status-text ${statusText.toLowerCase().replace(/ /g, '-')}`}>{statusText}</span>
                                    </div>
                                  </div>
                                  <div className="checkbox-add">
                                    <div className={`custom-checkbox ${isChecked ? 'checked' : ''}`}>
                                      {isChecked && (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </li>
                            )
                          })}
                      </div>
                      
                      {createGroupError ? (
                        <p className="contact-feedback-error">
                          {createGroupError}
                        </p>
                      ) : null}
                      {isCreatingGroup ? (
                        <p className="contact-feedback-error">
                          Creating group...
                        </p>
                      ) : null}
                    </div>

                    <div className="modal-footer flex">
                      <button
                        className="btn-cancel"
                        type="button"
                        onClick={() => handleShowAddGroup(false)}
                        disabled={isCreatingGroup}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn-submit"
                        type="button"
                        onClick={handleCreateGroup}
                        disabled={isCreateGroupSubmitDisabled}
                        style={{
                          backgroundColor: isCreateGroupSubmitDisabled ? '#93c5fd' : '#0068ff',
                          cursor: isCreateGroupSubmitDisabled ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Create Group
                        {dataCreateGr.listMember.length < 1
                          ? ''
                          : ` (${dataCreateGr.listMember.length})`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {((!showPageAddressBook && !isSearch.state) ||
            (isSearch.response && !isSearch.recent)) && (
            <div className="contact-filter-converstation flex">
              <div className="contact-left-filter">
                <div className="flex">
                  <p
                    className={`${allMessActive ? "all-mess-active" : ""}`}
                    onClick={() => handleChangeShowMessSeen(true)}
                  >
                    Tất cả
                  </p>
                  <div>
                    {!isSearch.state ? (
                      <p
                        onClick={() => handleChangeShowMessSeen(false)}
                        className={`${allMessActive ? "" : "all-mess-active"}`}
                      >
                        Chưa đọc
                      </p>
                    ) : (
                      <p
                        // onClick={() => handleChangeShowMessSeen(true)}
                        className={`${allMessActive ? "" : "all-mess-active"}`}
                      >
                        Liên hệ
                      </p>
                    )}
                  </div>
                  <hr
                    className={`contact-hr-left-filter ${
                      allMessActive ? "" : "contact-hr-left-filter-active"
                    }`}
                  />
                </div>
              </div>
              {!isSearch.state ? (
                <div className="contact-right-filter">
                  <div className="contact- flex">
                    <div className="contact-more-filter">
                      <IoIosMore className="icon-filter" />
                    </div>
                  </div>
                </div>
              ) : (
                ""
              )}
            </div>
          )}
          {conversationSettingsError ? (
            <p className="contact-feedback-error">
              {conversationSettingsError}
            </p>
          ) : null}
          {!isSearch.state ? (
            <div className="contact-list-status-row">
              <div className="contact-list-status-main">
                <button
                  type="button"
                  className={`contact-list-scope-chip ${showArchived ? "archived" : "active"}`}
                  onClick={handleToggleArchivedView}
                  title={
                    showArchived
                      ? "Chuyển sang danh sách hội thoại"
                      : "Chuyển sang danh sách lưu trữ"
                  }
                >
                  {showArchived ? "Xem hội thoại" : "Xem lưu trữ"}
                </button>
                <span className="contact-list-scope-subtle">
                  {displayedConversationList.length}
                  {showArchived ? " mục" : " hội thoại"}
                </span>
              </div>
              <div className="contact-group-label-filter-wrap">
                <label htmlFor="contact-group-label-filter">Nhãn nhóm</label>
                <select
                  id="contact-group-label-filter"
                  value={selectedGroupLabelFilter}
                  onChange={(event) =>
                    setSelectedGroupLabelFilter(
                      String(event.target.value || GROUP_LABEL_FILTER_ALL)
                    )
                  }
                >
                  <option value={GROUP_LABEL_FILTER_ALL}>Tất cả</option>
                  {GROUP_LABEL_OPTIONS.map((labelOption) => (
                    <option key={labelOption.value} value={labelOption.value}>
                      {labelOption.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>
        {isSearch.state ? (
          <div className="recent-search">
            <ul className="wrap-recent-search">
              {isSearch.recent && (
                <div>
                  <div
                  style={{
                    margin: "10px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <p style={{ fontWeight: "500", margin: 0 }}>Tìm gần đây</p>
                  {dataSearch.recent.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleClearRecentSearch}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#0068ff",
                        cursor: "pointer",
                        fontWeight: "500",
                      }}
                    >
                      Xóa tất cả
                    </button>
                  ) : null}
                </div>

                  <div className="wrap-result-search">
                    {isSearch.recent &&
                      dataSearch.recent !== null &&
                      dataSearch.recent.map((item, index) => (
                        <li
                          key={getSearchItemId(item) || index}
                          onClick={() => handleChoiceContact(item)}
                        >
                          <div className="flex">
                            <img src={item.avatarUrl || undefined} alt="" />
                            <p>{item.displayName}</p>
                          </div>
                        </li>
                      ))}
                  </div>
                </div>
              )}

              {isSearch.response && (
                <div>
                  <div className="wrap-result-search">
                      {dataSearch.loading ? (
                        <p className="contact-search-feedback">Đang tìm kiếm...</p>
                      ) : null}
                      {dataSearch.error ? (
                        <p className="contact-search-feedback contact-search-feedback-error">
                          {dataSearch.error}
                        </p>
                      ) : null}
                      {!dataSearch.loading &&
                      !dataSearch.error &&
                      Array.isArray(dataSearch.response) &&
                      dataSearch.response.length === 0 ? (
                        <p className="contact-search-feedback">Không tìm thấy kết quả.</p>
                      ) : null}
                      {Array.isArray(dataSearch.response) &&
                        dataSearch.response.map((item, index) => (
                          <li
                            key={getSidebarSearchItemKey(item) || index}
                            onClick={() => handleChoiceContact(item)}
                          >
                            <div className="contact-search-result-main flex">
                              <img
                                src={item.avatar || item.avatarUrl || undefined}
                                alt=""
                              />
                              <div className="contact-search-result-copy">
                                <p className="contact-search-result-name">
                                  {item.displayName || item.username}
                                </p>
                                {item?._searchMatch?.content ? (
                                  <p className="contact-search-result-snippet">
                                    {item._searchMatch.senderDisplayName
                                      ? `${item._searchMatch.senderDisplayName}: `
                                      : ""}
                                    {item._searchMatch.content}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        ))}

                  </div>
                </div>
              )}
            </ul>
          </div>
        ) : (
          !showPageAddressBook && (
            <div className="contact-wrap-conversation">
              <div className="contact-listConversation">
                {allMessActive ? (
                  <ul>
                    {/* Hàng Trợ lý AI cố định */}
                    {!isGroupLabelFilterActive ? (
                      <li
                        className={
                          selectedConversationId === "AI_ASSISTANT"
                            ? "conversation-active"
                            : ""
                        }
                        onClick={() => {
                          handleChangeContact({
                            id: "AI_ASSISTANT",
                            displayName: "Trợ lý AI",
                            trustedDisplayName: "Trợ lý AI",
                            peerDisplayName: "Trợ lý AI",
                            type: "AI",
                            avatarUrl:
                              "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
                            trustedAvatarUrl:
                              "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
                          });
                        }}
                      >
                        <div className="contact-detial-conversation flex">
                          <div className="flex">
                            <div className="contact-avatar-friend">
                              <img
                                src="https://cdn-icons-png.flaticon.com/512/4712/4712035.png"
                                alt="AI"
                              />
                            </div>
                            <div className="contact-overview-mess">
                              <h3>
                                <span>Trợ lý AI</span>
                              </h3>
                              <p>Hỏi tôi bất cứ điều gì!</p>
                            </div>
                          </div>
                        </div>
                      </li>
                    ) : null}

                    {displayedConversationList &&
                      displayedConversationList.map((data, index) => {
                        const conversationPresenceStatus =
                          resolveConversationPresenceStatus(data, getPresenceForUser);
                        const isGroupConversation = isGroupConversationItem(data);

                        return (
                        <li
                          className={
                            data?.id === selectedConversationId
                              ? "conversation-active"
                              : ""
                          }
                          key={index}
                          onClick={() => {
                            setOpenConversationMenuId(null);
                            handleChangeContact(data);
                          }}
                        >
                          <div
                            className={`contact-detial-conversation flex ${
                              data?.pinned ? "contact-conversation-pinned" : ""
                            } ${data?.muted ? "contact-conversation-muted" : ""}`}
                          >
                            <div className="flex">
                              <div className="contact-avatar-friend">
                                <img
                                  src={getConversationAvatarUrl(data) || undefined}
                                  alt=""
                                />
                                {!isGroupConversation ? (
                                  <span
                                    className={`presence-dot contact-avatar-presence-dot ${
                                      conversationPresenceStatus?.online
                                        ? "presence-dot--online"
                                        : "presence-dot--offline"
                                    }`}
                                    aria-label={
                                      conversationPresenceStatus?.online
                                        ? "Dang hoat dong"
                                        : "Khong hoat dong"
                                    }
                                  />
                                ) : null}
                              </div>
                              <div className="contact-overview-mess">
                                <h3>
                                  <span>{getConversationDisplayName(data)}</span>
                                  <span className="contact-conversation-flags">
                                    {isCloseFriendConversation(data) ? (
                                      <span className="contact-conversation-pill close-friend">
                                        Bạn thân
                                      </span>
                                    ) : null}
                                    {(() => {
                                      const groupLabelMeta =
                                        resolveConversationGroupLabel(data);
                                      if (!groupLabelMeta) {
                                        return null;
                                      }
                                      return (
                                        <span
                                          className={`contact-conversation-pill group-label group-label-${groupLabelMeta.color}`}
                                        >
                                          {groupLabelMeta.label}
                                        </span>
                                      );
                                    })()}
                                    {data.pinned ? (
                                      <span
                                        className="contact-conversation-pill pinned icon-only"
                                        title="Đã ghim"
                                        aria-label="Đã ghim"
                                      >
                                        <BsPinAngleFill />
                                      </span>
                                    ) : null}
                                    {data.muted ? (
                                      <span
                                        className="contact-conversation-pill muted icon-only"
                                        title="Đã tắt thông báo"
                                        aria-label="Đã tắt thông báo"
                                      >
                                        <BsBellSlashFill />
                                      </span>
                                    ) : null}
                                  </span>
                                </h3>
                                <p title={getConversationPreview(data, currentUserId)}>
                                  {getConversationPreview(data, currentUserId)}
                                </p>
                              </div>
                            </div>
                            <div className="contact-last-onl flex">
                              {!isGroupConversation ? (
                                <p className="contact-row-status">
                                  <span
                                    className={`presence-dot ${
                                      conversationPresenceStatus?.online
                                        ? "presence-dot--online"
                                        : "presence-dot--offline"
                                    }`}
                                    aria-label={
                                      conversationPresenceStatus?.online
                                        ? "Đang hoạt động"
                                        : "Không hoạt động"
                                    }
                                  />
                                  <span className="presence-status-text">
                                    {conversationPresenceStatus?.text || "Không hoạt động"}
                                  </span>
                                </p>
                              ) : null}

                              <div
                                className={`conversation-more-menu ${
                                  String(openConversationMenuId || "") === String(data.id || "")
                                    ? "open"
                                    : ""
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                style={{
                                  flexDirection: "column",
                                  alignItems: "flex-end",
                                }}
                              >
                                <button
                                  type="button"
                                  className="conversation-more-trigger"
                                  aria-label="Mở tùy chọn hội thoại"
                                  aria-expanded={
                                    String(openConversationMenuId || "") === String(data.id || "")
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setOpenConversationMenuId((current) =>
                                      String(current || "") === String(data.id || "")
                                        ? null
                                        : data.id
                                    );
                                  }}
                                >
                                  <IoIosMore className="icon-more-conversation" />
                                </button>
                                <div
                                  className="box-del-conversation"
                                  key={index}
                                  style={{ width: 150, fontSize: 0 }}
                                >
                                  <p
                                    style={{ fontSize: 13 }}
                                    onClick={(event) =>
                                      handleConversationSettingChange(event, data, "pin")
                                    }
                                  >
                                    {data.pinned ? "Bo ghim" : "Ghim"}
                                  </p>
                                  <p
                                    style={{ fontSize: 13 }}
                                    onClick={(event) =>
                                      handleConversationSettingChange(event, data, "archive")
                                    }
                                  >
                          {data.archived ? "Mở hội thoại" : "Lưu trữ"}
                                  </p>
                                  <p
                                    style={{ fontSize: 13 }}
                                    onClick={(event) =>
                                      handleConversationSettingChange(event, data, "mute")
                                    }
                                  >
                                    {data.muted ? "Bật thông báo" : "Tắt thông báo"}
                                  </p>
                                  {pendingConversationId === data.id ? (
                                    <p style={{ fontSize: 13 }}>Đang cập nhật...</p>
                                  ) : null}
                                  <p>Xóa hội thoại</p>
                                </div>
                              </div>
                              {getUnreadConversationCount(data) > 0 && (
                                <div className="wrap-count-seen" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  {getUnreadConversationCount(data) >= 5 && (
                                    <div 
                                      className="ai-summary-trigger-sidebar"
                                      title="Tóm tắt tin nhắn bằng AI"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // Chúng ta sẽ xử lý việc mở Modal tóm tắt thông qua một Custom Event hoặc Context
                                        window.dispatchEvent(new CustomEvent('OPEN_AI_SUMMARY', { 
                                          detail: { conversationId: data.id } 
                                        }));
                                      }}
                                      style={{ cursor: 'pointer', fontSize: '16px' }}
                                    >
                                      ✨
                                    </div>
                                  )}
                                  <p className="count-seen">
                                    {getUnreadConversationCount(data)}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                        );
                      })}
                    {isGroupLabelFilterActive &&
                    displayedConversationList.length === 0 ? (
                      <li className="contact-group-label-empty">
                        Không có nhóm nào trong nhãn này.
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <ul>
                    {displayedConversationListNotSeen &&
                      displayedConversationListNotSeen.map((data, index) => {
                        const conversationPresenceStatus =
                          resolveConversationPresenceStatus(data, getPresenceForUser);
                        const isGroupConversation = isGroupConversationItem(data);

                        return (
                        <li
                          className={data?.id === selectedConversationId ? "conversation-active" : ""}
                          key={data?.id || index}
                          onClick={() => {
                            setOpenConversationMenuId(null);
                            handleChangeContact(data);
                          }}
                        >
                          <div
                            className={`contact-detial-conversation flex ${
                              data?.pinned ? "contact-conversation-pinned" : ""
                            } ${data?.muted ? "contact-conversation-muted" : ""}`}
                          >
                            <div className="flex">
                              <div className="contact-avatar-friend">
                                <img
                                  src={getConversationAvatarUrl(data) || undefined}
                                  alt=""
                                />
                                {!isGroupConversation ? (
                                  <span
                                    className={`presence-dot contact-avatar-presence-dot ${
                                      conversationPresenceStatus?.online
                                        ? "presence-dot--online"
                                        : "presence-dot--offline"
                                    }`}
                                    aria-label={
                                      conversationPresenceStatus?.online
                                        ? "Dang hoat dong"
                                        : "Khong hoat dong"
                                    }
                                  />
                                ) : null}
                              </div>
                              <div className="contact-overview-mess">
                                <h3>
                                  <span>{getConversationDisplayName(data)}</span>
                                  <span className="contact-conversation-flags">
                                    {isCloseFriendConversation(data) ? (
                                      <span className="contact-conversation-pill close-friend">
                                        Bạn thân
                                      </span>
                                    ) : null}
                                    {(() => {
                                      const groupLabelMeta =
                                        resolveConversationGroupLabel(data);
                                      if (!groupLabelMeta) {
                                        return null;
                                      }
                                      return (
                                        <span
                                          className={`contact-conversation-pill group-label group-label-${groupLabelMeta.color}`}
                                        >
                                          {groupLabelMeta.label}
                                        </span>
                                      );
                                    })()}
                                    {data?.pinned ? (
                                      <span
                                        className="contact-conversation-pill pinned icon-only"
                                        title="Đã ghim"
                                        aria-label="Đã ghim"
                                      >
                                        <BsPinAngleFill />
                                      </span>
                                    ) : null}
                                    {data?.muted ? (
                                      <span
                                        className="contact-conversation-pill muted icon-only"
                                        title="Đã tắt thông báo"
                                        aria-label="Đã tắt thông báo"
                                      >
                                        <BsBellSlashFill />
                                      </span>
                                    ) : null}
                                  </span>
                                </h3>
                                <p title={getConversationPreview(data, currentUserId)}>{getConversationPreview(data, currentUserId)}</p>
                              </div>
                            </div>
                            <div className="contact-last-onl flex">
                              {!isGroupConversation ? (
                                <p className="contact-row-status">
                                  <span
                                    className={`presence-dot ${
                                      conversationPresenceStatus?.online
                                        ? "presence-dot--online"
                                        : "presence-dot--offline"
                                    }`}
                                    aria-label={
                                      conversationPresenceStatus?.online
                                        ? "Đang hoạt động"
                                        : "Không hoạt động"
                                    }
                                  />
                                  <span className="presence-status-text">
                                    {conversationPresenceStatus?.text || "Không hoạt động"}
                                  </span>
                                </p>
                              ) : null}
                              {getUnreadConversationCount(data) > 0 ? (
                                <div className="wrap-count-seen">
                                  <p className="count-seen">{getUnreadConversationCount(data)}</p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                        );
                      })}
                    {isGroupLabelFilterActive &&
                    displayedConversationListNotSeen.length === 0 ? (
                      <li className="contact-group-label-empty">
                        Không có nhóm nào trong nhãn này.
                      </li>
                    ) : null}
                  </ul>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </>
  );
}

export default memo(Contact);





