/**
 * Lọc menu quản trị theo quyền của người đang đăng nhập.
 *
 * CHỈ ĐỂ BỚT BẤM VÀO CHỖ TRỐNG — chặn thật nằm ở QuyenGuard phía máy chủ. Nhưng
 * "chỉ cosmetic" không có nghĩa là không quan trọng: bộ phận Kho mở mục "Tuổi
 * nợ" ra thì được một trang trắng kèm năm dòng 403 đỏ trong console, vì họ
 * không có miền `dashboard`. Nhìn như phần mềm hỏng chứ không như "mục này
 * không dành cho bạn".
 *
 * Ba việc, phải làm đủ cả ba thì menu mới sạch:
 *
 *   1. Bỏ mục con không đủ quyền.
 *   2. Bỏ DÒNG PHÂN CÁCH bị mồ côi — nhóm FINANCE có dòng "BÁO CÁO" rồi mới
 *      tới các báo cáo; giấu hết báo cáo đi mà để lại cái gạch đầu thì thành
 *      một dòng chữ lửng.
 *   3. Bỏ cả NHÓM nếu không còn mục con nào — không thì Kho thấy "TỔNG QUAN",
 *      "TÀI KHOẢN", "DANH MỤC & CẤU HÌNH" bấm vào đều xổ ra khoảng trắng.
 */

export type MucCon = {
  href: string;
  label: string;
  type?: 'divider';
  /** Mã quyền cần có. Bỏ trống thì ai cũng thấy. */
  canQuyen?: string;
};

export type Nhom<T extends MucCon = MucCon> = {
  label: string;
  submenu: T[];
};

/** Mục con thật sự bấm được (không phải dòng phân cách). */
const laMucThat = (m: MucCon) => m.type !== 'divider' && !!m.href;

/**
 * Bỏ dòng phân cách không còn mục nào đứng sau nó (hoặc chỉ có một dòng phân
 * cách khác đứng sau).
 */
export function boPhanCachMoCoi<T extends MucCon>(ds: T[]): T[] {
  return ds.filter((m, i) => {
    if (laMucThat(m)) return true;
    return ds.slice(i + 1).some(laMucThat);
  });
}

/** Lọc một nhóm. Trả về `null` khi nhóm không còn gì để hiện. */
export function locNhom<T extends MucCon, N extends Nhom<T>>(
  nhom: N,
  co: (ma: string) => boolean,
): N | null {
  const conLai = boPhanCachMoCoi(nhom.submenu.filter((m) => !m.canQuyen || co(m.canQuyen)));
  if (!conLai.some(laMucThat)) return null;
  return { ...nhom, submenu: conLai };
}

/** Lọc cả menu. */
export function locMenu<T extends MucCon, N extends Nhom<T>>(
  ds: N[],
  co: (ma: string) => boolean,
): N[] {
  return ds.map((n) => locNhom(n, co)).filter((n): n is N => n !== null);
}
