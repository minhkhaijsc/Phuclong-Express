'use client';

import Link from 'next/link';
import { FiArrowRight, FiBox, FiClipboard, FiCreditCard, FiFileText, FiHome, FiTruck, FiUsers } from 'react-icons/fi';
import { KPICard } from '@/app/components/admin';
import { useAuth } from '@/hooks/use-auth-context';
import { useQuyen } from '@/hooks/use-quyen';

const quickLinks = [
  {
    href: '/admin/order-management-list',
    title: 'Nhận đơn hàng',
    description: 'Vào danh sách đơn cần tiếp nhận và xử lý nhanh.',
    icon: FiClipboard,
  },
  {
    href: '/admin/orders/list',
    title: 'Mua hàng',
    description: 'Theo dõi và cập nhật đơn mua hàng giúp.',
    icon: FiBox,
  },
  {
    href: '/admin/tracking',
    title: 'Quản lý tracking',
    description: 'Kiểm tra tracking, trạng thái và lịch trình vận chuyển.',
    icon: FiTruck,
  },
  {
    href: '/admin/debt-reports',
    title: 'Báo cáo công nợ',
    description: 'Xem nhanh báo cáo công nợ và đối soát tài chính.',
    icon: FiCreditCard,
  },
];

/**
 * `canQuyen` = mã quyền cần có để hiện link này.
 *
 * CHỈ ĐỂ BỚT BẤM vào chỗ không có quyền, không phải để chặn: gõ thẳng đường dẫn
 * vào thanh địa chỉ thì trang vẫn mở nhưng tự hiện "Không có quyền", và API
 * phía sau trả 403. Link nào không ghi `canQuyen` thì ai cũng thấy, y như trước.
 */
interface LienKet {
  href: string;
  label: string;
  canQuyen?: string;
}

const sections: { title: string; icon: typeof FiClipboard; links: LienKet[] }[] = [
  {
    title: 'Mua hàng giúp',
    icon: FiClipboard,
    links: [
      { href: '/admin/order-management-list', label: 'Nhận đơn hàng' },
      { href: '/admin/orders/list', label: 'Danh sách mua hàng' },
      { href: '/admin/orders/deleted', label: 'Đơn hàng đã xóa' },
      { href: '/admin/orders/new', label: 'Tạo đơn mới' },
      // Mua hàng, Kế toán, Giám đốc, Admin.
      { href: '/admin/suppliers', label: 'Nhà cung cấp', canQuyen: 'giaNcc' },
    ],
  },
  {
    title: 'Vận chuyển',
    icon: FiTruck,
    links: [
      { href: '/admin/tracking', label: 'Quản lý tracking' },
      { href: '/admin/batches', label: 'Quản lý lô hàng' },
      { href: '/admin/debt-reports/by-lot', label: 'Công nợ theo lô' },
      { href: '/admin/debt-reports/profit-loss-by-lot', label: 'Lãi lỗ theo lô' },
    ],
  },
  {
    title: 'Finance',
    icon: FiCreditCard,
    links: [
      { href: '/admin/debt-management', label: 'Quản lý công nợ' },
      { href: '/admin/customer-limits', label: 'Hạn mức khách hàng' },
      { href: '/admin/debt-reports', label: 'Chi tiết công nợ' },
      { href: '/admin/debt-reports/total-revenue', label: 'Tổng doanh thu' },
      // Kế toán, Giám đốc, Admin. Xem ghi chú `canQuyen` dưới.
      {
        href: '/admin/debt-reports/supplier',
        label: 'Công nợ phải trả NCC',
        canQuyen: 'congNoNcc',
      },
    ],
  },
  {
    title: 'Thông tin',
    icon: FiFileText,
    links: [
      { href: '/admin/info', label: 'Thông tin hệ thống' },
      { href: '/admin/qna', label: 'Thắc mắc' },
      { href: '/admin/websites', label: 'Trang web hay' },
      { href: '/', label: 'Về trang chủ public' },
    ],
  },
  {
    title: 'Tài khoản',
    icon: FiUsers,
    links: [
      { href: '/admin/users', label: 'Danh sách user' },
      { href: '/admin/users/new', label: 'Tạo user mới' },
      { href: '/admin/roles', label: 'Quản lý role' },
      { href: '/admin/clear-user-data', label: 'Xóa dữ liệu theo user' },
    ],
  },
];

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  const { user } = useAuth();
  const { co } = useQuyen();
  const firstRole = user?.roles?.[0] || 'Nhân sự';

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-[#14264b]/20 bg-gradient-to-br from-[#eb7325] via-[#c95d1a] to-[#14264b] text-white shadow-xl">
        <div className="grid gap-6 px-6 py-8 lg:grid-cols-[1.6fr_0.9fr] lg:px-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
              <FiHome className="h-3.5 w-3.5" />
              Admin Home
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
                Xin chào {user?.username || 'Admin'}
              </h1>
              <p className="max-w-2xl text-sm text-white/85 lg:text-base">
                Đây là trang chủ quản trị để vào nhanh các màn vận hành chính của Phuc Long Express.
                Ưu tiên thao tác theo đúng luồng: nhận đơn, mua hàng, tracking, công nợ.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/order-management-list"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#14264b] transition hover:bg-white/90"
              >
                Vào nhận đơn
                <FiArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/admin/debt-reports"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Xem báo cáo
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-sm sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">Tài khoản hiện tại</p>
              <p className="mt-2 text-lg font-semibold">{user?.email || 'Chưa có email'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">Vai trò chính</p>
              <p className="mt-2 text-lg font-semibold">{firstRole}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="Luồng ưu tiên"
          value="Nhận đơn"
          icon={<FiClipboard className="h-6 w-6" />}
        />
        <KPICard
          label="Màn vận chuyển"
          value="Tracking"
          icon={<FiTruck className="h-6 w-6" />}
        />
        <KPICard
          label="Khối tài chính"
          value="Công nợ"
          icon={<FiCreditCard className="h-6 w-6" />}
        />
        <KPICard
          label="Quản trị người dùng"
          value="Users"
          icon={<FiUsers className="h-6 w-6" />}
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Lối tắt thao tác</h2>
            <p className="text-sm text-slate-500">Các màn dùng nhiều nhất trong vận hành hằng ngày.</p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-[#eb7325]/40 hover:bg-[#eb7325]/5"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-white p-3 text-[#14264b] shadow-sm ring-1 ring-slate-200 transition group-hover:bg-[#eb7325] group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                      <FiArrowRight className="h-4 w-4 text-slate-400 transition group-hover:text-[#eb7325]" />
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-[#14264b]/10 p-3 text-[#14264b]">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
              </div>
              <div className="grid gap-3">
                {section.links
                  .filter((link) => !link.canQuyen || co(link.canQuyen))
                  .map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-[#eb7325]/40 hover:bg-[#eb7325]/5 hover:text-[#14264b]"
                  >
                    <span>{link.label}</span>
                    <FiArrowRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
