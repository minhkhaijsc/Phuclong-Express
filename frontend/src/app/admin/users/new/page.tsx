'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FiArrowLeft,
  FiUser,
  FiLock,
  FiPhone,
  FiMail,
  FiMapPin,
  FiLink,
  FiEye,
  FiEyeOff,
  FiCheckCircle,
  FiAlertCircle,
  FiUserPlus,
  FiRefreshCw,
  FiTag,
  FiCreditCard,
} from 'react-icons/fi';
import { getDanhSachCskh, register } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';

const VIETNAM_CITIES = [
  '', 'An Giang', 'Bà Rịa-Vũng Tàu', 'Bạc Liêu', 'Bắc Kạn', 'Bắc Giang', 'Bắc Ninh',
  'Bến Tre', 'Bình Dương', 'Bình Định', 'Bình Phước', 'Bình Thuận', 'Cà Mau', 'Cao Bằng',
  'Cần Thơ (TP)', 'Đà Nẵng (TP)', 'Đắk Lắk', 'Đắk Nông', 'Điện Biên', 'Đồng Nai',
  'Đồng Tháp', 'Gia Lai', 'Hà Giang', 'Hà Nam', 'Hà Nội (TP)', 'Hà Tây', 'Hà Tĩnh',
  'Hải Dương', 'Hải Phòng (TP)', 'Hòa Bình', 'Hồ Chí Minh (TP)', 'Hậu Giang', 'Hưng Yên',
  'Khánh Hòa', 'Kiên Giang', 'Kon Tum', 'Lai Châu', 'Lào Cai', 'Lạng Sơn', 'Lâm Đồng',
  'Long An', 'Nam Định', 'Nghệ An', 'Ninh Bình', 'Ninh Thuận', 'Phú Thọ', 'Phú Yên',
  'Quảng Bình', 'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sóc Trăng',
  'Sơn La', 'Tây Ninh', 'Thái Bình', 'Thái Nguyên', 'Thanh Hóa', 'Thừa Thiên - Huế',
  'Tiền Giang', 'Trà Vinh', 'Tuyên Quang', 'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái',
];

const VUNG_MIEN = ['', 'Bắc', 'Trung', 'Nam'];

const INPUT_BASE =
  'w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-4 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20 transition-all disabled:cursor-not-allowed disabled:opacity-50';

const INPUT_ERROR =
  'w-full rounded-xl border border-red-300 bg-white py-2.5 pl-4 pr-4 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all';

function FieldLabel({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-slate-500">
      {children}
      {required && <span className="ml-0.5 text-red-400">*</span>}
    </label>
  );
}

export default function CreateUserPage() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    hoTen: '',
    vungMien: '',
    diaChi: '',
    tinhThanh: '',
    phoneNumber: '',
    email: '',
    soTaiKhoan: '',
    hinhThucNhanHang: '',
    khachBuon: false,
    linkTaiKhoanMang: '',
    cskhPhuTrach: '',
  });

  /**
   * Danh sách CSKH cho ô "CSKH phụ trách".
   *
   * Từ 03/11/2026 ô này BẮT BUỘC, nên tải hỏng thì phải báo ra — danh sách
   * rỗng mà bắt chọn là kẹt không lối ra.
   */
  const [dsCskh, setDsCskh] = useState<{ username: string; hoTen: string }[]>([]);
  const toiLaAi = useAuthStore((st) => st.user?.username) ?? '';

  useEffect(() => {
    getDanhSachCskh()
      .then((ds) => {
        setDsCskh(ds);
        // CSKH tự tạo mã cho khách của mình là trường hợp thường gặp nhất, nên
        // điền sẵn tên họ. Vẫn đổi được sang người khác.
        if (ds.some((x) => x.username === toiLaAi)) {
          setFormData((cu) => (cu.cskhPhuTrach ? cu : { ...cu, cskhPhuTrach: toiLaAi }));
        }
      })
      .catch(() => setError('Không tải được danh sách CSKH — tải lại trang rồi thử lại.'));
  }, [toiLaAi]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = (key: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    // Clear field error on change
    if (fieldErrors[key]) setFieldErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!formData.username.trim()) errors.username = 'Bắt buộc nhập';
    if (!formData.password) errors.password = 'Bắt buộc nhập';
    if (!formData.hoTen.trim()) errors.hoTen = 'Bắt buộc nhập';
    // Bắt buộc từ 03/11/2026 — máy chủ cũng chặn.
    if (!formData.cskhPhuTrach) errors.cskhPhuTrach = 'Bắt buộc chọn CSKH phụ trách';
    if (!formData.confirmPassword) errors.confirmPassword = 'Bắt buộc nhập';
    else if (formData.password !== formData.confirmPassword) errors.confirmPassword = 'Mật khẩu không khớp';
    return errors;
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      await register({
        username: formData.username,
        password: formData.password,
        email: formData.email || formData.username + '@example.com',
        hoTen: formData.hoTen,
        diaChi: formData.diaChi,
        tinhThanh: formData.tinhThanh,
        soTaiKhoan: formData.soTaiKhoan,
        hinhThucNhanHang: formData.hinhThucNhanHang,
        khachBuon: formData.khachBuon,
        linkTaiKhoanMang: formData.linkTaiKhoanMang,
        vungMien: formData.vungMien,
        cskhPhuTrach: formData.cskhPhuTrach,
      });
      setSuccess(true);
      setTimeout(() => { window.location.href = '/admin/users'; }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Tạo tài khoản thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/users"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700 cursor-pointer"
        >
          <FiArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#14264b]/10">
            <FiUserPlus className="h-5 w-5 text-[#14264b]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Tạo tài khoản mới</h1>
            <p className="text-sm text-slate-500">Điền thông tin để tạo tài khoản người dùng</p>
          </div>
        </div>
      </div>

      {/* Feedback banner */}
      {(error || success) && (
        <div
          role="alert"
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm transition-all ${
            success
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {success
            ? <FiCheckCircle className="h-4 w-4 flex-shrink-0" />
            : <FiAlertCircle className="h-4 w-4 flex-shrink-0" />}
          {success ? 'Tạo tài khoản thành công! Đang chuyển hướng...' : error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left column (3/5) */}
          <div className="lg:col-span-3 space-y-6">
            {/* Account credentials */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
                <FiLock className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-700">Thông tin đăng nhập</h2>
              </div>
              <div className="p-6 space-y-4">
                {/* Username */}
                <div>
                  <FieldLabel htmlFor="username" required>Tên đăng nhập</FieldLabel>
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={formData.username}
                    onChange={e => handleChange('username', e.target.value)}
                    placeholder="Nhập tên đăng nhập..."
                    className={fieldErrors.username ? INPUT_ERROR : INPUT_BASE}
                  />
                  {fieldErrors.username && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.username}</p>
                  )}
                </div>

                {/* Full name */}
                <div>
                  <FieldLabel htmlFor="hoTen" required>Họ tên</FieldLabel>
                  <input
                    id="hoTen"
                    type="text"
                    value={formData.hoTen}
                    onChange={e => handleChange('hoTen', e.target.value)}
                    placeholder="Nhập họ và tên..."
                    className={fieldErrors.hoTen ? INPUT_ERROR : INPUT_BASE}
                  />
                  {fieldErrors.hoTen && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.hoTen}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <FieldLabel htmlFor="password" required>Mật khẩu</FieldLabel>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={formData.password}
                      onChange={e => handleChange('password', e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className={`${fieldErrors.password ? INPUT_ERROR : INPUT_BASE} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                    >
                      {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <FieldLabel htmlFor="confirmPassword" required>Nhập lại mật khẩu</FieldLabel>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={formData.confirmPassword}
                      onChange={e => handleChange('confirmPassword', e.target.value)}
                      placeholder="Nhập lại mật khẩu..."
                      className={`${
                        fieldErrors.confirmPassword ? INPUT_ERROR : INPUT_BASE
                      } pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      aria-label={showConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                    >
                      {showConfirm ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-500">{fieldErrors.confirmPassword}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Contact info */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
                <FiMapPin className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-700">Thông tin liên hệ</h2>
              </div>
              <div className="p-6 space-y-4">
                {/* Phone + Email row */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="phoneNumber">Số điện thoại</FieldLabel>
                    <div className="relative">
                      <FiPhone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        id="phoneNumber"
                        type="tel"
                        value={formData.phoneNumber}
                        onChange={e => handleChange('phoneNumber', e.target.value)}
                        placeholder="0901 234 567"
                        className={`${INPUT_BASE} pl-9`}
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <div className="relative">
                      <FiMail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={e => handleChange('email', e.target.value)}
                        placeholder="example@email.com"
                        className={`${INPUT_BASE} pl-9`}
                      />
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <FieldLabel htmlFor="diaChi">Địa chỉ</FieldLabel>
                  <input
                    id="diaChi"
                    type="text"
                    value={formData.diaChi}
                    onChange={e => handleChange('diaChi', e.target.value)}
                    placeholder="Số nhà, đường, phường/xã..."
                    className={INPUT_BASE}
                  />
                </div>

                {/* City + Region row */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="tinhThanh">Tỉnh / Thành phố</FieldLabel>
                    <select
                      id="tinhThanh"
                      value={formData.tinhThanh}
                      onChange={e => handleChange('tinhThanh', e.target.value)}
                      className={`${INPUT_BASE} cursor-pointer`}
                    >
                      {VIETNAM_CITIES.map(city => (
                        <option key={city} value={city}>{city || '-- Chọn --'}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="vungMien">Vùng miền</FieldLabel>
                    <select
                      id="vungMien"
                      value={formData.vungMien}
                      onChange={e => handleChange('vungMien', e.target.value)}
                      className={`${INPUT_BASE} cursor-pointer`}
                    >
                      {VUNG_MIEN.map(v => (
                        <option key={v} value={v}>{v || '-- Chọn --'}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="cskhPhuTrach" required>CSKH phụ trách</FieldLabel>
                    <select
                      id="cskhPhuTrach"
                      value={formData.cskhPhuTrach}
                      onChange={e => handleChange('cskhPhuTrach', e.target.value)}
                      className={`${fieldErrors.cskhPhuTrach ? INPUT_ERROR : INPUT_BASE} cursor-pointer`}
                    >
                      <option value="">-- Chọn CSKH --</option>
                      {dsCskh.map(c => (
                        <option key={c.username} value={c.username}>
                          {c.hoTen} ({c.username})
                        </option>
                      ))}
                    </select>
                    {fieldErrors.cskhPhuTrach && (
                      <p className="mt-1 text-xs text-red-500">{fieldErrors.cskhPhuTrach}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right column (2/5) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Additional info */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
                <FiTag className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-700">Thông tin bổ sung</h2>
              </div>
              <div className="p-6 space-y-4">
                {/* Bank account */}
                <div>
                  <FieldLabel htmlFor="soTaiKhoan">Số tài khoản</FieldLabel>
                  <div className="relative">
                    <FiCreditCard className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="soTaiKhoan"
                      type="text"
                      value={formData.soTaiKhoan}
                      onChange={e => handleChange('soTaiKhoan', e.target.value)}
                      placeholder="Số tài khoản ngân hàng..."
                      className={`${INPUT_BASE} pl-9`}
                    />
                  </div>
                </div>

                {/* Delivery method */}
                <div>
                  <FieldLabel htmlFor="hinhThucNhanHang">Hình thức nhận hàng</FieldLabel>
                  <input
                    id="hinhThucNhanHang"
                    type="text"
                    value={formData.hinhThucNhanHang}
                    onChange={e => handleChange('hinhThucNhanHang', e.target.value)}
                    placeholder="Giao hàng, lấy tại kho..."
                    className={INPUT_BASE}
                  />
                </div>

                {/* FB link */}
                <div>
                  <FieldLabel htmlFor="linkTaiKhoanMang">Link Facebook</FieldLabel>
                  <div className="relative">
                    <FiLink className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="linkTaiKhoanMang"
                      type="url"
                      value={formData.linkTaiKhoanMang}
                      onChange={e => handleChange('linkTaiKhoanMang', e.target.value)}
                      placeholder="https://facebook.com/..."
                      className={`${INPUT_BASE} pl-9`}
                    />
                  </div>
                </div>

                {/* Wholesale customer toggle */}
                <div>
                  <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100">
                    <div className="flex items-center gap-2.5">
                      <FiUser className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">Khách buôn</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.khachBuon}
                      onClick={() => handleChange('khachBuon', !formData.khachBuon)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#14264b] focus:ring-offset-2 cursor-pointer ${
                        formData.khachBuon ? 'bg-[#14264b]' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                          formData.khachBuon ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-3">
              <button
                type="submit"
                disabled={loading || success}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <FiRefreshCw className="h-4 w-4 animate-spin" />
                    Đang tạo...
                  </>
                ) : success ? (
                  <>
                    <FiCheckCircle className="h-4 w-4" />
                    Thành công!
                  </>
                ) : (
                  <>
                    <FiUserPlus className="h-4 w-4" />
                    Tạo tài khoản
                  </>
                )}
              </button>
              <Link
                href="/admin/users"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 cursor-pointer"
              >
                Hủy bỏ
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
