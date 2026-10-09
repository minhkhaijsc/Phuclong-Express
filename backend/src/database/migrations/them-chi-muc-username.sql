-- Migration: chỉ mục trên cột UserName của ba bảng dữ liệu
--
-- CHẠY NGOÀI GIỜ CAO ĐIỂM. SQL Server Express không tạo chỉ mục trực tuyến
-- được, nên bảng bị khoá trong lúc tạo. Với 250.776 / 136.391 / 42.701 dòng thì
-- chỉ vài giây, nhưng trong mấy giây đó ai mở danh sách tracking sẽ thấy treo.
--
-- VÌ SAO CẦN: kiểm tra sys.indexes ngày 09/10/2026 — cả ba bảng CHỈ CÓ khoá
-- chính, không có chỉ mục nào trên cột UserName. Mọi truy vấn lọc theo một
-- khách đều quét toàn bảng. Hai chỗ chịu thiệt nhất:
--
--   • Màn trạng thái khách (users/trang-thai): tính lần giao dịch cuối của 938
--     khách — đo được 1.094 ms khi chưa có chỉ mục.
--   • Màn /tong-quan của khách: lọc đúng một UserName, nhưng chạy mỗi lần một
--     khách mở trang. Cột INCLUDE bên dưới làm ba truy vấn của màn đó thành
--     "covering" — đọc xong ngay trong chỉ mục, không phải tra về bảng chính.
--
-- GHI CHÚ: `add-indexes-tracking-tables.sql` trong cùng thư mục cũng tạo
-- IX_tbTracking_UserName, nhưng CSDL thật không có chỉ mục nào trong số đó —
-- tệp ấy chưa từng được chạy. Tên ở đây khác nên hai tệp không đụng nhau.
--
-- Chạy:  npx ts-node scripts/execute-migration.ts src/database/migrations/them-chi-muc-username.sql

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tbTracking_UserName_NgayTao' AND object_id = OBJECT_ID('dbo.tbTracking'))
    CREATE INDEX IX_tbTracking_UserName_NgayTao ON dbo.tbTracking (UserName, DaXoa, NgayTao) INCLUDE (QuocGiaID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CONGNO_UserName_NgayGhiNo' AND object_id = OBJECT_ID('dbo.CONGNO'))
    CREATE INDEX IX_CONGNO_UserName_NgayGhiNo ON dbo.CONGNO (UserName, DaXoa, NgayGhiNo) INCLUDE (DR, CR, SanLuong);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Don_Hang_username' AND object_id = OBJECT_ID('dbo.Don_Hang'))
    CREATE INDEX IX_Don_Hang_username ON dbo.Don_Hang (username, DaXoa, ngaysaveLink);
GO
