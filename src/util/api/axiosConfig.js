import axios from 'axios';

// Tạo một instance riêng để không ảnh hưởng đến cấu hình axios mặc định
const apiClient = axios.create({
    baseURL: import.meta.env.VITE_BASE_API_URL || 'http://localhost:8080/api/v1',
    withCredentials: true, // BẮT BUỘC: Để gửi và nhận Cookie HttpOnly (accessToken/refreshToken)
});

// Biến để kiểm soát trạng thái refresh
let isRefreshing = false;
let failedQueue = [];

// Hàm để xử lý các request bị kẹt trong lúc chờ refresh token
const processQueue = (error, token = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Response Interceptor: Xử lý lỗi 401
apiClient.interceptors.response.use(
    (response) => {
        // Nếu response thành công, trả về dữ liệu bình thường
        return response;
    },
    async (error) => {
        const originalRequest = error.config;

        // Nếu lỗi 401 (Hết hạn Access Token) và request này chưa từng được thử lại
        if (error.response?.status === 401 && !originalRequest._retry) {
            
            // Kiểm tra xem có phải business error (ví dụ: Incorrect password, Invalid credentials)
            // thay vì authorization error (token expired)
            const isBusinessError = error.response?.data?.code === 'UNAUTHORIZED' && 
                                   !originalRequest.url?.includes('/refresh-token');
            
            // Nếu là business error (login/register error), không cố refresh, throw ngay
            if (isBusinessError) {
                console.warn("Business Error - Không cố refresh token");
                return Promise.reject(error);
            }
            
            // Nếu đang trong quá trình refresh rồi, thì cho request này vào hàng đợi
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then(() => {
                        return apiClient(originalRequest);
                    })
                    .catch((err) => {
                        return Promise.reject(err);
                    });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            return new Promise((resolve, reject) => {
                // Gọi API refresh-token của Tài
                // Lưu ý: Endpoint này cũng phải nằm trong controller không yêu cầu Auth
                apiClient.post('/auth/refresh-token')
                    .then(() => {
                        // Refresh thành công: Xử lý hàng đợi và thực hiện lại request gốc
                        processQueue(null);
                        resolve(apiClient(originalRequest));
                    })
                    .catch((err) => {
                        // Refresh thất bại (Refresh Token hết hạn 30 ngày)
                        processQueue(err, null);
                        
                        // Xóa trạng thái đăng nhập ở Frontend (ví dụ: chuyển về trang login)
                        console.error("Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.");
                        window.location.href = '/login'; 
                        
                        reject(err);
                    })
                    .finally(() => {
                        isRefreshing = false;
                    });
            });
        }

        // Nếu là các lỗi khác (403, 404, 500...), ném lỗi ra ngoài
        return Promise.reject(error);
    }
);

export default apiClient;