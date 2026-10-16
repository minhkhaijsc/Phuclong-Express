import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { QuyenGuard } from './quyen.guard';
import { QuyenService } from '../quyen/quyen.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { MIEN_KEY, QUYEN_KEY, QUYEN_MOT_KEY } from '../quyen/quyen.decorator';
import { BO_PHAN } from '../quyen/bo-phan';

describe('QuyenGuard', () => {
  /**
   * Reflector giả: trả siêu dữ liệu theo khoá, đúng cách
   * `getAllAndOverride` dùng — không cần dựng cả Nest.
   */
  const dungGuard = (meta: Record<string, unknown>) => {
    const reflector = {
      getAllAndOverride: (key: string) => meta[key],
    } as unknown as Reflector;
    return new QuyenGuard(reflector, new QuyenService());
  };

  const boiCanh = (method: string, vaiTro: string[] | null) => {
    const req: any = { method, user: vaiTro === null ? undefined : { roles: vaiTro } };
    return {
      req,
      ctx: {
        getHandler: () => function h() {},
        getClass: () => class C {},
        switchToHttp: () => ({ getRequest: () => req }),
      } as any,
    };
  };

  it('route @Public đi qua, không cần token', () => {
    const g = dungGuard({ [IS_PUBLIC_KEY]: true });
    const { ctx } = boiCanh('GET', null);
    expect(g.canActivate(ctx)).toBe(true);
  });

  describe('suy quyền từ phương thức HTTP', () => {
    // MKT là bộ phận "xem all, không được edit" — dùng làm ví dụ cho ranh giới
    // xem/sửa. KHÔNG dùng Kho hay CSKH: hai bộ phận đó sửa được Mua hàng giúp.
    it('GET cần `xem`', () => {
      const g = dungGuard({ [MIEN_KEY]: 'muaHang' });
      expect(g.canActivate(boiCanh('GET', [BO_PHAN.MKT]).ctx)).toBe(true);
    });

    it('POST cần `sua` — MKT bị chặn', () => {
      const g = dungGuard({ [MIEN_KEY]: 'muaHang' });
      expect(() => g.canActivate(boiCanh('POST', [BO_PHAN.MKT]).ctx)).toThrow(
        ForbiddenException,
      );
    });

    for (const m of ['PUT', 'PATCH', 'DELETE']) {
      it(`${m} cũng cần \`sua\``, () => {
        const g = dungGuard({ [MIEN_KEY]: 'muaHang' });
        expect(() => g.canActivate(boiCanh(m, [BO_PHAN.VanChuyen]).ctx)).toThrow(
          ForbiddenException,
        );
      });
    }

    it('HEAD tính là đọc', () => {
      const g = dungGuard({ [MIEN_KEY]: 'muaHang' });
      expect(g.canActivate(boiCanh('HEAD', [BO_PHAN.MKT]).ctx)).toBe(true);
    });
  });

  describe('@Quyen ghi đè suy luận theo HTTP', () => {
    it('POST /orders/list vẫn chỉ cần `xem`', () => {
      // Không có dòng này thì CSKH và Kho mở trang Mua hàng giúp là 403, vì
      // danh sách đơn nạp bằng POST.
      const g = dungGuard({ [QUYEN_KEY]: ['muaHang.xem'], [MIEN_KEY]: 'muaHang' });
      expect(g.canActivate(boiCanh('POST', [BO_PHAN.Kho]).ctx)).toBe(true);
      expect(g.canActivate(boiCanh('POST', [BO_PHAN.CSKH]).ctx)).toBe(true);
    });

    it('cần TẤT CẢ mã khi @Quyen có nhiều mã', () => {
      const g = dungGuard({ [QUYEN_KEY]: ['taiKhoan.sua', 'quanLyRole'] });
      // CSKH có taiKhoan.sua nhưng không có quanLyRole.
      expect(() => g.canActivate(boiCanh('POST', [BO_PHAN.CSKH]).ctx)).toThrow(
        /quản lý vai trò/,
      );
      expect(g.canActivate(boiCanh('POST', [BO_PHAN.Admin]).ctx)).toBe(true);
    });
  });

  describe('đóng mặc định', () => {
    it('route không nhãn thì bị chặn, kể cả Admin', () => {
      const g = dungGuard({});
      expect(() => g.canActivate(boiCanh('GET', [BO_PHAN.Admin]).ctx)).toThrow(
        /chưa được gắn nhãn phân quyền/,
      );
    });
  });

  describe('khách hàng', () => {
    it('đặt đơn được', () => {
      const g = dungGuard({ [MIEN_KEY]: 'muaHang' });
      expect(g.canActivate(boiCanh('POST', []).ctx)).toBe(true);
    });

    it('không vào được miền tài khoản', () => {
      const g = dungGuard({ [MIEN_KEY]: 'taiKhoan' });
      expect(() => g.canActivate(boiCanh('GET', []).ctx)).toThrow(/Khách hàng/);
    });

    it('không duyệt được công nợ', () => {
      const g = dungGuard({ [QUYEN_KEY]: ['duyetCongNo'] });
      expect(() => g.canActivate(boiCanh('POST', []).ctx)).toThrow(/duyệt công nợ/);
    });
  });

  it('gắn quyền đã tính vào request để controller dùng lại', () => {
    const g = dungGuard({ [MIEN_KEY]: 'rieng' });
    const { ctx, req } = boiCanh('GET', [BO_PHAN.CSKH]);
    g.canActivate(ctx);
    expect(req.quyen.laKhach).toBe(false);
    expect(req.quyen.boPhan).toEqual([BO_PHAN.CSKH]);
  });

  it('thiếu req.user thì coi như khách, không nổ', () => {
    const g = dungGuard({ [MIEN_KEY]: 'taiKhoan' });
    expect(() => g.canActivate(boiCanh('GET', null).ctx)).toThrow(ForbiddenException);
  });

  it('thông báo lỗi nói rõ bộ phận nào thiếu quyền gì', () => {
    const g = dungGuard({ [MIEN_KEY]: 'congNo' });
    expect(() => g.canActivate(boiCanh('POST', [BO_PHAN.MKT]).ctx)).toThrow(
      'MKT không có quyền sửa Quản lý công nợ.',
    );
  });

  /**
   * `@QuyenMot` — cần MỘT trong các mã.
   *
   * Dựng đúng ca thật đang dùng nó: `GET /debt-reports/users`, ô chọn mã khách,
   * gắn `baoCao.xem HOẶC congNo.sua`. Lỗi 16/10/2026: tài khoản KHOTHUYANH ghi
   * công nợ mà ô chọn mã khách trống vì đường này nằm dưới nhãn `baoCao`.
   */
  describe('@QuyenMot — một trong các mã là đủ', () => {
    const O_CHON_MA_KHACH = {
      [MIEN_KEY]: 'baoCao',
      [QUYEN_MOT_KEY]: ['baoCao.xem', 'congNo.sua'],
    };

    it('Kho qua bằng `congNo.sua` dù không có `baoCao`', () => {
      const g = dungGuard(O_CHON_MA_KHACH);
      const { ctx, req } = boiCanh('GET', [BO_PHAN.Kho]);
      expect(g.canActivate(ctx)).toBe(true);
      expect(req.quyen.quyen).not.toContain('baoCao.xem');
    });

    it('Kho SG cũng vậy', () => {
      const g = dungGuard(O_CHON_MA_KHACH);
      expect(g.canActivate(boiCanh('GET', [BO_PHAN.KhoSG]).ctx)).toBe(true);
    });

    it('MKT qua bằng `baoCao.xem` dù không có `congNo.sua`', () => {
      const g = dungGuard(O_CHON_MA_KHACH);
      const { ctx, req } = boiCanh('GET', [BO_PHAN.MKT]);
      expect(g.canActivate(ctx)).toBe(true);
      expect(req.quyen.quyen).not.toContain('congNo.sua');
    });

    for (const bp of [BO_PHAN.Admin, BO_PHAN.CSKH, BO_PHAN.MuaHang, BO_PHAN.KeToan, BO_PHAN.VanChuyen]) {
      it(`${bp} vẫn qua`, () => {
        const g = dungGuard(O_CHON_MA_KHACH);
        expect(g.canActivate(boiCanh('GET', [bp]).ctx)).toBe(true);
      });
    }

    it('KHÁCH HÀNG bị chặn — không được đọc tên đăng nhập của cả nghìn tài khoản', () => {
      // Khách có `congNo.xem` nhưng không có `congNo.sua`, cũng không có `baoCao`.
      const g = dungGuard(O_CHON_MA_KHACH);
      expect(() => g.canActivate(boiCanh('GET', []).ctx)).toThrow(ForbiddenException);
    });

    it('ghi đè `@MienQuyen` của lớp: không rơi về `baoCao.xem`', () => {
      const g = dungGuard(O_CHON_MA_KHACH);
      // Kho sẽ trượt nếu guard vẫn hỏi nhãn miền của lớp.
      expect(g.canActivate(boiCanh('GET', [BO_PHAN.Kho]).ctx)).toBe(true);
    });

    it('ghi đè cả `@Quyen` của lớp', () => {
      const g = dungGuard({ [QUYEN_KEY]: ['quanLyRole'], [QUYEN_MOT_KEY]: ['congNo.sua'] });
      expect(g.canActivate(boiCanh('GET', [BO_PHAN.Kho]).ctx)).toBe(true);
    });

    it('thiếu cả hai thì báo "hoặc", không báo "và"', () => {
      const g = dungGuard(O_CHON_MA_KHACH);
      expect(() => g.canActivate(boiCanh('GET', []).ctx)).toThrow(/hoặc/);
    });
  });
});
