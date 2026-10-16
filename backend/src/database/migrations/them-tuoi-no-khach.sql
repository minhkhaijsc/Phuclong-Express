/*
 * TUỔI NỢ (số ngày được nợ) cho từng mã khách hàng.
 *
 * Yêu cầu bên khách 16/10/2026: "thêm tuổi nợ vào từng user" — khách nào có
 * thoả thuận được nợ bao nhiêu ngày thì phần mềm căn vào đó mà tính, chứ không
 * đếm từ ngày up công nợ nữa:
 *
 *   "nếu ko co tuoi nợ thì cứ tính từ ngày up công nơ, chia ra, dưới 30 ngày,
 *    trên 30 ngày duoi 60 ngay, và trên 60 ngày. còn khách nào có tuổi nợ, thì
 *    phần mềm nó tự tính căn cứ vào tuổi nơ, ko dua vào ngày up cong no"
 *
 * NULL = KHÔNG CÓ THOẢ THUẬN, khác hẳn `0`. Null thì báo cáo Tuổi nợ đếm từ
 * ngày ghi nợ như trước; `0` nghĩa là phải trả ngay, quá hạn ngay hôm sau.
 * Đừng đặt DEFAULT 0 cho 938 dòng đang có: làm thế là tự tay tuyên bố cả công
 * ty không ai được nợ ngày nào, hôm sau báo cáo đỏ toàn bộ.
 *
 * KHÔNG RÀNG BUỘC CHECK: lược đồ này không có cái nào, và bản web ASP cũ vẫn
 * ghi thẳng vào AspNetUsers — thêm ràng buộc ở đây là thêm một chỗ mới để nó
 * ném lỗi. Chặn số âm làm ở tầng API (`du-lieu-tai-khoan`/`users`) thay vì ở
 * CSDL.
 *
 * Thêm cột nullable không có mặc định chỉ đụng siêu dữ liệu — SQL Server không
 * viết lại bảng, chạy giữa giờ làm cũng không khoá bảng.
 */

IF COL_LENGTH('dbo.AspNetUsers', 'TuoiNo') IS NULL
BEGIN
    ALTER TABLE dbo.AspNetUsers ADD TuoiNo int NULL;
END
GO
