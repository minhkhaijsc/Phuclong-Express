import { OrdersService } from './orders.service';

/**
 * Đường GHI của màn nhập giá NCC hàng loạt.
 *
 * `ncc-hang-loat.spec.ts` lo phép trộn; tệp này lo ba thứ chỉ thấy được ở tầng
 * dịch vụ: đọc lại giá mới nhất trước khi ghi, ghi trong một giao dịch, và
 * KHÔNG hỏi kỳ công nợ của khách.
 */
describe('OrdersService.capNhatNccHangLoat', () => {
  let service: OrdersService;
  let query: jest.Mock;
  let taoLog: jest.Mock;

  /** Dòng DON_HANG trả về cho câu SELECT mở đầu. */
  const hienCo = (rows: any[]) =>
    query.mockImplementationOnce(() => Promise.resolve(rows));

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    taoLog = jest.fn().mockResolvedValue(undefined);
    const sequelize: any = {
      models: { Order: {} },
      query,
      transaction: jest.fn((cb: any) => cb('GIAO_DICH')),
    };
    service = new OrdersService(
      sequelize,
      { create: taoLog } as any,
      { create: jest.fn() } as any,
      {} as any,
    );
  });

  const cauLenh = () => query.mock.calls.map((c) => String(c[0]));

  it('đọc lại giá đang có rồi mới ghi, không tin số màn hình gửi lên', async () => {
    hienCo([
      { ID: 1, NCC_ID: null, NCC_NgoaiTe: null, NCC_Cong: null, NCC_TyGia: null, NCC_TongPhaiTra: null, NCC_Tracking: null },
    ]);

    await service.capNhatNccHangLoat(
      { dong: [{ id: 1, ngoaiTe: 10 }], nccId: 2, cong: 3, tyGia: 27000 },
      'MH_LINH',
    );

    expect(cauLenh()[0]).toContain('FROM   dbo.DON_HANG');
    expect(cauLenh()[0]).toContain('DaXoa = 0');
    expect(query.mock.calls[0][1].replacements.ids).toEqual([1]);
  });

  it('KHÔNG gọi SP kiểm tra kỳ công nợ của khách', async () => {
    // Kỳ 8/2026 trở về trước đều đã đóng, mà giá nhập của đơn cũ thì vẫn phải
    // nhập được — xem ghi chú dài trong `capNhatNccHangLoat`.
    hienCo([
      { ID: 1, NCC_ID: null, NCC_NgoaiTe: null, NCC_Cong: null, NCC_TyGia: null, NCC_TongPhaiTra: null, NCC_Tracking: null },
    ]);

    await service.capNhatNccHangLoat({ dong: [{ id: 1, ngoaiTe: 10 }], tyGia: 27000 }, 'MH_LINH');

    expect(cauLenh().join(' ')).not.toContain('SP_KiemTra_DuocCapNhatDonHang');
  });

  it('ghi trong MỘT giao dịch — hỏng nửa chừng không để lại mẻ đơn nửa mới nửa cũ', async () => {
    hienCo([
      { ID: 1, NCC_ID: null, NCC_NgoaiTe: null, NCC_Cong: null, NCC_TyGia: null, NCC_TongPhaiTra: null, NCC_Tracking: null },
      { ID: 2, NCC_ID: null, NCC_NgoaiTe: null, NCC_Cong: null, NCC_TyGia: null, NCC_TongPhaiTra: null, NCC_Tracking: null },
    ]);

    const kq = await service.capNhatNccHangLoat(
      { dong: [{ id: 1, ngoaiTe: 10 }, { id: 2, ngoaiTe: 20 }], tyGia: 27000 },
      'MH_LINH',
    );

    const ghi = query.mock.calls.filter((c) => String(c[0]).includes('UPDATE dbo.DON_HANG'));
    expect(ghi).toHaveLength(2);
    expect(ghi.every((c) => c[1].transaction === 'GIAO_DICH')).toBe(true);
    expect(kq.capNhat).toBe(2);
  });

  it('một dòng nhật ký mỗi đơn, ghi tên người thao tác', async () => {
    hienCo([
      { ID: 7, NCC_ID: null, NCC_NgoaiTe: null, NCC_Cong: null, NCC_TyGia: null, NCC_TongPhaiTra: null, NCC_Tracking: null },
    ]);

    await service.capNhatNccHangLoat({ dong: [{ id: 7, ngoaiTe: 10 }], tyGia: 27000 }, 'MH_LINH');

    expect(taoLog).toHaveBeenCalledTimes(1);
    const log = taoLog.mock.calls[0][0];
    expect(log.nguoiTao).toBe('MH_LINH');
    expect(log.doiTuong).toBe('7');
    expect(log.noiDung).toContain('NCC_TongPhaiTra: 270000');
  });

  it('không có gì đổi thì KHÔNG ghi và KHÔNG ghi nhật ký', async () => {
    hienCo([
      { ID: 1, NCC_ID: 2, NCC_NgoaiTe: 10, NCC_Cong: null, NCC_TyGia: 27000, NCC_TongPhaiTra: 270000, NCC_Tracking: null },
    ]);

    const kq = await service.capNhatNccHangLoat(
      { dong: [{ id: 1, ngoaiTe: 10 }], nccId: 2, tyGia: 27000 },
      'MH_LINH',
    );

    expect(query.mock.calls.filter((c) => String(c[0]).includes('UPDATE'))).toHaveLength(0);
    expect(taoLog).not.toHaveBeenCalled();
    expect(kq).toEqual({ success: true, capNhat: 0, khongDoi: 1, khongThay: [] });
  });

  it('danh sách rỗng thì chặn ngay, không đụng CSDL', async () => {
    await expect(service.capNhatNccHangLoat({ dong: [] }, 'MH_LINH')).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('ID trùng chỉ đọc một lần', async () => {
    hienCo([
      { ID: 1, NCC_ID: null, NCC_NgoaiTe: null, NCC_Cong: null, NCC_TyGia: null, NCC_TongPhaiTra: null, NCC_Tracking: null },
    ]);

    await service.capNhatNccHangLoat(
      { dong: [{ id: 1, ngoaiTe: 10 }, { id: 1, ngoaiTe: 10 }], tyGia: 27000 },
      'MH_LINH',
    );

    expect(query.mock.calls[0][1].replacements.ids).toEqual([1]);
  });
});
