-- Migration: thêm tuyến "Việt-Hàn" và "Việt-Đài" vào danh mục tuyến
--
-- Màn ảnh hưởng: ô chọn tuyến khi lên đơn (/admin/orders/new, modal sửa chi
-- tiết đơn) và ô lọc tuyến ở /admin/orders/list, /admin/debt-management.
--
-- VÌ SAO KHÔNG DÙNG LẠI "Hàn Quốc" / "Đài Loan" đã có:
-- tbQuocGia đã có QuocGiaID 8 = Hàn Quốc và 13 = Đài Loan, cả hai đang hiện.
-- Nhưng toàn bộ hệ hiện tại là chiều NHẬP — hàng từ nước ngoài về Việt Nam —
-- nên hai dòng đó nhân viên đang đọc là "hàng nhập từ Hàn / từ Đài".
-- Hai tuyến mới là chiều XUẤT: hàng đi từ Việt Nam sang. Bên khách yêu cầu ghi
-- đúng tên "Việt-Hàn", "Việt-Đài" để nhân viên nhìn tên là biết ngay chiều nào,
-- không phải suy từ ngữ cảnh. Đó là lý do thêm dòng mới chứ không đổi tên dòng
-- cũ: đổi tên thì 42.771 đơn và 136 nghìn dòng công nợ cũ bị đọc sai chiều.
--
-- PhiShipVeVN = 400000 cho giống 13 dòng còn lại. Cột này KHÔNG vào công thức
-- nào: đã rà sys.sql_modules, không SP nào đọc tbQuocGia.PhiShipVeVN, và phía
-- web `getCountries` chỉ lấy QuocGiaID với TenQuocGia. Để lệch số thì sau này
-- có người nhìn vào lại tưởng hai tuyến này tính phí khác.
--
-- DaAn = 0 (hiện trong ô nhập liệu). Dừng tuyến sau này thì đổi bit, đừng xoá —
-- xoá là mọi đơn cũ trỏ vào nó mất tên tuyến trong báo cáo.
--
-- CHẠY LẠI ĐƯỢC: lọc theo tên trước khi chèn.
--
-- CHƯA LÀM, CỐ Ý: `TUYEN_CROSS_APPLY` trong backend/src/dashboard/san-luong-kg.ts
-- đoán tuyến từ chữ trong CONGNO.NoiDung khi cột QuocGiaID để trống, và nó đang
-- quy "% hàn %" về 8, "% tw %" về 13. Dòng cân của tuyến xuất nếu bỏ trống cột
-- tuyến và trong ghi chú có chữ "hàn" thì sẽ bị xếp vào tuyến nhập. Không sửa ở
-- đây vì chưa có dòng nào của tuyến xuất để biết CSKH sẽ gõ thế nào; chờ có dữ
-- liệu thật rồi thêm nhánh cho đúng chữ họ dùng.

SET NOCOUNT ON;

INSERT INTO dbo.tbQuocGia (TenQuocGia, PhiShipVeVN, DaAn)
SELECT N'Việt-Hàn', 400000, 0
WHERE NOT EXISTS (SELECT 1 FROM dbo.tbQuocGia WHERE TenQuocGia = N'Việt-Hàn');

INSERT INTO dbo.tbQuocGia (TenQuocGia, PhiShipVeVN, DaAn)
SELECT N'Việt-Đài', 400000, 0
WHERE NOT EXISTS (SELECT 1 FROM dbo.tbQuocGia WHERE TenQuocGia = N'Việt-Đài');

GO

-- Kiểm: phải thấy đủ hai dòng mới, DaAn = 0
SELECT QuocGiaID, TenQuocGia, PhiShipVeVN, ISNULL(DaAn, 0) AS DaAn
FROM   dbo.tbQuocGia
WHERE  TenQuocGia IN (N'Việt-Hàn', N'Việt-Đài');
