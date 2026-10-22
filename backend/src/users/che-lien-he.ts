/**
 * CHE EMAIL VÀ SỐ ĐIỆN THOẠI CỦA KHÁCH khỏi những người không có quyền
 * `xemLienHeKhach`.
 *
 * YÊU CẦU BÊN KHÁCH 22/10/2026: "a ơi giúp e mở quyền xem, xuất file user cho
 * đội kế toán a nhé, ẩn thông tin mail và sdt với kế toán ạ".
 *
 * PHẢI CHE Ở ĐÂY, KHÔNG PHẢI CHỈ ẨN CỘT TRÊN WEB. `GET /users` chạy
 * `SELECT Id, UserName, Email, PhoneNumber, …` rồi trả thẳng mảng cho web, nên
 * ẩn hai cột ở bảng mà để nguyên JSON thì mở tab Network là đọc được email và
 * số điện thoại của toàn bộ 985 tài khoản. File Excel cũng dựng từ chính mảng
 * đó, nên cắt ở đây là cắt được cả hai đường cùng lúc.
 *
 * `delete` chứ không đặt về null — giống `cheNcc` bên orders: để web phân biệt
 * được "không có quyền xem" (khoá không tồn tại) với "khách chưa khai" (khoá
 * có, giá trị null). Đặt null thì cột hiện ra một dấu gạch, người xem tưởng cả
 * 985 khách đều chưa có email.
 */

/** Những khoá thuộc nhóm thông tin liên hệ. */
const KHOA_LIEN_HE: readonly string[] = ['Email', 'PhoneNumber'];

export const cheLienHe = <T extends Record<string, any>>(row: T): T => {
  if (!row || typeof row !== 'object') return row;
  const ra: Record<string, any> = { ...row };
  for (const k of KHOA_LIEN_HE) delete ra[k];
  return ra as T;
};

/** `cheLienHe` cho cả danh sách. */
export const cheLienHeDanhSach = <T extends Record<string, any>>(rows: T[]): T[] =>
  (rows ?? []).map((r) => cheLienHe(r));

/**
 * Người gọi có được xem email/số điện thoại không.
 *
 * `=== true` chứ không phải "khác undefined": route nào đó chưa qua QuyenGuard
 * thì `req.quyen` rỗng, và khi đó phải coi là KHÔNG có quyền — siết, không nới.
 */
export const coXemLienHe = (req: any): boolean =>
  req?.quyen?.quyen?.includes('xemLienHeKhach') === true;
