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
	SELECT CN.*, LH.TenLoHang, DH.ordernumber AS OrderNumber, QG_Own.TenQuocGia AS Tuyen
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
	ORDER BY CN.CongNo_ID DESC;

	DROP TABLE #Loc;
END