import { OrdersService } from './orders.service';

/**
 * Ô "Mã đặt hàng" phải thật sự đi tới stored procedure.
 *
 * Lỗi đã xảy ra: giao diện gửi mã lên, DTO nhận, nhưng service truyền cứng
 * `@MaDatHang = ''` cho SP_Lay_DonHang. Kết quả là gõ mã vào ô đó không lọc gì
 * — danh sách trả về y như không gõ. Không ai phát hiện vì trang vẫn chạy, vẫn
 * có dữ liệu, chỉ là lọc không ăn; người dùng tưởng mình tra sai mã.
 *
 * Hai màn dùng hai tên tham số khác nhau cho cùng một ô, nên kiểm cả hai:
 *   /admin/orders/list     -> `ids`
 *   /admin/orders/deleted  -> `orderId`
 */

/** Ghi lại mọi lần gọi SP để xem tham số truyền đi là gì. */
function taoSequelizeGia() {
  const calls: { sql: string; replacements: Record<string, unknown> }[] = [];
  return {
    calls,
    // Constructor gọi OrderModel(sequelize) khi chưa có models.Order — mà việc
    // đó cần một Sequelize thật. Khai sẵn để nó bỏ qua nhánh ấy.
    models: { Order: {} },
    query: jest.fn(async (sql: string, opts: any) => {
      calls.push({ sql, replacements: opts?.replacements ?? {} });
      return [];
    }),
  };
}

function taoService(seq: any) {
  const khongLam = { create: jest.fn(), log: jest.fn() } as any;
  // Service chỉ cần sequelize cho các đường này; ba service kia không được gọi.
  return new OrdersService(seq, khongLam, khongLam, khongLam);
}

describe('Ô "Mã đặt hàng" được truyền tới SP_Lay_DonHang', () => {
  it('findAll (màn Mua hàng) truyền `ids` vào @MaDatHang', async () => {
    const seq = taoSequelizeGia();
    await taoService(seq).findAll({ ids: '42621' } as any);

    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    expect(goi).toBeDefined();
    expect(goi!.sql).toContain('@MaDatHang = :MaDatHang');
    expect(goi!.replacements.MaDatHang).toBe('42621');
  });

  it('findDeleted (màn đơn đã xoá) truyền `orderId` vào @MaDatHang', async () => {
    const seq = taoSequelizeGia();
    await taoService(seq).findDeleted({ orderId: '42620' } as any);

    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    expect(goi).toBeDefined();
    expect(goi!.sql).toContain('@MaDatHang = :MaDatHang');
    expect(goi!.replacements.MaDatHang).toBe('42620');
  });

  it('không gõ mã thì truyền chuỗi rỗng, không phải undefined', async () => {
    // Sequelize ném lỗi nếu một tham số có trong câu lệnh mà thiếu trong
    // replacements — bỏ sót là hỏng cả màn hình, không chỉ hỏng bộ lọc.
    const seq = taoSequelizeGia();
    await taoService(seq).findAll({} as any);

    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    expect(goi!.replacements.MaDatHang).toBe('');
  });

  // --- phần dưới: SP nối @MaDatHang thẳng vào câu lệnh động rồi sp_executesql,
  // nên những gì đi qua đây phải sạch tuyệt đối.

  it('chỉ cho số đi qua — gõ chữ thì bỏ, KHÔNG để SQL vỡ', async () => {
    const seq = taoSequelizeGia();
    // Mã đơn thật có dạng chữ-số ("UHSA8Y"), người dùng rất dễ gõ nhầm vào đây.
    // Trước khi siết, câu lệnh thành `ID IN (UHSA8Y)` → SQL Server báo lỗi.
    await taoService(seq).findAll({ ids: 'UHSA8Y' } as any);

    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    expect(goi!.replacements.MaDatHang).toBe('');
  });

  it('chặn SQL injection qua ô Mã đặt hàng', async () => {
    const seq = taoSequelizeGia();
    await taoService(seq).findAll({ ids: "1); DROP TABLE Don_Hang--" } as any);

    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    const ra = String(goi!.replacements.MaDatHang);
    expect(ra).not.toMatch(/[^0-9,]/);
    expect(ra).not.toMatch(/DROP|--|\)/i);
  });

  it('nhiều ID phân cách kiểu gì cũng gom lại thành danh sách sạch', async () => {
    const seq = taoSequelizeGia();
    await taoService(seq).findAll({ ids: ' 42621, 42620 ; 42619\n42617 ' } as any);

    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    expect(goi!.replacements.MaDatHang).toBe('42621,42620,42619,42617');
  });

  it('vẫn truyền song song với ô Filter, hai ô dùng được cùng lúc', async () => {
    const seq = taoSequelizeGia();
    await taoService(seq).findAll({ ids: '42621', search: 'nguyen' } as any);

    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    expect(goi!.replacements.MaDatHang).toBe('42621');
    expect(goi!.replacements.search).toBe('nguyen');
  });
});

/**
 * Ô "Filter": dán nhiều mã cùng lúc (yêu cầu của HD, 05/10/2026).
 *
 * Một giá trị thì PHẢI giữ đường cũ (LIKE) — ô này lâu nay còn dùng để tìm một
 * phần ghi chú / tên đợt hàng / link web, đổi hết sang khớp chính xác là làm
 * hỏng cách dùng sẵn có của mọi người.
 */
describe('Ô Filter nhận nhiều mã', () => {
  const goiFindAll = async (search: string) => {
    const seq = taoSequelizeGia();
    await taoService(seq).findAll({ search } as any);
    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    return goi!.replacements as Record<string, string>;
  };

  it('MỘT giá trị vẫn đi đường cũ (LIKE), không bật chế độ nhiều mã', async () => {
    const r = await goiFindAll('54465698271');
    expect(r.search).toBe('54465698271');
    expect(r.DanhSachMa).toBe('');
  });

  it('gõ CỤM TỪ có khoảng trắng vẫn tìm LIKE như trước, không bị hiểu thành nhiều mã', async () => {
    // Ô này lâu nay dùng để tìm một phần ghi chú / tên đợt hàng. Tách theo
    // khoảng trắng thì "hang de vo" thành 3 mã và trả 0 đơn — hỏng hẳn một cách
    // dùng sẵn có. Vì vậy chỉ tách theo dấu phẩy / chấm phẩy / xuống dòng.
    const r = await goiFindAll('hang de vo');
    expect(r.DanhSachMa).toBe('');
    expect(r.search).toBe('hang de vo');
  });

  it('một mã có khoảng trắng thừa hai đầu vẫn là MỘT giá trị', async () => {
    const r = await goiFindAll('  54465698271  ');
    expect(r.DanhSachMa).toBe('');
    expect(r.search).toBe('  54465698271  ');
  });

  it('dán hai mã trở lên thì chuyển sang khớp chính xác', async () => {
    const r = await goiFindAll('54465698271,54479892581');
    expect(r.DanhSachMa).toBe('54465698271,54479892581');
    expect(r.search).toBe('');
  });

  it('dán từ Excel (xuống dòng) nhận được', async () => {
    const r = await goiFindAll('54465698271\n54479892581\n40393208912');
    expect(r.DanhSachMa).toBe('54465698271,54479892581,40393208912');
  });

  it('thừa khoảng trắng, dấu phẩy rỗng, dòng trống đều bỏ qua', async () => {
    const r = await goiFindAll('  54465698271 ,, \n  54479892581  ;\n\n');
    expect(r.DanhSachMa).toBe('54465698271,54479892581');
  });

  it('mã trùng chỉ tính một lần, giữ nguyên thứ tự dán vào', async () => {
    const r = await goiFindAll('B111,A222,B111,C333');
    expect(r.DanhSachMa).toBe('B111,A222,C333');
  });

  it('mã chữ-số như UHSA8Y dùng được (đây mới là mã đơn thật)', async () => {
    const r = await goiFindAll('UHSA8Y,54465698271');
    expect(r.DanhSachMa).toBe('UHSA8Y,54465698271');
  });

  it('ô để trống thì không bật gì cả', async () => {
    const r = await goiFindAll('');
    expect(r.DanhSachMa).toBe('');
    expect(r.search).toBe('');
  });
});
