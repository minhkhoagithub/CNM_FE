const normalizeConversationType = (type) => {
  if (!type) {
    return "private";
  }

  return String(type).toLowerCase() === "group" ? "group" : "private";
};

const normalizeMemberEntry = (member) => {
  if (!member) {
    return null;
  }

  if (typeof member === "string") {
    return {
      userId: member,
      displayName: member,
      avatarUrl: "",
    };
  }

  const userId = member.userId || member.id || member._id || member.memberUserId || null;
  if (!userId) {
    return null;
  }

  return {
    userId,
    displayName:
      member.displayName ||
      member.username ||
      member.name ||
      member.phone ||
      String(userId),
    avatarUrl: member.avatarUrl || member.avatar || "",
    role: member.role || member.memberRole || member.member_role || "MEMBER",
    raw: member,
  };
};

export const mapConversationMembers = (conversation) => {
  const rawMembers = conversation?.members || conversation?.member || [];
  if (!Array.isArray(rawMembers)) {
    return [];
  }

  return rawMembers.map(normalizeMemberEntry).filter(Boolean);
};

export const mapConversation = (conversation) => {
  const normalizedType = normalizeConversationType(conversation?.type);
  const displayName = conversation?.displayName || conversation?.name || "";

  return {
    id: conversation?.id || null,
    title: displayName,
    displayName,
    avatar: conversation?.avatarUrl || "",
    unreadCount: Number(conversation?.unreadCount || 0),
    lastMessage: conversation?.lastMessage || "",
    lastMessageTime: conversation?.lastMessageTime || null,
    muted: Boolean(conversation?.muted),
    archived: Boolean(conversation?.archived),
    pinned: Boolean(conversation?.pinned),
    notificationLevel: conversation?.notificationLevel || "ALL",
    customName: conversation?.customName || null,
    members: mapConversationMembers(conversation),
    type: normalizedType,
    raw: conversation,
  };
};

export const mapConversationList = (conversations = []) =>
  conversations.map(mapConversation);
