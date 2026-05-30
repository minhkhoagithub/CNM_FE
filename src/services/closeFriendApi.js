import { getCloseFriendsV2, updateFriendshipSettingV2 } from "../util/api";

export const CLOSE_FRIEND_STATUS_CHANGED_EVENT = "web:close-friend-status-changed";

const normalizeUserId = (value) => String(value || "").trim();

const resolveFriendId = (item) =>
  normalizeUserId(
    item?.friend?.userId ||
      item?.friendId ||
      item?.userId ||
      item?._id
  );

export const emitCloseFriendStatusChanged = ({
  friendId,
  isCloseFriend,
  note = null,
}) => {
  const normalizedFriendId = normalizeUserId(friendId);
  if (!normalizedFriendId || typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(CLOSE_FRIEND_STATUS_CHANGED_EVENT, {
      detail: {
        friendId: normalizedFriendId,
        isCloseFriend: Boolean(isCloseFriend),
        note: note ?? null,
      },
    })
  );
};

export const getCloseFriendsForCurrentUser = async () => {
  const response = await getCloseFriendsV2();
  return Array.isArray(response?.data) ? response.data : [];
};

export const getCloseFriendIdsForCurrentUser = async () => {
  const closeFriends = await getCloseFriendsForCurrentUser();
  return new Set(
    closeFriends
      .map(resolveFriendId)
      .filter((friendId) => friendId.length > 0)
  );
};

export const updateCloseFriendStatusForCurrentUser = async ({
  friendId,
  isCloseFriend,
  note,
}) => {
  const response = await updateFriendshipSettingV2({
    friendId,
    isCloseFriend,
    note,
  });
  const payload = response?.data || {};
  emitCloseFriendStatusChanged({
    friendId: payload.friendId || friendId,
    isCloseFriend:
      typeof payload.isCloseFriend === "boolean"
        ? payload.isCloseFriend
        : isCloseFriend,
    note: payload.note ?? note ?? null,
  });
  return response;
};
