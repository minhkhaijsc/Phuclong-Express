import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  BANG_QUYEN,
  BO_PHAN,
  BO_PHAN_TP_TAO_NHAN_VIEN,
  MOI_VAI_TRO,
  NHAN_CAP,
  laBoPhan,
  laCap,
} from '../auth/quyen/bo-phan';
import { QuyenCuaToi } from '../auth/quyen/quyen.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { User, UserModel } from './entities/user.entity';
import { ghiLichSuCskhSau } from './lich-su-cskh';

export type LoaiTaiKhoan = 'khach' | 'nhanVien';

export interface YeuCauTaoTaiKhoan {
  /** Bắt buộc. Không có mặc định — xem ghi chú ở `kiemTra`. */
  loai?: LoaiTaiKhoan;
  /** Bộ phận, chỉ dùng khi loai = 'nhanVien'. */
  boPhan?: string[];
  /** Trưởng phòng / Giám đốc, chỉ dùng khi loai = 'nhanVien'. */
  cap?: string[];
  userName?: string;
  /** Mật khẩu trơn — băm ở máy chủ, không bao giờ nhận PasswordHash từ ngoài. */
  matKhau?: string;
  hoTen?: string;
  email?: string;
  soDienThoai?: string;
  [khac: string]: unknown;
}

/** Tên đăng nhập: cùng luật với màn đổi mã khách. */
const MAU_TEN_DANG_NHAP = /^[A-Za-z0-9._-]{2,50}$/;

@Injectable()
export class TaoTaiKhoanService {
  private userModel: typeof User;

  constructor(
    @Inject('SEQUELIZE') private readonly sequelize: Sequelize,
    private readonly systemLogsService: SystemLogsService,
  ) {
    if (!sequelize.models.User) UserModel(sequelize);
    this.userModel = sequelize.models.User as typeof User;
  }

  /**
   * Kiểm yêu cầu tạo tài khoản.
   *
   * KHÔNG CÓ MẶC ĐỊNH cho `loai`, cố ý. Trước đây `POST /users` chỉ nhận các
   * cột của AspNetUsers rồi tạo ra một tài khoản không vai trò — tức là khách
   * hàng — nên muốn có nhân viên thì phải tạo trước, vào trang sửa, rồi gán vai
   * trò ở bước hai. Hai bước thì bước hai bị quên: ngày 10/10/2026 có 938 tài
   * khoản không vai trò, trong đó lẫn những mã trông rõ là nhân viên. Bắt chọn
   * ngay từ đầu thì không còn khoảng giữa ấy nữa.
   */
  kiemTra(yc: YeuCauTaoTaiKhoan, nguoiLam: QuyenCuaToi): {
    loai: LoaiTaiKhoan;
    vaiTro: string[];
  } {
    const loai = yc.loai;
    if (loai !== 'khach' && loai !== 'nhanVien') {
      throw new BadRequestException(
        'Phải chọn tài khoản này là Khách hàng hay Nhân viên trước khi lưu.',
      );
    }

    const can = loai === 'nhanVien' ? 'taoNhanVien' : 'taoKhach';
    if (!nguoiLam.quyen.includes(can as never)) {
      throw new ForbiddenException(
        loai === 'nhanVien'
          ? 'Chỉ Admin hoặc Trưởng phòng CSKH được tạo tài khoản nhân viên.'
          : 'Bạn không có quyền tạo tài khoản khách hàng.',
      );
    }

    if (loai === 'khach') {
      if ((yc.boPhan?.length ?? 0) > 0 || (yc.cap?.length ?? 0) > 0) {
        throw new BadRequestException(
          'Tài khoản khách hàng không gán bộ phận hay cấp. Chọn "Nhân viên" nếu đây là người trong công ty.',
        );
      }
      return { loai, vaiTro: [] };
    }

    const boPhan = (yc.boPhan ?? []).map((s) => String(s).trim()).filter(Boolean);
    const cap = (yc.cap ?? []).map((s) => String(s).trim()).filter(Boolean);

    if (boPhan.length === 0) {
      throw new BadRequestException(
        `Tài khoản nhân viên phải thuộc ít nhất một bộ phận: ${Object.keys(BANG_QUYEN).join(', ')}.`,
      );
    }

    const la = [...boPhan, ...cap].filter((v) => !MOI_VAI_TRO.includes(v));
    if (la.length > 0) {
      throw new BadRequestException(`Bộ phận/cấp không hợp lệ: ${la.join(', ')}.`);
    }
    const saiCho = boPhan.filter((v) => !laBoPhan(v));
    if (saiCho.length > 0) {
      throw new BadRequestException(
        `${saiCho.join(', ')} là cấp, không phải bộ phận — chọn ở ô "Cấp".`,
      );
    }
    const capSai = cap.filter((v) => !laCap(v));
    if (capSai.length > 0) {
      throw new BadRequestException(
        `Cấp chỉ nhận ${Object.keys(NHAN_CAP).join(' hoặc ')}; nhận được: ${capSai.join(', ')}.`,
      );
    }

    // Chỉ Admin tạo được Admin.
    if (boPhan.includes(BO_PHAN.Admin) && !nguoiLam.quyen.includes('quanLyRole' as never)) {
      throw new ForbiddenException('Chỉ Admin được cấp bộ phận Admin cho người khác.');
    }

    // Không phải Admin (tức Trưởng phòng CSKH, mở 04/11/2026): chỉ tạo nhân
    // viên THƯỜNG trong chính bộ phận của mình. Cho cấp Trưởng phòng là tự
    // nhân bản quyền tạo nhân viên; cho bộ phận khác là cấp quyền mình không có.
    if (!nguoiLam.quyen.includes('quanLyRole' as never)) {
      const duoc = nguoiLam.boPhan.filter((b) => BO_PHAN_TP_TAO_NHAN_VIEN.includes(b));
      const ngoai = boPhan.filter((b) => !duoc.includes(b as never));
      if (ngoai.length > 0) {
        throw new ForbiddenException(
          `Bạn chỉ tạo được nhân viên bộ phận ${duoc.join(', ') || '(không có)'}; ` +
            `không cấp được ${ngoai.join(', ')}.`,
        );
      }
      if (cap.length > 0) {
        throw new ForbiddenException('Chỉ Admin được cấp Trưởng phòng / Giám đốc.');
      }
    }

    return { loai, vaiTro: [...new Set([...boPhan, ...cap])] };
  }

  /**
   * Tạo tài khoản rồi gán vai trò TRONG CÙNG MỘT GIAO DỊCH.
   *
   * Tách hai bước thì lần tạo nhân viên nào gặp lỗi ở bước gán sẽ để lại một
   * tài khoản không vai trò — mà tài khoản không vai trò chính là khách hàng,
   * nên cái sót lại không nằm im: nó đăng nhập được vào khu vực khách.
   */
  async tao(
    yc: YeuCauTaoTaiKhoan,
    nguoiLam: QuyenCuaToi,
    tenNguoiLam: string,
  ): Promise<User> {
    const { loai, vaiTro } = this.kiemTra(yc, nguoiLam);
    const cot = await this.dungCot(yc);

    const user = await this.sequelize.transaction(async (giaoDich) => {
      const u = await this.userModel.create(cot as never, { transaction: giaoDich });
      const id = u.Id;

      for (const ten of vaiTro) {
        const dongVaiTro = (await this.sequelize.query(
          'SELECT Id FROM dbo.AspNetRoles WHERE Name = :ten',
          { replacements: { ten }, type: 'SELECT' as const, transaction: giaoDich },
        )) as unknown as { Id: string }[];
        const dong = dongVaiTro?.[0];
        if (!dong?.Id) {
          // Ném trong giao dịch → tài khoản vừa tạo cũng bị bỏ.
          throw new BadRequestException(
            `Vai trò "${ten}" chưa có trong CSDL. Chạy migration them-bo-phan.sql trước.`,
          );
        }
        await this.sequelize.query(
          'INSERT INTO dbo.AspNetUserRoles (UserId, RoleId) VALUES (:uid, :rid)',
          {
            replacements: { uid: id, rid: dong.Id },
            type: 'INSERT' as const,
            transaction: giaoDich,
          },
        );
      }
      return u;
    });

    await ghiLichSuCskhSau(this.sequelize, tenNguoiLam, [user.UserName]);

    await this.systemLogsService
      .create({
        nguoiTao: tenNguoiLam,
        nguon: 'CreateNewUser',
        hanhDong: 'Them moi',
        doiTuong: user.Id,
        noiDung:
          `UserName: ${user.UserName}; Loai: ${loai === 'khach' ? 'Khach hang' : 'Nhan vien'}; ` +
          `VaiTro: ${vaiTro.join(', ') || '(khong)'}; HoTen: ${user.HoTen ?? ''}; ` +
          `Email: ${user.Email ?? ''}`,
      })
      .catch((err) => console.error('[SystemLog]', err?.message ?? err));

    return user;
  }

  /**
   * Dựng các cột AspNetUsers từ yêu cầu — CHỈ những trường được kê ra.
   *
   * Bản trước rải nguyên body xuống `userModel.create`, tức người gọi tự đặt
   * được PasswordHash, TrangThai, CSKHPhuTrach… Đường này chưa có màn nào gọi
   * cho tới khi mở cho Trưởng phòng CSKH (04/11/2026), nên siết lại trước khi
   * mở: mật khẩu băm ở đây, còn lại chỉ nhận tên, họ tên, email, SĐT.
   */
  async dungCot(yc: YeuCauTaoTaiKhoan): Promise<Record<string, unknown>> {
    const ten = String(yc.userName ?? '').trim();
    if (!MAU_TEN_DANG_NHAP.test(ten)) {
      throw new BadRequestException(
        'Tên đăng nhập 2–50 ký tự, chỉ gồm chữ không dấu, số và . _ - (không dấu cách).',
      );
    }
    const matKhau = String(yc.matKhau ?? '');
    if (matKhau.length < 6) throw new BadRequestException('Mật khẩu phải từ 6 ký tự.');
    const hoTen = String(yc.hoTen ?? '').trim();
    if (!hoTen) throw new BadRequestException('Chưa nhập họ tên.');
    const email = String(yc.email ?? '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException(`Email "${email}" không hợp lệ.`);
    }

    const [trung] = (await this.sequelize.query(
      `SELECT TOP 1 UserName, Email FROM dbo.AspNetUsers
        WHERE UserName = :ten OR (:email <> '' AND Email = :email)`,
      { replacements: { ten, email }, type: 'SELECT' as const },
    )) as unknown as { UserName: string; Email: string | null }[];
    if (trung) {
      throw new ConflictException(
        String(trung.UserName).toLowerCase() === ten.toLowerCase()
          ? `Tên đăng nhập "${ten}" đã có người dùng. Hãy chọn tên khác.`
          : `Email "${email}" đã dùng cho tài khoản "${trung.UserName}".`,
      );
    }

    return {
      Id: crypto.randomUUID(),
      UserName: ten,
      // Như màn tạo khách: không nhập email thì đặt email giữ chỗ theo tên.
      Email: email || `${ten}@example.com`,
      PasswordHash: await bcrypt.hash(matKhau, 10),
      HoTen: hoTen,
      PhoneNumber: String(yc.soDienThoai ?? '').trim() || null,
    };
  }

  /**
   * Chặn người không có `quanLyRole` chạm vào tài khoản NHÂN VIÊN.
   *
   * CSKH có `taiKhoan.sua` để còn sửa và tạo tài khoản khách. Nếu không chặn
   * thêm ở đây thì cùng quyền đó cũng đủ để đổi mật khẩu của kế toán hay của
   * Admin — leo thang quyền chỉ bằng một lần bấm "Đặt lại mật khẩu".
   */
  async chanNeuLaNhanVien(id: string, nguoiLam: QuyenCuaToi): Promise<void> {
    if (nguoiLam.quyen.includes('quanLyRole' as never)) return;

    const dong = (await this.sequelize.query(
      `SELECT r.Name
       FROM   dbo.AspNetUserRoles ur
       JOIN   dbo.AspNetRoles r ON r.Id = ur.RoleId
       WHERE  ur.UserId = :id`,
      { replacements: { id }, type: 'SELECT' as const },
    )) as unknown as { Name: string }[];

    if ((dong ?? []).length > 0) {
      throw new ForbiddenException(
        'Đây là tài khoản nhân viên. Chỉ Admin được sửa tài khoản nhân viên.',
      );
    }
  }
}
