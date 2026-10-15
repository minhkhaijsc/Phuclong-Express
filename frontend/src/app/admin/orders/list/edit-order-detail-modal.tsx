'use client';

/**
 * Edit Order Detail Modal
 *
 * Popup version of /admin/orders/edit. Reuses identical form logic
 * (mirrors EditOrderDetail.aspx.cs) — only difference is layout:
 * compact max-w-4xl modal with 2-column responsive sections + scrollable body.
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  getOrder,
  updateOrderDetail,
  getExchangeRatesForEdit,
  getProductTypesForEdit,
  getCountries,
  getUsernames,
  uploadImage,
  calculateServiceFee,
  layNhaCungCap,
} from '@/lib/api';
import { useQuyen } from '@/hooks/use-quyen';

const STYLES = {
  input:
    'w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all',
  select:
    'w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all cursor-pointer',
  readonly:
    'w-full px-3 py-2 border border-gray-100 bg-gray-50 rounded-lg text-gray-600',
  label: 'block text-sm font-medium text-gray-700 mb-1',
  card: 'bg-white rounded-xl border border-gray-100 p-4',
  sectionTitle:
    'text-base font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-100',
  buttonPrimary:
    'px-5 py-2 bg-cyan-500 text-white font-medium rounded-lg hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all',
  buttonSecondary:
    'px-5 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all',
};

// Same schema as EditOrderDetail.aspx — snake_case field names match old C# code
const orderEditFormSchema = z.object({
  ordernumber: z.string().min(1, 'Số đơn hàng là bắt buộc'),
  username: z.string().min(1, 'Username là bắt buộc'),
  trangthaiOrder: z.string().optional(),
  linkweb: z.string().optional(),
  linkhinh: z.string().optional(),
  corlor: z.string().optional(),
  size: z.string().optional(),
  soluong: z.number({ error: 'Số lượng phải là số' }).min(1, 'Số lượng phải lớn hơn 0'),
  dongiaweb: z.number({ error: 'Đơn giá phải là số' }).min(0, 'Đơn giá phải là số'),
  saleoff: z.number().min(0).default(0),
  phuthu: z.number().min(0).default(0),
  shipUSA: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  cong: z.number().min(0).default(0),
  loaitien: z.string().min(1, 'Loại tiền là bắt buộc'),
  tygia: z.number().min(0),
  giasauoffUSD: z.number().min(0).default(0),
  giasauoffVND: z.number().min(0).default(0),
  tiencongUSD: z.number().min(0).default(0),
  tiencongVND: z.number().min(0).default(0),
  tongtienUSD: z.number().min(0).default(0),
  tongtienVND: z.number().min(0).default(0),
  ghichu: z.string().optional(),
  adminNote: z.string().optional(),
  ngaymuahang: z.string().optional(),
  ngayveVN: z.string().optional(),
  // Chỉ dùng khi trangthaiOrder = 'Completed' → ghi vào DON_HANG.NgayHoanThanh
  ngayHoanThanh: z.string().optional(),
  LoaiHangID: z.number().optional(),
  QuocGiaID: z.number().optional(),
});

type OrderEditFormData = z.input<typeof orderEditFormSchema>;

const ORDER_STATUSES = ['Received', 'Ordered', 'Shipped', 'Completed', 'Cancelled'];

interface Props {
  orderId: number | null;
  onClose: () => void;
}

export default function EditOrderDetailModal({ orderId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [congEnabled, setCongEnabled] = useState<boolean>(true);
  // Mirror C# giaTienCong.TienCong1Mon
  const [tienCong1Mon, setTienCong1Mon] = useState<number>(0);
  const isInitialLoad = useRef(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { xemGiaNcc } = useQuyen();

  /**
   * KHỐI NHÀ CUNG CẤP giữ ở state RIÊNG, KHÔNG nhập vào `orderEditFormSchema`.
   *
   * Cố ý: schema kia có mấy trường bắt buộc là số, và `register` với
   * `valueAsNumber` biến ô trống thành NaN. Nhét sáu ô NCC — vốn được phép để
   * trống — vào cùng schema là thêm sáu đường làm cho nút Cập nhật lặng lẽ
   * không ăn vì zod báo không hợp lệ ở một ô người dùng cố tình bỏ trống.
   * Phần đơn hàng đang chạy đúng thì đừng chạm vào.
   */
  const [ncc, setNcc] = useState({
    NCC_ID: '' as string,
    NCC_NgoaiTe: '' as string,
    NCC_Cong: '' as string,
    NCC_TyGia: '' as string,
    NCC_TongPhaiTra: '' as string,
    NCC_Tracking: '' as string,
  });
  /**
   * Người dùng đã tự sửa ô "Tổng phải trả" chưa.
   *
   * Trước khi sửa tay thì ô đó tự tính (Ngoại tệ + Công) × Tỷ giá. Sau khi sửa
   * thì THÔI tự tính — hoá đơn NCC hay lệch vài đồng do họ làm tròn, mà con số
   * đi vào công nợ phải là con số trên hoá đơn, không phải con số mình nhân ra.
   */
  const [tongPhaiTraSuaTay, setTongPhaiTraSuaTay] = useState(false);

  const open = orderId != null && orderId > 0;

  // Reset transient state when modal opens for a new order
  useEffect(() => {
    if (open) {
      isInitialLoad.current = true;
      setImageFile(null);
      setImagePreview('');
      setErrorMessage(null);
    }
  }, [orderId, open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { data: order, isLoading: isLoadingOrder, error: orderError } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getOrder(orderId as number),
    enabled: open,
  });

  const { data: exchangeRates = [] } = useQuery({
    queryKey: ['exchange-rates-edit'],
    queryFn: getExchangeRatesForEdit,
    enabled: open,
  });

  const { data: productTypes = [] } = useQuery({
    queryKey: ['product-types-edit'],
    queryFn: getProductTypesForEdit,
    enabled: open,
  });

  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: getCountries,
    enabled: open,
  });

  const { data: usernames = [] } = useQuery({
    queryKey: ['usernames'],
    queryFn: getUsernames,
    enabled: open,
  });

  // Không gọi khi không có quyền: route /suppliers trả 403, gọi chỉ để nhận lỗi.
  const { data: dsNhaCungCap = [] } = useQuery({
    queryKey: ['nha-cung-cap'],
    queryFn: () => layNhaCungCap(false),
    enabled: open && xemGiaNcc,
    staleTime: 5 * 60 * 1000,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OrderEditFormData>({
    resolver: zodResolver(orderEditFormSchema),
    defaultValues: {
      username: '',
      ordernumber: '',
      saleoff: 0,
      phuthu: 0,
      shipUSA: 0,
      tax: 0,
      cong: 0,
      giasauoffUSD: 0,
      giasauoffVND: 0,
      tiencongUSD: 0,
      tiencongVND: 0,
      tongtienUSD: 0,
      tongtienVND: 0,
    },
  });

  const watchedFields = watch(['dongiaweb', 'saleoff', 'phuthu', 'shipUSA', 'tax', 'cong', 'tygia', 'soluong']);
  const watchedUsername = watch('username');
  const watchedLoaiTien = watch('loaitien');
  const watchedTrangThai = watch('trangthaiOrder');

  // Mirror C# EditOrderDetail changetygia/changeloaihang
  useEffect(() => {
    const fetchGiaTienCong = async () => {
      if (watchedUsername && watchedLoaiTien && watchedFields[0]) {
        try {
          const result = await calculateServiceFee({
            loaitien: watchedLoaiTien,
            dongiaweb: watchedFields[0],
            username: watchedUsername,
          });
          setCongEnabled(result.tinhTheoPhanTram);
          setTienCong1Mon(Number(result.tienCong1Mon) || 0);
          if (isInitialLoad.current) {
            isInitialLoad.current = false;
          } else if (result.tinhTheoPhanTram) {
            setValue('cong', result.tienCong1Mon);
          }
        } catch (error) {
          console.error('Error fetching GiaTienCong:', error);
        }
      }
    };
    fetchGiaTienCong();
  }, [watchedUsername, watchedLoaiTien, watchedFields[0], setValue]);

  // Mirror C# OrderServices.TinhTienOrder
  useEffect(() => {
    const [dongiaweb, saleoff, phuthu, shipUSA, tax, cong, tygia, soluong] = watchedFields;
    if (!dongiaweb || isNaN(dongiaweb)) return;

    const sl = soluong || 1;
    const tygiaNum = Number(tygia) || 1;
    let num = (1 - (saleoff || 0) / 100) * dongiaweb * sl;

    let tienCongUSD: number;
    let tienCongVND: number;
    if (congEnabled) {
      tienCongUSD = (num * (cong || 0)) / 100;
      tienCongVND = tienCongUSD * tygiaNum;
    } else {
      tienCongUSD = 0;
      tienCongVND = tienCong1Mon * sl;
    }

    num += num * 0.01 * (tax || 0);
    num += (shipUSA || 0) * sl;
    num += (phuthu || 0) * sl;

    // Mirror C# TinhTienOrder: giasauoffUSD = num (after tax + ship + phuthu, total for soluong)
    const tongTienUSD = num + tienCongUSD;
    const tongTienVND = Math.ceil(num * tygiaNum + tienCongVND);

    setValue('giasauoffUSD', Math.round(num * 100) / 100);
    setValue('giasauoffVND', Math.round(num * tygiaNum));
    setValue('tiencongUSD', Math.round(tienCongUSD * 100) / 100);
    setValue('tiencongVND', Math.round(tienCongVND));
    setValue('tongtienUSD', Math.round(tongTienUSD * 100) / 100);
    setValue('tongtienVND', tongTienVND);
  }, [watchedFields, congEnabled, tienCong1Mon, setValue]);

  // Populate form when order loads
  useEffect(() => {
    if (!order) return;
    const o = order as any;
    const toNum = (v: any, fallback = 0): number => {
      if (v === null || v === undefined || v === '') return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const parseDate = (d: any) => {
      if (!d) return '';
      if (typeof d === 'string') {
        const date = new Date(d);
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
      }
      if (d instanceof Date) return d.toISOString().split('T')[0];
      return '';
    };

    reset({
      ordernumber: o.ordernumber || o.OrderNumber || '',
      username: o.username || o.UserName || '',
      linkweb: o.linkweb || o.LinkWeb || '',
      linkhinh: o.linkhinh || o.LinkHinh || '',
      corlor: o.corlor || o.Color || '',
      size: o.size || o.Size || '',
      soluong: toNum(o.soluong ?? o.SoLuong, 1),
      dongiaweb: toNum(o.dongiaweb ?? o.DonGiaWeb),
      saleoff: toNum(o.saleoff ?? o.SaleOff),
      phuthu: toNum(o.phuthu ?? o.PhuThu),
      shipUSA: toNum(o.shipUSA ?? o.ShipUSA),
      tax: toNum(o.tax ?? o.Tax),
      cong: toNum(o.cong ?? o.Cong),
      loaitien: o.loaitien || o.LoaiTien || 'USD',
      tygia: toNum(o.tygia ?? o.TyGia, 1),
      giasauoffUSD: toNum(o.giasauoffUSD ?? o.GiaSauOffUSD),
      giasauoffVND: toNum(o.giasauoffVND ?? o.GiaSauOffVND),
      tiencongUSD: toNum(o.tiencongUSD ?? o.TienCongUSD),
      tiencongVND: toNum(o.tiencongVND ?? o.TienCongVND),
      tongtienUSD: toNum(o.tongtienUSD ?? o.TongTienUSD),
      tongtienVND: toNum(o.tongtienVND ?? o.TongTienVND),
      ghichu: o.ghichu || o.GhiChu || '',
      trangthaiOrder: o.trangthaiOrder || o.TrangThaiOrder || '',
      adminNote: o.adminNote || o.AdminNote || '',
      ngaymuahang: parseDate(o.ngaymuahang || o.NgayMuaHang),
      ngayveVN: parseDate(o.ngayveVN || o.NgayVeVN),
      ngayHoanThanh: parseDate(o.ngayHoanThanh || o.NgayHoanThanh),
      LoaiHangID: (() => {
        const v = o.LoaiHangID ?? o.loaiHangId;
        return v ? toNum(v, 0) || undefined : undefined;
      })(),
      QuocGiaID: (() => {
        const v = o.QuocGiaID ?? o.quocGiaId;
        return v ? toNum(v, 0) || undefined : undefined;
      })(),
    });

    if (o.linkhinh || o.LinkHinh) setImagePreview(o.linkhinh || o.LinkHinh);

    // Khối NCC. Người không có quyền `giaNcc` nhận dòng đơn ĐÃ bị xoá các khoá
    // NCC_* ở máy chủ (`cheNcc`), nên ở đây chúng là undefined → ô rỗng, và
    // `onSubmit` cũng không gửi gì → không ghi đè giá nhập của mua hàng.
    const oNcc = (v: unknown) => (v === null || v === undefined ? '' : String(v));
    setNcc({
      NCC_ID: oNcc(o.NCC_ID),
      NCC_NgoaiTe: oNcc(o.NCC_NgoaiTe),
      NCC_Cong: oNcc(o.NCC_Cong),
      NCC_TyGia: oNcc(o.NCC_TyGia),
      NCC_TongPhaiTra: oNcc(o.NCC_TongPhaiTra),
      NCC_Tracking: oNcc(o.NCC_Tracking),
    });
    // Đơn đã có số tổng phải trả thì coi như số đã chốt — đừng tự tính lại rồi
    // ghi đè con số kế toán đã nhập đúng theo hoá đơn.
    setTongPhaiTraSuaTay(o.NCC_TongPhaiTra !== null && o.NCC_TongPhaiTra !== undefined);
  }, [order, reset]);

  /**
   * Tổng phải trả gợi ý = (Ngoại tệ + Ngoại tệ × %Công / 100) × Tỷ giá.
   *
   * Ô "% Công" là PHẦN TRĂM, không phải số tiền — sửa 15/10/2026 theo bên khách.
   * Giống hệt cột `cong` ở phía bán cho khách, nên hai bên cùng một nghĩa.
   *
   * Cùng công thức với `tongPhaiTraGoiY` trong
   * backend/src/orders/ncc-don-hang.ts. Lặp lại ở đây chứ không gọi API: đây là
   * phép nhân chạy theo từng lần bấm bàn phím, gọi máy chủ cho việc đó là vô
   * nghĩa. Đổi công thức thì phải sửa CẢ HAI chỗ.
   */
  const soNcc = (v: string): number => {
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : 0;
  };
  const tienCongNcc = (soNcc(ncc.NCC_NgoaiTe) * soNcc(ncc.NCC_Cong)) / 100;
  const tongPhaiTraGoiY = Math.round(
    (soNcc(ncc.NCC_NgoaiTe) + tienCongNcc) * soNcc(ncc.NCC_TyGia),
  );

  useEffect(() => {
    if (!xemGiaNcc || tongPhaiTraSuaTay) return;
    setNcc((t) => {
      const moi = tongPhaiTraGoiY ? String(tongPhaiTraGoiY) : '';
      return t.NCC_TongPhaiTra === moi ? t : { ...t, NCC_TongPhaiTra: moi };
    });
  }, [tongPhaiTraGoiY, tongPhaiTraSuaTay, xemGiaNcc]);

  /**
   * LÃI/LỖ — "số liệu giữa phần thông tin giá so với thông tin nhà cung cấp".
   *
   * Lấy `tongtienVND` đang hiện trên biểu mẫu (đã tính lại theo mọi ô người
   * dùng vừa sửa) trừ tổng phải trả. `null` khi chưa nhập tổng phải trả: 0 là
   * hoà vốn, còn chưa nhập thì chưa biết — hiện 0 ở đó là nói sai.
   */
  const laiLo: number | null =
    String(ncc.NCC_TongPhaiTra).trim() === ''
      ? null
      : Math.round((Number(watch('tongtienVND')) || 0) - soNcc(ncc.NCC_TongPhaiTra));

  const updateOrderDetailMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateOrderDetail(id, data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['order-status-counts'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['order', orderId], refetchType: 'all' }),
      ]);
      onClose();
    },
    onError: (error: Error) => {
      if (error.message?.includes('closed_period')) {
        setErrorMessage('Không được cập nhật đơn hàng này do đã đóng kỳ');
      } else if (error.message?.includes('debt_locked')) {
        setErrorMessage('Không được cập nhật do công nợ bị khóa');
      } else {
        setErrorMessage(`Lỗi cập nhật: ${error.message}`);
      }
    },
  });

  const onSubmit = async (data: OrderEditFormData) => {
    if (!orderId) return;
    try {
      const { useAuthStore } = await import('@/hooks/use-auth');
      const currentUser = useAuthStore.getState().user;

      let linkhinh = data.linkhinh || '';
      if (imageFile) {
        const uploadResult = await uploadImage(imageFile);
        linkhinh = uploadResult.linkHinh || '';
      }

      await updateOrderDetailMutation.mutateAsync({
        id: orderId,
        data: {
          username: data.username,
          linkweb: data.linkweb || '',
          linkhinh,
          corlor: data.corlor || '',
          size: data.size || '',
          soluong: data.soluong,
          dongiaweb: data.dongiaweb,
          saleoff: data.saleoff || 0,
          phuthu: data.phuthu || 0,
          shipUSA: data.shipUSA || 0,
          tax: data.tax || 0,
          cong: data.cong || 0,
          loaitien: data.loaitien || 'USD',
          ghichu: data.ghichu || '',
          tygia: data.tygia || 1,
          giasauoffUSD: data.giasauoffUSD || 0,
          giasauoffVND: data.giasauoffVND || 0,
          tiencongUSD: data.tiencongUSD || 0,
          tiencongVND: data.tiencongVND || 0,
          tongtienUSD: data.tongtienUSD || 0,
          tongtienVND: data.tongtienVND || 0,
          ordernumber: data.ordernumber || '',
          trangthaiOrder: data.trangthaiOrder || '',
          ngaymuahang: data.ngaymuahang || '',
          ngayveVN: data.ngayveVN || '',
          // Chỉ gửi khi status = Completed; BE default về today nếu rỗng
          ngayHoanThanh:
            data.trangthaiOrder === 'Completed' ? data.ngayHoanThanh || '' : undefined,
          adminNote: data.adminNote || '',
          LoaiHangID: data.LoaiHangID,
          QuocGiaID: data.QuocGiaID,
          usernamesave: currentUser?.username || '',
          nguoiTao: currentUser?.username || '',
          // CHỈ gửi khối NCC khi có quyền. Không có quyền thì không gửi khoá
          // nào, và máy chủ (`docThanNcc` trả null) bỏ qua phần NCC thay vì
          // đặt về null — tức là CSKH mở đơn bấm Cập nhật không xoá giá nhập.
          ...(xemGiaNcc
            ? {
                NCC_ID: ncc.NCC_ID === '' ? null : Number(ncc.NCC_ID),
                NCC_NgoaiTe: ncc.NCC_NgoaiTe === '' ? null : Number(ncc.NCC_NgoaiTe),
                NCC_Cong: ncc.NCC_Cong === '' ? null : Number(ncc.NCC_Cong),
                NCC_TyGia: ncc.NCC_TyGia === '' ? null : Number(ncc.NCC_TyGia),
                NCC_TongPhaiTra:
                  ncc.NCC_TongPhaiTra === '' ? null : Number(ncc.NCC_TongPhaiTra),
                NCC_Tracking: ncc.NCC_Tracking || null,
              }
            : {}),
        },
      });
    } catch {
      // Error handled in mutation
    }
  };

  const onInvalid = (formErrors: typeof errors) => {
    const messages = Object.entries(formErrors)
      .map(([field, err]: [string, any]) => `${field}: ${err?.message || 'không hợp lệ'}`)
      .join('; ');
    setErrorMessage(`Dữ liệu không hợp lệ — ${messages}`);
  };

  if (!open) return null;

  const o = order as any;
  const headerLabel = o?.ordernumber || o?.OrderNumber || orderId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col rounded-xl bg-gray-50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Chỉnh sửa đơn hàng</h2>
            <p className="text-xs text-gray-500 mt-0.5">#{headerLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Đóng"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body (scrollable) */}
        <form
          onSubmit={handleSubmit(onSubmit, onInvalid)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-red-700">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {isLoadingOrder ? (
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : orderError || !order ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {(orderError as any)?.message || 'Không tìm thấy đơn hàng'}
              </div>
            ) : (
              <>
                {/* Order Info Section */}
                <div className={STYLES.card}>
                  <h3 className={STYLES.sectionTitle}>Thông tin đơn hàng</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={STYLES.label}>Số đơn hàng</label>
                      <input {...register('ordernumber')} type="text" className={STYLES.input} />
                      {errors.ordernumber && (
                        <p className="text-red-500 text-xs mt-1">{errors.ordernumber.message}</p>
                      )}
                    </div>
                    <div>
                      <label className={STYLES.label}>Username</label>
                      <select {...register('username')} className={STYLES.select}>
                        <option value="">Chọn username</option>
                        {usernames.map((u: { username: string }) => (
                          <option key={u.username} value={u.username}>
                            {u.username}
                          </option>
                        ))}
                      </select>
                      {errors.username && (
                        <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>
                      )}
                    </div>
                    <div>
                      <label className={STYLES.label}>Trạng thái</label>
                      <select {...register('trangthaiOrder')} className={STYLES.select}>
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={STYLES.label}>Ngày mua hàng</label>
                      <input {...register('ngaymuahang')} type="date" className={STYLES.input} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Ngày về VN</label>
                      <input {...register('ngayveVN')} type="date" className={STYLES.input} />
                    </div>
                    {watchedTrangThai === 'Completed' && (
                      <div>
                        <label className={STYLES.label}>Ngày hoàn thành</label>
                        <input {...register('ngayHoanThanh')} type="date" className={STYLES.input} />
                      </div>
                    )}
                    <div>
                      <label className={STYLES.label}>Loại hàng</label>
                      <select
                        {...register('LoaiHangID', {
                          setValueAs: (v) => (v ? (isNaN(Number(v)) ? undefined : Number(v)) : undefined),
                        })}
                        className={STYLES.select}
                      >
                        <option value="">Chọn loại hàng</option>
                        {productTypes.map((pt: { LoaiHangID: number; TenLoaiHang: string }) => (
                          <option key={pt.LoaiHangID} value={pt.LoaiHangID}>
                            {pt.TenLoaiHang}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Khi Completed có thêm field Ngày hoàn thành → 6 single + Quốc gia.
                        Bỏ col-span-2 để cân hàng (Loại hàng | Quốc gia). */}
                    <div className={watchedTrangThai === 'Completed' ? '' : 'md:col-span-2'}>
                      <label className={STYLES.label}>Quốc gia</label>
                      <select
                        {...register('QuocGiaID', {
                          setValueAs: (v) => (v ? (isNaN(Number(v)) ? undefined : Number(v)) : undefined),
                        })}
                        className={STYLES.select}
                      >
                        <option value="">Chọn quốc gia</option>
                        {countries.map((c: { QuocGiaID: number; TenQuocGia: string }) => (
                          <option key={c.QuocGiaID} value={c.QuocGiaID}>
                            {c.TenQuocGia}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Product Info */}
                <div className={STYLES.card}>
                  <h3 className={STYLES.sectionTitle}>Thông tin sản phẩm</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className={STYLES.label}>Link sản phẩm</label>
                      <input {...register('linkweb')} type="text" placeholder="https://..." className={STYLES.input} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Link hình ảnh</label>
                      <input {...register('linkhinh')} type="text" placeholder="https://..." className={STYLES.input} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Tải lên hình ảnh</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setImageFile(file);
                            setImagePreview(URL.createObjectURL(file));
                          }
                        }}
                        className={`${STYLES.input} file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100 cursor-pointer`}
                      />
                    </div>
                    {imagePreview && (
                      <div className="md:col-span-2">
                        <div className="inline-block rounded-lg bg-white p-2 border border-gray-200">
                          <img src={imagePreview} alt="Preview" className="h-24 w-auto object-contain" />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className={STYLES.label}>Màu sắc</label>
                      <input {...register('corlor')} type="text" className={STYLES.input} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Size</label>
                      <input {...register('size')} type="text" className={STYLES.input} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Số lượng</label>
                      <input
                        {...register('soluong', { valueAsNumber: true })}
                        type="number"
                        min="1"
                        className={STYLES.input}
                      />
                      {errors.soluong && (
                        <p className="text-red-500 text-xs mt-1">{errors.soluong.message}</p>
                      )}
                    </div>
                    <div>
                      <label className={STYLES.label}>Đơn giá web</label>
                      <input
                        {...register('dongiaweb', { valueAsNumber: true })}
                        type="number"
                        step="0.01"
                        min="0"
                        className={STYLES.input}
                      />
                      {errors.dongiaweb && (
                        <p className="text-red-500 text-xs mt-1">{errors.dongiaweb.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pricing */}
                <div className={STYLES.card}>
                  <h3 className={STYLES.sectionTitle}>Thông tin giá</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={STYLES.label}>Sale off (%)</label>
                      <input {...register('saleoff', { valueAsNumber: true })} type="number" min="0" max="100" className={STYLES.input} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Phụ thu</label>
                      <input {...register('phuthu', { valueAsNumber: true })} type="number" step="0.01" min="0" className={STYLES.input} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Ship USA</label>
                      <input {...register('shipUSA', { valueAsNumber: true })} type="number" step="0.01" min="0" className={STYLES.input} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Thuế (%)</label>
                      <input {...register('tax', { valueAsNumber: true })} type="number" step="0.01" min="0" disabled className={STYLES.readonly} />
                    </div>
                    <div>
                      <label className={STYLES.label}>% Công</label>
                      <input
                        {...register('cong', { valueAsNumber: true })}
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={!congEnabled}
                        className={`${STYLES.input} ${!congEnabled ? 'bg-gray-50 cursor-not-allowed text-gray-400' : ''}`}
                      />
                    </div>
                    <div>
                      <label className={STYLES.label}>Loại tiền</label>
                      <select {...register('loaitien')} className={STYLES.select}>
                        {exchangeRates.map((er: { Name: string; TyGiaVND: number }, idx: number) => (
                          <option key={`${er.Name}-${idx}`} value={er.Name}>{er.Name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className={STYLES.label}>Tỷ giá</label>
                      <input {...register('tygia', { valueAsNumber: true })} type="number" step="0.01" min="0" className={STYLES.input} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Giá sau off (Ngoại tệ)</label>
                      <input {...register('giasauoffUSD', { valueAsNumber: true })} type="number" step="0.01" readOnly className={STYLES.readonly} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Giá sau off (VND)</label>
                      <input {...register('giasauoffVND', { valueAsNumber: true })} type="number" readOnly className={STYLES.readonly} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Tiền công (Ngoại tệ)</label>
                      <input {...register('tiencongUSD', { valueAsNumber: true })} type="number" step="0.01" readOnly className={STYLES.readonly} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Tiền công (VND)</label>
                      <input {...register('tiencongVND', { valueAsNumber: true })} type="number" readOnly className={STYLES.readonly} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Tổng tiền (Ngoại tệ)</label>
                      <input {...register('tongtienUSD', { valueAsNumber: true })} type="number" step="0.01" readOnly className={STYLES.readonly} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Tổng tiền (VND)</label>
                      <input {...register('tongtienVND', { valueAsNumber: true })} type="number" readOnly className={STYLES.readonly} />
                    </div>
                  </div>
                </div>

                {/*
                  NHÀ CUNG CẤP — "ở dưới cùng, trên mục ghi chú" (yêu cầu bên
                  khách 12/10/2026). Vị trí này là nguyên văn yêu cầu, đừng dọn
                  lên trên cho gọn.

                  Cả khối ẩn hoàn toàn với người không có quyền `giaNcc`. Ẩn ở
                  đây chỉ để bớt bấm — máy chủ đã xoá sáu cột NCC_* khỏi JSON
                  trả về, nên không có gì để xem kể cả khi mở tab Network.
                */}
                {xemGiaNcc && (
                  <div className={STYLES.card}>
                    <h3 className={STYLES.sectionTitle}>Nhà cung cấp</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className={STYLES.label}>Nhà cung cấp</label>
                        <select
                          value={ncc.NCC_ID}
                          onChange={(e) => setNcc((t) => ({ ...t, NCC_ID: e.target.value }))}
                          className={STYLES.select}
                        >
                          <option value="">— Chưa chọn —</option>
                          {dsNhaCungCap.map((n) => (
                            <option key={n.NhaCungCapID} value={n.NhaCungCapID}>
                              {n.TenNhaCungCap}
                            </option>
                          ))}
                        </select>
                        {dsNhaCungCap.length === 0 && (
                          <p className="mt-1 text-xs text-gray-500">
                            Danh mục nhà cung cấp còn rỗng — thêm ở trang Danh mục &gt; Nhà cung cấp.
                          </p>
                        )}
                      </div>

                      <div>
                        <label className={STYLES.label}>
                          Ngoại tệ{watchedLoaiTien ? ` (${watchedLoaiTien})` : ''}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={ncc.NCC_NgoaiTe}
                          onChange={(e) => setNcc((t) => ({ ...t, NCC_NgoaiTe: e.target.value }))}
                          className={STYLES.input}
                        />
                      </div>

                      <div>
                        <label className={STYLES.label}>% Công</label>
                        <input
                          type="number"
                          step="0.01"
                          value={ncc.NCC_Cong}
                          onChange={(e) => setNcc((t) => ({ ...t, NCC_Cong: e.target.value }))}
                          placeholder="Nhập 3 nghĩa là 3%"
                          className={STYLES.input}
                        />
                        {/* Hiện luôn ra tiền: gõ phần trăm mà không thấy nó
                            thành bao nhiêu ngoại tệ thì rất dễ nhập nhầm 3
                            thành 300. */}
                        {tienCongNcc > 0 && (
                          <p className="mt-1 text-xs text-gray-500">
                            = {tienCongNcc.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}{' '}
                            {order?.loaiTien || ''}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className={STYLES.label}>Tỷ giá</label>
                        <input
                          type="number"
                          step="0.01"
                          value={ncc.NCC_TyGia}
                          onChange={(e) => setNcc((t) => ({ ...t, NCC_TyGia: e.target.value }))}
                          placeholder={
                            watch('tygia') ? `Tỷ giá bán khách: ${watch('tygia')}` : ''
                          }
                          className={STYLES.input}
                        />
                      </div>

                      <div>
                        <label className={STYLES.label}>Tổng phải trả (VNĐ)</label>
                        <input
                          type="number"
                          step="1"
                          value={ncc.NCC_TongPhaiTra}
                          onChange={(e) => {
                            setTongPhaiTraSuaTay(true);
                            setNcc((t) => ({ ...t, NCC_TongPhaiTra: e.target.value }));
                          }}
                          className={STYLES.input}
                        />
                        {tongPhaiTraSuaTay ? (
                          <button
                            type="button"
                            onClick={() => setTongPhaiTraSuaTay(false)}
                            className="mt-1 text-xs text-cyan-700 underline"
                          >
                            Tính lại theo (Ngoại tệ + %Công) × Tỷ giá
                            {tongPhaiTraGoiY ? ` = ${tongPhaiTraGoiY.toLocaleString('vi-VN')}` : ''}
                          </button>
                        ) : (
                          <p className="mt-1 text-xs text-gray-500">
                            Đang tự tính (Ngoại tệ + %Công) × Tỷ giá. Sửa tay thì thôi tự tính.
                          </p>
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <label className={STYLES.label}>Tracking</label>
                        <input
                          type="text"
                          maxLength={100}
                          value={ncc.NCC_Tracking}
                          onChange={(e) => setNcc((t) => ({ ...t, NCC_Tracking: e.target.value }))}
                          className={STYLES.input}
                        />
                      </div>

                      {/* LÃI/LỖ — tự nhảy, không cho nhập. */}
                      <div className="md:col-span-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-medium text-gray-700">Lãi / Lỗ</span>
                          <span
                            className={`text-lg font-bold ${
                              laiLo === null
                                ? 'text-gray-400'
                                : laiLo < 0
                                  ? 'text-red-600'
                                  : 'text-emerald-700'
                            }`}
                          >
                            {laiLo === null ? 'Chưa nhập giá NCC' : laiLo.toLocaleString('vi-VN')}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          Tổng tiền thu khách ({(Number(watch('tongtienVND')) || 0).toLocaleString('vi-VN')})
                          − Tổng phải trả NCC
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className={STYLES.card}>
                  <h3 className={STYLES.sectionTitle}>Ghi chú</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={STYLES.label}>Ghi chú</label>
                      <textarea {...register('ghichu')} rows={3} className={`${STYLES.input} resize-none`} />
                    </div>
                    <div>
                      <label className={STYLES.label}>Admin ghi chú</label>
                      <textarea {...register('adminNote')} rows={3} className={`${STYLES.input} resize-none`} />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-white px-5 py-3 rounded-b-xl">
            <button type="button" onClick={onClose} className={STYLES.buttonSecondary}>
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isLoadingOrder || !order}
              className={STYLES.buttonPrimary}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang lưu...
                </span>
              ) : (
                'Cập nhật'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
