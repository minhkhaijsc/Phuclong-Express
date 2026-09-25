-- Tách "Phát sinh nợ" thành Doanh thu + Phụ thu.
--
-- Kế toán nhập hai khoản riêng, hệ thống tự cộng ra phát sinh nợ. Cột DR vẫn là
-- TỔNG như cũ nên mọi báo cáo, công nợ luỹ kế, bản chi tiết gửi khách không đổi
-- một chữ nào — chỉ thêm hai cột để bên Quản lý công nợ xuất Excel tách được.
--
-- Chạy lại nhiều lần không sao.

IF COL_LENGTH('dbo.CONGNO', 'DoanhThu') IS NULL
    ALTER TABLE dbo.CONGNO ADD DoanhThu float NULL;
GO

IF COL_LENGTH('dbo.CONGNO', 'PhuThu') IS NULL
    ALTER TABLE dbo.CONGNO ADD PhuThu float NULL;
GO

-- Dòng cũ để NULL, không suy đoán ngược: không ai biết trong khoản nợ cũ bao
-- nhiêu là doanh thu, bao nhiêu là phụ thu. Excel sẽ để trống hai ô đó.

ALTER PROCEDURE [dbo].[CongNo_Insert]
    @NoiDung nvarchar(100)
    ,@NgayGhiNo date
    ,@DR float
    ,@CR float
    ,@UserName nvarchar(100)
    ,@GhiChu nvarchar(500)
    ,@Status int
    ,@LoHangID int
    ,@NguoiTao nvarchar(250)
    ,@LoaiPhatSinh int
    ,@SanLuong float = NULL
    ,@QuocGiaID int = NULL          -- Tuyến, chọn độc lập với đơn hàng
    ,@DoanhThu float = NULL         -- MỚI: phần doanh thu trong @DR
    ,@PhuThu float = NULL           -- MỚI: phần phụ thu trong @DR
AS
BEGIN
    DECLARE @DuocCapNhat int
    EXEC @DuocCapNhat = [SP_KiemTra_DuocCapNhatCongNo] @NgayGhiNo, @UserName

    IF (@DuocCapNhat = 0)
    BEGIN
        INSERT INTO [dbo].[CONGNO]
              ([NoiDung],[NgayGhiNo],[DR],[CR],[UserName]
               ,[GhiChu],[Status],[style], LoHangID, NguoiTao, SanLuong, QuocGiaID
               ,DoanhThu, PhuThu)
            VALUES
            (@NoiDung,@NgayGhiNo,@DR,@CR,@UserName
            ,@GhiChu,@Status,@LoaiPhatSinh,@LoHangID, @NguoiTao, @SanLuong, @QuocGiaID
            ,@DoanhThu, @PhuThu
            )
    END
END;
GO

ALTER PROCEDURE [dbo].[SP_CapNhat_CongNoSimple]
	@CongNo_ID int
	,@NoiDung nvarchar(100)
	--,@NgayGhiNo datetime
	,@DR float
	,@CR float
	,@GhiChu nvarchar(500)
	,@NguoiTao nvarchar(250)
	,@DoanhThu float = NULL         -- MỚI: phần doanh thu trong @DR
	,@PhuThu float = NULL           -- MỚI: phần phụ thu trong @DR
AS

BEGIN

	DECLARE @usernameOld nvarchar(50)
	DECLARE	@NgayGhiNoOld datetime
	SELECT @usernameOld = username, @NgayGhiNoOld = NgayGhiNo FROM CONGNO WHERE CongNo_ID = @CongNo_ID

	DECLARE	@DuocCapNhat int
	DECLARE	@DuocCapNhatOld int
	EXEC @DuocCapNhat = [SP_KiemTra_DuocCapNhatCongNo] @NgayGhiNoOld, @usernameOld
	EXEC @DuocCapNhatOld = [SP_KiemTra_DuocCapNhatCongNo] @NgayGhiNoOld, @usernameOld

	IF ((@DuocCapNhat = 0) AND (@DuocCapNhatOld = 0))
	BEGIN
		UPDATE CONGNO
		SET NoiDung = @NoiDung
		--,[NgayGhiNo] = @NgayGhiNo
		,[DR] = @DR
		,[CR] = @CR
		,[GhiChu] = @GhiChu
		, NgayCapNhatCuoi = GETDATE()
		, NguoiCapNhatCuoi = @NguoiTao
		, DoanhThu = @DoanhThu
		, PhuThu = @PhuThu
		WHERE CongNo_ID = @CongNo_ID
	END
END;
GO

ALTER PROCEDURE [dbo].[SP_CapNhat_CongNo]
    @CongNo_ID int
    ,@NoiDung nvarchar(100)
    ,@DR float
    ,@CR float
    ,@UserName nvarchar(100)
    ,@GhiChu nvarchar(500)
    ,@Status int
    ,@LoHangID int
    ,@NguoiTao nvarchar(250)
    ,@udNoiDung bit
    ,@udDR bit
    ,@udCR bit
    ,@udUserName bit
    ,@udGhiChu bit
    ,@udStatus bit
    ,@udLoHangID bit
    ,@SanLuong float = NULL
    ,@udSanLuong bit = 0
    ,@QuocGiaID int = NULL
    ,@udQuocGiaID bit = 0
    ,@DoanhThu float = NULL          -- MỚI: phần doanh thu trong @DR
    ,@PhuThu float = NULL            -- MỚI: phần phụ thu trong @DR
    ,@udDoanhThu bit = 0
    ,@udPhuThu bit = 0
AS
BEGIN
    DECLARE @usernameOld nvarchar(50)
    DECLARE @NgayGhiNoOld datetime
    SELECT @usernameOld = username, @NgayGhiNoOld = NgayGhiNo FROM CONGNO WHERE CongNo_ID = @CongNo_ID

    DECLARE @DuocCapNhat int
    DECLARE @DuocCapNhatOld int
    EXEC @DuocCapNhat = [SP_KiemTra_DuocCapNhatCongNo] @NgayGhiNoOld, @username
    EXEC @DuocCapNhatOld = [SP_KiemTra_DuocCapNhatCongNo] @NgayGhiNoOld, @usernameOld

    IF ((@DuocCapNhat = 0) AND (@DuocCapNhatOld = 0))
    BEGIN
        UPDATE CONGNO
        SET
        NoiDung = (CASE WHEN @udNoiDung = 1 THEN @NoiDung ELSE NoiDung END)
        ,[DR] = (CASE WHEN @udDR = 1 THEN @DR ELSE [DR] END)
        ,[CR] = (CASE WHEN @udCR = 1 THEN @CR ELSE [CR] END)
        ,[UserName] = (CASE WHEN @udUserName = 1 THEN @UserName ELSE [UserName] END)
        ,[GhiChu] = (CASE WHEN @udGhiChu = 1 THEN @GhiChu ELSE [GhiChu] END)
        ,[Status] = (CASE WHEN @udStatus = 1 THEN @Status ELSE [Status] END)
        ,[LoHangID] = (CASE WHEN @udLoHangID = 1 THEN @LoHangID ELSE [LoHangID] END)
        ,[SanLuong] = (CASE WHEN @udSanLuong = 1 THEN @SanLuong ELSE [SanLuong] END)
        ,[QuocGiaID] = (CASE WHEN @udQuocGiaID = 1 THEN @QuocGiaID ELSE [QuocGiaID] END)
        ,[DoanhThu] = (CASE WHEN @udDoanhThu = 1 THEN @DoanhThu ELSE [DoanhThu] END)   -- MỚI
        ,[PhuThu] = (CASE WHEN @udPhuThu = 1 THEN @PhuThu ELSE [PhuThu] END)           -- MỚI
        , NgayCapNhatCuoi = GETDATE()
        , NguoiCapNhatCuoi = @NguoiTao
        WHERE CongNo_ID = @CongNo_ID
    END
END;
GO
