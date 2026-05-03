import apiClient from "./axiosConfig";

// Update user cover image
export const updateCoverImage = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.patch("/users/profile/cover-image", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response;
};
// Update user avatar
export const updateAvatar = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.patch("/users/profile/avatar", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response;
};
// Update user profile
export const updateUserProfile = async (profileData) => {
  const response = await apiClient.put("/users/profile", profileData);
  return response;
};

export const getUserSettings = async () => {
  const response = await apiClient.get("/users/settings");
  return response;
};

export const updateUserSettings = async ({ settings }) => {
  const response = await apiClient.patch("/users/settings", { settings });
  return response;
};

// User
export const userLogin = async ({ username, password, deviceId, platform, deviceName }) => {
  const response = await apiClient.post("/auth/login", {
    username,
    password,
    deviceId,
    platform,
    deviceName,
  });
  return response;
};
export const checkEmailExists = async ({ email }) => {
  const response = await apiClient.post("/auth/check-email", {
    email: String(email || "").trim().toLowerCase(),
  });
  return response;
};
export const userRegister = async ({ username, password }) => {
  const response = await apiClient.post("/auth/register", {
    username,
    password,
  });
  return response;
};
export const sendRegisterOtp = async ({ email }) => {
  const response = await apiClient.post("/auth/send-register-otp", {
    email,
  });
  return response;
};
export const verifyRegisterOtp = async ({ email, otpCode, type = "REGISTER" }) => {
  const response = await apiClient.post("/auth/verify-otp", {
    email,
    otpCode,
    type,
  });
  return response;
};
// export const userRegisterWithOtp = async ({ name, email, phone, password, avatar, otpCode }) => {
//   const response = await apiClient.post("/auth/register", {
//     name,
//     email,
//     phone,
//     password,
//     avatar,
//     registerToken: otpCode,
//   });
//   return response;
// };
export const userRegisterWithOtp = async ({
  email,
  phone,
  password,
  firstName,
  lastName,
  dob,
  gender,
  registerToken,
}) => {
  const response = await apiClient.post("/auth/register", {
    email,
    phone,
    password,
    firstName,
    lastName,
    dob,
    gender,
    registerToken,
  });
  return response;
};
export const userLoginByToken = async () => {
  try {
    const response = await apiClient.post("/auth/token", {});
    return response;
  } catch {
    // Mock data náº¿u backend khÃ´ng sáºµn sÃ ng
    return {
      status: 200,
      data: {
        _id: "test123",
        username: "Test User",
        phone: "0123456789",
        avatar: "https://i.pravatar.cc/150?img=3",
      },
    };
  }
};
export const getCurrentUser = async () => {
  const response = await apiClient.get("/users/profile");
  return response.data;
};
export const updateFcmToken = async (token) => {
  const response = await apiClient.post("/users/me/fcm-token", { token });
  return response.data;
};
export const userLogout = async () => {
  const response = await apiClient.post("/auth/logout", {});
  return response;
};
export const getFriendById = async ({ friendId }) => {
  const response = await apiClient.post("/user/getfriendbyid", {
    friendId: friendId,
  });
  return response;
};
export const getFriendReq = async ({ id }) => {
  const response = await apiClient.post("/user/getfriendreq", { id: id });
  return response;
};
export const crudFriend = async ({ userId, friendId, state }) => {
  const response = await apiClient.post("/user/crudfriend", {
    userId,
    friendId,
    state,
  });
  return response;
};
export const getFriendByName = async ({ friendName, userId }) => {
  const response = await apiClient.post("/user/getfriendbyname", {
    friendName,
    userId,
  });
  return response;
};
export const getUserByPhone = async ({ phone, id }) => {
  const response = await apiClient.post("/user/getphone", {
    phone,
    id,
  });
  return response;
};
export const getAllFriend = async ({ id }) => {
  const response = await apiClient.post("/user/getallfriend", { id: id });
  return response;
};
export const getAllGroup = async ({ id }) => {
  const response = await apiClient.post("/user/getallgroup", { id: id });
  return response;
};
export const getFriendRes = async ({ id }) => {
  const response = await apiClient.post("/user/getfriendres", { id: id });
  return response;
};
export const getGroupReq = async ({ userId }) => {
  const response = await apiClient.post("/user/getgroupreq", {
    id: userId,
  });
  return response;
};
// Friend ships
const unwrapApiData = (response) => ({
  ...response,
  data: response.data?.data ?? null,
  apiCode: response.data?.code ?? "",
  apiMessage: response.data?.message ?? "",
  apiErrors: response.data?.errors ?? null,
  apiMeta: response.data?.meta ?? null,
});

export const searchUsersV2 = async ({ keyword }) => {
  const response = await apiClient.get("/users/search", {
    params: { q: keyword },
  });
  return unwrapApiData(response);
};

export const getFriendsV2 = async () => {
  const response = await apiClient.get("/friends");
  return unwrapApiData(response);
};

export const sendFriendRequestV2 = async ({ receiverId }) => {
  const response = await apiClient.post("/friends/requests", { receiverId });
  return unwrapApiData(response);
};

export const getIncomingFriendRequestsV2 = async () => {
  const response = await apiClient.get("/friends/requests/incoming");
  return unwrapApiData(response);
};

export const getOutgoingFriendRequestsV2 = async () => {
  const response = await apiClient.get("/friends/requests/outgoing");
  return unwrapApiData(response);
};

export const acceptFriendRequestV2 = async ({ requestId }) => {
  const response = await apiClient.post(`/friends/requests/${requestId}/accept`);
  return unwrapApiData(response);
};

export const rejectFriendRequestV2 = async ({ requestId }) => {
  const response = await apiClient.post(`/friends/requests/${requestId}/reject`);
  return unwrapApiData(response);
};

export const unfriendUserV2 = async ({ friendUserId }) => {
  const response = await apiClient.delete(`/friends/${friendUserId}`);
  return unwrapApiData(response);
};

export const blockUserV2 = async ({ blockedUserId, reason = "" }) => {
  const response = await apiClient.post("/users/blocks", {
    blockedUserId,
    reason,
  });
  return unwrapApiData(response);
};

export const getBlockedUsersV2 = async () => {
  const response = await apiClient.get("/users/blocks");
  return unwrapApiData(response);
};

export const unblockUserV2 = async ({ blockedUserId }) => {
  const response = await apiClient.delete(`/users/blocks/${blockedUserId}`);
  return unwrapApiData(response);
};

// Done Friend ships

// Forgot Password
export const sendForgotPasswordOtp = async ({ identifier }) => {
  const response = await apiClient.post("/auth/forgot-password/send-otp", {
    identifier,
  });
  return response;
};
export const verifyForgotPasswordOtp = async ({ identifier, otp }) => {
  const response = await apiClient.post("/auth/forgot-password/verify-otp", {
    identifier,
    otp,
  });
  return response;
};
export const resetPassword = async ({ identifier, resetToken, newPassword, confirmPassword }) => {
  const response = await apiClient.post("/auth/forgot-password/reset", {
    identifier,
    resetToken,
    newPassword,
    confirmPassword,
  });
  return response;
};

export const verifyCurrentPassword = async ({ currentPassword }) => {
  const response = await apiClient.post("/auth/verify-current-password", {
    currentPassword,
  });
  return response;
};

export const changePassword = async ({ changePasswordToken, newPassword }) => {
  const response = await apiClient.post("/auth/change-password", {
    changePasswordToken,
    newPassword,
  });
  return response;
};

export const getAccountSecuritySummary = async () => {
  const response = await apiClient.get("/auth/account-security/summary");
  return response;
};

export const getZaloLock = async () => {
  const response = await apiClient.get("/auth/account-security/zalo-lock");
  return response;
};

export const updateZaloLock = async (payload) => {
  const response = await apiClient.patch("/auth/account-security/zalo-lock", payload);
  return response;
};

export const createZaloLockChallenge = async () => {
  const response = await apiClient.post("/auth/account-security/zalo-lock/challenge", {});
  return response;
};

export const verifyZaloLockPin = async ({ pin }) => {
  const response = await apiClient.post("/auth/account-security/zalo-lock/verify", { pin });
  return response;
};

export const unlockZaloLock = async ({ challengeToken, pin }) => {
  const response = await apiClient.post("/auth/account-security/zalo-lock/unlock", {
    challengeToken,
    pin,
  });
  return response;
};

export const getMyQr = async () => {
  const response = await apiClient.get("/auth/account-security/my-qr");
  return response;
};

export const sendEmailChangeOtp = async ({ newEmail }) => {
  const response = await apiClient.post("/auth/account-security/email/send-otp", { newEmail });
  return response;
};

export const verifyEmailChangeOtp = async ({ newEmail, otp }) => {
  const response = await apiClient.post("/auth/account-security/email/verify-otp", { newEmail, otp });
  return response;
};

export const confirmEmailChange = async ({ newEmail, changeToken }) => {
  const response = await apiClient.post("/auth/account-security/email/confirm", {
    newEmail,
    changeToken,
  });
  return response;
};

export const sendPhoneChangeOtp = async ({ newPhone }) => {
  const response = await apiClient.post("/auth/account-security/phone/send-otp", { newPhone });
  return response;
};

export const verifyPhoneChangeOtp = async ({ newPhone, otp }) => {
  const response = await apiClient.post("/auth/account-security/phone/verify-otp", { newPhone, otp });
  return response;
};

export const confirmPhoneChange = async ({ newPhone, changeToken }) => {
  const response = await apiClient.post("/auth/account-security/phone/confirm", {
    newPhone,
    changeToken,
  });
  return response;
};
// Device Approval / Login - Device Approval System
/**
 * Check current status of device login approval request
 * Gá»i tá»« device má»›i Ä‘á»ƒ poll status
 */
export const createDeviceLoginRequest = async ({
  deviceId,
  platform,
  deviceName,
}) => {
  const response = await apiClient.post("/auth/device-login-request", {
    deviceId,
    platform,
    deviceName,
  });
  return response;
};
export const checkDeviceLoginStatus = async (requestId) => {
  const response = await apiClient.get(`/auth/device-login-status/${requestId}`);
  return response;
};
/**
 * Device cÅ© cáº¥p phÃ©p hoáº·c tá»« chá»‘i yÃªu cáº§u Ä‘Äƒng nháº­p tá»« device má»›i
 * ThÃ´ng qua REST API
 */
export const approveDeviceLogin = async ({ requestId, status }) => {
  const response = await apiClient.post("/auth/device-login-approval", {
    requestId,
    status,
  });
  return response;
};
/**
 * Láº¥y danh sÃ¡ch táº¥t cáº£ devices cá»§a user hiá»‡n táº¡i
 */
export const getUserDevices = async () => {
  const response = await apiClient.get("/auth/devices");
  return response;
};
/**
 * ÄÄƒng xuáº¥t khá»i má»™t device cá»¥ thá»ƒ
 */
export const logoutDevice = async ({ deviceId, platform }) => {
  const response = await apiClient.post("/auth/logout-device", {
    deviceId,
    platform,
  });
  return response;
};
