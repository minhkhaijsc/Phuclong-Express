'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FiArrowLeft, FiDownload } from 'react-icons/fi';
import {
  getSanLuongKhach,
  getSanLuongKhachTuyen,
  type DongSanLuongKhach,
} from '@/lib/api';
import { useQuyen } from '@/hooks/use-quyen';
import { DateRangeFilter } from '../components/date-range-filter';

/**
 * BÁO CÁO SẢN LƯỢNG KHÁCH HÀNG — yêu cầu bên khách 15/10/2026.
 *
 * Một dòng là một cặp (khách × tuyến): mã khách, tuyến, kg, và doanh số tách
 * làm hai cột. Hai cột tiền là hai thứ khác nhau, không gộp:
 *
 *   • Cước cân kg — tiền của chính những dòng cân tạo ra số kg ở cùng dòng.
 *     Chia cột tiền này cho cột kg là ra đơn giá đ/kg, nên để riêng thì bảng
 *     tự kiểm được: đơn giá lệch hẳn là biết dòng đó có gì sai.
 *   • Phí mua hộ — tiền hàng mua giúp khách, đã trừ đơn huỷ (số âm giữ nguyên).
 *
 * Quyền: nằm trong miền `dashboard`, tức Admin, Trưởng phòng và Giám đốc —
 * giống hệt trang Dashboard thống kê mà nó nằm dưới.
 */

const getDefaultRange = () => {
  const now = new Date();
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return {
    fromDate: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
    toDate: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

const tien = (v: number) => (v ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
const can = (v: number) =>
  (v ?? 0).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

/** Đơn giá đ/kg — chỉ hiện khi có cả hai vế, không chia cho 0. */
const donGia = (d: DongSanLuongKhach): string => (d.kg > 0 ? tien(d.cuoc / d.kg) : '—');

type Sap = 'tong' | 'kg' | 'cuoc' | 'phiMua';

export default function TrangSanLuongKhach() {
  const { co, dangNap } = useQuyen();
  const xemDuoc = co('dashboard.xem');

  const [draft, setDraft] = useState(getDefaultRange);
  const [applied, setApplied] = useState(draft);
  const [tuyenId, setTuyenId] = useState(0);
  const [khachGo, setKhachGo] = useState('');
  const [khach, setKhach] = useState('');
  const [sap, setSap] = useState<Sap>('tong');

  const { data: tuyens = [] } = useQuery({
    queryKey: ['san-luong-khach-tuyen', applied.fromDate, applied.toDate],
    queryFn: () => getSanLuongKhachTuyen(applied.fromDate, applied.toDate),
    enabled: xemDuoc,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['san-luong-khach', applied.fromDate, applied.toDate, tuyenId, khach],
    queryFn: () => getSanLuongKhach(applied.fromDate, applied.toDate, tuyenId, khach || undefined),
    enabled: xemDuoc,
  });

  /**
   * Sắp xếp ở trình duyệt, không gọi lại máy chủ: cả bảng đã nằm sẵn trong tay
   * (khoảng 200 dòng cho một tháng), gọi lại chỉ tốn một vòng chờ.
   */
  const dong = useMemo(() => {
    const ds = [...(data?.dong ?? [])];
    ds.sort((a, b) => b[sap] - a[sap]);
    return ds;
  }, [data, sap]);

  const apDung = () => setApplied(draft);

  const xuatExcel = async () => {
    const { downloadDataAsExcel } = await import('@/lib/excel-download');
    const rows: (string | number | null)[][] = [
      [
        'Mã khách hàng',
        'Tên khách hàng',
        'CSKH',
        'Mã CSKH',
        'Tuyến',
        'Sản lượng (kg)',
        'Cước cân (VNĐ)',
        'Phí mua hộ (VNĐ)',
        'Tổng doanh số (VNĐ)',
        'Đơn giá (đ/kg)',
      ],
      ...dong.map((d) => [
        d.maKh,
        d.tenKhach || '',
        d.tenCskh || d.cskh || '',
        d.cskh || '',
        d.tuyen,
        d.kg,
        d.cuoc,
        d.phiMua,
        d.tong,
        d.kg > 0 ? Math.round(d.cuoc / d.kg) : null,
      ]),
    ];
    const ky = `${applied.fromDate}-${applied.toDate}`.replace(/\//g, '');
    downloadDataAsExcel(rows, `SanLuongKhachHang_${ky}.xlsx`, undefined, undefined, undefined, 'Sản lượng khách hàng');
  };

  if (dangNap) {
    return <div className="p-6 text-sm text-gray-500">Đang kiểm quyền…</div>;
  }

  if (!xemDuoc) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-base font-semibold text-amber-900">Không có quyền</h2>
        <p className="mt-1 text-sm text-amber-800">
          Báo cáo này nằm trong Dashboard, chỉ mở cho Admin, Kế toán, MKT, Trưởng phòng và Giám đốc.
        </p>
      </div>
    );
  }

  const tong = data?.tong;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href="/admin/dashboard"
            className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <FiArrowLeft size={12} /> Dashboard thống kê
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Báo cáo sản lượng khách hàng</h1>
          <p className="text-xs text-gray-500">
            Mỗi dòng là một khách trên một tuyến. Doanh số tách riêng cước cân và phí mua hộ.
          </p>
        </div>
        <button
          type="button"
          onClick={xuatExcel}
          disabled={!dong.length}
          className="inline-flex items-center gap-2 rounded-lg bg-[#14264b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e3a6e] disabled:opacity-50"
        >
          <FiDownload size={14} /> Xuất Excel
        </button>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <DateRangeFilter
            fromDate={draft.fromDate}
            toDate={draft.toDate}
            onChange={setDraft}
            onSearch={apDung}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tuyến</label>
            <select
              value={tuyenId}
              onChange={(e) => setTuyenId(Number(e.target.value))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#14264b] focus:outline-none"
            >
              <option value={0}>— Tất cả tuyến —</option>
              {tuyens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.ten}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Mã khách hàng</label>
            <input
              value={khachGo}
              onChange={(e) => setKhachGo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setKhach(khachGo.trim())}
              placeholder="HP2857…"
              className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#14264b] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setKhach(khachGo.trim());
              apDung();
            }}
            className="rounded-lg bg-[#14264b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e3a6e]"
          >
            Xem
          </button>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Sắp theo</label>
            <select
              value={sap}
              onChange={(e) => setSap(e.target.value as Sap)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#14264b] focus:outline-none"
            >
              <option value="tong">Tổng doanh số</option>
              <option value="kg">Sản lượng</option>
              <option value="cuoc">Cước cân</option>
              <option value="phiMua">Phí mua hộ</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <The nhan="Sản lượng" so={`${can(tong?.kg ?? 0)} kg`} phu={`${tong?.soKhach ?? 0} khách · ${tong?.soDong ?? 0} dòng`} />
        <The nhan="Cước cân" so={tien(tong?.cuoc ?? 0)} phu="VNĐ" />
        <The nhan="Phí mua hộ" so={tien(tong?.phiMua ?? 0)} phu="VNĐ · đã trừ đơn huỷ" />
        <The nhan="Tổng doanh số" so={tien(tong?.tong ?? 0)} phu="VNĐ" dam />
      </div>

      {/*
        Nói thật về độ phủ ngay trên bảng. Giấu đi thì người đọc tưởng con số là
        tuyệt đối, mà sản lượng vốn lần ra từ ô ghi chú nên không bao giờ phủ 100%.
      */}
      {!!data && (data.canhBao.dongThieuKg > 0 || data.canhBao.kgChuaRoTuyen > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {data.canhBao.dongThieuKg > 0 && (
            <span>
              {data.canhBao.dongThieuKg} dòng cân không đọc được số kg (tiền vẫn tính đủ, chỉ thiếu
              kg).{' '}
            </span>
          )}
          {data.canhBao.kgChuaRoTuyen > 0 && (
            <span>{can(data.canhBao.kgChuaRoTuyen)} kg chưa tra được tuyến, xếp ở dòng “Chưa rõ tuyến”.</span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Mã khách hàng</th>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Tên khách hàng</th>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-500">CSKH</th>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Tuyến</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Sản lượng (kg)</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Cước cân (VNĐ)</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Phí mua hộ (VNĐ)</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Tổng doanh số (VNĐ)</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Đơn giá (đ/kg)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  Đang tải…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-red-500">
                  Không lấy được số liệu. Thử lại hoặc thu hẹp khoảng ngày.
                </td>
              </tr>
            )}
            {!isLoading && !isError && dong.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  Không có dữ liệu trong khoảng đã chọn.
                </td>
              </tr>
            )}
            {dong.map((d) => (
              <tr key={`${d.maKh}-${d.tuyenId ?? 'x'}`} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{d.maKh}</td>
                <td className="px-4 py-2.5 text-gray-600">{d.tenKhach || '—'}</td>
                <td className="px-4 py-2.5 text-gray-600" title={d.cskh || ''}>
                  {d.cskh ? d.tenCskh || d.cskh : <span className="text-gray-300">Chưa gán</span>}
                </td>
                <td className="px-4 py-2.5">
                  {d.tuyenId === null ? (
                    <span className="text-amber-700">{d.tuyen}</span>
                  ) : (
                    d.tuyen
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{can(d.kg)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{tien(d.cuoc)}</td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums ${d.phiMua < 0 ? 'text-red-600' : ''}`}
                >
                  {tien(d.phiMua)}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{tien(d.tong)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{donGia(d)}</td>
              </tr>
            ))}
          </tbody>
          {dong.length > 0 && (
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td className="px-4 py-2.5" colSpan={4}>
                  Tổng cộng
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{can(tong?.kg ?? 0)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{tien(tong?.cuoc ?? 0)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{tien(tong?.phiMua ?? 0)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{tien(tong?.tong ?? 0)}</td>
                <td className="px-4 py-2.5" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function The({ nhan, so, phu, dam }: { nhan: string; so: string; phu?: string; dam?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${dam ? 'border-[#14264b]' : 'border-gray-100'}`}>
      <div className="text-xs font-medium text-gray-500">{nhan}</div>
      <div className={`mt-1 text-xl font-bold ${dam ? 'text-[#14264b]' : 'text-gray-900'}`}>{so}</div>
      {phu && <div className="mt-0.5 text-xs text-gray-400">{phu}</div>}
    </div>
  );
}
