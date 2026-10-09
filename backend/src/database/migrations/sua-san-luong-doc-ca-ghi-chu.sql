-- Migration: sản lượng (kg) phải đọc CẢ ô Ghi chú, và chặn số rác
--
-- Trang: admin/dashboard (tab Kinh doanh — Sản lượng theo ngày / theo nhân
--        viên / chi tiết), và màn /tong-quan của khách.
--
-- VÌ SAO: ba stored procedure dưới đây cộng `SUM(ISNULL(SanLuong, 0))`. Cột
-- `SanLuong` chỉ mới có từ giữa 2026 (add-sanluong-to-congno.sql); trước đó CSKH
-- gõ số kg vào ô GHI CHÚ — chính ghi chú trong tệp migration ấy đã nói: "nhập
-- sản lượng (cân kg) ... vào cột số riêng THAY VÌ ô Ghi chú".
--
-- Hậu quả đang hiện trên dashboard (đo 09/10/2026, 12 tháng gần nhất):
--
--      Tháng        Dashboard báo      Thật sự
--      2025-10             0 kg       7.419 kg
--      2025-11             0 kg       9.190 kg
--      2025-12             0 kg      15.508 kg
--      2026-01             0 kg      12.418 kg
--      2026-02             0 kg       6.674 kg
--      2026-03             0 kg       9.608 kg
--      2026-04             0 kg      10.407 kg
--      2026-05             8 kg       8.350 kg
--      2026-06        57.016 kg      10.342 kg   <- phồng 5,5 lần
--      2026-07        19.162 kg      19.060 kg
--
-- Bảy tháng báo 0, rồi một tháng phồng 5,5 lần. Tháng 6 phồng là do vài dòng
-- MẤT DẤU THẬP PHÂN nằm ngay trong cột `SanLuong`: 19354 vốn là 19,354 kg.
--
-- BA LUẬT (bản gốc và phần đo đầy đủ ở `backend/src/dashboard/san-luong-kg.ts`
-- — sửa một bên thì PHẢI sửa cả bên kia, nếu không dashboard admin và màn của
-- khách sẽ ra hai con số khác nhau):
--
--   1. Chỉ style = 8 ("Cân Kg"). 1.166 dòng thanh toán (style 2) có Ghi chú là
--      SỐ TÀI KHOẢN NGÂN HÀNG — đọc như kg thì cộng vào hàng tỷ "kg".
--   2. Phải có DR > 0. 82 dòng style 8 có DR = 0 (dòng "ck công nợ" xếp nhầm
--      loại). DR cũng là thứ duy nhất kiểm chứng được: DR = kg × đơn giá.
--   3. Đơn giá DR/kg phải nằm trong 50.000–2.000.000đ/kg. Giá thật là
--      208.000–278.000đ tuỳ tuyến; khoảng này rộng có chủ ý, để bắt số sai hẳn
--      chứ không phải để xét duyệt giá. Nếu đơn giá quá rẻ mà chia kg cho 1.000
--      thì về đúng khoảng → mất dấu thập phân, sửa luôn. Sai kiểu khác thì bỏ.
--
-- Độ phủ sau khi sửa: 29.216/32.339 dòng cân = 90,3% (trước: 24,3%).
-- 3.008 dòng còn lại không ghi kg ở đâu cả — không đoán.
--
-- Chạy:  npx ts-node scripts/execute-migration.ts src/database/migrations/sua-san-luong-doc-ca-ghi-chu.sql

-- ============================================================
-- 1. Sản lượng theo ngày
-- ============================================================
IF OBJECT_ID('dbo.SP_Dashboard_SanLuongTheoNgay', 'P') IS NOT NULL
    DROP PROCEDURE dbo.SP_Dashboard_SanLuongTheoNgay;
GO

CREATE PROCEDURE dbo.SP_Dashboard_SanLuongTheoNgay
    @TuNgay  DATETIME,
    @DenNgay DATETIME
AS
BEGIN
    SET NOCOUNT ON;

    SELECT CAST(c.NgayGhiNo AS DATE) AS Ngay,
           SUM(ISNULL(k.kg, 0))      AS SanLuongKg
    FROM dbo.CONGNO c
    CROSS APPLY (SELECT COALESCE(
        c.SanLuong,
        TRY_CONVERT(float, LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(c.GhiChu, ''), '-', ''), ',', '.'))))
      ) AS tho) t
    CROSS APPLY (SELECT CASE
        WHEN c.style <> 8 THEN NULL
        WHEN c.DR IS NULL OR c.DR <= 0 THEN NULL
        WHEN t.tho IS NULL OR t.tho <= 0 THEN NULL
        WHEN c.DR / t.tho BETWEEN 50000 AND 2000000 THEN t.tho
        WHEN c.DR / t.tho < 50000
         AND c.DR / (t.tho / 1000) BETWEEN 50000 AND 2000000 THEN t.tho / 1000
        ELSE NULL
      END AS kg) k
    WHERE c.DaXoa = 0
      AND c.style = 8
      AND k.kg IS NOT NULL
      AND c.NgayGhiNo BETWEEN @TuNgay AND @DenNgay
    GROUP BY CAST(c.NgayGhiNo AS DATE)
    ORDER BY Ngay;
END;
GO

-- ============================================================
-- 2. Sản lượng mỗi nhân viên theo tháng (giữ nguyên bộ lọc @QuocGiaID
--    đã thêm ở add-quocgia-filter-dashboard-staff-output.sql)
-- ============================================================
IF OBJECT_ID('dbo.SP_Dashboard_SanLuongNhanVienTheoThang', 'P') IS NOT NULL
    DROP PROCEDURE dbo.SP_Dashboard_SanLuongNhanVienTheoThang;
GO

CREATE PROCEDURE dbo.SP_Dashboard_SanLuongNhanVienTheoThang
    @TuNgay    DATETIME,
    @DenNgay   DATETIME,
    @QuocGiaID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    WITH DonTheoNhanVien AS (
        SELECT usernamesave AS NhanVien,
               FORMAT(ngaymuahang, 'yyyy-MM') AS Thang,
               COUNT(*) AS SoDon
        FROM dbo.DON_HANG
        WHERE DaXoa = 0
          AND ngaymuahang BETWEEN @TuNgay AND @DenNgay
          AND (@QuocGiaID IS NULL OR QuocGiaID = @QuocGiaID)
        GROUP BY usernamesave, FORMAT(ngaymuahang, 'yyyy-MM')
    ),
    KgTheoNhanVien AS (
        SELECT c.NguoiTao AS NhanVien,
               FORMAT(c.NgayGhiNo, 'yyyy-MM') AS Thang,
               SUM(ISNULL(k.kg, 0)) AS SanLuongKg
        FROM dbo.CONGNO c
        CROSS APPLY (SELECT COALESCE(
            c.SanLuong,
            TRY_CONVERT(float, LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(c.GhiChu, ''), '-', ''), ',', '.'))))
          ) AS tho) t
        CROSS APPLY (SELECT CASE
            WHEN c.style <> 8 THEN NULL
            WHEN c.DR IS NULL OR c.DR <= 0 THEN NULL
            WHEN t.tho IS NULL OR t.tho <= 0 THEN NULL
            WHEN c.DR / t.tho BETWEEN 50000 AND 2000000 THEN t.tho
            WHEN c.DR / t.tho < 50000
             AND c.DR / (t.tho / 1000) BETWEEN 50000 AND 2000000 THEN t.tho / 1000
            ELSE NULL
          END AS kg) k
        WHERE c.DaXoa = 0
          AND c.style = 8
          AND k.kg IS NOT NULL
          AND c.NgayGhiNo BETWEEN @TuNgay AND @DenNgay
          AND (@QuocGiaID IS NULL OR c.QuocGiaID = @QuocGiaID)
        GROUP BY c.NguoiTao, FORMAT(c.NgayGhiNo, 'yyyy-MM')
    )
    SELECT ISNULL(d.NhanVien, kg.NhanVien) AS NhanVien,
           ISNULL(d.Thang, kg.Thang)       AS Thang,
           ISNULL(d.SoDon, 0)              AS SoDon,
           ISNULL(kg.SanLuongKg, 0)        AS SanLuongKg
    FROM DonTheoNhanVien d
    FULL OUTER JOIN KgTheoNhanVien kg
      ON d.NhanVien = kg.NhanVien AND d.Thang = kg.Thang
    ORDER BY Thang, SoDon DESC, SanLuongKg DESC;
END;
GO

-- ============================================================
-- 3. Chi tiết từng dòng cân của một nhân viên trong một tháng
--
-- Ở màn này CỐ Ý giữ cả dòng không đọc được kg (không lọc k.kg IS NOT NULL):
-- đây là màn soi chi tiết, người dùng cần THẤY dòng nào ghi chú hỏng để còn vào
-- sửa. Cột GhiChu vẫn trả về nguyên văn cho họ đối chiếu.
-- ============================================================
IF OBJECT_ID('dbo.SP_Dashboard_SanLuongChiTiet', 'P') IS NOT NULL
    DROP PROCEDURE dbo.SP_Dashboard_SanLuongChiTiet;
GO

CREATE PROCEDURE dbo.SP_Dashboard_SanLuongChiTiet
    @NhanVien  NVARCHAR(250),
    @Thang     NVARCHAR(7),
    @QuocGiaID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT CAST(c.NgayGhiNo AS DATE) AS NgayGhiNo,
           c.UserName                AS KhachHang,
           c.NoiDung,
           ISNULL(k.kg, 0)           AS SanLuongKg,
           ISNULL(c.GhiChu, '')      AS GhiChu
    FROM dbo.CONGNO c
    CROSS APPLY (SELECT COALESCE(
        c.SanLuong,
        TRY_CONVERT(float, LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(c.GhiChu, ''), '-', ''), ',', '.'))))
      ) AS tho) t
    CROSS APPLY (SELECT CASE
        WHEN c.style <> 8 THEN NULL
        WHEN c.DR IS NULL OR c.DR <= 0 THEN NULL
        WHEN t.tho IS NULL OR t.tho <= 0 THEN NULL
        WHEN c.DR / t.tho BETWEEN 50000 AND 2000000 THEN t.tho
        WHEN c.DR / t.tho < 50000
         AND c.DR / (t.tho / 1000) BETWEEN 50000 AND 2000000 THEN t.tho / 1000
        ELSE NULL
      END AS kg) k
    WHERE c.DaXoa = 0
      AND c.style = 8
      AND c.NguoiTao = @NhanVien
      AND FORMAT(c.NgayGhiNo, 'yyyy-MM') = @Thang
      AND (@QuocGiaID IS NULL OR c.QuocGiaID = @QuocGiaID)
    ORDER BY c.NgayGhiNo, c.CongNo_ID;
END;
GO
