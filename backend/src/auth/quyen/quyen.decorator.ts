import { SetMetadata } from '@nestjs/common';
import { MaQuyen, Mien } from './bo-phan';

export const MIEN_KEY = 'quyen:mien';
export const QUYEN_KEY = 'quyen:ma';

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
