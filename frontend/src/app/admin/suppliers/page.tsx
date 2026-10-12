'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  anNhaCungCap,
  layNhaCungCap,
  suaNhaCungCap,
  taoNhaCungCap,
  type NhaCungCap,
} from '@/lib/api';
import { useQuyen } from '@/hooks/use-quyen';

/**
 * DANH MỤC NHÀ CUNG CẤP.
 *
 * Bên khách chọn "danh mục NCC có trang quản lý" thay vì gõ tay, vì trang công
 * nợ phải trả gộp theo nhà cung cấp — gõ tay thì "Amazon", "amazon" và
 * "Amazon " thành ba nhà cung cấp và số phải trả chia ba.
 *
 * ẨN chứ không XOÁ: xoá một NCC là mọi đơn cũ trỏ vào nó mất tên trong báo cáo.
 * Nút ở đây vì vậy ghi "Ẩn", và báo luôn số đơn đang dùng nhà cung cấp đó.
 */
export default function TrangNhaCungCap() {
  const { xemGiaNcc, dangNap } = useQuyen();
  const qc = useQueryClient();

  const [hienDaAn, setHienDaAn] = useState(false);
  const [ten, setTen] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [dangSua, setDangSua] = useState<number | null>(null);
  const [loi, setLoi] = useState('');

  const { data: ds = [], isLoading } = useQuery({
    queryKey: ['nha-cung-cap', hienDaAn],
    queryFn: () => layNhaCungCap(hienDaAn),
    enabled: xemGiaNcc,
  });

  const xong = () => {
    setTen('');
    setGhiChu('');
    setDangSua(null);
    setLoi('');
    qc.invalidateQueries({ queryKey: ['nha-cung-cap'] });
  };

  const batLoi = (e: unknown) => {
    // Máy chủ trả câu nói được ("Đã có nhà cung cấp tên ..."), hiện nguyên văn.
    const m = e as { response?: { data?: { message?: string } }; message?: string };
    setLoi(m?.response?.data?.message || m?.message || 'Có lỗi khi lưu.');
  };

  const luu = useMutation({
    mutationFn: async () => {
      const body = { tenNhaCungCap: ten.trim(), ghiChu: ghiChu.trim() || null };
      return dangSua ? suaNhaCungCap(dangSua, body) : taoNhaCungCap(body);
    },
    onSuccess: xong,
    onError: batLoi,
  });

  const an = useMutation({
    mutationFn: (id: number) => anNhaCungCap(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['nha-cung-cap'] });
      if (r.soDonDangDung > 0) {
        setLoi(
          `Đã ẩn. Còn ${r.soDonDangDung} đơn đang dùng nhà cung cấp này — các đơn đó vẫn giữ nguyên tên trong công nợ phải trả.`,
        );
      }
    },
    onError: batLoi,
  });

  const hien = (n: NhaCungCap) => {
    suaNhaCungCap(n.NhaCungCapID, {
      tenNhaCungCap: n.TenNhaCungCap,
      ghiChu: n.GhiChu,
      daAn: false,
    })
      .then(() => qc.invalidateQueries({ queryKey: ['nha-cung-cap'] }))
      .catch(batLoi);
  };

  if (dangNap) {
    return <div className="p-6 text-sm text-gray-500">Đang kiểm quyền…</div>;
  }

  if (!xemGiaNcc) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-base font-semibold text-amber-900">Không có quyền</h2>
        <p className="mt-1 text-sm text-amber-800">
          Danh mục nhà cung cấp chỉ mở cho Mua hàng, Kế toán, Giám đốc và Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Nhà cung cấp</h1>
          <p className="text-xs text-gray-500">
            Dùng cho khối Nhà cung cấp trên từng đơn và trang công nợ phải trả.
          </p>
        </div>
        <Link
          href="/admin/debt-reports/supplier"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Công nợ phải trả NCC
        </Link>
      </div>

      {loi && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span>{loi}</span>
          <button type="button" onClick={() => setLoi('')} className="text-amber-500">
            ✕
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ten.trim()) {
            setLoi('Chưa nhập tên nhà cung cấp.');
            return;
          }
          luu.mutate();
        }}
        className="rounded-xl border border-gray-100 bg-white p-4"
      >
        <div className="grid gap-3 md:grid-cols-[2fr_3fr_auto]">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Tên nhà cung cấp
            </label>
            <input
              value={ten}
              onChange={(e) => setTen(e.target.value)}
              maxLength={200}
              placeholder="Amazon, Coupang, Gmarket…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#14264b] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Ghi chú</label>
            <input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              maxLength={500}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#14264b] focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={luu.isPending}
              className="rounded-lg bg-[#14264b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e3a6e] disabled:opacity-50"
            >
              {dangSua ? 'Lưu' : 'Thêm'}
            </button>
            {dangSua && (
              <button
                type="button"
                onClick={xong}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
              >
                Hủy
              </button>
            )}
          </div>
        </div>
      </form>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={hienDaAn}
          onChange={(e) => setHienDaAn(e.target.checked)}
        />
        Hiện cả nhà cung cấp đã ẩn
      </label>

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Tên</th>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Ghi chú</th>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Người tạo</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Việc</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Đang tải…
                </td>
              </tr>
            )}
            {!isLoading && ds.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Chưa có nhà cung cấp nào.
                </td>
              </tr>
            )}
            {ds.map((n) => (
              <tr key={n.NhaCungCapID} className={n.DaAn ? 'bg-gray-50 text-gray-400' : ''}>
                <td className="px-4 py-2.5 font-medium">
                  {n.TenNhaCungCap}
                  {n.DaAn && <span className="ml-2 text-xs">(đã ẩn)</span>}
                </td>
                <td className="px-4 py-2.5">{n.GhiChu || '-'}</td>
                <td className="px-4 py-2.5">{n.NguoiTao || '-'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setDangSua(n.NhaCungCapID);
                      setTen(n.TenNhaCungCap);
                      setGhiChu(n.GhiChu || '');
                      setLoi('');
                    }}
                    className="mr-3 text-cyan-700 underline"
                  >
                    Sửa
                  </button>
                  {n.DaAn ? (
                    <button
                      type="button"
                      onClick={() => hien(n)}
                      className="text-emerald-700 underline"
                    >
                      Hiện lại
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => an.mutate(n.NhaCungCapID)}
                      className="text-amber-700 underline"
                    >
                      Ẩn
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
