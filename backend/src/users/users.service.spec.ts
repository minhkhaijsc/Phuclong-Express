import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CHUA_GAN, TUOI_NO_TOI_DA, UsersService, chuanHoaTuoiNo } from './users.service';
import { SystemLogsService } from '../system-logs/system-logs.service';

/**
 * Danh sách tài khoản + ô "CSKH phụ trách".
 *
 * Phép kiểm đầu tiên là phép kiểm quan trọng nhất: bản trước nối thẳng từ khoá
 * vào chuỗi SQL.
 */
describe('UsersService — danh sách và CSKH phụ trách', () => {
  let service: UsersService;
  // `models.User` phải có sẵn: hàm dựng gọi UserModel(sequelize) khi thiếu, mà
  // User.init() thì cần một Sequelize thật.
  const mockSequelize = { query: jest.fn(), models: { User: {} } as any };
  const mockLogs = { create: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    mockSequelize.models = { User: {} };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: 'SEQUELIZE', useValue: mockSequelize },
        { provide: SystemLogsService, useValue: mockLogs },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  const traVe = (rows: any[] = []) => mockSequelize.query.mockResolvedValueOnce([rows]);

  describe('findAll', () => {
    it('BIND từ khoá, không nối chuỗi — gõ dấu nháy vào ô tìm kiếm không làm vỡ câu lệnh', async () => {
      traVe();
      await service.findAll("HP' OR 1=1 --");

      const [sql, opts] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain(':tuKhoa');
      expect(sql).not.toContain('OR 1=1');
      expect(opts.replacements.tuKhoa).toBe("%HP' OR 1=1 --%");
    });

    it('không có từ khoá thì truyền NULL, không truyền chuỗi rỗng', async () => {
      // `LIKE '%%'` vẫn khớp mọi dòng nên trông thì đúng, nhưng mất đường dùng
      // chỉ mục; còn `UserName LIKE ''` thì không khớp gì cả.
      traVe();
      await service.findAll('   ');

      const [, opts] = mockSequelize.query.mock.calls[0];
      expect(opts.replacements.tuKhoa).toBeNull();
    });

    it('lọc theo CSKH phụ trách', async () => {
      traVe();
      await service.findAll(undefined, 'CSKHMAILINH');

      const [sql, opts] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain('CSKHPhuTrach = :loc');
      expect(opts.replacements.loc).toBe('CSKHMAILINH');
    });

    it('lọc "chưa gán" phải tìm theo NULL, không tìm theo chuỗi đó', async () => {
      // Không ai có CSKHPhuTrach = '(chua-gan)'; viết sai chỗ này là bảng rỗng
      // mà nhìn thì tưởng không có mã nào chưa gán.
      traVe();
      await service.findAll(undefined, CHUA_GAN);

      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain('CSKHPhuTrach IS NULL');
      expect(sql).toContain(`:loc = '${CHUA_GAN}'`);
    });

    it('trả cả cột CSKHPhuTrach — thiếu thì màn danh sách hiện cột rỗng', async () => {
      traVe();
      await service.findAll();

      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain('CSKHPhuTrach');
    });
  });

  describe('danhSachCskh', () => {
    it('chỉ lấy vai trò CSKH và bỏ tài khoản đã đóng mã', async () => {
      traVe([{ username: 'CSKHMAILINH', hoTen: 'Hoàng Mai Linh' }]);
      const ds = await service.danhSachCskh();

      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain("r.Name = 'CSKH'");
      expect(sql).toContain("<> 'dong-ma'");
      expect(ds).toEqual([{ username: 'CSKHMAILINH', hoTen: 'Hoàng Mai Linh' }]);
    });

    it('thiếu họ tên thì lấy tên đăng nhập, không trả về rỗng', async () => {
      // Ô chọn mà hiện dòng trống thì không ai biết đang chọn ai.
      traVe([]);
      await service.danhSachCskh();

      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain('ISNULL(u.HoTen, u.UserName)');
    });
  });

  describe('danh sách trả về cả tuổi nợ', () => {
    it('có cột TuoiNo — thiếu thì cột trên màn danh sách rỗng trắng', async () => {
      traVe([]);
      await service.findAll();

      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain('TuoiNo');
    });
  });
});

/**
 * Ô "Tuổi nợ" — số ngày khách được phép nợ.
 *
 * Chỗ dễ vỡ nhất là CHUỖI RỖNG: màn sửa gửi `''` khi người dùng xoá trắng ô, và
 * `''` ném thẳng vào cột `int` thì cả câu UPDATE vỡ, người dùng chỉ thấy "Cập
 * nhật thất bại" mà không hiểu vì sao.
 */
describe('chuanHoaTuoiNo', () => {
  it('rỗng nghĩa là KHÔNG CÓ thoả thuận -> null', () => {
    expect(chuanHoaTuoiNo('')).toBeNull();
    expect(chuanHoaTuoiNo('   ')).toBeNull();
    expect(chuanHoaTuoiNo(null)).toBeNull();
    expect(chuanHoaTuoiNo(undefined)).toBeNull();
  });

  it('0 KHÁC rỗng — 0 là phải trả ngay, không phải chưa thoả thuận', () => {
    expect(chuanHoaTuoiNo(0)).toBe(0);
    expect(chuanHoaTuoiNo('0')).toBe(0);
  });

  it('nhận số và chuỗi số', () => {
    expect(chuanHoaTuoiNo(30)).toBe(30);
    expect(chuanHoaTuoiNo(' 45 ')).toBe(45);
  });

  it('chặn số âm', () => {
    expect(() => chuanHoaTuoiNo(-1)).toThrow(BadRequestException);
  });

  it('chặn số lẻ — nửa ngày nợ là vô nghĩa', () => {
    expect(() => chuanHoaTuoiNo('30.5')).toThrow(BadRequestException);
  });

  it('chặn chữ', () => {
    expect(() => chuanHoaTuoiNo('ba mươi')).toThrow(BadRequestException);
  });

  it('chặn số quá lớn — gần như chắc chắn là gõ nhầm', () => {
    expect(chuanHoaTuoiNo(TUOI_NO_TOI_DA)).toBe(TUOI_NO_TOI_DA);
    expect(() => chuanHoaTuoiNo(TUOI_NO_TOI_DA + 1)).toThrow(BadRequestException);
  });
});

describe('UsersService.update — ô tuổi nợ', () => {
  let service: UsersService;
  const banGhi = { UserName: 'HP591', update: jest.fn() };
  const mockSequelize = {
    query: jest.fn(),
    models: { User: { findByPk: jest.fn().mockResolvedValue(banGhi) } } as any,
  };
  const mockLogs = { create: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    banGhi.update.mockResolvedValue(banGhi);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: 'SEQUELIZE', useValue: mockSequelize },
        { provide: SystemLogsService, useValue: mockLogs },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('xoá trắng ô thì ghi NULL, không ghi chuỗi rỗng vào cột int', async () => {
    await service.update('id-1', { TuoiNo: '' } as any);
    expect(banGhi.update).toHaveBeenCalledWith(expect.objectContaining({ TuoiNo: null }));
  });

  it('chuỗi số thành số', async () => {
    await service.update('id-1', { TuoiNo: '45' } as any);
    expect(banGhi.update).toHaveBeenCalledWith(expect.objectContaining({ TuoiNo: 45 }));
  });

  it('sửa thứ khác mà không gửi ô này lên thì KHÔNG đụng tới tuổi nợ', async () => {
    // Nhét TuoiNo: null vào đây là mỗi lần sửa họ tên lại xoá mất thoả thuận.
    await service.update('id-1', { HoTen: 'Nguyễn Văn A' } as any);
    const [duLieu] = banGhi.update.mock.calls[0];
    expect('TuoiNo' in duLieu).toBe(false);
  });

  it('số âm thì chặn, không ghi gì cả', async () => {
    await expect(service.update('id-1', { TuoiNo: -5 } as any)).rejects.toThrow(BadRequestException);
    expect(banGhi.update).not.toHaveBeenCalled();
  });
});
