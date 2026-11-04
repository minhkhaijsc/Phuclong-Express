-- Migration: LỊCH SỬ gán CSKH phụ trách khách
--
-- Màn ảnh hưởng: /admin/dashboard/san-luong-khach (báo cáo sản lượng khách hàng)
--
-- VÌ SAO: yêu cầu bên khách 04/11/2026 —
--   "1/10 Khách A gán cho CSKH A, 15/10 Khách A chuyển sang CSKH B care
--    => dữ liệu mình có lưu cho CSKH cũ được không, 1/10-14/10 vẫn lưu cho
--    CSKH A, từ 15/10 lưu cho CSKH B chứ không phải chuyển từ A sang B"
--
-- `AspNetUsers.CSKHPhuTrach` chỉ giữ người phụ trách HIỆN TẠI, nên chuyển khách
-- là cả quá khứ của khách đi theo người mới. Bảng này giữ từng lần đổi:
--
--   một dòng = "từ ngày TuNgay, khách UserName thuộc CSKH" (CSKH NULL = bỏ gán)
--
-- Một dòng công nợ ngày D thuộc về dòng lịch sử có TuNgay <= D mới nhất
-- (cùng ngày thì ID lớn hơn thắng).
--
-- TuNgay là NGÀY (không giờ): đổi lúc 10h sáng 15/10 thì cả ngày 15/10 tính cho
-- người mới — khớp cách bên khách nói "từ 15/10 lưu cho CSKH B". GETDATE() của
-- máy chủ CSDL là giờ Việt Nam (đo 04/11/2026: lệch UTC +7).
--
-- LẦN GÁN ĐẦU TIÊN của một khách lấy TuNgay = 1900-01-01: trước khi có bảng này
-- không ai ghi lại khách thuộc ai, nên toàn bộ quá khứ tính cho người được gán
-- đầu tiên. Lúc chạy, cả 510 khách đã gán đều gán lần đầu trong ngày 03/11/2026
-- (nhật ký "CSKHPhuTrach:GanHangLoat"), chưa ai bị chuyển lần nào.
--
-- Mã ghi bảng này: `lich-su-cskh.ts` (dongBoLichSuCskh). Gọi sau mọi đường đổi
-- CSKHPhuTrach, và báo cáo gọi thêm một lượt cho tất cả trước khi đọc — lưới
-- đỡ cho đường nào lỡ quên.
--
-- Chỉ THÊM bảng mới, không đụng bảng sẵn có. Lùi: DROP TABLE dbo.tbLichSuCskh.

SET NOCOUNT ON;

IF OBJECT_ID('dbo.tbLichSuCskh', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbLichSuCskh (
    ID        int IDENTITY(1,1) NOT NULL CONSTRAINT PK_tbLichSuCskh PRIMARY KEY,
    UserName  nvarchar(256) NOT NULL,
    CSKH      nvarchar(256) NULL,
    TuNgay    date NOT NULL,
    NguoiDoi  nvarchar(256) NULL,
    NgayGhi   datetime NOT NULL CONSTRAINT DF_tbLichSuCskh_NgayGhi DEFAULT GETDATE()
  );
  CREATE INDEX IX_tbLichSuCskh_UserName_TuNgay ON dbo.tbLichSuCskh (UserName, TuNgay, ID) INCLUDE (CSKH);
END;

-- Ghi lần gán hiện tại của mọi khách đã gán (chạy lại không sinh trùng).
INSERT INTO dbo.tbLichSuCskh (UserName, CSKH, TuNgay, NguoiDoi)
SELECT u.UserName, LTRIM(RTRIM(u.CSKHPhuTrach)), '19000101', 'khoi-tao'
  FROM dbo.AspNetUsers u
 WHERE ISNULL(LTRIM(RTRIM(u.CSKHPhuTrach)), '') <> ''
   AND NOT EXISTS (SELECT 1 FROM dbo.AspNetUserRoles r WHERE r.UserId = u.Id)
   AND NOT EXISTS (SELECT 1 FROM dbo.tbLichSuCskh x WHERE x.UserName = u.UserName);

SELECT COUNT(*) AS soDong FROM dbo.tbLichSuCskh;
