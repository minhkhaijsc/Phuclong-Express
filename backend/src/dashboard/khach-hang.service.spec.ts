import { Test, TestingModule } from '@nestjs/testing';
import { KhachHangService } from './khach-hang.service';

/**
 * Mỗi phép kiểm dưới đây ứng với một cách dữ liệu thật làm màn tổng quan nói sai.
 * Các con số lấy từ khách HP3028 và HP220 (đo 09/10/2026).
 */
describe('KhachHangService', () => {
  let service: KhachHangService;
  const mockSequelize = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KhachHangService, { provide: 'SEQUELIZE', useValue: mockSequelize }],
    }).compile();
    service = module.get<KhachHangService>(KhachHangService);
  });

  afterEach(() => jest.clearAllMocks());

  /** Thứ tự gọi query trong soLieu(): kiện → kg → nợ. */
  const dungSoLieu = (kien: any, kg: any, no: any) => {
    mockSequelize.query
      .mockResolvedValueOnce([kien])
      .mockResolvedValueOnce([kg])
      .mockResolvedValueOnce([no]);
  };

  describe('soLieu', () => {
    it('khoá cứng username vào MỌI truy vấn — không có đường nào xem được khách khác', async () => {
      dungSoLieu({ soKien: 379, soTuyen: 2, soKien30Ngay: 122 }, { soKg: 1454.76 }, {});
      await service.soLieu('HP3028', 12);

      expect(mockSequelize.query).toHaveBeenCalledTimes(3);
      for (const [sql, opts] of mockSequelize.query.mock.calls) {
        expect(opts.replacements.khach).toBe('HP3028');
        expect(sql).toContain(':khach');
      }
    });

    it('dư nợ KHÔNG bị giới hạn theo khoảng ngày', async () => {
      // Số dư là số tích luỹ. Cắt theo khoảng xem thì con số lệch khỏi bảng
      // cân đối công nợ, khách gọi lên hỏi vì sao hai màn khác nhau.
      dungSoLieu({ soKien: 1 }, { soKg: 0 }, { tongPhatSinh: 444595352.45, tongDaTra: 457501688 });
      await service.soLieu('HP3028', 6);

      const [sqlNo, optsNo] = mockSequelize.query.mock.calls[2];
      expect(sqlNo).not.toContain(':tu');
      expect(optsNo.replacements).toEqual({ khach: 'HP3028' });
    });

    it('trả dư nợ ÂM khi khách trả trước, không kẹp về 0', async () => {
      dungSoLieu({ soKien: 379 }, { soKg: 0 }, { tongPhatSinh: 444595352.45, tongDaTra: 457501688 });
      const kq = await service.soLieu('HP3028');
      expect(kq.duNo).toBeCloseTo(-12906335.55, 2);
    });

    it('báo kgThieuSo khi có kiện mà chưa cân — để giao diện đừng hiện "0 kg"', async () => {
      dungSoLieu({ soKien: 15 }, { soKg: 0 }, {});
      expect((await service.soLieu('HP220')).kgThieuSo).toBe(true);

      jest.clearAllMocks();
      dungSoLieu({ soKien: 0 }, { soKg: 0 }, {});
      // Không kiện thì không kg là đương nhiên, đừng cảnh báo.
      expect((await service.soLieu('HP220')).kgThieuSo).toBe(false);
    });

    it('thiếu dòng dữ liệu thì ra 0, không ra NaN', async () => {
      mockSequelize.query.mockResolvedValue([]);
      const kq = await service.soLieu('KHACH_MOI');
      expect(kq.soKien).toBe(0);
      expect(kq.duNo).toBe(0);
      expect(kq.lanGuiGanNhat).toBeNull();
      expect(Number.isNaN(kq.duNo)).toBe(false);
    });
  });

  describe('theoTuyen', () => {
    it('tính tỷ trọng trên tổng của chính khách đó', async () => {
      mockSequelize.query.mockResolvedValueOnce([
        { tenQuocGia: 'Anh', soKien: 378 },
        { tenQuocGia: 'Mỹ', soKien: 1 },
      ]);
      const kq = await service.theoTuyen('HP3028');
      expect(kq).toEqual([
        { tenQuocGia: 'Anh', soKien: 378, tyLe: 99.7 },
        { tenQuocGia: 'Mỹ', soKien: 1, tyLe: 0.3 },
      ]);
    });

    it('không có tuyến nào thì tỷ trọng là 0, không chia cho 0', async () => {
      mockSequelize.query.mockResolvedValueOnce([]);
      expect(await service.theoTuyen('KHACH_MOI')).toEqual([]);
    });
  });

  describe('theoThang', () => {
    /** Thứ tự gọi: kiện → tiền → dư đầu kỳ. */
    const dungThang = (kien: any[], tien: any[], duDauKy = 0) => {
      mockSequelize.query
        .mockResolvedValueOnce(kien)
        .mockResolvedValueOnce(tien)
        .mockResolvedValueOnce([{ duDauKy }]);
    };

    const thangTruoc = (lui: number) => {
      const n = new Date();
      const d = new Date(n.getFullYear(), n.getMonth() - lui, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    it('tháng KHÔNG có dữ liệu vẫn có mặt với số 0 — biểu đồ không nối tắt', async () => {
      dungThang(
        [{ thang: thangTruoc(0), soKien: 60 }],
        [{ thang: thangTruoc(0), phatSinh: 80166951, daTra: 127504000, soKg: 370.66 }],
        // Dư đầu kỳ khác 0 để các tháng trống không bị cắt.
        5000,
      );
      const kq = await service.theoThang('HP3028', 3);
      expect(kq).toHaveLength(3);
      expect(kq.map((r) => r.thang)).toEqual([thangTruoc(2), thangTruoc(1), thangTruoc(0)]);
      expect(kq[0].soKien).toBe(0);
      expect(kq[2].soKien).toBe(60);
    });

    it('lũy kế bắt đầu từ dư nợ TRƯỚC khoảng xem, không bắt đầu lại từ 0', async () => {
      dungThang(
        [],
        [{ thang: thangTruoc(0), phatSinh: 1_000_000, daTra: 0, soKg: 0 }],
        50_000_000,
      );
      const kq = await service.theoThang('AI_DO', 2);
      // Tháng đầu không phát sinh gì nhưng vẫn phải mang theo 50tr nợ cũ.
      expect(kq[0].duNoCuoiThang).toBe(50_000_000);
      expect(kq[1].duNoCuoiThang).toBe(51_000_000);
    });

    it('cắt tháng trống Ở ĐẦU nhưng GIỮ khoảng trống giữa kỳ', async () => {
      // Khách chỉ hoạt động ở tháng này và cách đây 2 tháng; tháng giữa nghỉ.
      dungThang(
        [
          { thang: thangTruoc(2), soKien: 10 },
          { thang: thangTruoc(0), soKien: 7 },
        ],
        [],
        0,
      );
      const kq = await service.theoThang('AI_DO', 5);
      expect(kq.map((r) => r.thang)).toEqual([thangTruoc(2), thangTruoc(1), thangTruoc(0)]);
      // Tháng nghỉ giữa kỳ là thông tin thật, phải còn.
      expect(kq[1].soKien).toBe(0);
    });

    it('không cắt tháng trống nếu tháng đó đang treo nợ cũ', async () => {
      dungThang([{ thang: thangTruoc(0), soKien: 3 }], [], 12_000_000);
      const kq = await service.theoThang('AI_DO', 4);
      expect(kq).toHaveLength(4);
      expect(kq[0].duNoCuoiThang).toBe(12_000_000);
    });

    it('khách chưa có gì thì vẫn trả về 1 tháng, không trả mảng rỗng', async () => {
      // Mảng rỗng làm biểu đồ hiện "chưa có dữ liệu" — đúng, nhưng vòng `while`
      // phải dừng ở phần tử cuối chứ không chạy quá mảng.
      dungThang([], [], 0);
      const kq = await service.theoThang('KHACH_MOI', 12);
      expect(kq).toHaveLength(1);
    });
  });

  describe('chuẩn hoá số tháng', () => {
    it('giá trị rác thì về 12, và chặn trên ở 36', async () => {
      mockSequelize.query.mockResolvedValue([]);
      expect((await service.tongQuan('A', Number('x') as any)).soThang).toBe(12);
      jest.clearAllMocks();
      mockSequelize.query.mockResolvedValue([]);
      expect((await service.tongQuan('A', 0)).soThang).toBe(12);
      jest.clearAllMocks();
      mockSequelize.query.mockResolvedValue([]);
      // Chặn trên để một ô ?soThang=100000 không bắt SQL Server dựng 100k dòng.
      expect((await service.tongQuan('A', 999)).soThang).toBe(36);
    });
  });

  describe('danhSachKhachCoDuLieu', () => {
    it('loại tài khoản kho gom hàng chưa có chủ', async () => {
      mockSequelize.query.mockResolvedValueOnce([]);
      await service.danhSachKhachCoDuLieu();
      const [sql, opts] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain('<> :khoChuaCoChu');
      expect(opts.replacements.khoChuaCoChu).toBe('CHECKKHACH');
    });
  });
});
