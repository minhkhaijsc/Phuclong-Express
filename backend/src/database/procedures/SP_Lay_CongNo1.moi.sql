/*
  SP_Lay_CongNo1 — bản viết lại.

  Hai thay đổi so với bản gốc (giữ ở SP_Lay_CongNo1.goc.sql):

  1. THÊM bộ lọc theo tuyến: tham số @QuocGiaID, có giá trị mặc định NULL nên
     mọi chỗ gọi cũ không phải sửa gì.

  2. BỎ SQL động. Bản gốc dựng câu lệnh bằng cách nối chuỗi thẳng từ tham số:
         SET @Sql = @Sql + ' AND username = ''' + @username + ''''
     Ai gửi được @username chứa dấu nháy đơn là chèn được lệnh SQL tuỳ ý. Nay
     mọi điều kiện nằm thẳng trong câu lệnh với tham số thật, không còn nối chuỗi.

  Giữ NGUYÊN hợp đồng trả về, vì tầng gọi phụ thuộc vào nó:
     - tập kết quả 1: đúng một dòng, cột TOTALROW
     - tập kết quả 2: các dòng dữ liệu
  (service đọc data[0].TOTALROW rồi data.slice(1)).

  Ghi chú kỹ thuật:
   - Máy chủ là SQL Server 2014 nên KHÔNG có STRING_SPLIT. Danh sách loại phát
     sinh ("1,2,3") lọc bằng mẹo LIKE trên chuỗi đã bọc dấu phẩy — vẫn là tham
     số, không nối chuỗi.
   - OFFSET/FETCH thay cho con trỏ SCROLL: cùng kết quả, ít tốn tài nguyên hơn,
     và không phải mở/đóng con trỏ toàn cục.
   - OPTION (RECOMPILE): các điều kiện dạng "(@x = '' OR cot = @x)" rất dễ dính
     kế hoạch thực thi sai do tham số của lần chạy đầu. RECOMPILE buộc dựng lại
     kế hoạch theo đúng bộ lọc mỗi lần gọi.
*/
ALTER PROCEDURE [dbo].[SP_Lay_CongNo1]
	@username nvarchar(100)
	,@status int
	,@LoaiPhatSinh nvarchar(50)
	,@NoiDungTim nvarchar(250)
	,@PageSize int
	,@PageNum int
	,@TuNgay nvarchar(15)
	,@DenNgay nvarchar(15)
	,@QuocGiaID int = NULL
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
