/**
 * Axios instance with auth interceptors
 *
 * Reusable axios instance for all API calls.
 * Handles 401 redirect to login and adds JWT token.
 */

import axios from 'axios';
import { useAuthStore } from '@/hooks/use-auth';
import { useLoginModalStore } from '@/lib/login-modal-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Add JWT token to requests
apiClient.interceptors.request.use(async (config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * 401 thì đăng xuất. 403 thì KHÔNG.
 *
 * VÌ SAO ĐỔI (12/10/2026): bản cũ đăng xuất khi gặp CẢ 403, và cả khi thông
 * điệp lỗi có chữ "Forbidden". Trước ngày 10/10/2026 thì gần như không ai gặp
 * 403 vì máy chủ chưa phân quyền — chỉ có "đã đăng nhập hay chưa". Từ khi lớp
 * phân quyền chạy, 403 thành chuyện bình thường: nghĩa là "bạn không được làm
 * việc NÀY", không phải "phiên của bạn hỏng".
 *
 * Nối hai thứ đó lại chính là cái đã biến một nút bị chặn thành cả bộ phận bị
 * đẩy ra ngoài: sáng 10/10/2026 CSKH lên đơn hộ khách bị 403, và thay vì hiện
 * một câu báo lỗi, phiên bị xoá luôn — bên khách báo "bạn sales đang lên đơn
 * toàn bị bật ra ngoài trang chủ". Ma trận quyền đã sửa, nhưng cái khuếch đại
 * này thì vẫn còn, và nó sẽ lặp lại với MỌI route nào sau này siết quyền.
 *
 * Người chưa đăng nhập gọi route cần đăng nhập thì JwtAuthGuard trả 401, không
 * phải 403 — nên bảng đăng nhập vẫn hiện đúng lúc cần.
 *
 * 403 giờ chỉ bị từ chối như một lỗi bình thường; chỗ gọi tự hiện thông điệp
 * của máy chủ ("CSKH không có quyền xem giá nhà cung cấp.").
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    console.log('[API Error]', { status, message, url: error.config?.url });

    const phienHong =
      status === 401 ||
      message?.includes('unauthorized') ||
      message?.includes('invalid token');

    if (phienHong && typeof window !== 'undefined') {
      useAuthStore.getState().logout();
      localStorage.removeItem('auth-storage');
      document.cookie = 'accessToken=; path=/; max-age=0';
      useLoginModalStore.getState().openModal();
    }
    return Promise.reject(error);
  },
);

export default apiClient;