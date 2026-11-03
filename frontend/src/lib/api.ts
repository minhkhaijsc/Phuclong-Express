/**
 * API Client
 *
 * Axios instance and API methods for communicating with the backend.
 * Provides typed methods for order operations.
 */

import axios, { AxiosInstance } from 'axios';
import {
  Order,
  QueryParams,
  PaginatedResponse,
  MassUpdateRequest,
  MassDeleteRequest,
  MassCompleteRequest,
} from '@/types/order';
import { OrderStatus } from '@/types/order-status';
import { getAccessToken, useAuthStore } from '@/hooks/use-auth';

/**
 * Create axios instance with base URL from environment
 *
 * The base URL is read from NEXT_PUBLIC_API_URL environment variable.
 * Defaults to localhost if not set.
 */
const createApiClient = (): AxiosInstance => {
  const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  const client = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
    // Timeout after 30 seconds
    timeout: 30000,
    paramsSerializer: (params) => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((v) => searchParams.append(key, v));
        } else if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      return searchParams.toString();
    },
  });

  // Add JWT token to requests from localStorage
  client.interceptors.request.use(async (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Handle 401 responses - redirect to login
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      // Debug log
      console.log('[API Error]', { status, message, error: error.message });

      // Đưa câu báo lỗi CỦA MÁY CHỦ lên `error.message`.
      //
      // Mặc định axios chỉ để "Request failed with status code 409", mà mọi màn
      // đều hiện `err.message` — người dùng đọc xong không biết sai chỗ nào, mà
      // người sửa cũng không biết bắt đầu từ đâu. Sửa ở đây một lần thì tất cả
      // các màn cùng hiện đúng lý do. NestJS trả `message` dạng mảng khi lỗi
      // kiểm tra dữ liệu, nên gộp lại.
      const cauMayChu = error.response?.data?.message;
      if (cauMayChu) {
        error.message = Array.isArray(cauMayChu) ? cauMayChu.join('. ') : String(cauMayChu);
      }

      // 401 = phiên hỏng, phải đăng nhập lại. 403 = KHÔNG ĐƯỢC LÀM VIỆC NÀY,
      // phiên vẫn tốt — xem ghi chú dài trong `api-client.ts`. Đây là bản sao
      // THỨ BA của cùng đoạn này (api-client.ts, axios-setup.ts, và đây), và là
      // bản nặng nhất: nó `window.location.href` sang /login, tức là người dùng
      // bị ném khỏi trang đang làm, mất cả dữ liệu đang nhập dở.
      //
      // Cũng bỏ `message?.includes('token')`: chuỗi 'token' khớp cả những câu
      // chẳng liên quan gì tới phiên đăng nhập, ví dụ lỗi về mã vận đơn
      // ('tracking_number') hay bất kỳ câu nào của máy chủ có chữ đó.
      const phienHong =
        status === 401 ||
        message?.includes('unauthorized') ||
        message?.includes('Unauthorized') ||
        message?.includes('invalid token');

      if (phienHong && typeof window !== 'undefined') {
        console.log('[Auth] Redirecting to login due to auth error');
        useAuthStore.getState().logout();
        localStorage.removeItem('auth-storage');
        const currentOrigin = window.location.origin;
        window.location.href = `${currentOrigin}/login`;
      }
      return Promise.reject(error);
    },
  );

  return client;
};

const apiClient = createApiClient();

/**
 * API Methods for Order operations
 *
 * These methods handle communication with the backend orders endpoint.
 */

/**
 * Get orders list with filters and pagination (POST method)
 *
 * @param params - Query parameters for filtering, sorting, and pagination
 * @returns Paginated list of orders
 */
export const getOrders = async (params: QueryParams): Promise<PaginatedResponse<Order>> => {
  const response = await apiClient.post<PaginatedResponse<Order>>('/orders/list', params);
  return response.data;
};

/**
 * Get orders for QLDatHang_LietKe (Order Management List)
 * Converted from: QLDatHang_LietKe.aspx.cs
 *
 * Response matches DonHangPhanTrang from C#:
 * - totalItem: total count
 * - danhSachDonHang: list of orders
 *
 * @param params - Query parameters matching QLDatHang filters
 * @returns QLDatHang response
 */
export interface QLDatHangResponse {
  totalItem: number;
  danhSachDonHang: Order[];
  page: number;
  limit: number;
}

export const getOrdersQLDatHang = async (params: QueryParams): Promise<QLDatHangResponse> => {
  const response = await apiClient.post<QLDatHangResponse>('/orders/qldathang-list', params);
  return response.data;
};

/**
 * Get a single order by ID
 *
 * @param id - Order ID
 * @param includeDeleted - Whether to include soft-deleted orders
 * @returns Order object
 */
export const getOrder = async (id: number, includeDeleted = false): Promise<Order> => {
  const response = await apiClient.get<Order>(`/orders/${id}`, {
    params: { includeDeleted },
  });
  return response.data;
};

/**
 * Create a new order
 *
 * @param order - Order data to create
 * @returns Created order object
 */
export const createOrder = async (order: Partial<Order>): Promise<Order> => {
  const response = await apiClient.post<Order>('/orders', order);
  return response.data;
};

/**
 * Create a quick order (DatHangM)
 *
 * @param order - Quick order data
 * @returns Success result
 */
export const createQuickOrder = async (order: {
  linkWeb: string;
  linkHinh?: string;
  color?: string;
  size?: string;
  soLuong: number;
  donGiaWeb?: number;
  loaiTien?: string;
  ghiChu?: string;
  tyGia?: number;
  saleOff?: number;
  quocGiaId?: number;
  nguoiTao?: string;
}): Promise<{ success: boolean; error?: string }> => {
  const response = await apiClient.post<{ success: boolean; error?: string }>('/orders/quick', order);
  return response.data;
};

/**
 * Create multiple quick orders at once
 *
 * @param orders - Array of quick order data
 * @returns Batch result
 */
export const createQuickOrders = async (orders: Array<{
  linkWeb: string;
  linkHinh?: string;
  color?: string;
  size?: string;
  soLuong: number;
  donGiaWeb?: number;
  loaiTien?: string;
  ghiChu?: string;
  tyGia?: number;
  saleOff?: number;
  quocGiaId?: number;
  nguoiTao?: string;
}>): Promise<{ success: number; failed: number; errors: string[] }> => {
  const response = await apiClient.post<{ success: number; failed: number; errors: string[] }>('/orders/quick/batch', { orders });
  return response.data;
};

/**
 * Calculate service fee for QLDatHang_Them
 */
export const calculateTienCong = async (params: {
  loaiTien: string;
  donGiaWeb: number;
  soLuong: number;
  saleOff: number;
  cong: number;
  tyGia: number;
  username: string;
  tax?: number;
  shipUsa?: number;
  phuThu?: number;
}): Promise<{ tienCongVnd: number; giaSauOffUsd: number; tongTienUsd: number; tongTienVnd: number }> => {
  const response = await apiClient.post<{ tienCongVnd: number; giaSauOffUsd: number; tongTienUsd: number; tongTienVnd: number }>('/orders/quick/calculate', params);
  return response.data;
};

/**
 * Upload image for QLDatHang_Them
 */
export const uploadQuickOrderImage = async (file: File): Promise<{ linkHinh: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ linkHinh: string }>('/orders/quick/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

/**
 * Add order for QLDatHang_Them (uses SP_Them_DonHang_Simple_CoTamTinh)
 */
export const addQuickOrder = async (order: {
  linkWeb: string;
  linkHinh?: string;
  color?: string;
  size?: string;
  soLuong: number;
  donGiaWeb?: number;
  loaiTien?: string;
  ghiChu?: string;
  tyGia?: number;
  saleOff?: number;
  quocGiaId?: number;
  nguoiTao?: string;
  usernameSave?: string;
  websiteName?: string;
  username?: string;
  shipUsa?: number;
  tax?: number;
  phuThu?: number;
  cong?: number;
}): Promise<{ success: boolean; error?: string }> => {
  const response = await apiClient.post<{ success: boolean; error?: string }>('/orders/quick/add', order);
  return response.data;
};

/**
 * Update an existing order
 *
 * @param id - Order ID to update
 * @param order - Partial order data to update
 * @returns Updated order object
 */
export const updateOrder = async (id: number, order: Partial<Order>): Promise<Order> => {
  const response = await apiClient.put<Order>(`/orders/${id}`, order);
  return response.data;
};

/**
 * Delete an order (soft delete)
 *
 * @param id - Order ID to delete
 */
export const deleteOrder = async (id: number): Promise<void> => {
  await apiClient.delete(`/orders/${id}`);
};

/**
 * Delete an order using the same stored procedure as DanhSachDonHang.aspx.
 */
export const deleteOrderForUser = async (id: number, nguoiTao: string): Promise<{ success: boolean }> => {
  const response = await apiClient.delete<{ success: boolean }>(`/orders/${id}/sp-xoa`, {
    params: { nguoiTao },
  });
  return response.data;
};

/**
 * Mass delete orders (soft delete)
 *
 * @param ids - Array of order IDs to delete
 * @param username - Username performing the delete
 * @param note - Note/reason for deletion
 * @returns Number of deleted orders
 */
export const massDelete = async (
  ids: number[],
  username?: string,
  note?: string,
): Promise<{ deleted: number }> => {
  const response = await apiClient.post<{ deleted: number }>('/orders/mass-delete', {
    ids,
    username,
    note,
  } as MassDeleteRequest);
  return response.data;
};

/**
 * Mass update orders
 *
 * @param items - Array of order updates (id + fields to update)
 * @param username - Username performing the action
 * @returns Number of updated orders
 */
export const massUpdate = async (
  items: { id: number; trangThaiOrder?: OrderStatus; adminNote?: string; orderNumber?: string; tyGia?: number; cong?: number; saleOff?: number; phuThu?: number; shipUsa?: number; tax?: number; totalCharged?: number; totalItem?: number; heThongTuTinhCong?: boolean }[],
  username?: string,
): Promise<{ updated: number }> => {
  const response = await apiClient.post<{ updated: number }>('/orders/mass-update', {
    items,
    username,
  } as MassUpdateRequest);
  return response.data;
};

/**
 * Lấy tỷ giá hiện tại theo loại tiền của các đơn hàng đã chọn.
 * Legacy parity: QLDatHang_MassUpdate.aspx.cs → LoadTyGia → SP_Lay_TyGiaHienTaiTuDanhSachDonHang.
 *
 * @param ids - Mảng order ID (sẽ join thành chuỗi "1,2,3")
 * @returns { tyGia, loaiTien } - tyGia có thể null nếu không tra được
 */
export const getCurrentTyGiaFromOrders = async (
  ids: number[],
): Promise<{ tyGia: number | null; loaiTien: string | null }> => {
  if (!ids || !ids.length) return { tyGia: null, loaiTien: null };
  const response = await apiClient.get<{ tyGia: number | null; loaiTien: string | null }>(
    '/orders/current-ty-gia',
    { params: { ids: ids.join(',') } },
  );
  return response.data;
};

/**
 * Mass cancel orders with reason note — legacy parity với QLDatHang_LietKe.
 * Calls: SP_CapNhat_MassCancel (@id, @ghichu, @NguoiTao).
 * Khác massDelete (= SP_CapNhat_MassCancel1) ở chỗ append ghi chú vào field `ghichu` của DON_HANG.
 *
 * @param ids - Array of order IDs to cancel
 * @param ghiChu - Lý do hủy (optional, append vào ghichu của đơn)
 */
export const massCancel = async (
  ids: number[],
  ghiChu?: string,
): Promise<{ cancelled: number }> => {
  const response = await apiClient.post<{ cancelled: number }>('/orders/mass-cancel', {
    ids,
    ghiChu,
  });
  return response.data;
};

/**
 * Mass complete orders using stored procedure (giống EditOrder logic)
 *
 * @param ids - Array of order IDs to complete
 * @param username - Username performing the action
 * @returns Number of completed orders
 */
export const massComplete = async (
  ids: number[],
  username?: string,
  ngayHoanThanh?: string,
): Promise<{ completed: number }> => {
  const response = await apiClient.post<{ completed: number }>('/orders/mass-complete', {
    ids,
    username,
    ngayHoanThanh,
  } as MassCompleteRequest);
  return response.data;
};

/**
 * Mass received orders using stored procedure (giống EditOrder logic)
 * Converted from: EditOrder.cs - lbtMassReceived_Click + DBConnect.MassReceived
 * Checks kỳ đóng before executing, logs action to system
 *
 * @param ids - Array of order IDs to mark as received
 * @param username - Username performing the action
 * @returns Number of received orders
 */
export const massReceived = async (
  ids: number[],
  username?: string,
): Promise<{ received: number }> => {
  const response = await apiClient.post<{ received: number }>('/orders/mass-received', {
    ids,
    username,
  });
  return response.data;
};

/**
 * Mass shipped orders using stored procedure (giống EditOrder logic)
 * Converted from: EditOrder.cs - lbtMassShipped_Click + DBConnect.MassShipped
 * Calls: SP_CapNhat_MassShipped (@id), logs action to system
 *
 * @param ids - Array of order IDs to mark as shipped
 * @param username - Username performing the action
 * @returns Number of shipped orders
 */
export const massShipped = async (
  ids: number[],
  username?: string,
): Promise<{ shipped: number }> => {
  const response = await apiClient.post<{ shipped: number }>('/orders/mass-shipped', {
    ids,
    username,
  });
  return response.data;
};

/**
 * Restore a soft-deleted order
 *
 * @param id - Order ID to restore
 * @returns Restored order object
 */
export const restoreOrder = async (id: number): Promise<Order> => {
  const response = await apiClient.post<Order>(`/orders/${id}/restore`);
  return response.data;
};

/**
 * Get deleted orders status counts (for CheckBoxList with counts)
 */
export const getDeletedStatusCounts = async (): Promise<{ status: string; count: number }[]> => {
  const response = await apiClient.get<{ status: string; count: number }[]>('/orders/deleted/status-counts');
  return response.data;
};

/**
 * Batch restore multiple deleted orders
 */
export const batchRestoreOrders = async (ids: number[]): Promise<{ success: boolean; count: number }> => {
  const response = await apiClient.post<{ success: boolean; count: number }>('/orders/batch-restore', { ids });
  return response.data;
};

/**
 * Permanently delete an order
 */
export const permanentDeleteOrder = async (id: number): Promise<{ success: boolean }> => {
  const response = await apiClient.delete<{ success: boolean }>(`/orders/${id}/permanent`);
  return response.data;
};

/**
 * Batch cancel orders
 */
export const batchCancelOrders = async (ids: number[]): Promise<{ success: boolean; count: number }> => {
  const response = await apiClient.post<{ success: boolean; count: number }>('/orders/batch-cancel', { ids });
  return response.data;
};

/**
 * Batch complete orders (only Ordered/Shipped can be completed)
 */
export const batchCompleteOrders = async (ids: number[]): Promise<{ success: boolean; count: number; message?: string }> => {
  const response = await apiClient.post<{ success: boolean; count: number; message?: string }>('/orders/batch-complete', { ids });
  return response.data;
};

/**
 * Batch set orders to Received status
 */
export const batchReceivedOrders = async (ids: number[]): Promise<{ success: boolean; count: number }> => {
  const response = await apiClient.post<{ success: boolean; count: number }>('/orders/batch-received', { ids });
  return response.data;
};

/**
 * Batch set orders to Shipped status
 */
export const batchShippedOrders = async (ids: number[]): Promise<{ success: boolean; count: number }> => {
  const response = await apiClient.post<{ success: boolean; count: number }>('/orders/batch-shipped', { ids });
  return response.data;
};

/**
 * Get deleted orders
 *
 * @param params - Query parameters
 * @returns Paginated list of deleted orders
 */
export const getDeletedOrders = async (
  params: QueryParams,
): Promise<PaginatedResponse<Order>> => {
  const response = await apiClient.get<PaginatedResponse<Order>>('/orders/deleted', { params });
  return response.data;
};

/**
 * Get order details (products in order)
 *
 * @param id - Order ID
 * @param includeDeleted - Include deleted orders
 * @returns Order details
 */
export const getOrderDetails = async (
  id: number,
  includeDeleted = false,
): Promise<Order> => {
  const response = await apiClient.get<Order>(`/orders/${id}/details`, {
    params: { includeDeleted },
  });
  return response.data;
};

/**
 * Update order note (add additional note) - batch version
 *
 * @param ids - Order IDs array
 * @param note - Additional note
 * @returns Updated order (first one)
 */
export const updateOrderNoteBatch = async (
  ids: number[],
  note: string,
): Promise<Order> => {
  const response = await apiClient.put<Order>(`/orders/note/batch`, {
    ids,
    boSungGhiChu: note,
  });
  return response.data;
};

/**
 * Update order note (add additional note) - single version
 *
 * @param id - Order ID
 * @param note - Additional note
 * @returns Updated order
 */
export const updateOrderNote = async (
  id: number,
  note: string,
): Promise<Order> => {
  const response = await apiClient.put<Order>(`/orders/${id}/note`, {
    boSungGhiChu: note,
  });
  return response.data;
};

/**
 * Update order return date to Vietnam
 *
 * @param id - Order ID
 * @param data - Return date update data
 * @returns Updated order
 */
export const updateOrderReturnDate = async (
  id: number,
  data: {
    ngayVeVn: string;
    boSungGhiChu?: string;
    chuyenVeCompleted?: boolean;
    /** Ngày hoàn thành (dd/MM/yyyy or yyyy-MM-dd) — chỉ dùng khi chuyenVeCompleted=true */
    ngayHoanThanh?: string;
    username?: string;
  },
): Promise<Order> => {
  const response = await apiClient.put<Order>(`/orders/${id}/return-date`, data);
  return response.data;
};

/**
 * Import orders from Excel file
 *
 * @param file - Excel file
 * @param importDto - Import options
 * @returns Import result
 */
export const importOrders = async (
  file: File,
  importDto: { sheetName?: string; mode?: string },
): Promise<{ imported: number; errors?: string[] }> => {
  const formData = new FormData();
  formData.append('file', file);
  if (importDto.sheetName) formData.append('sheetName', importDto.sheetName);
  if (importDto.mode) formData.append('mode', importDto.mode);

  const response = await apiClient.post<{ imported: number; errors?: string[] }>(
    '/orders/import',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    },
  );
  return response.data;
};

export interface ImportOrderJsonItem {
  excelRowIndex: number;
  websiteName: string;
  username: string;
  loaitien: string;
  quocGiaId: number;
  tenQuocGia: string;
  linkweb: string;
  linkhinh: string;
  color: string;
  size: string;
  soluong: number;
  dongiaweb: number;
  saleoff: number;
  tygia: number;
  cong?: number;
  tax?: number;
  phuthu?: number;
  ghichu?: string;
}

export interface ImportSuccessItem {
  excelRowIndex: number;
  username: string;
  loaitien: string;
  tenQuocGia: string;
  linkweb: string;
  color: string;
  size: string;
  soluong: number;
  dongiaweb: number;
  saleoff: number;
}

export interface ImportOrdersResult {
  imported: number;
  errors: string[];
  successItems: ImportSuccessItem[];
}

export const importOrdersJson = async (
  items: ImportOrderJsonItem[],
  mode: string,
): Promise<ImportOrdersResult> => {
  const response = await apiClient.post<ImportOrdersResult>(
    '/orders/import-json',
    { items, mode },
  );
  return response.data;
};

/**
 * API Methods for Debt Reports
 *
 * These methods handle communication with the backend debt-reports endpoint.
 * Matches: BaoCao_ChiTietCongNo.aspx page logic
 */

/**
 * Query parameters for debt reports
 */
export interface DebtReportQueryParams {
  username?: string;
  fromKyId?: number;
  toKyId?: number;
  page?: number;
  limit?: number;
}

/**
 * Debt report summary (period summary: DauKy/TongPhatSinh/TongThanhToan/CuoiKy)
 */
export interface DebtReportSummary {
  dauKy: number;
  tongPhatSinh: number;
  tongThanhToan: number;
  cuoiKy: number;
}

/**
 * Cân đối công nợ summary — matches C# Tables[2] Loai rows
 * A: tiền mua hàng (Ordered/Completed/Shipped + phí)
 * B: tiền đã trả / chuyển khoản
 * C: tiền đơn Completed
 * F: tiền hàng chưa về VN
 */
export interface CanDoiSummary {
  loaiA: number;
  loaiB: number;
  loaiC: number;
  loaiF: number;
}

/**
 * Debt report data row
 */
export interface DebtReportItem {
  CongNo_ID: number;
  NoiDung: string;
  NgayGhiNo: string;
  DR: number;
  CR: number;
  LuyKe: number;
  GhiChu: string;
}

/**
 * Period (Ky) item
 */
export interface PeriodItem {
  KyID: number;
  TenKy: string;
  NgayBatDau: string;
  NgayKetThuc: string;
  DaDong: boolean;
}

/**
 * Get debt reports with filters and pagination
 * Matches: LoadBaoCaoChiTietCongNo() in C#
 */
export const getDebtReports = async (
  params: DebtReportQueryParams,
): Promise<{
  data: DebtReportItem[];
  total: number;
  page: number;
  limit: number;
  summary: DebtReportSummary;
  canDoiSummary: CanDoiSummary;
}> => {
  const response = await apiClient.get('/debt-reports', { params });
  return response.data;
};

/**
 * Get periods (Ky) for dropdown
 * Matches: LoadDanhSachKy() in C#
 */
export const getPeriods = async (includeClosed?: boolean): Promise<PeriodItem[]> => {
  const response = await apiClient.get('/debt-reports/periods', {
    params: { includeClosed },
  });
  return response.data;
};

/**
 * Get users for dropdown
 * Matches: LoadDataUser() in C#
 */
export const getDebtReportUsers = async (): Promise<{ Id: string; UserName: string }[]> => {
  const response = await apiClient.get('/debt-reports/users');
  return response.data;
};

/**
 * Update debt record
 * Matches: gvCongNo_RowUpdating() in C#
 */
export const updateDebtRecord = async (
  id: number,
  updateData: { noiDung?: string; dr?: number; cr?: number; ghiChu?: string },
): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.put(`/debt-reports/${id}`, updateData);
  return response.data;
};

/**
 * Export debt report to Excel/CSV
 * Matches: btExportToExcelAllWithFilter_Click() in C#
 */
/**
 * Customer Debt Report (BaoCao_CongNoKhachHang)
 * Data: UserName, TienNo, TienHangChuaGiao, PhanTram
 */
export interface CustomerDebtReportItem {
  UserName: string;
  TienNo: number;
  TienHangChuaGiao: number;
  PhanTram: number;
}

export const getCustomerDebtReport = async (): Promise<CustomerDebtReportItem[]> => {
  const response = await apiClient.get('/debt-reports/customer');
  // Handle both array and object response
  const data = response.data;
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object' && Array.isArray((data as any).data)) {
    return (data as any).data;
  }
  // Handle single object response - wrap in array
  if (data && typeof data === 'object' && (data as any).UserName) {
    return [data as CustomerDebtReportItem];
  }
  return [];
};

export const exportCustomerDebtReport = async (): Promise<{ csv: string; filename: string }> => {
  const response = await apiClient.post('/debt-reports/customer/export');
  return response.data;
};

export const exportDebtReport = async (
  username: string,
  fromKyId: number,
  toKyId: number,
): Promise<{ csv: string; filename: string }> => {
  const response = await apiClient.post('/debt-reports/export', {
    username,
    fromKyId,
    toKyId,
  });
  return response.data;
};

// ========== Debt Report by Lot (BaoCao_CongNoKhachHangTheoLo) ==========

export interface LotDebtItem {
  UserName: string;
  NgayLoHang: string;
  TenLoHang: string;
  LoaiTien: string;
  TyGia: number;
  TienLoHangA: number;
  TienPhiHaiQuanB: number;
  TongTienLoHangAB: number;
  DaThu: number;
  ConLai: number;
}

export const getDebtReportByLot = async (
  fromDate?: string,
  toDate?: string,
): Promise<LotDebtItem[]> => {
  const params = new URLSearchParams();
  if (fromDate) params.append('fromDate', fromDate);
  if (toDate) params.append('toDate', toDate);
  const response = await apiClient.get(`/debt-reports/by-lot?${params}`);
  return response.data;
};

export const exportDebtReportByLot = async (
  fromDate?: string,
  toDate?: string,
): Promise<{ csv: string; filename: string }> => {
  const response = await apiClient.post('/debt-reports/by-lot/export', {
    fromDate,
    toDate,
  });
  return response.data;
};

// ========== Debt Report by Shipment Lot (BaoCao_CongNoTheoDotHang) ==========

export interface ShipmentLotDebtItem {
  UserName: string;
  HoTen: string;
  TenDotHang: string;
  NgayVeVN: string;
  TienHang: number;
  TienShip: number;
  TongTien: number;
  PhoneNumber: string;
  DiaChi: string;
}

export const getDebtReportByShipmentLot = async (
  fromDate?: string,
  toDate?: string,
): Promise<ShipmentLotDebtItem[]> => {
  const params = new URLSearchParams();
  if (fromDate) params.append('fromDate', fromDate);
  if (toDate) params.append('toDate', toDate);
  const response = await apiClient.get(`/debt-reports/by-shipment-lot?${params}`);
  return response.data;
};

export const exportDebtReportByShipmentLot = async (
  fromDate?: string,
  toDate?: string,
): Promise<{ csv: string; filename: string }> => {
  const response = await apiClient.post('/debt-reports/by-shipment-lot/export', {
    fromDate,
    toDate,
  });
  return response.data;
};

// ========== Debt Reconciliation (BaoCao_DoiChieuCongNo) ==========

export interface DebtReconciliationItem {
  ordernumber: string;
  UserName: string;
  ngaymuahang: string;
  SoLinkA: number;
  SotienA: number;
  SoLinkB: number;
  SotienB: number;
  tracking_number: string;
  SoTienAVND: number;
  SotienBVND: number;
  KiemTraVND: number;
}

export const getDebtReconciliation = async (
  fromDate?: string,
  toDate?: string,
  username?: string,
  orderNumber?: string,
): Promise<DebtReconciliationItem[]> => {
  const params = new URLSearchParams();
  if (fromDate) params.append('fromDate', fromDate);
  if (toDate) params.append('toDate', toDate);
  if (username) params.append('username', username);
  if (orderNumber) params.append('orderNumber', orderNumber);
  const response = await apiClient.get(`/debt-reports/reconciliation?${params}`);
  return response.data;
};

export const moveToReceived = async (
  ordernumber: string,
): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.post('/debt-reports/reconciliation/move-to-received', {
    ordernumber,
  });
  return response.data;
};

export const updateOrderTotalVND = async (
  ordernumber: string,
  trackingNumber: string,
  tongTienOrderVND: number,
): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.put('/debt-reports/reconciliation/update-total-vnd', {
    ordernumber,
    trackingNumber,
    tongTienOrderVND,
  });
  return response.data;
};

export const exportDebtReconciliation = async (
  fromDate?: string,
  toDate?: string,
  username?: string,
  orderNumber?: string,
): Promise<{ csv: string; filename: string }> => {
  const response = await apiClient.post('/debt-reports/reconciliation/export', {
    fromDate,
    toDate,
    username,
    orderNumber,
  });
  return response.data;
};

// ========== BaoCao_TongDoanhThu ==========

export interface TotalRevenueItem {
  dauKy: number;
  phanNo: number;
  phanCo: number;
  chenhLech: number;
  canDoi: number;
}

export const getTotalRevenue = async (
  fromDate?: string,
  toDate?: string,
): Promise<TotalRevenueItem> => {
  const params = new URLSearchParams();
  if (fromDate) params.append('fromDate', fromDate);
  if (toDate) params.append('toDate', toDate);
  const response = await apiClient.get(`/debt-reports/total-revenue?${params}`);
  return response.data;
};

// ========== BaoCao_TongCongNoTheoUser ==========

export interface DebtByUserItem {
  UserName: string;
  DauKy: number;
  PhanThu: number;
  PhanChi: number;
  CuoiKy: number;
}

export const getDebtByUser = async (
  fromDate?: string,
  toDate?: string,
  username?: string,
): Promise<DebtByUserItem[]> => {
  const params = new URLSearchParams();
  if (fromDate) params.append('fromDate', fromDate);
  if (toDate) params.append('toDate', toDate);
  if (username) params.append('username', username);
  const response = await apiClient.get(`/debt-reports/debt-by-user?${params}`);
  return response.data;
};

export const exportDebtByUser = async (
  fromDate?: string,
  toDate?: string,
  username?: string,
): Promise<{ csv: string; filename: string }> => {
  const response = await apiClient.post('/debt-reports/debt-by-user/export', {
    fromDate,
    toDate,
    username,
  });
  return response.data;
};

// ========== BaoCao_PhanTichLaiLoTheoLoHang ==========

export interface ProfitLossByLotItem {
  NgayLoHang: string;
  TenLoHang: string;
  TienLoHangA: number;
  TienPhiHaiQuanB: number;
  TongTienLoHangAB: number;
  TienChiPhiLoHangC: number;
  LaiLoD: number;
}

export const getProfitLossByLot = async (
  fromDate?: string,
  toDate?: string,
): Promise<ProfitLossByLotItem[]> => {
  const params = new URLSearchParams();
  if (fromDate) params.append('fromDate', fromDate);
  if (toDate) params.append('toDate', toDate);
  const response = await apiClient.get(`/debt-reports/profit-loss-by-lot?${params}`);
  return response.data;
};

export const exportProfitLossByLot = async (
  fromDate?: string,
  toDate?: string,
): Promise<{ csv: string; filename: string }> => {
  const response = await apiClient.post('/debt-reports/profit-loss-by-lot/export', {
    fromDate,
    toDate,
  });
  return response.data;
};

// ========== BaoCao_InPhieuShipTheoDotHang ==========

export interface ShippingSlipCustomerInfo {
  HoTen: string;
  PhoneNumber: string;
  DiaChiNhanHang: string;
  NgayVeVN: string;
  TongTien: number;
  TienShipVeVN: number;
  TienShipTrongNuoc: number;
  TienHang: number;
  TienDatCoc: number;
  TienPhaiThanhToan: number;
}

export interface ShippingSlipOrderItem {
  ID: number;
  MaSoHang: string;
  linkhinh: string;
  corlor: string;
  size: string;
  soluong: number;
  dongiaweb: number;
  tongtienVND: number;
}

export interface ShippingSlipData {
  customerInfo: ShippingSlipCustomerInfo;
  orderItems: ShippingSlipOrderItem[];
}

export const getShippingSlip = async (
  orderId: string,
  userName: string,
): Promise<ShippingSlipData> => {
  const params = new URLSearchParams();
  params.append('orderId', orderId);
  params.append('user', userName);
  const response = await apiClient.get(`/debt-reports/shipping-slip?${params}`);
  return response.data;
};

// ========== Debt Management (ManageCongNo) ==========

export interface DebtManagementQuery {
  username?: string;
  status?: number;
  loaiPhatSinh?: string | null;
  bankAccount?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
  /** Lọc theo tuyến. Chuỗi rỗng nghĩa là không lọc (xem getDebtManagementList). */
  quocGiaId?: number | string;
  /** Lọc theo lô hàng — là NGÀY dạng yyyy-MM-dd. */
  loHang?: string;
  /** Lọc theo order number của đơn, khớp một phần. */
  orderNumber?: string;
}

export interface DebtManagementItem {
  CongNo_ID: number;
  UserName: string;
  NoiDung: string;
  NgayGhiNo: string;
  DR: number;
  /** Doanh thu và phụ thu cộng lại thành DR. Dòng cũ chưa tách thì null. */
  DoanhThu?: number | null;
  PhuThu?: number | null;
  CR: number;
  GhiChu: string;
  Status: boolean;
  NguoiTao: string;
  LoHangID?: number;
  TenLoHang?: string;
  LoaiPhatSinh?: number;
  LoaiPhatSinhText?: string;
  NguoiCapNhatCuoi?: string;
  NgayCapNhatCuoi?: string;
  SanLuong?: number; // Sản lượng (kg) — chỉ có giá trị khi loại "Cân Kg" (LoaiPhatSinh = 8)
  DonHang_ID?: number | null; // FK đơn hàng; null với công nợ thủ công
  OrderNumber?: string | null; // Mã đơn hàng (DonHang.ordernumber) — để kế toán đối chiếu
  Tuyen?: string | null; // Tuyến = Quốc gia (tbQuocGia.TenQuocGia)
  QuocGiaID?: number | null; // FK tbQuocGia tự nhập trên công nợ (độc lập với đơn hàng)
}

export interface DebtManagementResponse {
  data: DebtManagementItem[];
  total: number;
  page: number;
  limit: number;
}

export const getDebtManagementList = async (
  params: DebtManagementQuery,
): Promise<DebtManagementResponse> => {
  // Bỏ quocGiaId khi để trống: DTO ép kiểu số nên chuỗi rỗng thành NaN và
  // request bị chặn ở tầng xác thực. Không gửi = không lọc theo tuyến.
  const { quocGiaId, ...rest } = params;
  const query =
    quocGiaId === '' || quocGiaId === undefined || quocGiaId === null
      ? rest
      : { ...rest, quocGiaId: Number(quocGiaId) };
  const response = await apiClient.get('/debt-reports/management/list', { params: query });
  return response.data;
};

export interface CreateDebtParams {
  username: string;
  noiDung: string;
  ngay: string;
  dr?: number;
  cr?: number;
  ghiChu?: string;
  loHangId?: number;
  loaiPhatSinh?: number;
  bankAccount?: string;
  status?: number;
  allowEmptyNoiDung?: boolean;
  sanLuong?: number; // Sản lượng (kg) — gửi khi loaiPhatSinh === 8
  quocGiaId?: number; // Tuyến (Quốc gia)
  /** Doanh thu + phụ thu — máy chủ cộng lại thành phát sinh nợ (dr). */
  doanhThu?: number;
  phuThu?: number;
}

export const createDebt = async (data: CreateDebtParams): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.post('/debt-reports/management', data);
  return response.data;
};

export interface ImportDebtRow {
  username: string;
  noiDung: string;
  ngay: string;
  dr?: number;
  cr?: number;
  /** Hai khoản tách ra của phát sinh nợ; máy chủ tự cộng thành DR. */
  doanhThu?: number;
  phuThu?: number;
  ghiChu?: string;
  loaiPhatSinh?: number;
  bankAccount?: string;
  sanLuong?: number;
  quocGiaId?: number; // Tuyến (Quốc gia)
}

export interface ImportDebtResult {
  row: number;
  success: boolean;
  message?: string;
}

export interface ImportDebtResponse {
  successCount: number;
  failCount: number;
  results: ImportDebtResult[];
}

export const importCreateDebts = async (rows: ImportDebtRow[]): Promise<ImportDebtResponse> => {
  const response = await apiClient.post('/debt-reports/management/import', { rows });
  return response.data;
};

export interface UpdateDebtParams {
  username?: string;
  noiDung?: string;
  dr?: number;
  cr?: number;
  ghiChu?: string;
  status?: number;
  loHangId?: number;
  updatedBy?: string;
  loaiPhatSinh?: number; // dùng để backend quyết định lưu/null sản lượng khi sửa
  sanLuong?: number; // Sản lượng (kg) — gửi khi loaiPhatSinh === 8
  quocGiaId?: number; // Tuyến (Quốc gia)
  /** Doanh thu + phụ thu — máy chủ cộng lại thành phát sinh nợ (dr). */
  doanhThu?: number;
  phuThu?: number;
}

export const updateDebt = async (
  id: number,
  data: UpdateDebtParams,
): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.put(`/debt-reports/management/${id}`, data);
  return response.data;
};

export const deleteDebt = async (id: number): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.delete(`/debt-reports/management/${id}`);
  return response.data;
};

export const approveDebt = async (id: number): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.post(`/debt-reports/management/${id}/approve`);
  return response.data;
};

export interface BankAccount {
  ID: number;
  TenTaiKhoanNganHang: string;
  GhiChu?: string;
}

export const getBankAccounts = async (): Promise<BankAccount[]> => {
  const response = await apiClient.get('/debt-reports/management/bank-accounts');
  return response.data;
};

export const getChuyenKhoanPendingList = async (username: string): Promise<DebtManagementItem[]> => {
  const response = await apiClient.get('/debt-reports/user/chuyen-khoan', { params: { username } });
  return response.data;
};

export interface BatchItem {
  LoHang_ID: number;
  TenLoHang: string;
  NgayLoHang: string;
}

export const getBatchesByUsername = async (username: string): Promise<BatchItem[]> => {
  const response = await apiClient.get('/debt-reports/management/batches', { params: { username } });
  return response.data;
};

// ========== Shippers ==========

export interface Shipper {
  ID: number;
  ShipperName: string;
  ShipperPhone: string;
  ShipperAddress: string;
}

export const getShippers = async (): Promise<Shipper[]> => {
  const response = await apiClient.get('/shippers');
  return response.data;
};

export interface NhaVanChuyen {
  NhaVanChuyenID: number;
  TenNhaVanChuyen: string;
}

export const getNhaVanChuyen = async (): Promise<NhaVanChuyen[]> => {
  const response = await apiClient.get('/tracking/dropdown/nha-van-chuyen');
  return response.data;
};

export const getShipper = async (id: number): Promise<Shipper> => {
  const response = await apiClient.get(`/shippers/${id}`);
  return response.data;
};

// Alias for getShipper
export const getShipperById = getShipper;

// ========== Shipment Groups (DotHang) ==========

export interface ShipmentGroupQuery {
  username?: string;
  page?: number;
  limit?: number;
  search?: string;
}

export interface ShipmentGroupItem {
  tenDotHang: string;
  username: string;
  shipperName?: string;
  shipperID?: number;
  soVanDon?: string;
  phiShipTrongNuoc?: number;
  soLuongHang?: number;
  ngayVeVN?: string;
  ngayGuiHang?: string;
  trangThai?: string;
}

export const getShipmentGroups = async (params: ShipmentGroupQuery): Promise<{ data: ShipmentGroupItem[]; total: number }> => {
  const response = await apiClient.get('/shipment-groups', { params });
  return response.data;
};

export const getShipmentGroupByUsernameAndTenDotHang = async (username: string, tenDotHang: string): Promise<any> => {
  const response = await apiClient.get(`/shipment-groups/${username}/${tenDotHang}`);
  return response.data;
};

export interface UpdateShipmentGroupShipParams {
  shipperId: number;
  ngayGuiHang: string;
  soVanDon: string;
  phiShipTrongNuoc: number;
}

export const updateShipmentGroupShip = async (
  username: string,
  tenDotHang: string,
  params: UpdateShipmentGroupShipParams,
): Promise<any> => {
  const response = await apiClient.put(`/shipment-groups/${username}/${tenDotHang}/ship`, params);
  return response.data;
};

export interface UpdateShipmentGroupShipFromDebtReportParams extends UpdateShipmentGroupShipParams {
  diaChiNhanHang: string;
  datCoc: number;
}

export const updateShipmentGroupShipFromDebtReport = async (
  username: string,
  tenDotHang: string,
  params: UpdateShipmentGroupShipFromDebtReportParams,
): Promise<any> => {
  const response = await apiClient.put(`/shipment-groups/${username}/${tenDotHang}/ship1`, params);
  return response.data;
};

export const completeShipmentGroup = async (username: string, tenDotHang: string): Promise<any> => {
  const response = await apiClient.put(`/shipment-groups/${username}/${tenDotHang}/complete`);
  return response.data;
};

export interface BatchInfo {
  tenDotHang: string;
  username: string;
  shipperName?: string;
  shipperID?: number;
  shipperPhone?: string;
  shipperAddress?: string;
  soVanDon?: string;
  phiShipTrongNuoc?: number;
  soLuongHang?: number;
  ngayVeVN?: string;
  ngayGuiHang?: string;
  trangThai?: string;
  orders?: any[];
}

export const getBatchInfo = async (tenDotHang: string, username: string): Promise<BatchInfo> => {
  const response = await apiClient.get(`/shipment-groups/${username}/${tenDotHang}`);
  return response.data;
};

// ========== Shipping Requests (YeuCauShipHang) ==========

export interface ShippingRequestItem {
  TenDotHang: string;
  MaDatHang: number;
  CanNang: number;
  PhiShipVeVN_USD: number;
  TyGia: number;
  PhiShipVeVN_VND: number;
  TienHangUSD: number;
  TienHangVND: number;
}

export interface ShippingRequestQuery {
  username: string;
  status?: number; // 0 = chua yeu cau, 1 = dang yeu cau
}

export const getShippingRequests = async (params: ShippingRequestQuery): Promise<ShippingRequestItem[]> => {
  const response = await apiClient.get('/shipping-requests', { params });
  return response.data;
};

export const createShippingRequest = async (params: {
  tenDotHang: string;
  username: string;
  ghiChu?: string;
}): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.post('/shipping-requests', params);
  return response.data;
};

// ========== Orders (for edit order) ==========

export const getOrderById = async (id: number): Promise<any> => {
  const response = await apiClient.get(`/orders/${id}`);
  const order = response.data || {};

  return {
    ...order,
    id: order.id ?? order.ID,
    username: order.username ?? order.UserName,
    linkWeb: order.linkWeb ?? order.linkweb,
    linkHinh: order.linkHinh ?? order.linkhinh,
    color: order.color ?? order.corlor,
    soLuong: order.soLuong ?? order.soluong,
    donGiaWeb: order.donGiaWeb ?? order.dongiaweb,
    saleOff: order.saleOff ?? order.saleoff,
    ghiChu: order.ghiChu ?? order.ghichu,
    trangThaiOrder: order.trangThaiOrder ?? order.trangthaiOrder,
    loaiTien: order.loaiTien ?? order.loaitien,
    tyGia: order.tyGia ?? order.tygia,
    websiteName: order.websiteName ?? order.WebsiteName,
    loaiHangId: order.loaiHangId ?? order.LoaiHangID,
    maSoHang: order.maSoHang ?? order.MaSoHang,
    quocGiaId: order.quocGiaId ?? order.QuocGiaID,
    hangKhoan: order.hangKhoan ?? order.HangKhoan,
  };
};

export const updateOrderForUser = async (id: number, order: {
  websiteName: string;
  username: string;
  linkWeb: string;
  linkHinh: string;
  color: string;
  size: string;
  soLuong: number;
  donGiaWeb: number;
  loaiTien: string;
  ghiChu: string;
  tyGia: number;
  saleOff: number;
  loaiHangId?: number | null;
  maSoHang?: string;
  quocGiaId?: number | null;
  nguoiTao: string;
}): Promise<{ success: boolean }> => {
  const response = await apiClient.put<{ success: boolean }>(`/orders/${id}/user-update`, order);
  return response.data;
};

export interface CreateShipperParams {
  shipperName: string;
  shipperPhone: string;
  shipperAddress?: string;
}

export const createShipper = async (
  data: CreateShipperParams,
): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.post('/shippers', data);
  return response.data;
};

export interface UpdateShipperParams {
  shipperName?: string;
  shipperPhone?: string;
  shipperAddress?: string;
}

export const updateShipper = async (
  id: number,
  data: UpdateShipperParams,
): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.put(`/shippers/${id}`, data);
  return response.data;
};

export const deleteShipper = async (id: number): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.delete(`/shippers/${id}`);
  return response.data;
};

// ========== Q&A ==========

export interface QnaQuery {
  username?: string;
  daTraLoi?: number;
  page?: number;
  limit?: number;
}

export interface QnaItem {
  ID: number;
  username: string;
  CauHoi: string;
  TraLoi: string | null;
  NgayTao: string;
  NgayTraLoi: string | null;
}

export interface QnaResponse {
  data: QnaItem[];
  total: number;
  page: number;
  limit: number;
}

export const getQnaList = async (params: QnaQuery): Promise<QnaResponse> => {
  const response = await apiClient.get('/qna', { params });
  return response.data;
};

export const createQna = async (
  cauHoi: string,
): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.post('/qna', { cauHoi });
  return response.data;
};

export const answerQna = async (
  id: number,
  traLoi: string,
): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.put(`/qna/${id}/answer`, { traLoi });
  return response.data;
};

export const deleteQna = async (id: number): Promise<{ success: boolean; message?: string }> => {
  const response = await apiClient.delete(`/qna/${id}`);
  return response.data;
};

/**
 * Get list of usernames for can hang dropdown
 */
export const getUsernames = async (): Promise<{ username: string }[]> => {
  const response = await apiClient.get<{ username: string }[]>('/orders/usernames');
  return response.data;
};

/**
 * Get exchange rates
 */
export const getExchangeRates = async () => {
  const response = await apiClient.get<{ data: { Name: string; TyGiaVND: number }[] }>('/exchange-rates');
  return response.data.data;
};

export interface TyGiaItem {
  Name: string;
  TyGiaVND: number;
  CongShipVeVN: number;
}

export const getTyGia = async (): Promise<TyGiaItem[]> => {
  const response = await apiClient.get<{ data: TyGiaItem[] }>('/ty-gia');
  return response.data.data || [];
};

/**
 * Get countries (alias for getQuocGia)
 */
/**
 * Danh sách tuyến.
 *
 * `tatCa = true` lấy cả tuyến đã ngừng dùng — chỉ dùng cho Ô LỌC, để còn tra
 * được đơn/công nợ cũ thuộc tuyến đó. Ô NHẬP LIỆU thì để mặc định, không hiện
 * tuyến đã ngừng ra cho CSKH chọn nhầm.
 */
export const getCountries = async () => {
  const response = await apiClient.get<{ QuocGiaID: number; TenQuocGia: string; PhiShipVeVN?: number }[]>('/orders/countries');
  return response.data;
};

/**
 * Get list of batches (DotHang) for can hang dropdown
 */
export const getBatches = async (): Promise<{ tenDotHang: string }[]> => {
  const response = await apiClient.get<{ tenDotHang: string }[]>('/orders/batches');
  return response.data;
};

export interface LoHangBatchItem {
  LoHangID: number;
  TenLoHang: string;
  NgayLoHang?: string;
}

export const getLoHangBatches = async (): Promise<LoHangBatchItem[]> => {
  const response = await apiClient.get<{ data: LoHangBatchItem[] }>('/batches', {
    params: { pageSize: 10000 },
  });
  return response.data.data || [];
};

/**
 * Get batch details by TenLoHang (for public lot info page)
 * Returns batch info, ship costs, customs, and tracking list
 */
export const getBatchByTenLoHang = async (tenLoHang: string): Promise<any> => {
  const response = await apiClient.get(`/batches/ten/${tenLoHang}`);
  return response.data;
};

/**
 * Get product types (LoaiHang) for can hang dropdown
 */
export const getProductTypes = async (): Promise<{ LoaiHangID: number; TenLoaiHang: string }[]> => {
  const response = await apiClient.get<{ data: { LoaiHangID: number; TenLoaiHang: string }[]}>('/orders/product-types');
  return response.data.data;
};

/**
 * Get order status counts for can hang page
 */
export const getStatusCounts = async (): Promise<Record<string, number>> => {
  const response = await apiClient.get<Record<string, number>>('/orders/status-counts');
  return response.data;
};

/**
 * Get current user's order status counts for DanhSachDonHang.
 */
export const getUserStatusCounts = async (username: string, hangKhoan = -1): Promise<Record<string, number>> => {
  const response = await apiClient.get<{ trangthaiOrder: string; SL: number }[]>('/orders/user-status-counts', {
    params: { username, hangKhoan },
  });

  return response.data.reduce<Record<string, number>>((counts, row) => {
    counts[row.trangthaiOrder] = Number(row.SL) || 0;
    return counts;
  }, {});
};

/**
 * Get list of countries (QuocGia) for dropdown
 */
export const getQuocGia = async () => {
  const response = await apiClient.get<{ QuocGiaID: number; TenQuocGia: string; PhiShipVeVN?: number }[]>('/orders/countries');
  return response.data;
};

/**
 * Danh sách tuyến ĐỦ, kể cả tuyến đã ngừng dùng.
 *
 * Tách hẳn thành hàm riêng thay vì thêm tham số vào `getQuocGia`: nhiều nơi
 * truyền thẳng `getQuocGia` làm `queryFn` cho react-query, mà react-query tự
 * nhét tham số ngữ cảnh vào — thêm tham số là vỡ một loạt màn không liên quan.
 *
 * Chỉ dùng cho Ô LỌC, để còn tra ra được đơn/công nợ cũ thuộc tuyến đã ngừng.
 */
export const getQuocGiaTatCa = async () => {
  const response = await apiClient.get<{ QuocGiaID: number; TenQuocGia: string; PhiShipVeVN?: number }[]>(
    '/orders/countries?all=1',
  );
  return response.data;
};

/**
 * Calculate shipping fee
 */
export const calculateShipping = async (params: {
  weight: number;
  loaiHangId: number;
  loaiTien: string;
  username: string;
}): Promise<{ shippingFee: number }> => {
  const response = await apiClient.post<{ shippingFee: number }>('/orders/calculate-shipping', params);
  return response.data;
};

/**
 * Calculate service fee (GiaTienCong) for EditOrderDetail
 */
export const calculateServiceFee = async (params: {
  loaiTien?: string;
  donGiaWeb?: number;
  loaitien?: string;
  dongiaweb?: number;
  username: string;
}): Promise<{ tienCong1Mon: number; tinhTheoPhanTram: boolean }> => {
  // Support both camelCase and snake_case
  const payload = {
    loaiTien: params.loaiTien || params.loaitien || 'USD',
    donGiaWeb: params.donGiaWeb || params.dongiaweb || 0,
    username: params.username,
  };
  const response = await apiClient.post<{ tienCong1Mon: number; tinhTheoPhanTram: boolean }>(
    '/orders/calculate-fee',
    payload
  );
  return response.data;
};

/**
 * Update order detail (full edit flow from EditOrderDetail.aspx)
 * Includes: permission check, update, logging, ngayVeVN update
 */
export const updateOrderDetail = async (
  id: number,
  data: {
    username: string;
    linkweb?: string;
    linkhinh?: string;
    corlor?: string;
    size?: string;
    soluong: number;
    dongiaweb: number;
    saleoff: number;
    phuthu: number;
    shipUSA: number;
    tax: number;
    cong: number;
    loaitien: string;
    ghichu?: string;
    tygia: number;
    giasauoffUSD: number;
    giasauoffVND: number;
    tiencongUSD: number;
    tiencongVND: number;
    tongtienUSD: number;
    tongtienVND: number;
    ordernumber?: string;
    trangthaiOrder?: string;
    ngaymuahang?: string;
    ngayveVN?: string;
    /** Ngày hoàn thành (DD/MM/YYYY hoặc YYYY-MM-DD) — chỉ dùng khi trangthaiOrder = 'Completed' */
    ngayHoanThanh?: string;
    adminNote?: string;
    LoaiHangID?: number;
    QuocGiaID?: number;
    usernamesave?: string;
    nguoiTao: string;
  }
): Promise<{ success: boolean; error?: string }> => {
  const response = await apiClient.put<{ success: boolean; error?: string }>(
    `/orders/${id}/detail`,
    data
  );
  // Throw error if API returns success: false
  if (response.data.success === false && response.data.error) {
    throw new Error(response.data.error);
  }
  return response.data;
};

/**
 * Generic image upload. Backend resizes to 640x480 and stores under
 * /imgLink/YYYYMM/. Caller passes the returned `linkHinh` in subsequent
 * create/update payloads (orders, tracking detail, purchased/in-stock items).
 */
export const uploadImage = async (file: File): Promise<{ linkHinh: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ linkHinh: string }>(
    '/upload/image',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );
  return response.data;
};

/**
 * Get exchange rates for EditOrderDetail
 */
export const getExchangeRatesForEdit = async () => {
  const response = await apiClient.get<any>(
    '/orders/exchange-rates'
  );
  // Handle both wrapped and unwrapped response
  return response.data?.data || response.data;
};

/**
 * Get product types for EditOrderDetail
 */
export const getProductTypesForEdit = async (): Promise<{ LoaiHangID: number; TenLoaiHang: string }[]> => {
  const response = await apiClient.get<{ LoaiHangID: number; TenLoaiHang: string }[]>(
    '/orders/product-types-detail'
  );
  return response.data;
};

// ========== Authentication ==========

export interface LoginParams {
  username: string;
  password: string;
}

export interface AuthUser {
  id: number;
  username: string;
  email?: string;
  hoTen?: string;
  roles: string[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RegisterParams {
  username: string;
  email: string;
  password: string;
  hoTen?: string;
  diaChi?: string;
  tinhThanh?: string;
  soTaiKhoan?: string;
  hinhThucNhanHang?: string;
  khachBuon?: boolean;
  linkTaiKhoanMang?: string;
  vungMien?: string;
  /** Tên đăng nhập của CSKH phụ trách mã khách này, vd `CSKHMAILINH`. */
  cskhPhuTrach?: string;
}

/**
 * Danh sách CSKH để đổ vào ô chọn "CSKH phụ trách".
 *
 * Chỉ gồm người đang làm việc — tài khoản đã đóng mã không hiện ra để gán thêm
 * khách mới, nhưng mã khách cũ vẫn giữ nguyên tên người đã nghỉ.
 */
export const getDanhSachCskh = async (): Promise<{ username: string; hoTen: string }[]> => {
  const res = await apiClient.get('/users/cskh');
  return res.data;
};

/**
 * Login user
 * POST /auth/login
 */
export const login = async (params: LoginParams): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/auth/login', params);
  return response.data;
};

/**
 * Register new user
 * POST /auth/register
 */
export const register = async (
  params: RegisterParams,
): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/auth/register', params);
  return response.data;
};

/**
 * Refresh access token
 * POST /auth/refresh
 */
export const refreshToken = async (
  refreshToken: string,
): Promise<{ accessToken: string }> => {
  const response = await apiClient.post<{ accessToken: string }>('/auth/refresh', {
    refreshToken,
  });
  return response.data;
};

/**
 * Get current user profile
 * GET /auth/profile
 */
export const getProfile = async (): Promise<AuthUser> => {
  const response = await apiClient.get<AuthUser>('/auth/profile');
  return response.data;
};

/**
 * Get all roles
 * GET /auth/roles
 */
export const getRoles = async (): Promise<{ Id: number; Name: string }[]> => {
  const response = await apiClient.get<{ Id: number; Name: string }[]>('/auth/roles');
  return response.data;
};

// ========== Tracking ==========

export interface TrackingSearchResult {
  found: boolean;
  message?: string;
  history?: { ngay: string; tinhTrang: string; moTa: string; ghiChu: string }[];
  /** Ảnh hàng kho đã chụp (đường dẫn /imgLink/...). */
  anh?: string[];
}

/**
 * Search tracking by code (public endpoint)
 * GET /tracking/search/:code
 */
export const searchTracking = async (code: string): Promise<TrackingSearchResult> => {
  const response = await apiClient.get<TrackingSearchResult>(`/tracking/search/${code}`);
  return response.data;
};

/**
 * Get tracking list with filters
 * GET /tracking
 */
export interface TrackingQueryParams {
  username?: string;
  statuses?: string;
  search?: string;
  trackingNumber?: string;
  tenLoHang?: string;
  quocGiaId?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export type TrackingListItem = Record<string, string | number | null | undefined>;

export const getTracking = async (params: TrackingQueryParams): Promise<any[]> => {
  const response = await apiClient.get('/tracking', { params });
  return response.data.data || [];
};

/**
 * Get tracking list with full response (including pagination)
 * GET /tracking
 */
export const getTrackingList = async (params: TrackingQueryParams): Promise<{
  data: TrackingListItem[];
  total: number;
  page: number;
  limit: number;
}> => {
  const response = await apiClient.get('/tracking', { params });
  return response.data;
};

export const getTrackingCounts = async (username?: string): Promise<Record<string, number>> => {
  const response = await apiClient.get('/tracking/counts', { params: { username } });
  return response.data;
};

/**
 * Get tracking by ID
 * GET /tracking/:id
 */
export const getTrackingById = async (id: number): Promise<any> => {
  const response = await apiClient.get(`/tracking/${id}`);
  return response.data;
};

/**
 * Get tracking details
 * GET /tracking/:id/details
 */
export const getTrackingDetails = async (id: number): Promise<any> => {
  const response = await apiClient.get(`/tracking/${id}/details`);
  return response.data;
};

export interface TrackingSaveData {
  username?: string;
  trackingNumber?: string;
  orderNumber?: string;
  ngayDatHang?: string;
  nhaVanChuyenId?: number;
  quocGiaId?: number;
  tinhTrang?: string;
  ghiChu?: string;
  kien?: string;
  mawb?: string;
  hawb?: string;
  nguoiTao?: string;
}

/**
 * Create tracking
 * POST /tracking
 */
export const createTracking = async (data: TrackingSaveData): Promise<any> => {
  const response = await apiClient.post('/tracking', data);
  return response.data;
};

/**
 * Update tracking
 * PUT /tracking/:id
 */
export const updateTracking = async (id: number, data: TrackingSaveData): Promise<any> => {
  const response = await apiClient.put(`/tracking/${id}`, data);
  return response.data;
};

export interface TrackingDetailSaveData {
  linkHinh: string;
  soLuong: number;
  gia: number;
  ghiChu: string;
  nguoiTao?: string;
}

export const addTrackingDetail = async (
  trackingId: number,
  data: TrackingDetailSaveData,
): Promise<any> => {
  const response = await apiClient.post(`/tracking/${trackingId}/chi-tiet`, data);
  return response.data;
};

export const updateTrackingDetail = async (
  trackingId: number,
  detailId: number,
  data: TrackingDetailSaveData,
): Promise<any> => {
  const response = await apiClient.put(`/tracking/${trackingId}/chi-tiet/${detailId}`, data);
  return response.data;
};

export const deleteTrackingDetail = async (
  trackingId: number,
  detailId: number,
): Promise<void> => {
  await apiClient.delete(`/tracking/${trackingId}/chi-tiet/${detailId}`);
};

/**
 * Delete tracking (soft delete)
 * DELETE /tracking/:id
 */
export const deleteTracking = async (id: number): Promise<void> => {
  await apiClient.delete(`/tracking/${id}`);
};

/**
 * Get tracking history
 * GET /tracking/:id/history
 */
export const getTrackingHistory = async (id: number): Promise<any[]> => {
  const response = await apiClient.get(`/tracking/${id}/history`);
  return response.data;
};

// ========== Dashboard (thống kê admin) ==========

/**
 * API Methods cho Dashboard admin.
 * Tham số ngày dạng dd/MM/yyyy (khớp flatpickr 'd/m/Y'); bỏ trống -> BE mặc định tháng hiện tại.
 */

export interface DashboardNewCustomer {
  ngay: string;
  soKHMoi: number;
}

export interface DashboardRevenue {
  ngay: string;
  doanhThu: number;
  soDon: number;
}

export interface DashboardOutputDaily {
  ngay: string;
  sanLuongKg: number;
}

export interface DashboardStaffOutput {
  nhanVien: string;
  thang: string;
  soDon: number;
  sanLuongKg: number;
}

export interface DashboardStaffOutputDetail {
  ngayGhiNo: string;
  khachHang: string;
  noiDung: string;
  sanLuongKg: number;
  ghiChu: string;
}

const buildDateParams = (fromDate?: string, toDate?: string): string => {
  const params = new URLSearchParams();
  if (fromDate) params.append('fromDate', fromDate);
  if (toDate) params.append('toDate', toDate);
  return params.toString();
};

/** KH mới theo ngày. */
export const getDashboardNewCustomers = async (
  fromDate?: string,
  toDate?: string,
): Promise<DashboardNewCustomer[]> => {
  const response = await apiClient.get(`/dashboard/new-customers?${buildDateParams(fromDate, toDate)}`);
  return response.data;
};

/** Doanh thu theo ngày (đơn đã hoàn tất). */
export const getDashboardRevenue = async (
  fromDate?: string,
  toDate?: string,
): Promise<DashboardRevenue[]> => {
  const response = await apiClient.get(`/dashboard/revenue?${buildDateParams(fromDate, toDate)}`);
  return response.data;
};

/** Sản lượng (kg) theo ngày. */
export const getDashboardOutputDaily = async (
  fromDate?: string,
  toDate?: string,
): Promise<DashboardOutputDaily[]> => {
  const response = await apiClient.get(`/dashboard/output-daily?${buildDateParams(fromDate, toDate)}`);
  return response.data;
};

/** Sản lượng mỗi nhân viên theo tháng (số đơn + kg), lọc được theo Tuyến (Quốc gia). */
/** Một dòng của bảng "Sản lượng theo tuyến": mỗi tuyến, mỗi tháng. */
export interface DashboardRouteOutput {
  quocGiaId: number | null;
  tenTuyen: string;
  thang: string;
  soDon: number;
  sanLuongKg: number;
}

/**
 * Sản lượng gom theo TUYẾN — không nhận bộ lọc tuyến, vì mục đích của nó là
 * bày cả Hàn / Anh / Mỹ cạnh nhau để so.
 */
export const getDashboardOutputByRoute = async (
  fromDate?: string,
  toDate?: string,
): Promise<DashboardRouteOutput[]> => {
  const params = new URLSearchParams(buildDateParams(fromDate, toDate));
  const response = await apiClient.get(`/dashboard/output-by-route?${params}`);
  return response.data;
};

export const getDashboardOutputByStaff = async (
  fromDate?: string,
  toDate?: string,
  quocGiaId?: number,
): Promise<DashboardStaffOutput[]> => {
  const params = new URLSearchParams(buildDateParams(fromDate, toDate));
  if (quocGiaId) params.append('quocGiaId', String(quocGiaId));
  const response = await apiClient.get(`/dashboard/output-by-staff?${params}`);
  return response.data;
};

/** Chi tiết từng bản ghi CONGNO của 1 nhân viên trong 1 tháng, lọc được theo Tuyến. */
export const getDashboardOutputDetail = async (
  nhanVien: string,
  thang: string,
  quocGiaId?: number,
): Promise<DashboardStaffOutputDetail[]> => {
  const params = new URLSearchParams({ nhanVien, thang });
  if (quocGiaId) params.append('quocGiaId', String(quocGiaId));
  const response = await apiClient.get(`/dashboard/output-detail?${params}`);
  return response.data;
};

/* ------------------------------------------------------------------ Bài viết */

export interface ArticleListItem {
  Id: number;
  Title: string;
  Slug: string;
  Excerpt: string | null;
  Thumbnail: string | null;
  Author: string | null;
  ArticleType: string;
  Published: boolean;
  PublishedAt: string | null;
  MetaTitle: string | null;
  MetaDescription: string | null;
  FocusKeyword: string | null;
  Noindex: boolean;
  ViewCount: number;
  CreatedAt: string;
  CreatedBy: string | null;
  UpdatedAt: string | null;
  UpdatedBy: string | null;
}

export interface SeoCheck {
  key: string;
  label: string;
  status: 'good' | 'warning' | 'error';
  message: string;
}

export interface SeoResult {
  score: number;
  checks: SeoCheck[];
}

export interface ArticleDetail extends ArticleListItem {
  Content: string;
  CanonicalUrl: string | null;
  OgTitle: string | null;
  OgDescription: string | null;
  OgImage: string | null;
  seo: SeoResult;
}

export interface ArticlePayload {
  title: string;
  content: string;
  slug?: string;
  excerpt?: string;
  thumbnail?: string;
  author?: string;
  articleType?: string;
  published?: boolean;
  /** Ngày đăng hiện trên bài, dạng `yyyy-mm-dd`. Trống = lấy ngày bấm Đăng bài. */
  publishedAt?: string;
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  noindex?: boolean;
}

export interface ArticleListResponse {
  data: ArticleListItem[];
  total: number;
  page: number;
  limit: number;
}

export const getArticles = async (params: {
  q?: string;
  articleType?: string;
  published?: number;
  page?: number;
  limit?: number;
}): Promise<ArticleListResponse> => {
  const response = await apiClient.get('/articles', { params });
  return response.data;
};

export const getArticle = async (id: number): Promise<ArticleDetail> => {
  const response = await apiClient.get(`/articles/${id}`);
  return response.data;
};

export const createArticle = async (payload: ArticlePayload): Promise<ArticleDetail> => {
  const response = await apiClient.post('/articles', payload);
  return response.data;
};

export const updateArticle = async (
  id: number,
  payload: Partial<ArticlePayload>,
): Promise<ArticleDetail> => {
  const response = await apiClient.put(`/articles/${id}`, payload);
  return response.data;
};

export const deleteArticle = async (id: number): Promise<{ success: boolean }> => {
  const response = await apiClient.delete(`/articles/${id}`);
  return response.data;
};

/** Chấm điểm SEO cho bài đang soạn, chưa cần lưu */
export const previewArticleSeo = async (
  payload: ArticlePayload,
): Promise<{ slug: string; seo: SeoResult }> => {
  const response = await apiClient.post('/articles/seo-preview', payload);
  return response.data;
};

/**
 * Tải ảnh lên cho bài viết (ảnh đại diện hoặc ảnh chèn trong nội dung).
 *
 * Dùng lại endpoint chung `/upload/image` mà các module khác đã dùng — trả về
 * đường dẫn dạng `/imgLink/YYYYMM/<uuid>.<ext>`. Next.js đã có sẵn luật chuyển
 * `/imgLink/*` sang backend nên đường dẫn này hiển thị được ngay ở cả trang
 * quản trị lẫn trang công khai, không cần cấu hình thêm.
 */
export const uploadArticleImage = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ linkHinh: string }>('/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.linkHinh;
};

export default apiClient;

// ===================================================================
// Dashboard — mảng VẬN HÀNH (tbTracking)
//
// Dashboard cũ chỉ đo DON_HANG và CONGNO, bỏ qua ~93% khối lượng thật.
// Các đường dưới đây đo đúng mảng vận chuyển.
// ===================================================================

export interface SoLieuVanHanh {
  kienTrongKy: number;
  soKhach: number;
  kienChuaCoChu: number;
  tyLeChuaCoChu: number;
  kienChuaCoAnh: number;
  /** Hàng về theo ĐỢT, không đều ngày — nên đo "lần nhập gần nhất", không đo "hôm nay". */
  ngayNhapGanNhat: string | null;
  kienLanGanNhat: number;
  soNgayTuLanNhap: number | null;
  kien7Ngay: number;
}

export interface KienTheoNgay {
  ngay: string;
  soKien: number;
  chuaCoChu: number;
}

export interface KienTheoTuyen {
  quocGiaId: number | null;
  tenQuocGia: string;
  soKien: number;
}

export interface TopKhachVanHanh {
  khach: string;
  soKien: number;
  lanCuoi: string | null;
}

export interface CanhBaoDuLieu {
  muc: string;
  noiDung: string;
}

/** Ghép tham số lọc chung của mảng vận hành. */
const thamSoVanHanh = (
  fromDate?: string,
  toDate?: string,
  quocGiaId?: number,
  khach?: string,
): string => {
  const p = new URLSearchParams(buildDateParams(fromDate, toDate));
  if (quocGiaId && quocGiaId > 0) p.set('quocGiaId', String(quocGiaId));
  if (khach && khach.trim()) p.set('khach', khach.trim());
  return p.toString();
};

export const getVanHanhSoLieu = async (
  fromDate?: string,
  toDate?: string,
  quocGiaId?: number,
  khach?: string,
): Promise<SoLieuVanHanh> => {
  const res = await apiClient.get(`/dashboard/van-hanh/so-lieu?${thamSoVanHanh(fromDate, toDate, quocGiaId, khach)}`);
  return res.data;
};

export const getVanHanhTheoNgay = async (
  fromDate?: string,
  toDate?: string,
  quocGiaId?: number,
  khach?: string,
): Promise<KienTheoNgay[]> => {
  const res = await apiClient.get(`/dashboard/van-hanh/theo-ngay?${thamSoVanHanh(fromDate, toDate, quocGiaId, khach)}`);
  return res.data;
};

export const getVanHanhTheoTuyen = async (
  fromDate?: string,
  toDate?: string,
  khach?: string,
): Promise<KienTheoTuyen[]> => {
  const res = await apiClient.get(`/dashboard/van-hanh/theo-tuyen?${thamSoVanHanh(fromDate, toDate, undefined, khach)}`);
  return res.data;
};

export const getVanHanhTopKhach = async (
  fromDate?: string,
  toDate?: string,
  quocGiaId?: number,
  limit = 10,
): Promise<TopKhachVanHanh[]> => {
  const p = new URLSearchParams(thamSoVanHanh(fromDate, toDate, quocGiaId));
  p.set('limit', String(limit));
  const res = await apiClient.get(`/dashboard/van-hanh/top-khach?${p.toString()}`);
  return res.data;
};

export const getVanHanhCanhBao = async (): Promise<CanhBaoDuLieu[]> => {
  const res = await apiClient.get('/dashboard/van-hanh/canh-bao');
  return res.data;
};

export const getVanHanhTuyen = async (): Promise<KienTheoTuyen[]> => {
  const res = await apiClient.get('/dashboard/van-hanh/tuyen');
  return res.data;
};

// ===================================================================
// Báo cáo SẢN LƯỢNG KHÁCH HÀNG — màn con dưới Dashboard thống kê.
//
// Một dòng = một cặp (khách × tuyến). Doanh số tách hai cột theo chốt của bên
// khách 15/10/2026: cước cân kg và phí mua hộ là hai thứ tiền khác nhau, gộp
// lại thì không chia ra đơn giá đ/kg được nữa.
// ===================================================================

export interface DongSanLuongKhach {
  maKh: string;
  tenKhach: string | null;
  tuyenId: number | null;
  tuyen: string;
  kg: number;
  cuoc: number;
  phiMua: number;
  tong: number;
}

export interface BangSanLuongKhach {
  dong: DongSanLuongKhach[];
  tong: {
    kg: number;
    cuoc: number;
    phiMua: number;
    tong: number;
    soKhach: number;
    soDong: number;
  };
  canhBao: { dongThieuKg: number; kgChuaRoTuyen: number };
}

export const getSanLuongKhach = async (
  fromDate?: string,
  toDate?: string,
  quocGiaId?: number,
  khach?: string,
): Promise<BangSanLuongKhach> => {
  const res = await apiClient.get(
    `/dashboard/san-luong-khach?${thamSoVanHanh(fromDate, toDate, quocGiaId, khach)}`,
  );
  return res.data;
};

export const getSanLuongKhachTuyen = async (
  fromDate?: string,
  toDate?: string,
): Promise<{ id: number; ten: string }[]> => {
  const res = await apiClient.get(
    `/dashboard/san-luong-khach/tuyen?${thamSoVanHanh(fromDate, toDate)}`,
  );
  return res.data;
};

// ===================================================================
// Báo cáo TUỔI NỢ
//
// PLE có 9 màn công nợ nhưng không màn nào hiện nợ GIÀ bao nhiêu.
// Tính theo FIFO: tiền thu khấu vào khoản nợ cũ trước.
//
// Từ 16/10/2026 mỗi khách có thể có TUỔI NỢ riêng (`AspNetUsers.TuoiNo`,
// sửa ở màn chi tiết tài khoản). Khách có tuổi nợ thì các nhóm đếm theo số
// ngày QUÁ HẠN; khách chưa đặt thì đếm thẳng từ ngày ghi nợ như trước.
// ===================================================================

export interface TuoiNoTongHop {
  soKhachConNo: number;
  tongConNo: number;
  /** Khoản chưa tới hạn trả — chỉ khách CÓ tuổi nợ mới có phần này. */
  chuaToiHan: number;
  /** Nợ của khách chưa đặt tuổi nợ — nằm trong ba nhóm nhưng KHÔNG phải quá hạn. */
  chuaDatTuoiNo: number;
  n0_30: number;
  n31_60: number;
  tren60: number;
}

export interface TuoiNoDong {
  khach: string;
  tong: number;
  /** Số ngày khách được phép nợ. `null` = chưa đặt. */
  tuoiNo: number | null;
  chuaToiHan: number;
  n0_30: number;
  n31_60: number;
  tren60: number;
  /** Tuổi thật (từ ngày ghi nợ) của khoản chưa trả cũ nhất. */
  soNgayCuNhat: number;
  /** Số ngày quá hạn nhiều nhất. Âm hoặc 0 = chưa khoản nào tới hạn. */
  soNgayQuaHan: number;
  lanCuoi: string | null;
}

export interface TuoiNoChiTiet {
  ngay: string;
  noiDung: string;
  conLai: number;
  soNgay: number;
  soNgayQuaHan: number;
  /** `yyyy-mm-dd`, hoặc null khi khách không có tuổi nợ. */
  hanTra: string | null;
}

export const getTuoiNoTongHop = async (): Promise<TuoiNoTongHop> => {
  const res = await apiClient.get('/dashboard/tuoi-no/tong-hop');
  return res.data;
};

export const getTuoiNoDanhSach = async (
  sapTheo: 'gia' | 'tien' = 'gia',
  limit = 200,
): Promise<TuoiNoDong[]> => {
  const res = await apiClient.get(`/dashboard/tuoi-no/danh-sach?sapTheo=${sapTheo}&limit=${limit}`);
  return res.data;
};

export const getTuoiNoChiTiet = async (khach: string): Promise<TuoiNoChiTiet[]> => {
  const res = await apiClient.get(`/dashboard/tuoi-no/chi-tiet?khach=${encodeURIComponent(khach)}`);
  return res.data;
};

/**
 * Đặt tuổi nợ cho một khách ngay trên màn báo cáo.
 *
 * `null` = xoá thoả thuận, quay về đếm từ ngày ghi nợ. Máy chủ đòi quyền
 * `duyetCongNo` (Admin, Kế toán, CSKH, Mua hàng).
 */
/** Một dòng trong file Excel đặt tuổi nợ hàng loạt. */
export interface DongDatTuoiNo {
  khach: string;
  /** Số ngày, hoặc rỗng để xoá thoả thuận. */
  tuoiNo: string | number | null;
}

export interface KetQuaDatTuoiNoHangLoat {
  soDaGhi: number;
  soKhongDoi: number;
  loi: { dong: number; khach: string; lyDo: string }[];
}

/** Một dòng file Excel gán CSKH phụ trách. `cskh` rỗng = bỏ gán. */
export interface DongGanCskh {
  khach: string;
  cskh: string;
}

/** Gán CSKH phụ trách cho nhiều khách một lượt (Admin / TP / PP). */
export const ganCskhHangLoat = async (
  dong: DongGanCskh[],
): Promise<KetQuaDatTuoiNoHangLoat> => {
  const res = await apiClient.post('/users/cskh-phu-trach/hang-loat', { dong });
  return res.data;
};

/** Đặt tuổi nợ cho nhiều khách một lượt, từ file Excel. */
export const datTuoiNoHangLoat = async (
  dong: DongDatTuoiNo[],
): Promise<KetQuaDatTuoiNoHangLoat> => {
  const res = await apiClient.post('/dashboard/tuoi-no/hang-loat', { dong });
  return res.data;
};

export const datTuoiNo = async (
  khach: string,
  tuoiNo: number | null,
): Promise<{ khach: string; tuoiNo: number | null }> => {
  const res = await apiClient.put(`/dashboard/tuoi-no/${encodeURIComponent(khach)}`, { tuoiNo });
  return res.data;
};

// ============================================================
// TỔNG QUAN CỦA KHÁCH HÀNG (màn /tong-quan)
// ============================================================
//
// Không hàm nào ở đây nhận username: máy chủ lấy từ JWT. Tham số `khach` chỉ
// có tác dụng với tài khoản Admin (CSKH xem hộ màn của khách) và bị máy chủ bỏ
// qua với mọi tài khoản khác — xem `backend/src/dashboard/khach-hang.service.ts`.

export interface SoLieuKhach {
  /** Sản lượng = KG. Đây là thước đo chính. */
  soKg: number;
  soKg30Ngay: number;
  /** Số kiện — số phụ, đi kèm cho dễ hình dung. */
  soKien: number;
  /** Số dòng cân không đọc được kg. Khác 0 thì màn phải nói ra. */
  soDongThieuKg: number;
  soTuyen: number;
  /** Âm nghĩa là khách đã trả trước. */
  duNo: number;
  tongPhatSinh: number;
  tongDaTra: number;
  lanGuiGanNhat: string | null;
}

export interface TuyenCuaKhach {
  tenQuocGia: string;
  soKg: number;
  tyLe: number;
}

export interface ThangCuaKhach {
  /** yyyy-MM */
  thang: string;
  soKg: number;
  soKien: number;
  phatSinh: number;
  daTra: number;
  duNoCuoiThang: number;
}

export interface TongQuanKhach {
  khach: string;
  soThang: number;
  soLieu: SoLieuKhach;
  theoTuyen: TuyenCuaKhach[];
  theoThang: ThangCuaKhach[];
}

export const getTongQuanKhach = async (soThang = 12, khach?: string): Promise<TongQuanKhach> => {
  const p = new URLSearchParams({ soThang: String(soThang) });
  if (khach) p.set('khach', khach);
  const res = await apiClient.get(`/dashboard/khach-hang/tong-quan?${p}`);
  return res.data;
};

export interface KhachCoDuLieu {
  khach: string;
  soKien: number;
  lanCuoi: string | null;
}

/** Chỉ Admin gọi được — dùng cho ô chọn "xem hộ khách". */
export const getDanhSachKhachCoDuLieu = async (tuKhoa?: string): Promise<KhachCoDuLieu[]> => {
  const p = new URLSearchParams();
  if (tuKhoa) p.set('tuKhoa', tuKhoa);
  const res = await apiClient.get(`/dashboard/khach-hang/danh-sach?${p}`);
  return res.data;
};

// ============================================================
// TRẠNG THÁI KHÁCH HÀNG (màn admin/users)
// ============================================================

export type TrangThaiKhach = 'hoat-dong' | 'tam-nghi' | 'dong-ma';
export type NhomTuDongKhach = 'hoat-dong' | 'nghi-3-6' | 'nghi-6-12' | 'nghi-tren-12' | 'chua-giao-dich';

export interface KhachKemTrangThai {
  id: string;
  userName: string;
  hoTen: string | null;
  /** Thiếu khoá (không phải null) = máy chủ che vì khách do sales khác phụ trách. */
  phone?: string | null;
  email?: string | null;
  /** CSKH phụ trách. */
  cskhPhuTrach?: string | null;
  lanGiaoDichCuoi: string | null;
  soNgayNghi: number | null;
  /** Suy ra từ dữ liệu, không phải cột trong bảng. */
  nhomTuDong: NhomTuDongKhach;
  /** null = chưa ai xét tới mã này. */
  trangThai: TrangThaiKhach | null;
  ngayDoiTrangThai: string | null;
  nguoiDoiTrangThai: string | null;
  lyDoTrangThai: string | null;
  duNo: number;
  /**
   * Tài khoản nội bộ (có vai trò Admin/Kho/Sale/Order), không phải khách.
   *
   * Chỉ có giá trị thật khi lấy qua `getMotTrangThaiKhach`; danh sách việc cần
   * làm vốn đã loại hết nhân viên nên ở đó luôn là false.
   */
  laNhanVien?: boolean;
}

export interface TongHopTrangThaiKhach {
  tongKhach: number;
  dangHoatDong: number;
  nghi3Den6: number;
  nghi6Den12: number;
  nghiTren12: number;
  chuaGiaoDich: number;
  canDongMa: number;
  canDongMaConNo: number;
  tienConTreo: number;
}

export const getTongHopTrangThaiKhach = async (): Promise<TongHopTrangThaiKhach> => {
  const res = await apiClient.get('/users/trang-thai/tong-hop');
  return res.data;
};

export const getDanhSachTrangThaiKhach = async (opts: {
  nhom?: string;
  tuKhoa?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: KhachKemTrangThai[]; total: number; page: number; limit: number }> => {
  const p = new URLSearchParams();
  if (opts.nhom) p.set('nhom', opts.nhom);
  if (opts.tuKhoa) p.set('tuKhoa', opts.tuKhoa);
  p.set('page', String(opts.page ?? 1));
  p.set('limit', String(opts.limit ?? 50));
  const res = await apiClient.get(`/users/trang-thai?${p}`);
  return res.data;
};

/**
 * Một tài khoản kèm mốc giao dịch cuối + dư nợ.
 *
 * Màn danh sách User chỉ có dòng `AspNetUsers` thô; hộp đổi trạng thái cần hai
 * thứ kia để người bấm biết mình đang đóng mã của ai và còn nợ bao nhiêu.
 */
export const getMotTrangThaiKhach = async (id: string): Promise<KhachKemTrangThai> => {
  const res = await apiClient.get(`/users/trang-thai/mot/${id}`);
  return res.data;
};

// ---------------- KIỂM KÊ / CHUYỂN / XOÁ TÀI KHOẢN ----------------

export interface MucKiemKe {
  bang: string;
  cot: string;
  nhan: string;
  so: number;
  /** Dòng tính theo cặp (kỳ, mã) — gộp hai mã thì một kỳ có hai dòng. */
  canhBaoGop?: boolean;
}

export interface KiemKeTaiKhoan {
  id: string;
  userName: string;
  hoTen: string | null;
  vaiTro: string[];
  laNhanVien: boolean;
  duNo: number;
  lanGiaoDichCuoi: string | null;
  /** Dữ liệu THUỘC VỀ mã này. */
  khach: MucKiemKe[];
  /** Dấu vết "ai đã nhập". */
  nhap: MucKiemKe[];
  tongKhach: number;
  tongNhap: number;
  /** Nhật ký hệ thống — luôn giữ nguyên. */
  nhatKy: number;
}

export interface KetQuaXuLyTaiKhoan {
  daChuyen: { bang: string; cot: string; nhom: 'khach' | 'nhap'; so: number }[];
  tongDaChuyen: number;
  conMoCoi: number;
  daXoaTaiKhoan: boolean;
  daDonBangPhu: number;
}

export const getKiemKeTaiKhoan = async (id: string): Promise<KiemKeTaiKhoan> => {
  const res = await apiClient.get(`/users/${id}/kiem-ke`);
  return res.data;
};

export const timNhanhTaiKhoan = async (
  q: string,
  nhom?: 'khach' | 'nhap',
): Promise<{ userName: string; hoTen: string | null; laNhanVien: boolean }[]> => {
  const p = new URLSearchParams({ q });
  if (nhom) p.set('nhom', nhom);
  const res = await apiClient.get(`/users/tim-nhanh?${p}`);
  return res.data;
};

export const xuLyTaiKhoan = async (
  id: string,
  body: {
    chuyenKhachSang?: string;
    chuyenNhapSang?: string;
    xoaTaiKhoan?: boolean;
    lyDo: string;
    xacNhan?: string;
  },
): Promise<KetQuaXuLyTaiKhoan> => {
  const res = await apiClient.post(`/users/${id}/xu-ly`, body);
  return res.data;
};

export const datTrangThaiKhach = async (
  id: string,
  trangThai: TrangThaiKhach,
  lyDo?: string,
): Promise<KhachKemTrangThai> => {
  const res = await apiClient.put(`/users/trang-thai/${id}`, { trangThai, lyDo });
  return res.data;
};

// ============================================================
// NHÀ CUNG CẤP  (yêu cầu bên khách 12/10/2026)
// ============================================================

export interface NhaCungCap {
  NhaCungCapID: number;
  TenNhaCungCap: string;
  GhiChu: string | null;
  DaAn: boolean;
  NgayTao: string;
  NguoiTao: string | null;
}

/** `tatCa` = kể cả nhà cung cấp đã ẩn. Ô LỌC cần, ô NHẬP thì không. */
export const layNhaCungCap = async (tatCa = false): Promise<NhaCungCap[]> => {
  const res = await apiClient.get<{ data: NhaCungCap[] }>('/suppliers', {
    params: tatCa ? { tatCa: 1 } : undefined,
  });
  return res.data?.data ?? [];
};

export const taoNhaCungCap = async (body: {
  tenNhaCungCap: string;
  ghiChu?: string | null;
}): Promise<NhaCungCap> => {
  const res = await apiClient.post<{ data: NhaCungCap }>('/suppliers', body);
  return res.data.data;
};

export const suaNhaCungCap = async (
  id: number,
  body: { tenNhaCungCap: string; ghiChu?: string | null; daAn?: boolean },
): Promise<NhaCungCap> => {
  const res = await apiClient.put<{ data: NhaCungCap }>(`/suppliers/${id}`, body);
  return res.data.data;
};

/** Ẩn, không xoá — đơn cũ vẫn giữ được tên nhà cung cấp. */
export const anNhaCungCap = async (
  id: number,
): Promise<{ success: boolean; soDonDangDung: number }> => {
  const res = await apiClient.delete(`/suppliers/${id}`);
  return res.data;
};

/**
 * NHẬP GIÁ NHÀ CUNG CẤP CHO NHIỀU DÒNG ĐƠN MỘT LƯỢT.
 *
 * `nccId` / `cong` / `tyGia` / `tracking` ĐỂ TRỐNG LÀ GIỮ NGUYÊN giá trị cũ
 * của từng đơn — ĐỪNG gửi `null` để hòng xoá, máy chủ cũng hiểu null là giữ
 * nguyên. Muốn xoá thì mở đúng đơn đó ra sửa.
 *
 * Ngoại tệ đi theo TỪNG DÒNG (`dong[].ngoaiTe`) vì mỗi món một giá.
 */
export interface DongNccHangLoat {
  id: number;
  ngoaiTe?: number | null;
}

export interface ThanNccHangLoat {
  dong: DongNccHangLoat[];
  nccId?: number | null;
  cong?: number | null;
  tyGia?: number | null;
  tracking?: string | null;
  /** Mặc định true — tính lại Tổng phải trả = (Ngoại tệ + %Công) × Tỷ giá. */
  tinhLaiTongPhaiTra?: boolean;
}

export interface KetQuaNccHangLoat {
  success: boolean;
  capNhat: number;
  khongDoi: number;
  khongThay: number[];
}

export const capNhatNccHangLoat = async (
  than: ThanNccHangLoat,
): Promise<KetQuaNccHangLoat> => {
  const res = await apiClient.post<KetQuaNccHangLoat>('/orders/ncc/hang-loat', than);
  return res.data;
};

export interface DongCongNoNcc {
  ID: number;
  ordernumber: string | null;
  username: string | null;
  ngayMua: string | null;
  WebsiteName: string | null;
  TenQuocGia: string | null;
  linkweb: string | null;
  loaitien: string | null;
  soluong: number | null;
  tongtienVND: number | null;
  NCC_ID: number | null;
  TenNhaCungCap: string | null;
  NCC_NgoaiTe: number | null;
  NCC_Cong: number | null;
  NCC_TyGia: number | null;
  NCC_TongPhaiTra: number | null;
  NCC_Tracking: string | null;
  NCC_LaiLo: number | null;
  /** Đã trả NCC cho dòng này (tổng các phiếu thanh toán chưa huỷ). */
  NCC_DaTra: number;
  trangthaiOrder: string | null;
}

export interface TongTheoNcc {
  NCC_ID: number | null;
  TenNhaCungCap: string | null;
  soDon: number;
  tongNgoaiTe: number;
  tongCong: number;
  tongPhaiTra: number;
  tongThuKhach: number;
  laiLo: number;
  daTra: number;
}

/** Gộp theo TUYẾN của đơn — cùng các cột cộng dồn như theo NCC. */
export interface TongTheoTuyen extends Omit<TongTheoNcc, 'NCC_ID' | 'TenNhaCungCap'> {
  QuocGiaID: number | null;
  TenQuocGia: string | null;
}

export interface CongNoNccResponse {
  tongHop: {
    soDon: number;
    tongNgoaiTe: number;
    tongCong: number;
    tongPhaiTra: number;
    tongThuKhach: number;
    laiLo: number;
    daTra: number;
  };
  theoNcc: TongTheoNcc[];
  theoTuyen: TongTheoTuyen[];
  chiTiet: { data: DongCongNoNcc[]; total: number; page: number; limit: number };
  /** Số đơn trong cùng khoảng CHƯA ai nhập giá NCC — để trang nói thật về độ phủ. */
  soDonChuaNhap: number;
}

export const layCongNoNcc = async (loc: {
  tuNgay?: string;
  denNgay?: string;
  nccId?: number;
  quocGiaId?: number;
  trangThai?: 'con-no' | 'da-tra';
  page?: number;
  limit?: number;
}): Promise<CongNoNccResponse> => {
  const res = await apiClient.get<CongNoNccResponse>('/supplier-debt', { params: loc });
  return res.data;
};

/** Một đơn chưa nhập giá NCC — mở từ dòng cảnh báo trên trang Công nợ phải trả NCC. */
export interface DongChuaNhapNcc {
  ID: number;
  ordernumber: string | null;
  username: string | null;
  usernamesave: string | null;
  ngayMua: string | null;
  TenQuocGia: string | null;
  WebsiteName: string | null;
  linkweb: string | null;
  soluong: number | null;
  loaitien: string | null;
  tongtienVND: number | null;
  trangthaiOrder: string | null;
}

export const layDonChuaNhapNcc = async (loc: {
  tuNgay?: string;
  denNgay?: string;
  quocGiaId?: number;
}): Promise<DongChuaNhapNcc[]> => {
  const res = await apiClient.get<DongChuaNhapNcc[]>('/supplier-debt/chua-nhap', { params: loc });
  return res.data;
};

// ---------------- THANH TOÁN NCC (23/10/2026) ----------------

export interface SoDuNcc {
  NCC_ID: number;
  TenNhaCungCap: string | null;
  phaiTra: number;
  daTra: number;
  conNo: number;
}

export interface PhieuThanhToanNcc {
  PhieuID: number;
  NCC_ID: number;
  TenNhaCungCap: string | null;
  NgayTra: string;
  SoTien: number;
  Loai: 'theo-don' | 'gop';
  GhiChu: string | null;
  NguoiTao: string | null;
  NgayTao: string;
  DaXoa: boolean;
  NguoiXoa: string | null;
  NgayXoa: string | null;
  soDon: number;
  daPhanBo: number;
}

export interface DongPhieuNcc {
  DonHangID: number;
  ordernumber: string | null;
  username: string | null;
  ngayMua: string | null;
  NCC_TongPhaiTra: number | null;
  SoTien: number;
}

export interface KetQuaLapPhieuNcc {
  phieuId: number;
  soTien: number;
  soDon: number;
  daPhanBo: number;
  traDu: number;
}

export const laySoDuNcc = async (): Promise<SoDuNcc[]> =>
  (await apiClient.get<SoDuNcc[]>('/supplier-debt/so-du')).data;

export const layPhieuThanhToanNcc = async (loc: {
  nccId?: number;
  tuNgay?: string;
  denNgay?: string;
  /** 'an' = chỉ phiếu đang hiệu lực, 'ca' = cả phiếu đã huỷ, 'chi' = chỉ phiếu đã huỷ. */
  phieuHuy?: 'an' | 'ca' | 'chi';
}): Promise<PhieuThanhToanNcc[]> =>
  (
    await apiClient.get<PhieuThanhToanNcc[]>('/supplier-debt/thanh-toan', {
      params: { nccId: loc.nccId, tuNgay: loc.tuNgay, denNgay: loc.denNgay, coPhieuHuy: loc.phieuHuy === 'an' ? undefined : loc.phieuHuy },
    })
  ).data;

export const layChiTietPhieuNcc = async (id: number): Promise<DongPhieuNcc[]> =>
  (await apiClient.get<DongPhieuNcc[]>(`/supplier-debt/thanh-toan/${id}`)).data;

/** Trả THEO ĐƠN: các đơn đã tick, mỗi đơn một số tiền. */
export const traNccTheoDon = async (than: {
  ngayTra: string;
  ghiChu?: string;
  dong: { donHangId: number; soTien: number }[];
}): Promise<KetQuaLapPhieuNcc> =>
  (await apiClient.post<KetQuaLapPhieuNcc>('/supplier-debt/thanh-toan/theo-don', than)).data;

/** Trả GỘP: một cục cho một NCC, máy chủ tự trừ đơn cũ nhất trước. */
export const traNccGop = async (than: {
  nccId: number;
  ngayTra: string;
  soTien: number;
  ghiChu?: string;
}): Promise<KetQuaLapPhieuNcc> =>
  (await apiClient.post<KetQuaLapPhieuNcc>('/supplier-debt/thanh-toan/gop', than)).data;

export const huyPhieuNcc = async (id: number): Promise<{ phieuId: number }> =>
  (await apiClient.post<{ phieuId: number }>(`/supplier-debt/thanh-toan/${id}/huy`)).data;
