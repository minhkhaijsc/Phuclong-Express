/*
  THÊM BỘ PHẬN VÀ CẤP VÀO AspNetRoles
  ===================================

  Vì sao cần: tới 10/10/2026 CSDL chỉ có 4 vai trò — Admin, Kho, Sale, Order —
  trong khi công ty có 6 bộ phận. Không có vai trò cho CSKH, kế toán, mua hàng,
  vận chuyển, MKT, nên ai cần làm được việc đều phải cấp `Admin`: 17 tài khoản
  đang mang Admin, gồm cả CSKHNGA, MKT_LUYEN, KETOANDIEP, KT_THUPHUONG,
  KTTRANGNGO, MHDUONG.

  Chạy được nhiều lần, không hỏng gì: mỗi dòng đều kiểm tồn tại trước khi thêm.

  CHỈ THÊM VAI TRÒ, KHÔNG GÁN CHO AI. Việc gán là quyết định của bên khách và
  làm trên màn /admin/users — xem bảng gợi ý ở cuối tệp. Vai trò cũ (Admin, Kho,
  Sale, Order) GIỮ NGUYÊN, không xoá, không đổi tên: mã nguồn quy đổi Sale→CSKH,
  Order→MuaHang, Kho→Kho nên ngày triển khai không ai bị khoá.
*/

SET NOCOUNT ON;

DECLARE @them TABLE (Name nvarchar(512) PRIMARY KEY);

-- Bộ phận
INSERT INTO @them (Name) VALUES
  (N'CSKH'),
  (N'MuaHang'),
  (N'KeToan'),
  (N'VanChuyen'),
  (N'MKT'),
  (N'KhoSG'),
-- Cấp — độc lập với bộ phận, dùng để mở Dashboard
  (N'TruongPhong'),
  (N'GiamDoc');

INSERT INTO dbo.AspNetRoles (Id, Name)
SELECT CONVERT(nvarchar(256), NEWID()), t.Name
FROM   @them t
WHERE  NOT EXISTS (SELECT 1 FROM dbo.AspNetRoles r WHERE r.Name = t.Name);

-- SQL Server 2014 không cho truy vấn con làm tham số của CONCAT bên trong
-- PRINT ("Subqueries are not allowed in this context"), và đó là lỗi lúc
-- biên dịch nên cả lô bị từ chối, kể cả câu INSERT ở trên. Tách ra biến.
DECLARE @soVaiTro int = (SELECT COUNT(*) FROM dbo.AspNetRoles);
PRINT CONCAT(N'Vai tro sau khi chay: ', @soVaiTro);

SELECT r.Name AS vaiTro,
       (SELECT COUNT(*) FROM dbo.AspNetUserRoles ur WHERE ur.RoleId = r.Id) AS soTaiKhoan
FROM   dbo.AspNetRoles r
ORDER  BY soTaiKhoan DESC, r.Name;

/*
  ------------------------------------------------------------------------
  GỢI Ý GÁN BỘ PHẬN — ĐỌC RỒI HÃY CHẠY, KHÔNG CHẠY TỰ ĐỘNG
  ------------------------------------------------------------------------

  Suy từ tiền tố tên đăng nhập của 17 tài khoản đang mang Admin. Đây là PHỎNG
  ĐOÁN, phải có người trong công ty xác nhận từng dòng trước khi đổi — gán sai
  là người ta không làm được việc ngay sáng hôm sau:

    QLPHUONGANH    -> Admin      (giữ)
    admin, quanglm -> Admin      (giữ — tài khoản kỹ thuật)
    CSKHNGA        -> CSKH
    CSKHNHI        -> CSKH       (đang có Admin + Sale)
    KETOANDIEP     -> KeToan
    KETOAN         -> KeToan     (đang có Admin + Kho + Order + Sale)
    KT_THUPHUONG   -> KeToan
    KTTRANGNGO     -> KeToan
    MKT_LUYEN      -> MKT
    MHDUONG        -> MuaHang
    DHLEHIEN       -> MuaHang ?  — tiền tố "DH", cần xác nhận là Đặt hàng
    DHLIEN         -> MuaHang ?
    DHTU           -> MuaHang ?
    DHUYEN         -> MuaHang ?
    TL_HANH        -> ?          — không đoán được từ tên
    TUYETBUI       -> ?          — không đoán được từ tên
    HP1343         -> ?          — xem cảnh báo bên dưới
    HP748          -> ?          — xem cảnh báo bên dưới
    KHOSGHAO       -> KhoSG      (đang là Kho)

  CẢNH BÁO: HP1343 (TRỊNH BÁ QUYỀN) và HP748 (TRẦN THỊ NGÂN HÀ) mang vai trò
  Admin nhưng tên đăng nhập theo đúng dạng MÃ KHÁCH HÀNG (hai chữ + số). Nếu
  đúng là khách hàng thì hiện họ đang có toàn quyền quản trị. Kiểm trước, đừng
  chỉ đổi bộ phận.

  Câu lệnh gán, chạy từng dòng một:

    DECLARE @u nvarchar(512) = N'CSKHNGA';
    DECLARE @r nvarchar(512) = N'CSKH';
    INSERT INTO dbo.AspNetUserRoles (UserId, RoleId)
    SELECT u.Id, r.Id
    FROM dbo.AspNetUsers u CROSS JOIN dbo.AspNetRoles r
    WHERE u.UserName = @u AND r.Name = @r
      AND NOT EXISTS (SELECT 1 FROM dbo.AspNetUserRoles x
                      WHERE x.UserId = u.Id AND x.RoleId = r.Id);

  Bỏ Admin khỏi một tài khoản sau khi đã gán bộ phận mới:

    DELETE ur
    FROM dbo.AspNetUserRoles ur
    JOIN dbo.AspNetUsers u ON u.Id = ur.UserId
    JOIN dbo.AspNetRoles r ON r.Id = ur.RoleId
    WHERE u.UserName = N'CSKHNGA' AND r.Name = N'Admin';

  Phải luôn còn ÍT NHẤT MỘT tài khoản Admin. Kiểm trước khi bỏ dòng cuối:

    SELECT COUNT(*) AS soAdmin
    FROM dbo.AspNetUserRoles ur
    JOIN dbo.AspNetRoles r ON r.Id = ur.RoleId
    WHERE r.Name = N'Admin';
*/
