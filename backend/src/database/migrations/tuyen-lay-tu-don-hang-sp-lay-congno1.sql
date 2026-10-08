-- Migration: Tuyến trong Quản lý công nợ lấy thêm từ ĐƠN HÀNG
--
-- Trang: admin/debt-management (xuất Excel + bảng)
--
-- Vì sao: cột Tuyến xuất ra luôn trống. SP đang lấy tuyến từ CONGNO.QuocGiaID,
-- mà cột đó KHÔNG CÓ DÒNG NÀO được điền trong số 39.552 dòng công nợ gắn với
-- đơn hàng (đo 08/10/2026) — trong khi Don_Hang.QuocGiaID thì đủ cả 39.552.
--
-- Sửa: COALESCE(tuyến của dòng công nợ, tuyến của đơn hàng). Giữ thứ tự đó để
-- dòng nào tự khai tuyến riêng thì vẫn ưu tiên giá trị của chính nó.
--
-- Cột OrderNumber KHÔNG đổi: đo lại thấy nó vốn chạy đúng (39.549/39.552 dòng
-- có mã). Chỗ người dùng thấy trống là các dòng công nợ thủ công, không gắn đơn.
--
-- BẢN GỐC trước khi sửa: _backup/ple-sp/SP_Lay_CongNo1-truoc-20261008.sql
-- Chỉ đổi SELECT cuối + thêm 1 LEFT JOIN; tham số và phân trang giữ nguyên.
-- Run once on the target SQL Server database.

IF OBJECT_ID('dbo.SP_Lay_CongNo1', 'P') IS NOT NULL
    DROP PROCEDURE dbo.SP_Lay_CongNo1;
GO
CREATE PROCEDURE [dbo].[SP_Lay_CongNo1]
	@username nvarchar(100)
	,@status int
	,@LoaiPhatSinh nvarchar(50)
	,@NoiDungTim nvarchar(250)
	,@PageSize int
	,@PageNum int
	,@TuNgay nvarchar(15)
	,@DenNgay nvarchar(15)
	,@QuocGiaID int = NULL
	,@LoHang nvarchar(30) = NULL
	,@OrderNumber nvarchar(100) = NULL
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @u  nvarchar(100)  = ISNULL(@username, '');
	DECLARE @lp nvarchar(50)   = ISNULL(@LoaiPhatSinh, '');
	DECLARE @nd nvarchar(250)  = ISNULL(@NoiDungTim, '');
	DECLARE @tn nvarchar(15)   = ISNULL(@TuNgay, '');
	DECLARE @dn nvarchar(15)   = ISNULL(@DenNgay, '');

	DECLARE @tim  nvarchar(260) = '%' + @nd + '%';
	DECLARE @loai nvarchar(60)  = ',' + @lp + ',';

	-- Lô hàng nằm trong ghi chú dạng "Lô hàng: yyyy-MM-dd" (bảng tbLoHang rỗng,
	-- CONGNO.LoHangID không dòng nào có giá trị), nên lọc bằng chuỗi đó.
	DECLARE @lh nvarchar(60)   = N'%Lô hàng: ' + ISNULL(@LoHang, '') + N'%';
	DECLARE @onum nvarchar(110) = '%' + ISNULL(@OrderNumber, '') + '%';

	CREATE TABLE #Loc(CongNo_ID int PRIMARY KEY);

	INSERT INTO #Loc(CongNo_ID)
	SELECT CongNo_ID
	FROM CONGNO
	WHERE DaXoa = 0
	  AND (@u  = ''   OR username = @u)
	  AND (@status = -1 OR status = @status)
	  -- ',1,2,3,' LIKE '%,2,%'  → khớp đúng phần tử, không dính "12" khi tìm "2"
	  AND (@lp = ''   OR @loai LIKE '%,' + CAST(style AS nvarchar(10)) + ',%')
	  AND (@nd = ''   OR DonHang_ID LIKE @tim OR NoiDung LIKE @tim OR GhiChu LIKE @tim)
	  AND (@tn = ''   OR NgayGhiNo >= @tn)
	  AND (@dn = ''   OR NgayGhiNo <= @dn)
	  AND (@QuocGiaID IS NULL OR QuocGiaID = @QuocGiaID)
	  AND (@LoHang IS NULL OR @LoHang = '' OR GhiChu LIKE @lh)
	  -- Order number nam o Don_Hang, noi qua DonHang_ID. Dung EXISTS thay vi JOIN
	  -- de khong nhan doi dong khi mot cong no tro toi nhieu don.
	  AND (@OrderNumber IS NULL OR @OrderNumber = '' OR EXISTS (
	        SELECT 1 FROM Don_Hang DH2
	        WHERE DH2.ID = CONGNO.DonHang_ID AND DH2.ordernumber LIKE @onum))
	OPTION (RECOMPILE);

	-- Tập kết quả 1: tổng số dòng thoả bộ lọc (bản gốc trả @@CURSOR_ROWS)
	SELECT COUNT(*) AS TOTALROW FROM #Loc;

	-- Tập kết quả 2: đúng một trang dữ liệu
	SELECT CN.*, LH.TenLoHang, DH.ordernumber AS OrderNumber,
	       COALESCE(QG_Own.TenQuocGia, QG_DH.TenQuocGia) AS Tuyen
	FROM CONGNO CN
	INNER JOIN (
		SELECT CongNo_ID
		FROM #Loc
		ORDER BY CongNo_ID DESC
		OFFSET (@PageNum - 1) * @PageSize ROWS
		FETCH NEXT @PageSize ROWS ONLY
	) P ON CN.CongNo_ID = P.CongNo_ID
	LEFT JOIN tbLoHang  LH     ON CN.LoHangID  = LH.LoHangID
	LEFT JOIN Don_Hang  DH     ON CN.DonHang_ID = DH.ID
	LEFT JOIN tbQuocGia QG_Own ON CN.QuocGiaID = QG_Own.QuocGiaID
	LEFT JOIN tbQuocGia QG_DH  ON DH.QuocGiaID = QG_DH.QuocGiaID
	ORDER BY CN.CongNo_ID DESC;

	DROP TABLE #Loc;
END
GO
