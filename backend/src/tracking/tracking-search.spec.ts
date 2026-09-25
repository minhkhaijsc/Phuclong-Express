import { TrackingService } from './tracking.service';

/**
 * Tra cứu công khai: khách gõ mã nào trong ô nhiều mã cũng phải ra đơn.
 * Sequelize giả — chỉ cần đủ hai câu lệnh mà searchByCode dùng.
 */
describe('TrackingService.searchByCode', () => {
  const taoDv = (coDon: boolean, maPhu: number | null = null) => {
    const sequelize = {
      query: jest.fn(async (q: string) => {
        const s = q.replace(/\s+/g, ' ');
        if (/SELECT TOP 1 TrackingID/.test(s)) return [coDon ? [{ TrackingID: 11 }] : []];
        if (/FROM dbo\.tbTinhTrangTracking/.test(s)) {
          return [[{ ngay: '2026-09-25', tinhTrang: 'InTransit', moTa: 'Đã chuyển lên máy bay về VN', ghiChu: null }]];
        }
        throw new Error('câu lệnh lạ: ' + s.slice(0, 60));
      }),
    };
    const anh = {
      timTheoMaPhu: jest.fn(async () => (maPhu ? [{ TrackingID: maPhu, TrackingNumber: 'A\nB', UserName: 'k', TinhTrang: 'InTransit' }] : [])),
      layAnh: jest.fn(async () => []),
    };
    return { dv: new TrackingService(sequelize as any, {} as any, anh as any), sequelize, anh };
  };

  it('khớp bằng dấu bằng thì không phải tra ô nhiều mã', async () => {
    const { dv, anh } = taoDv(true);
    const kq = await dv.searchByCode('CO-THAT-123');
    expect(kq.found).toBe(true);
    expect(anh.timTheoMaPhu).not.toHaveBeenCalled();
  });

  it('mã nằm trong ô nhiều mã: vẫn tra ra đơn', async () => {
    const { dv, anh } = taoDv(false, 11);
    const kq = await dv.searchByCode('1Z6F857YYW87631219');
    expect(kq.found).toBe(true);
    expect(kq.history).toHaveLength(1);
    expect(anh.timTheoMaPhu).toHaveBeenCalledWith('1Z6F857YYW87631219');
  });

  it('không có thật thì vẫn báo không tìm thấy', async () => {
    const { dv } = taoDv(false, null);
    await expect(dv.searchByCode('KHONG-CO-THAT')).resolves.toMatchObject({ found: false });
  });

  it('tra ô nhiều mã mà hỏng thì coi như không thấy, không nổ', async () => {
    const { dv } = taoDv(false, null);
    (dv as any).anhTrackingService.timTheoMaPhu = jest.fn(async () => { throw new Error('mất kết nối'); });
    await expect(dv.searchByCode('X')).resolves.toMatchObject({ found: false });
  });
});
