import { Test, TestingModule } from '@nestjs/testing';
import { SupplierDebtService } from './supplier-debt.service';

/**
 * Công nợ phải trả nhà cung cấp.
 *
 * Hai phép kiểm đầu ứng với hai lỗi đã có thật trên sản xuất, phát hiện
 * 15/10/2026:
 *
 *   1. Ngày dd/MM/yyyy nhét thẳng vào phép so với cột datetime → SQL Server
 *      đọc theo `mdy`, "15/10/2026" thành tháng 15 → 500 cho cả trang.
 *   2. `NCC_Cong` là phần trăm nhưng bị SUM thẳng → "tổng công" là tổng của
 *      mấy con số phần trăm, không phải tiền.
 */
describe('SupplierDebtService', () => {
  let service: SupplierDebtService;
  const mockSequelize = { query: jest.fn().mockResolvedValue([]) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SupplierDebtService, { provide: 'SEQUELIZE', useValue: mockSequelize }],
    }).compile();
    service = module.get<SupplierDebtService>(SupplierDebtService);
  });

  afterEach(() => jest.clearAllMocks());

  const thamSo = (lan = 0) => mockSequelize.query.mock.calls[lan][1].replacements;
  const cauLenh = (lan = 0) => mockSequelize.query.mock.calls[lan][0] as string;

  describe('khoảng ngày', () => {
    it('đổi dd/MM/yyyy sang yyyy-MM-dd, KHÔNG gửi nguyên chuỗi của người dùng', async () => {
      await service.tongTheoNcc({ tuNgay: '01/10/2026', denNgay: '15/10/2026' });

      expect(thamSo().tuNgay).toBe('2026-10-01');
      expect(thamSo().tuNgay).not.toBe('01/10/2026');
      expect(String(thamSo().denNgay)).toContain('2026-10-15');
    });

    it('ngày 13 trở lên vẫn chạy — chính là ngày làm vỡ bản cũ', async () => {
      await service.tongTheoNcc({ tuNgay: '13/10/2026', denNgay: '31/10/2026' });

      expect(thamSo().tuNgay).toBe('2026-10-13');
      expect(String(thamSo().denNgay)).toContain('2026-10-31');
    });

    it('ngày cuối lấy HẾT ngày, không phải 00:00', async () => {
      // Lấy 00:00 thì đơn mua chiều hôm cuối kỳ rơi ra ngoài báo cáo.
      await service.tongTheoNcc({ denNgay: '15/10/2026' });
      expect(String(thamSo().denNgay)).toContain('23:59:59');
    });

    it('ngày gõ sai thì bỏ mệnh đề lọc, không ném lỗi làm trắng trang', async () => {
      await service.tongTheoNcc({ tuNgay: 'linh tinh' });

      expect(thamSo().tuNgay).toBeUndefined();
      expect(cauLenh()).not.toContain(':tuNgay');
    });

    it('đường đếm đơn chưa nhập dùng CHUNG một phép lọc ngày', async () => {
      // Trước đây đoạn lọc ngày bị chép ở hai nơi nên lỗi cũng có ở cả hai.
      mockSequelize.query.mockResolvedValueOnce([{ soDon: 0 }]);
      await service.soDonChuaNhap({ tuNgay: '20/10/2026' });

      expect(thamSo().tuNgay).toBe('2026-10-20');
    });
  });

  describe('tiền công', () => {
    it('cộng SỐ TIỀN công, không cộng con số phần trăm', async () => {
      await service.tongTheoNcc({});

      const sql = cauLenh();
      expect(sql).toContain('ISNULL(dh.NCC_NgoaiTe, 0) * ISNULL(dh.NCC_Cong, 0) / 100');
      expect(sql).not.toContain('SUM(ISNULL(dh.NCC_Cong, 0))');
    });
  });

  describe('điều kiện luôn có', () => {
    it('chỉ lấy đơn chưa xoá và ĐÃ nhập giá NCC', async () => {
      await service.tongTheoNcc({});

      const sql = cauLenh();
      expect(sql).toContain('dh.DaXoa = 0');
      expect(sql).toContain('dh.NCC_TongPhaiTra IS NOT NULL');
    });
  });

  describe('theo tuyến (02/11/2026)', () => {
    it('lọc theo tuyến của ĐƠN, áp cho cả bảng NCC, bảng tuyến và chi tiết', async () => {
      await service.tongTheoNcc({ quocGiaId: 3 });
      await service.tongTheoTuyen({ quocGiaId: 3 });
      for (const lan of [0, 1]) {
        expect(cauLenh(lan)).toContain('dh.QuocGiaID = :quocGiaId');
        expect(thamSo(lan).quocGiaId).toBe(3);
      }
    });

    it('cảnh báo "đơn chưa nhập giá" cũng theo tuyến đang lọc', async () => {
      mockSequelize.query.mockResolvedValueOnce([{ soDon: 0 }]);
      await service.soDonChuaNhap({ quocGiaId: 3 });
      expect(cauLenh()).toContain('dh.QuocGiaID = :quocGiaId');
    });

    it('thẻ dùng chung: lọc NCC vẫn tách được theo tuyến', async () => {
      await service.tongTheoTuyen({ nccId: 9 });
      expect(cauLenh()).toContain('dh.NCC_ID = :nccId');
      expect(cauLenh()).toContain('GROUP  BY dh.QuocGiaID');
    });

    it('cộng cùng kiểu với bảng NCC — tổng hai bảng phải khớp nhau', async () => {
      await service.tongTheoNcc({});
      await service.tongTheoTuyen({});
      const cot = (sql: string) => sql.slice(sql.indexOf('COUNT(*)'), sql.indexOf('FROM'));
      expect(cot(cauLenh(1))).toBe(cot(cauLenh(0)));
    });

    it('không lọc tuyến thì không thêm điều kiện', async () => {
      await service.tongTheoTuyen({});
      expect(cauLenh()).not.toContain(':quocGiaId');
    });
  });

  describe('danh sách đơn chưa nhập (03/11/2026)', () => {
    it('cùng điều kiện với con số cảnh báo — số dòng phải khớp số đếm', async () => {
      mockSequelize.query.mockResolvedValueOnce([{ soDon: 0 }]);
      await service.soDonChuaNhap({ tuNgay: '01/11/2026', denNgay: '03/11/2026', quocGiaId: 3 });
      await service.dsChuaNhap({ tuNgay: '01/11/2026', denNgay: '03/11/2026', quocGiaId: 3 });

      const where = (sql: string) => sql.slice(sql.indexOf('WHERE'), sql.indexOf('ORDER') > 0 ? sql.indexOf('ORDER') : undefined).replace(/\s+/g, ' ').trim();
      expect(where(cauLenh(1))).toBe(where(cauLenh(0)));
      expect(thamSo(1)).toEqual(thamSo(0));
      expect(cauLenh(1)).toContain('dh.NCC_TongPhaiTra IS NULL');
    });

    it('lọc NCC không làm rơi đơn chưa nhập (đơn chưa nhập thường chưa có NCC)', async () => {
      await service.dsChuaNhap({ nccId: 9 });
      expect(cauLenh()).not.toContain(':nccId');
    });
  });
});
