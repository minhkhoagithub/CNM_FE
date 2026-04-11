let currentChatUserId = null;

const USER_PROFILE_STORAGE_KEY = "userProfile";

const parseStoredUserProfile = () => {
  try {
    const rawProfile = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    return rawProfile ? JSON.parse(rawProfile) : null;
  } catch {
    return null;
  }
};

export const resolveChatUserId = () => {
  if (currentChatUserId) {
    return currentChatUserId;
  }

  const storedProfile = parseStoredUserProfile();
  return storedProfile?.userId || storedProfile?._id || null;
};

export const setChatUserId = (userId) => {
  currentChatUserId = userId || null;
};
