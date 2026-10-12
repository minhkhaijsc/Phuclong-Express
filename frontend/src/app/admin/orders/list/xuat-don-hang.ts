import type { Order } from '@/types/order';

/**
 * BẢNG CỘT CHO BẢN XUẤT DANH SÁCH ĐƠN — dùng cho CẢ HAI nút ("1 trang" và
 * "theo bộ lọc"), để hai nút không bao giờ lệch nhau nữa.
 *
 * VÌ SAO VIẾT LẠI (yêu cầu bên khách 12/10/2026 — "Giá sau off, Tiền công,
 * Tổng tiền, Ngoại tệ xuất excel không có số liệu"):
 *
 *   1. THIẾU CỘT. Màn sửa chi tiết đơn (EditOrderDetail) hiện mỗi chỉ số hai
 *      lần — bản ngoại tệ và bản VNĐ. Bản xuất cũ chỉ có 'Công VNĐ' và
 *      'Tổng VNĐ': không có Giá sau off (cả hai bản), không có bản ngoại tệ của
 *      tiền công và tổng tiền. Đúng bốn chỉ số bên khách kể tên.
 *   2. LỆCH CỘT. Bản cũ tự nối chuỗi bằng `values.join(',')` và chỉ bỏ dấu phẩy
 *      trong `linkweb` với `ghichu`. Màu và Size thì không — trong CSDL từ
 *      01/07/2026 có 6 đơn Màu và 17 đơn Size chứa dấu phẩy. Mỗi dấu phẩy đó
 *      đẩy TẤT CẢ cột phía sau sang phải một ô, nên đúng mấy cột tiền ở cuối
 *      rơi sai chỗ hoặc rỗng.
 *   3. KHÔNG PHẢI EXCEL. Bản cũ đặt tên .csv; Excel bản tiếng Việt lấy dấu phân
 *      cách mặc định là `;` nên mở ra có thể dồn cả dòng vào một ô. Giờ ghi
 *      .xlsx thật qua `downloadDataAsExcel`: số là số, ngày là ngày, và dấu
 *      phẩy trong nội dung không còn nghĩa gì.
 *
 * Để ở tệp RIÊNG, không nằm trong component: `page.tsx` đã 1.500 dòng, mà phần
 * này là phép đổi dữ liệu thuần nên chạy được bằng Node với dữ liệu thật để
 * kiểm, không cần dựng trình duyệt.
 */
export const COT_XUAT_DON_HANG = [
  'Mã ĐH', 'OrderNumber', 'Website', 'Username', 'Ngày ĐH', 'Ngày Save',
  'Quốc gia', 'Link', 'Màu', 'Size', 'Số lượng',
  'Giá web', '%Công', '%SaleOff', 'Phụ thu', 'ShipUS', 'Tax',
  'Ngoại tệ', 'Tỷ giá',
  'Giá sau off (NT)', 'Giá sau off (VNĐ)',
  'Tiền công (NT)', 'Tiền công (VNĐ)',
  'Tổng tiền (NT)', 'Tổng tiền (VNĐ)',
  'Vùng miền', 'Ghi chú', 'Trạng thái', 'Đợt hàng', 'Ngày complete',
] as const;

/**
 * Bảy cột NHÀ CUNG CẤP, chỉ thêm cho người có quyền `giaNcc`.
 *
 * Nối vào CUỐI, không chèn giữa: người không có quyền nhận đúng bảng cột như
 * trước, nên không ai phải sửa lại tệp mẫu hay công thức Excel đang dùng.
 *
 * Không cần lọc gì thêm ở đây: máy chủ đã xoá sạch khoá NCC_* khỏi JSON của
 * người không có quyền (`cheNcc`), nên với họ mấy cột này rỗng kể cả nếu lỡ bật.
 */
export const COT_XUAT_NCC = [
  'Nhà cung cấp', 'NCC ngoại tệ', 'NCC công', 'NCC tỷ giá',
  'NCC tổng phải trả (VNĐ)', 'NCC tracking', 'Lãi/Lỗ (VNĐ)',
] as const;

/** Ngày thật, để ExcelJS ghi thành ô ngày (DD/MM/YYYY) chứ không phải chuỗi. */
const ngay = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Tiền ngoại tệ: giữ 2 số lẻ, bỏ rác dấu phẩy động (0.11900000000000001). */
const nt = (v: number | null | undefined) => Math.round((v ?? 0) * 100) / 100;

/** Tiền VNĐ: làm tròn về đồng. */
const vnd = (v: number | null | undefined) => Math.round(v ?? 0);

export type ONhapXuat = string | number | Date | null;

/** Dòng đơn kèm khối NCC mà máy chủ gắn thêm khi người gọi có quyền. */
type DonKemNcc = Order & {
  NCC_TenNhaCungCap?: string | null;
  NCC_NgoaiTe?: number | null;
  NCC_Cong?: number | null;
  NCC_TyGia?: number | null;
  NCC_TongPhaiTra?: number | null;
  NCC_Tracking?: string | null;
  NCC_LaiLo?: number | null;
};

/**
 * Ô CHƯA NHẬP để `null`, không phải 0.
 *
 * Khác hẳn mấy cột tiền của khách ở trên (dùng `nt`/`vnd`, thiếu thì về 0): bên
 * khách thì 0 đúng là 0 đồng, còn giá nhà cung cấp chưa nhập thì chưa biết. Ghi
 * 0 vào đó là cột Lãi/Lỗ nhìn như lãi đúng bằng tiền thu khách.
 */
const ntTrong = (v: number | null | undefined) =>
  v === null || v === undefined ? null : nt(v);
const vndTrong = (v: number | null | undefined) =>
  v === null || v === undefined ? null : vnd(v);

/** Một dòng, thứ tự phải khớp đúng `COT_XUAT_DON_HANG`. */
export const dongXuatDonHang = (order: Order): ONhapXuat[] => [
  order.id,
  order.orderNumber || '',
  order.websiteName || '',
  order.username || '',
  ngay(order.ngayMuaHang),
  ngay(order.ngaySaveLink),
  order.tenQuocGia || '',
  order.linkWeb || '',
  order.color || '',
  order.size || '',
  order.soLuong ?? 0,
  nt(order.donGiaWeb),
  order.cong ?? 0,
  order.saleOff ?? 0,
  nt(order.phuThu),
  nt(order.shipUsa),
  order.tax ?? 0,
  order.loaiTien || '',
  nt(order.tyGia),
  nt(order.giaSauOffUsd),
  vnd(order.giaSauOffVnd),
  nt(order.tienCongUsd),
  vnd(order.tienCongVnd),
  nt(order.tongTienUsd),
  vnd(order.tongTienVnd),
  order.vungMien || '',
  order.ghiChu || '',
  order.trangThaiOrder || '',
  order.tenDotHang || '',
  ngay(order.ngayHoanThanh),
];

/** Một dòng NCC, thứ tự phải khớp đúng `COT_XUAT_NCC`. */
const dongXuatNcc = (order: DonKemNcc): ONhapXuat[] => [
  order.NCC_TenNhaCungCap || '',
  ntTrong(order.NCC_NgoaiTe),
  ntTrong(order.NCC_Cong),
  ntTrong(order.NCC_TyGia),
  vndTrong(order.NCC_TongPhaiTra),
  order.NCC_Tracking || '',
  vndTrong(order.NCC_LaiLo),
];

/**
 * Cả tệp: hàng đầu là tiêu đề.
 *
 * `kemNcc` = người xuất có quyền `giaNcc`. Mặc định false để chỗ gọi nào quên
 * truyền thì ra bản hẹp, không phải bản để lộ giá nhập.
 */
export const bangXuatDonHang = (don: Order[], kemNcc = false): ONhapXuat[][] => {
  const tieuDe = kemNcc
    ? [...COT_XUAT_DON_HANG, ...COT_XUAT_NCC]
    : [...COT_XUAT_DON_HANG];
  return [
    tieuDe,
    ...don.map((d) =>
      kemNcc
        ? [...dongXuatDonHang(d), ...dongXuatNcc(d as DonKemNcc)]
        : dongXuatDonHang(d),
    ),
  ];
};

export const tenTepXuatDonHang = (hau: string) =>
  `DanhSachDonHang${hau}_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}.xlsx`;
