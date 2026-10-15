'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  FiArrowLeft,
  FiUser,
  FiShield,
  FiLock,
  FiTrash2,
  FiEye,
  FiEyeOff,
  FiCheckCircle,
  FiAlertCircle,
  FiRefreshCw,
  FiEdit2,
  FiX,
  FiSave,
} from 'react-icons/fi';
import apiClient from '@/lib/api-client';
import { getDanhSachCskh } from '@/lib/api';

interface User {
  Id: string;
  UserName: string;
  Email: string;
  HoTen: string;
  DiaChi: string;
  TinhThanh: string;
  SoTaiKhoan: string;
  HinhThucNhanHang: string;
  KhachBuon: boolean;
  LinkTaiKhoanMang: string;
  VungMien: string;
  /** Tên đăng nhập của CSKH phụ trách, vd `CSKHMAILINH`. Null = chưa gán. */
  CSKHPhuTrach: string | null;
}

interface Role {
  name: string;
  Name?: string; // API may return PascalCase
}

/** Normalize role name regardless of casing from API */
const roleName = (r: Role) => r.name || r.Name || '';

/** Hiển thị một field thông tin user */
function InfoRow({ label, value }: { label: string; value?: string | boolean | null }) {
  const display =
    value === null || value === undefined || value === ''
      ? <span className="text-slate-300">—</span>
      : typeof value === 'boolean'
        ? <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${value ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{value ? 'Có' : 'Không'}</span>
        : <span className="text-slate-700">{value}</span>;

  return (
    <div className="flex items-start gap-4 py-3 border-b border-slate-100 last:border-0">
      <span className="w-44 flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <div className="flex-1 text-sm">{display}</div>
    </div>
  );
}

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<User>>({});

  /** Danh sách CSKH cho ô chọn. Hỏng thì im lặng, không chặn màn chi tiết. */
  const [dsCskh, setDsCskh] = useState<{ username: string; hoTen: string }[]>([]);
  useEffect(() => {
    getDanhSachCskh().then(setDsCskh).catch(() => undefined);
  }, []);

  /** Hiện "Họ tên (TENDANGNHAP)"; tra không ra thì hiện nguyên tên đăng nhập. */
  const tenCskh = (u?: string | null): string => {
    if (!u) return '';
    const c = dsCskh.find((x) => x.username === u);
    return c ? `${c.hoTen} (${c.username})` : u;
  };
  const [saving, setSaving] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [removingRole, setRemovingRole] = useState<string | null>(null);
  const [addingRole, setAddingRole] = useState(false);

  useEffect(() => {
    fetchData();
  }, [userId]);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 3000);
  };

  const fetchData = async () => {
    try {
      const [userRes, rolesRes, allRolesRes] = await Promise.all([
        apiClient.get(`/users/${userId}`),
        apiClient.get(`/users/${userId}/roles`),
        apiClient.get('/roles'),
      ]);
      setUser(userRes.data);
      setRoles(rolesRes.data || []);
      setAllRoles(allRolesRes.data || []);
    } catch {
      setError('Không thể tải thông tin user');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRole = async (roleName: string) => {
    if (!roleName) return;
    setAddingRole(true);
    try {
      const res = await apiClient.post(`/users/${userId}/roles`, { roleName });
      if (res.data?.success !== false) {
        showFeedback('success', `Đã thêm role "${roleName}"`);
        fetchData();
      } else {
        showFeedback('error', res.data.message || 'Thêm role thất bại');
      }
    } catch {
      showFeedback('error', 'Thêm role thất bại');
    } finally {
      setAddingRole(false);
    }
  };

  const handleRemoveRole = async (roleName: string) => {
    setRemovingRole(roleName);
    try {
      const res = await apiClient.delete(`/users/${userId}/roles/${roleName}`);
      if (res.data?.success !== false) {
        showFeedback('success', `Đã xóa role "${roleName}"`);
        fetchData();
      } else {
        showFeedback('error', res.data.message || 'Xóa role thất bại');
      }
    } catch {
      showFeedback('error', 'Xóa role thất bại');
    } finally {
      setRemovingRole(null);
    }
  };

  const handleStartEdit = () => {
    if (!user) return;
    setEditForm({
      HoTen: user.HoTen,
      Email: user.Email,
      DiaChi: user.DiaChi,
      TinhThanh: user.TinhThanh,
      VungMien: user.VungMien,
      SoTaiKhoan: user.SoTaiKhoan,
      HinhThucNhanHang: user.HinhThucNhanHang,
      KhachBuon: user.KhachBuon,
      LinkTaiKhoanMang: user.LinkTaiKhoanMang,
      CSKHPhuTrach: user.CSKHPhuTrach ?? '',
    });
    setEditing(true);
  };

  const handleSaveInfo = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put(`/users/${userId}`, editForm);
      if (res.data?.success !== false) {
        showFeedback('success', 'Cập nhật thông tin thành công');
        setEditing(false);
        fetchData();
      } else {
        showFeedback('error', res.data.message || 'Cập nhật thất bại');
      }
    } catch {
      showFeedback('error', 'Cập nhật thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!password || !confirmPassword) {
      showFeedback('error', 'Vui lòng nhập đầy đủ thông tin');
      return;
    }
    if (password !== confirmPassword) {
      showFeedback('error', 'Mật khẩu và nhập lại mật khẩu không khớp');
      return;
    }
    setResetting(true);
    try {
      const res = await apiClient.post(`/users/${userId}/reset-password`, { password });
      if (res.data?.success !== false) {
        showFeedback('success', 'Reset mật khẩu thành công');
        setPassword('');
        setConfirmPassword('');
      } else {
        showFeedback('error', res.data.message || 'Reset mật khẩu thất bại');
      }
    } catch {
      showFeedback('error', 'Reset mật khẩu thất bại');
    } finally {
      setResetting(false);
    }
  };

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
        <div className="grid gap-6 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
          <FiUser className="h-8 w-8 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">Không tìm thấy user</p>
        <Link href="/admin/users" className="mt-4 text-sm text-[#14264b] hover:underline cursor-pointer">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const userRoles = roles.map(r => roleName(r));
  const availableRoles = allRoles.filter(r => !userRoles.includes(roleName(r)));

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
            <FiUser className="h-5 w-5 text-[#14264b]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">{user.UserName}</h1>
            <p className="text-sm text-slate-500">Chi tiết tài khoản</p>
          </div>
        </div>
      </div>

      {/* Feedback banner */}
      {(error || success) && (
        <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm transition-all ${
          success
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {success
            ? <FiCheckCircle className="h-4 w-4 flex-shrink-0" />
            : <FiAlertCircle className="h-4 w-4 flex-shrink-0" />}
          {success || error}
        </div>
      )}

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left column – user info (3/5) */}
        <div className="lg:col-span-3 space-y-6">
          {/* User info card */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <FiUser className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-700">Thông tin chi tiết</h2>
              </div>
              {!editing ? (
                <button
                  onClick={handleStartEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
                >
                  <FiEdit2 className="h-3.5 w-3.5" />
                  Chỉnh sửa
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    <FiX className="h-3.5 w-3.5" />
                    Hủy
                  </button>
                  <button
                    onClick={handleSaveInfo}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#14264b] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#3db8e4] disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? <FiRefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FiSave className="h-3.5 w-3.5" />}
                    Lưu
                  </button>
                </div>
              )}
            </div>
            {!editing ? (
              <div className="px-6 py-2">
                <InfoRow label="Tên đăng nhập" value={user.UserName} />
                <InfoRow label="Họ tên" value={user.HoTen} />
                <InfoRow label="Email" value={user.Email} />
                <InfoRow label="Địa chỉ" value={user.DiaChi} />
                <InfoRow label="Tỉnh / Thành phố" value={user.TinhThanh} />
                <InfoRow label="Vùng miền" value={user.VungMien} />
                <InfoRow label="Số tài khoản" value={user.SoTaiKhoan} />
                <InfoRow label="Hình thức nhận hàng" value={user.HinhThucNhanHang} />
                <InfoRow label="Khách buôn" value={user.KhachBuon} />
                <InfoRow label="Link FB" value={user.LinkTaiKhoanMang} />
                <InfoRow label="CSKH phụ trách" value={tenCskh(user.CSKHPhuTrach)} />
              </div>
            ) : (
              <div className="px-6 py-4 space-y-4">
                {[
                  { key: 'HoTen', label: 'Họ tên' },
                  { key: 'Email', label: 'Email' },
                  { key: 'DiaChi', label: 'Địa chỉ' },
                  { key: 'TinhThanh', label: 'Tỉnh / Thành phố' },
                  { key: 'VungMien', label: 'Vùng miền' },
                  { key: 'SoTaiKhoan', label: 'Số tài khoản' },
                  { key: 'HinhThucNhanHang', label: 'Hình thức nhận hàng' },
                  { key: 'LinkTaiKhoanMang', label: 'Link FB' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
                    <input
                      type="text"
                      value={(editForm as Record<string, string>)[key] ?? ''}
                      onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20 transition-all"
                    />
                  </div>
                ))}
                {/*
                  Ô này là CHỌN chứ không phải gõ: gõ tay thì "CSKHMAILINH",
                  "cskhmailinh" và "Mai Linh" thành ba người khác nhau, và sau
                  này gộp doanh số theo CSKH là ra ba dòng.
                */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">CSKH phụ trách</label>
                  <select
                    value={(editForm as Record<string, string>).CSKHPhuTrach ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, CSKHPhuTrach: e.target.value }))}
                    className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20 transition-all"
                  >
                    <option value="">-- Chưa gán --</option>
                    {dsCskh.map(c => (
                      <option key={c.username} value={c.username}>
                        {c.hoTen} ({c.username})
                      </option>
                    ))}
                    {/* Người đã nghỉ không còn trong danh sách, nhưng mã cũ vẫn
                        phải giữ được tên họ — không thì mở ra sửa một thứ khác
                        là vô tình xoá mất người phụ trách. */}
                    {user.CSKHPhuTrach &&
                      !dsCskh.some(c => c.username === user.CSKHPhuTrach) && (
                        <option value={user.CSKHPhuTrach}>{user.CSKHPhuTrach} (đã nghỉ)</option>
                      )}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Khách buôn</label>
                  <select
                    value={editForm.KhachBuon ? 'true' : 'false'}
                    onChange={e => setEditForm(f => ({ ...f, KhachBuon: e.target.value === 'true' }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20 transition-all cursor-pointer"
                  >
                    <option value="false">Không</option>
                    <option value="true">Có</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column – roles + password (2/5) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Role management card */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
              <FiShield className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Quản lý Role</h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Add role */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Thêm role</label>
                <div className="flex gap-2">
                  <select
                    defaultValue=""
                    disabled={addingRole || availableRoles.length === 0}
                    onChange={e => { handleAddRole(e.target.value); e.target.value = ''; }}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-700 shadow-sm focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-all"
                  >
                    <option value="">{availableRoles.length === 0 ? 'Đã thêm tất cả' : '— Chọn role —'}</option>
                    {availableRoles.map((r, i) => (
                      <option key={roleName(r) || i} value={roleName(r)}>{roleName(r)}</option>
                    ))}
                  </select>
                  {addingRole && (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                      <FiRefreshCw className="h-4 w-4 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
              </div>

              {/* Current roles */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Role hiện tại</label>
                {roles.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">
                    Chưa có role nào
                  </p>
                ) : (
                  <div className="space-y-2">
                    {roles.map((role, i) => (
                      <div
                        key={roleName(role) || i}
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <FiShield className="h-3.5 w-3.5 text-[#14264b]" />
                          <span className="text-sm font-medium text-slate-700">{roleName(role)}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveRole(roleName(role))}
                          disabled={removingRole === roleName(role)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 cursor-pointer"
                        >
                          {removingRole === roleName(role)
                            ? <FiRefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : <FiTrash2 className="h-3.5 w-3.5" />}
                          Xóa
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Password reset card */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
              <FiLock className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Reset mật khẩu</h2>
            </div>
            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              {/* New password */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Mật khẩu mới</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-10 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20 transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                  >
                    {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Nhập lại mật khẩu</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu..."
                    className={`w-full rounded-xl border bg-white py-2.5 pl-4 pr-10 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
                      confirmPassword && password !== confirmPassword
                        ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                        : 'border-slate-200 focus:border-[#14264b] focus:ring-[#14264b]/20'
                    }`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                  >
                    {showConfirm ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 text-xs text-red-500">Mật khẩu không khớp</p>
                )}
              </div>

              <button
                type="submit"
                disabled={resetting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {resetting ? (
                  <>
                    <FiRefreshCw className="h-4 w-4 animate-spin" />
                    Đang reset...
                  </>
                ) : (
                  <>
                    <FiLock className="h-4 w-4" />
                    Reset mật khẩu
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
