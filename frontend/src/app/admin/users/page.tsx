'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FiSearch,
  FiDownload,
  FiPlus,
  FiTrash2,
  FiEye,
  FiUsers,
  FiRefreshCw,
  FiExternalLink,
  FiAlertTriangle,
  FiLock,
} from 'react-icons/fi';
import apiClient from '@/lib/api-client';
import { downloadDataAsExcel } from '@/lib/excel-download';
import {
  getTongHopTrangThaiKhach,
  getMotTrangThaiKhach,
  type KhachKemTrangThai,
} from '@/lib/api';
import { HopDoiTrangThai } from '@/app/components/hop-doi-trang-thai';
import { HopXoaTaiKhoan } from '@/app/components/hop-xoa-tai-khoan';
import { getDanhSachCskh } from '@/lib/api';
import { useQuyen } from '@/hooks/use-quyen';

interface User {
  Id: string;
  UserName: string;
  Email: string;
  PhoneNumber: string;
  HoTen: string;
  DiaChi: string;
  TinhThanh: string;
  SoTaiKhoan: string;
  HinhThucNhanHang: string;
  KhachBuon: boolean;
  LinkTaiKhoanMang: string;
  VungMien: string;
  /** Tên đăng nhập của CSKH phụ trách. Null = chưa gán. */
  CSKHPhuTrach: string | null;
  /** Số ngày được phép nợ. Null = chưa thoả thuận, khác hẳn 0. */
  TuoiNo: number | null;
}

export default function ListUserPage() {
  const { co } = useQuyen();
  /**
   * Kế toán mở được màn này (yêu cầu 22/10/2026) nhưng KHÔNG được thấy email
   * và số điện thoại khách. Ẩn hai cột ở đây chỉ cho đỡ chướng mắt — chặn thật
   * nằm ở máy chủ, `GET /users` đã cắt hai khoá đó khỏi JSON rồi
   * (backend/src/users/che-lien-he.ts), nên sửa localStorage cũng không moi ra
   * được.
   */
  const xemLienHe = co('xemLienHeKhach');
  /** Mở trang chi tiết tài khoản — `GET /users/:id` đòi `taiKhoan.xem`. */
  const xemChiTiet = co('taiKhoan.xem');
  /** Tạo tài khoản, đổi trạng thái — đều đi qua `taiKhoan.sua`. */
  const suaTaiKhoan = co('taiKhoan.sua');
  /** Xoá tài khoản — `DELETE /users/:id` đòi thêm `quanLyRole`. */
  const xoaDuoc = co('quanLyRole');
  /**
   * Còn thao tác nào không. Kế toán không có cái nào trong ba, nên bỏ hẳn cột
   * thay vì để một cột rỗng rộng 36 đơn vị giữa bảng.
   */
  const coThaoTac = xemChiTiet || suaTaiKhoan || xoaDuoc;

  const [keyword, setKeyword] = useState('');
  /** Lọc theo CSKH phụ trách. '' = tất cả, CHUA_GAN = những mã chưa ai nhận. */
  const [locCskh, setLocCskh] = useState('');
  const [dsCskh, setDsCskh] = useState<{ username: string; hoTen: string }[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Tài khoản đang mở hộp "Xoá tài khoản". Hộp tự kiểm kê rồi hỏi. */
  const [dangXoa, setDangXoa] = useState<string | null>(null);
  /**
   * Lời nhắc đóng mã. Nạp rời khỏi danh sách user vì truy vấn này quét cả
   * CONGNO / tbTracking / Don_Hang (~1,5 giây) — gộp vào thì danh sách user
   * cũng phải đợi theo, mà người vào đây thường chỉ muốn tra một tài khoản.
   */
  const [canDongMa, setCanDongMa] = useState<{ canDongMa: number; canDongMaConNo: number } | null>(null);
  /**
   * Tài khoản đang mở hộp đổi trạng thái.
   *
   * Có ở màn này vì màn nhắc đóng mã chỉ liệt kê tài khoản KHÔNG có vai trò.
   * Tài khoản nhân viên (kế toán, CSKH, kho) không bao giờ hiện ở đó, nên nếu
   * chỉ có đường dẫn sang bên kia thì người ta vẫn không khoá được nó — đúng
   * tình trạng hôm 09/10/2026: chặn xoá hai tài khoản kế toán rồi để người
   * dùng ở đường cùng.
   */
  const [dangSuaTrangThai, setDangSuaTrangThai] = useState<KhachKemTrangThai | null>(null);
  const [dangMoTrangThai, setDangMoTrangThai] = useState<string | null>(null);

  const fetchUsers = useCallback(async (kw: string, cskh = '') => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (kw) params.keyword = kw;
      if (cskh) params.cskh = cskh;
      const { data } = await apiClient.get('/users', { params });
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setError('Không thể tải danh sách user');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers('');
  }, [fetchUsers]);

  useEffect(() => {
    // Im lặng nếu hỏng: ô lọc phụ, không được chặn danh sách.
    getDanhSachCskh().then(setDsCskh).catch(() => undefined);
  }, []);

  /** Hiện "Họ tên"; tra không ra thì hiện nguyên tên đăng nhập. */
  const tenCskh = (u?: string | null): string => {
    if (!u) return '';
    return dsCskh.find((x) => x.username === u)?.hoTen ?? u;
  };

  useEffect(() => {
    // Hỏng thì im lặng: đây là lời nhắc phụ, không được chặn màn danh sách.
    getTongHopTrangThaiKhach()
      .then((t) => setCanDongMa({ canDongMa: t.canDongMa, canDongMaConNo: t.canDongMaConNo }))
      .catch(() => undefined);
  }, []);

  const handleSearch = () => fetchUsers(keyword, locCskh);

  const moTrangThai = async (id: string) => {
    setDangMoTrangThai(id);
    try {
      setDangSuaTrangThai(await getMotTrangThaiKhach(id));
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Không mở được trạng thái của tài khoản này');
    } finally {
      setDangMoTrangThai(null);
    }
  };

  /**
   * Xuất file danh sách user.
   *
   * Hai cột Email/PhoneNumber chỉ có với người được `xemLienHeKhach`. Người
   * không có quyền thì file ra THIẾU HẲN hai cột, chứ không phải có cột rỗng:
   * cột rỗng khiến bên nhận tưởng khách chưa khai email, rồi đi hỏi lại CSKH.
   *
   * Dù sao máy chủ cũng đã cắt hai khoá đó khỏi JSON, nên để nguyên danh sách
   * cũ thì cột cũng chỉ toàn rỗng — bỏ hẳn là cách đọc đúng duy nhất.
   */
  const handleExport = () => {
    const headers = [
      'ID', 'UserName', 'HoTen', 'CSKH phụ trách', 'Tuổi nợ (ngày)', 'DiaChi',
      ...(xemLienHe ? ['Email', 'PhoneNumber'] : []),
      'TinhThanh', 'SoTaiKhoan', 'HinhThucNhanHang', 'KhachBuon', 'LinkTaiKhoanMang',
    ];
    const rows = users.map(u => [
      // Chưa đặt thì để trống chứ không ghi 0 — 0 nghĩa là phải trả ngay.
      u.Id, u.UserName || '', u.HoTen || '', tenCskh(u.CSKHPhuTrach),
      u.TuoiNo === null || u.TuoiNo === undefined ? '' : String(u.TuoiNo),
      u.DiaChi || '',
      ...(xemLienHe ? [u.Email || '', u.PhoneNumber || ''] : []),
      u.TinhThanh || '', u.SoTaiKhoan || '',
      u.HinhThucNhanHang || '', u.KhachBuon ? 'true' : 'false', u.LinkTaiKhoanMang || '',
    ]);
    downloadDataAsExcel([headers, ...rows], `DanhSachUser_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#14264b]/10">
            <FiUsers className="h-5 w-5 text-[#14264b]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Danh sách User</h1>
            {!loading && (
              <p className="text-sm text-slate-500">
                Tổng <span className="font-semibold text-slate-700">{users.length}</span> tài khoản
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExport}
            disabled={users.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <FiDownload className="h-4 w-4" />
            Export Excel
          </button>
          {suaTaiKhoan && (
            <Link
              href="/admin/users/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#14264b] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3db8e4] cursor-pointer"
            >
              <FiPlus className="h-4 w-4" />
              Tạo mới
            </Link>
          )}
        </div>
      </div>

      {/* Nhắc CSKH đóng mã — số liệu ở màn "Khách ngừng giao dịch" */}
      {canDongMa && canDongMa.canDongMa > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <FiAlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>{canDongMa.canDongMa.toLocaleString('vi-VN')}</strong> mã khách quá 3 tháng
            không phát sinh giao dịch, cần xem và đóng mã
            {canDongMa.canDongMaConNo > 0 && (
              <> — trong đó <strong>{canDongMa.canDongMaConNo}</strong> mã còn nợ</>
            )}
            .
          </span>
          <Link
            href="/admin/khach-ngung-giao-dich"
            className="ml-auto rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
          >
            Xem danh sách
          </Link>
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo username..."
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20 transition-all"
          />
        </div>
        <select
          value={locCskh}
          onChange={e => {
            setLocCskh(e.target.value);
            fetchUsers(keyword, e.target.value);
          }}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-700 shadow-sm focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20 transition-all"
        >
          <option value="">CSKH: tất cả</option>
          <option value="(chua-gan)">— Chưa gán CSKH —</option>
          {dsCskh.map(c => (
            <option key={c.username} value={c.username}>{c.hoTen}</option>
          ))}
        </select>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <FiRefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <FiSearch className="h-4 w-4" />
          )}
          Tìm kiếm
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Table card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          /* Loading skeleton */
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-28 animate-pulse rounded bg-slate-100 ml-auto" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <FiUsers className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">Không tìm thấy user nào</p>
            <p className="mt-1 text-xs text-slate-400">Thử thay đổi từ khóa tìm kiếm</p>
          </div>
        ) : (
          /* Data table */
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              {/*
                Phải đủ 13 `col` cho 13 `th`, và bớt đi 2 khi ẩn Email/Phone.
                Trước đây chỉ có 12 — thiếu một, nên `table-fixed` chia lại bề
                ngang từ cột FB trở đi và cột Thao tác bị co.
              */}
              <colgroup>
                <col className="w-24" /><col className="w-24" />
                {xemLienHe && <><col className="w-32" /><col className="w-24" /></>}
                <col className="w-20" /><col className="w-28" /><col className="w-20" /><col className="w-20" /><col className="w-16" /><col className="w-16" /><col className="w-12" /><col className="w-12" />
                {coThaoTac && <col className="w-36" />}
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">UserName</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Họ tên</th>
                  {xemLienHe && (
                    <>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Email</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Phone</th>
                    </>
                  )}
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Tỉnh</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Địa chỉ</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Số TK</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">CSKH</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Tuổi nợ</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Nhận hàng</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">K.Buôn</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">FB</th>
                  {coThaoTac && <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(user => (
                  <tr key={user.Id} className="group transition-colors hover:bg-[#14264b]/5">
                    <td className="px-3 py-2.5 truncate" title={user.UserName}>
                      <span className="font-medium text-slate-800">{user.UserName}</span>
                    </td>
                    <td className="px-3 py-2.5 truncate text-slate-600" title={user.HoTen || ''}>{user.HoTen || <span className="text-slate-300">—</span>}</td>
                    {xemLienHe && (
                      <>
                        <td className="px-3 py-2.5 truncate text-slate-600" title={user.Email || ''}>{user.Email || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 truncate text-slate-600">{user.PhoneNumber || <span className="text-slate-300">—</span>}</td>
                      </>
                    )}
                    <td className="px-3 py-2.5 truncate text-slate-600" title={user.TinhThanh || ''}>{user.TinhThanh || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2.5 truncate text-slate-600" title={user.DiaChi || ''}>{user.DiaChi || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2.5 truncate text-slate-600">{user.SoTaiKhoan || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2.5 truncate text-slate-600" title={user.CSKHPhuTrach || ''}>
                      {user.CSKHPhuTrach ? tenCskh(user.CSKHPhuTrach) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600">
                      {user.TuoiNo === null || user.TuoiNo === undefined
                        ? <span className="text-slate-300" title="Chưa đặt — báo cáo Tuổi nợ đếm từ ngày ghi nợ">—</span>
                        : <span title="Số ngày được phép nợ">{user.TuoiNo}</span>}
                    </td>
                    <td className="px-3 py-2.5 truncate text-slate-600" title={user.HinhThucNhanHang || ''}>{user.HinhThucNhanHang || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.KhachBuon ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {user.KhachBuon ? 'Có' : 'Không'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {user.LinkTaiKhoanMang ? (
                        <a
                          href={user.LinkTaiKhoanMang}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center text-[#14264b] hover:text-[#3db8e4] transition-colors cursor-pointer"
                          title={user.LinkTaiKhoanMang}
                        >
                          <FiExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {/*
                      Hai thao tác không nguy hiểm để NGUYÊN BIỂU TƯỢNG, chỉ "Xóa"
                      còn chữ.
                      Bảng này 11 cột và dùng `table-fixed`, nên mỗi cột được
                      khoảng 182px (đo tại chỗ) — ba nút có chữ cần ~235px, chữ
                      xuống dòng và nút cuối bị cắt mất. Đặt `w-[250px]` cho cột
                      cũng không ăn thua: trình duyệt co lại cho vừa bề ngang bảng.
                      Chữ "Xóa" giữ lại vì đó là thao tác không lùi được — nó phải
                      đọc ra thành lời, không để người ta bấm nhầm một biểu tượng.
                    */}
                    {coThaoTac && (
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                          {xemChiTiet && (
                            <Link
                              href={`/admin/users/${user.Id}`}
                              title="Xem chi tiết tài khoản"
                              aria-label="Xem chi tiết tài khoản"
                              className="inline-flex items-center rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                            >
                              <FiEye className="h-4 w-4" />
                            </Link>
                          )}
                          {suaTaiKhoan && (
                            <button
                              onClick={() => moTrangThai(user.Id)}
                              disabled={dangMoTrangThai === user.Id}
                              title="Đổi trạng thái — đóng mã / khoá đăng nhập, dùng thay cho xoá"
                              aria-label="Đổi trạng thái tài khoản"
                              className="inline-flex items-center rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 cursor-pointer"
                            >
                              <FiLock className={`h-4 w-4 ${dangMoTrangThai === user.Id ? 'animate-pulse' : ''}`} />
                            </button>
                          )}
                          {xoaDuoc && (
                            <button
                              onClick={() => setDangXoa(user.Id)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                            >
                              <FiTrash2 className="h-4 w-4" />
                              Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dangXoa && (
        <HopXoaTaiKhoan
          id={dangXoa}
          dong={() => setDangXoa(null)}
          xong={() => {
            setDangXoa(null);
            fetchUsers(keyword, locCskh);
            getTongHopTrangThaiKhach()
              .then((t) => setCanDongMa({ canDongMa: t.canDongMa, canDongMaConNo: t.canDongMaConNo }))
              .catch(() => undefined);
          }}
        />
      )}

      {dangSuaTrangThai && (
        <HopDoiTrangThai
          khach={dangSuaTrangThai}
          dong={() => setDangSuaTrangThai(null)}
          xong={() => {
            setDangSuaTrangThai(null);
            // Nạp lại lời nhắc: vừa đóng một mã thì con số phải giảm theo.
            getTongHopTrangThaiKhach()
              .then((t) => setCanDongMa({ canDongMa: t.canDongMa, canDongMaConNo: t.canDongMaConNo }))
              .catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}
