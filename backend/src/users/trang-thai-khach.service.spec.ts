import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TrangThaiKhachService, NGUONG_CON_NO } from './trang-thai-khach.service';
import { SystemLogsService } from '../system-logs/system-logs.service';

/**
 * Các phép kiểm ở đây bám vào hai thứ dễ sai nhất của tính năng này:
 * phân quyền/ghi nhật ký khi đổi trạng thái, và chuyện "không xoá khách".
 */
describe('TrangThaiKhachService', () => {
  let service: TrangThaiKhachService;
  const mockSequelize = { query: jest.fn() };
  const mockLogs = { create: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrangThaiKhachService,
        { provide: 'SEQUELIZE', useValue: mockSequelize },
        { provide: SystemLogsService, useValue: mockLogs },
      ],
    }).compile();
    service = module.get<TrangThaiKhachService>(TrangThaiKhachService);
  });

  afterEach(() => jest.clearAllMocks());

  const DONG_KHACH = {
    Id: 'abc-123',
    UserName: 'HP2730',
    HoTen: 'Nguyễn Thị A',
    PhoneNumber: '0912345678',
    Email: 'a@x.com',
    TrangThai: null,
    NgayDoiTrangThai: null,
    NguoiDoiTrangThai: null,
    LyDoTrangThai: null,
    lanCuoi: new Date('2026-07-07T00:00:00Z'),
    duNo: 732,
    nhomTuDong: 'nghi-3-6',
  };

  describe('mốc thời gian', () => {
    it('truyền ngày đã tính sẵn, KHÔNG để lại chữ ":" trong câu lệnh', async () => {
      // Lỗi thật đã gặp: viết `DATEADD(month, -:nguong, GETDATE())` thì
      // Sequelize không thay tham số (dấu trừ ngay trước dấu hai chấm) và
      // SQL Server trả "Incorrect syntax near ':'".
      mockSequelize.query.mockResolvedValue([{}]);
      await service.tongHop();

      const [sql, opts] = mockSequelize.query.mock.calls[0];
      expect(sql).not.toContain('DATEADD(month, -:');
      for (const k of ['moc3', 'moc6', 'moc12']) {
        expect(opts.replacements[k]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      }
    });

    it('mốc 3 tháng mới hơn mốc 6 tháng, mốc 6 mới hơn mốc 12', async () => {
      mockSequelize.query.mockResolvedValue([{}]);
      await service.tongHop();
      const { moc3, moc6, moc12 } = mockSequelize.query.mock.calls[0][1].replacements;
      expect(moc3 > moc6).toBe(true);
      expect(moc6 > moc12).toBe(true);
    });
  });

  describe('tongHop', () => {
    it('chỉ tính "còn nợ" từ 1.000đ trở lên', async () => {
      // 33/40 mã quá hạn chỉ nợ dưới 1.000đ — bụi làm tròn của cột float.
      // Đếm cả vào thì báo CSKH đi thu 732 đồng.
      mockSequelize.query.mockResolvedValue([{ tongKhach: 938, canDongMa: 363 }]);
      await service.tongHop();
      const [sql, opts] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain('duNo >= :nguongNo');
      expect(sql).not.toContain('duNo > 0');
      expect(opts.replacements.nguongNo).toBe(NGUONG_CON_NO);
    });

    it('thiếu dòng kết quả thì mọi số về 0', async () => {
      mockSequelize.query.mockResolvedValue([]);
      const kq = await service.tongHop();
      expect(kq.tongKhach).toBe(0);
      expect(kq.canDongMa).toBe(0);
      expect(kq.tienConTreo).toBe(0);
    });
  });

  describe('danhSach', () => {
    it('chỉ nhân viên bị loại, khách là tài khoản KHÔNG có vai trò nào', async () => {
      mockSequelize.query.mockResolvedValue([]);
      await service.danhSach({});
      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain('NOT EXISTS (SELECT 1 FROM AspNetUserRoles');
    });

    it('nhưng MỞ một tài khoản cụ thể thì KHÔNG lọc vai trò', async () => {
      // Lọc ở đây là bít đường: nhân viên nghỉ việc (CSKHTHUPHUONG có vai trò
      // Sale + Kho) sẽ trả "không tìm thấy", và cách duy nhất còn lại để dọn
      // tài khoản đó là xoá cứng — đúng thứ phần này sinh ra để chặn.
      mockSequelize.query.mockResolvedValue([DONG_KHACH]);
      await service.motKhach('abc-123');
      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).not.toContain('NOT EXISTS (SELECT 1 FROM AspNetUserRoles');
      expect(sql).toContain('laNhanVien');
    });

    it('đổi trạng thái được cho tài khoản nhân viên', async () => {
      mockSequelize.query.mockResolvedValue([{ ...DONG_KHACH, laNhanVien: 1 }]);
      const kq = await service.dat('abc-123', 'dong-ma', 'nghỉ việc 09/2026', 'admin');
      expect(kq.laNhanVien).toBe(true);
      const coUpdate = mockSequelize.query.mock.calls.some(([q]) => String(q).includes('UPDATE'));
      expect(coUpdate).toBe(true);
    });

    it('nhóm lạ thì KHÔNG lọc gì, và không ghép chuỗi vào SQL', async () => {
      mockSequelize.query.mockResolvedValue([]);
      await service.danhSach({ nhom: "'; DROP TABLE CONGNO--" });
      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).not.toContain('DROP TABLE');
      expect(sql).toContain('WHERE 1 = 1');
    });

    it('nhóm can-dong-ma bỏ qua mã đã đóng', async () => {
      mockSequelize.query.mockResolvedValue([]);
      await service.danhSach({ nhom: 'can-dong-ma' });
      const [sql] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain("ISNULL(TrangThai,'') <> 'dong-ma'");
    });

    it('xếp mã VỪA quá hạn lên đầu', async () => {
      // Cố ý ngược "cũ nhất trước": 217 mã nghỉ hơn một năm gọi lại gần như vô
      // vọng, để chúng lên đầu là chặn mất 54 mã vừa chớm nghỉ còn kéo được.
      mockSequelize.query.mockResolvedValue([]);
      await service.danhSach({});
      const sqlDanhSach = mockSequelize.query.mock.calls[1][0];
      expect(sqlDanhSach).toContain('lanCuoi DESC');
    });

    it('chặn limit để một lệnh gọi không kéo cả 938 khách × nhiều trang', async () => {
      mockSequelize.query.mockResolvedValue([]);
      const kq = await service.danhSach({ limit: 100000 });
      expect(kq.limit).toBe(500);
    });

    it('tính số ngày nghỉ và map đúng tên trường', async () => {
      mockSequelize.query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([DONG_KHACH]);
      const kq = await service.danhSach({ nhom: 'can-dong-ma' });

      expect(kq.total).toBe(1);
      expect(kq.data[0].userName).toBe('HP2730');
      expect(kq.data[0].nhomTuDong).toBe('nghi-3-6');
      expect(kq.data[0].trangThai).toBeNull();
      expect(kq.data[0].soNgayNghi).toBeGreaterThan(80);
    });

    it('khách chưa từng giao dịch thì soNgayNghi là null, không phải một số vô nghĩa', async () => {
      mockSequelize.query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ ...DONG_KHACH, lanCuoi: null, nhomTuDong: 'chua-giao-dich' }]);
      const kq = await service.danhSach({});
      expect(kq.data[0].soNgayNghi).toBeNull();
      expect(kq.data[0].lanGiaoDichCuoi).toBeNull();
    });
  });

  describe('dat', () => {
    it('từ chối trạng thái không có trong danh sách', async () => {
      await expect(service.dat('abc-123', 'xoa-luon', undefined, 'admin')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockSequelize.query).not.toHaveBeenCalled();
    });

    it('ĐÓNG MÃ phải có lý do', async () => {
      await expect(service.dat('abc-123', 'dong-ma', '   ', 'admin')).rejects.toThrow(
        BadRequestException,
      );
      // Chưa chạm tới CSDL — không được ghi nửa vời rồi mới báo lỗi.
      expect(mockSequelize.query).not.toHaveBeenCalled();
    });

    it('tạm nghỉ thì không bắt buộc lý do', async () => {
      mockSequelize.query.mockResolvedValue([DONG_KHACH]);
      await expect(service.dat('abc-123', 'tam-nghi', undefined, 'CSKHNGA')).resolves.toBeDefined();
    });

    it('ghi nhật ký kèm trạng thái CŨ, dư nợ và người làm', async () => {
      mockSequelize.query.mockResolvedValue([DONG_KHACH]);
      await service.dat('abc-123', 'dong-ma', 'Khách chuyển sang bên khác', 'CSKHNGA');

      expect(mockLogs.create).toHaveBeenCalledTimes(1);
      const g = mockLogs.create.mock.calls[0][0];
      expect(g.nguoiTao).toBe('CSKHNGA');
      expect(g.nguon).toBe('Users:DoiTrangThaiKhach');
      expect(g.noiDung).toContain('HP2730');
      expect(g.noiDung).toContain('TrangThaiCu: (chưa đặt)');
      expect(g.noiDung).toContain('TrangThaiMoi: dong-ma');
      expect(g.noiDung).toContain('DuNo: 732');
      expect(g.noiDung).toContain('Khách chuyển sang bên khác');
    });

    it('cắt lý do ở 500 ký tự cho khớp độ rộng cột', async () => {
      mockSequelize.query.mockResolvedValue([DONG_KHACH]);
      await service.dat('abc-123', 'dong-ma', 'x'.repeat(900), 'admin');
      const lenh = mockSequelize.query.mock.calls.find(([s]) => String(s).includes('UPDATE'));
      expect(lenh[1].replacements.ly).toHaveLength(500);
    });

    it('không tìm thấy khách thì báo 404 và KHÔNG ghi gì', async () => {
      mockSequelize.query.mockResolvedValue([]);
      await expect(service.dat('khong-co', 'tam-nghi', undefined, 'admin')).rejects.toThrow(
        NotFoundException,
      );
      const coUpdate = mockSequelize.query.mock.calls.some(([s]) => String(s).includes('UPDATE'));
      expect(coUpdate).toBe(false);
    });

    it('nhật ký hỏng KHÔNG làm hỏng việc đổi trạng thái', async () => {
      // Đổi trạng thái là việc chính; ghi nhật ký là việc phụ.
      mockSequelize.query.mockResolvedValue([DONG_KHACH]);
      mockLogs.create.mockRejectedValueOnce(new Error('bảng log đầy'));
      await expect(service.dat('abc-123', 'tam-nghi', undefined, 'admin')).resolves.toBeDefined();
    });
  });

  describe('raSoatXoa — chốt chặn "nghỉ thì đóng mã, không xoá"', () => {
    const dong = (o: Record<string, number>) =>
      mockSequelize.query.mockResolvedValue([
        {
          laNhanVien: 0,
          khachCongNo: 0,
          khachTracking: 0,
          khachDonHang: 0,
          taoCongNo: 0,
          taoTracking: 0,
          taoDonHang: 0,
          duNo: 0,
          ...o,
        },
      ]);

    it('đếm dòng MANG TÊN mã — cả ba nguồn', async () => {
      dong({ khachCongNo: 526, khachTracking: 379, duNo: -14666335.55 });
      const kq = await service.raSoatXoa('HP3028');
      expect(kq.chan).toBe(true);
      expect(kq.laKhach).toEqual({ congNo: 526, tracking: 379, donHang: 0, tong: 905 });
      expect(kq.duNo).toBeCloseTo(-14666335.55, 2);
    });

    it('chặn cả tài khoản sạch tên mình nhưng ĐÃ TẠO ra dữ liệu', async () => {
      // CSKHNHI: 0 dòng mang tên nó, nhưng là người nhập 78.783 kiện hàng. Bản
      // đầu chỉ đếm nhóm trên nên tài khoản này xoá trôi, kéo theo 78.783 dòng
      // mất tên người nhập.
      dong({ laNhanVien: 1, taoCongNo: 72, taoTracking: 78783, taoDonHang: 1 });
      const kq = await service.raSoatXoa('CSKHNHI');
      expect(kq.chan).toBe(true);
      expect(kq.laKhach.tong).toBe(0);
      expect(kq.daTao).toEqual({ congNo: 72, tracking: 78783, donHang: 1, tong: 78856 });
      expect(kq.laNhanVien).toBe(true);
    });

    it('chỉ có đơn mua hộ cũng là có dữ liệu', async () => {
      dong({ khachDonHang: 4 });
      expect((await service.raSoatXoa('AI_DO')).chan).toBe(true);
    });

    it('sạch CẢ SÁU nguồn thì mới cho xoá', async () => {
      dong({});
      const kq = await service.raSoatXoa('TRONG');
      expect(kq.chan).toBe(false);
      expect(kq.laKhach.tong + kq.daTao.tong).toBe(0);
    });

    it('không có dòng trả về thì coi là sạch, không ra NaN', async () => {
      mockSequelize.query.mockResolvedValue([]);
      const kq = await service.raSoatXoa('KHONG_CO');
      expect(kq.chan).toBe(false);
      expect(Number.isNaN(kq.duNo)).toBe(false);
    });
  });
});
