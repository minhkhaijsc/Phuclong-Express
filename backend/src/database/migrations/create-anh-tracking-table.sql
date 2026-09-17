-- Ảnh hàng gắn vào tracking (up cả thư mục, tên ảnh = số tracking).
--
-- Bảng riêng, KHÔNG dùng tbChiTietTracking: bảng đó là phần khách tự khai
-- (hình + số lượng + giá) ở trang Sửa tracking — nhét ảnh kho vào sẽ hiện thành
-- dòng khai báo rỗng trong trang của khách và làm lệch cột SoLuongChiTiet.
--
-- Xoá mềm (DaXoa) — file ảnh vẫn còn trên đĩa, lỡ tay xoá thì lật cờ lại được.
-- Chạy lại nhiều lần không sao.

IF OBJECT_ID('dbo.tbAnhTracking', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tbAnhTracking (
        AnhTrackingID int IDENTITY(1,1) NOT NULL,
        TrackingID    int NOT NULL,
        LinkHinh      nvarchar(500) NOT NULL,
        TenFileGoc    nvarchar(255) NULL,
        NguoiTao      nvarchar(250) NULL,
        NgayTao       datetime NOT NULL CONSTRAINT DF_tbAnhTracking_NgayTao DEFAULT GETDATE(),
        DaXoa         bit NOT NULL CONSTRAINT DF_tbAnhTracking_DaXoa DEFAULT 0,
        NguoiXoa      nvarchar(250) NULL,
        NgayXoa       datetime NULL,
        CONSTRAINT PK_tbAnhTracking PRIMARY KEY (AnhTrackingID)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tbAnhTracking_TrackingID' AND object_id = OBJECT_ID('dbo.tbAnhTracking'))
    CREATE INDEX IX_tbAnhTracking_TrackingID ON dbo.tbAnhTracking (TrackingID, DaXoa);
