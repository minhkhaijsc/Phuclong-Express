-- Migration: Tra cuu NHIEU MA cung luc o o Filter — man /admin/orders/list
-- Yeu cau: HD can dan mot danh sach ma don tu Excel vao o Filter va xem het mot luot.
--          Truoc day o do chi nhan MOT chuoi, tim bang LIKE '%...%'.
-- Trang: admin/orders/list (MUA HANG GIUP > Mua hang)
--
-- Cach lam: them tham so @DanhSachMa O CUOI, co gia tri mac dinh '' — moi cho goi
-- cu (ke ca ban ASP) khong truyen thi chay y het truoc day.
--
-- An toan: ma duoc tach vao bang tam #MaCanTim TRUOC, cau lenh dong chi join vao
-- bang do. Du lieu nguoi dung khong di vao chuoi @Sql, nen duong moi nay khong co
-- cho cho SQL injection — khac voi cac dieu kien san co trong SP deu noi chuoi tho.
--
-- SQL Server 2014 (v12) Express: KHONG co STRING_SPLIT (can 2016+), tach bang XML.
--
-- Ban goc truoc khi sua: xem ghi chu cuoi file.
-- Run once on the target SQL Server database.

IF OBJECT_ID('dbo.SP_Lay_DonHang', 'P') IS NOT NULL
    DROP PROCEDURE dbo.SP_Lay_DonHang;
GO

CREATE PROCEDURE [dbo].[SP_Lay_DonHang]
	@WebsiteName nvarchar(100)
	,@username nvarchar(100)
	,@trangthaiOrder nvarchar(500)
	,@NoiDungTim nvarchar(250)
	,@TimTheo int
	,@MaDatHang nvarchar(500)
	,@TenDotHang nvarchar(50)
	,@HangKhoan int
	,@QuocGiaID int
	,@PageSize int
	,@PageNum int
	,@DaXoa bit
	,@TuNgay nvarchar(15)
	,@DenNgay nvarchar(15)
	-- MỚI 05/10/2026: danh sách mã đơn, phân cách bằng dấu phẩy.
	-- Để CUỐI và có giá trị mặc định nên mọi chỗ gọi cũ (kể cả bản ASP)
	-- không truyền thì chạy y hệt trước đây.
	,@DanhSachMa nvarchar(max) = ''
AS
BEGIN
	CREATE TABLE #MyPage(ID int);
	CREATE TABLE #MaCanTim(Ma nvarchar(100) COLLATE DATABASE_DEFAULT);
    DECLARE @selectitem int;
    DECLARE @start int;
    DECLARE @run int;
    SET @start=(@PageNum - 1)*@PageSize+1;
    SET @run=0;
   
	DECLARE @Sql nvarchar(MAX);
    SET @Sql = 'DECLARE RS SCROLL CURSOR FOR ';
		
	SET @Sql = @Sql + ' SELECT ID FROM DON_HANG WHERE DaXoa = ' + CAST(@DaXoa AS CHAR(1))
	
	IF(@WebsiteName <> '')
	BEGIN
		SET @Sql = @Sql + ' AND WebsiteName = ''' + @WebsiteName + ''''
	END

	IF(@UserName <> '')
	BEGIN
		SET @Sql = @Sql + ' AND username = ''' + @username + ''''
	END
	
	IF(@trangthaiOrder <> '')
	BEGIN
		SET @Sql = @Sql + ' AND trangthaiOrder in (' + @trangthaiOrder + ')'
	END
	
	IF(@NoiDungTim <> '')
	BEGIN
		--SET @NoiDungTim = N'"*' + @NoiDungTim + N'*"';
		--SET @Sql = @Sql + ' AND (CONTAINS(ordernumber, ''' + @NoiDungTim + ''') OR CONTAINS(tracking_number, ''' + @NoiDungTim + ''') OR CONTAINS(linkweb, ''' + @NoiDungTim + ''') OR  CONTAINS(ghichu, ''' + @NoiDungTim + '''))'
		IF(@TimTheo = -1)
		BEGIN
			SET @Sql = @Sql + ' AND ((ID like ''%' + @NoiDungTim + '%'') OR (ordernumber like ''%' + @NoiDungTim + '%'') OR (TenDotHang like ''%' + @NoiDungTim + '%'') OR (linkweb like ''%' + @NoiDungTim + '%'') OR (WebsiteName like ''%' + @NoiDungTim + '%'') OR  (ghichu like ''%' + @NoiDungTim + '%''))'
		END
		ELSE IF(@TimTheo = 0)
		BEGIN
			SET @Sql = @Sql + ' AND (ordernumber like ''%' + @NoiDungTim + '%'')'
		END
	END
	
	IF(@MaDatHang <> '')
	BEGIN
		SET @Sql = @Sql + ' AND ID IN (' + @MaDatHang + ')'
	END

	-- Tra cứu NHIỀU MÃ cùng lúc (ô Filter của màn Mua hàng).
	--
	-- Khác mọi điều kiện ở trên: dữ liệu người dùng KHÔNG đi vào chuỗi @Sql.
	-- Mã được tách vào bảng tạm trước, câu lệnh động chỉ join vào bảng đó, nên
	-- đường này không có chỗ cho SQL injection.
	--
	-- SQL Server của Phúc Long là bản 2014, chưa có STRING_SPLIT (cần 2016+),
	-- nên tách bằng XML. Phải thoát &, < , > trước khi ép sang XML, không thì
	-- CAST ném lỗi; làm việc thoát TRƯỚC rồi mới cắt theo dấu phẩy.
	IF(@DanhSachMa <> '')
	BEGIN
		DECLARE @xmlMa XML;
		SET @xmlMa = CAST('<m>' +
			REPLACE(
				REPLACE(REPLACE(REPLACE(@DanhSachMa, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
				',', '</m><m>')
			+ '</m>' AS XML);

		INSERT INTO #MaCanTim(Ma)
		SELECT DISTINCT LTRIM(RTRIM(n.x.value('.', 'nvarchar(100)')))
		FROM @xmlMa.nodes('/m') AS n(x)
		WHERE LTRIM(RTRIM(n.x.value('.', 'nvarchar(100)'))) <> '';

		-- Dán cả danh sách rỗng (toàn dấu phẩy) thì bỏ qua, đừng lọc thành 0 đơn.
		IF EXISTS(SELECT 1 FROM #MaCanTim)
		BEGIN
			SET @Sql = @Sql + ' AND ordernumber IN (SELECT Ma FROM #MaCanTim)'
		END
	END

	IF(@TenDotHang <> '')
	BEGIN
		SET @Sql = @Sql + ' AND TenDotHang = ''' + @TenDotHang + ''''
	END

	IF(@HangKhoan <> -1)
	BEGIN
		SET @Sql = @Sql + ' AND HangKhoan = ' + CAST(@HangKhoan as nvarchar(10))
	END

	IF(@QuocGiaID <> -1)
	BEGIN
		SET @Sql = @Sql + ' AND QuocGiaID = ' + CAST(@QuocGiaID as nvarchar(10))
	END

	IF(@TuNgay <> '')
	BEGIN
		SET @Sql = @Sql + ' AND ngaysaveLink >= ''' + @TuNgay + ''''
	END

	IF(@DenNgay <> '')
	BEGIN
		SET @Sql = @Sql + ' AND ngaysaveLink <= ''' + @DenNgay+ ''''
	END

	SET @Sql = @Sql + ' ORDER BY ID desc, ngaymuahang desc'
	
	--select @Sql
	
	EXEC sp_executesql @Sql;
	
	OPEN RS
	--return total record
	SELECT @@CURSOR_ROWS AS TOTALROW;
	---------
	FETCH ABSOLUTE @start FROM RS INTO @selectitem
	WHILE(@@FETCH_STATUS <> -1 and @run < @PageSize)
	BEGIN
		INSERT INTO #MyPage(ID) VALUES(@selectitem)
		SET @run=@run+1;
		FETCH NEXT FROM RS INTO @selectitem
	END
	CLOSE RS
	DEALLOCATE RS
	
	SELECT DH.*, HM.DaQuaHanMuc, HM.LaKhachVip, LH.TenLoaiHang, QG.TenQuocGia, U.LinkTaiKhoanMang, U.VungMien
	FROM Don_Hang DH
	INNER JOIN #MyPage ON DH.ID = #MyPage.ID
	LEFT JOIN HanMucKhachHang HM ON DH.username = HM.UserName
	LEFT JOIN LoaiHang LH ON DH.LoaiHangID = LH.LoaiHangID 
	LEFT JOIN tbQuocGia QG ON DH.QuocGiaID = QG.QuocGiaID
	LEFT JOIN AspNetUsers U ON DH.username = U.UserName
	ORDER BY ID desc, ngaymuahang desc
END

GO
