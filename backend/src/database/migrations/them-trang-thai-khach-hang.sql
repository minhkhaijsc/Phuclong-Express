-- Migration: trạng thái khách hàng (Hoạt động / Tạm nghỉ / Đã đóng mã)
--
-- Màn: admin/users
--
-- VÌ SAO: hệ đang KHÔNG CÓ cách nào đánh dấu khách ngừng giao dịch. Cách duy
-- nhất để một mã khách biến khỏi danh sách là DELETE /users/:id, mà hàm đó gọi
-- `user.destroy()` — xoá cứng dòng trong AspNetUsers. Trong khi CONGNO,
-- tbTracking và Don_Hang đều trỏ tới khách bằng CHUỖI UserName, không có khoá
-- ngoại nào: xoá tài khoản là để lại 136.391 dòng công nợ mồ côi mà không báo
-- lỗi gì. Yêu cầu "khách nghỉ, KHÔNG xoá" chính là để chặn việc đó.
--
-- CÁCH LÀM — tách làm hai lớp, cố ý:
--
--   1. Tình trạng TỰ ĐỘNG (bao lâu rồi không phát sinh giao dịch) KHÔNG lưu
--      vào bảng. Nó được tính tại chỗ từ CONGNO / tbTracking / Don_Hang mỗi
--      lần xem. Lưu lại thì phải có việc chạy định kỳ để cập nhật, mà hệ này
--      không có job nào cả — cột sẽ lệch dần rồi không ai biết nó cũ từ bao giờ.
--
--   2. QUYẾT ĐỊNH CỦA NGƯỜI (CSKH chốt "khách này nghỉ", "mã này đóng") thì
--      PHẢI lưu — đây là thông tin không suy ra được từ dữ liệu.
--
-- Bốn cột dưới đây là lớp 2. Cột `TrangThai` để NULL nghĩa là chưa ai xét tới;
-- không mặc định 'hoat-dong' để phân biệt được "đã xem và thấy vẫn hoạt động"
-- với "chưa ai nhìn tới mã này".
--
-- 'dong-ma' CHẶN ĐĂNG NHẬP (`auth.service.ts`, kiểm sau khi mật khẩu đã đúng).
-- Hai trạng thái còn lại không chặn gì — 'tam-nghi' là ghi chú của CSKH, chặn
-- luôn cả nó thì một lần bấm nhầm là khách mất đường vào. Lúc đầu không có
-- phần chặn này và 'dong-ma' chỉ là cái nhãn để bỏ mã khỏi danh sách việc cần
-- làm; nhưng câu từ chối xoá tài khoản khuyên "đóng mã thay vì xoá", nên nếu
-- đóng mã không khoá được gì thì lời khuyên đó là sai, nhất là với tài khoản
-- nhân viên đã nghỉ việc.
--
-- SỐ ĐO ngày 09/10/2026 (938 khách = tài khoản không có vai trò nào):
--      515 còn hoạt động (<3 tháng)   54 nghỉ 3–6 tháng
--       92 nghỉ 6–12 tháng           217 nghỉ hơn 1 năm
--       60 chưa từng phát sinh giao dịch
-- Tức ngưỡng 3 tháng cho ra 423 mã. Giao diện vì vậy phải xếp theo thời gian
-- nghỉ và để CSKH xử lý dần, chứ không đổ hết 423 dòng ra một lần.
--
-- Chạy một lần trên CSDL đích. An toàn khi chạy lại (có kiểm tra tồn tại).
--
-- Tệp này CHỈ thêm cột rỗng (nullable) và một chỉ mục trên bảng 981 dòng — với
-- SQL Server đó là thao tác sửa mô tả bảng, xong tức thì, không quét dữ liệu.
-- Phần chỉ mục nặng nằm riêng ở `them-chi-muc-username.sql` để chạy ngoài giờ.

-- Trạng thái: NULL | 'hoat-dong' | 'tam-nghi' | 'dong-ma'
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AspNetUsers') AND name = 'TrangThai')
    ALTER TABLE dbo.AspNetUsers ADD TrangThai NVARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AspNetUsers') AND name = 'NgayDoiTrangThai')
    ALTER TABLE dbo.AspNetUsers ADD NgayDoiTrangThai DATETIME NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AspNetUsers') AND name = 'NguoiDoiTrangThai')
    ALTER TABLE dbo.AspNetUsers ADD NguoiDoiTrangThai NVARCHAR(100) NULL;
GO

-- Lý do: CSKH gõ tay ("khách chuyển sang bên khác", "đã gọi, khách nghỉ bán").
-- Không có cột này thì ba tháng sau không ai nhớ vì sao mã bị đóng.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AspNetUsers') AND name = 'LyDoTrangThai')
    ALTER TABLE dbo.AspNetUsers ADD LyDoTrangThai NVARCHAR(500) NULL;
GO

-- Lọc theo trạng thái trên màn danh sách 981 tài khoản.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AspNetUsers_TrangThai' AND object_id = OBJECT_ID('dbo.AspNetUsers'))
    CREATE INDEX IX_AspNetUsers_TrangThai ON dbo.AspNetUsers (TrangThai);
GO
