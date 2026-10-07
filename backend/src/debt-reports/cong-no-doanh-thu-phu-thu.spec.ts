import { ValidationPipe } from '@nestjs/common';
import { DebtReportsService } from './debt-reports.service';
import { ImportCreateDebtDto } from './dto/debt-management.dto';

/**
 * Phát sinh nợ = doanh thu + phụ thu.
 *
 * Máy chủ TỰ CỘNG, không tin số tổng do web gửi lên — hai nơi tính thì sớm muộn
 * cũng lệch. Ở đây bắt lại đúng tham số gửi xuống thủ tục để chắc điều đó.
 */
describe('Công nợ: doanh thu + phụ thu', () => {
  const taoDv = () => {
    const goi: { sql: string; p: Record<string, any> }[] = [];
    const sequelize = {
      query: jest.fn(async (sql: string, o: any) => {
        goi.push({ sql: sql.replace(/\s+/g, ' '), p: o?.replacements ?? {} });
        if (/SP_KiemTra_DuocCapNhatCongNoByID/.test(sql)) return [{ Result: 0 }];
        return [];
      }),
    };
    const dv = new DebtReportsService(sequelize as any, { create: jest.fn(), taoThongBao: jest.fn() } as any);
    const congNo = (ten: RegExp) => goi.find((g) => ten.test(g.sql))?.p ?? {};
    return { dv, goi, congNo };
  };

  const donCoBan = { username: 'HP123', noiDung: 'Cước tháng 9', ngay: '25/09/2026' };

  it('cộng doanh thu + phụ thu ra phát sinh nợ khi thêm mới', async () => {
    const { dv, congNo } = taoDv();
    const kq = await dv.createDebt({ ...donCoBan, doanhThu: 1_200_000, phuThu: 300_000 }, 'ketoan');
    expect(kq.success).toBe(true);
    expect(congNo(/CongNo_Insert/)).toMatchObject({ dr: 1_500_000, doanhThu: 1_200_000, phuThu: 300_000, cr: 0 });
  });

  it('chỉ nhập một trong hai vẫn ra đúng tổng', async () => {
    const { dv, congNo } = taoDv();
    await dv.createDebt({ ...donCoBan, doanhThu: 800_000 }, 'ketoan');
    expect(congNo(/CongNo_Insert/)).toMatchObject({ dr: 800_000, doanhThu: 800_000, phuThu: 0 });

    const b = taoDv();
    await b.dv.createDebt({ ...donCoBan, phuThu: 50_000 }, 'ketoan');
    expect(b.congNo(/CongNo_Insert/)).toMatchObject({ dr: 50_000, doanhThu: 0, phuThu: 50_000 });
  });

  it('KHÔNG tin số tổng web gửi lên — cứ cộng lại từ hai khoản', async () => {
    const { dv, congNo } = taoDv();
    await dv.createDebt({ ...donCoBan, dr: 999_999_999, doanhThu: 100_000, phuThu: 20_000 }, 'ketoan');
    expect(congNo(/CongNo_Insert/)).toMatchObject({ dr: 120_000 });
  });

  it('đường cũ (nhập Excel, thanh toán) không gửi hai khoản thì giữ nguyên cách cũ', async () => {
    const { dv, congNo } = taoDv();
    await dv.createDebt({ ...donCoBan, dr: 700_000 }, 'ketoan');
    // dr giữ nguyên, hai cột mới để trống chứ không ghi 0 — dòng cũ không ai biết
    // trong đó bao nhiêu là doanh thu.
    expect(congNo(/CongNo_Insert/)).toMatchObject({ dr: 700_000, doanhThu: null, phuThu: null });
  });

  it('thanh toán (chỉ có Có) vẫn vào được, không đòi doanh thu', async () => {
    const { dv, congNo } = taoDv();
    const kq = await dv.createDebt({ ...donCoBan, cr: 500_000 }, 'ketoan');
    expect(kq.success).toBe(true);
    expect(congNo(/CongNo_Insert/)).toMatchObject({ dr: 0, cr: 500_000 });
  });

  it('hai khoản đều 0 và không có Có thì báo lỗi, không ghi gì', async () => {
    const { dv, goi } = taoDv();
    const kq = await dv.createDebt({ ...donCoBan, doanhThu: 0, phuThu: 0 }, 'ketoan');
    expect(kq).toMatchObject({ success: false });
    expect(goi.some((g) => /CongNo_Insert/.test(g.sql))).toBe(false);
  });

  it('sửa dòng: cộng lại tổng và bật cờ cập nhật hai cột', async () => {
    const { dv, congNo } = taoDv();
    await dv.updateDebtManagement(
      55,
      { username: 'HP123', noiDung: 'Sửa', doanhThu: 900_000, phuThu: 100_000 },
      'ketoan',
    );
    expect(congNo(/SP_CapNhat_CongNo /)).toMatchObject({
      dr: 1_000_000,
      doanhThu: 900_000,
      phuThu: 100_000,
      udTach: 1,
    });
  });

  it('sửa dòng cũ mà không đụng tới hai khoản thì không ghi đè cột cũ', async () => {
    const { dv, congNo } = taoDv();
    await dv.updateDebtManagement(55, { username: 'HP123', noiDung: 'Sửa', dr: 400_000 }, 'ketoan');
    expect(congNo(/SP_CapNhat_CongNo /)).toMatchObject({ dr: 400_000, udTach: 0, doanhThu: null, phuThu: null });
  });

  it('nhật ký hệ thống ghi cả hai khoản để sau còn đối chiếu', async () => {
    const { dv, congNo } = taoDv();
    await dv.createDebt({ ...donCoBan, doanhThu: 10, phuThu: 5 }, 'ketoan');
    expect(String(congNo(/SP_Them_SystemLogs/).ghiChu)).toMatch(/DR: 15 \(DoanhThu: 10; PhuThu: 5\)/);
  });
});

/**
 * Hai cột mới phải SỐNG SÓT qua ValidationPipe.
 *
 * `whitelist: true` (main.ts) CẮT IM LẶNG mọi trường không khai ở DTO: web gửi
 * doanh thu + phụ thu lên, pipe vứt đi, service thấy không có gì nên ghi DR
 * theo số gộp — không lỗi, không cảnh báo, chỉ là hai cột trống trong sổ.
 *
 * Phép kiểm này dựng đúng pipe của main.ts, nên quên khai ở DTO là đỏ ngay.
 */
describe('Import công nợ: doanh thu + phụ thu qua ValidationPipe', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true });
  const sieuDuLieu = { type: 'body' as const, metatype: ImportCreateDebtDto };
  const chay = (rows: unknown[]) => pipe.transform({ rows }, sieuDuLieu) as Promise<ImportCreateDebtDto>;

  const dongCoBan = { username: 'HP123', noiDung: 'Cước tháng 9', ngay: '25/09/2026' };

  it('giữ nguyên doanh thu và phụ thu', async () => {
    const kq = await chay([{ ...dongCoBan, doanhThu: 450_000, phuThu: 50_000 }]);
    expect(kq.rows[0]).toMatchObject({ doanhThu: 450_000, phuThu: 50_000 });
  });

  it('giữ phụ thu khi chỉ có một trong hai', async () => {
    const kq = await chay([{ ...dongCoBan, phuThu: 50_000 }]);
    expect(kq.rows[0].phuThu).toBe(50_000);
    expect(kq.rows[0].doanhThu).toBeUndefined();
  });

  it('dòng nhập gộp kiểu cũ vẫn đi qua được, không bị gán số bịa', async () => {
    const kq = await chay([{ ...dongCoBan, dr: 500_000, cr: 0 }]);
    expect(kq.rows[0].dr).toBe(500_000);
    expect(kq.rows[0].doanhThu).toBeUndefined();
    expect(kq.rows[0].phuThu).toBeUndefined();
  });

  it('chữ ở cột doanh thu thì báo lỗi chứ không lặng lẽ thành 0', async () => {
    await expect(chay([{ ...dongCoBan, doanhThu: 'nhiều lắm' }])).rejects.toThrow();
  });
});
