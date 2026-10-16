/**
 * CÔNG THỨC GIÁ NHÀ CUNG CẤP — một chỗ duy nhất cho cả màn sửa từng đơn lẫn
 * màn nhập hàng loạt.
 *
 *   Tiền công     = Ngoại tệ × %Công / 100
 *   Tổng phải trả = (Ngoại tệ + Tiền công) × Tỷ giá
 *
 * Ô "% Công" là PHẦN TRĂM, không phải số tiền — sửa 15/10/2026 theo bên khách:
 * "mục Công đang sai, sửa lại giúp em là % công (= % × ngoại tệ), để tổng phải
 * trả = (ngoại tệ + %công) × tỷ giá". Giống hệt nghĩa của cột `cong` ở phía bán
 * cho khách, nên hai bên giờ cùng một cách hiểu.
 *
 * Cùng công thức với `tongPhaiTraGoiY` trong backend/src/orders/ncc-don-hang.ts.
 * Lặp lại ở đây chứ không gọi API: đây là phép nhân chạy theo từng lần bấm bàn
 * phím. ĐỔI CÔNG THỨC THÌ PHẢI SỬA CẢ HAI CHỖ — và máy chủ mới là chỗ quyết
 * định con số được ghi xuống, bản này chỉ để hiện trước cho người nhập thấy.
 */

/** Chuỗi từ ô nhập → số. Ô trống hay gõ sai đều ra 0. */
export const soNcc = (v: unknown): number => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

export const tienCongNcc = (ngoaiTe: unknown, phanTramCong: unknown): number =>
  (soNcc(ngoaiTe) * soNcc(phanTramCong)) / 100;

export const tongPhaiTraGoiY = (
  ngoaiTe: unknown,
  phanTramCong: unknown,
  tyGia: unknown,
): number =>
  Math.round((soNcc(ngoaiTe) + tienCongNcc(ngoaiTe, phanTramCong)) * soNcc(tyGia));

/**
 * Tổng phải trả của màn HÀNG LOẠT: `null` khi chưa đủ dữ kiện.
 *
 * Khác hàm trên một chỗ quan trọng: thiếu ngoại tệ hoặc thiếu tỷ giá thì trả
 * `null` chứ không trả 0, để bảng xem trước hiện "— giữ nguyên" thay vì hiện 0
 * đồng. Giữ đúng luật của máy chủ (`tongPhaiTraTuDong` trong
 * backend/src/orders/ncc-hang-loat.ts): `NCC_TongPhaiTra` khác null là dấu
 * "đơn này đã nhập giá NCC" mà trang công nợ phải trả dựa vào.
 */
export const tongPhaiTraNeuDu = (
  ngoaiTe: unknown,
  phanTramCong: unknown,
  tyGia: unknown,
): number | null => {
  const nt = soNcc(ngoaiTe);
  const tg = soNcc(tyGia);
  if (nt <= 0 || tg <= 0) return null;
  return tongPhaiTraGoiY(nt, phanTramCong, tg);
};
