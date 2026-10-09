/**
 * Một tài khoản bám vào những cột nào trong CSDL.
 *
 * VÌ SAO LÀ MỘT BẢNG DỮ LIỆU, không phải mấy câu SQL viết tay rải rác: phần
 * ĐẾM (hiện cho người dùng xem trước khi xoá) và phần CHUYỂN (cập nhật thật)
 * phải khớp nhau tuyệt đối. Viết rời hai nơi thì chỉ cần một bảng bị quên ở
 * nhánh đếm là hộp thoại báo "không còn gì" trong khi vẫn còn hàng nghìn dòng
 * — mà lúc ấy người ta đã bấm xoá rồi.
 *
 * Bản đầu của bộ chặn xoá chỉ biết 3 bảng (CONGNO, tbTracking, Don_Hang). Quét
 * lại toàn CSDL ngày 09/10/2026 thì có 21 cột trên 14 bảng. Những chỗ bị sót
 * không hề nhỏ:
 *   • tbTinhTrangTracking.NguoiTao  — 270.089 dòng
 *   • tbChotKy                      — 19.477 dòng (chốt công nợ theo kỳ)
 *   • Notifications, DotHang, tbAnhTracking…
 * Riêng CSKHNHI: bộ chặn cũ thấy 0 dòng, quét đủ thấy 78.786 dòng tình trạng
 * tracking.
 *
 * CÁCH ĐỌC MỘT DÒNG:
 *   nhom 'khach' — cột trỏ tới CHỦ của dữ liệu. Chuyển đi = gán dữ liệu đó cho
 *                  mã khác (gộp mã).
 *   nhom 'nhap'  — cột ghi AI ĐÃ NHẬP/sửa. Chuyển đi = bàn giao đầu việc.
 *
 * KHÔNG có bảng `USERS` (2 dòng, mật khẩu để trần, không liên quan AspNetUsers)
 * và KHÔNG có `tbSystemLogs` — nhật ký hệ thống là thứ để truy lại ai làm gì,
 * sửa nó đi thì chính bản ghi về lần xoá này cũng mất nghĩa. Nhật ký chỉ được
 * ĐẾM để hiện cho người dùng biết, không bao giờ bị đụng tới.
 */

export type NhomDuLieu = 'khach' | 'nhap';

export interface CotThamChieu {
  bang: string;
  cot: string;
  nhom: NhomDuLieu;
  /** Chữ hiện trên hộp thoại. */
  nhan: string;
  /**
   * Dòng này có nghĩa theo cặp (kỳ, mã) nên gộp hai mã sẽ sinh hai dòng cùng
   * kỳ. Không sai dữ liệu nhưng báo cáo công nợ phải biết — giao diện cảnh báo.
   */
  canhBaoGop?: true;
}

export const COT_THAM_CHIEU: readonly CotThamChieu[] = [
  // ---- Dữ liệu CỦA mã ----
  { bang: 'CONGNO', cot: 'UserName', nhom: 'khach', nhan: 'Dòng công nợ' },
  { bang: 'tbTracking', cot: 'UserName', nhom: 'khach', nhan: 'Kiện hàng' },
  { bang: 'DON_HANG', cot: 'username', nhom: 'khach', nhan: 'Đơn mua hộ' },
  { bang: 'tbChotKy', cot: 'UserName', nhom: 'khach', nhan: 'Dòng chốt kỳ công nợ', canhBaoGop: true },
  { bang: 'DotHang', cot: 'UserName', nhom: 'khach', nhan: 'Đợt hàng' },
  { bang: 'Notifications', cot: 'UserName', nhom: 'khach', nhan: 'Thông báo' },
  { bang: 'DiaChiNhanHang', cot: 'UserName', nhom: 'khach', nhan: 'Địa chỉ nhận hàng' },
  { bang: 'HanMucKhachHang', cot: 'UserName', nhom: 'khach', nhan: 'Hạn mức công nợ' },
  { bang: 'THACMAC', cot: 'username', nhom: 'khach', nhan: 'Thắc mắc' },
  { bang: 'tbLoHang', cot: 'UserName', nhom: 'khach', nhan: 'Lô hàng' },

  // ---- Dấu vết AI ĐÃ NHẬP ----
  { bang: 'CONGNO', cot: 'NguoiTao', nhom: 'nhap', nhan: 'Dòng công nợ đã nhập' },
  { bang: 'CONGNO', cot: 'NguoiCapNhatCuoi', nhom: 'nhap', nhan: 'Dòng công nợ đã sửa' },
  { bang: 'tbTracking', cot: 'NguoiTao', nhom: 'nhap', nhan: 'Kiện hàng đã nhập' },
  { bang: 'tbTinhTrangTracking', cot: 'NguoiTao', nhom: 'nhap', nhan: 'Lần cập nhật tình trạng kiện' },
  { bang: 'DON_HANG', cot: 'usernamesave', nhom: 'nhap', nhan: 'Đơn mua hộ đã nhập' },
  { bang: 'tbChotKy', cot: 'NguoiTao', nhom: 'nhap', nhan: 'Lần chốt kỳ' },
  { bang: 'tbChotKy', cot: 'NguoiCapNhatCuoi', nhom: 'nhap', nhan: 'Lần sửa chốt kỳ' },
  { bang: 'tbAnhTracking', cot: 'NguoiTao', nhom: 'nhap', nhan: 'Ảnh kiện hàng đã tải lên' },
  { bang: 'tbAnhTracking', cot: 'NguoiXoa', nhom: 'nhap', nhan: 'Ảnh kiện hàng đã xoá' },
  { bang: 'tbLoHang', cot: 'NguoiTao', nhom: 'nhap', nhan: 'Lô hàng đã tạo' },
  { bang: 'TY_GIA_HISTORY', cot: 'NguoiCapNhat', nhom: 'nhap', nhan: 'Lần đổi tỷ giá' },
];

/** Nhật ký hệ thống — chỉ đếm, tuyệt đối không chuyển và không xoá. */
export const BANG_NHAT_KY = { bang: 'tbSystemLogs', cot: 'NguoiTao' } as const;

/**
 * Bảng phụ của ASP.NET Identity. `AspNetUsers` KHÔNG có khoá ngoại nào trỏ về
 * (đã kiểm: 0 foreign key), nên xoá tài khoản mà không dọn mấy bảng này là để
 * lại vai trò/đăng nhập mồ côi — lần sau có ai trùng Id là thừa hưởng luôn.
 */
export const BANG_PHU_IDENTITY: readonly { bang: string; cot: string }[] = [
  { bang: 'AspNetUserRoles', cot: 'UserId' },
  { bang: 'AspNetUserClaims', cot: 'UserId' },
  { bang: 'AspNetUserLogins', cot: 'UserId' },
];

/**
 * Tên bảng/cột chỉ được lấy từ hằng trong tệp này rồi mới ghép vào câu lệnh.
 * Hàm này chặn đường một giá trị lạ lọt vào SQL nếu sau này có ai đọc bản đồ từ
 * nơi khác — tên hợp lệ chỉ gồm chữ, số và gạch dưới.
 */
export const tenAnToan = (s: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
    throw new Error(`Tên bảng/cột không hợp lệ: ${s}`);
  }
  return s;
};
