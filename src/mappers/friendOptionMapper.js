const pickFirstString = (...values) => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmedValue = value.trim();
    if (trimmedValue) {
      return trimmedValue;
    }
  }

  return "";
};

export const normalizeFriendOption = (item) => {
  if (!item) {
    return null;
  }

  const source =
    item.friend || item.user || item.profile || item.receiver || item.sender || item;
  const userId =
    source?.userId ||
    source?.id ||
    source?._id ||
    item.userId ||
    item.id ||
    item._id ||
    null;

  if (!userId) {
    return null;
  }

  const displayName = pickFirstString(
    source?.displayName,
    source?.username,
    source?.name,
    source?.phone,
    item.displayName,
    item.username,
    item.name,
    item.phone,
    String(userId)
  );
  const avatarUrl = pickFirstString(
    source?.avatarUrl,
    source?.avatar,
    item.avatarUrl,
    item.avatar
  );

  return {
    _id: userId,
    userId,
    username: pickFirstString(source?.username, item.username, displayName),
    displayName,
    avatarUrl,
    avatar: avatarUrl,
    friendshipId: item.friendshipId || item.id || null,
    raw: item,
  };
};

export const mapFriendOptions = (items = []) => {
  if (!Array.isArray(items)) {
    return [];
  }

  const seenUserIds = new Set();

  return items
    .map(normalizeFriendOption)
    .filter(Boolean)
    .filter((friend) => {
      const normalizedUserId = String(friend.userId);
      if (seenUserIds.has(normalizedUserId)) {
        return false;
      }

      seenUserIds.add(normalizedUserId);
      return true;
    });
};
