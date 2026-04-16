import React, { memo, useContext, useEffect, useMemo, useState } from "react";
import "../../resource/style/Chat/messageInfor.css";
import { ThemeContext } from "../../Context/ThemeContext";
import { ContactContext } from "../../Context/ContactConext";
import { UserContext } from "../../Context/UserContext";
import { AiOutlineBell } from "react-icons/ai";
import { GoPin } from "react-icons/go";
import { HiOutlineArchiveBox } from "react-icons/hi2";
import { CiEdit } from "react-icons/ci";
import { IoTriangle } from "react-icons/io5";
import { mapConversationMembers } from "../../mappers/conversationMapper";
import {
  addConversationMemberV1,
  closeConversationV1,
  demoteConversationAdminV1,
  leaveConversationV1,
  promoteConversationAdminV1,
  removeConversationMemberV1,
  transferConversationOwnershipV1,
  updateConversationArchiveV1,
  updateConversationCustomNameV1,
  updateConversationMuteV1,
  updateConversationNotificationLevelV1,
  updateConversationPinV1,
} from "../../services/chat/conversationApi";
import { fetchConversationSharedAttachments } from "./conversationMedia";

const NOTIFICATION_OPTIONS = [
  { value: "ALL", label: "Tat ca" },
  { value: "MENTIONS_ONLY", label: "Chi nhac toi" },
  { value: "NONE", label: "Tat" },
];
const PRIVATE_CONVERSATION_LABEL = "Nguoi dung";
const GROUP_CONVERSATION_LABEL = "Nhom";

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

function MessageInfor({ contactData, onOpenConversationImageGallery }) {
  const [showTool, setShowTool] = useState([]);
  const [customNameDraft, setCustomNameDraft] = useState("");
  const [notificationLevelDraft, setNotificationLevelDraft] = useState("ALL");
  const [friendOptions, setFriendOptions] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isSavingCustomName, setIsSavingCustomName] = useState(false);
  const [isUpdatingPreference, setIsUpdatingPreference] = useState(false);
  const [isUpdatingMembers, setIsUpdatingMembers] = useState(false);
  const [sharedAttachmentState, setSharedAttachmentState] = useState({
    loading: false,
    error: "",
    images: [],
    files: [],
    isPartial: false,
    conversationId: null,
  });
  const { theme } = useContext(ThemeContext);
  const { userData } = useContext(UserContext);
  const {
    currentConversationNormalized,
    selectedConversationId,
    updateConversationById,
    removeConversationById,
    clearSelectedConversation,
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
  const isGroupConversation = activeConversation?.type === "group";
  const currentUserId = userData?.userId || userData?._id || null;
  const normalizedMembers = useMemo(() => {
    const nextMembers = mapConversationMembers(
      Array.isArray(activeConversation?.members) && activeConversation.members.length
        ? { members: activeConversation.members }
        : activeConversation?.raw || activeConversation
    );

    if (
      currentUserId &&
      !nextMembers.some((member) => String(member.userId) === String(currentUserId))
    ) {
      nextMembers.unshift({
        userId: currentUserId,
        displayName: userData?.displayName || userData?.username || "Ban",
        avatarUrl: userData?.avatarUrl || userData?.avatar || "",
        role: "MEMBER",
      });
    }

    return nextMembers;
  }, [activeConversation, currentUserId, userData]);
  const currentUserMember = useMemo(
    () =>
      normalizedMembers.find(
        (member) => String(member.userId) === String(currentUserId)
      ) || null,
    [currentUserId, normalizedMembers]
  );
  const currentUserRole = currentUserMember?.role || "MEMBER";
  const currentUserIsOwner = currentUserRole === "OWNER";
  const ownerRoleKnown = normalizedMembers.some((member) => member.role === "OWNER");
  const canCloseConversation = isGroupConversation && (currentUserIsOwner || !ownerRoleKnown);
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
    () => ["Tuy chinh thong bao", "Tep da chia se", "Lien ket", "Bao mat"],
    []
  );
  const optionBaseIndex = isGroupConversation ? 2 : 1;
  const sharedFilesToolIndex = optionBaseIndex + listOption.indexOf("Tep da chia se");
  const isSharedFilesPanelOpen = showTool.includes(sharedFilesToolIndex);

  useEffect(() => {
    setCustomNameDraft(activeConversation?.customName || "");
    setNotificationLevelDraft(activeConversation?.notificationLevel || "ALL");
    setSettingsError("");
  }, [activeConversation?.customName, activeConversation?.notificationLevel, conversationId]);

  useEffect(() => {
    setSharedAttachmentState({
      loading: false,
      error: "",
      images: [],
      files: [],
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
          error: "Khong the tai tep da chia se trong hoi thoai nay.",
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

  const handleShowTool = (index) => {
    setShowTool((prevState) => {
      const check = prevState.includes(index);
      if (check) {
        return prevState.filter((x) => x !== index);
      }
      return [...prevState, index];
    });
  };

  const handleConversationPreferenceUpdate = async (key, nextValue) => {
    if (!conversationId) {
      return;
    }

    setSettingsError("");
    setIsUpdatingPreference(true);

    try {
      if (key === "muted") {
        await updateConversationMuteV1(conversationId, nextValue);
      }

      if (key === "pinned") {
        await updateConversationPinV1(conversationId, nextValue);
      }

      if (key === "archived") {
        await updateConversationArchiveV1(conversationId, nextValue);
      }

      if (key === "notificationLevel") {
        await updateConversationNotificationLevelV1(conversationId, nextValue);
      }

      updateConversationById(conversationId, {
        [key]: nextValue,
      });
    } catch (error) {
      console.error("Failed to update room preference:", error);
      setSettingsError("Khong the cap nhat tuy chon hoi thoai.");
    } finally {
      setIsUpdatingPreference(false);
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
      setSettingsError("Khong the cap nhat ten goi nho.");
    } finally {
      setIsSavingCustomName(false);
    }
  };

  const handleAddMember = async () => {
    if (!conversationId || !selectedMemberId) {
      return;
    }

    const selectedFriend = addableFriendOptions.find(
      (friend) => String(friend.userId) === String(selectedMemberId)
    );
    if (!selectedFriend) {
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    try {
      await addConversationMemberV1(conversationId, selectedFriend.userId);
      updateConversationById(conversationId, (currentConversation) => {
        const currentMembers = Array.isArray(currentConversation?.members)
          ? currentConversation.members
          : [];

        return {
          ...currentConversation,
          members: [...currentMembers, { ...selectedFriend, role: "MEMBER" }],
          raw: {
            ...(currentConversation?.raw || {}),
            members: [...currentMembers, { ...selectedFriend, role: "MEMBER" }],
          },
        };
      });
      setSelectedMemberId("");
    } catch (error) {
      console.error("Failed to add member to conversation:", error);
      setSettingsError("Khong the them thanh vien vao nhom.");
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleRemoveMember = async (memberUserId) => {
    if (!conversationId || !memberUserId) {
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    try {
      await removeConversationMemberV1(conversationId, memberUserId);
      updateConversationById(conversationId, (currentConversation) => {
        const currentMembers = Array.isArray(currentConversation?.members)
          ? currentConversation.members
          : [];
        const nextMembers = currentMembers.filter(
          (member) => String(member.userId) !== String(memberUserId)
        );

        return {
          ...currentConversation,
          members: nextMembers,
          raw: {
            ...(currentConversation?.raw || {}),
            members: nextMembers,
          },
        };
      });
    } catch (error) {
      console.error("Failed to remove member from conversation:", error);
      setSettingsError("Khong the xoa thanh vien khoi nhom.");
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const patchMemberRoles = (updater) => {
    updateConversationById(conversationId, (currentConversation) => {
      const currentMembers = Array.isArray(currentConversation?.members)
        ? currentConversation.members
        : [];
      const nextMembers =
        typeof updater === "function" ? updater(currentMembers) : currentMembers;

      return {
        ...currentConversation,
        members: nextMembers,
        raw: {
          ...(currentConversation?.raw || {}),
          members: nextMembers,
        },
      };
    });
  };

  const handleTransferOwnership = async (targetUserId) => {
    if (!conversationId || !targetUserId) {
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    try {
      await transferConversationOwnershipV1(conversationId, targetUserId);
      patchMemberRoles((members) =>
        members.map((member) => {
          if (String(member.userId) === String(targetUserId)) {
            return { ...member, role: "OWNER" };
          }

          if (member.role === "OWNER") {
            return { ...member, role: "ADMIN" };
          }

          return member;
        })
      );
    } catch (error) {
      console.error("Failed to transfer ownership:", error);
      setSettingsError("Khong the chuyen quyen truong nhom.");
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handlePromoteAdmin = async (targetUserId) => {
    if (!conversationId || !targetUserId) {
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    try {
      await promoteConversationAdminV1(conversationId, targetUserId);
      patchMemberRoles((members) =>
        members.map((member) =>
          String(member.userId) === String(targetUserId)
            ? { ...member, role: "ADMIN" }
            : member
        )
      );
    } catch (error) {
      console.error("Failed to promote admin:", error);
      setSettingsError("Khong the cap nhat quyen quan tri.");
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleDemoteAdmin = async (targetUserId) => {
    if (!conversationId || !targetUserId) {
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    try {
      await demoteConversationAdminV1(conversationId, targetUserId);
      patchMemberRoles((members) =>
        members.map((member) =>
          String(member.userId) === String(targetUserId)
            ? { ...member, role: "MEMBER" }
            : member
        )
      );
    } catch (error) {
      console.error("Failed to demote admin:", error);
      setSettingsError("Khong the thu hoi quyen quan tri.");
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleLeaveConversation = async () => {
    if (!conversationId) {
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    try {
      await leaveConversationV1(conversationId);
      removeConversationById(conversationId);
      clearSelectedConversation();
    } catch (error) {
      console.error("Failed to leave conversation:", error);
      setSettingsError("Khong the roi nhom nay luc nay.");
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleCloseConversation = async () => {
    if (!conversationId || !isGroupConversation) {
      return;
    }

    const confirmed = window.confirm("Ban co chac muon dong nhom nay?");
    if (!confirmed) {
      return;
    }

    setSettingsError("");
    setIsUpdatingMembers(true);

    try {
      await closeConversationV1(conversationId);
      removeConversationById(conversationId);
      clearSelectedConversation();
    } catch (error) {
      console.error("Failed to close conversation:", error);
      setSettingsError("Khong the dong nhom nay luc nay.");
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
          Tong hop tat ca anh va tep da duoc gui trong hoi thoai nay.
        </p>

        {sharedAttachmentState.loading ? (
          <div className="mess-infor-shared-feedback">
            Dang tai du lieu tep trong hoi thoai...
          </div>
        ) : null}

        {!sharedAttachmentState.loading && sharedAttachmentState.error ? (
          <div className="mess-infor-shared-feedback error">
            {sharedAttachmentState.error}
          </div>
        ) : null}

        {!sharedAttachmentState.loading && !sharedAttachmentState.error ? (
          <div className="mess-infor-shared-summary">
            <span>{totalSharedAttachments} muc</span>
            {sharedAttachmentState.isPartial ? (
              <span>Dang hien thi du lieu gan day</span>
            ) : (
              <span>{conversationId ? "Theo hoi thoai hien tai" : ""}</span>
            )}
          </div>
        ) : null}

        {!sharedAttachmentState.loading && !sharedAttachmentState.error ? (
          <div className="mess-infor-shared-section">
            <div className="mess-infor-shared-section-header">
              <p>Anh</p>
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
                        fileName: attachment.fileName || "Anh trong hoi thoai",
                      })
                    }
                  >
                    <img src={attachment.url} alt={attachment.fileName} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="mess-infor-shared-empty">Chua co anh duoc chia se.</div>
            )}
          </div>
        ) : null}

        {!sharedAttachmentState.loading && !sharedAttachmentState.error ? (
          <div className="mess-infor-shared-section">
            <div className="mess-infor-shared-section-header">
              <p>Tep</p>
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
              <div className="mess-infor-shared-empty">Chua co tep duoc chia se.</div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="mess-infor-container-messageinfor"
      style={{ backgroundColor: theme }}
    >
      <div className="mess-infor-title-text flex">
        <h3>Thong tin hoi thoai</h3>
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
              <CiEdit style={{ fontSize: "23px", cursor: "pointer" }} />
            </div>
            <div className="mess-infor-status-chips">
              {activeConversation?.pinned ? (
                <span className="mess-infor-status-chip pinned">Ghim</span>
              ) : null}
              {activeConversation?.muted ? (
                <span className="mess-infor-status-chip muted">Tat thong bao</span>
              ) : null}
              {activeConversation?.archived ? (
                <span className="mess-infor-status-chip archived">Luu tru</span>
              ) : null}
              <span className="mess-infor-status-chip">
                {activeConversation?.notificationLevel || "ALL"}
              </span>
            </div>
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
              <p>{activeConversation?.muted ? "Bat thong bao" : "Tat thong bao"}</p>
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
              <p>{activeConversation?.pinned ? "Bo ghim" : "Ghim hoi thoai"}</p>
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
              <p>{activeConversation?.archived ? "Bo luu tru" : "Luu tru"}</p>
            </div>
          </div>
        </div>
        <div className="mess-infor-footer-tool">
          <ul>
            <li>
              <div
                onClick={() => handleShowTool(0)}
                className="title-tool flex"
              >
                <p>Tuy chinh hoi thoai</p>
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
                    Cap nhat ten goi nho va cach nhan thong bao cho hoi thoai nay.
                  </p>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Ten goi nho</span>
                    <input
                      type="text"
                      value={customNameDraft}
                      onChange={(event) => setCustomNameDraft(event.target.value)}
                      placeholder="Nhap ten goi nho"
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #d6dbe1",
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveCustomName}
                    disabled={isSavingCustomName}
                    style={{
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 12px",
                      backgroundColor: "#0068ff",
                      color: "white",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {isSavingCustomName ? "Dang luu..." : "Luu ten goi nho"}
                  </button>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Thong bao</span>
                    <select
                      value={notificationLevelDraft}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setNotificationLevelDraft(nextValue);
                        handleConversationPreferenceUpdate("notificationLevel", nextValue);
                      }}
                      disabled={isUpdatingPreference}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #d6dbe1",
                      }}
                    >
                      {NOTIFICATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </li>
            {isGroupConversation ? (
              <li>
                <div
                  onClick={() => handleShowTool(1)}
                  className="title-tool flex"
                >
                  <p>Thanh vien nhom</p>
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
                      Quan ly thanh vien, quyen nhom va vong doi hoi thoai.
                    </p>
                    <div className="mess-infor-member-list">
                      {normalizedMembers.map((member) => {
                        const isCurrentUser =
                          String(member.userId) === String(currentUserId);
                        const canTransferOwnership =
                          !isCurrentUser && (currentUserIsOwner || !ownerRoleKnown);
                        const canPromoteToAdmin =
                          !isCurrentUser && member.role !== "ADMIN" && member.role !== "OWNER";
                        const canDemoteAdmin =
                          !isCurrentUser && member.role === "ADMIN";

                        return (
                          <div key={member.userId} className="mess-infor-member-row">
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {member.avatarUrl ? (
                                <img
                                  src={member.avatarUrl}
                                  alt=""
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: "50%",
                                    objectFit: "cover",
                                  }}
                                />
                              ) : (
                                renderAvatarPlaceholder("", 32)
                              )}
                              <div>
                                <p style={{ margin: 0, fontWeight: 500 }}>
                                  {member.displayName}
                                </p>
                                <p style={{ margin: 0, fontSize: 12, color: "#7589a3" }}>
                                  {isCurrentUser ? "Ban" : member.userId} • {member.role || "MEMBER"}
                                </p>
                              </div>
                            </div>
                            {!isCurrentUser ? (
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
                                    Chuyen chu nhom
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
                                    Len admin
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
                                    Ha admin
                                  </button>
                                ) : null}
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
                                  Xoa
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mess-infor-add-member">
                      <span style={{ fontSize: 14, fontWeight: 500 }}>Them thanh vien</span>
                      <select
                        value={selectedMemberId}
                        onChange={(event) => setSelectedMemberId(event.target.value)}
                        disabled={!addableFriendOptions.length || isUpdatingMembers}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "1px solid #d6dbe1",
                        }}
                      >
                        <option value="">
                          {addableFriendOptions.length
                            ? "Chon ban de them"
                            : "Khong con ban nao de them"}
                        </option>
                        {addableFriendOptions.map((friend) => (
                          <option key={friend.userId} value={friend.userId}>
                            {friend.displayName}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddMember}
                        disabled={!selectedMemberId || isUpdatingMembers}
                        style={{
                          border: "none",
                          borderRadius: 8,
                          padding: "10px 12px",
                          backgroundColor: "#0068ff",
                          color: "white",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {isUpdatingMembers ? "Dang xu ly..." : "Them thanh vien"}
                      </button>
                    </div>
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
                      Roi nhom
                    </button>
                    {canCloseConversation ? (
                      <button
                        className="mess-infor-danger-soft"
                        type="button"
                        onClick={handleCloseConversation}
                        disabled={isUpdatingMembers}
                      >
                        Dong nhom
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
                  {data === "Tep da chia se" ? (
                    renderSharedAttachmentPanel()
                  ) : (
                    <div style={{ padding: "0 12px 12px", color: "#7589a3", fontSize: 14 }}>
                      Tinh nang nay se duoc mo rong o giai doan sau.
                    </div>
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
          <div className="mess-infor-fill-namespace">&nbsp;</div>
        </div>
      </div>
    </div>
  );
}

export default memo(MessageInfor);
