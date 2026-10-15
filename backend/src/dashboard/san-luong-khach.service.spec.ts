import { Test, TestingModule } from '@nestjs/testing';
import {
  MA_DON_CUOI_NOI_DUNG,
  NHAN_CHUA_RO_TUYEN,
  SanLuongKhachService,
  STYLE_PHI_MUA,
} from './san-luong-khach.service';
import { STYLE_CAN_KG } from './san-luong-kg';

/**
 * Báo cáo sản lượng khách hàng.
 *
 * Mỗi phép kiểm ứng với một cách báo cáo này có thể nói sai mà nhìn vẫn hợp lý
 * — đó mới là kiểu sai nguy hiểm trong một bảng số đưa lên cho ban giám đốc.
 */
describe('SanLuongKhachService', () => {
  let service: SanLuongKhachService;
  const mockSequelize = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SanLuongKhachService, { provide: 'SEQUELIZE', useValue: mockSequelize }],
    }).compile();
    service = module.get<SanLuongKhachService>(SanLuongKhachService);
  });

  afterEach(() => jest.clearAllMocks());

  const dong = (q: Partial<Record<string, unknown>> = {}) => ({
    maKh: 'HP2857',
    tenKhach: 'Nguyễn Văn A',
    tuyenId: 1,
    tuyen: 'Mỹ',
    kg: 1572.528,
    cuoc: 1281548011,
    phiMua: 0,
    tong: 1281548011,
    dongThieuKg: 0,
    ...q,
  });

  describe('câu lệnh', () => {
    it('lấy mã đơn theo khoảng trắng CUỐI, không cắt chữ "Phí mua"', async () => {
      // Dòng huỷ đơn mang số âm và có nội dung "Cancel đơn hàng 35688". Cắt
      // theo chữ "Phí mua" thì mất mã đơn, mất tuyến, và tiền âm dồn hết vào
      // nhóm chưa rõ tuyến.
      mockSequelize.query.mockResolvedValueOnce([]);
      await service.bang('01/09/2026', '30/09/2026');

      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain(MA_DON_CUOI_NOI_DUNG);
      expect(sql).not.toContain("REPLACE(c.NoiDung, N'Phí mua'");
    });

    it('nối hai nhánh bằng FULL OUTER JOIN và xử lý NULL tuyến tường minh', async () => {
      mockSequelize.query.mockResolvedValueOnce([]);
      await service.bang();

      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain('FULL OUTER JOIN');
      // NULL = NULL không khớp trong SQL: thiếu vế này thì nhóm chưa rõ tuyến
      // bị tách làm hai dòng cho cùng một khách.
      expect(sql).toContain('mua.tuyenId IS NULL AND can.tuyenId IS NULL');
    });

    it('tách đúng hai loại tiền: cân kg và phí mua hộ', async () => {
      mockSequelize.query.mockResolvedValueOnce([]);
      await service.bang();

      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain(`c.style = ${STYLE_CAN_KG}`);
      expect(sql).toContain(`c.style = ${STYLE_PHI_MUA}`);
    });

    it('bind tham số, không nối chuỗi lọc', async () => {
      mockSequelize.query.mockResolvedValueOnce([]);
      await service.bang('01/09/2026', '30/09/2026', 8, 'HP2857');

      const [sql, opts] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain(':khach');
      expect(sql).toContain(':quocGiaId');
      expect(opts.replacements.khach).toBe('HP2857');
      expect(opts.replacements.quocGiaId).toBe(8);
      expect(opts.replacements.tu).toContain('2026-09-01');
    });

    it('lọc rỗng thì truyền NULL, không truyền chuỗi rỗng', async () => {
      // `UserName = ''` không khớp dòng nào — bảng sẽ rỗng mà không ai hiểu vì sao.
      mockSequelize.query.mockResolvedValueOnce([]);
      await service.bang(undefined, undefined, 0, '   ');

      const [, opts] = mockSequelize.query.mock.calls[0];
      expect(opts.replacements.khach).toBeNull();
      expect(opts.replacements.quocGiaId).toBeNull();
    });
  });

  describe('kết quả', () => {
    it('cộng tổng từ chính các dòng trả về, không hỏi thêm một câu tổng riêng', async () => {
      // Hỏi tổng bằng câu lệnh thứ hai thì tổng và bảng có thể lệch nhau khi
      // dữ liệu đổi giữa hai lần hỏi.
      mockSequelize.query.mockResolvedValueOnce([
        dong(),
        dong({ maKh: 'HP761', tuyenId: 3, tuyen: 'Tây ban nha', kg: 530.19, cuoc: 118121502, phiMua: 984849241, tong: 1102970743 }),
      ]);
      const kq = await service.bang();

      expect(mockSequelize.query).toHaveBeenCalledTimes(1);
      expect(kq.tong.kg).toBeCloseTo(2102.718, 3);
      expect(kq.tong.cuoc).toBe(1281548011 + 118121502);
      expect(kq.tong.phiMua).toBe(984849241);
      expect(kq.tong.tong).toBe(1281548011 + 1102970743);
      expect(kq.tong.soDong).toBe(2);
    });

    it('đếm KHÁCH chứ không đếm dòng — một khách đi nhiều tuyến vẫn là một khách', async () => {
      mockSequelize.query.mockResolvedValueOnce([
        dong({ tuyenId: 1, tuyen: 'Mỹ' }),
        dong({ tuyenId: 2, tuyen: 'Anh' }),
        dong({ tuyenId: 3, tuyen: 'Tây ban nha' }),
      ]);
      const kq = await service.bang();

      expect(kq.tong.soDong).toBe(3);
      expect(kq.tong.soKhach).toBe(1);
    });

    it('tuyến không tra được thì ghi "Chưa rõ tuyến", không gán bừa một nước', async () => {
      mockSequelize.query.mockResolvedValueOnce([
        dong({ tuyenId: null, tuyen: null, kg: 12.5 }),
      ]);
      const kq = await service.bang();

      expect(kq.dong[0].tuyen).toBe(NHAN_CHUA_RO_TUYEN);
      expect(kq.dong[0].tuyenId).toBeNull();
      expect(kq.canhBao.kgChuaRoTuyen).toBe(12.5);
    });

    it('kg chưa rõ tuyến chỉ cộng phần chưa rõ, không cộng nhầm cả bảng', async () => {
      mockSequelize.query.mockResolvedValueOnce([
        dong({ tuyenId: 1, kg: 100 }),
        dong({ tuyenId: null, tuyen: null, kg: 7 }),
      ]);
      const kq = await service.bang();

      expect(kq.tong.kg).toBe(107);
      expect(kq.canhBao.kgChuaRoTuyen).toBe(7);
    });

    it('gom số dòng cân không đọc được kg để màn hình nói thật về độ phủ', async () => {
      mockSequelize.query.mockResolvedValueOnce([
        dong({ dongThieuKg: 3 }),
        dong({ maKh: 'HP761', dongThieuKg: 5 }),
      ]);
      const kq = await service.bang();

      expect(kq.canhBao.dongThieuKg).toBe(8);
    });

    it('giữ nguyên số âm của đơn huỷ — doanh số là số thuần, không phải số gộp', async () => {
      // 659 dòng "Cancel đơn hàng" trong 12 tháng, tổng -1,32 tỷ. Bỏ số âm đi
      // là báo cáo cao hơn thực thu.
      mockSequelize.query.mockResolvedValueOnce([
        dong({ cuoc: 0, phiMua: -29361106, tong: -29361106, kg: 0 }),
      ]);
      const kq = await service.bang();

      expect(kq.dong[0].phiMua).toBe(-29361106);
      expect(kq.tong.tong).toBe(-29361106);
    });

    it('giá trị thiếu hoặc không phải số thì về 0, không để NaN lọt vào bảng', async () => {
      mockSequelize.query.mockResolvedValueOnce([
        { maKh: 'HP1', tuyenId: 1, tuyen: 'Mỹ', kg: null, cuoc: undefined, phiMua: 'x', tong: null },
      ]);
      const kq = await service.bang();

      expect(kq.dong[0].kg).toBe(0);
      expect(kq.dong[0].cuoc).toBe(0);
      expect(kq.dong[0].phiMua).toBe(0);
      expect(Number.isNaN(kq.tong.tong)).toBe(false);
    });
  });

  describe('tuyenCoDuLieu', () => {
    it('chỉ trả tuyến CÓ phát sinh trong kỳ', async () => {
      mockSequelize.query.mockResolvedValueOnce([
        { id: 1, ten: 'Mỹ' },
        { id: 8, ten: 'Hàn Quốc' },
      ]);
      const kq = await service.tuyenCoDuLieu('01/09/2026', '30/09/2026');

      const [sql] = mockSequelize.query.mock.calls[0];
      // Không lấy thẳng tbQuocGia: hai tuyến xuất thêm 12/10 chưa có đơn nào,
      // hiện ra ô lọc chỉ làm người dùng chọn rồi nhận bảng rỗng.
      expect(sql).toContain('CONGNO');
      expect(kq).toEqual([
        { id: 1, ten: 'Mỹ' },
        { id: 8, ten: 'Hàn Quốc' },
      ]);
    });
  });
});
