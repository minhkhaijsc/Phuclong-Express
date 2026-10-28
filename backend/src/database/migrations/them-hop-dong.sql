-- Migration: HỢP ĐỒNG MẪU + HỢP ĐỒNG KÝ ONLINE
--
-- Màn ảnh hưởng: /admin/hop-dong (tạo), /hop-dong/<mã> (khách xem + ký),
--                /hop-dong-cua-toi (khách đăng nhập xem lại).
--
-- VÌ SAO: yêu cầu bên khách 28/10/2026 —
--   "up Hợp đồng mẫu và thông tin khách => Web tự tạo link hợp đồng có tên
--    khách luôn". Hỏi lại thì chốt: Admin, CSKH, Kế toán cùng tạo được; "khách
--    có link là xem đc, khách log in user là xem"; ký online "càng tốt".
--
-- ===== HAI BẢNG =====
--
-- tbHopDongMau   file Word mẫu (có ô `{TenO}`), lưu thẳng trong CSDL.
-- tbHopDong      một hợp đồng cho MỘT khách, sinh từ một mẫu.
--
-- File lưu trong CSDL (varbinary) chứ không ra thư mục: site chạy iisnode trên
-- Plesk, mỗi lần triển khai là đổi thư mục — file nằm ngoài CSDL dễ mất, và sao
-- lưu CSDL là đủ cả hợp đồng. Một hợp đồng ~50–200KB; giới hạn 10GB của bản
-- Express còn rộng.
--
-- KÝ: lúc khách ký, máy chủ điền lại mẫu với dữ liệu cuối + ảnh chữ ký, lưu
-- thành `FileDaKy` kèm mã băm SHA-256. Từ đó hợp đồng KHÔNG sửa được nữa — muốn
-- đổi gì phải huỷ và tạo hợp đồng mới. Giữ lại IP, trình duyệt, giờ ký, tên gõ
-- tay làm chứng cứ ký điện tử.

SET NOCOUNT ON;

IF OBJECT_ID('dbo.tbHopDongMau', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbHopDongMau (
    MauID      int IDENTITY(1,1) NOT NULL,
    Ten        nvarchar(200)     NOT NULL,
    TenFile    nvarchar(260)     NOT NULL,
    NoiDung    varbinary(max)    NOT NULL,
    -- Danh sách ô đọc được từ file, JSON mảng chuỗi.
    CacO       nvarchar(max)     NOT NULL,
    NguoiTao   nvarchar(256)     NULL,
    NgayTao    datetime          NOT NULL CONSTRAINT DF_tbHopDongMau_NgayTao DEFAULT (GETDATE()),
    DaXoa      bit               NOT NULL CONSTRAINT DF_tbHopDongMau_DaXoa DEFAULT (0),
    NguoiXoa   nvarchar(256)     NULL,
    NgayXoa    datetime          NULL,
    CONSTRAINT PK_tbHopDongMau PRIMARY KEY CLUSTERED (MauID)
  );
END

GO

IF OBJECT_ID('dbo.tbHopDong', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbHopDong (
    HopDongID     int IDENTITY(1,1) NOT NULL,
    -- Chuỗi ngẫu nhiên trong đường link — ai có link là xem được, nên đủ dài để
    -- không đoán được (32 byte, hex).
    MaLink        varchar(64)       NOT NULL,
    MauID         int               NOT NULL,
    -- Tài khoản khách (AspNetUsers.UserName).
    UserName      nvarchar(256)     NOT NULL,
    SoHopDong     nvarchar(100)     NULL,
    -- Giá trị các ô, JSON object.
    DuLieu        nvarchar(max)     NOT NULL,
    -- Ô khách được tự điền lúc ký (để trống lúc tạo), JSON mảng chuỗi.
    OKhachDien    nvarchar(max)     NULL,
    -- 'cho-ky' | 'da-ky' | 'da-huy'
    TrangThai     varchar(10)       NOT NULL CONSTRAINT DF_tbHopDong_TrangThai DEFAULT ('cho-ky'),
    NguoiTao      nvarchar(256)     NULL,
    NgayTao       datetime          NOT NULL CONSTRAINT DF_tbHopDong_NgayTao DEFAULT (GETDATE()),
    LanXemDau     datetime          NULL,
    -- Ký
    NgayKy        datetime          NULL,
    TenNguoiKy    nvarchar(200)     NULL,
    UserKy        nvarchar(256)     NULL,
    IpKy          varchar(64)       NULL,
    TrinhDuyetKy  nvarchar(400)     NULL,
    AnhChuKy      varbinary(max)    NULL,
    FileDaKy      varbinary(max)    NULL,
    BamFileDaKy   char(64)          NULL,
    -- Huỷ
    NgayHuy       datetime          NULL,
    NguoiHuy      nvarchar(256)     NULL,
    LyDoHuy       nvarchar(500)     NULL,
    CONSTRAINT PK_tbHopDong PRIMARY KEY CLUSTERED (HopDongID),
    CONSTRAINT UQ_tbHopDong_MaLink UNIQUE (MaLink),
    CONSTRAINT FK_tbHopDong_Mau FOREIGN KEY (MauID) REFERENCES dbo.tbHopDongMau (MauID),
    CONSTRAINT CK_tbHopDong_TrangThai CHECK (TrangThai IN ('cho-ky', 'da-ky', 'da-huy'))
  );

  CREATE INDEX IX_tbHopDong_UserName ON dbo.tbHopDong (UserName, NgayTao);
END
