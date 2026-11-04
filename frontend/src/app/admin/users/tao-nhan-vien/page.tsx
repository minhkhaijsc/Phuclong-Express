'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FiArrowLeft, FiUserPlus, FiAlertCircle } from 'react-icons/fi';
import apiClient from '@/lib/api-client';
import { useQuyen } from '@/hooks/use-quyen';

/**
 * TẠO TÀI KHOẢN NHÂN VIÊN — gọi `POST /users` với loai = 'nhanVien'.
 *
 * Yêu cầu bên khách 04/11/2026: "mở quyền tạo tk nhân viên cho TP CSKH".
 * Trước đó web chỉ có màn tạo KHÁCH; nhân viên phải tạo như khách rồi Admin
 * gán vai trò ở bước hai.
 *
 * Ai thấy gì:
 *   • Admin (`quanLyRole`) — chọn mọi bộ phận và cấp.
 *   • Trưởng phòng CSKH — chỉ bộ phận của mình, không cấp. Máy chủ chặn y hệt
 *     (TaoTaiKhoanService.kiemTra); ô ở đây chỉ để khỏi chọn rồi bị từ chối.
 */

const BO_PHAN: { ma: string; nhan: string }[] = [
  { ma: 'CSKH', nhan: 'CSKH' },
  { ma: 'MuaHang', nhan: 'Mua hàng' },
  { ma: 'KeToan', nhan: 'Kế toán' },
  { ma: 'VanChuyen', nhan: 'Vận chuyển' },
  { ma: 'MKT', nhan: 'MKT' },
  { ma: 'Kho', nhan: 'Kho' },
  { ma: 'KhoSG', nhan: 'Kho Sài Gòn' },
  { ma: 'Admin', nhan: 'Admin' },
];
const CAP = [
  { ma: 'TruongPhong', nhan: 'Trưởng phòng' },
  { ma: 'GiamDoc', nhan: 'Giám đốc' },
];
/** Khớp BO_PHAN_TP_TAO_NHAN_VIEN ở backend. */
const BO_PHAN_TP_TAO = ['CSKH'];

const O =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20';

export default function TaoNhanVienPage() {
  const router = useRouter();
  const { co, quyen, dangNap } = useQuyen();
  const laAdmin = co('quanLyRole');
  const boPhanDuoc = laAdmin
    ? BO_PHAN
    : BO_PHAN.filter((b) => BO_PHAN_TP_TAO.includes(b.ma) && quyen?.boPhan?.includes(b.ma));

  const [f, setF] = useState({ userName: '', matKhau: '', nhapLai: '', hoTen: '', email: '', soDienThoai: '' });
  const [boPhan, setBoPhan] = useState<string[]>([]);
  const [cap, setCap] = useState<string[]>([]);
  const [loi, setLoi] = useState('');
  const [dangGui, setDangGui] = useState(false);

  // Trưởng phòng CSKH chỉ có một lựa chọn — chọn sẵn.
  const boPhanChon = !laAdmin && boPhanDuoc.length === 1 ? [boPhanDuoc[0].ma] : boPhan;

  const doi = (k: keyof typeof f, v: string) => setF((c) => ({ ...c, [k]: v }));
  const tat = (ds: string[], set: (v: string[]) => void, m: string) =>
    set(ds.includes(m) ? ds.filter((x) => x !== m) : [...ds, m]);

  if (dangNap) return <div className="p-6 text-sm text-gray-500">Đang kiểm quyền…</div>;
  if (!co('taoNhanVien')) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Chỉ Admin hoặc Trưởng phòng CSKH được tạo tài khoản nhân viên.
      </div>
    );
  }

  const gui = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoi('');
    if (!f.userName.trim() || !f.hoTen.trim()) return setLoi('Nhập tên đăng nhập và họ tên.');
    if (/\s/.test(f.userName.trim())) return setLoi('Tên đăng nhập không có dấu cách.');
    if (f.matKhau.length < 6) return setLoi('Mật khẩu phải từ 6 ký tự.');
    if (f.matKhau !== f.nhapLai) return setLoi('Hai lần nhập mật khẩu không khớp.');
    if (!boPhanChon.length) return setLoi('Chọn ít nhất một bộ phận.');
    setDangGui(true);
    try {
      const r = await apiClient.post('/users', {
        loai: 'nhanVien',
        boPhan: boPhanChon,
        cap: laAdmin ? cap : [],
        userName: f.userName.trim(),
        matKhau: f.matKhau,
        hoTen: f.hoTen.trim(),
        email: f.email.trim(),
        soDienThoai: f.soDienThoai.trim(),
      });
      const id = r.data?.Id ?? r.data?.id;
      router.push(id ? `/admin/users/${id}` : '/admin/users');
    } catch (err: any) {
      const m = err?.response?.data?.message;
      setLoi(Array.isArray(m) ? m.join('; ') : m || 'Không tạo được tài khoản.');
    } finally {
      setDangGui(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link
          href="/admin/users"
          className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <FiArrowLeft size={12} /> Danh sách User
        </Link>
        <h1 className="text-lg font-bold text-gray-900">Tạo tài khoản nhân viên</h1>
        {!laAdmin && (
          <p className="text-xs text-gray-500">
            Trưởng phòng tạo được nhân viên thường của bộ phận mình. Cấp Trưởng phòng hay bộ phận khác
            thì nhờ Admin.
          </p>
        )}
      </div>

      <form onSubmit={gui} className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Tên đăng nhập <span className="text-red-400">*</span>
            </label>
            <input
              className={O}
              value={f.userName}
              onChange={(e) => doi('userName', e.target.value.replace(/\s/g, ''))}
              placeholder="VD: CSKHLAN"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Họ tên <span className="text-red-400">*</span>
            </label>
            <input className={O} value={f.hoTen} onChange={(e) => doi('hoTen', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Mật khẩu <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              className={O}
              value={f.matKhau}
              onChange={(e) => doi('matKhau', e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Nhập lại mật khẩu <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              className={O}
              value={f.nhapLai}
              onChange={(e) => doi('nhapLai', e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Email</label>
            <input className={O} value={f.email} onChange={(e) => doi('email', e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Số điện thoại</label>
            <input className={O} value={f.soDienThoai} onChange={(e) => doi('soDienThoai', e.target.value)} />
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">
            Bộ phận <span className="text-red-400">*</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {boPhanDuoc.map((b) => (
              <label key={b.ma} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={boPhanChon.includes(b.ma)}
                  disabled={!laAdmin}
                  onChange={() => tat(boPhan, setBoPhan, b.ma)}
                />
                {b.nhan}
              </label>
            ))}
          </div>
        </div>

        {laAdmin && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500">Cấp</div>
            <div className="flex flex-wrap gap-3">
              {CAP.map((c) => (
                <label key={c.ma} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={cap.includes(c.ma)} onChange={() => tat(cap, setCap, c.ma)} />
                  {c.nhan}
                </label>
              ))}
            </div>
          </div>
        )}

        {loi && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <FiAlertCircle className="mt-0.5 shrink-0" /> {loi}
          </div>
        )}

        <button
          type="submit"
          disabled={dangGui}
          className="inline-flex items-center gap-2 rounded-xl bg-[#14264b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1e3a6e] disabled:opacity-50"
        >
          <FiUserPlus /> {dangGui ? 'Đang tạo…' : 'Tạo nhân viên'}
        </button>
      </form>
    </div>
  );
}
