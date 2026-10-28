import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { MIEN_KEY, QUYEN_KEY, QUYEN_MOT_KEY } from '../quyen/quyen.decorator';
import { MaQuyen, Mien, NHAN_MIEN } from '../quyen/bo-phan';
import { QuyenService } from '../quyen/quyen.service';

const DOC = new Set(['GET', 'HEAD', 'OPTIONS']);

const NHAN_QUYEN_LE: Record<string, string> = {
  giaNcc: 'xem giá nhà cung cấp',
  congNoNcc: 'xem công nợ phải trả nhà cung cấp',
  xemTyGia: 'xem tỷ giá',
  hopDong: 'tạo hợp đồng cho khách',
  duyetCongNo: 'duyệt công nợ',
  taoKhach: 'tạo tài khoản khách hàng',
  taoNhanVien: 'tạo tài khoản nhân viên',
  xemDanhSachKhach: 'xem danh sách tài khoản khách hàng',
  xemLienHeKhach: 'xem email và số điện thoại của khách',
  xemLienHeMoiKhach: 'xem email và số điện thoại của khách do sales khác phụ trách',
  phanKhachCskh: 'gán CSKH phụ trách cho khách',
  quanLyRole: 'quản lý vai trò',
  baoChuyenKhoan: 'báo đã chuyển khoản',
};

/**
 * Chặn theo bảng quyền trong `auth/quyen/bo-phan.ts`.
 *
 * Chạy sau JwtAuthGuard, nên tới đây `req.user` đã có (trừ route @Public).
 *
 * ĐÓNG MẶC ĐỊNH: route không gắn @MienQuyen và cũng không có @Quyen thì bị từ
 * chối. Thà một route mới bị chặn cho tới khi có người gắn nhãn, hơn là lặng lẽ
 * mở ra cho mọi tài khoản — đúng cái đã xảy ra với /roles, /batches và
 * /shipments: ba controller này không có guard nào, GET /api/roles trả 200 cho
 * người lạ không cần đăng nhập, mà PATCH/DELETE /roles/:id cũng vậy.
 *
 * Có bài kiểm tra `quyen.phu-kin.spec.ts` dò mọi route thiếu nhãn để lỗi lộ ra
 * lúc chạy test chứ không phải lúc người dùng bấm.
 */
@Injectable()
export class QuyenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly quyenService: QuyenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const dich = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, dich)) return true;

    const req = context.switchToHttp().getRequest();
    const vaiTro: string[] = Array.isArray(req?.user?.roles) ? req.user.roles : [];
    const q = this.quyenService.tinh(vaiTro);
    // Để controller và service dùng lại, không phải tính lần hai.
    req.quyen = q;

    // `@QuyenMot` xét trước: cần MỘT trong các mã là qua. Xem ghi chú ở
    // decorator — dành cho đường phục vụ nhiều màn thuộc nhiều miền.
    const motTrong = this.reflector.getAllAndOverride<MaQuyen[]>(QUYEN_MOT_KEY, dich);
    if (motTrong?.length) {
      if (motTrong.some((ma) => q.quyen.includes(ma))) return true;
      throw new ForbiddenException(
        `${this.quyenService.tenBoPhan(q)} không có quyền ${motTrong.map(moTa).join(' hoặc ')}.`,
      );
    }

    const can = this.cauHoi(context);
    if (can.length === 0) {
      throw new ForbiddenException(
        'Chức năng này chưa được gắn nhãn phân quyền nên tạm thời bị chặn. Báo kỹ thuật để bổ sung.',
      );
    }

    const thieu = can.filter((ma) => !q.quyen.includes(ma));
    if (thieu.length === 0) return true;

    throw new ForbiddenException(
      `${this.quyenService.tenBoPhan(q)} không có quyền ${thieu.map(moTa).join(' và ')}.`,
    );
  }

  /** Những mã quyền route này đòi. */
  private cauHoi(context: ExecutionContext): MaQuyen[] {
    const dich = [context.getHandler(), context.getClass()];

    const ro = this.reflector.getAllAndOverride<MaQuyen[]>(QUYEN_KEY, dich);
    if (ro?.length) return ro;

    const mien = this.reflector.getAllAndOverride<Mien>(MIEN_KEY, dich);
    if (!mien) return [];

    const method = String(context.switchToHttp().getRequest()?.method ?? 'GET').toUpperCase();
    return [`${mien}.${DOC.has(method) ? 'xem' : 'sua'}` as MaQuyen];
  }
}

const moTa = (ma: string): string => {
  const le = NHAN_QUYEN_LE[ma];
  if (le) return le;
  const [mien, hanhDong] = ma.split('.');
  const nhan = NHAN_MIEN[mien as Mien] ?? mien;
  return `${hanhDong === 'sua' ? 'sửa' : 'xem'} ${nhan}`;
};
