'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth-context';
import {
  FiShoppingCart,
  FiDollarSign,
  FiLogOut,
  FiSearch,
  FiMenu,
  FiX,
  FiInfo,
  FiTruck,
  FiUsers,
  FiSettings,
  FiChevronRight,
  FiGrid,
} from 'react-icons/fi';
import { NotificationBell } from '@/app/components/notifications/notification-bell';
import { useQnaBadgeCount } from '@/hooks/use-qna-badge-count';
import { useQuyen } from '@/hooks/use-quyen';
import { locMenu } from '@/lib/menu-quyen';

type NavSubItem = {
  href: string;
  label: string;
  type?: 'divider';
  /**
   * Mã quyền cần có để hiện mục này. Bỏ trống thì ai cũng thấy, y như trước.
   *
   * CHỈ ĐỂ BỚT BẤM. Chặn thật ở QuyenGuard phía máy chủ; ba trang NCC còn tự
   * hiện "Không có quyền" khi vào bằng cách gõ đường dẫn.
   */
  canQuyen?: string;
};

type NavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  submenu: NavSubItem[];
};

/**
 * Admin Layout Component
 *
 * Provides the main layout for admin pages with sidebar navigation and header.
 * Uses localStorage-based authentication (no NextAuth).
 * Color theme: #14264b (primary cyan)
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem('admin-sidebar-collapsed') === 'true');
  }, []);

  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { co } = useQuyen();
  /**
   * Chuông Thắc mắc chỉ đếm khi CÓ quyền. Trước đây hỏi vô điều kiện, nên mọi
   * trang admin của Kho đều ném `GET /qna 403` ra console mỗi 60 giây.
   */
  const qnaBadgeCount = useQnaBadgeCount(co('noiDung.xem'));
  const hasAdminAccess = isAuthenticated && (user?.roles?.length ?? 0) > 0;

  // Chỉ user đã đăng nhập và có ít nhất 1 role mới được vào khu vực admin.
  useEffect(() => {
    if (!authLoading && !hasAdminAccess) {
      router.replace('/');
    }
  }, [authLoading, hasAdminAccess, router]);

  // Navigation items with submenus
  const navItems: NavItem[] = [
    {
      label: 'TỔNG QUAN',
      icon: FiGrid,
      submenu: [
        { href: '/admin/dashboard', label: 'Dashboard thống kê', canQuyen: 'dashboard.xem' },
        { href: '/admin/dashboard/san-luong-khach', label: 'Sản lượng khách hàng', canQuyen: 'dashboard.xem' },
      ],
    },
    {
      label: 'MUA HÀNG GIÚP',
      icon: FiShoppingCart,
      submenu: [
        { href: '/admin/orders/list', label: 'Mua hàng', canQuyen: 'muaHang.xem' },
        { href: '/admin/order-management-list', label: 'Nhận đơn hàng', canQuyen: 'muaHang.xem' },
        { href: '/admin/orders/deleted', label: 'Các đơn hàng đã xóa', canQuyen: 'muaHang.xem' },
        { href: '/admin/suppliers', label: 'Nhà cung cấp', canQuyen: 'giaNcc' },
      ],
    },
    {
      label: 'VẬN CHUYỂN',
      icon: FiTruck,
      submenu: [
        { href: '/admin/tracking', label: 'Quản lý tracking', canQuyen: 'vanChuyen.xem' },
        { href: '/admin/tracking/anh', label: 'Up ảnh tracking', canQuyen: 'vanChuyen.xem' },
        { href: '/admin/batches', label: 'Quản lý lô hàng', canQuyen: 'vanChuyen.xem' },
        { href: '/admin/debt-reports/profit-loss-by-lot', label: 'BC phân tích lãi lỗ theo lô hàng', canQuyen: 'baoCao.xem' },
        { href: '/admin/debt-reports/by-lot', label: 'BC công nợ khách hàng theo lô', canQuyen: 'baoCao.xem' },
      ],
    },
    {
      label: 'FINANCE',
      icon: FiDollarSign,
      submenu: [
        { href: '/admin/debt-management', label: 'QL công nợ', canQuyen: 'congNo.xem' },
        { href: '/admin/customer-limits', label: 'Hạn mức khách hàng', canQuyen: 'congNo.xem' },
        { href: '', label: 'Báo cáo', type: 'divider' },
        { href: '/admin/debt-reports', label: 'Chi tiết công nợ', canQuyen: 'baoCao.xem' },
        { href: '/admin/debt-reports/by-period', label: 'Chi tiết công nợ theo kỳ', canQuyen: 'baoCao.xem' },
        { href: '/admin/debt-reports/total-revenue', label: 'Tổng doanh thu', canQuyen: 'baoCao.xem' },
        { href: '/admin/debt-reports/debt-by-user', label: 'Tổng công nợ theo user', canQuyen: 'baoCao.xem' },
        { href: '/admin/debt-reports/aging', label: 'Tuổi nợ', canQuyen: 'dashboard.xem' },
        { href: '/admin/debt-reports/reconciliation', label: 'Kiểm tra đơn hàng mua', canQuyen: 'baoCao.xem' },
        { href: '/admin/debt-reports/customer', label: 'Công nợ khách hàng', canQuyen: 'baoCao.xem' },
        { href: '/admin/debt-reports/by-shipment-lot', label: 'Công nợ theo đợt hàng', canQuyen: 'baoCao.xem' },
        {
          href: '/admin/debt-reports/supplier',
          label: 'Công nợ phải trả NCC',
          canQuyen: 'congNoNcc',
        },
      ],
    },
    {
      label: 'TÀI KHOẢN',
      icon: FiUsers,
      submenu: [
        { href: '/admin/roles', label: 'Role', canQuyen: 'taiKhoan.xem' },
        { href: '/admin/users', label: 'User', canQuyen: 'xemDanhSachKhach' },
        { href: '/admin/khach-ngung-giao-dich', label: 'Khách ngừng giao dịch', canQuyen: 'taiKhoan.xem' },
        { href: '/admin/hop-dong', label: 'Hợp đồng khách', canQuyen: 'hopDong' },
        { href: '/admin/clear-user-data', label: 'Xóa dữ liệu theo user', canQuyen: 'quanLyRole' },
      ],
    },
    {
      label: 'DANH MỤC & CẤU HÌNH',
      icon: FiSettings,
      submenu: [
        { href: '/admin/periods', label: 'Danh mục kỳ', canQuyen: 'danhMuc.xem' },
        { href: '/admin/exchange-rates', label: 'Tỷ giá', canQuyen: 'xemTyGia' },
        { href: '/admin/websites', label: 'Danh sách website', canQuyen: 'danhMuc.xem' },
        { href: '/admin/bank-accounts', label: 'Tài khoản ngân hàng', canQuyen: 'danhMuc.xem' },
        { href: '/admin/service-fees', label: 'Công mua hàng', canQuyen: 'danhMuc.xem' },
        { href: '/admin/delivery-addresses', label: 'Địa chỉ nhận hàng', canQuyen: 'diaChi.xem' },
        { href: '/admin/system-logs', label: 'Báo cáo hoạt động hệ thống', canQuyen: 'nhatKy.xem' },
      ],
    },
    {
      label: 'THÔNG TIN',
      icon: FiInfo,
      submenu: [
        { href: '/', label: 'Trang chủ' },
        { href: '/admin/info', label: 'Thông tin', canQuyen: 'danhMuc.xem' },
        { href: '/admin/qna', label: 'Thắc mắc', canQuyen: 'noiDung.xem' },
        { href: '/admin/articles', label: 'Bài viết', canQuyen: 'noiDung.xem' },
        { href: '/admin/websites', label: 'Cập nhật các trang web hay', canQuyen: 'danhMuc.xem' },
      ],
    },
  ];

  /**
   * Menu THẬT SỰ hiện ra. Bỏ mục không đủ quyền, bỏ dòng phân cách mồ côi, bỏ
   * cả nhóm rỗng — xem `lib/menu-quyen.ts`.
   *
   * Dùng cho cả phần dò trang đang mở lẫn hai chỗ vẽ menu, để không nơi nào
   * còn đọc `navItems` thô rồi hiện lại mục vừa giấu.
   */
  const menu = locMenu(navItems, co);

  // Track which submenu is open
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  const activeLabel = (() => {
    let longestMatch = '';
    let matchedLabel = '';

    for (const item of menu) {
      for (const sub of item.submenu) {
        if (
          sub.href &&
          sub.href !== '/' &&
          (pathname === sub.href || pathname.startsWith(`${sub.href}/`)) &&
          sub.href.length > longestMatch.length
        ) {
          longestMatch = sub.href;
          matchedLabel = item.label;
        }
      }
    }

    return matchedLabel;
  })();

  const visibleOpenSubmenu = openSubmenu ?? activeLabel;

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const toggleSubmenu = (label: string) => {
    setOpenSubmenu((currentLabel) => ((currentLabel ?? activeLabel) === label ? '' : label));
  };

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prevState) => {
      const nextState = !prevState;
      window.localStorage.setItem('admin-sidebar-collapsed', String(nextState));
      return nextState;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 h-full transform border-r border-white/10 bg-[radial-gradient(circle_at_top_left,#24477f_0%,#14264b_36%,#081224_100%)] shadow-2xl shadow-slate-950/30 transition-all duration-300 ease-out lg:translate-x-0 ${
          sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'
        } ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarCollapsed ? 'lg:overflow-visible' : 'overflow-hidden'}`}
      >
        {/* Close button for mobile */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white lg:hidden"
        >
          <FiX className="h-5 w-5" />
        </button>

        {/* Logo */}
        <div className="relative flex h-20 items-center border-b border-white/10 bg-black/20 px-3">
          <Link
            href="/admin"
            className={`flex w-full items-center rounded-lg transition-colors hover:bg-white/5 ${
              sidebarCollapsed ? 'justify-center p-2' : 'gap-3 px-2 py-2'
            }`}
            onClick={() => setSidebarOpen(false)}
          >
            <Image
              src={sidebarCollapsed ? '/image1/LOGO_ONLY_PHUC_LONG_EXPRESS_WHITE.png' : '/image1/LOGO_PHUC_LONG_EXPRESS_FULL_WHITE.png'}
              alt="Phuc Long Express"
              width={160}
              height={48}
              className={`${sidebarCollapsed ? 'h-10 w-10' : 'h-11 w-auto'} object-contain transition-all duration-300`}
            />
            {!sidebarCollapsed && (
              <div className="min-w-0 border-l border-white/15 pl-3">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                  Admin
                </p>
                <p className="truncate text-sm font-bold text-white">Control Center</p>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav
          className={`mt-4 max-h-[calc(100vh-9rem)] space-y-1.5 px-3 pb-4 ${
            sidebarCollapsed ? 'overflow-visible' : 'overflow-y-auto [scrollbar-width:thin]'
          }`}
        >
          {menu.map((item) => {
            const isActive = item.label === activeLabel;
            const isOpen = visibleOpenSubmenu === item.label;
            const IconComponent = item.icon;
            return (
              <div key={item.label} className="relative group/item">
                <button
                  onClick={() => toggleSubmenu(item.label)}
                  className={`group flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? 'border border-[#eb7325]/35 bg-[#eb7325]/15 text-white shadow-lg shadow-[#eb7325]/10 ring-1 ring-white/10'
                      : 'border border-transparent text-white/70 hover:border-white/10 hover:bg-white/10 hover:text-white'
                  } ${sidebarCollapsed ? 'justify-center lg:px-2' : ''}`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span
                    className={`relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                      isActive ? 'bg-[#eb7325] text-white' : 'bg-white/10 text-white/75 group-hover:bg-white/15 group-hover:text-white'
                    } ${sidebarCollapsed ? '' : 'mr-3'}`}
                  >
                    <IconComponent className="h-4 w-4" />
                    {item.label === 'THÔNG TIN' && qnaBadgeCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-1 ring-[#14264b]" />
                    )}
                  </span>
                  {!sidebarCollapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
                  {item.submenu && !sidebarCollapsed && (
                    <span className={`transform text-white/45 transition-transform duration-200 ${isOpen ? 'rotate-90 text-white' : ''}`}>
                      <FiChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </button>
                {/* Submenu */}
                {item.submenu && isOpen && !sidebarCollapsed && (
                  <div className="ml-4 mt-2 space-y-1 border-l border-white/10 pl-3">
                    {item.submenu.map((subItem, idx) =>
                      subItem.type === 'divider' || !subItem.href ? (
                        <div key={idx} className="flex items-center gap-2 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">
                          <span className="h-px flex-1 bg-white/10" />
                          {subItem.label}
                          <span className="h-px flex-1 bg-white/10" />
                        </div>
                      ) : (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          title={subItem.label}
                          className={`group/link flex items-center rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
                            pathname === subItem.href
                              ? 'bg-white text-[#14264b] font-semibold shadow-md shadow-black/10'
                              : 'text-white/58 hover:bg-white/10 hover:text-white'
                          }`}
                          onClick={() => setSidebarOpen(false)}
                        >
                          <span className={`mr-2 h-1.5 w-1.5 rounded-full bg-current ${pathname === subItem.href ? 'opacity-100' : 'opacity-45 group-hover/link:opacity-100'}`} />
                          <span className="flex-1 truncate">{subItem.label}</span>
                          {subItem.href === '/admin/qna' && qnaBadgeCount > 0 && (
                            <span className="ml-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                              {qnaBadgeCount > 99 ? '99+' : qnaBadgeCount}
                            </span>
                          )}
                        </Link>
                      )
                    )}
                  </div>
                )}
                {item.submenu && sidebarCollapsed && (
                  <div className="pointer-events-none absolute left-full top-0 z-20 hidden w-[20rem] -translate-x-1 pr-3 opacity-0 transition-all duration-200 group-hover/item:pointer-events-auto group-hover/item:translate-x-0 group-hover/item:opacity-100 lg:block">
                    <div className="ml-3 rounded-lg border border-white/10 bg-[#0b1630]/95 p-3 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
                      <div className="mb-2 rounded-md bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.24em] text-[#eb7325]">
                        {item.label}
                      </div>
                      <div className="space-y-1">
                        {item.submenu.map((subItem, idx) =>
                          subItem.type === 'divider' || !subItem.href ? (
                            <div key={idx} className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">
                              {subItem.label}
                            </div>
                          ) : (
                            <Link
                              key={subItem.href}
                              href={subItem.href}
                              className={`flex items-center rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
                                pathname === subItem.href
                                  ? 'bg-white text-[#14264b] font-semibold'
                                  : 'text-white/65 hover:bg-white/10 hover:text-white'
                              }`}
                              onClick={() => setSidebarOpen(false)}
                            >
                              <span className="mr-2 h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                              <span className="flex-1">{subItem.label}</span>
                              {subItem.href === '/admin/qna' && qnaBadgeCount > 0 && (
                                <span className="ml-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                  {qnaBadgeCount > 99 ? '99+' : qnaBadgeCount}
                                </span>
                              )}
                            </Link>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-black/20 p-3">
          <div className={`flex items-center text-xs text-slate-400 ${sidebarCollapsed ? 'justify-center' : 'gap-2'}`}>
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            {!sidebarCollapsed && <span>Hệ thống hoạt động</span>}
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 lg:px-6 shadow-sm">
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <button
              className="rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#14264b] lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <FiMenu className="h-6 w-6" />
            </button>
            <button
              className="hidden rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#14264b] lg:inline-flex"
              onClick={toggleSidebarCollapsed}
              title={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            >
              <FiMenu className="h-5 w-5" />
            </button>
          </div>

          {/* Search bar */}
          <div className="hidden flex-1 md:block md:max-w-lg">
            <div className="relative group">
              <input
                type="text"
                placeholder="Tìm kiếm đơn hàng, khách hàng..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pl-10 text-sm focus:border-[#14264b] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#14264b]/20 transition-all placeholder:text-slate-400"
              />
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#14264b] transition-colors" />
            </div>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <NotificationBell />

            {/* Divider */}
            <div className="h-6 w-px bg-slate-200 mx-1" />

            {/* User menu */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#eb7325] to-[#14264b] text-white font-bold shadow-lg shadow-[#eb7325]/30">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium text-slate-700">
                  {user?.username || 'User'}
                </p>
                <p className="text-xs text-slate-500 truncate max-w-[120px]">
                  {user?.email || ''}
                </p>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="rounded-xl p-2.5 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
              title="Đăng xuất"
            >
              <FiLogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
