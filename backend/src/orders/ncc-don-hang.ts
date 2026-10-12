/**
 * KHỐI NHÀ CUNG CẤP TRÊN MỘT DÒNG ĐƠN — đọc, ghi, và tính lãi/lỗ.
 *
 * Tách khỏi `orders.service.ts` (đã hơn 2.600 dòng) vì toàn bộ phần này là
 * phép tính thuần, không chạm CSDL, nên kiểm tra được bằng unit test thật.
 *
 * YÊU CẦU BÊN KHÁCH 12/10/2026: "thêm giúp em 1 phần nhập về NHÀ CUNG CẤP ở
 * dưới cùng, trên mục ghi chú: Nhà cung cấp, Ngoại tệ, Công, Tổng phải trả,
 * Tỷ giá, Tracking, Lãi/Lỗ (Phần lãi, lỗ) sẽ là số liệu giữa phần thông tin
 * giá so với thông tin nhà cung cấp (tự nhảy số liệu lãi lỗ bn). Tuy nhiên
 * phần nhập thông tin của NCC cũng như Lãi/Lỗ, chỉ quyền mua hàng, kế toán, GD
 * với được quyền xem."
 */

/** Cột NCC trên DON_HANG, đúng tên trong CSDL. */
export const COT_NCC = [
  'NCC_ID',
  'NCC_NgoaiTe',
  'NCC_Cong',
  'NCC_TyGia',
  'NCC_TongPhaiTra',
  'NCC_Tracking',
] as const;

/** Khoá phái sinh mà API tự thêm vào, cũng phải che cùng nhóm. */
export const COT_NCC_PHAI_SINH = ['NCC_TenNhaCungCap', 'NCC_LaiLo'] as const;

const MOI_KHOA_NCC: readonly string[] = [...COT_NCC, ...COT_NCC_PHAI_SINH];

const so = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * LÃI/LỖ của một dòng đơn, tính VNĐ.
 *
 *   lãi/lỗ = tổng tiền thu khách (tongtienVND) − tổng phải trả NCC
 *
 * Trả `null` khi CHƯA CÓ giá nhà cung cấp — khác hẳn 0. 0 nghĩa là "thu bằng
 * đúng số phải trả", còn null nghĩa là "chưa ai nhập giá NCC nên chưa biết".
 * Gộp hai thứ đó thành 0 thì bảng tổng cộng lãi/lỗ sẽ cộng cả những đơn chưa
 * nhập vào như thể chúng hoà vốn, và con số cuối cùng vô nghĩa.
 *
 * Nhận CẢ HAI cách gọi tổng tiền: `tongtienVND` (tên cột, đường `GET
 * /orders/:id` trả dòng thô) và `tongTienVnd` (đường danh sách đã đổi sang
 * camelCase). Thiếu một trong hai là lãi/lỗ của màn kia lệch đúng bằng tổng
 * tiền thu khách — sai to mà vẫn ra một con số trông hợp lý.
 */
export const laiLo = (row: {
  tongtienVND?: unknown;
  tongTienVnd?: unknown;
  NCC_TongPhaiTra?: unknown;
}): number | null => {
  const phaiTra = so(row?.NCC_TongPhaiTra);
  if (phaiTra === null) return null;
  const thu = so(row?.tongtienVND) ?? so(row?.tongTienVnd) ?? 0;
  return Math.round(thu - phaiTra);
};

/**
 * Tổng phải trả GỢI Ý, dùng để điền sẵn ô nhập ở phía web:
 *
 *   (Ngoại tệ + Công) × Tỷ giá
 *
 * Người nhập SỬA ĐƯỢC con số này. Hoá đơn nhà cung cấp hay lệch vài đồng vì họ
 * làm tròn theo cách của họ, mà con số đi vào công nợ phải là con số trên hoá
 * đơn, không phải con số mình tự nhân ra.
 */
export const tongPhaiTraGoiY = (
  ngoaiTe: unknown,
  cong: unknown,
  tyGia: unknown,
): number => Math.round(((so(ngoaiTe) ?? 0) + (so(cong) ?? 0)) * (so(tyGia) ?? 0));

/**
 * Bỏ MỌI khoá NCC khỏi một dòng đơn trước khi trả về cho người không có quyền
 * `giaNcc`.
 *
 * Phải che ở tầng API chứ không chỉ ẩn ô trên web: `GET /orders/:id` và
 * `POST /orders/list` trả thẳng dòng DON_HANG, mà SP dùng `SELECT DH.*` nên
 * sáu cột NCC_* tự chảy ra ngoài ngay khi migration chạy xong. Ẩn ô trên web
 * mà không che ở đây thì mở tab Network là đọc được giá nhập.
 *
 * `delete` chứ không đặt về null: để người gọi phân biệt được "không có quyền
 * xem" (khoá không tồn tại) với "chưa ai nhập" (khoá có, giá trị null).
 */
export const cheNcc = <T extends Record<string, any>>(row: T): T => {
  if (!row || typeof row !== 'object') return row;
  const ra: Record<string, any> = { ...row };
  for (const k of MOI_KHOA_NCC) delete ra[k];
  return ra as T;
};

/** `cheNcc` cho cả danh sách. */
export const cheNccDanhSach = <T extends Record<string, any>>(rows: T[]): T[] =>
  (rows ?? []).map((r) => cheNcc(r));

/**
 * Thêm tên nhà cung cấp và lãi/lỗ vào dòng đơn cho người CÓ quyền `giaNcc`.
 * `tenTheoId` là bản đồ NhaCungCapID -> tên, nạp một lần cho cả trang.
 */
export const ganNcc = <T extends Record<string, any>>(
  row: T,
  tenTheoId: Map<number, string>,
): T => {
  if (!row || typeof row !== 'object') return row;
  const id = so(row.NCC_ID);
  return {
    ...row,
    NCC_TenNhaCungCap: id === null ? null : tenTheoId.get(id) ?? null,
    NCC_LaiLo: laiLo(row),
  } as T;
};

export interface ThanNcc {
  NCC_ID: number | null;
  NCC_NgoaiTe: number | null;
  NCC_Cong: number | null;
  NCC_TyGia: number | null;
  NCC_TongPhaiTra: number | null;
  NCC_Tracking: string | null;
}

/**
 * Đọc phần NCC từ thân yêu cầu của phía web.
 *
 * Trả `null` khi thân KHÔNG CÓ khoá NCC nào. Đây là chỗ quan trọng nhất của tệp
 * này: màn sửa chi tiết đơn gửi lên toàn bộ biểu mẫu, và với người không có
 * quyền `giaNcc` thì khối NCC không hiện nên không có khoá nào trong thân. Nếu
 * coi "không có khoá" là "đặt về null" thì CSKH mở đơn ra bấm Cập nhật một cái
 * là XOÁ SẠCH giá nhập mà mua hàng đã nhập, không một dấu vết nào ngoài nhật ký.
 *
 * Nhận cả `NCC_ID` (đúng tên cột) lẫn `nccId` (kiểu camelCase phía web) vì
 * `updateOrderDetail` vốn đã nhận cả hai cách gọi cho mọi trường khác.
 */
export const docThanNcc = (body: Record<string, any> | null | undefined): ThanNcc | null => {
  if (!body || typeof body !== 'object') return null;

  const lay = (...ten: string[]) => {
    for (const t of ten) {
      if (Object.prototype.hasOwnProperty.call(body, t)) return body[t];
    }
    return undefined;
  };

  const tho = {
    NCC_ID: lay('NCC_ID', 'nccId'),
    NCC_NgoaiTe: lay('NCC_NgoaiTe', 'nccNgoaiTe'),
    NCC_Cong: lay('NCC_Cong', 'nccCong'),
    NCC_TyGia: lay('NCC_TyGia', 'nccTyGia'),
    NCC_TongPhaiTra: lay('NCC_TongPhaiTra', 'nccTongPhaiTra'),
    NCC_Tracking: lay('NCC_Tracking', 'nccTracking'),
  };

  if (Object.values(tho).every((v) => v === undefined)) return null;

  const chuoi = tho.NCC_Tracking;
  return {
    NCC_ID: so(tho.NCC_ID),
    NCC_NgoaiTe: so(tho.NCC_NgoaiTe),
    NCC_Cong: so(tho.NCC_Cong),
    NCC_TyGia: so(tho.NCC_TyGia),
    NCC_TongPhaiTra: so(tho.NCC_TongPhaiTra),
    NCC_Tracking:
      chuoi === null || chuoi === undefined || String(chuoi).trim() === ''
        ? null
        : String(chuoi).trim().slice(0, 100),
  };
};

/** Một dòng cho nhật ký, để sau còn truy ai sửa giá nhập lúc nào. */
export const nhatKyNcc = (t: ThanNcc): string =>
  [
    `NCC_ID: ${t.NCC_ID ?? ''}`,
    `NCC_NgoaiTe: ${t.NCC_NgoaiTe ?? ''}`,
    `NCC_Cong: ${t.NCC_Cong ?? ''}`,
    `NCC_TyGia: ${t.NCC_TyGia ?? ''}`,
    `NCC_TongPhaiTra: ${t.NCC_TongPhaiTra ?? ''}`,
    `NCC_Tracking: ${t.NCC_Tracking ?? ''}`,
  ].join('; ');
