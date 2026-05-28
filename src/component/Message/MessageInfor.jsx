import React, { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import "../../resource/style/Chat/messageInfor.css";
import { ThemeContext } from "../../Context/ThemeContext";
import { ContactContext } from "../../Context/ContactConext";
import { UserContext } from "../../Context/UserContext";
import { AiOutlineBell } from "react-icons/ai";
import { GoPin } from "react-icons/go";
import { HiOutlineArchiveBox } from "react-icons/hi2";
import { CiEdit } from "react-icons/ci";
import { IoTriangle } from "react-icons/io5";
import { IoMdClose } from "react-icons/io";
import { TbBackground } from "react-icons/tb";
import { mapFriendOptions } from "../../mappers/friendOptionMapper";
import {
  addConversationMemberV1,
  closeConversationV1,
  demoteConversationAdminV1,
  leaveConversationV1,
  promoteConversationAdminV1,
  renameConversationV1,
  removeConversationMemberV1,
  transferConversationOwnershipV1,
  updateConversationArchiveV1,
  updateConversationAvatarV1,
  updateConversationCustomNameV1,
  updateConversationMuteV1,
  updateConversationNotificationLevelV1,
  updateConversationBackgroundV1,
  updateConversationPinV1,
  uploadConversationBackgroundImageV1,
} from "../../services/chat/conversationApi";
import {
  fetchConversationSharedAttachments,
  fetchConversationSharedLinks,
} from "./conversationMedia";
import { getFriendsV2 } from "../../util/api";
import { uploadAttachmentV1 } from "../../services/chat/messageApi";
import {
  USER_BLOCK_STATUS_CHANGED_EVENT,
  blockUserForCurrentUser,
  isUserBlockedByCurrentUser,
  unblockUserForCurrentUser,
} from "../../services/userBlockApi";

const NOTIFICATION_OPTIONS = [
  { value: "ALL", label: "Tất cả" },
  { value: "MENTIONS_ONLY", label: "Chỉ khi có @username của bạn" },
  { value: "NONE", label: "Tắt" },
];
const BACKGROUND_COLOR_PRESETS = [
  "#f4f7fb",
  "#e6f4ff",
  "#fff2e8",
  "#fff1f1",
  "#eefbf2",
  "#f3ecff",
  "#1f2937",
  "#0f766e",
  "#34568b",
  "#b4426e",
];
const NOTIFICATION_LEVEL_HINTS = {
  ALL: "Nhận cập nhật cuộc trò chuyện như bình thường.",
  MENTIONS_ONLY:
    "Trong nhóm, mức này ưu tiên tin nhắn có token @username của bạn.",
  NONE: "Không ưu tiên cập nhật thông báo cho cuộc trò chuyện này.",
};
const PRIVATE_CONVERSATION_LABEL = "Người dùng";
const GROUP_CONVERSATION_LABEL = "Nhóm";
const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getApiErrorMessage = (error, fallback) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  fallback;

const isUuidLikeValue = (value) => UUID_LIKE_PATTERN.test(String(value || "").trim());

const resolveMemberDisplayName = (member) => {
  const candidates = [
    member?.nickname,
    member?.displayName,
    member?.username,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const readableName = candidates.find((value) => !isUuidLikeValue(value));
  return readableName || "Thành viên nhóm";
};

const clampColorChannel = (value) => Math.max(0, Math.min(255, Number(value || 0)));

const toHexColor = (red, green, blue) =>
  `#${[red, green, blue]
    .map((value) => clampColorChannel(value).toString(16).padStart(2, "0"))
    .join("")}`.toLowerCase();

const normalizeColorForPicker = (value, fallback = "#f4f7fb") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    const [, r, g, b] = normalized;
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  const rgbMatch = normalized.match(
    /^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:\d|0?\.\d+))?\)$/
  );
  if (rgbMatch) {
    return toHexColor(rgbMatch[1], rgbMatch[2], rgbMatch[3]);
  }

  return fallback;
};

const renderAvatarPlaceholder = (className, size = 32) => (
  <div
    className={className}
    aria-hidden="true"
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      backgroundColor: "#e9eef5",
      flexShrink: 0,
    }}
  />
);

const formatAttachmentFileSize = (value) => {
  const nextValue = Number(value || 0);

  if (!nextValue) {
    return "";
  }

  if (nextValue < 1024) {
    return `${nextValue} B`;
  }

  if (nextValue < 1024 * 1024) {
    return `${(nextValue / 1024).toFixed(1)} KB`;
  }

  if (nextValue < 1024 * 1024 * 1024) {
    return `${(nextValue / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(nextValue / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatAttachmentCreatedAt = (value) => {
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

function MessageInfor({
  contactData,
  onOpenConversationImageGallery,
  onRequestClose,
  autoOpenAddMember,
  onCloseAddMemberModal,
}) {
  const [showTool, setShowTool] = useState([]);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberSearchKeyword, setAddMemberSearchKeyword] = useState("");
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [customNameDraft, setCustomNameDraft] = useState("");
  const [avatarUrlDraft, setAvatarUrlDraft] = useState("");
  const [notificationLevelDraft, setNotificationLevelDraft] = useState("ALL");
  const [friendOptions, setFriendOptions] = useState([]);
  const [friendOptionsState, setFriendOptionsState] = useState({
    loading: false,
    loadedConversationId: null,
    attemptedConversationId: null,
    error: "",
  });
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isSavingCustomName, setIsSavingCustomName] = useState(false);
  const [isSavingGroupName, setIsSavingGroupName] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [isUploadingAvatarFile, setIsUploadingAvatarFile] = useState(false);
  const groupAvatarFileInputRef = useRef(null);
  const [isUpdatingPreference, setIsUpdatingPreference] = useState(false);
  const [isUpdatingMembers, setIsUpdatingMembers] = useState(false);
  const [isBackgroundPanelOpen, setIsBackgroundPanelOpen] = useState(false);
  const [backgroundColorDraft, setBackgroundColorDraft] = useState("#f4f7fb");
  const [isUpdatingBackground, setIsUpdatingBackground] = useState(false);
  const backgroundImageInputRef = useRef(null);
  const [isBlockedByCurrentUser, setIsBlockedByCurrentUser] = useState(false);
  const [isLoadingBlockState, setIsLoadingBlockState] = useState(false);
  const [isUpdatingBlockState, setIsUpdatingBlockState] = useState(false);
  const [sharedAttachmentState, setSharedAttachmentState] = useState({
    loading: false,
    error: "",
    images: [],
    files: [],
    isPartial: false,
    conversationId: null,
  });
  const [sharedLinkState, setSharedLinkState] = useState({
    loading: false,
    error: "",
    links: [],
    isPartial: false,
    conversationId: null,
  });
  const { theme } = useContext(ThemeContext);
  const { userData } = useContext(UserContext);
  const {
    currentConversationNormalized,
    selectedConversationId,
    upsertConversation,
    updateConversationById,
    removeConversationById,
    clearSelectedConversation,
    fetchConversation,
    fetchArchivedConversations,
  } = useContext(ContactContext);

  const activeConversation = useMemo(
    () => {
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
    },
    [contactData, currentConversationNormalized, selectedConversationId]
  );

  const conversationId = activeConversation?.id || null;
  const effectiveDisplayName =
    activeConversation?.displayName ||
    activeConversation?.trustedDisplayName ||
    (activeConversation?.type === "group"
      ? GROUP_CONVERSATION_LABEL
      : PRIVATE_CONVERSATION_LABEL);
  const avatarUrl =
    activeConversation?.avatarUrl ||
    activeConversation?.trustedAvatarUrl ||
    null;
  const currentConversationBackgroundColor =
    activeConversation?.backgroundColor || "#f4f7fb";
  const currentConversationBackgroundColorForPicker = normalizeColorForPicker(
    currentConversationBackgroundColor
  );
  const currentConversationBackgroundImageUrl =
    activeConversation?.backgroundImageUrl || "";
  const isGroupConversation = activeConversation?.type === "group";
  const isPrivateConversation = activeConversation?.type === "private";
  const peerUserId = isPrivateConversation ? activeConversation?.peerUserId || null : null;

  useEffect(() => {
    if (autoOpenAddMember) {
      setShowAddMemberModal(true)
      if (typeof onCloseAddMemberModal === 'function') {
        onCloseAddMemberModal()
      }
    }
  }, [autoOpenAddMember, onCloseAddMemberModal])
  const canManagePrivateBlock =
    isPrivateConversation &&
    activeConversation?.id !== "AI_ASSISTANT" &&
    Boolean(peerUserId);
  const currentUserId = userData?.userId || userData?._id || null;
  const nicknameStorageKey =
    currentUserId && conversationId
      ? `group-member-nicknames:${currentUserId}:${conversationId}`
      : null;
  const [memberNicknames, setMemberNicknames] = useState({});
  const [nicknameDrafts, setNicknameDrafts] = useState({});

  useEffect(() => {
    if (!nicknameStorageKey) {
      setMemberNicknames({});
      setNicknameDrafts({});
      return;
    }

    try {
      const stored = localStorage.getItem(nicknameStorageKey);
      const parsed = stored ? JSON.parse(stored) : {};
      setMemberNicknames(parsed && typeof parsed === "object" ? parsed : {});
      setNicknameDrafts(parsed && typeof parsed === "object" ? parsed : {});
    } catch (error) {
      console.error("[GROUP MEMBER MAP]", {
        source: "web-nickname-load",
        conversationId,
        error,
      });
      setMemberNicknames({});
      setNicknameDrafts({});
    }
  }, [conversationId, nicknameStorageKey]);

  const normalizedMembers = useMemo(
    () =>
      (Array.isArray(activeConversation?.members)
        ? activeConversation.members
        : []
      ).map((member) => {
        const nickname = memberNicknames[String(member.userId)] || member.nickname || "";
        const safeDisplayName = resolveMemberDisplayName({
          ...member,
          nickname,
        });
        return {
          ...member,
          nickname,
          displayName: safeDisplayName,
        };
      }),
    [activeConversation?.members, memberNicknames]
  );
  const currentUserMember = useMemo(
    () =>
      normalizedMembers.find(
        (member) => String(member.userId) === String(currentUserId)
      ) || null,
    [currentUserId, normalizedMembers]
  );
  const currentUserRole = String(currentUserMember?.role || "MEMBER").toUpperCase();
  const currentUserRoleSource = currentUserMember
    ? "canonical-members"
    : "fallback-default-member";
  const currentUserIsOwner = currentUserRole === "OWNER";
  const currentUserIsAdmin = currentUserRole === "ADMIN";
  const currentUserCanManageMembers = currentUserIsOwner || currentUserIsAdmin;
  const groupMemberCount = normalizedMembers.length;
  useEffect(() => {
    if (!isGroupConversation) {
      return;
    }

    console.log("[GROUP ROLE CHECK]", {
      source: "message-info-role-state",
      conversationId,
      memberCount: normalizedMembers.length,
      currentUserId,
      currentUserRole,
      currentUserRoleSource,
      members: normalizedMembers.map((member) => ({
        userId: member.userId,
        username: member.username || "",
        role: member.role || "MEMBER",
      })),
    });
  }, [
    conversationId,
    currentUserId,
    currentUserRole,
    currentUserRoleSource,
    isGroupConversation,
    normalizedMembers,
  ]);
  const canAddMember = isGroupConversation && Boolean(currentUserMember);
  const canRenameGroup = isGroupConversation && currentUserCanManageMembers;
  const canUpdateGroupAvatar = isGroupConversation && currentUserCanManageMembers;
  const canCloseConversation = isGroupConversation && currentUserIsOwner;
  const canLeaveGroup =
    isGroupConversation && (!currentUserIsOwner || groupMemberCount <= 1);
  const canRemoveMember = (member) => {
    if (!isGroupConversation || !currentUserCanManageMembers || !member?.userId) {
      return false;
    }

    if (String(member.userId) === String(currentUserId)) {
      return false;
    }

    const targetRole = String(member.role || "MEMBER").toUpperCase();
    if (targetRole === "OWNER") {
      return false;
    }

    if (currentUserIsOwner) {
      return true;
    }

    return currentUserIsAdmin && targetRole === "MEMBER";
  };
  const canTransferOwnershipTo = (member) =>
    isGroupConversation &&
    currentUserIsOwner &&
    member?.userId &&
    String(member.userId) !== String(currentUserId) &&
    String(member.role || "MEMBER").toUpperCase() !== "OWNER";
  const canPromoteAdminFor = (member) =>
    isGroupConversation &&
    currentUserIsOwner &&
    member?.userId &&
    String(member.userId) !== String(currentUserId) &&
    String(member.role || "MEMBER").toUpperCase() === "MEMBER";
  const canDemoteAdminFor = (member) =>
    isGroupConversation &&
    currentUserIsOwner &&
    member?.userId &&
    String(member.userId) !== String(currentUserId) &&
    String(member.role || "MEMBER").toUpperCase() === "ADMIN";
  const addableFriendOptions = useMemo(
    () =>
      friendOptions.filter(
        (friend) =>
          !normalizedMembers.some(
            (member) => String(member.userId) === String(friend.userId || friend._id)
          )
      ),
    [friendOptions, normalizedMembers]
  );
  const listOption = useMemo(
    () => ["Tùy chỉnh thông báo", "Tệp đã chia sẻ", "Liên kết", "Bảo mật"],
    []
  );
  const optionBaseIndex = isGroupConversation ? 2 : 1;
  const isMemberPanelOpen = isGroupConversation && showTool.includes(1);
  const sharedFilesToolIndex = optionBaseIndex + listOption.indexOf("Tệp đã chia sẻ");
  const isSharedFilesPanelOpen = showTool.includes(sharedFilesToolIndex);
  const sharedLinksToolIndex = optionBaseIndex + listOption.indexOf("Liên kết");
  const isSharedLinksPanelOpen = showTool.includes(sharedLinksToolIndex);

  useEffect(() => {
    if (!isGroupConversation) {
      return;
    }

    console.log("[GROUP ROLE CHECK]", {
      conversationId,
      currentUserId,
      currentUserRole,
      currentUserRoleSource,
      memberCount: groupMemberCount,
      canAddMember,
      canCloseConversation,
      canLeaveGroup,
    });
  }, [
    canAddMember,
    canCloseConversation,
    canLeaveGroup,
    conversationId,
    currentUserId,
    currentUserRole,
    currentUserRoleSource,
    groupMemberCount,
    isGroupConversation,
  ]);

  useEffect(() => {
    setGroupNameDraft(activeConversation?.name || activeConversation?.displayName || "");
    setCustomNameDraft(activeConversation?.customName || "");
    setAvatarUrlDraft(activeConversation?.avatarUrl || activeConversation?.trustedAvatarUrl || "");
    setNotificationLevelDraft(activeConversation?.notificationLevel || "ALL");
    setBackgroundColorDraft(currentConversationBackgroundColorForPicker);
    setIsBackgroundPanelOpen(false);
    setSettingsError("");
  }, [
    activeConversation?.avatarUrl,
    activeConversation?.backgroundColor,
    activeConversation?.customName,
    activeConversation?.displayName,
    activeConversation?.name,
    activeConversation?.notificationLevel,
    activeConversation?.trustedAvatarUrl,
    currentConversationBackgroundColorForPicker,
    conversationId,
  ]);

  useEffect(() => {
    let shouldIgnore = false;

    if (!canManagePrivateBlock) {
      setIsBlockedByCurrentUser(false);
      setIsLoadingBlockState(false);
      return () => {
        shouldIgnore = true;
      };
    }

    setIsLoadingBlockState(true);

    const loadBlockState = async () => {
      try {
        const nextBlockedState = await isUserBlockedByCurrentUser(peerUserId);
        if (!shouldIgnore) {
          setIsBlockedByCurrentUser(nextBlockedState);
        }
      } catch (error) {
        console.error("Failed to load block state for conversation:", error);
        if (!shouldIgnore) {
          setIsBlockedByCurrentUser(false);
        }
      } finally {
        if (!shouldIgnore) {
          setIsLoadingBlockState(false);
        }
      }
    };

    loadBlockState();

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

      setIsBlockedByCurrentUser(Boolean(detail.isBlocked));
      setIsLoadingBlockState(false);
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

  const loadFriendOptionsForAddMember = useCallback(async () => {
    if (!conversationId || !isGroupConversation) {
      return;
    }

    if (!canAddMember) {
      setSettingsError("Bạn không có quyền thêm thành viên.");
      return;
    }

    if (
      friendOptionsState.loading ||
      friendOptionsState.loadedConversationId === conversationId ||
      friendOptionsState.attemptedConversationId === conversationId
    ) {
      return;
    }

    setFriendOptionsState({
      loading: true,
      loadedConversationId: null,
      attemptedConversationId: conversationId,
      error: "",
    });

    console.log("[WEB GROUP FRIEND OPTIONS ADD]", {
      status: "loading",
      conversationId,
    });

    try {
      const response = await getFriendsV2();
      const nextFriends = mapFriendOptions(response.data);

      console.log("[WEB GROUP FRIEND OPTIONS ADD]", {
        status: "loaded",
        conversationId,
        count: nextFriends.length,
      });

      setFriendOptions(nextFriends);
      setFriendOptionsState({
        loading: false,
        loadedConversationId: conversationId,
        attemptedConversationId: conversationId,
        error: "",
      });
    } catch (error) {
      console.error("[WEB GROUP FRIEND OPTIONS ADD]", error);
      setFriendOptionsState({
        loading: false,
        loadedConversationId: null,
        attemptedConversationId: conversationId,
        error: "Không thể tải danh sách bạn bè.",
      });
    }
  }, [
    conversationId,
    friendOptionsState.attemptedConversationId,
    friendOptionsState.loadedConversationId,
    friendOptionsState.loading,
    isGroupConversation,
  ]);

  useEffect(() => {
    if (!isGroupConversation) {
      setFriendOptions([]);
      setSelectedMemberId("");
      setFriendOptionsState({
        loading: false,
        loadedConversationId: null,
        attemptedConversationId: null,
        error: "",
      });
      return;
    }

    if (isMemberPanelOpen || showAddMemberModal) {
      loadFriendOptionsForAddMember();
    }
  }, [isGroupConversation, isMemberPanelOpen, showAddMemberModal, loadFriendOptionsForAddMember]);

  useEffect(() => {
    setSharedAttachmentState({
      loading: false,
      error: "",
      images: [],
      files: [],
      isPartial: false,
      conversationId: conversationId || null,
    });
    setSharedLinkState({
      loading: false,
      error: "",
      links: [],
      isPartial: false,
      conversationId: conversationId || null,
    });
  }, [conversationId]);

  useEffect(() => {
    if (!selectedMemberId && addableFriendOptions.length > 0) {
      setSelectedMemberId(addableFriendOptions[0].userId);
      return;
    }

    if (
      selectedMemberId &&
      !addableFriendOptions.some(
        (friend) => String(friend.userId) === String(selectedMemberId)
      )
    ) {
      setSelectedMemberId(addableFriendOptions[0]?.userId || "");
    }
  }, [addableFriendOptions, selectedMemberId]);

  useEffect(() => {
    if (!conversationId || !isSharedFilesPanelOpen) {
      return;
    }

    let shouldIgnore = false;

    const loadSharedAttachments = async () => {
      setSharedAttachmentState({
        loading: true,
        error: "",
        images: [],
        files: [],
        isPartial: false,
        conversationId,
      });

      try {
        const { attachments, isPartial } = await fetchConversationSharedAttachments({
          conversationId,
          currentUserId,
        });

        if (shouldIgnore) {
          return;
        }

        setSharedAttachmentState({
          loading: false,
          error: "",
          images: attachments.filter((attachment) => attachment.isImage),
          files: attachments.filter((attachment) => !attachment.isImage),
          isPartial,
          conversationId,
        });
      } catch (error) {
        console.error("Failed to load shared attachments:", error);

        if (shouldIgnore) {
          return;
        }

        setSharedAttachmentState({
          loading: false,
          error: "Không thể tải tệp đã chia sẻ trong hội thoại này.",
          images: [],
          files: [],
          isPartial: false,
          conversationId,
        });
      }
    };

    loadSharedAttachments();

    return () => {
      shouldIgnore = true;
    };
  }, [conversationId, currentUserId, isSharedFilesPanelOpen]);

  useEffect(() => {
    if (!conversationId || !isSharedLinksPanelOpen) {
      return;
    }

    let shouldIgnore = false;

    const loadSharedLinks = async () => {
      setSharedLinkState({
        loading: true,
        error: "",
        links: [],
        isPartial: false,
        conversationId,
      });

      try {
        const { links, isPartial } = await fetchConversationSharedLinks({
          conversationId,
          currentUserId,
        });

        if (shouldIgnore) {
          return;
        }

        setSharedLinkState({
          loading: false,
          error: "",
          links,
          isPartial,
          conversationId,
        });
      } catch (error) {
        console.error("Failed to load shared links:", error);

        if (shouldIgnore) {
          return;
        }

        setSharedLinkState({
          loading: false,
          error: "Không thể tải liên kết đã chia sẻ trong hội thoại này.",
          links: [],
          isPartial: false,
          conversationId,
        });
      }
    };

    loadSharedLinks();

    return () => {
      shouldIgnore = true;
    };
  }, [conversationId, currentUserId, isSharedLinksPanelOpen]);

  const handleShowTool = (index) => {
    setShowTool((prevState) => {
      const check = prevState.includes(index);
      if (check) {
        return prevState.filter((x) => x !== index);
      }
      return [...prevState, index];
    });
  };

  const handleTogglePrivateBlock = async () => {
    if (!canManagePrivateBlock || isUpdatingBlockState) {
      return;
    }

    const shouldProceed = window.confirm(
      isBlockedByCurrentUser
        ? "Bỏ chặn người dùng này để trò chuyện lại bình thường?"
        : "Chặn người dùng này sẽ khóa việc nhắn tin cho đến khi bạn bỏ chặn. Tiếp tục?"
    );

    if (!shouldProceed) {
      return;
    }

    setSettingsError("");
    setIsUpdatingBlockState(true);

    try {
      if (isBlockedByCurrentUser) {
        await unblockUserForCurrentUser({ blockedUserId: peerUserId });
        setIsBlockedByCurrentUser(false);
      } else {
        await blockUserForCurrentUser({
          blockedUserId: peerUserId,
          reason: "",
        });
        setIsBlockedByCurrentUser(true);
      }
    } catch (error) {
      console.error("Failed to update block state:", error);
      setSettingsError(
        getApiErrorMessage(
          error,
          isBlockedByCurrentUser
            ? "Không thể bỏ chặn người dùng lúc này."
            : "Không thể chặn người dùng lúc này."
        )
      );
    } finally {
      setIsUpdatingBlockState(false);
    }
  };

  const renderPrivateSecurityPanel = () => (
    <div className="mess-infor-panel-body">
      <p className="mess-infor-section-note">
        Chặn người dùng sẽ khóa việc gửi tin nhắn trong cuộc trò chuyện riêng này cho đến khi bạn bỏ chặn.
      </p>
      {isLoadingBlockState ? (
        <div className="mess-infor-shared-feedback">
          Đang kiểm tra trạng thái chặn...
        </div>
      ) : null}
      <div
        className={`mess-infor-block-card ${
          isBlockedByCurrentUser ? "blocked" : ""
        }`}
      >
        <div className="mess-infor-block-copy">
          <strong>
            {isBlockedByCurrentUser
              ? "Bạn đã chặn người dùng này"
              : "Người dùng chưa bị chặn"}
          </strong>
          <span>
            {isBlockedByCurrentUser
              ? "Ô nhập tin nhắn trên web và mobile sẽ bị khóa cho đến khi bạn bỏ chặn."
              : "Sau khi chặn, bạn sẽ không thể tiếp tục trò chuyện cho đến khi bỏ chặn."}
          </span>
        </div>
        <button
          className={`mess-infor-block-button ${
            isBlockedByCurrentUser ? "unblock" : "block"
          }`}
          type="button"
          onClick={handleTogglePrivateBlock}
          disabled={isUpdatingBlockState || isLoadingBlockState || !peerUserId}
        >
          {isUpdatingBlockState
            ? "Đang cập nhật..."
            : isBlockedByCurrentUser
            ? "Bỏ chặn người dùng"
            : "Chặn người dùng"}
        </button>
      </div>
    </div>
  );

  const handleConversationPreferenceUpdate = async (key, nextValue) => {
    if (!conversationId) {
      return;
    }

    setSettingsError("");
    setIsUpdatingPreference(true);

    try {
      let optimisticPatch = {
        [key]: nextValue,
      };

      if (key === "muted") {
        await updateConversationMuteV1(conversationId, nextValue);
        if (!nextValue && activeConversation?.notificationLevel === "NONE") {
          optimisticPatch.notificationLevel = "ALL";
          setNotificationLevelDraft("ALL");
        }
      }

      if (key === "pinned") {
        await updateConversationPinV1(conversationId, nextValue);
      }

      if (key === "archived") {
        await updateConversationArchiveV1(conversationId, nextValue);
      }

      if (key === "notificationLevel") {
        await updateConversationNotificationLevelV1(conversationId, nextValue);
        optimisticPatch.notificationLevel = nextValue;
        if (nextValue === "NONE") {
          optimisticPatch.muted = true;
        }
        if (nextValue === "ALL") {
          optimisticPatch.muted = false;
        }
      }

      updateConversationById(conversationId, optimisticPatch);
    } catch (error) {
      console.error("Failed to update room preference:", error);
      setSettingsError("Không thể cập nhật tùy chọn hội thoại.");
    } finally {
      setIsUpdatingPreference(false);
    }
  };

  const applyBackgroundConversationState = (response, fallbackPatch = {}) => {
    const responsePatch = response
      ? {
          backgroundColor:
            response.backgroundColor || response.background || undefined,
          backgroundImageUrl:
            response.backgroundImageUrl ||
            response.backgroundImage ||
            response.backgroundUrl ||
            undefined,
        }
      : {};
    const nextPatch = {
      ...fallbackPatch,
      ...Object.fromEntries(
        Object.entries(responsePatch).filter(([, value]) => value !== undefined)
      ),
    };

    if (Object.keys(nextPatch).length > 0) {
      updateConversationById(conversationId, nextPatch);
    }

    if (response?.id) {
      upsertConversation(response, { source: "conversation-background-update" });
    }
  };

  const handleSaveConversationBackgroundColor = async () => {
    if (!conversationId || isUpdatingBackground) {
      return;
    }

    const nextColor = normalizeColorForPicker(backgroundColorDraft);
    const currentColor = normalizeColorForPicker(currentConversationBackgroundColor);
    if (!nextColor || nextColor === currentColor) {
      setIsBackgroundPanelOpen(false);
      return;
    }

    setSettingsError("");
    setIsUpdatingBackground(true);

    try {
      const response = await updateConversationBackgroundV1(conversationId, {
        backgroundType: "COLOR",
        backgroundColor: nextColor,
        backgroundImageUrl: null,
      });
      applyBackgroundConversationState(response, {
        backgroundColor: nextColor,
        backgroundImageUrl: null,
      });
      setIsBackgroundPanelOpen(false);
    } catch (error) {
      console.error("Failed to update conversation background color:", error);
      setSettingsError(
        getApiErrorMessage(error, "Không thể cập nhật màu nền cuộc trò chuyện.")
      );
    } finally {
      setIsUpdatingBackground(false);
    }
  };

  const handleConversationBackgroundImagePick = async (event) => {
    if (!conversationId || isUpdatingBackground) {
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSettingsError("");
    setIsUpdatingBackground(true);

    try {
      const uploadResult = await uploadConversationBackgroundImageV1(
        conversationId,
        file
      );
      const uploadedUrl = String(uploadResult?.url || "").trim();
      if (!uploadedUrl) {
        throw new Error("Background image upload did not return URL.");
      }

      const response = await updateConversationBackgroundV1(conversationId, {
        backgroundType: "IMAGE",
        backgroundColor: null,
        backgroundImageUrl: uploadedUrl,
      });
      applyBackgroundConversationState(response, {
        backgroundColor: null,
        backgroundImageUrl: uploadedUrl,
      });
      setIsBackgroundPanelOpen(false);
    } catch (error) {
      console.error("Failed to upload conversation background image:", error);
      setSettingsError(
        getApiErrorMessage(error, "Không thể tải ảnh nền lên lúc này.")
      );
    } finally {
      event.target.value = "";
      setIsUpdatingBackground(false);
    }
  };

  const handleSaveCustomName = async () => {
    if (!conversationId) {
      return;
    }

    const nextCustomName = customNameDraft.trim();
    const currentCustomName = (activeConversation?.customName || "").trim();

    if (nextCustomName === currentCustomName) {
      return;
    }

    setSettingsError("");
    setIsSavingCustomName(true);

    try {
      await updateConversationCustomNameV1(conversationId, nextCustomName || null);
      updateConversationById(conversationId, {
        customName: nextCustomName || null,
      });
    } catch (error) {
      console.error("Failed to update custom room name:", error);
      setSettingsError("Không thể cập nhật tên gọi nhớ.");
    } finally {
      setIsSavingCustomName(false);
    }
  };

  const handleSaveGroupName = async () => {
    if (!conversationId || !canRenameGroup || isSavingGroupName) {
      return;
    }

    const nextGroupName = groupNameDraft.trim();
    const currentGroupName = String(
      activeConversation?.name || activeConversation?.displayName || ""
    ).trim();

    if (!nextGroupName) {
      setSettingsError("Tên nhóm không được để trống.");
      return;
    }

    if (nextGroupName === currentGroupName) {
      return;
    }

    setSettingsError("");
    setIsSavingGroupName(true);

    try {
      const response = await renameConversationV1(conversationId, nextGroupName);
      if (response?.id) {
        upsertConversation(response, { source: "group-name-update" });
      } else {
        updateConversationById(conversationId, {
          name: nextGroupName,
          displayName: nextGroupName,
        });
      }
      await refreshConversationsAfterGroupAction(response, "name-update");
    } catch (error) {
      console.error("[WEB GROUP NAME UPDATE]", {
        conversationId,
        error,
      });
      setSettingsError(
        getApiErrorMessage(error, "Không thể cập nhật tên nhóm.")
      );
    } finally {
      setIsSavingGroupName(false);
    }
  };

  const handleSaveGroupAvatar = async () => {
    if (!conversationId || !canUpdateGroupAvatar || isSavingAvatar) {
      return;
    }

    const nextAvatarUrl = avatarUrlDraft.trim();
    const currentAvatarUrl = String(avatarUrl || "").trim();

    if (!nextAvatarUrl) {
      setSettingsError("Vui lòng nhập URL ảnh nhóm.");
      return;
    }

    if (nextAvatarUrl === currentAvatarUrl) {
      return;
    }

    setSettingsError("");
    setIsSavingAvatar(true);

    console.log("[WEB GROUP AVATAR UPDATE]", {
      status: "submitting",
      conversationId,
      avatarUrlLength: nextAvatarUrl.length,
    });

    try {
      const response = await updateConversationAvatarV1(conversationId, nextAvatarUrl);
      upsertConversation(response, { source: "group-avatar-update" });
      await refreshConversationsAfterGroupAction(response, "avatar-update");
      console.log("[WEB GROUP AVATAR UPDATE]", {
        status: "success",
        conversationId,
        avatarUrl: response?.avatarUrl || nextAvatarUrl,
      });
      console.log("[WEB GROUP METADATA SYNC]", {
        source: "group-avatar-update",
        conversationId,
        avatarUrl: response?.avatarUrl || nextAvatarUrl,
      });
    } catch (error) {
      console.error("[WEB GROUP AVATAR UPDATE]", {
        status: "failed",
        conversationId,
        error,
      });
      setSettingsError(
        getApiErrorMessage(error, "Không thể cập nhật ảnh đại diện nhóm.")
      );
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const handleUploadGroupAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !conversationId || !canUpdateGroupAvatar) {
      event.target.value = "";
      return;
    }

    setSettingsError("");
    setIsUploadingAvatarFile(true);

    try {
      const uploadResult = await uploadAttachmentV1(file);
      const uploadedUrl = String(uploadResult?.url || "").trim();
      if (!uploadedUrl) {
        throw new Error("Thiếu URL ảnh sau khi tải lên.");
      }
      setAvatarUrlDraft(uploadedUrl);
    } catch (error) {
      console.error("Failed to upload group avatar file:", error);
      setSettingsError(
        getApiErrorMessage(error, "Không thể tải ảnh nhóm lên máy chủ.")
      );
    } finally {
      event.target.value = "";
      setIsUploadingAvatarFile(false);
    }
  };

  const refreshConversationsAfterGroupAction = async (response, action) => {
    if (response?.id) {
      upsertConversation(response, { source: `group-${action}` });
    }

    console.log("[WEB PHASE2 GROUP MEMBERS]", {
      action,
      conversationId,
      responseHasMembers: Array.isArray(response?.members),
      responseMemberCount: Array.isArray(response?.members)
        ? response.members.length
        : 0,
    });

    try {
      await Promise.all([
        fetchConversation?.(),
        activeConversation?.archived ? fetchArchivedConversations?.() : null,
      ].filter(Boolean));
    } catch (error) {
      console.error("[WEB PHASE2 GROUP MEMBERS]", {
        action,
        conversationId,
        status: "refresh-failed",
        error,
      });
    }
  };

  const handleAddMember = async (targetUserId) => {
    if (isUpdatingMembers) {
      return;
    }

    if (!conversationId || !isGroupConversation) {
      return;
    }

    const memberIdToAdd = targetUserId || selectedMemberId;

    if (!memberIdToAdd) {
      setSettingsError("Vui lòng chọn thành viên cần thêm.");
      return;
    }

    const selectedFriend = friendOptions.find(
      (friend) => String(friend.userId) === String(memberIdToAdd)
    );
    if (!selectedFriend) {
      setSettingsError("Thành viên này không hợp lệ.");
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    console.log("[WEB GROUP ACTION SUBMIT]", {
      action: "add-member",
      conversationId,
      userId: selectedFriend.userId,
      currentUserRole,
    });

    try {
      const response = await addConversationMemberV1(conversationId, selectedFriend.userId);
      await refreshConversationsAfterGroupAction(response, "add-member");
      setSelectedMemberId("");
    } catch (error) {
      console.error("[WEB GROUP ACTION SUBMIT]", {
        action: "add-member",
        conversationId,
        error,
      });
      setSettingsError(
      getApiErrorMessage(error, "Không thể thêm thành viên vào nhóm.")
      );
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleSaveMemberNickname = (memberUserId) => {
    if (!nicknameStorageKey || !memberUserId) {
      return;
    }

    const normalizedUserId = String(memberUserId);
    const nextNickname = String(nicknameDrafts[normalizedUserId] || "").trim();
    const nextNicknames = {
      ...memberNicknames,
    };

    if (nextNickname) {
      nextNicknames[normalizedUserId] = nextNickname;
    } else {
      delete nextNicknames[normalizedUserId];
    }

    try {
      localStorage.setItem(nicknameStorageKey, JSON.stringify(nextNicknames));
      setMemberNicknames(nextNicknames);
      setNicknameDrafts((prevState) => ({
        ...prevState,
        [normalizedUserId]: nextNickname,
      }));
      console.log("[GROUP MEMBER MAP]", {
        source: "web-nickname-save",
        conversationId,
        memberUserId: normalizedUserId,
        hasNickname: Boolean(nextNickname),
      });
    } catch (error) {
      console.error("[GROUP MEMBER MAP]", {
        source: "web-nickname-save",
        conversationId,
        memberUserId: normalizedUserId,
        error,
      });
      setSettingsError("Không thể lưu biệt danh thành viên trên thiết bị này.");
    }
  };

  const handleRemoveMember = async (memberUserId) => {
    if (isUpdatingMembers) {
      return;
    }

    if (!conversationId || !memberUserId || !isGroupConversation) {
      return;
    }

    const targetMember = normalizedMembers.find(
      (member) => String(member.userId) === String(memberUserId)
    );
    if (!canRemoveMember(targetMember)) {
      setSettingsError("Bạn không có quyền xóa thành viên này.");
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    console.log("[WEB GROUP ACTION SUBMIT]", {
      action: "remove-member",
      conversationId,
      targetUserId: memberUserId,
      targetRole: targetMember?.role || "MEMBER",
      currentUserRole,
    });

    try {
      const response = await removeConversationMemberV1(conversationId, memberUserId);
      await refreshConversationsAfterGroupAction(response, "remove-member");
    } catch (error) {
      console.error("[WEB GROUP ACTION SUBMIT]", {
        action: "remove-member",
        conversationId,
        targetUserId: memberUserId,
        error,
      });
      setSettingsError(
        getApiErrorMessage(error, "Không thể xóa thành viên khỏi nhóm.")
      );
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleTransferOwnership = async (targetUserId) => {
    if (isUpdatingMembers) {
      return;
    }

    if (!conversationId || !targetUserId || !isGroupConversation) {
      return;
    }

    const targetMember = normalizedMembers.find(
      (member) => String(member.userId) === String(targetUserId)
    );
    if (!canTransferOwnershipTo(targetMember)) {
      setSettingsError("Bạn không có quyền chuyển chủ nhóm cho thành viên này.");
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    console.log("[WEB GROUP ACTION SUBMIT]", {
      action: "transfer-ownership",
      conversationId,
      targetUserId,
      currentUserRole,
    });

    try {
      const response = await transferConversationOwnershipV1(conversationId, targetUserId);
      await refreshConversationsAfterGroupAction(response, "transfer-ownership");
    } catch (error) {
      console.error("[WEB GROUP ACTION SUBMIT]", {
        action: "transfer-ownership",
        conversationId,
        targetUserId,
        error,
      });
      setSettingsError(
        getApiErrorMessage(error, "Không thể chuyển quyền trưởng nhóm.")
      );
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handlePromoteAdmin = async (targetUserId) => {
    if (isUpdatingMembers) {
      return;
    }

    if (!conversationId || !targetUserId || !isGroupConversation) {
      return;
    }

    const targetMember = normalizedMembers.find(
      (member) => String(member.userId) === String(targetUserId)
    );
    if (!canPromoteAdminFor(targetMember)) {
      setSettingsError("Bạn không có quyền cấp quyền admin cho thành viên này.");
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    console.log("[WEB GROUP ACTION SUBMIT]", {
      action: "promote-admin",
      conversationId,
      targetUserId,
      currentUserRole,
    });

    try {
      const response = await promoteConversationAdminV1(conversationId, targetUserId);
      await refreshConversationsAfterGroupAction(response, "promote-admin");
    } catch (error) {
      console.error("[WEB GROUP ACTION SUBMIT]", {
        action: "promote-admin",
        conversationId,
        targetUserId,
        error,
      });
      setSettingsError(
        getApiErrorMessage(error, "Không thể cập nhật quyền quản trị.")
      );
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleDemoteAdmin = async (targetUserId) => {
    if (isUpdatingMembers) {
      return;
    }

    if (!conversationId || !targetUserId || !isGroupConversation) {
      return;
    }

    const targetMember = normalizedMembers.find(
      (member) => String(member.userId) === String(targetUserId)
    );
    if (!canDemoteAdminFor(targetMember)) {
      setSettingsError("Bạn không có quyền thu hồi admin của thành viên này.");
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    console.log("[WEB GROUP ACTION SUBMIT]", {
      action: "demote-admin",
      conversationId,
      targetUserId,
      currentUserRole,
    });

    try {
      const response = await demoteConversationAdminV1(conversationId, targetUserId);
      await refreshConversationsAfterGroupAction(response, "demote-admin");
    } catch (error) {
      console.error("[WEB GROUP ACTION SUBMIT]", {
        action: "demote-admin",
        conversationId,
        targetUserId,
        error,
      });
      setSettingsError(
        getApiErrorMessage(error, "Không thể thu hồi quyền quản trị.")
      );
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleLeaveConversation = async () => {
    if (isUpdatingMembers) {
      return;
    }

    if (!conversationId || !isGroupConversation) {
      return;
    }

    if (!canLeaveGroup) {
      setSettingsError("Chủ nhóm cần chuyển quyền hoặc đóng nhóm trước khi rời.");
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    console.log("[WEB GROUP ACTION SUBMIT]", {
      action: "leave-group",
      conversationId,
      currentUserRole,
    });

    try {
      await leaveConversationV1(conversationId);
      removeConversationById(conversationId);
      clearSelectedConversation();
    } catch (error) {
      console.error("[WEB GROUP ACTION SUBMIT]", {
        action: "leave-group",
        conversationId,
        error,
      });
      setSettingsError(
        getApiErrorMessage(error, "Không thể rời nhóm này lúc này.")
      );
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleCloseConversation = async () => {
    if (isUpdatingMembers) {
      return;
    }

    if (!conversationId || !isGroupConversation) {
      return;
    }

    if (!canCloseConversation) {
      setSettingsError("Chỉ chủ nhóm mới có thể đóng nhóm.");
      return;
    }

    const confirmed = window.confirm("Bạn có chắc muốn đóng nhóm này?");
    if (!confirmed) {
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    console.log("[WEB GROUP ACTION SUBMIT]", {
      action: "close-group",
      conversationId,
      currentUserRole,
    });

    try {
      await closeConversationV1(conversationId);
      removeConversationById(conversationId);
      clearSelectedConversation();
    } catch (error) {
      console.error("[WEB GROUP ACTION SUBMIT]", {
        action: "close-group",
        conversationId,
        error,
      });
      setSettingsError(
        getApiErrorMessage(error, "Không thể đóng nhóm này lúc này.")
      );
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const renderSharedAttachmentPanel = () => {
    const totalSharedAttachments =
      sharedAttachmentState.images.length + sharedAttachmentState.files.length;

    return (
      <div className="mess-infor-shared-panel">
        <p className="mess-infor-section-note">
          Tổng hợp tất cả ảnh và tệp đã được gửi trong hội thoại này.
        </p>

        {sharedAttachmentState.loading ? (
          <div className="mess-infor-shared-feedback">
            Đang tải dữ liệu tệp trong hội thoại...
          </div>
        ) : null}

        {!sharedAttachmentState.loading && sharedAttachmentState.error ? (
          <div className="mess-infor-shared-feedback error">
            {sharedAttachmentState.error}
          </div>
        ) : null}

        {!sharedAttachmentState.loading && !sharedAttachmentState.error ? (
          <div className="mess-infor-shared-summary">
            <span>{totalSharedAttachments} mục</span>
            {sharedAttachmentState.isPartial ? (
              <span>Đang hiển thị dữ liệu gần đây</span>
            ) : (
              <span>{conversationId ? "Theo hội thoại hiện tại" : ""}</span>
            )}
          </div>
        ) : null}

        {!sharedAttachmentState.loading && !sharedAttachmentState.error ? (
          <div className="mess-infor-shared-section">
            <div className="mess-infor-shared-section-header">
              <p>Ảnh</p>
              <span>{sharedAttachmentState.images.length}</span>
            </div>
            {sharedAttachmentState.images.length ? (
              <div className="mess-infor-shared-image-grid">
                {sharedAttachmentState.images.map((attachment) => (
                  <button
                    key={attachment.id}
                    type="button"
                    className="mess-infor-shared-image-card"
                    title={`${attachment.fileName}\n${formatAttachmentCreatedAt(attachment.createdAt)}`}
                    onClick={() =>
                      onOpenConversationImageGallery?.({
                        id: attachment.id || attachment.url,
                        url: attachment.url,
                        fileName: attachment.fileName || "Ảnh trong hội thoại",
                      })
                    }
                  >
                    <img src={attachment.url} alt={attachment.fileName} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="mess-infor-shared-empty">Chưa có ảnh được chia sẻ.</div>
            )}
          </div>
        ) : null}

        {!sharedAttachmentState.loading && !sharedAttachmentState.error ? (
          <div className="mess-infor-shared-section">
            <div className="mess-infor-shared-section-header">
              <p>Tệp</p>
              <span>{sharedAttachmentState.files.length}</span>
            </div>
            {sharedAttachmentState.files.length ? (
              <div className="mess-infor-shared-file-list">
                {sharedAttachmentState.files.map((attachment) => (
                  <a
                    key={attachment.id}
                    className="mess-infor-shared-file-item"
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div className="mess-infor-shared-file-icon">FILE</div>
                    <div className="mess-infor-shared-file-meta">
                      <strong>{attachment.fileName}</strong>
                      <span>
                        {[
                          formatAttachmentFileSize(attachment.fileSize),
                          formatAttachmentCreatedAt(attachment.createdAt),
                        ]
                          .filter(Boolean)
                          .join(" | ")}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="mess-infor-shared-empty">Chưa có tệp được chia sẻ.</div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderNotificationSettingsPanel = () => (
    <div className="mess-infor-panel-body">
      <p className="mess-infor-section-note">
        Điều chỉnh cách hội thoại này tạo thông báo. Các thay đổi này dùng cùng API với nút tắt thông báo nhanh ở phía trên.
      </p>
      <label className="mess-infor-field">
        <span>Nhận thông báo</span>
        <select
          value={notificationLevelDraft}
          onChange={(event) => {
            const nextValue = event.target.value;
            setNotificationLevelDraft(nextValue);
            handleConversationPreferenceUpdate("notificationLevel", nextValue);
          }}
          disabled={isUpdatingPreference}
        >
          {NOTIFICATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <small>
          {NOTIFICATION_LEVEL_HINTS[notificationLevelDraft] ||
            NOTIFICATION_LEVEL_HINTS.ALL}
        </small>
      </label>
      <div className="mess-infor-inline-actions">
        <button
          type="button"
          onClick={() =>
            handleConversationPreferenceUpdate("muted", !activeConversation?.muted)
          }
          disabled={isUpdatingPreference}
        >
          {activeConversation?.muted ? "Bật thông báo" : "Tắt thông báo"}
        </button>
        <button
          type="button"
          onClick={() => {
            setNotificationLevelDraft("ALL");
            handleConversationPreferenceUpdate("notificationLevel", "ALL");
          }}
          disabled={isUpdatingPreference}
        >
          Đặt về tất cả
        </button>
      </div>
    </div>
  );

  const renderSharedLinksPanel = () => (
    <div className="mess-infor-shared-panel">
      <p className="mess-infor-section-note">
        Tổng hợp các đường dẫn http/https đã xuất hiện trong tin nhắn gần đây của hội thoại.
      </p>

      {sharedLinkState.loading ? (
        <div className="mess-infor-shared-feedback">
          Đang tải liên kết trong hội thoại...
        </div>
      ) : null}

      {!sharedLinkState.loading && sharedLinkState.error ? (
        <div className="mess-infor-shared-feedback error">
          {sharedLinkState.error}
        </div>
      ) : null}

      {!sharedLinkState.loading && !sharedLinkState.error ? (
        <div className="mess-infor-shared-summary">
          <span>{sharedLinkState.links.length} liên kết</span>
          <span>
            {sharedLinkState.isPartial
              ? "Đang hiển thị dữ liệu gần đây"
              : "Theo hội thoại hiện tại"}
          </span>
        </div>
      ) : null}

      {!sharedLinkState.loading && !sharedLinkState.error ? (
        sharedLinkState.links.length ? (
          <div className="mess-infor-shared-file-list">
            {sharedLinkState.links.map((link) => (
              <a
                key={link.id}
                className="mess-infor-shared-file-item mess-infor-shared-link-item"
                href={link.url}
                target="_blank"
                rel="noreferrer"
              >
                {link.imageUrl ? (
                  <img
                    className="mess-infor-shared-link-thumb"
                    src={link.imageUrl}
                    alt=""
                  />
                ) : (
                  <div className="mess-infor-shared-file-icon">LINK</div>
                )}
                <div className="mess-infor-shared-file-meta">
                  <strong>{link.title || link.url}</strong>
                  <span>{link.description || link.url}</span>
                  <span>
                    {[
                      link.messageId ? `Tin nhắn #${link.messageId}` : "",
                      formatAttachmentCreatedAt(link.createdAt),
                    ]
                      .filter(Boolean)
                      .join(" | ")}
                  </span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="mess-infor-shared-empty">
            Chưa có liên kết được chia sẻ.
          </div>
        )
      ) : null}
    </div>
  );

  const renderGroupSecurityPanel = () => (
    <div className="mess-infor-panel-body">
      <p className="mess-infor-section-note">
        Các thao tác nhạy cảm của nhóm được giới hạn theo vai trò. Trưởng nhóm có thể chuyển quyền, cấp/hạ admin và đóng nhóm.
      </p>
      <div className="mess-infor-block-card">
        <div className="mess-infor-block-copy">
          <strong>Vai trò của bạn: {currentUserIsOwner ? "Trưởng nhóm" : currentUserIsAdmin ? "Admin" : "Thành viên"}</strong>
          <span>
            {currentUserCanManageMembers
              ? "Bạn có thể quản lý thành viên theo quyền hiện tại."
              : "Bạn có thể xem thông tin nhóm và rời nhóm khi cần."}
          </span>
        </div>
      </div>
      <div className="mess-infor-inline-actions">
        {canLeaveGroup ? (
          <button
            type="button"
            className="mess-infor-danger-outline"
            onClick={handleLeaveConversation}
            disabled={isUpdatingMembers}
          >
            Rời nhóm
          </button>
        ) : null}
        {canCloseConversation ? (
          <button
            type="button"
            className="mess-infor-danger-soft"
            onClick={handleCloseConversation}
            disabled={isUpdatingMembers}
          >
            Đóng nhóm
          </button>
        ) : null}
      </div>
    </div>
  );

  const renderUnavailablePanel = (message = "Tính năng này sẽ được mở rộng ở giai đoạn sau.") => (
    <div className="mess-infor-panel-body">
      <div className="mess-infor-shared-empty">{message}</div>
    </div>
  );

  return (
    <div
      className="mess-infor-container-messageinfor"
      style={{ backgroundColor: theme }}
    >
      <div className="mess-infor-title-text flex">
        <h3>Thông tin hội thoại</h3>
        {typeof onRequestClose === "function" ? (
          <button
            type="button"
            className="mess-infor-close-button"
            onClick={onRequestClose}
          >
            Ẩn
          </button>
        ) : null}
      </div>
      <div className="mess-infor-scrool-header">
        <div className="mess-infor-header-infor">
          <div className="mess-infor-wrap-avatar">
            {avatarUrl ? (
              <img
                className="mess-infor-avatar-infor"
                src={avatarUrl}
                alt=""
              />
            ) : (
              renderAvatarPlaceholder("mess-infor-avatar-infor", 86)
            )}
            <div className="mess-infor-nickname flex">
              <p>{effectiveDisplayName}</p>
              {activeConversation?.id !== "AI_ASSISTANT" && (
                <CiEdit style={{ fontSize: "23px", cursor: "pointer" }} />
              )}
            </div>
            {activeConversation?.id !== "AI_ASSISTANT" && (
              <div className="mess-infor-status-chips">
                {activeConversation?.pinned ? (
                  <span className="mess-infor-status-chip pinned">Ghim</span>
                ) : null}
                {activeConversation?.muted ? (
                  <span className="mess-infor-status-chip muted">Tắt thông báo</span>
                ) : null}
                {activeConversation?.archived ? (
                  <span className="mess-infor-status-chip archived">Lưu trữ</span>
                ) : null}
                {canManagePrivateBlock && isBlockedByCurrentUser ? (
                  <span className="mess-infor-status-chip blocked">Đã chặn</span>
                ) : null}
                <span className="mess-infor-status-chip">
                  {activeConversation?.notificationLevel || "ALL"}
                </span>
              </div>
            )}
            {canUpdateGroupAvatar ? (
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  width: "100%",
                  marginTop: 12,
                }}
              >
                <input
                  ref={groupAvatarFileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleUploadGroupAvatarFile}
                />
                <button
                  type="button"
                  onClick={() => groupAvatarFileInputRef.current?.click()}
                  disabled={isUploadingAvatarFile}
                  style={{
                    border: "1px solid #d6dbe1",
                    borderRadius: 8,
                    padding: "9px 10px",
                    backgroundColor: "white",
                    color: "#1f2d3d",
                    fontWeight: 600,
                    cursor: isUploadingAvatarFile ? "not-allowed" : "pointer",
                  }}
                >
                  {isUploadingAvatarFile ? "Đang tải ảnh..." : "Chọn ảnh từ máy"}
                </button>
                {avatarUrlDraft.trim() &&
                avatarUrlDraft.trim() !== String(avatarUrl || "").trim() ? (
                  <span style={{ fontSize: 12, color: "#2f6fed" }}>
                    Đã chọn ảnh mới, nhấn Cập nhật ảnh nhóm để lưu.
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={handleSaveGroupAvatar}
                  disabled={
                    isSavingAvatar ||
                    isUploadingAvatarFile ||
                    !avatarUrlDraft.trim() ||
                    avatarUrlDraft.trim() === String(avatarUrl || "").trim()
                  }
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 10px",
                    backgroundColor:
                      isSavingAvatar ||
                      isUploadingAvatarFile ||
                      !avatarUrlDraft.trim() ||
                      avatarUrlDraft.trim() === String(avatarUrl || "").trim()
                        ? "#9bbdf4"
                        : "#0068ff",
                    color: "white",
                    fontWeight: 600,
                    cursor:
                      isSavingAvatar ||
                      isUploadingAvatarFile ||
                      !avatarUrlDraft.trim() ||
                      avatarUrlDraft.trim() === String(avatarUrl || "").trim()
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {isSavingAvatar ? "Đang cập nhật..." : "Cập nhật ảnh nhóm"}
                </button>
              </div>
            ) : null}
          </div>
          <div className="mess-infor-header-infor-tool flex">
            <div
              className="mess-infor-quick-action"
              onClick={() =>
                handleConversationPreferenceUpdate(
                  "muted",
                  !activeConversation?.muted
                )
              }
            >
              <AiOutlineBell className="icon-tool-mess" />
              <p>{activeConversation?.muted ? "Bật thông báo" : "Tắt thông báo"}</p>
            </div>
            <div
              className="mess-infor-quick-action"
              onClick={() =>
                handleConversationPreferenceUpdate(
                  "pinned",
                  !activeConversation?.pinned
                )
              }
            >
              <GoPin className="icon-tool-mess" />
              <p>{activeConversation?.pinned ? "Bỏ ghim" : "Ghim hội thoại"}</p>
            </div>
            <div
              className="mess-infor-quick-action"
              onClick={() => setIsBackgroundPanelOpen((prevState) => !prevState)}
            >
              <TbBackground className="icon-tool-mess" />
              <p>Đổi nền chat</p>
            </div>
            <div
              className="mess-infor-quick-action"
              onClick={() =>
                handleConversationPreferenceUpdate(
                  "archived",
                  !activeConversation?.archived
                )
              }
            >
              <HiOutlineArchiveBox className="icon-tool-mess" />
              <p>{activeConversation?.archived ? "Bỏ lưu trữ" : "Lưu trữ"}</p>
            </div>
          </div>
          {isBackgroundPanelOpen ? (
            <div className="mess-infor-background-panel">
              <input
                ref={backgroundImageInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleConversationBackgroundImagePick}
              />
              <label className="mess-infor-background-color-label">
                <span>Màu nền</span>
                <input
                  type="color"
                  value={normalizeColorForPicker(backgroundColorDraft)}
                  onChange={(event) =>
                    setBackgroundColorDraft(normalizeColorForPicker(event.target.value))
                  }
                  disabled={isUpdatingBackground}
                />
              </label>
              <div className="mess-infor-background-swatch-grid">
                {BACKGROUND_COLOR_PRESETS.map((color) => {
                  const normalizedColor = normalizeColorForPicker(color);
                  const isActive =
                    normalizeColorForPicker(backgroundColorDraft) === normalizedColor;
                  return (
                    <button
                      key={normalizedColor}
                      type="button"
                      className={`mess-infor-background-swatch ${
                        isActive ? "active" : ""
                      }`}
                      style={{ backgroundColor: normalizedColor }}
                      onClick={() => setBackgroundColorDraft(normalizedColor)}
                      disabled={isUpdatingBackground}
                      aria-label={`Chọn màu ${normalizedColor}`}
                    />
                  );
                })}
              </div>
              <div className="mess-infor-background-actions">
                <button
                  type="button"
                  onClick={handleSaveConversationBackgroundColor}
                  disabled={
                    isUpdatingBackground ||
                    !backgroundColorDraft ||
                    normalizeColorForPicker(backgroundColorDraft) ===
                      normalizeColorForPicker(currentConversationBackgroundColor)
                  }
                >
                  {isUpdatingBackground ? "Đang lưu..." : "Lưu màu nền"}
                </button>
                <button
                  type="button"
                  onClick={() => backgroundImageInputRef.current?.click()}
                  disabled={isUpdatingBackground}
                >
                  Tải ảnh nền từ máy
                </button>
              </div>
              {currentConversationBackgroundImageUrl ? (
                <p className="mess-infor-background-preview-label">
                  Hội thoại đang dùng ảnh nền.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mess-infor-footer-tool">
          <ul>
            <li>
              <div
                onClick={() => handleShowTool(0)}
                className="title-tool flex"
              >
                <p>Tùy chỉnh hội thoại</p>
                <div
                  className={`mess-infor-detial-tool ${
                    showTool.includes(0) ? "mess-infor-tool-active" : ""
                  }`}
                >
                  <IoTriangle style={{ color: "#7589a3", fontSize: "11px" }} />
                </div>
              </div>
              <div className={showTool.includes(0) ? "li-tool-active" : "li-tool-none"}>
                <div className="mess-infor-panel-body">
                  <p className="mess-infor-section-note">
                    Cập nhật tên hiển thị cục bộ và các thông tin tùy chỉnh của hội thoại này.
                  </p>
                  {canRenameGroup ? (
                    <>
                      <label className="mess-infor-field">
                        <span>Tên nhóm</span>
                        <input
                          type="text"
                          value={groupNameDraft}
                          onChange={(event) => setGroupNameDraft(event.target.value)}
                          placeholder="Nhập tên nhóm"
                        />
                      </label>
                      <button
                        type="button"
                        className="mess-infor-primary-button"
                        onClick={handleSaveGroupName}
                        disabled={isSavingGroupName}
                      >
                        {isSavingGroupName ? "Đang lưu..." : "Lưu tên nhóm"}
                      </button>
                    </>
                  ) : null}
                  <label className="mess-infor-field">
                    <span>Tên gọi nhớ</span>
                    <input
                      type="text"
                      value={customNameDraft}
                      onChange={(event) => setCustomNameDraft(event.target.value)}
                      placeholder="Nhập tên gọi nhớ"
                    />
                  </label>
                  <button
                    type="button"
                    className="mess-infor-primary-button"
                    onClick={handleSaveCustomName}
                    disabled={isSavingCustomName}
                  >
                    {isSavingCustomName ? "Đang lưu..." : "Lưu tên gọi nhớ"}
                  </button>
                </div>
              </div>
            </li>
            {isGroupConversation ? (
              <li>
                <div
                  onClick={() => handleShowTool(1)}
                  className="title-tool flex"
                >
                  <p>Thành viên nhóm</p>
                  <div
                    className={`mess-infor-detial-tool ${
                      showTool.includes(1) ? "mess-infor-tool-active" : ""
                    }`}
                  >
                    <IoTriangle style={{ color: "#7589a3", fontSize: "11px" }} />
                  </div>
                </div>
                <div className={showTool.includes(1) ? "li-tool-active" : "li-tool-none"}>
                  <div className="mess-infor-panel-body">
                    <p className="mess-infor-section-note">
                      Quản lý thành viên, quyền nhóm và vòng đời hội thoại.
                    </p>
                    <div className="mess-infor-member-list">
                      {normalizedMembers.map((member) => {
                        const isCurrentUser =
                          String(member.userId) === String(currentUserId);
                        const canTransferOwnership =
                          canTransferOwnershipTo(member);
                        const canPromoteToAdmin = canPromoteAdminFor(member);
                        const canDemoteAdmin = canDemoteAdminFor(member);
                        const canRemoveThisMember = canRemoveMember(member);
                        const hasMemberActions =
                          canTransferOwnership ||
                          canPromoteToAdmin ||
                          canDemoteAdmin ||
                          canRemoveThisMember;

                        return (
                          <div key={member.userId} className="mess-infor-member-row">
                            <div className="mess-infor-member-main">
                              {member.avatarUrl ? (
                                <img
                                  src={member.avatarUrl}
                                  alt=""
                                  className="mess-infor-member-avatar"
                                />
                              ) : (
                                renderAvatarPlaceholder("mess-infor-member-avatar", 32)
                              )}
                              <div className="mess-infor-member-meta">
                                <p className="mess-infor-member-name">
                                  {member.nickname || member.displayName}
                                </p>
                                <p className="mess-infor-member-role">
                                  {member.role === "OWNER" ? "Trưởng nhóm" : member.role === "ADMIN" ? "Phó nhóm" : "Thành viên"}
                                </p>
                                <div className="mess-infor-member-nickname-form">
                                  <input
                                    type="text"
                                    value={nicknameDrafts[String(member.userId)] || ""}
                                    onChange={(event) =>
                                      setNicknameDrafts((prevState) => ({
                                        ...prevState,
                                        [String(member.userId)]: event.target.value,
                                      }))
                                    }
                                    placeholder="Biệt danh"
                                    className="mess-infor-member-nickname-input"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveMemberNickname(member.userId)}
                                    className="mess-infor-member-nickname-save"
                                  >
                                    Lưu
                                  </button>
                                </div>
                              </div>
                            </div>
                            {!isCurrentUser && hasMemberActions ? (
                              <div className="mess-infor-member-actions">
                                {canTransferOwnership ? (
                                  <button
                                    type="button"
                                    onClick={() => handleTransferOwnership(member.userId)}
                                    disabled={isUpdatingMembers}
                                    style={{
                                      border: "none",
                                      borderRadius: 8,
                                      padding: "6px 10px",
                                      backgroundColor: "#fff1d6",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Chuyển chủ nhóm
                                  </button>
                                ) : null}
                                {canPromoteToAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => handlePromoteAdmin(member.userId)}
                                    disabled={isUpdatingMembers}
                                    style={{
                                      border: "none",
                                      borderRadius: 8,
                                      padding: "6px 10px",
                                      backgroundColor: "#e5efff",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Lên admin
                                  </button>
                                ) : null}
                                {canDemoteAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDemoteAdmin(member.userId)}
                                    disabled={isUpdatingMembers}
                                    style={{
                                      border: "none",
                                      borderRadius: 8,
                                      padding: "6px 10px",
                                      backgroundColor: "#f1f3f5",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Hạ admin
                                  </button>
                                ) : null}
                                {canRemoveThisMember ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMember(member.userId)}
                                    disabled={isUpdatingMembers}
                                    style={{
                                      border: "none",
                                      borderRadius: 8,
                                      padding: "6px 10px",
                                      backgroundColor: "#eaedf0",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Xóa
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {canAddMember ? (
                      <div className="mess-infor-add-member" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => setShowAddMemberModal(true)}
                          disabled={isUpdatingMembers || friendOptionsState.loading}
                          style={{
                            border: "none",
                            borderRadius: 8,
                            padding: "10px 12px",
                            backgroundColor: "#0068ff",
                            color: "white",
                            fontWeight: 600,
                            cursor: "pointer",
                            width: "100%",
                            textAlign: "center",
                          }}
                        >
                          Thêm thành viên
                        </button>
                      </div>
                    ) : null}
                    {canLeaveGroup ? (
                      <button
                        className="mess-infor-danger-outline"
                        type="button"
                        onClick={handleLeaveConversation}
                        disabled={isUpdatingMembers}
                        style={{
                          border: "1px solid #d84747",
                          borderRadius: 8,
                          padding: "10px 12px",
                          backgroundColor: "white",
                          color: "#d84747",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Rời nhóm
                      </button>
                    ) : null}
                    {canCloseConversation ? (
                      <button
                        className="mess-infor-danger-soft"
                        type="button"
                        onClick={handleCloseConversation}
                        disabled={isUpdatingMembers}
                      >
                        Đóng nhóm
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ) : null}
            {listOption.map((data, index) => (
              <li key={data}>
                {(() => {
                  const toolIndex = index + optionBaseIndex;
                  const isToolOpen = showTool.includes(toolIndex);

                  return (
                    <>
                <div
                  onClick={() => handleShowTool(toolIndex)}
                  className="title-tool flex"
                >
                  <p>{data}</p>
                  <div
                    className={`mess-infor-detial-tool ${
                      isToolOpen
                        ? "mess-infor-tool-active"
                        : ""
                    }`}
                  >
                    <IoTriangle style={{ color: "#7589a3", fontSize: "11px" }} />
                  </div>
                </div>
                <div
                  className={
                    isToolOpen
                      ? "li-tool-active"
                      : "li-tool-none"
                  }
                >
                  {data === "Tùy chỉnh thông báo" ? (
                    renderNotificationSettingsPanel()
                  ) : data === "Tệp đã chia sẻ" ? (
                    renderSharedAttachmentPanel()
                  ) : data === "Liên kết" ? (
                    renderSharedLinksPanel()
                  ) : data === "Bảo mật" ? (
                    canManagePrivateBlock
                      ? renderPrivateSecurityPanel()
                      : isGroupConversation
                      ? renderGroupSecurityPanel()
                      : renderUnavailablePanel("Không có thiết lập bảo mật riêng cho hội thoại này.")
                  ) : (
                    renderUnavailablePanel()
                  )}
                </div>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
          {settingsError ? (
            <p className="mess-infor-feedback-error">
              {settingsError}
            </p>
          ) : null}
          {showAddMemberModal && (
            <div className="screen-mask" style={{ zIndex: 1002 }}>
              <div className="wrap-add modal-add-friend" style={{ height: 550 }}>
                <div className="header-add-friend flex">
                  <p>Thêm thành viên</p>
                  <IoMdClose
                    className="btn-close"
                    onClick={() => {
                      setShowAddMemberModal(false)
                      setAddMemberSearchKeyword('')
                    }}
                  />
                </div>
                
                <div className="modal-body-content">
                  <div className="search-input-container">
                    <svg className="search-input-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.608 10.608Z" />
                    </svg>
                    <input
                      type="text"
                      value={addMemberSearchKeyword}
                      onChange={(e) => setAddMemberSearchKeyword(e.target.value)}
                      placeholder="Nhập tên hoặc số điện thoại..."
                    />
                  </div>

                  <div className="modal-section-label">DANH SÁCH BẠN BÈ</div>

                  <div className="friend-search-results-wrapper" style={{ flex: 1, overflowY: "auto" }}>
                    {friendOptionsState.loading ? (
                      <div className="search-error-message">Đang tải danh sách...</div>
                    ) : null}
                    
                    {!friendOptionsState.loading && friendOptionsState.error ? (
                      <div className="search-error-message">{friendOptionsState.error}</div>
                    ) : null}

                    {!friendOptionsState.loading && !friendOptionsState.error && (
                      <div className="friend-search-results-list" style={{ gap: 10 }}>
                        {friendOptions
                          .filter((friend) => {
                            if (!addMemberSearchKeyword.trim()) return true
                            return String(friend.displayName || '')
                              .toLowerCase()
                              .includes(addMemberSearchKeyword.toLowerCase()) ||
                              String(friend.username || '')
                                .toLowerCase()
                                .includes(addMemberSearchKeyword.toLowerCase())
                          })
                          .map((friend) => {
                            const isAlreadyInGroup = normalizedMembers.some(
                              (member) => String(member.userId) === String(friend.userId)
                            )
                            return (
                              <div key={friend.userId} className="friend-search-item flex items-center justify-between" style={{ padding: "8px 12px" }}>
                                <div className="flex items-center gap-3">
                                  <div className="friend-search-avatar">
                                    {friend.avatarUrl ? (
                                      <img src={friend.avatarUrl} alt="" />
                                    ) : (
                                      <div className="avatar-initials">
                                        {(friend.displayName || '?').charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <p className="username" style={{ margin: 0, fontWeight: 600 }}>{friend.displayName}</p>
                                    {friend.username && (
                                      <p className="friend-search-subtitle" style={{ margin: 0, fontSize: 12, color: "#7589a3" }}>@{friend.username}</p>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <button
                                    className="btn-add-friend-action"
                                    disabled={isAlreadyInGroup || isUpdatingMembers}
                                    onClick={() => handleAddMember(friend.userId)}
                                    style={{
                                      backgroundColor: isAlreadyInGroup ? "#cbd5e1" : "#0068ff",
                                      color: isAlreadyInGroup ? "#64748b" : "white",
                                      cursor: isAlreadyInGroup ? "not-allowed" : "pointer"
                                    }}
                                  >
                                    {isAlreadyInGroup ? "Đã tham gia" : "Thêm"}
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
                  <button 
                    className="btn-cancel" 
                    type="button" 
                    onClick={() => {
                      setShowAddMemberModal(false)
                      setAddMemberSearchKeyword('')
                    }}
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="mess-infor-fill-namespace">&nbsp;</div>
        </div>
      </div>
    </div>
  );
}

export default memo(MessageInfor);



