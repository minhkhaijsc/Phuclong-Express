import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TaoTaiKhoanService } from './tao-tai-khoan.service';
import { QuyenService } from '../auth/quyen/quyen.service';
import { BO_PHAN, CAP } from '../auth/quyen/bo-phan';

describe('TaoTaiKhoanService.kiemTra', () => {
  // `kiemTra` không chạm CSDL nên dựng với hai phụ thuộc rỗng là đủ.
  const s = new TaoTaiKhoanService(
    { models: { User: {} } } as never,
    {} as never,
  );
  const quyen = new QuyenService();
  const admin = quyen.tinh([BO_PHAN.Admin]);
  const cskh = quyen.tinh([BO_PHAN.CSKH]);
  const khach = quyen.tinh([]);

  describe('bắt buộc chọn khách hay nhân viên', () => {
    it('không chọn thì từ chối', () => {
      expect(() => s.kiemTra({}, admin)).toThrow(BadRequestException);
      expect(() => s.kiemTra({}, admin)).toThrow(/Khách hàng hay Nhân viên/);
    });

    it('giá trị lạ cũng từ chối', () => {
      expect(() => s.kiemTra({ loai: 'ca-hai' as never }, admin)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('ai được tạo gì', () => {
    it('Admin tạo được cả hai', () => {
      expect(s.kiemTra({ loai: 'khach' }, admin).vaiTro).toEqual([]);
      expect(
        s.kiemTra({ loai: 'nhanVien', boPhan: [BO_PHAN.KeToan] }, admin).vaiTro,
      ).toEqual([BO_PHAN.KeToan]);
    });

    it('CSKH tạo được khách', () => {
      expect(s.kiemTra({ loai: 'khach' }, cskh).loai).toBe('khach');
    });

    it('CSKH KHÔNG tạo được nhân viên', () => {
      expect(() =>
        s.kiemTra({ loai: 'nhanVien', boPhan: [BO_PHAN.Kho] }, cskh),
      ).toThrow(/Chỉ Admin được tạo tài khoản nhân viên/);
    });

    it('khách hàng không tạo được tài khoản nào', () => {
      expect(() => s.kiemTra({ loai: 'khach' }, khach)).toThrow(ForbiddenException);
    });
  });

  describe('tài khoản khách', () => {
    it('không nhận bộ phận', () => {
      expect(() => s.kiemTra({ loai: 'khach', boPhan: [BO_PHAN.Kho] }, admin)).toThrow(
        /không gán bộ phận/,
      );
    });

    it('không nhận cấp', () => {
      expect(() => s.kiemTra({ loai: 'khach', cap: [CAP.GiamDoc] }, admin)).toThrow(
        /không gán bộ phận/,
      );
    });
  });

  describe('tài khoản nhân viên', () => {
    it('phải có ít nhất một bộ phận', () => {
      expect(() => s.kiemTra({ loai: 'nhanVien', boPhan: [] }, admin)).toThrow(
        /ít nhất một bộ phận/,
      );
    });

    it('nhận nhiều bộ phận và cấp cùng lúc', () => {
      const r = s.kiemTra(
        { loai: 'nhanVien', boPhan: [BO_PHAN.Kho, BO_PHAN.KhoSG], cap: [CAP.TruongPhong] },
        admin,
      );
      expect(r.vaiTro).toEqual([BO_PHAN.Kho, BO_PHAN.KhoSG, CAP.TruongPhong]);
    });

    it('bỏ trùng lặp', () => {
      const r = s.kiemTra(
        { loai: 'nhanVien', boPhan: [BO_PHAN.Kho, BO_PHAN.Kho] },
        admin,
      );
      expect(r.vaiTro).toEqual([BO_PHAN.Kho]);
    });

    it('cắt khoảng trắng và bỏ ô rỗng', () => {
      const r = s.kiemTra(
        { loai: 'nhanVien', boPhan: [' KeToan ', ''], cap: ['  '] },
        admin,
      );
      expect(r.vaiTro).toEqual([BO_PHAN.KeToan]);
    });

    it('từ chối bộ phận không tồn tại', () => {
      expect(() =>
        s.kiemTra({ loai: 'nhanVien', boPhan: ['GiamDocSale'] }, admin),
      ).toThrow(/không hợp lệ/);
    });

    it('nhắc đúng chỗ khi đặt cấp vào ô bộ phận', () => {
      expect(() =>
        s.kiemTra({ loai: 'nhanVien', boPhan: [CAP.TruongPhong] }, admin),
      ).toThrow(/là cấp, không phải bộ phận/);
    });

    it('nhắc đúng chỗ khi đặt bộ phận vào ô cấp', () => {
      expect(() =>
        s.kiemTra({ loai: 'nhanVien', boPhan: [BO_PHAN.Kho], cap: [BO_PHAN.MKT] }, admin),
      ).toThrow(/Cấp chỉ nhận/);
    });

    it('vai trò cũ không gán được cho người mới', () => {
      // Sale/Order/Kho cũ chỉ để ĐỌC cho tài khoản đang có; tạo mới phải dùng
      // tên bộ phận mới, không thì lại sinh thêm dữ liệu kiểu cũ.
      expect(() => s.kiemTra({ loai: 'nhanVien', boPhan: ['Sale'] }, admin)).toThrow(
        /không hợp lệ/,
      );
    });
  });
});
