/**
 * Phương thức thu tiền mặt khi lên công nợ.
 *
 * Ô "Tài khoản" trên form công nợ (và cột "Tài khoản" khi nhập Excel) vốn chỉ
 * có các tài khoản ngân hàng → ghi chú "Báo chuyển khoản - <TK>". CSKH cần thêm
 * thu tiền mặt, nên ô đó có thêm lựa chọn TIEN_MAT; chọn nó thì ghi chú là
 * GHI_CHU_TIEN_MAT. Không thêm cột mới — lọc "Tiền mặt" ở danh sách là tìm chuỗi
 * này trong GhiChu, giống lọc theo ngân hàng.
 */
export const TIEN_MAT = 'Tiền mặt';
export const GHI_CHU_TIEN_MAT = 'Thu tiền mặt';

export function laTienMat(taiKhoan?: string | null): boolean {
  return (taiKhoan ?? '').normalize('NFC').trim().toLowerCase() === TIEN_MAT.toLowerCase();
}
