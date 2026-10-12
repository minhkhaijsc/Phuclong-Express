'use client';

import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { getOrders, getStatusCounts, massDelete, massComplete, massReceived, massShipped, getUsernames, getQuocGia } from '@/lib/api';
import { useAuthStore } from '@/hooks/use-auth';
import { Order, QueryParams } from '@/types/order';
import { OrderStatus, OrderStatusConfig } from '@/types/order-status';
import EditOrderDetailModal from './edit-order-detail-modal';
import { bangXuatDonHang, tenTepXuatDonHang } from './xuat-don-hang';
import { useQuyen } from '@/hooks/use-quyen';

// Note Modal Component
function NoteModal({
  open,
  orderIds,
  onClose,
}: {
  open: boolean;
  orderIds: number[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [ghiChu, setGhiChu] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async () => {
    if (!ghiChu.trim()) {
      setError('Vui lòng nhập ghi chú');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const { updateOrderNoteBatch } = await import('@/lib/api');
      await updateOrderNoteBatch(orderIds, ghiChu);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
      setGhiChu('');
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-200">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl transition-transform duration-200">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Bổ sung ghi chú {orderIds.length > 1 && `(${orderIds.length} đơn)`}
        </h3>
        {error && <div className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{error}</div>}
        <div>
          <textarea
            value={ghiChu}
            onChange={(e) => { setGhiChu(e.target.value); setError(''); }}
            rows={4}
            className="w-full rounded-lg border border-gray-400 bg-white px-3 py-2 text-gray-900 focus:border-[#14264b] focus:outline-none"
            placeholder="Nhập ghi chú..."
            autoFocus
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Return Date Modal Component
function ReturnDateModal({
  open,
  orderIds,
  onClose,
}: {
  open: boolean;
  orderIds: number[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const completeDateInputRef = useRef<HTMLInputElement>(null);
  const [ngayVeVn, setNgayVeVn] = useState('');
  const [boSungGhiChu, setBoSungGhiChu] = useState('');
  const [chuyenVeCompleted, setChuyenVeCompleted] = useState(false);
  const [ngayHoanThanh, setNgayHoanThanh] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Helper: format Date → dd/mm/yyyy
  const formatDmy = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  // Reset form state mỗi khi modal mở để tránh giữ lại dữ liệu lần trước
  useEffect(() => {
    if (!open) return;
    setNgayVeVn('');
    setBoSungGhiChu('');
    setChuyenVeCompleted(false);
    setNgayHoanThanh('');
    setError('');
  }, [open]);

  // Initialize flatpickr for "Ngày về VN" when modal opens
  useEffect(() => {
    if (!open || !dateInputRef.current) return;
    // Luôn mở popup với ô trống: xóa giá trị cũ và không set defaultDate.
    dateInputRef.current.value = '';
    const fp = flatpickr(dateInputRef.current, {
      dateFormat: 'd/m/Y',
      onChange: (dates) => {
        if (dates[0]) {
          setNgayVeVn(formatDmy(dates[0]));
          setError('');
        }
      },
    });
    return () => { fp.destroy(); };
  }, [open]);

  // Initialize flatpickr for "Ngày hoàn thành" — chỉ khi tick "Chuyển sang Completed"
  // Default = hôm nay (giống SP_CapNhat_MassComplete: ISNULL(@NgayHoanThanh, GETDATE()))
  useEffect(() => {
    if (!open || !chuyenVeCompleted || !completeDateInputRef.current) return;
    const today = new Date();
    if (!ngayHoanThanh) setNgayHoanThanh(formatDmy(today));
    const fp = flatpickr(completeDateInputRef.current, {
      dateFormat: 'd/m/Y',
      defaultDate: ngayHoanThanh ? undefined : today,
      onChange: (dates) => {
        if (dates[0]) {
          setNgayHoanThanh(formatDmy(dates[0]));
          setError('');
        }
      },
    });
    return () => { fp.destroy(); };
  }, [open, chuyenVeCompleted]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!ngayVeVn) {
      setError('Vui lòng chọn ngày về VN');
      return;
    }
    if (chuyenVeCompleted && !ngayHoanThanh) {
      setError('Vui lòng chọn ngày hoàn thành');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const { updateOrderReturnDate } = await import('@/lib/api');
      await Promise.all(orderIds.map((id) =>
        updateOrderReturnDate(id, {
          ngayVeVn,
          boSungGhiChu,
          chuyenVeCompleted,
          ngayHoanThanh: chuyenVeCompleted ? ngayHoanThanh : undefined,
          username: '',
        })
      ));
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-200">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl transition-transform duration-200">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Cập nhật ngày về VN {orderIds.length > 1 && `(${orderIds.length} đơn)`}
        </h3>
        <div className="mb-4 rounded-lg bg-[#14264b]/5 p-3 text-sm text-[#14264b]">
          Chú ý: Khi cập nhật ngày về VN hệ thống sẽ tự động tạo đợt hàng cần ship cho các item này
        </div>
        {error && <div className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Ngày về VN <span className="text-red-500">*</span>
            </label>
            <input
              ref={dateInputRef}
              type="text"
              placeholder="dd/mm/yyyy"
              className="w-full rounded-lg border border-gray-400 bg-white px-3 py-2 text-gray-900 focus:border-[#14264b] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Bổ sung ghi chú</label>
            <textarea
              value={boSungGhiChu}
              onChange={(e) => setBoSungGhiChu(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-400 bg-white px-3 py-2 text-gray-900 focus:border-[#14264b] focus:outline-none"
              placeholder="Nhập ghi chú bổ sung..."
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="chuyenCompleted"
              checked={chuyenVeCompleted}
              onChange={(e) => setChuyenVeCompleted(e.target.checked)}
              className="rounded border-gray-400 bg-white"
            />
            <label htmlFor="chuyenCompleted" className="text-sm font-medium text-gray-700">
              Chuyển sang trạng thái Completed
            </label>
          </div>
          {chuyenVeCompleted && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Ngày hoàn thành <span className="text-red-500">*</span>
              </label>
              <input
                ref={completeDateInputRef}
                type="text"
                placeholder="dd/mm/yyyy"
                className="w-full rounded-lg border border-gray-400 bg-white px-3 py-2 text-gray-900 focus:border-[#14264b] focus:outline-none"
              />
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-lg bg-[#14264b] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a6e] disabled:opacity-50"
          >
            {isSubmitting ? 'Đang lưu...' : 'Cập nhật'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Complete Date Modal — chọn ngày complete khi mass complete
function CompleteDateModal({
  open,
  orderIds,
  username,
  onClose,
  onSuccess,
}: {
  open: boolean;
  orderIds: number[];
  username: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [ngayHoanThanh, setNgayHoanThanh] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !dateInputRef.current) return;
    const today = new Date();
    const defaultStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    setNgayHoanThanh(defaultStr);
    const fp = flatpickr(dateInputRef.current, {
      dateFormat: 'd/m/Y',
      defaultDate: today,
      onChange: (dates) => {
        if (dates[0]) {
          const d = dates[0];
          const formatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
          setNgayHoanThanh(formatted);
          setError('');
        }
      },
    });
    return () => { fp.destroy(); };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!ngayHoanThanh) {
      setError('Vui lòng chọn ngày complete');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await massComplete(orderIds, username, ngayHoanThanh);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi complete');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-200">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl transition-transform duration-200">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Mass complete {orderIds.length > 1 && `(${orderIds.length} đơn)`}
        </h3>
        {error && <div className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{error}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Ngày complete <span className="text-red-500">*</span>
          </label>
          <input
            ref={dateInputRef}
            type="text"
            placeholder="dd/mm/yyyy"
            className="w-full rounded-lg border border-gray-400 bg-white px-3 py-2 text-gray-900 focus:border-[#14264b] focus:outline-none"
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Đang complete...' : 'Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Confirmation Modal Component
function ConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  variant = 'default',
  error,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  error?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-200">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl transition-transform duration-200">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mb-4 text-sm text-gray-600">{message}</p>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#14264b] hover:bg-[#1e3a6e]'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * EditOrder List Page
 *
 * Converted from admin/EditOrder.aspx
 * Features:
 * - Tab navigation: Danh sách Order | Chi tiết Order | Ngày về VN
 * - Filters: Status checkboxes, search, mã đặt hàng, date range, quốc gia, username
 * - Actions: Export Excel 1 trang, Export Excel theo bộ lọc
 * - Mass actions: Cập nhật ngày về, Mass cancel/complete/received/shipped, Bổ sung ghi chú
 * - GridView with columns: Checkbox, Edit/Trọn gói, THÔNG TIN ĐH, USERNAME+Vùng miền, etc.
 * - Pagination
 */
export default function EditOrderListPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  // Quyết định bản xuất Excel có kèm 7 cột nhà cung cấp + lãi/lỗ hay không.
  const { xemGiaNcc } = useQuyen();
  const currentUsername = user?.username || '';

  // Role-based visibility (convert từ EditOrder.aspx.cs)
  // Admin/Order: thấy tất cả | Kho: chỉ complete | Sale: không thấy gì
  const userRoles = user?.roles || [];
  const isAdminOrOrder = userRoles.some(r => ['Admin', 'Order'].includes(r));
  const isKho = userRoles.includes('Kho');
  const isSale = userRoles.includes('Sale');

  // Buttons visibility - luôn hiển thị tất cả mass actions
  const canUpdateNgayVe = true; // Cập nhật ngày về
  const canMassCancel = true; // Mass cancel
  const canMassComplete = true; // Mass complete
  const canMassReceived = true; // Mass received
  const canMassShipped = true; // Mass shipped
  const canBoSungGhiChu = true; // Bổ sung ghi chú

  // Refs for date inputs
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const usernameDropdownRef = useRef<HTMLDivElement>(null);

  // Filter state - matching EditOrder.aspx filters
  // "Filter" (tbNoiDungTim) -> search, "Mã đặt hàng" (tbMaDatHang) -> ids (exact match by ID)
  const [filters, setFilters] = useState<QueryParams & { statuses?: string[] }>({
    page: 1,
    limit: 200, // Match EditOrder.aspx pageSize
    statuses: ['Received', 'Ordered'], // Default selected in C#
    sortBy: 'ID',
    sortOrder: 'DESC',
  });

  // Separate state for "Mã đặt hàng" (tbMaDatHang) - exact ID match
  const [maDatHang, setMaDatHang] = useState<string>('');
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [showUsernameDropdown, setShowUsernameDropdown] = useState(false);
  const [activeUsernameIndex, setActiveUsernameIndex] = useState(0);

  // Selection state for mass operations
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Status checkboxes state (matching cblTrangThaiOrder in C#)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['Received', 'Ordered']);

  // Return date modal state
  const [returnDateModalOpen, setReturnDateModalOpen] = useState(false);

  // Complete date modal state
  const [completeDateModalOpen, setCompleteDateModalOpen] = useState(false);

  // Note modal state
  const [noteModalOpen, setNoteModalOpen] = useState(false);

  // Edit order detail modal state — null when closed, orderId when open
  const [editOrderId, setEditOrderId] = useState<number | null>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: 'default' | 'danger';
    onConfirm: () => void;
    error?: string;
  }>({ open: false, title: '', message: '', variant: 'default', onConfirm: () => {} });

  // Show confirmation modal helper
  const showConfirm = (title: string, message: string, variant: 'default' | 'danger' = 'default', onConfirm: () => void, error?: string) => {
    setConfirmModal({ open: true, title, message, variant, onConfirm, error });
  };

  // Initialize flatpickr for date inputs
  useEffect(() => {
    if (!startDateRef.current || !endDateRef.current) return;

    const fpStart = flatpickr(startDateRef.current, {
      dateFormat: 'd/m/Y',
      onChange: (dates) => {
        if (dates[0]) {
          const d = dates[0];
          const isoFormatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          setFilters(prev => ({ ...prev, startDate: isoFormatted, page: 1 }));
        }
      },
    });

    const fpEnd = flatpickr(endDateRef.current, {
      dateFormat: 'd/m/Y',
      onChange: (dates) => {
        if (dates[0]) {
          const d = dates[0];
          const isoFormatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          setFilters(prev => ({ ...prev, endDate: isoFormatted, page: 1 }));
        }
      },
    });

    return () => {
      fpStart.destroy();
      fpEnd.destroy();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (usernameDropdownRef.current && !usernameDropdownRef.current.contains(event.target as Node)) {
        setShowUsernameDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch orders with TanStack Query
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['orders', filters],
    queryFn: () => getOrders(filters),
  });

  // Fetch status counts for badges
  const { data: statusCounts } = useQuery({
    queryKey: ['order-status-counts'],
    queryFn: getStatusCounts,
  });

  // Fetch usernames for dropdown
  const { data: usernames } = useQuery({
    queryKey: ['usernames'],
    queryFn: getUsernames,
  });

  // Fetch countries for dropdown
  const { data: quocGias } = useQuery({
    queryKey: ['quocGia'],
    queryFn: getQuocGia,
  });

  // Mass received mutation (dùng stored procedure giống EditOrder)
  const massReceivedMutation = useMutation({
    mutationFn: (params: { ids: number[]; username: string }) =>
      massReceived(params.ids, params.username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-status-counts'] });
      setSelectedIds([]);
      setConfirmModal(prev => ({ ...prev, open: false }));
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || error?.message || 'Có lỗi xảy ra';
      setConfirmModal(prev => ({ ...prev, error: message }));
    },
  });

  // Mass shipped mutation (dùng stored procedure giống EditOrder)
  const massShippedMutation = useMutation({
    mutationFn: (params: { ids: number[]; username: string }) =>
      massShipped(params.ids, params.username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-status-counts'] });
      setSelectedIds([]);
      setConfirmModal(prev => ({ ...prev, open: false }));
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || error?.message || 'Có lỗi xảy ra';
      setConfirmModal(prev => ({ ...prev, error: message }));
    },
  });

  // Mass delete mutation (soft delete - giống EditOrder MassCancel1)
  const deleteMutation = useMutation({
    mutationFn: (params: { ids: number[]; username: string; note: string }) =>
      massDelete(params.ids, params.username, params.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-status-counts'] });
      setSelectedIds([]);
    },
  });

  // Handle status checkbox change
  const handleStatusChange = (status: string, checked: boolean) => {
    const newStatuses = checked
      ? [...selectedStatuses, status]
      : selectedStatuses.filter((s) => s !== status);

    setSelectedStatuses(newStatuses);
    setFilters((prev) => ({ ...prev, statuses: newStatuses, page: 1 }));
  };

  // Handle filter changes
  const handleFilterChange = (key: keyof QueryParams, value: string) => {
    const processedValue = key === 'quocGiaId' && value ? parseInt(value, 10) : (value || undefined);
    setFilters((prev) => ({ ...prev, [key]: processedValue, page: 1 }));
  };

  const handleUsernameInputChange = (value: string) => {
    setUsernameInput(value);
    setShowUsernameDropdown(true);
    setActiveUsernameIndex(0);

    if (!value) {
      handleFilterChange('username', '');
      return;
    }
  };

  const handleUsernameSelect = (value: string) => {
    setUsernameInput(value);
    handleFilterChange('username', value);
    setShowUsernameDropdown(false);
    setActiveUsernameIndex(0);
  };

  const handleUsernameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;

    event.preventDefault();
    if (event.key === 'ArrowDown') {
      setShowUsernameDropdown(true);
      if (filteredUsernames.length > 0) {
        setActiveUsernameIndex((prev) => (prev + 1) % filteredUsernames.length);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      setShowUsernameDropdown(true);
      if (filteredUsernames.length > 0) {
        setActiveUsernameIndex((prev) => (prev - 1 + filteredUsernames.length) % filteredUsernames.length);
      }
      return;
    }

    const activeUsername = filteredUsernames[activeUsernameIndex]?.username;
    if (activeUsername) {
      handleUsernameSelect(activeUsername);
    } else if (!usernameInput.trim()) {
      handleUsernameSelect('');
    }
  };

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  // Handle select all - matching CheckAllItem() in C#
  const handleSelectAll = () => {
    if (selectedIds.length === data?.data.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(data?.data.map((o) => o.id) || []);
    }
  };

  // Handle individual select
  const handleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  /**
   * Dán một cột mã từ Excel vào ô Filter.
   *
   * Thẻ <input> KHÔNG giữ được dấu xuống dòng: Chrome nuốt sạch khi dán, nên hai
   * mã dính liền thành một chuỗi sai mà người dùng không hề biết. Vì vậy phải tự
   * bắt sự kiện dán, đổi xuống dòng và tab thành dấu phẩy rồi mới chèn vào.
   */
  const handleDanNhieuMa = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const tho = e.clipboardData.getData('text');
    if (!/[\r\n\t]/.test(tho)) return; // dán một dòng thì để nguyên

    e.preventDefault();
    const ma = tho
      .split(/[\r\n\t,;]+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

    const o = e.currentTarget;
    const cu = filters.search || '';
    const truoc = cu.slice(0, o.selectionStart ?? cu.length);
    const sau = cu.slice(o.selectionEnd ?? cu.length);
    handleFilterChange('search', (truoc + ma.join(', ') + sau).replace(/^,\s*/, ''));
  };

  // Bao nhiêu mã đang tra — khớp đúng cách máy chủ tách (chỉ dấu phẩy / chấm
  // phẩy / xuống dòng, KHÔNG tách theo khoảng trắng), để con số hiện ra không
  // nói một đằng máy chủ làm một nẻo.
  const soMaDangTra = (filters.search || '')
    .split(/[,;\r\n]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0).length;

  // Handle search button click (matching btTimKiem_Click in C#)
  // Both search and ids can be used together (matching EditOrder.aspx)
  const handleSearch = () => {
    setFilters((prev) => ({
      ...prev,
      search: prev.search || undefined,
      ids: maDatHang || undefined,
      page: 1
    }));
  };

  // Handle mass cancel (soft delete - giống EditOrder MassCancel1)
  const handleMassCancel = () => {
    showConfirm(
      'Xác nhận hủy đơn',
      `Bạn có chắc muốn hủy ${selectedIds.length} đơn hàng đã chọn?`,
      'danger',
      () => {
        deleteMutation.mutate(
          { ids: selectedIds, username: currentUsername, note: '' },
          {
            onSuccess: () => {
              setConfirmModal(prev => ({ ...prev, open: false }));
              alert(`Đã hủy ${selectedIds.length} đơn hàng`);
            },
            onError: (error: any) => {
              const message = error?.response?.data?.message || error?.message || 'Có lỗi xảy ra khi hủy đơn';
              setConfirmModal(prev => ({ ...prev, error: message }));
            },
          },
        );
      }
    );
  };

  // Handle mass complete — validate status rồi mở modal chọn ngày complete
  const handleMassComplete = () => {
    const selectedOrders = data?.data.filter((o) => selectedIds.includes(o.id));
    const invalidOrders = selectedOrders?.filter(
      (o) => !['Ordered', 'Shipped'].includes(o.trangThaiOrder)
    );
    if (invalidOrders && invalidOrders.length > 0) {
      alert('Có đơn hàng không thể complete - chỉ có thể complete đơn hàng đã Ordered hoặc Shipped');
      return;
    }
    setCompleteDateModalOpen(true);
  };

  // Handle mass received (dùng stored procedure giống EditOrder)
  const handleMassReceived = () => {
    showConfirm(
      'Xác nhận chuyển received',
      'Bạn có chắc muốn chuyển các đơn đã chọn sang Received?',
      'default',
      () => {
        massReceivedMutation.mutate({ ids: selectedIds, username: currentUsername });
      }
    );
  };

  // Handle mass shipped (dùng stored procedure giống EditOrder)
  const handleMassShipped = () => {
    showConfirm(
      'Xác nhận chuyển shipped',
      'Bạn có chắc muốn chuyển các đơn đã chọn sang Shipped?',
      'default',
      () => {
        massShippedMutation.mutate({ ids: selectedIds, username: currentUsername });
      }
    );
  };

  // Get selected order IDs for bulk actions

  // Format currency
  const formatCurrency = (value: number | null | undefined, currency: string = 'VND') => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: currency,
    }).format(value);
  };

  // Format number
  const formatNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('vi-VN').format(value);
  };

  // Format date - matching dd/MM/yyyy in C#
  const formatDate = (date: Date | string | null) => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('vi-VN');
  };

  const xuatExcel = async (don: Order[], hau: string) => {
    const { downloadDataAsExcel } = await import('@/lib/excel-download');
    // KHÔNG truyền `textColumns`: tham số đó ép định dạng chữ cho 500 dòng đầu,
    // đúng cho TỆP MẪU để người ta gõ vào, nhưng với bản xuất thì nó tạo ra mấy
    // trăm dòng trống phía dưới dữ liệu thật. Mã đơn vốn đã là chuỗi trong JS
    // nên ExcelJS ghi thành ô chữ, số 0 đứng đầu không mất.
    downloadDataAsExcel(
      bangXuatDonHang(don, xemGiaNcc),
      tenTepXuatDonHang(hau),
      undefined,
      undefined,
      undefined,
      'Danh sách đơn hàng',
    );
  };

  // Xuất đúng trang đang xem
  const handleExportCurrentPage = () => {
    if (!data?.data?.length) {
      alert('Trang này chưa có đơn nào để xuất.');
      return;
    }
    xuatExcel(data.data, '');
  };

  // Xuất TẤT CẢ đơn khớp bộ lọc hiện tại (không phân trang)
  const handleExportByFilter = async () => {
    try {
      const result = await getOrders({ ...filters, page: 1, limit: 99999 });
      const allOrders = result?.data || [];
      if (!allOrders.length) {
        alert('Bộ lọc hiện tại không ra đơn nào để xuất.');
        return;
      }
      await xuatExcel(allOrders, '_Filter');
    } catch (err) {
      alert('Không thể xuất file: ' + (err as Error).message);
    }
  };

  // Status config for display
  const statuses = ['Received', 'Ordered', 'Shipped', 'Completed', 'Cancelled'];

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;
  const filteredUsernames = (usernames || [])
    .filter((u: { username: string }) =>
      u.username.toLowerCase().includes(usernameInput.trim().toLowerCase())
    )
    .slice(0, 50);

  return (
    <div className="space-y-4">
      {/* Tab navigation - matching mytab in EditOrder.aspx */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <Link
          href="/admin/orders/list"
          className="rounded bg-gray-600 px-3 py-1 text-sm text-white"
        >
          Danh sách Order
        </Link>
        {/* <Link
          href="/admin/orders"
          className="rounded px-3 py-1 text-sm text-[#14264b] hover:bg-[#14264b]/5"
        >
          Chi tiết Order
        </Link> */}
        {/* <Link
          href="/admin/orders/return-dates"
          className="rounded px-3 py-1 text-sm text-[#14264b] hover:bg-[#14264b]/5"
        >
          Ngày về VN
        </Link> */}
      </div>

      <h3 className="text-lg font-bold text-gray-900">DANH SÁCH ĐẶT HÀNG</h3>

      {/* Status checkboxes - matching cblTrangThaiOrder in C# */}
      <div className="flex flex-wrap gap-4">
        {statuses.map((status) => {
          const count = statusCounts?.[status] || 0;
          const isSelected = selectedStatuses.includes(status);
          return (
            <label key={status} className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => handleStatusChange(status, e.target.checked)}
                className="rounded border-gray-400 bg-white"
              />
              <span className="text-sm font-medium text-gray-900">
                {status} ({count})
              </span>
            </label>
          );
        })}
      </div>

      {/* Filter panel - matching EditOrder.aspx filters */}
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="flex flex-wrap gap-4">
          {/* Filter - tìm tự do, HOẶC dán nhiều mã cùng lúc */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Filter</label>
            <input
              type="text"
              placeholder="Mã, mã, mã... hoặc từ khoá"
              title={'Gõ một từ khoá để tìm như cũ, hoặc dán nhiều mã (ngăn bởi dấu phẩy ' +
                'hoặc dán thẳng một cột từ Excel) để tra nhiều mã cùng lúc.'}
              className="w-56 rounded-lg border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#14264b] focus:outline-none"
              value={filters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              onPaste={handleDanNhieuMa}
            />
            {soMaDangTra > 1 && (
              <p className="mt-1 text-xs text-gray-500">Đang tra {soMaDangTra} mã</p>
            )}
          </div>

          {/* Mã đặt hàng - matching tbMaDatHang in C# */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Mã đặt hàng</label>
            <input
              type="text"
              placeholder="Mã đặt hàng"
              className="w-32 rounded-lg border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#14264b] focus:outline-none"
              value={maDatHang}
              onChange={(e) => setMaDatHang(e.target.value)}
            />
          </div>

          {/* Từ ngày - đến ngày */}
          <div className="flex gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Từ ngày</label>
              <input
                ref={startDateRef}
                type="text"
                placeholder="dd/mm/yyyy"
                className="w-28 rounded-lg border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#14264b] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Đến ngày</label>
              <input
                ref={endDateRef}
                type="text"
                placeholder="dd/mm/yyyy"
                className="w-28 rounded-lg border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#14264b] focus:outline-none"
              />
            </div>
          </div>

          {/* Quốc gia - matching ddQuocGia in C# */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Quốc gia</label>
            <select
              className="w-40 rounded-lg border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#14264b] focus:outline-none"
              value={filters.quocGiaId || ''}
              onChange={(e) => handleFilterChange('quocGiaId', e.target.value)}
            >
              <option value="">--Tất cả Quốc gia--</option>
              {quocGias?.map((qg: any) => (
                <option key={qg.QuocGiaID} value={qg.QuocGiaID}>
                  {qg.TenQuocGia}
                </option>
              ))}
            </select>
          </div>

          {/* Username - matching ddUserName in C# */}
          <div ref={usernameDropdownRef} className="relative">
            <label htmlFor="order-username-filter" className="mb-1 block text-xs font-medium text-gray-700">Username</label>
            <input
              id="order-username-filter"
              type="text"
              className="w-48 rounded-lg border border-gray-400 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#14264b] focus:outline-none"
              value={usernameInput}
              onChange={(e) => handleUsernameInputChange(e.target.value)}
              onKeyDown={handleUsernameKeyDown}
              onFocus={() => {
                setActiveUsernameIndex(0);
                setShowUsernameDropdown(true);
              }}
              placeholder="Nhập Username"
              autoComplete="off"
            />
            {showUsernameDropdown && (
              <div className="absolute z-50 mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-gray-300 bg-white py-1 text-sm shadow-lg">
                <button
                  type="button"
                  onClick={() => handleUsernameSelect('')}
                  className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-[#14264b]/5 hover:text-[#14264b]"
                >
                  --Tất cả User--
                </button>
                {filteredUsernames.map((u: { username: string }, index: number) => (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => handleUsernameSelect(u.username)}
                    onMouseEnter={() => setActiveUsernameIndex(index)}
                    className={`block w-full px-3 py-2 text-left font-medium hover:bg-[#14264b]/5 hover:text-[#14264b] ${
                      index === activeUsernameIndex
                        ? 'bg-[#14264b]/5 text-[#14264b]'
                        : 'text-gray-900'
                    }`}
                  >
                    {u.username}
                  </button>
                ))}
                {filteredUsernames.length === 0 && (
                  <div className="px-3 py-2 text-gray-500">Không có username phù hợp</div>
                )}
              </div>
            )}
          </div>

          {/* Search Button - matching btTimKiem in C# */}
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              className="rounded-lg bg-gray-500 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600"
            >
              Xem
            </button>
          </div>

          {/* Export buttons - matching btExportToExcel1Page, btExportToExcelAllWithFilter in C# */}
          <div className="flex items-end gap-2">
            <button onClick={handleExportCurrentPage} className="rounded-lg bg-[#14264b] px-3 py-2 text-sm font-medium text-white hover:bg-[#1e3a6e]">
              Xuất ra excel 1 trang
            </button>
            <button onClick={handleExportByFilter} className="rounded-lg bg-[#14264b] px-3 py-2 text-sm font-medium text-white hover:bg-[#1e3a6e]">
              Xuất ra excel theo bộ lọc
            </button>
          </div>
        </div>
      </div>

      {/* Mass actions toolbar - matching LinkButtons in EditOrder.aspx with role visibility */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#14264b]/20 bg-[#14264b]/5 p-3">
        {selectedIds.length > 0 && (
          <span className="mr-2 text-sm font-medium text-gray-700">
            Đã chọn: <span className="font-bold text-[#14264b]">{selectedIds.length}</span> đơn
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          {canUpdateNgayVe && (
            <button
              onClick={() => setReturnDateModalOpen(true)}
              disabled={selectedIds.length === 0}
              className="rounded bg-[#14264b] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1e3a6e] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cập nhật ngày về
            </button>
          )}
          {canMassCancel && (
            <button
              onClick={handleMassCancel}
              disabled={selectedIds.length === 0 || deleteMutation.isPending}
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Đang hủy...' : 'Mass cancel'}
            </button>
          )}
          {canMassComplete && (
            <button
              onClick={handleMassComplete}
              disabled={selectedIds.length === 0}
              className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Mass complete
            </button>
          )}
          {canMassReceived && (
            <button
              onClick={handleMassReceived}
              disabled={selectedIds.length === 0 || massReceivedMutation.isPending}
              className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {massReceivedMutation.isPending ? 'Đang xử lý...' : 'Mass received'}
            </button>
          )}
          {canMassShipped && (
            <button
              onClick={handleMassShipped}
              disabled={selectedIds.length === 0 || massShippedMutation.isPending}
              className="rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              {massShippedMutation.isPending ? 'Đang xử lý...' : 'Mass shipped'}
            </button>
          )}
          {canBoSungGhiChu && (
            <button
              onClick={() => setNoteModalOpen(true)}
              disabled={selectedIds.length === 0}
              className="rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Bổ sung ghi chú
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14264b] border-t-transparent"></div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-700">
          Error loading orders: {(error as Error).message}
        </div>
      )}

      {/* Data table - matching gvDonHang in EditOrder.aspx */}
      {!isLoading && !error && data && (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="w-8 px-1 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === data.data.length}
                      onChange={handleSelectAll}
                      className="rounded border-gray-400 bg-white"
                    />
                  </th>
                  <th className="px-1 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    Edit
                  </th>
                  <th className="px-1 py-2 text-left text-xs font-bold uppercase text-gray-700">
                    THÔNG TIN ĐH
                  </th>
                  <th className="px-1 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    USERNAME
                  </th>
                  <th className="px-1 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    QUỐC GIA
                  </th>
                  <th className="px-1 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    SẢN PHẨM
                  </th>
                  <th className="px-1 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    THUẾ / PHÍ
                  </th>
                  <th className="px-1 py-2 text-right text-xs font-medium uppercase text-gray-500">
                    GIÁ / SL / %
                  </th>
                  <th className="px-1 py-2 text-right text-xs font-medium uppercase text-gray-500">
                    NGOẠI TỆ
                  </th>
                  <th className="px-1 py-2 text-right text-xs font-medium uppercase text-gray-500">
                    TỔNG VNĐ
                  </th>
                  <th className="px-1 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    NGÀY / ĐỢT
                  </th>
                  <th className="px-1 py-2 text-left text-xs font-medium uppercase text-gray-500">
                    GHI CHÚ / BY
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.data.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    {/* Checkbox */}
                    <td className="px-1 py-1 text-gray-900">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(order.id)}
                        onChange={() => handleSelect(order.id)}
                        className="rounded border-gray-400 bg-white"
                      />
                    </td>

                    {/* Edit/Trọn gói - matching HangKhoan logic in C# */}
                    <td className="px-1 py-1 whitespace-nowrap">
                      {order.hangKhoan ? (
                        <span className="text-gray-500">Trọn gói</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditOrderId(order.id)}
                          aria-label="Sửa đơn hàng"
                          title="Sửa"
                          className="inline-flex items-center justify-center rounded border border-gray-300 p-1 text-[#14264b] hover:border-[#14264b] hover:bg-[#14264b]/10 cursor-pointer"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                      )}
                    </td>

                    {/* THÔNG TIN ĐH - matching ID, ngaymuahang, ordernumber, trangthaiOrder in C# */}
                    <td className="px-1 py-1 text-left w-[200px] max-w-[200px] text-gray-900">
                      <div className="text-left">
                        <span className="font-bold">Mã ĐH: </span>{order.id}
                        <br />
                        <span className="font-bold">Ngày ĐH: </span>{formatDate(order.ngayMuaHang)}
                        <br />
                        <span className="font-bold">OrderNumber: </span>
                        <br />
                        <span className="break-all">{order.orderNumber}</span>
                        <br />
                        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${OrderStatusConfig[order.trangThaiOrder as OrderStatus]?.color || 'bg-gray-100 text-gray-800'}`}>
                          {order.trangThaiOrder}
                        </span>
                      </div>
                    </td>

                    {/* USERNAME + Vùng miền - matching username, LinkTaiKhoanMang, VungMien in C# */}
                    <td className="px-1 py-1 text-left whitespace-nowrap text-gray-900">
                      {order.linkTaiKhoanMang ? (
                        <a
                          href={order.linkTaiKhoanMang}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#14264b] hover:text-[#14264b]"
                        >
                          {order.username}
                        </a>
                      ) : (
                        <span>{order.username}</span>
                      )}
                      <br />
                      <span className="font-medium">Vùng miền: </span>{order.vungMien || '-'}
                    </td>

                    {/* QUỐC GIA */}
                    <td className="px-1 py-1 text-left whitespace-nowrap text-gray-900">
                      {order.tenQuocGia || '-'}
                    </td>

                    {/* SẢN PHẨM - gộp HÌNH + LINK + Màu + Size */}
                    <td className="px-1 py-1 text-left w-[240px] max-w-[240px] text-gray-900">
                      <div className="flex gap-2">
                        {order.linkHinh ? (
                          <img
                            src={order.linkHinh}
                            alt="Product"
                            className="h-[50px] w-[50px] flex-shrink-0 object-cover"
                          />
                        ) : (
                          <div className="h-[50px] w-[50px] flex-shrink-0 bg-gray-100" />
                        )}
                        <div className="min-w-0 flex-1">
                          {order.linkWeb ? (
                            <a
                              href={order.linkWeb}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate font-medium text-[#14264b] hover:underline"
                            >
                              {order.linkWeb}
                            </a>
                          ) : (
                            '-'
                          )}
                          <div>
                            <span className="font-medium">Màu: </span>{order.color || '-'}
                          </div>
                          <div>
                            <span className="font-medium">Size: </span>{order.size || '-'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* THUẾ/PHÍ - matching phuthu, saleoff, shipUSA, tax in C# */}
                    <td className="px-1 py-1 text-left whitespace-nowrap text-gray-900">
                      <div className="text-left">
                        <span className="font-medium">Phụ thu: </span>{formatNumber(order.phuThu)}
                        <br />
                        <span className="font-medium">Sale off: </span>{formatNumber(order.saleOff)}
                        <br />
                        <span className="font-medium">ShipUS: </span>{formatNumber(order.shipUsa)}
                        <br />
                        <span className="font-medium">Tax: </span>{formatNumber(order.tax)}
                      </div>
                    </td>

                    {/* GIÁ / SL / % - gộp GIÁ WEB + SL + % CÔNG */}
                    <td className="px-1 py-1 text-right whitespace-nowrap text-gray-900">
                      <div>
                        <span className="font-medium">Giá: </span>{formatNumber(order.donGiaWeb)}
                      </div>
                      <div>
                        <span className="font-medium">SL: </span>{order.soLuong}
                      </div>
                      <div>
                        <span className="font-medium">%Công: </span>{formatNumber(order.cong)}
                      </div>
                    </td>

                    {/* NGOẠI TỆ - gộp CÔNG NGOẠI TỆ + TỔNG NGOẠI TỆ + LOẠI TIỀN + TỶ GIÁ */}
                    <td className="px-1 py-1 text-right whitespace-nowrap text-gray-900">
                      <div>
                        <span className="font-medium">Công: </span>{formatNumber(order.tienCongUsd)}
                      </div>
                      <div>
                        <span className="font-medium">Tổng: </span>{formatNumber(order.tongTienUsd)} {order.loaiTien || 'USD'}
                      </div>
                      <div>
                        <span className="font-medium">Tỷ giá: </span>{formatNumber(order.tyGia)}
                      </div>
                    </td>

                    {/* TỔNG VNĐ */}
                    <td className="px-1 py-1 text-right whitespace-nowrap font-medium">
                      {formatNumber(order.tongTienVnd)}
                    </td>

                    {/* NGÀY / ĐỢT - gộp VN STATUS + NGÀY COMPLETE + ĐỢT HÀNG */}
                    <td className="px-1 py-1 text-left whitespace-nowrap text-gray-900">
                      <div>
                        <span className="font-medium">VN: </span>
                        {order.ngayVeVn ? `Đợt ${formatDate(order.ngayVeVn)}` : '-'}
                      </div>
                      <div>
                        <span className="font-medium">Complete: </span>
                        {order.ngayHoanThanh ? formatDate(order.ngayHoanThanh as any) : '-'}
                      </div>
                      <div>
                        <span className="font-medium">Đợt: </span>{order.tenDotHang || '-'}
                      </div>
                    </td>

                    {/* GHI CHÚ / BY - gộp GHI CHÚ + ADDED BY */}
                    <td className="px-1 py-1 text-left max-w-[160px] text-gray-900">
                      <div className="line-clamp-2">{order.ghiChu || order.adminNote || '-'}</div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        by {order.usernameSave || '-'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination - matching ucPhanTrang in C# */}
      {data && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {(data.page - 1) * data.limit + 1} to{' '}
            {Math.min(data.page * data.limit, data.total)} of {data.total} orders
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => handlePageChange(data.page - 1)}
              disabled={data.page === 1}
              className="rounded-lg border border-gray-400 bg-white px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(data.page + 1)}
              disabled={data.page === totalPages}
              className="rounded-lg border border-gray-400 bg-white px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Fetching indicator */}
      {isFetching && !isLoading && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white">
          Updating...
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        error={confirmModal.error}
        onConfirm={() => confirmModal.onConfirm()}
        onCancel={() => setConfirmModal(prev => ({ ...prev, open: false, error: undefined }))}
      />

      {/* Return Date Modal */}
      <ReturnDateModal
        open={returnDateModalOpen}
        orderIds={selectedIds}
        onClose={() => setReturnDateModalOpen(false)}
      />

      {/* Complete Date Modal */}
      <CompleteDateModal
        open={completeDateModalOpen}
        orderIds={selectedIds}
        username={currentUsername}
        onClose={() => setCompleteDateModalOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['order-status-counts'] });
          setSelectedIds([]);
        }}
      />

      {/* Note Modal */}
      <NoteModal
        open={noteModalOpen}
        orderIds={selectedIds}
        onClose={() => setNoteModalOpen(false)}
      />

      {/* Edit Order Detail Modal */}
      <EditOrderDetailModal
        orderId={editOrderId}
        onClose={() => setEditOrderId(null)}
      />
    </div>
  );
}
