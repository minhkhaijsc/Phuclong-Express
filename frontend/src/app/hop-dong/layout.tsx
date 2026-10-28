import PublicLayout from '@/app/components/public-home/public-layout';

/** Hợp đồng của khách: xem + ký qua link, và danh sách "Hợp đồng của tôi". */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicLayout>{children}</PublicLayout>;
}
