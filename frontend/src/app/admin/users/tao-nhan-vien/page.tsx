'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Đường cũ (04/11/2026). Từ 06/11 tạo nhân viên nằm chung màn "Tạo tài khoản
 * mới" với ô chọn Khách hàng / Nhân viên — giữ đường này để link cũ không gãy.
 */
export default function TaoNhanVienCu() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/users/new?loai=nhanVien');
  }, [router]);
  return <div className="p-6 text-sm text-gray-500">Đang chuyển…</div>;
}
