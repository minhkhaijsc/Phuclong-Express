'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { useAuth } from '@/hooks/use-auth-context';
import {
  FiPlus, FiCalendar, FiUser, FiPackage,
  FiTrash2, FiCheck, FiX, FiChevronLeft, FiChevronRight,
  FiEye, FiEdit2, FiUpload, FiCamera,
} from 'react-icons/fi';
import { NutAnhTracking } from '@/app/components/tracking/xem-anh-tracking';

interface Tracking {
  TrackingID: number;
  UserName: string;
  TrackingNumber: string;
  OrderNumber: string;
  NgayDatHang: string;
  TenLoHang: string;
  NhaVanChuyenID: number;
  QuocGiaID: number;
  TenQuocGia: string;
  TinhTrang: string;
  GhiChu: string;
  Kien: string;
  Mawb: string;
  Hawb: string;
  SoAnh?: number;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface TrackingCounts {
  Received: number;
  InTransit: number;
  InVN: number;
  VNTransit: number;
  Completed: number;
  Cancelled: number;
}

const getTracking = async (params: Record<string, string | number>) => {
  const response = await apiClient.get<PaginatedResponse<Tracking>>('/tracking', { params });
  return response.data;
};

const getTrackingCounts = async () => {
  const response = await apiClient.get<TrackingCounts>('/tracking/counts');
  return response.data;
};

const formatDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('vi-VN');
};

// Status config: label, badge classes, card classes
const statusConfig: Record<string, { badge: string; card: string; dot: string; ring: string }> = {
  Received:  { badge: 'bg-[#14264b]/10 text-[#14264b] border border-[#14264b]/20',   card: 'border-l-4 border-[#14264b]/40 bg-[#14264b]/5',   dot: 'bg-[#14264b]/40', ring: 'ring-[#14264b]' },
  InTransit: { badge: 'bg-amber-50 text-amber-700 border border-amber-200', card: 'border-l-4 border-amber-400 bg-amber-50', dot: 'bg-amber-400', ring: 'ring-amber-400' },
  InVN:      { badge: 'bg-orange-50 text-orange-700 border border-orange-200', card: 'border-l-4 border-orange-400 bg-orange-50', dot: 'bg-orange-400', ring: 'ring-orange-400' },
  VNTransit: { badge: 'bg-purple-50 text-purple-700 border border-purple-200', card: 'border-l-4 border-violet-400 bg-violet-50', dot: 'bg-violet-400', ring: 'ring-violet-400' },
  Completed: { badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200', card: 'border-l-4 border-emerald-400 bg-emerald-50', dot: 'bg-emerald-400', ring: 'ring-emerald-400' },
  Cancelled: { badge: 'bg-rose-50 text-rose-700 border border-rose-200',   card: 'border-l-4 border-rose-400 bg-rose-50',   dot: 'bg-rose-400', ring: 'ring-rose-400' },
};

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 focus:outline-none transition-all placeholder:text-slate-400 bg-white';

export default function TrackingPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const nguoiTao = user?.username || '';

  const [filters, setFilters] = useState({
    page: 1, limit: 200, username: '', statuses: 'Received,InTransit,InVN,VNTransit',
    search: '', trackingNumber: '', startDate: '', endDate: '', quocGiaId: 0,
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tracking', filters],
    queryFn: () => getTracking(filters),
  });

  const { data: counts } = useQuery({
    queryKey: ['tracking-counts'],
    queryFn: getTrackingCounts,
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiClient.post('/tracking/mass-delete', { ids, nguoiTao }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracking'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-counts'] });
      setSelectedIds([]);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (data: { ids: number[]; tinhTrang: string }) =>
      apiClient.post('/tracking/mass-status', { ...data, nguoiTao }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracking'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-counts'] });
      setSelectedIds([]);
    },
  });

  const completeAllMutation = useMutation({
    mutationFn: () => apiClient.post('/tracking/mass-complete-all', { query: filters, nguoiTao }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracking'] });
      queryClient.invalidateQueries({ queryKey: ['tracking-counts'] });
    },
  });

  const handleFilterChange = (key: string, value: string | number) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  const handlePageChange = (newPage: number) =>
    setFilters((prev) => ({ ...prev, page: newPage }));

  const totalRows = data?.data.length ?? 0;
  const allSelected = totalRows > 0 && selectedIds.length === totalRows;
  const someSelected = selectedIds.length > 0 && selectedIds.length < totalRows;

  const handleSelectAll = () =>
    setSelectedIds(allSelected ? [] : data?.data.map((t) => t.TrackingID) ?? []);
  const handleSelect = (id: number) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);

  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  // Initialize flatpickr for date range inputs
  useEffect(() => {
    if (!startDateRef.current || !endDateRef.current) return;
    const fpStart = flatpickr(startDateRef.current, {
      dateFormat: 'd/m/Y',
      onChange: (dates) => {
        if (dates[0]) {
          const d = dates[0];
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          handleFilterChange('startDate', `${yyyy}-${mm}-${dd}`);
        } else {
          handleFilterChange('startDate', '');
        }
      },
    });
    const fpEnd = flatpickr(endDateRef.current, {
      dateFormat: 'd/m/Y',
      onChange: (dates) => {
        if (dates[0]) {
          const d = dates[0];
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          handleFilterChange('endDate', `${yyyy}-${mm}-${dd}`);
        } else {
          handleFilterChange('endDate', '');
        }
      },
    });
    return () => { fpStart.destroy(); fpEnd.destroy(); };
  }, []);

  // Sync indeterminate state on the header checkbox (can't be set via JSX prop)
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Danh sách Tracking</h1>
          <p className="text-sm text-slate-500 mt-0.5">Quản lý toàn bộ mã tracking vận chuyển</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/tracking/import"
            className="flex items-center gap-2 border border-[#14264b]/20 bg-white text-[#14264b] px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-[#14264b]/5 transition-colors cursor-pointer"
          >
            <FiUpload className="h-4 w-4" />
            Thêm bằng Excel
          </Link>
          <Link
            href="/admin/tracking/import?m=1"
            className="flex items-center gap-2 border border-rose-200 bg-white text-rose-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-rose-50 transition-colors cursor-pointer"
          >
            <FiUpload className="h-4 w-4" />
            Sửa bằng Excel
          </Link>
          <Link
            href="/admin/tracking/anh"
            className="flex items-center gap-2 border border-[#eb7325]/30 bg-white text-[#c25a14] px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-orange-50 transition-colors cursor-pointer"
          >
            <FiCamera className="h-4 w-4" />
            Up ảnh
          </Link>
          <Link
            href="/admin/tracking/new"
            className="flex items-center gap-2 bg-[#14264b] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-cyan-400 transition-colors cursor-pointer shadow-sm shadow-cyan-300/40"
          >
            <FiPlus className="h-4 w-4" />
            Thêm mới tracking
          </Link>
        </div>
      </div>

      {/* Status count cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {Object.entries(counts || {}).map(([status, count]) => {
          const cfg = statusConfig[status];
          const selectedStatuses = filters.statuses ? filters.statuses.split(',') : [];
          const isActive = selectedStatuses.includes(status);
          const toggleStatus = () => {
            const next = isActive
              ? selectedStatuses.filter((s) => s !== status)
              : [...selectedStatuses, status];
            handleFilterChange('statuses', next.join(','));
          };
          return (
            <button
              key={status}
              onClick={toggleStatus}
              className={`rounded-xl px-3 py-3 text-left transition-all cursor-pointer ${cfg?.card || 'bg-slate-50 border-l-4 border-slate-300'} ${isActive ? `ring-2 ring-offset-2 shadow-md ${cfg?.ring || 'ring-slate-400'}` : 'opacity-70 hover:opacity-100 hover:shadow-sm'}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`h-2 w-2 rounded-full ${cfg?.dot || 'bg-slate-400'}`} />
                <span className="text-xs font-semibold text-slate-600 truncate">{status}</span>
              </div>
              <span className="text-lg font-bold text-slate-800">{count as number}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" value={filters.username} onChange={(e) => handleFilterChange('username', e.target.value)}
              className={`${inputCls} pl-9`} placeholder="Tìm theo username" />
          </div>
          <div className="relative">
            <FiPackage className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" value={filters.trackingNumber} onChange={(e) => handleFilterChange('trackingNumber', e.target.value)}
              className={`${inputCls} pl-9`} placeholder="Tìm theo tracking" />
          </div>
          <div className="relative">
            <FiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input ref={startDateRef} type="text" readOnly
              className={`${inputCls} pl-9`} placeholder="Từ ngày (dd/mm/yyyy)" />
          </div>
          <div className="relative">
            <FiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input ref={endDateRef} type="text" readOnly
              className={`${inputCls} pl-9`} placeholder="Đến ngày (dd/mm/yyyy)" />
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm shadow-sm w-full md:w-auto">
            <span className="font-medium text-slate-300 mr-1">Đã chọn: <span className="text-white">{selectedIds.length}</span></span>
            <Link href={`/admin/tracking/ngay-lo-hang?id=${selectedIds.join(',')}`}
              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded-lg text-xs font-medium transition-colors cursor-pointer">Lô hàng</Link>
            {(['Received','InTransit','InVN','VNTransit','Completed','Cancelled'] as const).map((s) => (
              <button key={s} onClick={() => statusMutation.mutate({ ids: selectedIds, tinhTrang: s })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${statusConfig[s]?.badge}`}>
                {s}
              </button>
            ))}
            <button onClick={() => deleteMutation.mutate(selectedIds)}
              className="flex items-center gap-1 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 rounded-lg text-xs font-medium text-white transition-colors cursor-pointer">
              <FiTrash2 className="h-3.5 w-3.5" /> Xóa
            </button>
          </div>
        )}
        <button
          onClick={() => { if (confirm('Xác nhận Complete tất cả tracking theo bộ lọc hiện tại?')) completeAllMutation.mutate(); }}
          disabled={completeAllMutation.isPending}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#14264b] hover:bg-cyan-400 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 shadow-sm shadow-cyan-300/40"
        >
          <FiCheck className="h-4 w-4" />
          {completeAllMutation.isPending ? 'Đang xử lý...' : 'Complete All (theo filter)'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 border-2 border-[#14264b] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-rose-500">
            <FiX className="h-5 w-5" />
            <span>Lỗi tải dữ liệu</span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 w-10">
                      <input ref={selectAllRef} type="checkbox" checked={allSelected}
                        onChange={handleSelectAll}
                        className="h-4 w-4 rounded border-slate-300 accent-[#14264b] cursor-pointer" />
                    </th>
                    {['ID', 'Username', 'Tracking Number', 'Order Number', 'Lô hàng', 'Ngày đặt', 'Tình trạng', 'Thao tác'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data?.data.map((tracking) => (
                    <tr key={tracking.TrackingID} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.includes(tracking.TrackingID)} onChange={() => handleSelect(tracking.TrackingID)}
                          className="h-4 w-4 rounded border-slate-300 accent-[#14264b] cursor-pointer" />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-500">{tracking.TrackingID}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{tracking.UserName}</td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-700 whitespace-nowrap">
                        {tracking.TrackingNumber}
                        <NutAnhTracking trackingId={tracking.TrackingID} soAnh={tracking.SoAnh} className="ml-2" />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{tracking.OrderNumber || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{tracking.TenLoHang || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(tracking.NgayDatHang)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[tracking.TinhTrang]?.badge || 'bg-slate-100 text-slate-600'}`}>
                          {tracking.TinhTrang}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/admin/tracking/${tracking.TrackingID}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-50 text-cyan-700 hover:bg-cyan-100 text-xs font-medium transition-colors cursor-pointer border border-cyan-100">
                            <FiEye className="h-3.5 w-3.5" />
                            Chi tiết
                          </Link>
                          <Link href={`/admin/tracking/${tracking.TrackingID}/edit`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#14264b]/5 text-[#14264b] hover:bg-[#14264b]/10 text-xs font-medium transition-colors cursor-pointer border border-[#14264b]/10">
                            <FiEdit2 className="h-3.5 w-3.5" />
                            Sửa
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 flex items-center justify-between border-t border-slate-100 bg-slate-50/50">
                <span className="text-sm text-slate-500">
                  Trang <strong className="text-slate-700">{data?.page}</strong> / {totalPages}
                  <span className="ml-2 text-slate-400">({data?.total} bản ghi)</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handlePageChange(filters.page - 1)} disabled={filters.page === 1}
                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer">
                    <FiChevronLeft className="h-4 w-4" /> Trước
                  </button>
                  <button onClick={() => handlePageChange(filters.page + 1)} disabled={filters.page >= totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer">
                    Sau <FiChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
