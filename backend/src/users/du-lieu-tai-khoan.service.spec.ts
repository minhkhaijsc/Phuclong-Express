import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DuLieuTaiKhoanService } from './du-lieu-tai-khoan.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { BANG_NHAT_KY, COT_THAM_CHIEU } from './du-lieu-tai-khoan';

/**
 * Mỗi phép kiểm ở đây là một cách xoá tài khoản làm hỏng dữ liệu thật.
 * Con số lấy từ CSDL ngày 09/10/2026: KETOANHA, CSKHTHUPHUONG, CSKHNHI, HP3028.
 */
describe('DuLieuTaiKhoanService', () => {
  let service: DuLieuTaiKhoanService;
  const mockLogs = { create: jest.fn().mockResolvedValue(undefined) };

  /** Câu lệnh đã chạy, để soi xem đụng vào bảng nào. */
  let daChay: string[];
  /** Đếm theo "bang.cot" — thứ gì không khai ở đây thì coi là 0. */
  let soDong: Record<string, number>;
  let taiKhoan: any;
  let maCoThat: string[];
  let vaiTro: string[];
  let duNo: number;
  let soAdminKhac: number;

  const mockSequelize: any = {
    query: jest.fn(async (sql: string, opts: any) => {
      daChay.push(sql);
      const r = opts?.replacements ?? {};

      if (/FROM AspNetUsers WHERE Id = :id/.test(sql)) return taiKhoan ? [taiKhoan] : [];
      if (/FROM AspNetUsers WHERE UserName = :ma/.test(sql)) {
        return maCoThat.includes(r.ma) ? [{ UserName: r.ma }] : [];
      }
      if (/JOIN AspNetRoles r ON r\.Id = ur\.RoleId WHERE ur\.UserId/.test(sql)) {
        return vaiTro.map((Name) => ({ Name }));
      }
      if (/WHERE r\.Name = 'Admin' AND ur\.UserId <> :id/.test(sql)) {
        return [{ so: soAdminKhac }];
      }
      if (/^SELECT \(SELECT COUNT/.test(sql.trim())) {
        const o: any = { nhatKy: soDong['tbSystemLogs.NguoiTao'] ?? 0, duNo, lanCuoi: null };
        COT_THAM_CHIEU.forEach((c, i) => (o[`c${i}`] = soDong[`${c.bang}.${c.cot}`] ?? 0));
        return [o];
      }
      if (/^UPDATE /.test(sql.trim())) {
        const m = sql.match(/^UPDATE (\w+) SET (\w+)/);
        return [{ so: soDong[`${m![1]}.${m![2]}`] ?? 0 }];
      }
      if (/^DELETE /.test(sql.trim())) return [{ so: 1 }];
      return [];
    }),
    transaction: jest.fn(async (fn: any) => fn('TX')),
  };

  beforeEach(async () => {
    daChay = [];
    soDong = {};
    vaiTro = [];
    duNo = 0;
    soAdminKhac = 3;
    maCoThat = ['KETOANHUONG', 'HP220', 'CSKHNGA'];
    taiKhoan = { Id: 'id-1', UserName: 'KETOANHA', HoTen: 'Lô Thị Ngọc Hà' };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DuLieuTaiKhoanService,
        { provide: 'SEQUELIZE', useValue: mockSequelize },
        { provide: SystemLogsService, useValue: mockLogs },
      ],
    }).compile();
    service = mod.get(DuLieuTaiKhoanService);
  });

  afterEach(() => jest.clearAllMocks());

  const xoaChuan = {
    xoaTaiKhoan: true,
    lyDo: 'nghỉ việc 09/2026',
    xacNhan: 'KETOANHA',
  };

  // ----------------------------------------------------------------
  describe('kiemKe', () => {
    it('đếm đủ 21 cột, không chỉ ba bảng như bản đầu', async () => {
      // Bản đầu chỉ biết CONGNO / tbTracking / Don_Hang nên CSKHNHI hiện ra
      // "không còn gì", trong khi còn 78.786 dòng tình trạng kiện.
      soDong['tbTinhTrangTracking.NguoiTao'] = 78786;
      soDong['tbTracking.NguoiTao'] = 78783;
      const kq = await service.kiemKe('id-1');
      expect(kq.tongNhap).toBe(157569);
      expect(kq.nhap.map((m) => m.bang)).toContain('tbTinhTrangTracking');
    });

    it('tách hai nhóm: dữ liệu CỦA mã và dấu vết người nhập', async () => {
      soDong['CONGNO.UserName'] = 39;
      soDong['CONGNO.NguoiTao'] = 930;
      const kq = await service.kiemKe('id-1');
      expect(kq.tongKhach).toBe(39);
      expect(kq.tongNhap).toBe(930);
      expect(kq.khach.every((m) => m.cot === 'UserName' || m.cot === 'username')).toBe(true);
    });

    it('bỏ mục bằng 0 và xếp mục nhiều nhất lên đầu', async () => {
      soDong['CONGNO.UserName'] = 11;
      soDong['tbChotKy.UserName'] = 23;
      const kq = await service.kiemKe('id-1');
      expect(kq.khach.map((m) => m.so)).toEqual([23, 11]);
      expect(kq.khach.some((m) => m.so === 0)).toBe(false);
    });

    it('đếm nhật ký RIÊNG, không gộp vào hai nhóm kia', async () => {
      // Nhật ký không bao giờ được chuyển hay xoá; gộp vào tổng thì người đọc
      // tưởng nó cũng sẽ đi theo.
      soDong['tbSystemLogs.NguoiTao'] = 2513;
      const kq = await service.kiemKe('id-1');
      expect(kq.nhatKy).toBe(2513);
      expect(kq.tongKhach + kq.tongNhap).toBe(0);
    });

    it('KHÔNG lọc DaXoa khi đếm — dòng xoá mềm vẫn trỏ vào mã', async () => {
      // Xoá tài khoản thì dòng đã xoá mềm cũng mồ côi theo, nên con số hậu quả
      // phải gồm cả chúng. Câu hỏi "mã này còn dùng không" đã có dư nợ và mốc
      // giao dịch cuối trả lời — hai thứ đó mới lọc DaXoa.
      await service.kiemKe('id-1');
      const dem = daChay.find((s) => /^SELECT \(SELECT COUNT/.test(s.trim()))!;
      expect(dem).toContain('FROM CONGNO WHERE UserName = :u');
      expect(dem).toContain('FROM CONGNO WHERE DaXoa = 0 AND UserName = :u) AS duNo');
    });

    it('trả vai trò để biết là nhân viên hay khách', async () => {
      vaiTro = ['Sale', 'Kho'];
      const kq = await service.kiemKe('id-1');
      expect(kq.laNhanVien).toBe(true);
      expect(kq.vaiTro).toEqual(['Sale', 'Kho']);
    });
  });

  // ----------------------------------------------------------------
  describe('xuLy — chuyển dữ liệu', () => {
    it('chuyển nhóm "khách" thì KHÔNG đụng cột người nhập', async () => {
      soDong['CONGNO.UserName'] = 39;
      soDong['CONGNO.NguoiTao'] = 930;
      await service.xuLy('id-1', { chuyenKhachSang: 'HP220', lyDo: 'gộp mã trùng' }, 'admin');
      const up = daChay.filter((s) => s.startsWith('UPDATE'));
      expect(up.some((s) => /UPDATE CONGNO SET UserName/.test(s))).toBe(true);
      expect(up.some((s) => /SET NguoiTao/.test(s))).toBe(false);
    });

    it('chuyển nhóm "người nhập" thì KHÔNG kéo theo công nợ của khách', async () => {
      // Gộp chung một ô chọn thì một lần bàn giao cho nhân viên mới sẽ chuyển
      // luôn dư nợ của khách sang tài khoản nhân viên đó.
      soDong['CONGNO.NguoiTao'] = 930;
      soDong['DON_HANG.usernamesave'] = 368;
      await service.xuLy('id-1', { chuyenNhapSang: 'KETOANHUONG', lyDo: 'bàn giao' }, 'admin');
      const up = daChay.filter((s) => s.startsWith('UPDATE'));
      expect(up.some((s) => /UPDATE DON_HANG SET usernamesave/.test(s))).toBe(true);
      expect(up.some((s) => /UPDATE CONGNO SET UserName /.test(s))).toBe(false);
    });

    it('chuyển được cả hai nhóm sang HAI mã khác nhau', async () => {
      soDong['CONGNO.UserName'] = 39;
      soDong['CONGNO.NguoiTao'] = 930;
      const kq = await service.xuLy(
        'id-1',
        { chuyenKhachSang: 'HP220', chuyenNhapSang: 'KETOANHUONG', lyDo: 'x' },
        'admin',
      );
      expect(kq.tongDaChuyen).toBe(969);
    });

    it('TUYỆT ĐỐI không đụng nhật ký hệ thống', async () => {
      soDong['tbSystemLogs.NguoiTao'] = 2513;
      await service.xuLy(
        'id-1',
        { ...xoaChuan, chuyenKhachSang: 'HP220', chuyenNhapSang: 'KETOANHUONG' },
        'admin',
      );
      expect(daChay.some((s) => /UPDATE tbSystemLogs|DELETE FROM tbSystemLogs/.test(s))).toBe(false);
      expect(COT_THAM_CHIEU.some((c) => c.bang === BANG_NHAT_KY.bang)).toBe(false);
    });

    it('làm tất cả trong MỘT giao dịch', async () => {
      soDong['CONGNO.UserName'] = 39;
      await service.xuLy('id-1', { chuyenKhachSang: 'HP220', lyDo: 'x' }, 'admin');
      expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
    });

    it('không chọn gì cả thì báo lỗi, không im lặng chạy không', async () => {
      await expect(service.xuLy('id-1', { lyDo: 'x' }, 'admin')).rejects.toThrow(BadRequestException);
    });

    it('bắt buộc ghi lý do', async () => {
      await expect(
        service.xuLy('id-1', { chuyenKhachSang: 'HP220' }, 'admin'),
      ).rejects.toThrow(/lý do/i);
    });

    it('mã nhận phải có thật', async () => {
      await expect(
        service.xuLy('id-1', { chuyenKhachSang: 'KHONG_TON_TAI', lyDo: 'x' }, 'admin'),
      ).rejects.toThrow(/Không có tài khoản nào tên/);
    });

    it('không chuyển sang chính nó', async () => {
      await expect(
        service.xuLy('id-1', { chuyenKhachSang: 'ketoanha', lyDo: 'x' }, 'admin'),
      ).rejects.toThrow(/trùng với mã đang xử lý/);
    });
  });

  // ----------------------------------------------------------------
  describe('xuLy — xoá hẳn', () => {
    it('phải gõ đúng mã mới xoá — chặn lần bấm nhầm dòng', async () => {
      await expect(
        service.xuLy('id-1', { ...xoaChuan, xacNhan: 'KETOANH' }, 'admin'),
      ).rejects.toThrow(/gõ đúng mã/);
    });

    it('không tự xoá chính mình', async () => {
      await expect(service.xuLy('id-1', xoaChuan, 'KETOANHA')).rejects.toThrow(/đang đăng nhập/);
    });

    it('còn nợ mà không chuyển đi thì CHẶN — tiền là của khách', async () => {
      duNo = 3434988;
      await expect(service.xuLy('id-1', xoaChuan, 'admin')).rejects.toThrow(/còn nợ 3\.434\.988đ/);
    });

    it('dư trả trước cũng chặn, và gọi đúng tên', async () => {
      duNo = -14666336;
      await expect(service.xuLy('id-1', xoaChuan, 'admin')).rejects.toThrow(/dư trả trước/);
    });

    it('nợ dưới 1.000đ là bụi làm tròn — không chặn', async () => {
      duNo = 732;
      await expect(service.xuLy('id-1', xoaChuan, 'admin')).resolves.toBeDefined();
    });

    it('chuyển công nợ đi rồi thì xoá được dù trước đó còn nợ', async () => {
      duNo = 3434988;
      const kq = await service.xuLy('id-1', { ...xoaChuan, chuyenKhachSang: 'HP220' }, 'admin');
      expect(kq.daXoaTaiKhoan).toBe(true);
    });

    it('không xoá tài khoản Admin cuối cùng', async () => {
      vaiTro = ['Admin'];
      soAdminKhac = 0;
      await expect(service.xuLy('id-1', xoaChuan, 'admin')).rejects.toThrow(/Admin cuối cùng/);
    });

    it('còn Admin khác thì xoá được', async () => {
      vaiTro = ['Admin'];
      soAdminKhac = 2;
      await expect(service.xuLy('id-1', xoaChuan, 'admin')).resolves.toBeDefined();
    });

    it('dọn luôn vai trò / claim / đăng nhập, không để lại mồ côi', async () => {
      // AspNetUsers không có khoá ngoại nào trỏ về, nên CSDL không tự dọn.
      const kq = await service.xuLy('id-1', xoaChuan, 'admin');
      for (const b of ['AspNetUserRoles', 'AspNetUserClaims', 'AspNetUserLogins']) {
        expect(daChay.some((s) => s.startsWith(`DELETE FROM ${b}`))).toBe(true);
      }
      expect(kq.daDonBangPhu).toBe(3);
      expect(daChay.some((s) => /DELETE FROM AspNetUsers WHERE Id = :id/.test(s))).toBe(true);
    });

    it('nói thẳng còn BAO NHIÊU dòng bị bỏ lại mồ côi', async () => {
      soDong['CONGNO.UserName'] = 11;
      soDong['DON_HANG.username'] = 5;
      soDong['tbChotKy.UserName'] = 23;
      const kq = await service.xuLy('id-1', xoaChuan, 'admin');
      expect(kq.conMoCoi).toBe(39);
      expect(kq.tongDaChuyen).toBe(0);
    });

    it('chuyển hết thì không còn dòng nào mồ côi', async () => {
      soDong['CONGNO.UserName'] = 11;
      soDong['CONGNO.NguoiTao'] = 930;
      const kq = await service.xuLy(
        'id-1',
        { ...xoaChuan, chuyenKhachSang: 'HP220', chuyenNhapSang: 'KETOANHUONG' },
        'admin',
      );
      expect(kq.conMoCoi).toBe(0);
    });

    it('ghi nhật ký đủ để dựng lại việc đã làm', async () => {
      soDong['CONGNO.UserName'] = 11;
      await service.xuLy('id-1', { ...xoaChuan, chuyenNhapSang: 'KETOANHUONG' }, 'admin');
      const l = mockLogs.create.mock.calls.at(-1)![0];
      expect(l.nguon).toBe('Users:ChuyenVaXoaTaiKhoan');
      expect(l.nguoiTao).toBe('admin');
      // Ghi bằng TÊN MÃ: sau khi xoá thì Id không tra ngược được nữa.
      expect(l.noiDung).toContain('UserName: KETOANHA');
      expect(l.noiDung).toContain('ChuyenDauViecSang: KETOANHUONG');
      expect(l.noiDung).toContain('ChuyenDuLieuKhachSang: (khong chuyen)');
      expect(l.noiDung).toContain('SoDongBoLaiMoCoi: 11');
      expect(l.noiDung).toContain('LyDo: nghỉ việc 09/2026');
    });

    it('chỉ chuyển mà không xoá thì nhật ký ghi là "Chinh sua"', async () => {
      await service.xuLy('id-1', { chuyenNhapSang: 'KETOANHUONG', lyDo: 'bàn giao' }, 'admin');
      const l = mockLogs.create.mock.calls.at(-1)![0];
      expect(l.nguon).toBe('Users:ChuyenDuLieuTaiKhoan');
      expect(l.hanhDong).toBe('Chinh sua');
    });
  });

  // ----------------------------------------------------------------
  describe('bản đồ cột tham chiếu', () => {
    it('không có tên bảng/cột nào lạ — chúng ghép thẳng vào SQL', async () => {
      for (const c of COT_THAM_CHIEU) {
        expect(c.bang).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
        expect(c.cot).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
      }
    });

    it('mỗi cặp bảng+cột chỉ khai một lần', async () => {
      const khoa = COT_THAM_CHIEU.map((c) => `${c.bang}.${c.cot}`);
      expect(new Set(khoa).size).toBe(khoa.length);
    });

    it('nhóm "khách" chỉ gồm cột chỉ CHỦ dữ liệu', async () => {
      for (const c of COT_THAM_CHIEU.filter((x) => x.nhom === 'khach')) {
        expect(c.cot.toLowerCase()).toBe('username');
      }
    });
  });

  describe('đổi mã khách (03/11/2026)', () => {
    beforeEach(() => {
      taiKhoan = { Id: 'id-9', UserName: 'HP3028', HoTen: 'Khách' };
    });

    it('đổi mọi cột trong bản đồ + chính UserName, trong một giao dịch', async () => {
      soDong = { 'CONGNO.UserName': 120, 'DON_HANG.username': 30, 'tbHopDong.UserName': 1, 'AspNetUsers.UserName': 1 };
      const kq = await service.doiMa('id-9', { maMoi: 'HP3028A', lyDo: 'khách xin đổi' }, 'admin');

      expect(mockSequelize.transaction).toHaveBeenCalled();
      for (const c of COT_THAM_CHIEU) {
        expect(daChay.some((q) => q.startsWith(`UPDATE ${c.bang} SET ${c.cot} = :moi`))).toBe(true);
      }
      expect(daChay.some((q) => /UPDATE AspNetUsers SET UserName = :moi WHERE Id = :id/.test(q))).toBe(true);
      expect(kq.tongDaDoi).toBe(151);
      expect(kq.maCu).toBe('HP3028');
    });

    it('không đụng nhật ký hệ thống', async () => {
      await service.doiMa('id-9', { maMoi: 'HP3028A', lyDo: 'x' }, 'admin');
      expect(daChay.some((q) => /UPDATE tbSystemLogs/.test(q))).toBe(false);
    });

    it('từ chối mã đã có người dùng', async () => {
      await expect(service.doiMa('id-9', { maMoi: 'HP220', lyDo: 'x' }, 'admin')).rejects.toThrow('đã có tài khoản');
    });

    it('từ chối mã có dấu cách / có dấu', async () => {
      await expect(service.doiMa('id-9', { maMoi: 'HP 30', lyDo: 'x' }, 'admin')).rejects.toThrow(BadRequestException);
      await expect(service.doiMa('id-9', { maMoi: 'HPĐ30', lyDo: 'x' }, 'admin')).rejects.toThrow(BadRequestException);
    });

    it('bắt ghi lý do', async () => {
      await expect(service.doiMa('id-9', { maMoi: 'HP3028A', lyDo: ' ' }, 'admin')).rejects.toThrow('lý do');
    });

    it('không đổi mã nhân viên', async () => {
      vaiTro = ['CSKH'];
      await expect(service.doiMa('id-9', { maMoi: 'CSKHMOI', lyDo: 'x' }, 'admin')).rejects.toThrow('KHÁCH');
      expect(daChay.some((q) => /^UPDATE/.test(q.trim()))).toBe(false);
    });
  });
});
