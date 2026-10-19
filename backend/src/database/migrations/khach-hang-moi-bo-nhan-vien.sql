-- Migration: "Tổng KH mới" trên Dashboard chỉ đếm KHÁCH, bỏ tài khoản nhân viên
-- Ngày tạo: 2026-10-19
--
-- VÌ SAO: bên khách hỏi ngày 19/10/2026 "Tổng khách hàng mới: là số khách hàng
-- được tạo mới trên hệ thống hay số khách phát sinh giao dịch lần đầu?". Đi tra
-- thì câu trả lời đúng là "tài khoản tạo mới" — nhưng thủ tục cũ đếm MỌI dòng
-- trong AspNetUsers, tức là tạo một tài khoản kế toán hay kho cũng được cộng
-- vào "khách hàng mới".
--
-- Đã đo (90 ngày tính tới 19/10/2026): ngày 15/10 đếm 2 thì chỉ 1 là khách
-- thật, ngày 05/10 cũng vậy. Số tuyệt đối nhỏ nhưng nhãn đang nói sai.
--
-- RANH GIỚI khách / nhân viên: "không có dòng nào trong AspNetUserRoles" —
-- đúng cái điều kiện mà tầng phân quyền (auth/quyen) và ArticlesController
-- đang dùng, không nghĩ ra định nghĩa mới.
--
-- KHÔNG đụng tới điều kiện `NgayTao IS NOT NULL`: 675/985 tài khoản không có
-- ngày tạo (hệ thống bắt đầu ghi cột này từ 01/08/2023). Chúng vốn đã không
-- xuất hiện trong thống kê và không có cách nào đoán ngược ngày tạo của chúng.
--
-- CÁCH CHẠY: "Execute SQL Script" (DBeaver: Alt+X) — chạy cả file.

IF OBJECT_ID('dbo.SP_Dashboard_KhachHangMoiTheoNgay', 'P') IS NOT NULL
    DROP PROCEDURE dbo.SP_Dashboard_KhachHangMoiTheoNgay;
GO

CREATE PROCEDURE dbo.SP_Dashboard_KhachHangMoiTheoNgay
    @TuNgay  datetime,
    @DenNgay datetime
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CAST(u.NgayTao AS date) AS Ngay,
           COUNT(*)                AS SoKHMoi
    FROM dbo.AspNetUsers u
    WHERE u.NgayTao IS NOT NULL
      AND u.NgayTao BETWEEN @TuNgay AND @DenNgay
      -- Khách hàng = tài khoản KHÔNG mang vai trò nào. Có vai trò là nhân viên.
      AND NOT EXISTS (
            SELECT 1 FROM dbo.AspNetUserRoles ur WHERE ur.UserId = u.Id
          )
    GROUP BY CAST(u.NgayTao AS date)
    ORDER BY Ngay;
END;
GO

-- ====================================================================
-- LÙI LẠI (bản cũ, đếm cả nhân viên)
-- ====================================================================
-- IF OBJECT_ID('dbo.SP_Dashboard_KhachHangMoiTheoNgay', 'P') IS NOT NULL
--     DROP PROCEDURE dbo.SP_Dashboard_KhachHangMoiTheoNgay;
-- GO
-- CREATE PROCEDURE dbo.SP_Dashboard_KhachHangMoiTheoNgay
--     @TuNgay  datetime,
--     @DenNgay datetime
-- AS
-- BEGIN
--     SET NOCOUNT ON;
--     SELECT CAST(NgayTao AS date) AS Ngay,
--            COUNT(*)              AS SoKHMoi
--     FROM dbo.AspNetUsers
--     WHERE NgayTao IS NOT NULL
--       AND NgayTao BETWEEN @TuNgay AND @DenNgay
--     GROUP BY CAST(NgayTao AS date)
--     ORDER BY Ngay;
-- END;
-- GO
