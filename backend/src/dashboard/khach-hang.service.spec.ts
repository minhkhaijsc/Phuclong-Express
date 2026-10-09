import { Test, TestingModule } from '@nestjs/testing';
import { KhachHangService } from './khach-hang.service';

/**
 * Mỗi phép kiểm dưới đây ứng với một cách dữ liệu thật làm màn tổng quan nói sai.
 * Các con số lấy từ khách HP3028 và HP220 (đo 09/10/2026).
 *
 * "Sản lượng" ở đây là KG. Luật đọc kg nằm ở `san-luong-kg.ts`; phần kiểm
 * riêng cho các luật đó ở `san-luong-kg.spec.ts`.
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

  /** Thứ tự gọi query trong soLieu(): kg → kiện → số tuyến → nợ. */
  const dungSoLieu = (kg: any, kien: any, no: any, tuyen: any = { soTuyen: 1 }) => {
    mockSequelize.query
      .mockResolvedValueOnce([kg])
      .mockResolvedValueOnce([kien])
      .mockResolvedValueOnce([tuyen])
      .mockResolvedValueOnce([no]);
  };

  describe('soLieu', () => {
    it('khoá cứng username vào MỌI truy vấn — không có đường nào xem được khách khác', async () => {
      dungSoLieu({ soKg: 1794.38, soKg30Ngay: 775.7 }, { soKien: 379, soTuyen: 2 }, {});
      await service.soLieu('HP3028', 12);

      expect(mockSequelize.query).toHaveBeenCalledTimes(4);
      for (const [sql, opts] of mockSequelize.query.mock.calls) {
        expect(opts.replacements.khach).toBe('HP3028');
        expect(sql).toContain(':khach');
      }
    });

    it('dư nợ KHÔNG bị giới hạn theo khoảng ngày', async () => {
      // Số dư là số tích luỹ. Cắt theo khoảng xem thì con số lệch khỏi bảng
      // cân đối công nợ, khách gọi lên hỏi vì sao hai màn khác nhau.
      dungSoLieu({ soKg: 1 }, { soKien: 1 }, { tongPhatSinh: 444595352.45, tongDaTra: 457616688 });
      await service.soLieu('HP3028', 6);

      const [sqlNo, optsNo] = mockSequelize.query.mock.calls[3];
      expect(sqlNo).not.toContain(':tu');
      expect(optsNo.replacements).toEqual({ khach: 'HP3028' });
    });

    it('trả dư nợ ÂM khi khách trả trước, không kẹp về 0', async () => {
      dungSoLieu({ soKg: 0 }, { soKien: 379 }, { tongPhatSinh: 444595352.45, tongDaTra: 457616688 });
      const kq = await service.soLieu('HP3028');
      expect(kq.duNo).toBeCloseTo(-13021335.55, 2);
    });

    it('đếm số dòng cân KHÔNG đọc được kg và trả ra ngoài', async () => {
      // Màn phải nói ra con số này. Im lặng thì khách tưởng tổng kg là đầy đủ,
      // trong khi 9,3% dòng cân toàn hệ không ghi kg ở đâu cả.
      dungSoLieu({ soKg: 120.5, soDongThieuKg: 7 }, { soKien: 15 }, {});
      expect((await service.soLieu('HP220')).soDongThieuKg).toBe(7);
    });

    it('số tuyến đếm từ CÙNG nguồn với biểu đồ tuyến', async () => {
      // Đếm chéo nguồn (tracking vs công nợ) thì ô số ghi "2 tuyến" mà biểu đồ
      // ngay bên dưới chỉ vẽ 1 — HP3028 đúng là như vậy.
      dungSoLieu({ soKg: 1794.38 }, { soKien: 379 }, {}, { soTuyen: 1 });
      expect((await service.soLieu('HP3028')).soTuyen).toBe(1);
      expect(mockSequelize.query.mock.calls[2][0]).toContain('CONGNO');
    });

    it('chỉ đếm dòng CÂN KG, không đụng dòng thanh toán', async () => {
      // 1.166 dòng thanh toán (style 2) mang GhiChu là số tài khoản ngân hàng.
      // Không chặn style thì mấy con số đó cộng thẳng vào sản lượng.
      dungSoLieu({ soKg: 1 }, { soKien: 1 }, {});
      await service.soLieu('HP3028');
      expect(mockSequelize.query.mock.calls[0][0]).toContain('c.style = 8');
    });

    it('thiếu dòng dữ liệu thì ra 0, không ra NaN', async () => {
      mockSequelize.query.mockResolvedValue([]);
      const kq = await service.soLieu('KHACH_MOI');
      expect(kq.soKg).toBe(0);
      expect(kq.soKien).toBe(0);
      expect(kq.duNo).toBe(0);
      expect(kq.lanGuiGanNhat).toBeNull();
      expect(Number.isNaN(kq.duNo)).toBe(false);
    });
  });

  describe('theoTuyen', () => {
    it('chia theo KG và tính tỷ trọng trên tổng của chính khách đó', async () => {
      mockSequelize.query.mockResolvedValueOnce([
        { tenQuocGia: 'Anh', soKg: 1729.18 },
        { tenQuocGia: '(chưa rõ tuyến)', soKg: 65.2 },
      ]);
      const kq = await service.theoTuyen('HP3028');
      expect(kq).toEqual([
        { tenQuocGia: 'Anh', soKg: 1729.18, tyLe: 96.4 },
        { tenQuocGia: '(chưa rõ tuyến)', soKg: 65.2, tyLe: 3.6 },
      ]);
    });

    it('bỏ dòng không đọc được kg khỏi bảng tuyến', async () => {
      // Cộng NULL thành 0 rồi vẫn hiện tên tuyến thì tuyến đó trông như không
      // gửi gì, trong khi thật ra là không đo được.
      mockSequelize.query.mockResolvedValueOnce([]);
      await service.theoTuyen('HP3028');
      expect(mockSequelize.query.mock.calls[0][0]).toContain('IS NOT NULL');
    });

    it('không có tuyến nào thì tỷ trọng là 0, không chia cho 0', async () => {
      mockSequelize.query.mockResolvedValueOnce([]);
      expect(await service.theoTuyen('KHACH_MOI')).toEqual([]);
    });
  });

  describe('theoThang', () => {
    /** Thứ tự gọi: tiền+kg → kiện → dư đầu kỳ. */
    const dungThang = (kien: any[], tien: any[], duDauKy = 0) => {
      mockSequelize.query
        .mockResolvedValueOnce(tien)
        .mockResolvedValueOnce(kien)
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
