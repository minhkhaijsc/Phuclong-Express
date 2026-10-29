import { DebtReportsService } from './debt-reports.service';
import { laTienMat } from './tien-mat';

/**
 * Hai phương thức thu khi lên công nợ: tiền mặt (TM) và chuyển khoản (CK).
 * CSKH muốn cột Ghi chú ra "Thu tiền mặt" khi thu bằng tiền mặt.
 */
describe('Công nợ: thu tiền mặt / chuyển khoản', () => {
  const ghiChuGhi = async (dto: Record<string, any>) => {
    let p: Record<string, any> = {};
    const sequelize = {
      query: jest.fn(async (sql: string, o: any) => {
        if (/CongNo_Insert/.test(sql)) p = o?.replacements ?? {};
        return [];
      }),
    };
    const dv = new DebtReportsService(sequelize as any, { create: jest.fn(), taoThongBao: jest.fn() } as any);
    const kq = await dv.createDebt({ username: 'HP123', noiDung: 'CK CONG NO', ngay: '29/10/2026', ...dto } as any, 'cskh');
    expect(kq.success).toBe(true);
    return p.ghiChu;
  };

  it('chọn Tiền mặt → ghi chú "Thu tiền mặt"', async () => {
    expect(await ghiChuGhi({ cr: 500_000, bankAccount: 'Tiền mặt' })).toBe('Thu tiền mặt');
  });

  it('giữ ghi chú CSKH gõ, nối thêm phía sau', async () => {
    expect(await ghiChuGhi({ cr: 500_000, bankAccount: 'Tiền mặt', ghiChu: 'Khách nộp tại kho' })).toBe(
      'Khách nộp tại kho - Thu tiền mặt',
    );
  });

  it('chuyển khoản vẫn như cũ', async () => {
    expect(await ghiChuGhi({ cr: 500_000, bankAccount: 'VCB 0123' })).toBe('Báo chuyển khoản - VCB 0123');
  });

  it('không có Tiền Có thì không ghi phương thức (giống CK)', async () => {
    expect(await ghiChuGhi({ dr: 500_000, bankAccount: 'Tiền mặt' })).toBe('');
  });

  it('nhận cả chữ hoa/thường, dấu dựng sẵn hay tổ hợp (file Excel)', () => {
    expect(laTienMat('TIỀN MẶT')).toBe(true);
    expect(laTienMat(' tiền mặt ')).toBe(true);
    expect(laTienMat('Tiền mặt'.normalize('NFD'))).toBe(true);
    expect(laTienMat('VCB')).toBe(false);
    expect(laTienMat(undefined)).toBe(false);
  });
});
