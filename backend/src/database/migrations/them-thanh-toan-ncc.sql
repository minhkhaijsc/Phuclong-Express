-- Migration: ghi các lần THANH TOÁN cho nhà cung cấp
--
-- Màn ảnh hưởng: /admin/debt-reports/supplier (công nợ phải trả NCC)
--
-- VÌ SAO: yêu cầu bên khách 23/10/2026 —
--   "sau khi bên em thanh toán cho NCC sẽ có phần tick đã thanh toán, và nhập
--    số tiền đã thanh toán cho từng đơn hàng. Và thêm 1 lựa chọn nữa là k cần
--    tick, k cần nhập số tiền đã thanh toán cho đơn hàng bất kỳ, mà nhập 1 cục
--    tiền đã thanh toán"
-- và khi hỏi lại "trả gộp thì xử lý thế nào": "tự trừ vào đơn cũ nhất" —
-- "ko tick đơn hàng, nhưng nhảy vào NCC đang thanh toán".
--
-- Trước bản này trang công nợ phải trả chỉ có SỐ PHẢI TRẢ (đọc từ
-- DON_HANG.NCC_TongPhaiTra) mà không có sổ trả tiền nào, nên "đã trả" phải
-- tạm hiểu là "đơn đã Completed" — sai nghĩa: đơn hoàn tất với khách không có
-- nghĩa là đã trả tiền nhà cung cấp.
--
-- ===== HAI BẢNG =====
--
-- tbThanhToanNcc      MỘT PHIẾU = một lần chuyển tiền cho một NCC.
-- tbThanhToanNccDon   phiếu đó trừ vào những đơn nào, mỗi đơn bao nhiêu.
--
-- Cả hai cách trả đều ghi xuống CÙNG hai bảng này:
--   • theo đơn  — người dùng tick đơn và gõ số tiền từng đơn → mỗi đơn một dòng
--   • trả gộp   — người dùng chọn NCC và gõ một cục tiền → máy chủ tự khấu vào
--                 đơn còn nợ CŨ NHẤT trước của NCC đó, rồi ghi ra các dòng y như
--                 cách trên.
-- Phân bổ được GHI XUỐNG lúc lập phiếu chứ không tính lại mỗi lần xem: sau này
-- có người sửa giá NCC của một đơn cũ thì phiếu đã lập không tự xê dịch sang
-- đơn khác — kế toán đối chiếu sổ cũ vẫn ra đúng con số hôm đó.
--
-- Trả gộp lớn hơn số còn nợ thì phần thừa nằm lại trên phiếu (`SoTien` lớn
-- hơn tổng các dòng phân bổ) — trang hiện thành "trả dư", không vứt đi.
--
-- `DaXoa` thay cho xoá: phiếu nhập nhầm thì huỷ, phân bổ của nó thôi được
-- tính, nhưng vẫn truy được ai lập, ai huỷ.
--
-- Tiền để `decimal(18,2)` chứ không `float` như các cột NCC_* cũ: đây là sổ
-- tiền thật, cộng trừ float thì lệch lẻ (đã dính ở sổ công nợ khách — 51 dòng
-- còn sót 0,0000001đ).
--
-- KHÔNG đặt khoá ngoại sang DON_HANG / tbNhaCungCap, cùng lý do với cột NCC_ID:
-- các SP cũ xoá-ghi lại DON_HANG theo lối của chúng, một khoá ngoại mới có thể
-- làm vỡ những đường đó mà không ai biết cho tới lúc chạy.
--
-- Chỉ THÊM bảng mới, không đụng bảng sẵn có — mã đang chạy không đọc tới nên
-- chạy trước khi đẩy mã là vô hại, và không cần lùi.

SET NOCOUNT ON;

IF OBJECT_ID('dbo.tbThanhToanNcc', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbThanhToanNcc (
    PhieuID   int IDENTITY(1,1) NOT NULL,
    NCC_ID    int               NOT NULL,
    NgayTra   date              NOT NULL,
    SoTien    decimal(18,2)     NOT NULL,
    -- 'theo-don' | 'gop'
    Loai      varchar(10)       NOT NULL,
    GhiChu    nvarchar(500)     NULL,
    NguoiTao  nvarchar(100)     NULL,
    NgayTao   datetime          NOT NULL CONSTRAINT DF_tbThanhToanNcc_NgayTao DEFAULT (GETDATE()),
    DaXoa     bit               NOT NULL CONSTRAINT DF_tbThanhToanNcc_DaXoa DEFAULT (0),
    NguoiXoa  nvarchar(100)     NULL,
    NgayXoa   datetime          NULL,
    CONSTRAINT PK_tbThanhToanNcc PRIMARY KEY CLUSTERED (PhieuID),
    CONSTRAINT CK_tbThanhToanNcc_SoTien CHECK (SoTien > 0),
    CONSTRAINT CK_tbThanhToanNcc_Loai CHECK (Loai IN ('theo-don', 'gop'))
  );

  CREATE INDEX IX_tbThanhToanNcc_NCC ON dbo.tbThanhToanNcc (NCC_ID, NgayTra) WHERE DaXoa = 0;
END

GO

IF OBJECT_ID('dbo.tbThanhToanNccDon', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbThanhToanNccDon (
    ID        int IDENTITY(1,1) NOT NULL,
    PhieuID   int               NOT NULL,
    -- DON_HANG.ID
    DonHangID int               NOT NULL,
    SoTien    decimal(18,2)     NOT NULL,
    CONSTRAINT PK_tbThanhToanNccDon PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT FK_tbThanhToanNccDon_Phieu FOREIGN KEY (PhieuID) REFERENCES dbo.tbThanhToanNcc (PhieuID),
    CONSTRAINT CK_tbThanhToanNccDon_SoTien CHECK (SoTien > 0)
  );

  CREATE INDEX IX_tbThanhToanNccDon_Don ON dbo.tbThanhToanNccDon (DonHangID) INCLUDE (PhieuID, SoTien);
  CREATE INDEX IX_tbThanhToanNccDon_Phieu ON dbo.tbThanhToanNccDon (PhieuID);
END

GO

SELECT name, create_date FROM sys.tables
WHERE  name IN ('tbThanhToanNcc', 'tbThanhToanNccDon');
