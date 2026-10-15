/*
 * CSKH PHỤ TRÁCH cho từng mã khách hàng.
 *
 * Yêu cầu bên khách 15/10/2026: "lúc tạo mã khách hàng, CSKH sẽ gắn tên CSKH
 * vào với từng mã khách".
 *
 * LƯU TÊN ĐĂNG NHẬP, KHÔNG LƯU HỌ TÊN. `AspNetUsers.HoTen` đổi được bất cứ lúc
 * nào (lấy chồng, sửa chính tả, viết hoa lại), mà cột này thì sẽ nằm trong báo
 * cáo doanh số theo CSKH về sau. Lưu họ tên là hai năm nữa không gộp nổi. Tên
 * đăng nhập là khoá duy nhất và không ai sửa.
 *
 * KHÔNG LÀM KHOÁ NGOẠI: cả lược đồ này không có cái nào, và thêm vào đây là
 * thêm một chỗ mới để bản web ASP cũ ném lỗi khi nó ghi vào AspNetUsers. Thay
 * vào đó, màn hình chỉ cho chọn trong danh sách CSKH đang làm việc, và lúc hiện
 * lại thì tra tên — tra không ra thì hiện nguyên tên đăng nhập chứ không giấu.
 *
 * NULL = CHƯA GÁN, khác hẳn với "không có ai phụ trách". 938 tài khoản hiện có
 * đều sẽ là NULL cho tới khi CSKH gán dần.
 *
 * Thêm cột nullable không có mặc định là thao tác chỉ đụng siêu dữ liệu — SQL
 * Server không viết lại bảng, nên chạy giữa giờ làm cũng không khoá bảng.
 */

IF COL_LENGTH('dbo.AspNetUsers', 'CSKHPhuTrach') IS NULL
BEGIN
    ALTER TABLE dbo.AspNetUsers ADD CSKHPhuTrach nvarchar(100) NULL;
END
GO

/*
 * Chỉ mục LỌC: chỉ đánh trên dòng đã gán. Màn danh sách lọc theo "khách của ai"
 * và báo cáo sau này gộp theo cột này, mà phần lớn bảng còn NULL — chỉ mục đầy
 * đủ trên 938 dòng toàn NULL thì vừa to vừa vô dụng.
 */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AspNetUsers_CSKHPhuTrach')
BEGIN
    CREATE INDEX IX_AspNetUsers_CSKHPhuTrach
        ON dbo.AspNetUsers (CSKHPhuTrach)
        INCLUDE (UserName, HoTen)
        WHERE CSKHPhuTrach IS NOT NULL;
END
GO
