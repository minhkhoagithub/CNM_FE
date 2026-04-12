const PRIVATE_CONVERSATION_PLACEHOLDER = "Nguoi dung";
const GROUP_CONVERSATION_PLACEHOLDER = "Nhom";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const normalizeNonEmptyString = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();
  return trimmedValue || "";
};

const toNullableString = (value) => normalizeNonEmptyString(value) || null;

const pickFirstString = (...values) => {
  for (const value of values) {
    const normalizedValue = normalizeNonEmptyString(value);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return "";
};

export const normalizeConversationType = (value) => {
  const rawType =
    typeof value === "string" ? value : value?.raw?.type || value?.type || "private";

  return String(rawType).toLowerCase() === "group" ? "group" : "private";
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
      role: "MEMBER",
      raw: member,
    };
  }

  const source =
    member.user || member.friend || member.receiver || member.sender || member.profile || member;
  const userId =
    source?.userId ||
    source?.id ||
    source?._id ||
    member.userId ||
    member.id ||
    member._id ||
    member.memberUserId ||
    null;

  if (!userId) {
    return null;
  }

  return {
    userId,
    displayName: pickFirstString(
      source?.displayName,
      source?.username,
      source?.name,
      source?.phone,
      member.displayName,
      member.username,
      member.name,
      member.phone,
      String(userId)
    ),
    avatarUrl: pickFirstString(
      source?.avatarUrl,
      source?.avatar,
      member.avatarUrl,
      member.avatar
    ),
    role:
      member.role ||
      member.memberRole ||
      member.member_role ||
      source?.role ||
      "MEMBER",
    raw: member,
  };
};

export const mapConversationMembers = (conversation) => {
  const directMembers =
    Array.isArray(conversation?.members) && conversation.members.length
      ? conversation.members
      : null;
  const legacyMembers =
    Array.isArray(conversation?.member) && conversation.member.length
      ? conversation.member
      : null;
  const rawMembers =
    directMembers ||
    legacyMembers ||
    (Array.isArray(conversation?.raw?.members)
      ? conversation.raw.members
      : Array.isArray(conversation?.raw?.member)
      ? conversation.raw.member
      : []);

  if (!Array.isArray(rawMembers)) {
    return [];
  }

  return rawMembers.map(normalizeMemberEntry).filter(Boolean);
};

const resolvePeerMember = (conversation, currentUserId) => {
  const members = mapConversationMembers(conversation);
  if (!members.length) {
    return null;
  }

  const explicitPeerUserId = pickFirstString(
    conversation?.peerUserId,
    conversation?.raw?.peerUserId
  );
  if (explicitPeerUserId) {
    const explicitPeerMember = members.find(
      (member) => String(member.userId) === String(explicitPeerUserId)
    );
    if (explicitPeerMember) {
      return explicitPeerMember;
    }
  }

  if (currentUserId) {
    const peerMember = members.find(
      (member) => String(member.userId) !== String(currentUserId)
    );
    if (peerMember) {
      return peerMember;
    }
  }

  return members[0] || null;
};

const resolvePrivateIdentity = (conversation, options = {}) => {
  const peerMember = resolvePeerMember(conversation, options.currentUserId);

  const peerUserId =
    toNullableString(conversation?.peerUserId) ||
    toNullableString(conversation?.raw?.peerUserId) ||
    toNullableString(peerMember?.userId);
  const peerDisplayName = pickFirstString(
    conversation?.peerDisplayName,
    conversation?.raw?.peerDisplayName,
    peerMember?.displayName,
    conversation?.trustedDisplayName
  );
  const peerAvatarUrl = pickFirstString(
    conversation?.peerAvatarUrl,
    conversation?.raw?.peerAvatarUrl,
    peerMember?.avatarUrl,
    conversation?.trustedAvatarUrl
  );

  return {
    peerUserId,
    peerDisplayName: peerDisplayName || null,
    peerAvatarUrl: peerAvatarUrl || null,
    trustedDisplayName: peerDisplayName,
    trustedAvatarUrl: peerAvatarUrl,
  };
};

const resolveGroupIdentity = (conversation) => {
  const rawConversation =
    conversation?.raw && typeof conversation.raw === "object" ? conversation.raw : conversation;

  const trustedDisplayName = pickFirstString(
    rawConversation?.name,
    rawConversation?.displayName,
    rawConversation?.groupName,
    conversation?.name,
    conversation?.groupName,
    conversation?.trustedDisplayName,
    conversation?.customName ? "" : conversation?.displayName
  );
  const trustedAvatarUrl = pickFirstString(
    rawConversation?.avatarUrl,
    rawConversation?.avatar,
    rawConversation?.groupAvatarUrl,
    conversation?.groupAvatarUrl,
    conversation?.trustedAvatarUrl,
    conversation?.avatarUrl,
    conversation?.avatar
  );

  return {
    peerUserId: null,
    peerDisplayName: null,
    peerAvatarUrl: null,
    trustedDisplayName,
    trustedAvatarUrl,
  };
};

const mergeRawConversation = (currentConversation, patch) => {
  const currentRaw =
    currentConversation?.raw && typeof currentConversation.raw === "object"
      ? currentConversation.raw
      : currentConversation || {};
  const patchRaw = patch?.raw && typeof patch.raw === "object" ? patch.raw : null;

  if (!patchRaw) {
    return currentRaw;
  }

  const nextRaw = { ...currentRaw };
  Object.keys(patchRaw).forEach((key) => {
    if (patchRaw[key] !== undefined) {
      nextRaw[key] = patchRaw[key];
    }
  });

  return nextRaw;
};

const resolveIdentityPatchValue = (patch, raw, key) => {
  if (hasOwn(patch, key)) {
    return patch[key];
  }

  if (hasOwn(raw, key)) {
    return raw[key];
  }

  return undefined;
};

const preserveIdentityValue = (currentValue, nextValue) => {
  if (typeof nextValue === "string") {
    const normalizedValue = nextValue.trim();
    return normalizedValue || currentValue || null;
  }

  if (nextValue === undefined || nextValue === null) {
    return currentValue || null;
  }

  return nextValue;
};

export const mergeConversationPatch = (currentConversation, patch) => {
  if (!currentConversation) {
    return patch || null;
  }

  if (!patch || typeof patch !== "object") {
    return currentConversation;
  }

  const nextRaw = mergeRawConversation(currentConversation, patch);
  const nextConversation = {
    ...currentConversation,
    ...patch,
    raw: nextRaw,
  };

  const nextPeerUserId = resolveIdentityPatchValue(patch, nextRaw, "peerUserId");
  const nextPeerDisplayName = resolveIdentityPatchValue(patch, nextRaw, "peerDisplayName");
  const nextPeerAvatarUrl = resolveIdentityPatchValue(patch, nextRaw, "peerAvatarUrl");
  const nextTrustedDisplayName = resolveIdentityPatchValue(
    patch,
    nextRaw,
    "trustedDisplayName"
  );
  const nextTrustedAvatarUrl = resolveIdentityPatchValue(
    patch,
    nextRaw,
    "trustedAvatarUrl"
  );

  nextConversation.peerUserId = preserveIdentityValue(
    currentConversation.peerUserId,
    nextPeerUserId
  );
  nextConversation.peerDisplayName = preserveIdentityValue(
    currentConversation.peerDisplayName,
    nextPeerDisplayName
  );
  nextConversation.peerAvatarUrl = preserveIdentityValue(
    currentConversation.peerAvatarUrl,
    nextPeerAvatarUrl
  );
  nextConversation.trustedDisplayName = preserveIdentityValue(
    currentConversation.trustedDisplayName,
    nextTrustedDisplayName
  );
  nextConversation.trustedAvatarUrl = preserveIdentityValue(
    currentConversation.trustedAvatarUrl,
    nextTrustedAvatarUrl
  );

  return nextConversation;
};

export const normalizeConversationInput = (conversation, options = {}) => {
  if (!conversation) {
    return null;
  }

  const rawConversation =
    conversation?.raw && typeof conversation.raw === "object" ? conversation.raw : conversation;
  const normalizedType = normalizeConversationType(conversation);
  const customName = toNullableString(conversation?.customName);
  const trustedIdentity =
    normalizedType === "private"
      ? resolvePrivateIdentity(conversation, options)
      : resolveGroupIdentity(conversation);
  const trustedDisplayName =
    trustedIdentity.trustedDisplayName ||
    (normalizedType === "group"
      ? GROUP_CONVERSATION_PLACEHOLDER
      : PRIVATE_CONVERSATION_PLACEHOLDER);
  const trustedAvatarUrl = toNullableString(trustedIdentity.trustedAvatarUrl);
  const finalDisplayName = customName || trustedDisplayName;

  return {
    id: conversation?.id || rawConversation?.id || null,
    type: normalizedType,
    title: finalDisplayName,
    displayName: finalDisplayName,
    trustedDisplayName,
    avatar: trustedAvatarUrl,
    avatarUrl: trustedAvatarUrl,
    trustedAvatarUrl,
    unreadCount: Number(
      conversation?.unreadCount ?? rawConversation?.unreadCount ?? 0
    ),
    lastMessage: conversation?.lastMessage ?? rawConversation?.lastMessage ?? "",
    lastMessageTime:
      conversation?.lastMessageTime ?? rawConversation?.lastMessageTime ?? null,
    lastActive: conversation?.lastActive ?? rawConversation?.lastActive ?? null,
    muted: Boolean(conversation?.muted ?? rawConversation?.muted),
    archived: Boolean(conversation?.archived ?? rawConversation?.archived),
    pinned: Boolean(conversation?.pinned ?? rawConversation?.pinned),
    notificationLevel:
      conversation?.notificationLevel || rawConversation?.notificationLevel || "ALL",
    customName,
    peerUserId: trustedIdentity.peerUserId,
    peerDisplayName: trustedIdentity.peerDisplayName,
    peerAvatarUrl: trustedIdentity.peerAvatarUrl,
    members: mapConversationMembers(conversation),
    raw: rawConversation,
  };
};

export const mapConversation = (conversation, options = {}) =>
  normalizeConversationInput(conversation, options);

export const mapConversationList = (conversations = [], options = {}) =>
  conversations.map((conversation) => mapConversation(conversation, options));
