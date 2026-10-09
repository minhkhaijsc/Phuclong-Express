import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TrangThaiKhachService, RaSoatXoa } from './trang-thai-khach.service';
import { DuLieuTaiKhoanService } from './du-lieu-tai-khoan.service';

/**
 * Câu TỪ CHỐI XOÁ chính là thứ người dùng nhìn thấy, nên nó được kiểm như một
 * sản phẩm, không phải như một dòng chữ phụ.
 *
 * Bối cảnh: ngày 09/10/2026 admin không xoá được hai tài khoản kế toán và chỉ
 * thấy "Xóa thất bại". Bản chặn đầu tiên gọi mọi tài khoản là "khách", chỉ đếm
 * dòng mang tên mã, và đẩy người dùng sang màn nhắc đóng mã — nơi tài khoản
 * nhân viên không bao giờ xuất hiện. Ba lỗi đó đều nằm trong câu trả về.
 *
 * Số liệu lấy từ CSDL thật: KETOANHA, CSKHTHUPHUONG, CSKHNHI, HP3028.
 */
describe('UsersController — chặn xoá tài khoản còn dữ liệu', () => {
  let controller: UsersController;
  const usersService = { findByStringId: jest.fn(), remove: jest.fn() };
  const trangThai = { raSoatXoa: jest.fn() };
  const req = { user: { username: 'admin', roles: ['Admin'] } };

  const raSoat = (o: Partial<RaSoatXoa> = {}): RaSoatXoa => ({
    chan: true,
    laNhanVien: false,
    laKhach: { congNo: 0, tracking: 0, donHang: 0, tong: 0 },
    daTao: { congNo: 0, tracking: 0, donHang: 0, tong: 0 },
    duNo: 0,
    ...o,
  });

  const xoa = async (u: Record<string, unknown>, rs: RaSoatXoa): Promise<string> => {
    usersService.findByStringId.mockResolvedValue(u);
    trangThai.raSoatXoa.mockResolvedValue(rs);
    try {
      await controller.remove('id-1', req);
      return '';
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      return (e as BadRequestException).message;
    }
  };

  beforeEach(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: TrangThaiKhachService, useValue: trangThai },
        // Đường DELETE không dùng tới nó, nhưng controller vẫn nhận ở hàm dựng.
        { provide: DuLieuTaiKhoanService, useValue: {} },
      ],
    }).compile();
    controller = mod.get(UsersController);
  });

  afterEach(() => jest.clearAllMocks());

  it('gọi đúng tên: tài khoản NHÂN VIÊN, không gọi là khách', async () => {
    const msg = await xoa(
      { UserName: 'KETOANHA', HoTen: 'Lô Thị Ngọc Hà' },
      raSoat({
        laNhanVien: true,
        laKhach: { congNo: 11, tracking: 0, donHang: 5, tong: 16 },
      }),
    );
    expect(msg).toContain('tài khoản nhân viên KETOANHA (Lô Thị Ngọc Hà)');
    expect(msg).not.toContain('mã khách');
  });

  it('chỉ kể nguồn CÓ số, không rải "0 kiện hàng" vào câu', async () => {
    const msg = await xoa(
      { UserName: 'KETOANHA', HoTen: 'Lô Thị Ngọc Hà' },
      raSoat({ laNhanVien: true, laKhach: { congNo: 11, tracking: 0, donHang: 5, tong: 16 } }),
    );
    expect(msg).toContain('11 dòng công nợ, 5 đơn mua hộ');
    expect(msg).not.toContain('kiện hàng');
  });

  it('nói rõ hai kiểu dính dữ liệu: mang tên mã, và là người nhập', async () => {
    const msg = await xoa(
      { UserName: 'CSKHTHUPHUONG', HoTen: 'Phạm Thị Thu Phương' },
      raSoat({
        laNhanVien: true,
        laKhach: { congNo: 39, tracking: 0, donHang: 35, tong: 74 },
        daTao: { congNo: 930, tracking: 0, donHang: 368, tong: 1298 },
        duNo: 3434988,
      }),
    );
    expect(msg).toContain('của chính mã này');
    expect(msg).toContain('là người nhập 930 dòng công nợ, 368 đơn mua hộ');
  });

  it('nêu số tiền còn nợ — lý do duy nhất không dọn được về sau', async () => {
    const msg = await xoa(
      { UserName: 'CSKHTHUPHUONG' },
      raSoat({ laKhach: { congNo: 39, tracking: 0, donHang: 35, tong: 74 }, duNo: 3434988 }),
    );
    expect(msg).toContain('còn nợ 3.434.988đ');
  });

  it('khách trả trước thì nói là dư, không nói là nợ âm', async () => {
    const msg = await xoa(
      { UserName: 'HP3028' },
      raSoat({ laKhach: { congNo: 526, tracking: 379, donHang: 0, tong: 905 }, duNo: -14666335.55 }),
    );
    expect(msg).toContain('dư trả trước');
    expect(msg).not.toContain('còn nợ');
  });

  it('bụi làm tròn dưới 1.000đ thì KHÔNG nhắc tới tiền', async () => {
    // Có mã nợ đúng 732đ. Đưa vào câu là mời người ta đi thu 732 đồng.
    const msg = await xoa(
      { UserName: 'HP2730' },
      raSoat({ laKhach: { congNo: 3, tracking: 0, donHang: 0, tong: 3 }, duNo: 732 }),
    );
    expect(msg).not.toContain('732');
  });

  it('chỉ đường cho nhân viên: đóng mã là khoá đăng nhập', async () => {
    const msg = await xoa(
      { UserName: 'CSKHNHI' },
      raSoat({ laNhanVien: true, daTao: { congNo: 72, tracking: 78783, donHang: 1, tong: 78856 } }),
    );
    expect(msg).toContain('78.783 kiện hàng');
    expect(msg).toContain('không đăng nhập được nữa');
    // Không đẩy nhân viên sang màn nhắc đóng mã của CSKH — họ không có ở đó.
    expect(msg).not.toContain('Khách ngừng giao dịch');
  });

  it('chỉ đường cho khách: đóng mã thay vì xoá', async () => {
    const msg = await xoa(
      { UserName: 'HP3028' },
      raSoat({ laKhach: { congNo: 526, tracking: 379, donHang: 0, tong: 905 } }),
    );
    expect(msg).toContain('mã khách HP3028');
    expect(msg).toContain('Khách ngừng giao dịch');
  });

  it('sạch hết thì XOÁ THẬT, không chặn oan', async () => {
    usersService.findByStringId.mockResolvedValue({ UserName: 'KT_THUPHUONG' });
    trangThai.raSoatXoa.mockResolvedValue(raSoat({ chan: false }));
    await controller.remove('id-1', req);
    expect(usersService.remove).toHaveBeenCalledWith('id-1', 'admin');
  });
});
