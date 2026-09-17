/**
 * Đọc số tracking từ tên file ảnh.
 *
 * Quy ước kho: tên ảnh CHÍNH LÀ số tracking — `1Z999AA10123456784.jpg`.
 * Một tracking nhiều ảnh thì kho hay đặt thêm đuôi: `…_1.jpg`, `…-2.jpg`,
 * `… (3).jpg` (Windows tự thêm khi trùng tên).
 *
 * Trả về các ỨNG VIÊN theo thứ tự ưu tiên. Bên gọi thử lần lượt, gặp cái nào
 * có trong hệ thống thì dừng. Tên nguyên văn LUÔN đứng đầu — nên tracking có
 * gạch ngang thật (`ABC-12`) vẫn khớp đúng chính nó chứ không bị cắt thành `ABC`.
 */

export const DUOI_ANH = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
];

/**
 * Ứng viên sinh ra do BỎ ĐUÔI mà ngắn hơn chừng này thì bỏ — "AB_1" cắt còn
 * "AB" dễ khớp nhầm tracking lạ. Tên nguyên văn thì không giới hạn.
 */
const DO_DAI_TOI_THIEU = 4;

export function laTenAnh(tenFile: string): boolean {
  const ten = tenCoSo(tenFile).toLowerCase();
  const cham = ten.lastIndexOf('.');
  return cham > 0 && DUOI_ANH.includes(ten.slice(cham));
}

/** Bỏ đường dẫn thư mục (cả `/` lẫn `\`), chỉ giữ tên file. */
export function tenCoSo(tenFile: string): string {
  const s = String(tenFile ?? '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return s.slice(i + 1);
}

export function ungVienTracking(tenFile: string): string[] {
  let goc = tenCoSo(tenFile);
  const cham = goc.lastIndexOf('.');
  if (cham > 0 && goc.length - cham <= 6) goc = goc.slice(0, cham);
  goc = goc.trim();

  const ra: string[] = [];
  const them = (s: string) => {
    const t = s.trim();
    if (t.length >= DO_DAI_TOI_THIEU && !ra.includes(t)) ra.push(t);
  };

  if (goc) ra.push(goc);
  // "ABC (2)" — Windows đặt khi chép trùng tên
  const boNgoac = goc.replace(/\s*\(\d{1,3}\)$/, '');
  them(boNgoac);
  // "ABC_2", "ABC-2", "ABC 2" — kho tự đánh số ảnh
  them(boNgoac.replace(/[_\-\s]\d{1,2}$/, ''));
  return ra;
}

/** So khớp không phân biệt hoa thường và khoảng trắng đầu cuối — giống collation CI của SQL Server. */
export const khoaSo = (s: string) =>
  String(s ?? '')
    .trim()
    .toLowerCase();
