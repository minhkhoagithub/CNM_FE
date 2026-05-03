export const FRIEND_REALTIME_EVENT_TYPES = {
  FRIEND_REQUEST_CREATED: "FRIEND_REQUEST_CREATED",
  FRIEND_REQUEST_ACCEPTED: "FRIEND_REQUEST_ACCEPTED",
  FRIEND_REQUEST_REJECTED: "FRIEND_REQUEST_REJECTED",
  FRIENDSHIP_REMOVED: "FRIENDSHIP_REMOVED",
};

export const getFriendRealtimeDestination = (userId) =>
  `/topic/users/${userId}/friends`;

export const isFriendRealtimeEvent = (payload) =>
  Object.values(FRIEND_REALTIME_EVENT_TYPES).includes(payload?.type);
