import PublicLayout from '@/app/components/public-home/public-layout';

/**
 * Màn /tong-quan dùng khung của khách (PublicLayout) chứ không phải khung admin.
 *
 * Khác mấy màn khách khác trong hệ (bao-cao-cong-no, chuyen-khoan…) ở chỗ nhận
 * `children` thay vì tự dựng lại trang bên trong: cách kia khiến trang bị render
 * hai lần khi Next dựng cả layout và page.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicLayout>{children}</PublicLayout>;
}
