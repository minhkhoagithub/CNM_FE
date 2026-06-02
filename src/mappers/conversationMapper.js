const PRIVATE_CONVERSATION_PLACEHOLDER = "Người dùng";
const GROUP_CONVERSATION_PLACEHOLDER = "Nhóm";
const GROUP_SYSTEM_PREFIX = "[[GROUP_SYSTEM]]";
const GROUP_LABEL_META_BY_CODE = {
  FRIENDS: { label: "Bạn bè", color: "blue" },
  WORK: { label: "Công việc", color: "violet" },
  STUDY: { label: "Học tập", color: "amber" },
  FAMILY: { label: "Gia đình", color: "rose" },
  PROJECT: { label: "Dự án", color: "emerald" },
  OTHER: { label: "Khác", color: "slate" },
};

const resolveGroupLabelMeta = (
  groupLabel,
  fallbackDisplayName = "",
  fallbackColor = ""
) => {
  const normalizedCode = String(groupLabel || "").trim().toUpperCase();
  if (!normalizedCode) {
    return null;
  }

  const knownOption = GROUP_LABEL_META_BY_CODE[normalizedCode];
  return {
    code: normalizedCode,
    label: fallbackDisplayName || knownOption?.label || normalizedCode,
    color: fallbackColor || knownOption?.color || "slate",
  };
};

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

const resolveBackendAssetUrl = (value) => {
  const rawUrl = normalizeNonEmptyString(value);
  if (!rawUrl) {
    return "";
  }

  if (/^(https?:|data:|blob:)/i.test(rawUrl)) {
    return rawUrl;
  }

  if (rawUrl.startsWith("//")) {
    const protocol =
      typeof window !== "undefined" && window.location?.protocol
        ? window.location.protocol
        : "http:";
    return `${protocol}${rawUrl}`;
  }

  try {
    const apiBaseUrl = new URL(
      import.meta.env?.VITE_BASE_API_URL || "http://localhost:8080/api/v1"
    );
    if (rawUrl.startsWith("/api/")) {
      return `${apiBaseUrl.origin}${rawUrl}`;
    }

    return new URL(rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`, `${apiBaseUrl.origin}/`).href;
  } catch {
    return rawUrl;
  }
};

const pickFirstAssetUrl = (...values) => resolveBackendAssetUrl(pickFirstString(...values));

const parseGroupSystemPreviewPayload = (value) => {
  const content = typeof value === "string" ? value.trim() : "";
  if (!content.startsWith(GROUP_SYSTEM_PREFIX)) {
    return null;
  }

  try {
    const payload = JSON.parse(content.slice(GROUP_SYSTEM_PREFIX.length));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
};

export const resolveConversationPreviewText = (value) => {
  const content = typeof value === "string" ? value.trim() : "";
  if (!content) {
    return "";
  }

  const payload = parseGroupSystemPreviewPayload(content);
  if (!payload) {
    return content;
  }

  const kind = String(payload.kind || "");
  const actorName = String(payload.actorName || "Ai đó");
  const targetName = String(payload.targetName || "một thành viên");
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
      return "Hoạt động nhóm";
  }
};

const resolveConversationBackgroundColor = (conversation, rawConversation) =>
  toNullableString(
    pickFirstString(
      conversation?.backgroundColor,
      rawConversation?.backgroundColor,
      conversation?.background,
      rawConversation?.background
    )
  );

const resolveConversationBackgroundImageUrl = (conversation, rawConversation) =>
  toNullableString(
    pickFirstString(
      conversation?.backgroundImageUrl,
      rawConversation?.backgroundImageUrl,
      conversation?.backgroundImage,
      rawConversation?.backgroundImage,
      conversation?.backgroundUrl,
      rawConversation?.backgroundUrl
    )
  );

export const normalizeConversationType = (value) => {
  const rawType =
    typeof value === "string" ? value : value?.raw?.type || value?.type || "private";

  return String(rawType).toLowerCase() === "group" ? "group" : "private";
};

const normalizeMemberRole = (value) => {
  const role = pickFirstString(value);
  return role ? role.toUpperCase() : "MEMBER";
};

const resolveMemberRoleValue = (member) => {
  if (!member || typeof member !== "object") {
    return "";
  }

  const source =
    member.user || member.friend || member.receiver || member.sender || member.profile || member;

  return pickFirstString(
    member.role,
    member.memberRole,
    member.member_role,
    source?.role
  );
};

const normalizeMemberEntry = (member) => {
  if (!member) {
    return null;
  }

  if (typeof member === "string") {
    return {
      userId: member,
      username: member,
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
    username: pickFirstString(
      source?.username,
      member.username
    ),
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
    nickname: pickFirstString(source?.nickname, member.nickname),
    avatarUrl: pickFirstAssetUrl(
      source?.avatarUrl,
      source?.avatar,
      source?.avatar_url,
      source?.imageUrl,
      source?.photoUrl,
      member.avatarUrl,
      member.avatar,
      member.avatar_url,
      member.imageUrl,
      member.photoUrl
    ),
    role: normalizeMemberRole(resolveMemberRoleValue(member)),
    raw: member,
  };
};

const pickMemberPayload = (conversation) => {
  if (!conversation || typeof conversation !== "object") {
    return { hasPayload: false, members: [] };
  }

  if (hasOwn(conversation, "members")) {
    return { hasPayload: true, members: conversation.members };
  }

  if (hasOwn(conversation, "member")) {
    return { hasPayload: true, members: conversation.member };
  }

  const raw = conversation.raw && typeof conversation.raw === "object"
    ? conversation.raw
    : null;

  if (raw && hasOwn(raw, "members")) {
    return { hasPayload: true, members: raw.members };
  }

  if (raw && hasOwn(raw, "member")) {
    return { hasPayload: true, members: raw.member };
  }

  return { hasPayload: false, members: [] };
};

export const mapConversationMembers = (conversation) => {
  const { members: rawMembers } = pickMemberPayload(conversation);

  if (!Array.isArray(rawMembers)) {
    return [];
  }

  return rawMembers.map(normalizeMemberEntry).filter(Boolean);
};

const mergeMemberEntry = (currentMember, incomingMember) => {
  const current = normalizeMemberEntry(currentMember);
  const incoming = normalizeMemberEntry(incomingMember);

  if (!current) {
    return incoming;
  }

  if (!incoming) {
    return current;
  }

  return {
    ...current,
    ...incoming,
    userId: incoming.userId || current.userId,
    username: pickFirstString(incoming.username, current.username),
    displayName: pickFirstString(incoming.displayName, current.displayName, incoming.username, current.username, incoming.userId),
    nickname: pickFirstString(incoming.nickname, current.nickname),
    avatarUrl: pickFirstString(incoming.avatarUrl, current.avatarUrl),
    role: normalizeMemberRole(
      resolveMemberRoleValue(incomingMember) ? incoming.role : current.role || incoming.role
    ),
    raw: {
      ...(current.raw && typeof current.raw === "object" ? current.raw : {}),
      ...(incoming.raw && typeof incoming.raw === "object" ? incoming.raw : {}),
    },
  };
};

export const mergeConversationMembers = (
  currentMembers = [],
  incomingMembers = [],
  options = {}
) => {
  const mode = options.mode || "auto";
  const normalizedCurrentMembers = Array.isArray(currentMembers)
    ? currentMembers.map(normalizeMemberEntry).filter(Boolean)
    : [];
  const normalizedIncomingMembers = Array.isArray(incomingMembers)
    ? incomingMembers.map(normalizeMemberEntry).filter(Boolean)
    : [];
  const currentByUserId = new Map(
    normalizedCurrentMembers.map((member) => [String(member.userId), member])
  );
  const incomingByUserId = new Map(
    normalizedIncomingMembers.map((member) => [String(member.userId), member])
  );
  const shouldReplaceMembership =
    mode === "replace" ||
    (mode === "auto" &&
      (!normalizedCurrentMembers.length ||
        normalizedIncomingMembers.length >= normalizedCurrentMembers.length));
  const sourceMembers = shouldReplaceMembership
    ? normalizedIncomingMembers
    : normalizedCurrentMembers;
  const mergedMembers = sourceMembers
    .map((member) =>
      mergeMemberEntry(
        currentByUserId.get(String(member.userId)),
        incomingByUserId.get(String(member.userId)) || member
      )
    )
    .filter(Boolean);

  if (!shouldReplaceMembership) {
    normalizedIncomingMembers.forEach((member) => {
      if (
        !mergedMembers.some(
          (mergedMember) => String(mergedMember.userId) === String(member.userId)
        )
      ) {
        mergedMembers.push(mergeMemberEntry(null, member));
      }
    });
  }

  console.log("[WEB PHASE2 GROUP MEMBERS]", {
    mode,
    effectiveMode: shouldReplaceMembership ? "replace" : "patch",
    currentCount: normalizedCurrentMembers.length,
    incomingCount: normalizedIncomingMembers.length,
    resultCount: mergedMembers.length,
    preservedUserIds: normalizedCurrentMembers
      .filter(
        (member) =>
          !normalizedIncomingMembers.some(
            (incomingMember) => String(incomingMember.userId) === String(member.userId)
          )
      )
      .map((member) => member.userId),
  });

  return mergedMembers;
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
  const peerAvatarUrl = pickFirstAssetUrl(
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
  const trustedAvatarUrl = pickFirstAssetUrl(
    rawConversation?.groupAvatarUrl,
    rawConversation?.groupAvatar,
    rawConversation?.group_avatar_url,
    rawConversation?.avatarUrl,
    rawConversation?.avatar,
    rawConversation?.avatar_url,
    rawConversation?.imageUrl,
    rawConversation?.photoUrl,
    conversation?.groupAvatarUrl,
    conversation?.groupAvatar,
    conversation?.group_avatar_url,
    conversation?.trustedAvatarUrl,
    conversation?.avatarUrl,
    conversation?.avatar,
    conversation?.avatar_url,
    conversation?.imageUrl,
    conversation?.photoUrl
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

const resolveGroupMetadataPatchValue = (patch, raw, canonicalKey, alternateKeys = []) => {
  const directValue = resolveIdentityPatchValue(patch, raw, canonicalKey);
  if (directValue !== undefined) {
    return directValue;
  }

  for (const key of alternateKeys) {
    const nextValue = resolveIdentityPatchValue(patch, raw, key);
    if (nextValue !== undefined) {
      return nextValue;
    }
  }

  return undefined;
};

export const hasConversationMemberPayload = (value) =>
  pickMemberPayload(value).hasPayload;

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
  const isGroupConversation = normalizeConversationType(nextConversation) === "group";
  const memberPayload = pickMemberPayload(patch);
  const incomingMemberMergeMode =
    patch.__memberMergeMode || patch.raw?.__memberMergeMode || null;
  const memberMergeMode =
    incomingMemberMergeMode ||
    (isGroupConversation && memberPayload.hasPayload ? "replace" : "auto");

  delete nextConversation.__memberMergeMode;
  if (nextConversation.raw && typeof nextConversation.raw === "object") {
    delete nextConversation.raw.__memberMergeMode;
  }

  if (isGroupConversation) {
    if (memberPayload.hasPayload) {
      const mergedMembers = mergeConversationMembers(
        currentConversation.members,
        memberPayload.members,
        { mode: memberMergeMode }
      );

      nextConversation.members = mergedMembers;
      nextConversation.raw = {
        ...(nextConversation.raw || {}),
        members: mergedMembers,
      };
      console.log("[WEB PHASE2 CANONICAL UPSERT]", {
        conversationId: nextConversation.id,
        source: "authoritative-group-members",
        memberMergeMode,
        currentCount: Array.isArray(currentConversation.members)
          ? currentConversation.members.length
          : 0,
        incomingCount: Array.isArray(memberPayload.members)
          ? memberPayload.members.length
          : 0,
        resultCount: mergedMembers.length,
      });
    } else if (Array.isArray(currentConversation.members)) {
      nextConversation.members = currentConversation.members;
      nextConversation.raw = {
        ...(nextConversation.raw || {}),
        members: currentConversation.members,
      };
      console.log("[WEB PHASE2 CANONICAL UPSERT]", {
        conversationId: nextConversation.id,
        source: "partial-payload-preserve-members",
        preservedCount: currentConversation.members.length,
      });
    }
  }

  const nextPeerUserId = resolveIdentityPatchValue(patch, nextRaw, "peerUserId");
  const nextPeerDisplayName = resolveIdentityPatchValue(patch, nextRaw, "peerDisplayName");
  const nextPeerAvatarUrl = resolveBackendAssetUrl(
    resolveIdentityPatchValue(patch, nextRaw, "peerAvatarUrl")
  );
  const nextTrustedDisplayName =
    isGroupConversation
      ? resolveGroupMetadataPatchValue(patch, nextRaw, "trustedDisplayName", [
          "displayName",
          "name",
          "groupName",
        ])
      : resolveIdentityPatchValue(patch, nextRaw, "trustedDisplayName");
  const nextTrustedAvatarUrlRaw =
    isGroupConversation
      ? resolveGroupMetadataPatchValue(patch, nextRaw, "trustedAvatarUrl", [
          "groupAvatarUrl",
          "groupAvatar",
          "group_avatar_url",
          "avatarUrl",
          "avatar",
          "avatar_url",
          "imageUrl",
          "photoUrl",
        ])
      : resolveIdentityPatchValue(patch, nextRaw, "trustedAvatarUrl");
  const nextTrustedAvatarUrl = resolveBackendAssetUrl(nextTrustedAvatarUrlRaw);

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
  const finalDisplayName =
    normalizedType === "group" ? trustedDisplayName : customName || trustedDisplayName;
  const backgroundColor = resolveConversationBackgroundColor(
    conversation,
    rawConversation
  );
  const backgroundImageUrl = resolveConversationBackgroundImageUrl(
    conversation,
    rawConversation
  );
  const isDisbanded = Boolean(
    conversation?.isDisbanded ?? rawConversation?.isDisbanded
  );
  const rawGroupLabelCode = toNullableString(
    pickFirstString(conversation?.groupLabel, rawConversation?.groupLabel)
  );
  const rawGroupLabelDisplayName = toNullableString(
    pickFirstString(
      conversation?.groupLabelDisplayName,
      rawConversation?.groupLabelDisplayName
    )
  );
  const rawGroupLabelColor = toNullableString(
    pickFirstString(
      conversation?.groupLabelColor,
      rawConversation?.groupLabelColor
    )
  );
  const resolvedGroupLabel =
    normalizedType === "group"
      ? resolveGroupLabelMeta(
          rawGroupLabelCode,
          rawGroupLabelDisplayName || "",
          rawGroupLabelColor || ""
        )
      : null;

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
    lastMessage: resolveConversationPreviewText(
      conversation?.lastMessage ?? rawConversation?.lastMessage ?? ""
    ),
    lastMessageSenderId:
      conversation?.lastMessageSenderId ??
      rawConversation?.lastMessageSenderId ??
      rawConversation?.lastMessageSenderUserId ??
      rawConversation?.lastSenderId ??
      rawConversation?.lastMessage?.senderId ??
      rawConversation?.lastMessage?.senderUserId ??
      rawConversation?.lastMessage?.userId ??
      rawConversation?.lastMessage?.sender?.id ??
      rawConversation?.lastMessage?.sender?.userId ??
      null,
    lastMessageTime:
      conversation?.lastMessageTime ?? rawConversation?.lastMessageTime ?? null,
    lastActive: conversation?.lastActive ?? rawConversation?.lastActive ?? null,
    muted: Boolean(conversation?.muted ?? rawConversation?.muted),
    archived: Boolean(conversation?.archived ?? rawConversation?.archived),
    pinned: Boolean(conversation?.pinned ?? rawConversation?.pinned),
    notificationLevel:
      conversation?.notificationLevel || rawConversation?.notificationLevel || "ALL",
    customName,
    groupLabel: resolvedGroupLabel?.code || null,
    groupLabelDisplayName: resolvedGroupLabel?.label || null,
    groupLabelColor: resolvedGroupLabel?.color || null,
    isDisbanded,
    backgroundColor,
    backgroundImageUrl,
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
