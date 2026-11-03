import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { QuyenService } from './quyen/quyen.service';

/**
 * Phần kiểm này canh ĐÚNG MỘT VIỆC: "đóng mã" phải chặn được đường vào.
 *
 * Không có nó thì đóng mã chỉ là một nhãn — mã biến khỏi danh sách việc cần làm
 * của CSKH, nhưng người giữ mật khẩu vẫn đăng nhập xem dữ liệu như thường. Và
 * câu từ chối xoá tài khoản (`users.controller`) khuyên "đóng mã thay vì xoá",
 * nên nếu đóng mã không đóng gì thì lời khuyên đó là sai.
 */
describe('AuthService — chặn đăng nhập khi đã đóng mã', () => {
  let service: AuthService;
  const mockLogs = { create: jest.fn().mockResolvedValue(undefined) };
  const timKhach = jest.fn();

  const mockSequelize: any = {
    models: {
      User: class {
        static findOne = (...a: any[]) => timKhach(...a);
      },
    },
    query: jest.fn().mockResolvedValue([]),
  };

  /** Mật khẩu "dung" băm theo bcrypt, để `validateUser` đi qua được. */
  const bam = require('bcrypt').hashSync('dung', 4);

  const taiKhoan = (o: Record<string, unknown>) => ({
    get: () => ({
      Id: 'id-1',
      UserName: 'KETOANHA',
      PasswordHash: bam,
      LyDoTrangThai: null,
      TrangThai: null,
      ...o,
    }),
  });

  beforeEach(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        QuyenService,
        { provide: 'SEQUELIZE', useValue: mockSequelize },
        { provide: JwtService, useValue: { sign: () => 'the-gia' } },
        { provide: SystemLogsService, useValue: mockLogs },
      ],
    }).compile();
    service = mod.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  it('mã đã đóng thì KHÔNG vào được, dù mật khẩu đúng', async () => {
    timKhach.mockResolvedValue(taiKhoan({ TrangThai: 'dong-ma', LyDoTrangThai: 'nghỉ việc' }));
    await expect(service.login({ username: 'KETOANHA', password: 'dung' } as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('ghi nhật ký lần bị từ chối, kèm lý do đóng mã', async () => {
    timKhach.mockResolvedValue(taiKhoan({ TrangThai: 'dong-ma', LyDoTrangThai: 'nghỉ việc 09/2026' }));
    await service.login({ username: 'KETOANHA', password: 'dung' } as any).catch(() => undefined);
    const noi = mockLogs.create.mock.calls.at(-1)?.[0]?.noiDung ?? '';
    expect(noi).toContain('TU CHOI');
    expect(noi).toContain('nghỉ việc 09/2026');
  });

  it('"tạm nghỉ" thì VẪN vào được — chỉ đóng mã mới khoá', async () => {
    // Tạm nghỉ là ghi chú của CSKH, không phải lệnh khoá. Chặn luôn cả nó thì
    // một lần bấm nhầm trên màn trạng thái là khách mất đường đăng nhập.
    timKhach.mockResolvedValue(taiKhoan({ TrangThai: 'tam-nghi' }));
    await expect(
      service.login({ username: 'HP3028', password: 'dung' } as any),
    ).resolves.toBeDefined();
  });

  it('chưa ai đặt trạng thái thì vào bình thường', async () => {
    timKhach.mockResolvedValue(taiKhoan({ TrangThai: null }));
    await expect(
      service.login({ username: 'HP3028', password: 'dung' } as any),
    ).resolves.toBeDefined();
  });

  it('mật khẩu sai thì báo "Invalid credentials", KHÔNG tiết lộ mã đã đóng', async () => {
    // Trả lời khác nhau cho mã-đã-đóng và mã-không-tồn-tại là một đường để dò
    // xem mã nào có thật.
    timKhach.mockResolvedValue(taiKhoan({ TrangThai: 'dong-ma' }));
    await expect(
      service.login({ username: 'KETOANHA', password: 'sai' } as any),
    ).rejects.toThrow('Invalid credentials');
  });
});

describe('AuthService.register — bắt buộc CSKH phụ trách (03/11/2026)', () => {
  let service: AuthService;
  const tao = jest.fn();
  const mockSequelize: any = {
    models: {
      User: class {
        static findOne = jest.fn().mockResolvedValue(null);
        static create = (...a: any[]) => tao(...a);
      },
    },
    query: jest.fn(),
  };
  const yc = (cskhPhuTrach?: string) =>
    ({ username: 'HP9999', password: 'x', email: 'a@b.c', hoTen: 'Khách', cskhPhuTrach }) as any;

  beforeEach(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        QuyenService,
        { provide: 'SEQUELIZE', useValue: mockSequelize },
        { provide: JwtService, useValue: { sign: () => 'the-gia' } },
        { provide: SystemLogsService, useValue: { create: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();
    service = mod.get(AuthService);
  });
  afterEach(() => jest.clearAllMocks());

  it('bỏ trống CSKH thì không tạo', async () => {
    await expect(service.register(yc(''))).rejects.toThrow('Chưa chọn CSKH');
    expect(tao).not.toHaveBeenCalled();
  });

  it('gõ một mã không phải CSKH đang làm thì không tạo', async () => {
    mockSequelize.query.mockResolvedValueOnce([{ n: 0 }]);
    await expect(service.register(yc('KETOANHA'))).rejects.toThrow('không phải CSKH');
    expect(tao).not.toHaveBeenCalled();
  });

  it('CSKH hợp lệ thì ghi vào CSKHPhuTrach', async () => {
    mockSequelize.query.mockResolvedValueOnce([{ n: 1 }]);
    tao.mockResolvedValue({ get: () => 'x' });
    await service.register(yc(' CSKHMAILINH ')).catch(() => undefined);
    expect(tao.mock.calls[0][0].CSKHPhuTrach).toBe('CSKHMAILINH');
  });
});
