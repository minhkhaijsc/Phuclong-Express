'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

type SubItem = { label: string; href: string };
type NavItem = { label: string; href: string; dropdown?: never } | { label: string; href?: never; dropdown: SubItem[] };
import { FiChevronDown, FiMenu, FiX, FiUser, FiLogOut, FiPhone, FiMail, FiMapPin } from 'react-icons/fi';
import { FaFacebook } from 'react-icons/fa';
import { SiZalo, SiViber } from 'react-icons/si';
import { useAuth } from '@/hooks/use-auth-context';
import { useNotifications } from '@/hooks/use-notifications';
import LoginModal from './login-modal';

/**
 * Public Layout Component
 *
 * Provides header and footer for public pages (home page).
 * Modern glass navbar design with #14264b primary color.
 */
/** Animated pulsing red dot for unread notifications */
function NotifBadge({ count: _ }: { count: number }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
    </span>
  );
}

const colors = {
  primary: '#14264b',
  primaryHover: '#1f3a6d',
  primaryLight: 'rgba(235,115,37,0.08)',
  accent: '#eb7325',
  accentHover: '#d65f15',
  text: '#111827',
  textMuted: '#6b7280',
  bg: '#f8fafc',
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const { unreadCount } = useNotifications('debt', isAuthenticated);
  const { unreadCount: infoUnreadCount } = useNotifications('info', isAuthenticated);
  const { unreadCount: orderUnreadCount } = useNotifications('order', isAuthenticated);

  const publicNavItems: NavItem[] = [
    { label: 'TRANG CHỦ', href: '/' },
    { label: 'DỊCH VỤ', href: '/#services' },
    { label: 'CÁCH HOẠT ĐỘNG', href: '/#how-it-works' },
    { label: 'VỀ CHÚNG TÔI', href: '/#about' },
    { label: 'TỶ GIÁ', href: '/ty-gia' },
    { label: 'TIN TỨC', href: '/tin-tuc' },
  ];

  const authNavItems: NavItem[] = [
    { label: 'TRANG CHỦ', href: '/' },
    {
      label: 'ĐẶT HÀNG',
      dropdown: [
        { label: 'ĐẶT HÀNG', href: '/dat-hang' },
        { label: 'THÔNG TIN ĐẶT HÀNG', href: '/danh-sach-don-hang' },
      ],
    },
    {
      label: 'TRACKING',
      dropdown: [
        { label: 'QUẢN LÝ TRACKING', href: '/danh-sach-tracking' },
        { label: 'THÊM TRACKING', href: '/sua-tracking' },
      ],
    },
    { label: 'LÔ HÀNG', href: '/thong-tin-lo-hang' },
    { label: 'TỶ GIÁ', href: '/ty-gia' },
    {
      label: 'CÔNG NỢ',
      dropdown: [
        { label: 'BÁO CHUYỂN KHOẢN', href: '/chuyen-khoan' },
        { label: 'BẢNG CÂN ĐỐI CÔNG NỢ', href: '/bao-cao-cong-no' },
      ],
    },
    { label: 'TIN TỨC', href: '/tin-tuc' },
    { label: 'HỎI ĐÁP', href: '/hoi-dap' },
  ];

  const navItems = isAuthenticated ? authNavItems : publicNavItems;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: colors.bg }}>
      {/* Header - Glass Navbar */}
      <header
        className="fixed top-4 left-4 right-4 z-50 rounded-2xl backdrop-blur-md shadow-lg overflow-visible"
        style={{ backgroundColor: 'rgba(255,255,255,0.85)', border: `1px solid ${colors.primaryLight}` }}
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 cursor-pointer group">
              <Image src="/image1/LOGO_PHUC_LONG_EXPRESS_FULL.png" alt="Phuc Long Express" width={180} height={128} className="h-32 w-auto object-contain transition-transform group-hover:scale-105" priority />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center">
              <ul className="flex items-center gap-1">
                {navItems.map((item) => (
                  <li key={item.label} className="relative">
                    {item.dropdown ? (
                      <div
                        className="relative h-full flex items-center"
                        onMouseEnter={() => setDropdownOpen(item.label)}
                        onMouseLeave={() => setDropdownOpen(null)}
                      >
                        <button
                          type="button"
                          className="flex items-center gap-1 px-4 py-2 text-sm font-bold transition-colors cursor-pointer rounded-lg hover:bg-gray-50 h-full"
                          style={{ color: colors.text }}
                          onClick={() => setDropdownOpen(dropdownOpen === item.label ? null : item.label)}
                        >
                          {item.label}
                          {item.label === 'CÔNG NỢ' && isAuthenticated && unreadCount > 0 && (
                            <NotifBadge count={unreadCount} />
                          )}
                          {item.label === 'ĐẶT HÀNG' && isAuthenticated && orderUnreadCount > 0 && (
                            <NotifBadge count={orderUnreadCount} />
                          )}
                          <FiChevronDown className={`w-3 h-3 transition-transform ${dropdownOpen === item.label ? 'rotate-180' : ''}`} />
                        </button>
                        {dropdownOpen === item.label && (
                          <ul
                            className="absolute left-0 top-full shadow-xl rounded-xl min-w-[200px] py-2 z-[9999]"
                            style={{ backgroundColor: 'white', border: `1px solid ${colors.primaryLight}` }}
                          >
                            {item.dropdown.map((sub: SubItem) => {
                              const showDebtBadge = sub.href === '/bao-cao-cong-no' && isAuthenticated && unreadCount > 0;
                              const showOrderBadge = sub.href === '/danh-sach-don-hang' && isAuthenticated && orderUnreadCount > 0;
                              return (
                                <li key={sub.label}>
                                  <Link
                                    href={sub.href}
                                    className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
                                    style={{ color: colors.textMuted }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = colors.primaryLight;
                                      e.currentTarget.style.color = colors.accent;
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = 'transparent';
                                      e.currentTarget.style.color = colors.textMuted;
                                    }}
                                  >
                                    {sub.label}
                                    {showDebtBadge && <NotifBadge count={unreadCount} />}
                                    {showOrderBadge && <NotifBadge count={orderUnreadCount} />}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <Link
                        href={item.href}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold transition-colors cursor-pointer rounded-lg hover:bg-gray-50"
                        style={{ color: colors.text }}
                      >
                        {item.label}
                        {item.label === 'HỎI ĐÁP' && isAuthenticated && infoUnreadCount > 0 && (
                          <NotifBadge count={infoUnreadCount} />
                        )}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>

            {/* User Info or Admin Link */}
            {isAuthenticated && user ? (
              <div className="relative hidden lg:block">
                <button
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl transition-all cursor-pointer hover:shadow-lg hover:shadow-[#eb7325]/30"
                  style={{ backgroundColor: colors.primary }}
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                >
                  <FiUser className="w-4 h-4" />
                  <span>{user.username}</span>
                  <FiChevronDown className={`w-3 h-3 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {userMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 shadow-xl rounded-xl min-w-[180px] py-2 z-[9999]"
                    style={{ backgroundColor: 'white', border: `1px solid ${colors.primaryLight}` }}
                  >
                    <div className="px-4 py-2 border-b" style={{ borderColor: colors.primaryLight }}>
                      <p className="text-sm font-medium" style={{ color: colors.text }}>
                        {user.username}
                      </p>
                      <p className="text-xs" style={{ color: colors.textMuted }}>
                        {user.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors cursor-pointer hover:bg-gray-50"
                      style={{ color: colors.textMuted }}
                      onClick={() => {
                        logout();
                        setUserMenuOpen(false);
                      }}
                    >
                      <FiLogOut className="w-4 h-4" />
                      Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLoginModalOpen(true)}
                className="hidden lg:flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl transition-all cursor-pointer hover:shadow-lg hover:shadow-[#eb7325]/30 hover:-translate-y-0.5"
                style={{ backgroundColor: colors.primary }}
              >
                Đăng nhập
              </button>
            )}

            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 cursor-pointer rounded-lg hover:bg-gray-100 transition-colors"
              style={{ color: colors.text }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <FiX className="w-6 h-6" />
              ) : (
                <FiMenu className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="lg:hidden py-4 border-t" style={{ borderColor: colors.primaryLight }}>
              <ul className="space-y-1">
                {navItems.map((item) => (
                  <li key={item.label}>
                    {item.dropdown ? (
                      <>
                        <div className="flex items-center gap-2 px-4 py-2 text-sm font-bold" style={{ color: colors.text }}>
                          {item.label}
                          {item.label === 'CÔNG NỢ' && isAuthenticated && unreadCount > 0 && (
                            <NotifBadge count={unreadCount} />
                          )}
                          {item.label === 'ĐẶT HÀNG' && isAuthenticated && orderUnreadCount > 0 && (
                            <NotifBadge count={orderUnreadCount} />
                          )}
                        </div>
                        <ul className="pl-4 space-y-1">
                          {item.dropdown.map((sub: SubItem) => {
                            const showDebtBadge = sub.href === '/bao-cao-cong-no' && isAuthenticated && unreadCount > 0;
                            const showOrderBadge = sub.href === '/danh-sach-don-hang' && isAuthenticated && orderUnreadCount > 0;
                            return (
                              <li key={sub.label}>
                                <Link
                                  href={sub.href}
                                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors"
                                  style={{ color: colors.textMuted }}
                                  onClick={() => setMobileMenuOpen(false)}
                                >
                                  {sub.label}
                                  {showDebtBadge && <NotifBadge count={unreadCount} />}
                                  {showOrderBadge && <NotifBadge count={orderUnreadCount} />}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    ) : (
                      <Link
                        href={item.href}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-colors"
                        style={{ color: colors.text }}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.label}
                        {item.label === 'HỎI ĐÁP' && isAuthenticated && infoUnreadCount > 0 && (
                          <NotifBadge count={infoUnreadCount} />
                        )}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              {!isAuthenticated && (
                <div className="mt-4 px-4">
                  <button
                    type="button"
                    className="w-full flex items-center justify-center px-4 py-2.5 text-white text-sm font-bold rounded-xl cursor-pointer"
                    style={{ backgroundColor: colors.primary }}
                    onClick={() => { setMobileMenuOpen(false); setLoginModalOpen(true); }}
                  >
                    Đăng nhập
                  </button>
                </div>
              )}
              {/* Mobile User Section */}
              {isAuthenticated && user && (
                <div className="mt-4 px-4 py-3 rounded-xl" style={{ backgroundColor: colors.primaryLight }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium" style={{ color: colors.text }}>
                        {user.username}
                      </p>
                      <p className="text-xs" style={{ color: colors.textMuted }}>
                        {user.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer"
                      style={{ color: colors.accent }}
                      onClick={() => {
                        logout();
                        setMobileMenuOpen(false);
                      }}
                    >
                      <FiLogOut className="w-4 h-4" />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <LoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 pt-20">{children}</main>

      {/* Footer */}
      <footer style={{ backgroundColor: '#14264b' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

            {/* Col 1: Brand */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Image src="/image1/LOGO_PHUC_LONG_EXPRESS_FULL_WHITE.png" alt="Phuc Long Express" width={160} height={80} className="h-20 w-auto object-contain" />
              </div>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Dịch vụ logistics uy tín — chuyên vận chuyển hàng hóa toàn quốc từ năm 2018.
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Thương hiệu thuộc <span style={{ color: 'rgba(255,255,255,0.55)' }}>Công ty TNHH Minh Khải Logistic</span>
              </p>
            </div>

            {/* Col 2: Quick links */}
            <div>
              <p className="text-white font-bold text-sm uppercase tracking-widest mb-4">Dịch vụ</p>
              <ul className="space-y-2">
                {[
                  { label: 'Đặt hàng', href: '/dat-hang' },
                  { label: 'Tra cứu đơn hàng', href: '/danh-sach-don-hang' },
                  { label: 'Quản lý Tracking', href: '/danh-sach-tracking' },
                  { label: 'Thông tin lô hàng', href: '/thong-tin-lo-hang' },
                  { label: 'Tỷ giá', href: '/ty-gia' },
                  { label: 'Báo cáo công nợ', href: '/bao-cao-cong-no' },
                  { label: 'Tin tức', href: '/tin-tuc' },
                  { label: 'Hỏi đáp', href: '/hoi-dap' },
                ].map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm transition-colors duration-200 cursor-pointer hover:text-white"
                      style={{ color: 'rgba(255,255,255,0.5)' }}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3: Contact */}
            <div>
              <p className="text-white font-bold text-sm uppercase tracking-widest mb-4">Liên hệ</p>
              <ul className="space-y-3">
                <li>
                  <a
                    href="mailto:cskh@mklexpress.com"
                    className="flex items-center gap-3 text-sm transition-colors duration-200 cursor-pointer hover:text-white"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    <FiMail className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent }} />
                    cskh@mklexpress.com
                  </a>
                </li>
                <li>
                  <a
                    href="tel:+840344415213"
                    className="flex items-center gap-3 text-sm transition-colors duration-200 cursor-pointer hover:text-white group"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    <FiPhone className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent }} />
                    (+84) 344.415.213
                  </a>
                </li>
                <li>
                  <a
                    href="https://zalo.me/0344415213"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm transition-colors duration-200 cursor-pointer hover:text-white"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    <SiZalo className="w-4 h-4 flex-shrink-0" style={{ color: '#0068FF' }} />
                    Zalo: 0344.415.213
                  </a>
                </li>
                <li>
                  <a
                    href="viber://chat?number=%2B840344415213"
                    className="flex items-center gap-3 text-sm transition-colors duration-200 cursor-pointer hover:text-white"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    <SiViber className="w-4 h-4 flex-shrink-0" style={{ color: '#7360F2' }} />
                    Viber: 0344.415.213
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.facebook.com/phuclongexpress.ple"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm transition-colors duration-200 cursor-pointer hover:text-white"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    <FaFacebook className="w-4 h-4 flex-shrink-0" style={{ color: '#1877F2' }} />
                    facebook.com/phuclongexpress.ple
                  </a>
                </li>
                <li>
                  <span className="flex items-start gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <FiMapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: colors.accent }} />
                    <span>
                      <span className="block text-xs font-semibold mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Trụ sở chính</span>
                      60 Trương Công Giai, Cầu Giấy, Hà Nội
                    </span>
                  </span>
                </li>
                <li>
                  <span className="flex items-start gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <FiMapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: colors.accent }} />
                    <span>
                      <span className="block text-xs font-semibold mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Kho Đà Nẵng</span>
                      84 Bắc Sơn, An Khê, Đà Nẵng
                    </span>
                  </span>
                </li>
                <li>
                  <span className="flex items-start gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <FiMapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: colors.accent }} />
                    <span>
                      <span className="block text-xs font-semibold mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Kho TP. HCM</span>
                      21 Đào Duy Anh, Đức Nhuận, TP. HCM
                    </span>
                  </span>
                </li>
              </ul>
            </div>

          </div>

          {/* Bottom bar */}
          <div className="mt-10 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              © {new Date().getFullYear()} Phuc Long Express (PLE). All rights reserved.
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Thành lập 2018 · Hà Nội, Việt Nam
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
