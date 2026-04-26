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
import apiClient from "./axiosConfig";

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
export const userRegister = async ({ username, password }) => {
  const response = await apiClient.post("/auth/register", {
    username,
    password,
  });
  return response;
};
export const sendRegisterOtp = async ({ email, phone }) => {
  const response = await apiClient.post("/auth/send-register-otp", {
    email,
    phone,
  });
  return response;
};
export const verifyRegisterOtp = async ({ email, phone, otpCode }) => {
  const response = await apiClient.post("/auth/verify-otp", {
    email,
    phone,
    otpCode,
    type: "REGISTER",
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
    // Mock data nếu backend không sẵn sàng
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
// Device Approval / Login - Device Approval System
/**
 * Check current status of device login approval request
 * Gọi từ device mới để poll status
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
 * Device cũ cấp phép hoặc từ chối yêu cầu đăng nhập từ device mới
 * Thông qua REST API
 */
export const approveDeviceLogin = async ({ requestId, status }) => {
  const response = await apiClient.post("/auth/device-login-approval", {
    requestId,
    status,
  });
  return response;
};
/**
 * Lấy danh sách tất cả devices của user hiện tại
 */
export const getUserDevices = async () => {
  const response = await apiClient.get("/auth/devices");
  return response;
};
/**
 * Đăng xuất khỏi một device cụ thể
 */
export const logoutDevice = async ({ deviceId, platform }) => {
  const response = await apiClient.post("/auth/logout-device", {
    deviceId,
    platform,
  });
  return response;
};
