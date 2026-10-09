'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiPauseCircle,
  FiSearch,
  FiUserX,
} from 'react-icons/fi';
import {
  getTongHopTrangThaiKhach,
  getDanhSachTrangThaiKhach,
  type KhachKemTrangThai,
} from '@/lib/api';
import { HopDoiTrangThai, NGUONG_CON_NO } from '@/app/components/hop-doi-trang-thai';

/**
 * KHÁCH NGỪNG GIAO DỊCH — nơi CSKH xử lý việc đóng mã.
 *
 * VÌ SAO LÀ MÀN RIÊNG, không thêm cột vào `/admin/users`: màn đó đã 11 cột,
 * thêm "lần giao dịch cuối / số ngày nghỉ / dư nợ / trạng thái / nút đóng mã"
 * là 16 cột, không còn đọc được trên màn hình nào. Màn này cũng là một DANH
 * SÁCH VIỆC CẦN LÀM, khác hẳn mục đích tra cứu của màn kia.
 *
 * MẶC ĐỊNH mở ở nhóm "cần đóng mã" (quá 3 tháng, chưa ai chốt) và xếp mã VỪA
 * quá hạn lên đầu. Số đo 09/10/2026: 54 mã nghỉ 3–6 tháng, 92 mã 6–12 tháng,
 * 217 mã hơn một năm. Nếu xếp cũ-nhất-trước thì 217 mã gần như không gọi lại
 * được sẽ chặn hết phần còn kéo về được.
 *
 * TUYỆT ĐỐI không có nút xoá ở đây. Xoá tài khoản để lại hàng nghìn dòng công
 * nợ mồ côi (CONGNO trỏ tới khách bằng chuỗi UserName, không khoá ngoại) —
 * backend cũng đã chặn, đây là lớp thứ hai.
 */

const NHOM = [
  { gt: 'can-dong-ma', nhan: 'Cần đóng mã', moTa: 'Quá 3 tháng, chưa ai chốt' },
  { gt: 'nghi-3-6', nhan: 'Nghỉ 3–6 tháng', moTa: 'Mới chớm nghỉ, còn kéo về được' },
  { gt: 'nghi-6-12', nhan: 'Nghỉ 6–12 tháng', moTa: '' },
  { gt: 'nghi-tren-12', nhan: 'Nghỉ hơn 1 năm', moTa: '' },
  { gt: 'chua-giao-dich', nhan: 'Chưa từng giao dịch', moTa: 'Mở mã nhưng chưa phát sinh gì' },
  { gt: 'da-dong-ma', nhan: 'Đã đóng mã', moTa: 'Đã xử lý' },
  { gt: 'hoat-dong', nhan: 'Đang hoạt động', moTa: 'Có giao dịch trong 3 tháng' },
];

const NHAN_NHOM: Record<string, { chu: string; mau: string }> = {
  'hoat-dong': { chu: 'Đang hoạt động', mau: 'bg-emerald-50 text-emerald-700' },
  'nghi-3-6': { chu: 'Nghỉ 3–6 tháng', mau: 'bg-amber-50 text-amber-700' },
  'nghi-6-12': { chu: 'Nghỉ 6–12 tháng', mau: 'bg-orange-50 text-orange-700' },
  'nghi-tren-12': { chu: 'Nghỉ hơn 1 năm', mau: 'bg-red-50 text-red-700' },
  'chua-giao-dich': { chu: 'Chưa giao dịch', mau: 'bg-slate-100 text-slate-500' },
};

const NHAN_TRANG_THAI: Record<string, { chu: string; mau: string }> = {
  'hoat-dong': { chu: 'Vẫn hoạt động', mau: 'bg-emerald-100 text-emerald-800' },
  'tam-nghi': { chu: 'Tạm nghỉ', mau: 'bg-amber-100 text-amber-800' },
  'dong-ma': { chu: 'Đã đóng mã', mau: 'bg-slate-700 text-white' },
};

const tien = (v: number) => `${Math.round(v).toLocaleString('vi-VN')}đ`;
const ngay = (s: string | null) => (s ? new Date(s).toLocaleDateString('vi-VN') : '—');


export default function KhachNgungGiaoDichPage() {
  const qc = useQueryClient();
  const [nhom, setNhom] = useState('can-dong-ma');
  const [tuKhoaO, setTuKhoaO] = useState('');
  const [tuKhoa, setTuKhoa] = useState('');
  const [page, setPage] = useState(1);
  const [dangSua, setDangSua] = useState<KhachKemTrangThai | null>(null);

  const th = useQuery({ queryKey: ['tt-khach-tong-hop'], queryFn: getTongHopTrangThaiKhach });
  const ds = useQuery({
    queryKey: ['tt-khach-ds', nhom, tuKhoa, page],
    queryFn: () => getDanhSachTrangThaiKhach({ nhom, tuKhoa, page, limit: 50 }),
  });

  const doiNhom = (gt: string) => {
    setNhom(gt);
    setPage(1);
  };

  const t = th.data;
  const soTrang = ds.data ? Math.max(1, Math.ceil(ds.data.total / ds.data.limit)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
          <FiPauseCircle className="h-5 w-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Khách ngừng giao dịch</h1>
          <p className="text-sm text-slate-500">
            Mã khách quá 3 tháng không phát sinh giao dịch. Đóng mã để bỏ khỏi danh sách này — không
            xoá tài khoản.
          </p>
        </div>
      </div>

      {/* ---- Lời nhắc ---- */}
      {t && t.canDongMa > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">
                {t.canDongMa.toLocaleString('vi-VN')} mã khách quá 3 tháng chưa phát sinh giao dịch —
                cần CSKH xem và đóng mã.
              </p>
              {t.canDongMaConNo > 0 ? (
                <p className="mt-0.5">
                  Trong đó <strong>{t.canDongMaConNo} mã còn nợ</strong> tổng{' '}
                  <strong>{tien(t.tienConTreo)}</strong> — gọi thu trước khi đóng.
                </p>
              ) : (
                <p className="mt-0.5">Không mã nào còn nợ đáng kể.</p>
              )}
              {/*
                Nói rõ ngưỡng: trong 40 mã có số dư dương, 33 mã chỉ lệch dưới
                1.000đ do làm tròn cột float. Không ghi chú thì CSKH mở ra thấy
                "còn nợ 732đ" rồi mất lòng tin vào cả con số.
              */}
              <p className="mt-1 text-xs text-amber-700">
                Số dư dưới {tien(NGUONG_CON_NO)} không tính là còn nợ (chênh lệch làm tròn).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---- Các con số ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <OSo nhan="Tổng mã khách" giaTri={t?.tongKhach} dangTai={th.isLoading} />
        <OSo nhan="Đang hoạt động" giaTri={t?.dangHoatDong} mau="text-emerald-600" dangTai={th.isLoading} />
        <OSo nhan="Nghỉ 3–6 tháng" giaTri={t?.nghi3Den6} mau="text-amber-600" dangTai={th.isLoading} />
        <OSo nhan="Nghỉ 6–12 tháng" giaTri={t?.nghi6Den12} mau="text-orange-600" dangTai={th.isLoading} />
        <OSo nhan="Nghỉ hơn 1 năm" giaTri={t?.nghiTren12} mau="text-red-600" dangTai={th.isLoading} />
      </div>

      {/* ---- Lọc ---- */}
      <div className="flex flex-wrap items-center gap-2">
        {NHOM.map((n) => (
          <button
            key={n.gt}
            onClick={() => doiNhom(n.gt)}
            title={n.moTa || undefined}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              nhom === n.gt
                ? 'bg-[#14264b] text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {n.nhan}
          </button>
        ))}
        <div className="relative ml-auto">
          <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={tuKhoaO}
            onChange={(e) => setTuKhoaO(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setTuKhoa(tuKhoaO);
                setPage(1);
              }
            }}
            placeholder="Mã khách, họ tên, điện thoại…"
            className="w-72 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-[#14264b] focus:outline-none"
          />
        </div>
      </div>

      {/* ---- Bảng ---- */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {ds.isLoading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-6 py-4">
                <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
                <div className="ml-auto h-4 w-32 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : !ds.data || ds.data.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FiCheckCircle className="mb-3 h-10 w-10 text-emerald-400" />
            <p className="text-sm font-medium text-slate-600">Không có mã nào trong nhóm này</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5">Mã khách</th>
                  <th className="px-3 py-2.5">Họ tên</th>
                  <th className="px-3 py-2.5">Liên hệ</th>
                  <th className="px-3 py-2.5">Giao dịch cuối</th>
                  <th className="px-3 py-2.5 text-right">Nghỉ</th>
                  <th className="px-3 py-2.5 text-right">Dư nợ</th>
                  <th className="px-3 py-2.5">Tình trạng</th>
                  <th className="px-3 py-2.5">CSKH chốt</th>
                  <th className="px-3 py-2.5 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ds.data.data.map((k) => (
                  <tr key={k.id} className="transition-colors hover:bg-[#14264b]/5">
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {/* Mã khách LÀ liên kết sang chi tiết tài khoản — gộp vào
                          đây thay vì để thêm một cột biểu tượng, bảng 9 cột đã
                          tràn ngang trên màn 1440px. */}
                      <Link
                        href={`/admin/users/${k.id}`}
                        className="font-medium text-[#14264b] hover:underline cursor-pointer"
                      >
                        {k.userName}
                      </Link>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-slate-600" title={k.hoTen || ''}>
                      {k.hoTen || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="max-w-[190px] truncate px-3 py-2.5 text-slate-600">
                      {k.phone || k.email || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                      {ngay(k.lanGiaoDichCuoi)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-600">
                      {k.soNgayNghi === null ? '—' : `${k.soNgayNghi} ngày`}
                    </td>
                    {/*
                      Chỉ tô đỏ khi nợ THẬT. Nợ 732đ tô đỏ thì cả bảng đỏ rực mà
                      không có việc gì phải làm.
                    */}
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 text-right ${
                        k.duNo >= NGUONG_CON_NO
                          ? 'font-semibold text-red-600'
                          : k.duNo <= -NGUONG_CON_NO
                            ? 'text-emerald-600'
                            : 'text-slate-400'
                      }`}
                      title={k.duNo < 0 ? 'Khách đã trả trước' : undefined}
                    >
                      {Math.abs(k.duNo) < NGUONG_CON_NO ? '0đ' : tien(k.duNo)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          NHAN_NHOM[k.nhomTuDong]?.mau ?? 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {NHAN_NHOM[k.nhomTuDong]?.chu ?? k.nhomTuDong}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {k.trangThai ? (
                        <div className="space-y-0.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              NHAN_TRANG_THAI[k.trangThai]?.mau ?? 'bg-slate-100'
                            }`}
                          >
                            {NHAN_TRANG_THAI[k.trangThai]?.chu ?? k.trangThai}
                          </span>
                          <p className="text-xs text-slate-400">
                            {k.nguoiDoiTrangThai} · {ngay(k.ngayDoiTrangThai)}
                          </p>
                          {k.lyDoTrangThai && (
                            <p className="max-w-[220px] truncate text-xs text-slate-500" title={k.lyDoTrangThai}>
                              {k.lyDoTrangThai}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-slate-400">
                          <FiClock className="h-3 w-3" /> chưa xét
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">
                      <button
                        onClick={() => setDangSua(k)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#14264b] transition-colors hover:bg-[#14264b]/10 cursor-pointer"
                      >
                        <FiUserX className="h-4 w-4" />
                        Đổi trạng thái
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ds.data && ds.data.total > ds.data.limit && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {(page - 1) * ds.data.limit + 1}–{Math.min(page * ds.data.limit, ds.data.total)} trên{' '}
            {ds.data.total.toLocaleString('vi-VN')} mã
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 cursor-pointer"
            >
              Trước
            </button>
            <span className="px-2 py-1.5">
              {page}/{soTrang}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(soTrang, p + 1))}
              disabled={page >= soTrang}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 cursor-pointer"
            >
              Sau
            </button>
          </div>
        </div>
      )}

      {dangSua && (
        <HopDoiTrangThai
          khach={dangSua}
          dong={() => setDangSua(null)}
          xong={() => {
            setDangSua(null);
            qc.invalidateQueries({ queryKey: ['tt-khach-ds'] });
            qc.invalidateQueries({ queryKey: ['tt-khach-tong-hop'] });
          }}
        />
      )}
    </div>
  );
}

function OSo({
  nhan,
  giaTri,
  mau = 'text-slate-800',
  dangTai,
}: {
  nhan: string;
  giaTri?: number;
  mau?: string;
  dangTai?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{nhan}</p>
      <p className={`mt-1 text-xl font-bold ${mau}`}>
        {dangTai ? '…' : (giaTri ?? 0).toLocaleString('vi-VN')}
      </p>
    </div>
  );
}
