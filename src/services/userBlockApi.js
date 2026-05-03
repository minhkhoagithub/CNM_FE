import {
  blockUserV2,
  getBlockedUsersV2,
  unblockUserV2,
} from "../util/api";

export const USER_BLOCK_STATUS_CHANGED_EVENT = "web:user-block-status-changed";

const normalizeUserId = (value) => String(value || "").trim();

const resolveBlockedUserId = (item) =>
  normalizeUserId(
    item?.blockedUser?.userId || item?.blockedUserId || item?.userId || item?._id
  );

export const emitUserBlockStatusChanged = ({ blockedUserId, isBlocked }) => {
  const normalizedBlockedUserId = normalizeUserId(blockedUserId);
  if (!normalizedBlockedUserId || typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(USER_BLOCK_STATUS_CHANGED_EVENT, {
      detail: {
        blockedUserId: normalizedBlockedUserId,
        isBlocked: Boolean(isBlocked),
      },
    })
  );
};

export const getBlockedUsersForCurrentUser = async () => {
  const response = await getBlockedUsersV2();
  return Array.isArray(response?.data) ? response.data : [];
};

export const isUserBlockedByCurrentUser = async (blockedUserId) => {
  const normalizedBlockedUserId = normalizeUserId(blockedUserId);
  if (!normalizedBlockedUserId) {
    return false;
  }

  const blockedUsers = await getBlockedUsersForCurrentUser();
  return blockedUsers.some(
    (item) => resolveBlockedUserId(item) === normalizedBlockedUserId
  );
};

export const blockUserForCurrentUser = async ({
  blockedUserId,
  reason = "",
}) => {
  const response = await blockUserV2({
    blockedUserId,
    reason,
  });

  emitUserBlockStatusChanged({
    blockedUserId,
    isBlocked: true,
  });

  return response;
};

export const unblockUserForCurrentUser = async ({ blockedUserId }) => {
  const response = await unblockUserV2({ blockedUserId });

  emitUserBlockStatusChanged({
    blockedUserId,
    isBlocked: false,
  });

  return response;
};
