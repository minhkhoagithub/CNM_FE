import chatHttpClient from '../chat/chatHttpClient';

const unwrapResponseData = (response) => response.data?.data ?? response.data;

/**
 * Khởi tạo cuộc gọi – A gọi cho B
 * Sử dụng chatHttpClient – đã tích hợp sẵn withCredentials + x-user-id header
 * @param {string} calleeId - UUID người nhận
 * @param {'VOICE'|'VIDEO'} type
 * @returns {{ callId, channel, sfuUrl }}
 */
export const initiateCallApi = async (calleeId, type) => {
  const response = await chatHttpClient.post('/calls', { calleeId, type });
  return unwrapResponseData(response);
};

/**
 * Chấp nhận cuộc gọi
 * @param {string} callId
 * @returns {{ callId, channel, sfuUrl }}
 */
export const acceptCallApi = async (callId) => {
  const response = await chatHttpClient.post(`/calls/${callId}/accept`);
  return unwrapResponseData(response);
};

/**
 * Từ chối cuộc gọi
 * @param {string} callId
 */
export const rejectCallApi = async (callId) => {
  await chatHttpClient.post(`/calls/${callId}/reject`);
};

/**
 * Kết thúc cuộc gọi
 * @param {string} callId
 */
export const endCallApi = async (callId) => {
  await chatHttpClient.post(`/calls/${callId}/end`);
};

/**
 * Gửi hành động trong cuộc gọi (Tắt/Bật camera...)
 * @param {string} callId 
 * @param {string} action - VIDEO_OFF, VIDEO_ON, ...
 */
export const sendCallActionApi = async (callId, action) => {
  await chatHttpClient.post(`/calls/${callId}/action`, { action });
};

/**
 * Lịch sử cuộc gọi của user hiện tại
 */
export const getCallHistoryApi = async () => {
  const response = await chatHttpClient.get('/calls/history');
  return unwrapResponseData(response);
};
