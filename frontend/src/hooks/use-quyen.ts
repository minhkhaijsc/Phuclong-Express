'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useAuthStore } from '@/hooks/use-auth';

export interface QuyenCuaToi {
  boPhan: string[];
  cap: string[];
  laKhach: boolean;
  /** `muaHang.xem`, `congNo.sua`, `giaNcc`, `congNoNcc`… */
  quyen: string[];
}

/**
 * Quyền của người đang đăng nhập, lấy từ `GET /auth/quyen-cua-toi`.
 *
 * CHỈ ĐỂ ẨN Ô VÀ MENU, không phải để chặn. Chặn thật nằm ở QuyenGuard phía máy
 * chủ: khối nhà cung cấp cũng đã bị xoá khỏi JSON trước khi trả về cho người
 * không có quyền (`cheNcc` trong backend/src/orders/ncc-don-hang.ts), nên sửa
 * localStorage chỉ làm hiện ô rỗng rồi gọi API là 403.
 *
 * `enabled` theo trạng thái đăng nhập để trang công khai không gọi rồi nhận 401.
 */
export function useQuyen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data, isLoading } = useQuery<QuyenCuaToi>({
    queryKey: ['quyen-cua-toi'],
    queryFn: async () => {
      const r = await apiClient.get<QuyenCuaToi>('/auth/quyen-cua-toi');
      return r.data;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * Trong lúc còn đang nạp thì trả `false` — ẩn trước, hiện sau. Mặc định hiện
   * rồi ẩn đi thì giá nhà cung cấp loé lên một nhịp trên màn của người không
   * được xem.
   */
  const co = (ma: string): boolean => data?.quyen?.includes(ma) === true;

  return {
    quyen: data,
    dangNap: isLoading,
    co,
    /** Xem/nhập khối nhà cung cấp và lãi/lỗ trên dòng đơn. */
    xemGiaNcc: co('giaNcc'),
    /** Mở trang công nợ phải trả nhà cung cấp. */
    xemCongNoNcc: co('congNoNcc'),
  };
}
