import axios from "../../util/api/axiosConfig";

/**
 * Gửi tin nhắn chat tới AI
 * @param {string} message - Nội dung tin nhắn người dùng
 * @returns {Promise<string>} - Phản hồi từ AI
 */
export const askAi = async (message) => {
    try {
        const response = await axios.post("/ai/chat", { message });
        return response.data;
    } catch (error) {
        console.error("[AiApi] Chat failed:", error);
        throw error;
    }
};

/**
 * Lấy tóm tắt các tin nhắn chưa đọc
 * @param {string} conversationId - ID cuộc hội thoại
 * @param {string} userId - ID người dùng hiện tại
 * @returns {Promise<string>} - Nội dung tóm tắt
 */
export const getChatSummary = async (conversationId, userId) => {
    try {
        const response = await axios.get(`/ai/chat/summary/${conversationId}`, {
            params: { userId }
        });
        return response.data;
    } catch (error) {
        console.error("[AiApi] Summary failed:", error);
        throw error;
    }
};
