'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getTrackingList, getTrackingCounts, deleteTracking, type TrackingListItem } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';
import { NutAnhTracking } from '@/app/components/tracking/xem-anh-tracking';

const TRACKING_STATUSES = ['Received', 'InTransit', 'InVN', 'VNTransit', 'Completed', 'Cancelled'];
const LIMIT = 20;

/**
 * DanhSachTracking Page - Tracking List
 * Converted from: UF/DanhSachTracking.aspx
 * Uses backend: tracking service
 */
export default function DanhSachTrackingPage() {
  const { user } = useAuthStore();
  const [trackings, setTrackings] = useState<TrackingListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['Received', 'InTransit', 'InVN', 'VNTransit', 'Completed']);
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedStatuses, setAppliedStatuses] = useState<string[]>(['Received', 'InTransit', 'InVN', 'VNTransit', 'Completed']);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  const loadStatusCounts = useCallback(async () => {
    if (!user?.username) return;
    try {
      const counts = await getTrackingCounts(user.username);
      setStatusCounts(counts || {});
    } catch (error) {
      console.error('Error loading tracking counts:', error);
    }
  }, [user?.username]);

  const loadTrackings = useCallback(async () => {
    if (!user?.username) return;
    setIsLoading(true);
    try {
      const response = await getTrackingList({
        username: user.username,
        search: appliedSearch,
        statuses: appliedStatuses.join(','),
        page,
        limit: LIMIT,
      });
      setTrackings(response.data || []);
      setTotal(response.total || 0);
    } catch (error) {
      console.error('Error loading trackings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, appliedStatuses, page, user?.username]);

  useEffect(() => {
    loadTrackings();
  }, [loadTrackings]);

  useEffect(() => {
    loadStatusCounts();
  }, [loadStatusCounts]);

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const handleSearch = () => {
    setAppliedSearch(search);
    setAppliedStatuses(selectedStatuses);
    if (page === 1) {
      return;
    }
    setPage(1);
  };

  const formatDate = (dateStr: unknown) => {
    if (!dateStr) return '';
    return new Date(String(dateStr)).toLocaleDateString('vi-VN');
  };

  const handleDelete = async (trackingId: number) => {
    if (!confirm('Bạn có chắc muốn xóa không?')) {
      return;
    }

    try {
      await deleteTracking(trackingId);
      await Promise.all([loadTrackings(), loadStatusCounts()]);
    } catch (error) {
      console.error('Error deleting tracking:', error);
      alert('Có lỗi khi xóa tracking');
    }
  };

  const escapeHtml = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const getField = (tracking: TrackingListItem, camelKey: string, pascalKey: string) =>
    tracking[camelKey] ?? tracking[pascalKey] ?? '';

  const handleExport = () => {
    const headers = [
      'Mã',
      'Tracking Number',
      'Order Number',
      'Ngày ĐH',
      'Nhà vận chuyển',
      'Quốc gia',
      'Lô hàng',
      'Tình trạng',
      'Ghi chú',
    ];
    const rows = trackings.map((tracking) => [
      getField(tracking, 'id', 'TrackingID'),
      getField(tracking, 'trackingNumber', 'TrackingNumber'),
      getField(tracking, 'orderNumber', 'OrderNumber'),
      formatDate(getField(tracking, 'ngayDatHang', 'NgayDatHang')),
      getField(tracking, 'tenNhaVanChuyen', 'TenNhaVanChuyen'),
      getField(tracking, 'tenQuocGia', 'TenQuocGia'),
      getField(tracking, 'tenLoHang', 'TenLoHang'),
      getField(tracking, 'tinhTrang', 'TinhTrang'),
      getField(tracking, 'ghiChu', 'GhiChu'),
    ]);
    const html = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <table border="1">
            <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
            <tbody>
              ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'DanhSachDatHang.xls';
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      <h2 className="text-2xl md:text-3xl font-bold mb-6 text-[#14264b]">Danh sách tracking</h2>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-[#14264b]/5 rounded-xl">
        <input
          type="text"
          placeholder="Tìm kiếm..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 w-full sm:w-40 focus:outline-none focus:ring-2 focus:ring-[#14264b] focus:border-[#14264b] transition-colors duration-150"
        />
        <div className="flex flex-wrap gap-2">
          {TRACKING_STATUSES.map((status) => (
            <label key={status} className="flex items-center gap-1.5 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-200 hover:border-[#14264b]/30 transition-colors duration-150">
              <input
                type="checkbox"
                checked={selectedStatuses.includes(status)}
                onChange={() => toggleStatus(status)}
                className="cursor-pointer accent-[#14264b]"
              />
              <span className="text-sm text-slate-700">{status}</span>
              <span className="text-sm text-slate-500">({statusCounts[status] || 0})</span>
            </label>
          ))}
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-[#14264b] text-white rounded-lg hover:bg-[#1f3a6d] cursor-pointer transition-colors duration-150 shadow-sm hover:shadow"
        >
          Xem
        </button>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-[#14264b]/5 hover:border-[#14264b]/30 cursor-pointer transition-colors duration-150"
        >
          Export to excel
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <svg className="w-8 h-8 animate-spin text-[#14264b] mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="mt-2 text-slate-600">Đang tải...</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-[#14264b]/20 shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#14264b]/10">
                  <th className="border-b border-[#14264b]/20 px-2 py-2.5 text-left text-[#14264b] font-semibold text-xs uppercase tracking-wide">Mã</th>
                  <th className="border-b border-[#14264b]/20 px-2 py-2.5 text-left text-[#14264b] font-semibold text-xs uppercase tracking-wide">Tracking Number</th>
                  <th className="border-b border-[#14264b]/20 px-2 py-2.5 text-left text-[#14264b] font-semibold text-xs uppercase tracking-wide">Order Number</th>
                  <th className="border-b border-[#14264b]/20 px-2 py-2.5 text-left text-[#14264b] font-semibold text-xs uppercase tracking-wide">Ngày ĐH</th>
                  <th className="border-b border-[#14264b]/20 px-2 py-2.5 text-left text-[#14264b] font-semibold text-xs uppercase tracking-wide">Nhà vận chuyển</th>
                  <th className="border-b border-[#14264b]/20 px-2 py-2.5 text-left text-[#14264b] font-semibold text-xs uppercase tracking-wide">Quốc gia</th>
                  <th className="border-b border-[#14264b]/20 px-2 py-2.5 text-left text-[#14264b] font-semibold text-xs uppercase tracking-wide">Lô hàng</th>
                  <th className="border-b border-[#14264b]/20 px-2 py-2.5 text-left text-[#14264b] font-semibold text-xs uppercase tracking-wide">Tình trạng</th>
                  <th className="border-b border-[#14264b]/20 px-2 py-2.5 text-left text-[#14264b] font-semibold text-xs uppercase tracking-wide">Ghi chú</th>
                  <th className="border-b border-[#14264b]/20 px-2 py-2.5 text-center text-[#14264b] font-semibold text-xs uppercase tracking-wide">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {trackings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-slate-500">
                      Không có dữ liệu
                    </td>
                  </tr>
                ) : (
                  trackings.map((tracking, index) => (
                    <tr
                      key={String(tracking.id || tracking.TrackingID)}
                      className={index % 2 === 0 ? 'bg-white' : 'bg-[#14264b]/5'}
                    >
                      <td className="border-b border-[#14264b]/10 px-2 py-2.5 text-[#14264b] font-medium">
                        {tracking.id || tracking.TrackingID}
                      </td>
                      <td className="border-b border-[#14264b]/10 px-2 py-2.5 text-slate-700 font-medium">
                        {tracking.trackingNumber || tracking.TrackingNumber}
                        <NutAnhTracking
                          trackingId={Number(tracking.id || tracking.TrackingID)}
                          soAnh={Number(tracking.SoAnh) || 0}
                          className="ml-1.5"
                        />
                      </td>
                      <td className="border-b border-[#14264b]/10 px-2 py-2.5 text-slate-600">
                        {tracking.orderNumber || tracking.OrderNumber}
                      </td>
                      <td className="border-b border-[#14264b]/10 px-2 py-2.5 text-slate-600">
                        {formatDate(tracking.ngayDatHang || tracking.NgayDatHang)}
                      </td>
                      <td className="border-b border-[#14264b]/10 px-2 py-2.5 text-slate-600">
                        {tracking.tenNhaVanChuyen || tracking.TenNhaVanChuyen}
                      </td>
                      <td className="border-b border-[#14264b]/10 px-2 py-2.5 text-slate-600">
                        {tracking.tenQuocGia || tracking.TenQuocGia}
                      </td>
                      <td className="border-b border-[#14264b]/10 px-2 py-2.5 text-slate-600">
                        {tracking.tenLoHang || tracking.TenLoHang}
                      </td>
                      <td className="border-b border-[#14264b]/10 px-2 py-2.5">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          (tracking.tinhTrang || tracking.TinhTrang) === 'Completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : (tracking.tinhTrang || tracking.TinhTrang) === 'Cancelled'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {tracking.tinhTrang || tracking.TinhTrang}
                        </span>
                      </td>
                      <td className="border-b border-[#14264b]/10 px-2 py-2.5 text-slate-500">
                        {tracking.ghiChu || tracking.GhiChu}
                      </td>
                      <td className="border-b border-[#14264b]/10 px-2 py-2.5">
                        <div className="flex gap-2 justify-center">
                          {(tracking.tinhTrang || tracking.TinhTrang) === 'Received' && (
                            <Link
                              href={`/sua-tracking?id=${tracking.id || tracking.TrackingID}`}
                              className="text-[#14264b] hover:text-[#0f1e38] cursor-pointer px-2 py-1 rounded hover:bg-[#14264b]/5 transition-colors duration-150"
                            >
                              Sửa
                            </Link>
                          )}
                          {(tracking.tinhTrang || tracking.TinhTrang) === 'Received' && (
                            <button
                              className="text-red-500 hover:text-red-700 cursor-pointer px-2 py-1 rounded hover:bg-red-50 transition-colors duration-150"
                              onClick={() => handleDelete(Number(tracking.id || tracking.TrackingID))}
                            >
                              Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-[#14264b]/5 hover:border-[#14264b]/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
              >
                Previous
              </button>
              <span className="px-4 py-1.5 text-slate-600">
                Trang <span className="font-medium text-[#14264b]">{page}</span> / {totalPages} (Tổng: {total})
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-[#14264b]/5 hover:border-[#14264b]/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-150"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
