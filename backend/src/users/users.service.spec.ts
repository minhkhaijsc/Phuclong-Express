import { Test, TestingModule } from '@nestjs/testing';
import { CHUA_GAN, UsersService } from './users.service';
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
});
