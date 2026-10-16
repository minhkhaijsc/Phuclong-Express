import { SetMetadata } from '@nestjs/common';
import { MaQuyen, Mien } from './bo-phan';

export const MIEN_KEY = 'quyen:mien';
export const QUYEN_KEY = 'quyen:ma';
export const QUYEN_MOT_KEY = 'quyen:mot-trong';

/**
 * Gắn controller (hoặc một route) vào một miền chức năng. Guard tự suy ra cần
 * `xem` hay `sua` từ phương thức HTTP: GET/HEAD/OPTIONS → xem, còn lại → sua.
 *
 * Đặt ở cấp class cho cả controller, rồi chỉ ghi đè những route đi lệch.
 */
export const MienQuyen = (mien: Mien) => SetMetadata(MIEN_KEY, mien);

/**
 * Nêu thẳng mã quyền cần có, bỏ qua suy luận theo phương thức HTTP.
 *
 * Hai trường hợp phải dùng:
 *   • POST nhưng chỉ đọc — `POST /orders/list`, `POST /debt-reports/export`…
 *     Không đánh dấu thì CSKH và Kho (chỉ có quyền xem Mua hàng giúp) mở trang
 *     lên là 403, vì danh sách đơn nạp qua POST.
 *   • Route cần quyền lẻ — duyệt công nợ, tạo tài khoản nhân viên…
 *
 * Nhiều mã = cần TẤT CẢ.
 */
export const Quyen = (...ma: MaQuyen[]) => SetMetadata(QUYEN_KEY, ma);

/**
 * Cần MỘT trong các mã là đủ. Ghi đè cả `@Quyen` lẫn `@MienQuyen`.
 *
 * Dùng cho đường phục vụ NHIỀU màn thuộc nhiều miền khác nhau, mà gộp vào một
 * miền thì hoặc chặn nhầm một bộ phận, hoặc mở rộng hơn mức cần.
 *
 * Ca đầu tiên — và là lý do có decorator này — `GET /debt-reports/users`: danh
 * sách mã khách đổ vào ô chọn User. Nó nuôi cả năm màn báo cáo (`baoCao`) lẫn
 * màn Quản lý công nợ (`congNo`). Để nguyên `baoCao` thì Kho và Kho SG ghi
 * công nợ hằng ngày mà ô chọn mã khách trống (403). Đổi sang `congNo.xem` thì
 * KHÁCH HÀNG đọc được tên đăng nhập của cả 985 tài khoản. `baoCao.xem HOẶC
 * congNo.sua` trúng đúng nhóm nhân viên cần nó, không ai thừa.
 */
export const QuyenMot = (...ma: MaQuyen[]) => SetMetadata(QUYEN_MOT_KEY, ma);
