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

// ---------------------------------------------------------------------------
// CHE THEO NGƯỜI PHỤ TRÁCH — yêu cầu bên khách 23/10/2026:
//
//   "gán danh sách khách theo mỗi nv sales phụ trách chính. Sales chỉ có thể
//    xem thông tin cá nhân của các khách mình phụ trách, ko xem được thông tin
//    khách của sales khác (trừ TP,PP)"
//
// Ba mức:
//   • tatCa   — `xemLienHeMoiKhach` (Admin, TP/GĐ của bộ phận xem được liên hệ)
//   • cuaMinh — chỉ `xemLienHeKhach` (sales thường): thấy khách mình phụ trách
//               và khách CHƯA GÁN cho ai
//   • khong   — kế toán và mọi bộ phận còn lại: che hết, như 22/10
//
// Khách chưa gán thì để mở là quyết định của anh Quang 23/10: lúc làm, cả 985
// tài khoản đều chưa gán. Che luôn khách chưa gán là từ phút đẩy lên, 15 sales
// không gọi được khách nào cho tới khi gán xong cả nghìn mã.
// ---------------------------------------------------------------------------

export type MucXemLienHe = 'tatCa' | 'cuaMinh' | 'khong';

export const mucXemLienHe = (req: any): MucXemLienHe => {
  const q: unknown = req?.quyen?.quyen;
  if (!Array.isArray(q)) return 'khong';
  if (q.includes('xemLienHeMoiKhach')) return 'tatCa';
  if (q.includes('xemLienHeKhach')) return 'cuaMinh';
  return 'khong';
};

/** So tên đăng nhập: bỏ khoảng trắng hai đầu, không phân biệt hoa thường. */
const cungTen = (a: unknown, b: unknown): boolean => {
  const x = String(a ?? '').trim().toUpperCase();
  return x !== '' && x === String(b ?? '').trim().toUpperCase();
};

/**
 * Người đang gọi có được xem liên hệ của dòng này không.
 *
 * `phuTrach`/`tenDong` truyền vào riêng chứ không đọc thẳng khoá trên dòng:
 * mỗi đường trả dữ liệu đặt tên khác nhau (`CSKHPhuTrach`/`UserName` ở danh
 * sách User, `cskhPhuTrach`/`userName` ở màn trạng thái khách).
 */
export const duocXemLienHeCua = (
  req: any,
  phuTrach: unknown,
  tenDong?: unknown,
): boolean => {
  const muc = mucXemLienHe(req);
  if (muc === 'tatCa') return true;
  if (muc === 'khong') return false;
  const toi = req?.user?.username;
  // Chính tài khoản của mình thì luôn xem được.
  if (tenDong !== undefined && cungTen(tenDong, toi)) return true;
  // Chưa gán ai → mở (xem ghi chú đầu khối).
  if (!String(phuTrach ?? '').trim()) return true;
  return cungTen(phuTrach, toi);
};

/** Che một dòng của `AspNetUsers` (khoá `Email`, `PhoneNumber`) theo người xem. */
export const cheTheoNguoiXem = <T extends Record<string, any>>(req: any, row: T): T => {
  if (!row || typeof row !== 'object') return row;
  return duocXemLienHeCua(req, row.CSKHPhuTrach, row.UserName) ? row : cheLienHe(row);
};

export const cheTheoNguoiXemDanhSach = <T extends Record<string, any>>(req: any, rows: T[]): T[] =>
  (rows ?? []).map((r) => cheTheoNguoiXem(req, r));
