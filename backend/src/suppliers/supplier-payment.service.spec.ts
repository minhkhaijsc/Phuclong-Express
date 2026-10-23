import { BadRequestException } from '@nestjs/common';
import { SupplierPaymentService, phanBoCuTruoc } from './supplier-payment.service';

/**
 * Thanh toán NCC — yêu cầu bên khách 23/10/2026. Trả gộp "tự trừ vào đơn cũ
 * nhất", trả theo đơn thì tick đơn + số tiền từng đơn.
 */
describe('phanBoCuTruoc — trả gộp tự trừ đơn cũ nhất', () => {
  const ds = [
    { ID: 1, conLai: 100_000 },
    { ID: 2, conLai: 250_000 },
    { ID: 3, conLai: 50_000 },
  ];

  it('trừ đơn cũ trước, đơn sau chỉ nhận phần còn lại', () => {
    expect(phanBoCuTruoc(300_000, ds)).toEqual({
      phanBo: [
        { donHangId: 1, soTien: 100_000 },
        { donHangId: 2, soTien: 200_000 },
      ],
      traDu: 0,
    });
  });

  it('vừa đúng tổng thì hết sạch, không dư', () => {
    const kq = phanBoCuTruoc(400_000, ds);
    expect(kq.phanBo.map((p) => p.soTien)).toEqual([100_000, 250_000, 50_000]);
    expect(kq.traDu).toBe(0);
  });

  it('trả lố tổng còn nợ thì phần thừa giữ lại là "trả dư", không vứt', () => {
    const kq = phanBoCuTruoc(500_000, ds);
    expect(kq.phanBo).toHaveLength(3);
    expect(kq.traDu).toBe(100_000);
  });

  it('bỏ qua đơn chỉ còn bụi dưới 1đ (cột float làm tròn)', () => {
    const kq = phanBoCuTruoc(10_000, [{ ID: 9, conLai: 0.0000001 }, { ID: 10, conLai: 20_000 }]);
    expect(kq.phanBo).toEqual([{ donHangId: 10, soTien: 10_000 }]);
  });

  it('số lẻ không trôi: tổng phân bổ + dư = đúng số tiền', () => {
    const kq = phanBoCuTruoc(123_456.78, [
      { ID: 1, conLai: 33_333.33 },
      { ID: 2, conLai: 44_444.44 },
      { ID: 3, conLai: 999_999 },
    ]);
    const tong = kq.phanBo.reduce((a, p) => a + p.soTien, 0) + kq.traDu;
    expect(Math.round(tong * 100) / 100).toBe(123_456.78);
  });

  it('NCC hết nợ thì cả cục là trả dư', () => {
    expect(phanBoCuTruoc(50_000, [])).toEqual({ phanBo: [], traDu: 50_000 });
  });
});

describe('SupplierPaymentService — chốt chặn khi lập phiếu', () => {
  const query = jest.fn();
  const sequelize: any = {
    query,
    transaction: jest.fn((_o: unknown, fn: (t: unknown) => unknown) => fn({})),
  };
  const logs: any = { create: jest.fn().mockResolvedValue(undefined) };
  const svc = new SupplierPaymentService(sequelize, logs);

  beforeEach(() => query.mockReset());

  const don = (ID: number, NCC_ID: number, NCC_TongPhaiTra: number, daTra = 0) => ({
    ID, ordernumber: `DH${ID}`, NCC_ID, DaXoa: false, NCC_TongPhaiTra, daTra,
  });

  it('từ chối ngày sai định dạng', async () => {
    await expect(
      svc.lapTheoDon({ ngayTra: '23/10/2026', dong: [{ donHangId: 1, soTien: 1 }] }, 'kt'),
    ).rejects.toThrow(BadRequestException);
  });

  it('từ chối phiếu không tick đơn nào', async () => {
    await expect(svc.lapTheoDon({ ngayTra: '2026-10-23', dong: [] }, 'kt')).rejects.toThrow('Chưa tick');
  });

  it('từ chối số tiền 0 hoặc âm', async () => {
    await expect(
      svc.lapTheoDon({ ngayTra: '2026-10-23', dong: [{ donHangId: 1, soTien: 0 }] }, 'kt'),
    ).rejects.toThrow('lớn hơn 0');
  });

  it('từ chối tick đơn của HAI nhà cung cấp trên một phiếu', async () => {
    query.mockResolvedValueOnce([don(1, 7, 100_000), don(2, 8, 100_000)]);
    await expect(
      svc.lapTheoDon(
        { ngayTra: '2026-10-23', dong: [{ donHangId: 1, soTien: 1000 }, { donHangId: 2, soTien: 1000 }] },
        'kt',
      ),
    ).rejects.toThrow('nhiều nhà cung cấp');
  });

  it('từ chối trả lố số còn nợ của một đơn (gõ thừa số 0)', async () => {
    query.mockResolvedValueOnce([don(1, 7, 100_000, 60_000)]);
    await expect(
      svc.lapTheoDon({ ngayTra: '2026-10-23', dong: [{ donHangId: 1, soTien: 400_000 }] }, 'kt'),
    ).rejects.toThrow('chỉ còn nợ 40.000');
  });

  it('từ chối đơn chưa nhập giá NCC', async () => {
    query.mockResolvedValueOnce([{ ...don(1, 7, 0), NCC_TongPhaiTra: null }]);
    await expect(
      svc.lapTheoDon({ ngayTra: '2026-10-23', dong: [{ donHangId: 1, soTien: 1000 }] }, 'kt'),
    ).rejects.toThrow('chưa nhập giá');
  });

  it('phiếu hợp lệ: ghi phiếu bằng TỔNG các đơn, mỗi đơn một dòng', async () => {
    query
      .mockResolvedValueOnce([don(1, 7, 100_000), don(2, 7, 50_000)])
      .mockResolvedValueOnce([{ PhieuID: 42 }])
      .mockResolvedValue(undefined);
    const kq = await svc.lapTheoDon(
      { ngayTra: '2026-10-23', dong: [{ donHangId: 1, soTien: 100_000 }, { donHangId: 2, soTien: '20.000' }] },
      'kt',
    );
    expect(kq).toEqual({ phieuId: 42, soTien: 120_000, soDon: 2, daPhanBo: 120_000, traDu: 0 });
    expect(query.mock.calls[1][1].replacements).toMatchObject({ nccId: 7, soTien: 120_000, loai: 'theo-don' });
    expect(query.mock.calls.filter((c) => String(c[0]).includes('tbThanhToanNccDon (PhieuID'))).toHaveLength(2);
  });

  it('trả gộp: khấu đơn cũ nhất, câu SQL xếp theo ngày mua rồi mã đơn', async () => {
    query
      .mockResolvedValueOnce([{ n: 1 }])
      .mockResolvedValueOnce([{ ID: 5, conLai: 30_000 }, { ID: 9, conLai: 80_000 }])
      .mockResolvedValueOnce([{ PhieuID: 7 }])
      .mockResolvedValue(undefined);
    const kq = await svc.lapGop({ nccId: 3, ngayTra: '2026-10-23', soTien: 50_000 }, 'kt');
    expect(kq).toEqual({ phieuId: 7, soTien: 50_000, soDon: 2, daPhanBo: 50_000, traDu: 0 });
    expect(String(query.mock.calls[1][0])).toContain('ORDER  BY ngay, ID');
  });
});
