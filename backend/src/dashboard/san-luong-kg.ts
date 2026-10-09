/**
 * SẢN LƯỢNG (kg) của một dòng CONGNO — một chỗ tính duy nhất cho cả hệ.
 *
 * "Sản lượng" trong nghiệp vụ Phúc Long là SỐ KG, không phải số kiện.
 *
 * VÌ SAO KHÔNG ĐỌC THẲNG `CONGNO.SanLuong`:
 *
 * Cột `SanLuong` chỉ mới được thêm giữa năm 2026 (xem
 * `migrations/add-sanluong-to-congno.sql`). Trước đó CSKH gõ số kg vào ô GHI
 * CHÚ — chính ghi chú trong tệp migration ấy nói vậy: "nhập sản lượng (cân kg)
 * ... vào cột số riêng THAY VÌ ô Ghi chú". Dữ liệu cũ vẫn nằm nguyên ở GhiChu,
 * dạng chuỗi kiểu `"5.22 - "`, `"0.618 -"`.
 *
 * Hậu quả của việc chỉ đọc cột mới (đo 09/10/2026, 12 tháng gần nhất):
 *
 *     Tháng     SUM(SanLuong)      Thật sự
 *     2025-10          0 kg      7.419 kg
 *     2025-11          0 kg      9.190 kg
 *     ...                 (bảy tháng liền báo 0)
 *     2026-06     57.016 kg     10.342 kg      <- phồng 5,5 lần
 *     2026-07     19.162 kg     19.060 kg
 *
 * BA LUẬT, mỗi luật ứng với một kiểu dữ liệu hỏng đã đếm được trên 32.339 dòng
 * "Cân Kg" (style = 8) của 18 tháng:
 *
 *  1. CHỈ style = 8. Có 1.166 dòng thanh toán (style = 2) mang GhiChu là một
 *     con số — số tài khoản ngân hàng, không phải cân nặng. Không chặn thì
 *     những con số đó cộng thẳng vào sản lượng.
 *
 *  2. PHẢI CÓ DR > 0. 82 dòng style = 8 có DR = 0: đó là các dòng "ck công nợ"
 *     bị xếp nhầm loại, GhiChu chứa số tài khoản (19037018203016). Cũng là
 *     cách duy nhất kiểm chứng được con số: DR = kg × đơn giá.
 *
 *  3. ĐƠN GIÁ PHẢI HỢP LÝ. Đo trên 7.779 dòng có cột `SanLuong` đáng tin:
 *     7.760 dòng rơi vào khoảng 50.000–2.000.000đ/kg (giá thật là 208.000–
 *     278.000đ tuỳ tuyến và khách). Khoảng này cố ý rộng gấp nhiều lần giá
 *     thật — mục đích là bắt con số SAI HẲN, không phải xét duyệt giá.
 *
 *     • Đơn giá ra quá RẺ (< 50.000đ/kg) mà chia kg cho 1.000 thì về đúng
 *       khoảng → đó là MẤT DẤU THẬP PHÂN: 19354 vốn là 19,354 kg. Có 11 dòng
 *       như vậy, và chúng nằm ngay trong cột `SanLuong` "đáng tin" — riêng
 *       chúng làm tháng 6/2026 phồng từ 10 tấn lên 57 tấn.
 *     • Sai kiểu khác thì BỎ, không đoán. 33 dòng. Thà thiếu 0,1% còn hơn
 *       cộng một con số bịa vào báo cáo cho khách.
 *
 * KẾT QUẢ: đọc được 29.216/32.339 dòng = 90,3%, so với 24,3% nếu chỉ dùng cột
 * `SanLuong`. Phần không đọc được là 3.008 dòng không ghi gì cả — không có
 * cách nào biết, và không được phép đoán.
 *
 * DÙNG Ở ĐÂU: màn /tong-quan của khách và dashboard admin. Ba stored procedure
 * `SP_Dashboard_SanLuong*` dùng ĐÚNG biểu thức này, chép sang bên đó ở
 * `migrations/sua-san-luong-doc-ca-ghi-chu.sql`. Sửa ở đây thì phải sửa cả bên
 * ấy, nếu không hai màn sẽ ra hai con số khác nhau.
 */

/** Loại phát sinh "Cân Kg" — loại duy nhất mang sản lượng. */
export const STYLE_CAN_KG = 8;

/** Khoảng đơn giá (đ/kg) coi là hợp lý. Rộng có chủ ý — xem ghi chú ở trên. */
export const DON_GIA_MIN = 50_000;
export const DON_GIA_MAX = 2_000_000;

/**
 * Hai mệnh đề CROSS APPLY tính kg cho bảng CONGNO mang bí danh `c`.
 *
 * Dùng CROSS APPLY thay vì nhét cả biểu thức vào SELECT: số kg thô bị nhắc tới
 * năm lần trong phần CASE, viết thẳng thì vừa dài vừa phải tính lại năm lượt.
 * Cũng không dùng hàm vô hướng (scalar UDF) — SQL Server 2014 chưa biết nội
 * tuyến hoá, gọi theo từng dòng trên vài chục nghìn dòng là thấy chậm ngay.
 *
 * Sau khi nối chuỗi này vào mệnh đề FROM, lấy số kg bằng `k.kg` (có thể NULL).
 */
export const KG_CROSS_APPLY = `
  CROSS APPLY (SELECT COALESCE(
      c.SanLuong,
      TRY_CONVERT(float, LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(c.GhiChu, ''), '-', ''), ',', '.'))))
    ) AS tho) t
  CROSS APPLY (SELECT CASE
      WHEN c.style <> ${STYLE_CAN_KG} THEN NULL
      WHEN c.DR IS NULL OR c.DR <= 0 THEN NULL
      WHEN t.tho IS NULL OR t.tho <= 0 THEN NULL
      WHEN c.DR / t.tho BETWEEN ${DON_GIA_MIN} AND ${DON_GIA_MAX} THEN t.tho
      WHEN c.DR / t.tho < ${DON_GIA_MIN}
       AND c.DR / (t.tho / 1000) BETWEEN ${DON_GIA_MIN} AND ${DON_GIA_MAX} THEN t.tho / 1000
      ELSE NULL
    END AS kg) k`;

/** Cột kg sau khi đã nối `KG_CROSS_APPLY`. NULL = không đọc được, đừng cộng vào. */
export const KG = 'k.kg';

/** Tổng kg, bỏ qua dòng không đọc được. */
export const TONG_KG = `SUM(ISNULL(${KG}, 0))`;

/** Đếm số dòng cân KHÔNG đọc được kg — để màn hình nói thật về độ phủ. */
export const DEM_KHONG_DOC_DUOC = `SUM(CASE WHEN c.style = ${STYLE_CAN_KG} AND ${KG} IS NULL THEN 1 ELSE 0 END)`;

/**
 * TUYẾN của một dòng cân — cũng phải lần ra từ chữ.
 *
 * `CONGNO.QuocGiaID` chỉ được điền ở 4.762/21.451 dòng cân của 12 tháng (22%);
 * màn nhập cũ không có ô chọn nước. Phần còn lại, tuyến nằm trong `NoiDung` mà
 * CSKH gõ tay: `"kg us 16/8"`, `"Mỹ - 09/09/2026"`, `"es 20/7 1 túi"`,
 * `"Tây ban nha - 25/09/2026"`.
 *
 * Đọc thêm từ chữ nâng độ phủ từ 22% lên 95,9% (20.565/21.451). 886 dòng còn
 * lại không có dấu hiệu nào, xếp vào "chưa rõ tuyến" chứ không gán bừa.
 *
 * ƯU TIÊN CỘT, rồi mới tới chữ. Hai nguồn lệch nhau ở 59/4.762 dòng (1,2%) —
 * và kiểm tay thì CHỮ mới đúng (`"kg es 31/7"` rõ ràng là Tây Ban Nha nhưng cột
 * ghi Mỹ; `"kg jp 24/8"` là Nhật nhưng cột ghi Ba Lan). Tức CSKH gõ đúng mô tả
 * nhưng bấm nhầm ô chọn nước. Vẫn ưu tiên cột vì đó là trường có cấu trúc và là
 * thứ các màn admin đang lọc theo — để hai bên ra cùng một con số. 59 dòng là
 * 0,3% tổng, lệch không đáng kể; nếu sau này sửa lại thì sửa ở ĐÂY.
 *
 * Mã nước dùng khoảng trắng hai bên (`'% us %'`) để không dính vào giữa chữ
 * khác. Chuỗi đem so đã được bọc sẵn một dấu cách ở đầu và cuối.
 */
export const TUYEN_CROSS_APPLY = `
  CROSS APPLY (SELECT ' ' + LOWER(ISNULL(c.NoiDung, '')) + ' ' AS nd) n
  CROSS APPLY (SELECT COALESCE(c.QuocGiaID, CASE
      WHEN n.nd LIKE N'%tây ban nha%' OR n.nd LIKE '% es %'  OR n.nd LIKE '% tbn %' THEN 3
      WHEN n.nd LIKE N'%hàn quốc%'    OR n.nd LIKE N'% hàn %' OR n.nd LIKE '% kr %' THEN 8
      WHEN n.nd LIKE N'%nhật bản%'    OR n.nd LIKE N'% nhật %' OR n.nd LIKE '% jp %' THEN 9
      WHEN n.nd LIKE N'%bồ đào nha%'  OR n.nd LIKE '% pt %' THEN 6
      WHEN n.nd LIKE N'%ba lan%'      OR n.nd LIKE '% pl %' THEN 7
      WHEN n.nd LIKE N'%đài loan%'    OR n.nd LIKE '% tw %' THEN 13
      WHEN n.nd LIKE N'%canada%'      OR n.nd LIKE '% ca %' THEN 11
      WHEN n.nd LIKE N'%pháp%'        OR n.nd LIKE '% fr %' THEN 4
      WHEN n.nd LIKE N'%đức%'         OR n.nd LIKE '% de %' THEN 5
      WHEN n.nd LIKE N'% úc %'        OR n.nd LIKE '% au %' THEN 10
      WHEN n.nd LIKE N'% mỹ %' OR n.nd LIKE N'%mỹ -%'  OR n.nd LIKE '% us %' OR n.nd LIKE '% usa %' THEN 1
      WHEN n.nd LIKE N'% anh %' OR n.nd LIKE N'%anh -%' OR n.nd LIKE '% uk %' THEN 2
      ELSE NULL
    END) AS id) tuyen`;

/** Mã tuyến sau khi nối `TUYEN_CROSS_APPLY`. NULL = chưa rõ. */
export const TUYEN_ID = 'tuyen.id';
