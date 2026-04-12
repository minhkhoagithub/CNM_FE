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
import {
  createAttachmentPreviewText,
  isImageAttachment,
  mapMessage,
  mapMessagePage,
  markMessageAsDeleted,
  normalizeMessageList,
  removeMessageItem,
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
const REACTION_LABELS = {
  LIKE: "👍",
  LOVE: "❤️",
  HAHA: "😂",
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


function ContainerMess({ contactData }) {
  const scrollRef = useRef(null);
  const inputMessage = useRef(null);
  const fileInputRef = useRef(null);
  const selectedAttachmentsRef = useRef([]);
  const typingStateRef = useRef(false);
  const typingDebounceTimeoutRef = useRef(null);
  const typingIdleTimeoutRef = useRef(null);
  const remoteTypingTimeoutRef = useRef(null);
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
  const [typingUserId, setTypingUserId] = useState(null);
  const { userData } = useContext(UserContext);
  const {
    selectedConversationId,
    currentConversationNormalized,
    updateConversationById,
  } = useContext(ContactContext);
  const { theme, handleChangeTheme } = useContext(ThemeContext);
  const currentUserId = userData?.userId || userData?._id || null;
  const backendConversationId = selectedConversationId || contactData?.id || null;
  const activeConversation = useMemo(() => {
    if (
      currentConversationNormalized?.id &&
      currentConversationNormalized.id === backendConversationId
    ) {
      return currentConversationNormalized;
    }

    return contactData || currentConversationNormalized || null;
  }, [backendConversationId, contactData, currentConversationNormalized]);
  const conversationName =
    activeConversation?.displayName ||
    activeConversation?.trustedDisplayName ||
    activeConversation?.title ||
    "";
  const conversationAvatar =
    activeConversation?.avatarUrl ||
    activeConversation?.trustedAvatarUrl ||
    activeConversation?.avatar ||
    null;
  const currentUserAvatar = userData?.avatarUrl || userData?.avatar || null;
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

  const pushTypingState = useCallback(
    async (isTyping) => {
      if (!backendConversationId) {
        return;
      }

      if (typingStateRef.current === isTyping) {
        return;
      }

      typingStateRef.current = isTyping;

      try {
        await sendTypingState(backendConversationId, isTyping);
      } catch (error) {
        console.error("Failed to update typing state:", error);
      }
    },
    [backendConversationId]
  );

  const syncComposerState = useCallback(() => {
    const currentText = inputMessage.current?.textContent?.trim() || "";
    setDraftText(currentText);

    if (!backendConversationId) {
      return;
    }

    const shouldSendTyping = Boolean(currentText);

    if (typingDebounceTimeoutRef.current) {
      clearTimeout(typingDebounceTimeoutRef.current);
    }

    typingDebounceTimeoutRef.current = setTimeout(() => {
      pushTypingState(shouldSendTyping);
    }, TYPING_DEBOUNCE_MS);

    if (typingIdleTimeoutRef.current) {
      clearTimeout(typingIdleTimeoutRef.current);
    }

    if (shouldSendTyping) {
      typingIdleTimeoutRef.current = setTimeout(() => {
        pushTypingState(false);
      }, TYPING_IDLE_MS);
    }
  }, [backendConversationId, pushTypingState]);

  const resetComposer = useCallback(() => {
    if (inputMessage.current) {
      inputMessage.current.textContent = "";
    }

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
    setMessages((prevMessages) => markMessageAsDeleted(prevMessages, messageId, deletedAt));
  }, []);

  const removeMessageById = useCallback((messageId) => {
    setMessages((prevMessages) => removeMessageItem(prevMessages, messageId));
  }, []);

  const syncMessageReactionSummary = useCallback((messageId, reactions, myReaction) => {
    setMessages((prevMessages) =>
      updateMessageReactionSummary(prevMessages, messageId, reactions, myReaction)
    );
  }, []);

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

      if (remoteTypingTimeoutRef.current) {
        clearTimeout(remoteTypingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      pushTypingState(false);
    };
  }, [pushTypingState]);

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
        const page = mapMessagePage(response);
        setMessages(page.items);
        await markConversationSeen(backendConversationId);
        updateConversationById(backendConversationId, { unreadCount: 0 });
      } catch (error) {
        console.error("Failed to load backend conversation messages:", error);
        setMessages([]);
      }
    };

    fetchMessages();
  }, [backendConversationId, updateConversationById]);

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
      setTypingUserId(null);
      return undefined;
    }

    const subscriptionKey = `chat:conversation:${backendConversationId}:typing`;
    chatRealtimeService
      .subscribe(subscriptionKey, `/topic/typing/${backendConversationId}`, (event) => {
        if (event?.type !== "TYPING_UPDATED" || !event.payload?.userId) {
          return;
        }

        if (event.payload.userId === currentUserId) {
          return;
        }

        if (remoteTypingTimeoutRef.current) {
          clearTimeout(remoteTypingTimeoutRef.current);
        }

        if (event.payload.isTyping) {
          setTypingUserId(event.payload.userId);
          remoteTypingTimeoutRef.current = setTimeout(() => {
            setTypingUserId(null);
          }, TYPING_IDLE_MS + 600);
          return;
        }

        setTypingUserId(null);
      })
      .catch((error) => {
        console.error("Failed to subscribe to typing updates:", error);
      });

    return () => {
      chatRealtimeService.unsubscribe(subscriptionKey);
      setTypingUserId(null);
      if (remoteTypingTimeoutRef.current) {
        clearTimeout(remoteTypingTimeoutRef.current);
      }
    };
  }, [backendConversationId, currentUserId]);

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
    if (!inputMessage.current) {
      return;
    }

    inputMessage.current.textContent += value;
    inputMessage.current.focus();
    syncComposerState();
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
    const messageText = flag ? "👍" : inputMessage.current?.textContent?.trim() || "";

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
      });

      const nextMessage = mapMessage(response);
      upsertMessage(nextMessage);
      updateConversationPreview({
        messageText,
        attachments: uploadedAttachments,
        updatedAt: nextMessage.editedAt || nextMessage.createdAt,
      });
      resetComposer();
    } catch (error) {
      console.error("Failed to send message:", error);
      setActionError(
        selectedAttachments.length > 0
          ? "Khong the gui tep dinh kem."
          : "Khong the gui tin nhan."
      );
    } finally {
      setIsSending(false);
    }
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
  const statusHint =
    typingUserId
      ? "Dang go tin nhan..."
      : activeConversation?.lastActive && activeConversation.lastActive !== "Active"
      ? activeConversation.lastActive
      : "Dang hoat dong";
  // Keep status UI intentionally minimal for now; live message-status topic wiring can come later.
  const lastOwnMessageId = useMemo(() => {
    const ownMessages = normalizedMessages.filter((message) => message.senderId === currentUserId);

    return ownMessages.length ? ownMessages[ownMessages.length - 1].id : null;
  }, [currentUserId, normalizedMessages]);

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
              {typingUserId ? (
                <p className="typing-indicator">{statusHint}</p>
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
          <IoCallOutline className="icon-header" />
          <IoVideocamOutline className="icon-header" />
        </div>
      </div>
      <div className="infor-container" style={{ backgroundColor: theme }}>
        <div>
          <ul>
            {normalizedMessages.map((item, index) => {
              const isMine = item.senderId === currentUserId;
              const imageAttachments = item.attachments.filter(isImageAttachment);
              const fileAttachments = item.attachments.filter(
                (attachment) => !isImageAttachment(attachment)
              );
              const canEdit =
                isMine && !item.deletedAt && !item.attachments.length && Boolean(item.content);
              const canDelete = isMine && !item.deletedAt;

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
                      item.deletedAt ? "detail-mess-deleted" : ""
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
                        {item.content ? (
                          <p
                            className={`text-mess ${
                              item.deletedAt ? "message-text-deleted" : ""
                            }`}
                          >
                            {item.content}
                          </p>
                        ) : null}
                        {item.editedAt && !item.deletedAt ? (
                          <p className="message-state-chip">Da chinh sua</p>
                        ) : null}
                      </>
                    )}
                    {!item.deletedAt && (
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
        {isSending ? <p className="composer-feedback-hint">Dang gui tin nhan...</p> : null}
        {actionError ? (
          <p className="composer-feedback-error">{actionError}</p>
        ) : null}
      </div>
    </div>
  );
}

export default memo(ContainerMess);
