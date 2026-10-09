import {
  DON_GIA_MAX,
  DON_GIA_MIN,
  KG,
  KG_CROSS_APPLY,
  STYLE_CAN_KG,
  TONG_KG,
  TUYEN_CROSS_APPLY,
  TUYEN_ID,
} from './san-luong-kg';

/**
 * Biểu thức ở đây là SQL, chạy trên máy chủ CSDL nên không gọi thẳng để thử
 * được. Phần kiểm này canh ĐÚNG MỘT VIỆC: không ai được lặng lẽ gỡ một trong
 * các chốt chặn. Mỗi chốt dưới đây ứng với một kiểu dữ liệu hỏng đã đếm được
 * trên dữ liệu thật — gỡ ra là con số sai ngay, mà sai một cách trông rất hợp lý.
 *
 * Phần đối chiếu với dữ liệu THẬT nằm ở `ghtm-uat/flows/ple-san-luong-kg.mjs`.
 */
describe('biểu thức sản lượng kg', () => {
  it('chỉ nhận loại phát sinh "Cân Kg"', () => {
    // 1.166 dòng thanh toán (style 2) có GhiChu là số tài khoản ngân hàng.
    expect(STYLE_CAN_KG).toBe(8);
    expect(KG_CROSS_APPLY).toContain(`c.style <> ${STYLE_CAN_KG} THEN NULL`);
  });

  it('bỏ dòng không có tiền', () => {
    // 82 dòng "ck công nợ" bị xếp nhầm loại, DR = 0, GhiChu là số tài khoản.
    // DR cũng là thứ duy nhất kiểm chứng được kg (DR = kg × đơn giá).
    expect(KG_CROSS_APPLY).toContain('c.DR IS NULL OR c.DR <= 0 THEN NULL');
  });

  it('đọc cột SanLuong trước, không có mới lần sang Ghi chú', () => {
    expect(KG_CROSS_APPLY).toContain('COALESCE(');
    expect(KG_CROSS_APPLY).toContain('c.SanLuong');
    expect(KG_CROSS_APPLY).toContain('c.GhiChu');
  });

  it('đổi dấu phẩy thành dấu chấm và bỏ gạch nối trước khi đọc số', () => {
    // Ghi chú cũ có dạng "5.22 - " và "5,22 -".
    expect(KG_CROSS_APPLY).toContain("REPLACE(REPLACE(ISNULL(c.GhiChu, ''), '-', ''), ',', '.')");
  });

  it('dùng TRY_CONVERT để ghi chú không phải số thì ra NULL, không làm hỏng cả câu lệnh', () => {
    // 512 dòng có ghi chú là chữ. CONVERT thường sẽ ném lỗi và chết cả truy vấn.
    expect(KG_CROSS_APPLY).toContain('TRY_CONVERT(float');
  });

  it('giữ nguyên khoảng đơn giá đã đo', () => {
    // 7.760/7.779 dòng đáng tin rơi vào khoảng này; giá thật 208k–278k/kg.
    // Khoảng rộng có chủ ý — để bắt số SAI HẲN, không phải để xét duyệt giá.
    expect(DON_GIA_MIN).toBe(50_000);
    expect(DON_GIA_MAX).toBe(2_000_000);
    expect(KG_CROSS_APPLY).toContain(`c.DR / t.tho BETWEEN ${DON_GIA_MIN} AND ${DON_GIA_MAX}`);
  });

  it('sửa dòng mất dấu thập phân bằng cách chia 1.000', () => {
    // 11 dòng kiểu 19354 vốn là 19,354 kg. Riêng chúng làm tháng 6/2026 phồng
    // từ 10 tấn lên 57 tấn.
    expect(KG_CROSS_APPLY).toContain('t.tho / 1000');
    // Chỉ chia khi chia xong thì đơn giá về đúng khoảng — không chia bừa.
    expect(KG_CROSS_APPLY).toContain(
      `c.DR / (t.tho / 1000) BETWEEN ${DON_GIA_MIN} AND ${DON_GIA_MAX}`,
    );
  });

  it('sai kiểu khác thì BỎ, không đoán', () => {
    expect(KG_CROSS_APPLY.trimEnd().endsWith('END AS kg) k')).toBe(true);
    expect(KG_CROSS_APPLY).toContain('ELSE NULL');
  });

  it('tổng kg coi dòng không đọc được là 0, không phải NULL', () => {
    // SUM bỏ qua NULL nhưng ISNULL cho kết quả ổn định khi cả nhóm đều NULL —
    // không có nó thì tổng ra NULL và giao diện hiện ô trống thay vì số 0.
    expect(TONG_KG).toBe(`SUM(ISNULL(${KG}, 0))`);
  });

  it('tuyến: ưu tiên cột, thiếu mới đọc từ chữ', () => {
    expect(TUYEN_CROSS_APPLY).toContain('COALESCE(c.QuocGiaID');
    expect(TUYEN_ID).toBe('tuyen.id');
  });

  it('mã nước hai ký tự phải có khoảng trắng hai bên', () => {
    // Không có khoảng trắng thì "es" dính vào giữa chữ khác và gán nhầm tuyến.
    for (const ma of ['% es %', '% uk %', '% us %', '% jp %', '% kr %', '% pl %']) {
      expect(TUYEN_CROSS_APPLY).toContain(ma);
    }
  });

  it('nhận cả tên tiếng Việt lẫn mã nước', () => {
    expect(TUYEN_CROSS_APPLY).toContain('tây ban nha');
    expect(TUYEN_CROSS_APPLY).toContain('hàn quốc');
    expect(TUYEN_CROSS_APPLY).toContain('nhật bản');
  });

  it('không tìm ra tuyến thì để NULL chứ không gán bừa về Mỹ', () => {
    // Mỹ chiếm đa số nên gán mặc định về Mỹ sẽ "trông hợp lý" mà sai.
    const sauCung = TUYEN_CROSS_APPLY.slice(TUYEN_CROSS_APPLY.lastIndexOf('WHEN'));
    expect(sauCung).toContain('ELSE NULL');
  });

  it('không nối chuỗi nào từ bên ngoài vào — biểu thức là hằng', () => {
    // Hai chuỗi này ghép thẳng vào câu lệnh SQL nên tuyệt đối không được mang
    // giá trị do người dùng gửi lên.
    for (const s of [KG_CROSS_APPLY, TUYEN_CROSS_APPLY]) {
      expect(s).not.toContain('${');
      expect(s).not.toContain(':');
    }
  });
});
