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
    await taoService(seq).findAll({ ids: 'ABC123' } as any);

    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    expect(goi).toBeDefined();
    expect(goi!.sql).toContain('@MaDatHang = :MaDatHang');
    expect(goi!.replacements.MaDatHang).toBe('ABC123');
  });

  it('findDeleted (màn đơn đã xoá) truyền `orderId` vào @MaDatHang', async () => {
    const seq = taoSequelizeGia();
    await taoService(seq).findDeleted({ orderId: 'XYZ789' } as any);

    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    expect(goi).toBeDefined();
    expect(goi!.sql).toContain('@MaDatHang = :MaDatHang');
    expect(goi!.replacements.MaDatHang).toBe('XYZ789');
  });

  it('không gõ mã thì truyền chuỗi rỗng, không phải undefined', async () => {
    // Sequelize ném lỗi nếu một tham số có trong câu lệnh mà thiếu trong
    // replacements — bỏ sót là hỏng cả màn hình, không chỉ hỏng bộ lọc.
    const seq = taoSequelizeGia();
    await taoService(seq).findAll({} as any);

    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    expect(goi!.replacements.MaDatHang).toBe('');
  });

  it('vẫn truyền song song với ô Filter, hai ô dùng được cùng lúc', async () => {
    const seq = taoSequelizeGia();
    await taoService(seq).findAll({ ids: 'ABC123', search: 'nguyen' } as any);

    const goi = seq.calls.find((c) => c.sql.includes('SP_Lay_DonHang'));
    expect(goi!.replacements.MaDatHang).toBe('ABC123');
    expect(goi!.replacements.search).toBe('nguyen');
  });
});
