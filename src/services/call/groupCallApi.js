import chatHttpClient from '../chat/chatHttpClient';

const unwrapResponseData = (response) => response.data?.data ?? response.data;
const BASE_PATH = '/group-calls';

/**
 * Khởi tạo cuộc gọi nhóm từ ô chat nhóm
 * @param {string} conversationId - UUID cuộc hội thoại nhóm
 * @param {'VIDEO'|'VOICE'} type
 * @returns {{ groupCallId, conversationId, channel, sfuUrl, status, type }}
 */
export const initiateGroupCallApi = async (conversationId, type) => {
  const response = await chatHttpClient.post(`${BASE_PATH}/initiate`, { conversationId, type });
  return unwrapResponseData(response);
};

/**
 * Tham gia cuộc gọi nhóm (bao gồm Late-join từ tin nhắn chat)
 * @param {string} groupCallId
 */
export const joinGroupCallApi = async (groupCallId) => {
  const response = await chatHttpClient.post(`${BASE_PATH}/${groupCallId}/join`);
  return unwrapResponseData(response);
};

/**
 * Rời khỏi cuộc gọi nhóm
 * @param {string} groupCallId
 */
export const leaveGroupCallApi = async (groupCallId) => {
  await chatHttpClient.post(`${BASE_PATH}/${groupCallId}/leave`);
};

/**
 * Kiểm tra trạng thái cuộc gọi (Late-join check)
 * Nếu ENDED → Ẩn nút JOIN trong tin nhắn
 * @param {string} groupCallId
 */
export const getGroupCallStatusApi = async (groupCallId) => {
  const response = await chatHttpClient.get(`${BASE_PATH}/${groupCallId}/status`);
  return unwrapResponseData(response);
};
