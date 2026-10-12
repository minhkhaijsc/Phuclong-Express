-- Migration: nhà cung cấp + giá nhập từ NCC + lãi/lỗ trên từng dòng đơn
--
-- Màn ảnh hưởng:
--   • modal "Sửa chi tiết đơn" ở /admin/orders/list — thêm khối NHÀ CUNG CẤP
--     nằm dưới khối Thông tin giá, trên khối Ghi chú
--   • /admin/suppliers — trang danh mục NCC (mới)
--   • /admin/debt-reports/supplier — công nợ phải trả NCC (mới)
--
-- VÌ SAO: yêu cầu bên khách 12/10/2026 — "Phần mua hàng, em muốn xem kết quả
-- lãi/lỗ". Hệ hiện tại ghi đủ phía THU của khách (dongiaweb → giasauoff →
-- tiencong → tongtien) nhưng KHÔNG ghi gì về phía TRẢ cho nhà cung cấp, nên
-- không có cách nào biết một đơn lãi hay lỗ. `SP_BaoCao_LaiLoTheoLo` đang có
-- chỉ tính lãi/lỗ ở mức LÔ HÀNG (tiền lô − phí hải quan − chi phí lô), tức là
-- phần vận chuyển, không phải phần mua hàng.
--
-- ===== 1. BẢNG tbNhaCungCap =====
--
-- Bên khách chọn "danh mục NCC có trang quản lý" chứ không gõ tay. Lý do giữ
-- lại ở đây: trang công nợ phải trả gộp theo NCC. Gõ tay thì "Amazon",
-- "amazon" và "Amazon " thành ba nhà cung cấp, số phải trả chia ba.
--
-- Đặt tên `tbNhaCungCap` theo đúng `tbQuocGia` — cùng loại việc (danh mục nhỏ
-- cho một ô chọn), nên để lập trình viên sau nhìn tiền tố là biết nhóm.
--
-- `DaAn` thay cho xoá, cùng lý do như tbQuocGia: xoá một NCC là mọi đơn cũ trỏ
-- vào nó mất tên trong báo cáo công nợ phải trả.
--
-- Chỉ mục DUY NHẤT trên tên: đây là cái chặn việc gõ trùng ngay từ CSDL, không
-- phụ thuộc vào tầng web có kiểm hay không.
--
-- ===== 2. SÁU CỘT NCC_* TRÊN DON_HANG =====
--
-- Gắn vào DON_HANG chứ không tách bảng riêng vì DON_HANG đã là MỘT DÒNG MỘT
-- LINK — đúng mức mà người mua hàng nhập giá NCC. Tách bảng 1-1 chỉ thêm một
-- phép join vào mọi câu truy vấn đơn.
--
-- Cả sáu đều NULL được, không DEFAULT: với SQL Server, thêm cột nullable không
-- default là đổi siêu dữ liệu, không ghi lại 42.771 dòng. NULL ở đây có nghĩa
-- thật: "chưa ai nhập giá NCC cho dòng này", khác hẳn 0 = "NCC không thu đồng
-- nào". Phân biệt được hai thứ đó mới lọc ra được việc còn tồn.
--
--   NCC_ID           trỏ tbNhaCungCap. Không đặt khoá ngoại — xem ghi chú dưới.
--   NCC_NgoaiTe      số tiền NCC báo, bằng ngoại tệ (bên khách: "là giá tiền
--                    đô, cứ để ngoại tệ, nhân viên tự nhập"). KHÔNG lưu mã
--                    tiền riêng: lấy theo `loaitien` của chính dòng đơn.
--   NCC_Cong         tiền công NCC thu, cùng đơn vị với NCC_NgoaiTe
--   NCC_TyGia        tỷ giá dùng lúc chốt với NCC. Lưu riêng, KHÔNG dùng lại
--                    `tygia` của đơn: tỷ giá bán cho khách và tỷ giá quy đổi
--                    tiền trả NCC là hai con số khác nhau, và đây là thứ phải
--                    giữ nguyên theo thời điểm chốt nợ.
--   NCC_TongPhaiTra  tổng phải trả, VNĐ. Phía web điền sẵn
--                    (NCC_NgoaiTe + NCC_Cong) * NCC_TyGia nhưng cho sửa tay —
--                    hoá đơn NCC hay lệch vài đồng do họ làm tròn, mà con số
--                    đi vào công nợ phải là con số trên hoá đơn.
--   NCC_Tracking     mã vận đơn phía NCC. Dài 100 cho bằng `SoVanDon` sẵn có.
--
-- KHÔNG CÓ CỘT LÃI/LỖ. Lãi/lỗ = tongtienVND − NCC_TongPhaiTra, tính tại chỗ
-- mỗi lần xem. Lưu thành cột (hay cột tính sẵn) thì:
--   • cột tính sẵn (computed column) làm vỡ mọi câu `INSERT INTO DON_HANG`
--     không liệt kê cột — bản ASP cũ vẫn còn chạy trên cùng CSDL này;
--   • cột thường thì lệch ngay lần đầu có người sửa tongtienVND mà không đi
--     qua đúng đường ghi, và sẽ không ai biết nó lệch từ bao giờ.
--
-- KHÔNG ĐẶT KHOÁ NGOẠI NCC_ID → tbNhaCungCap, cố ý: cả lược đồ này không có
-- khoá ngoại nào (CONGNO, tbTracking, DON_HANG đều trỏ khách bằng chuỗi
-- UserName). Thêm đúng một cái ở đây không làm dữ liệu sạch hơn, mà lại là một
-- chỗ bản ASP cũ có thể ném lỗi lạ khi ghi. Thay vào đó join LEFT và coi NCC
-- không tra được là "chưa rõ".
--
-- CHỈ MỤC IX_DON_HANG_NCC_ID có lọc (`WHERE NCC_ID IS NOT NULL`): trang công nợ
-- phải trả chỉ quan tâm dòng ĐÃ có NCC. Hôm nay là 0 dòng nên chỉ mục gần như
-- rỗng, lớn dần theo đúng phần dữ liệu được dùng. SQL Server 2014 Express có hỗ
-- trợ chỉ mục lọc.
--
-- CHẠY LẠI ĐƯỢC: mọi bước đều kiểm tồn tại trước.

SET NOCOUNT ON;

IF OBJECT_ID('dbo.tbNhaCungCap', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tbNhaCungCap (
    NhaCungCapID  int IDENTITY(1,1) NOT NULL,
    TenNhaCungCap nvarchar(200)     NOT NULL,
    GhiChu        nvarchar(500)     NULL,
    DaAn          bit               NOT NULL CONSTRAINT DF_tbNhaCungCap_DaAn DEFAULT (0),
    NgayTao       datetime          NOT NULL CONSTRAINT DF_tbNhaCungCap_NgayTao DEFAULT (GETDATE()),
    NguoiTao      nvarchar(100)     NULL,
    CONSTRAINT PK_tbNhaCungCap PRIMARY KEY CLUSTERED (NhaCungCapID)
  );

  CREATE UNIQUE INDEX UX_tbNhaCungCap_Ten ON dbo.tbNhaCungCap (TenNhaCungCap);
END

GO

IF COL_LENGTH('dbo.DON_HANG', 'NCC_ID') IS NULL
  ALTER TABLE dbo.DON_HANG ADD NCC_ID int NULL;
GO
IF COL_LENGTH('dbo.DON_HANG', 'NCC_NgoaiTe') IS NULL
  ALTER TABLE dbo.DON_HANG ADD NCC_NgoaiTe float NULL;
GO
IF COL_LENGTH('dbo.DON_HANG', 'NCC_Cong') IS NULL
  ALTER TABLE dbo.DON_HANG ADD NCC_Cong float NULL;
GO
IF COL_LENGTH('dbo.DON_HANG', 'NCC_TyGia') IS NULL
  ALTER TABLE dbo.DON_HANG ADD NCC_TyGia float NULL;
GO
IF COL_LENGTH('dbo.DON_HANG', 'NCC_TongPhaiTra') IS NULL
  ALTER TABLE dbo.DON_HANG ADD NCC_TongPhaiTra float NULL;
GO
IF COL_LENGTH('dbo.DON_HANG', 'NCC_Tracking') IS NULL
  ALTER TABLE dbo.DON_HANG ADD NCC_Tracking nvarchar(100) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_DON_HANG_NCC_ID'
                 AND object_id = OBJECT_ID('dbo.DON_HANG'))
  CREATE INDEX IX_DON_HANG_NCC_ID ON dbo.DON_HANG (NCC_ID)
    INCLUDE (NCC_TongPhaiTra, tongtienVND)
    WHERE NCC_ID IS NOT NULL;

GO

-- Kiểm: 6 cột NCC_* trên DON_HANG, bảng tbNhaCungCap, chỉ mục lọc
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM   INFORMATION_SCHEMA.COLUMNS
WHERE  TABLE_NAME = 'DON_HANG' AND COLUMN_NAME LIKE 'NCC[_]%'
ORDER  BY COLUMN_NAME;

SELECT COUNT(*) AS so_nha_cung_cap FROM dbo.tbNhaCungCap;

SELECT name, has_filter FROM sys.indexes
WHERE  object_id = OBJECT_ID('dbo.DON_HANG') AND name = 'IX_DON_HANG_NCC_ID';
