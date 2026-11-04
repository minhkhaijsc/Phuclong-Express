import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { JwtService } from '@nestjs/jwt';
import { Sequelize } from 'sequelize-typescript';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserModel } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { QuyenService } from './quyen/quyen.service';
import { ghiLichSuCskhSau } from '../users/lich-su-cskh';

/**
 * Auth Service
 *
 * Handles user authentication using Sequelize.
 * Supports both old ASP.NET Identity (PBKDF2) and new bcrypt passwords.
 */
@Injectable()
export class AuthService {
  private userModel: typeof User;

  constructor(
    @Inject('SEQUELIZE') private sequelize: Sequelize,
    private jwtService: JwtService,
    private readonly systemLogsService: SystemLogsService,
    private readonly quyenService: QuyenService,
  ) {
    if (!sequelize.models.User) {
      UserModel(sequelize);
    }
    this.userModel = sequelize.models.User as typeof User;
  }

  /**
   * Validate user credentials
   * Tries both old PBKDF2 and new bcrypt
   */
  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.userModel.findOne({
      where: { UserName: username },
    });

    if (!user) {
      return null;
    }

    const userData = user.get();
    const passwordHash = userData.PasswordHash;

    if (!passwordHash) {
      return null;
    }

    // Try PBKDF2 first
    const isValidOld = await this.verifyAspNetIdentityPassword(password, passwordHash);
    if (isValidOld) {
      userData.roles = await this.getUserRoles(userData.Id);
      return userData;
    }

    // Try bcrypt
    if (await bcrypt.compare(password, passwordHash)) {
      userData.roles = await this.getUserRoles(userData.Id);
      return userData;
    }

    return null;
  }

  /**
   * Verify password using PBKDF2-SHA1 (1000 iterations)
   */
  private async verifyAspNetIdentityPassword(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    try {
      const decoded = Buffer.from(passwordHash, 'base64');
      if (decoded.length < 18) {
        return false;
      }

      const salt = decoded.slice(1, 17);
      const savedHash = decoded.slice(17);

      const derivedKey = crypto.pbkdf2Sync(
        password,
        salt,
        1000,
        savedHash.length,
        'sha1',
      );

      return crypto.timingSafeEqual(derivedKey, savedHash);
    } catch (error) {
      return false;
    }
  }

  /**
   * Login user and generate tokens
   */
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.validateUser(loginDto.username, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // ĐÓNG MÃ phải thật sự đóng được đường vào.
    //
    // Không có chỗ này thì "đóng mã" chỉ là một nhãn: mã biến khỏi danh sách
    // việc cần làm của CSKH, nhưng người giữ mật khẩu vẫn đăng nhập xem dữ liệu
    // như thường. Với tài khoản nhân viên đã nghỉ thì đó đúng là lỗ hổng, và nó
    // cũng là lý do câu từ chối xoá dám khuyên "đóng mã thay vì xoá".
    //
    // Kiểm SAU khi đã xác thực mật khẩu, cố ý: trả lời "mã đã đóng" cho một lần
    // thử mật khẩu sai là tiết lộ mã đó có tồn tại.
    if (user.TrangThai === 'dong-ma') {
      await this.systemLogsService
        .create({
          nguoiTao: user.UserName,
          nguon: 'Auth:Login',
          hanhDong: 'Dang nhap',
          doiTuong: user.Id,
          noiDung: `TU CHOI - ma da dong. UserName: ${user.UserName}; LyDo: ${user.LyDoTrangThai || '(khong ghi)'}`,
        })
        .catch((err) => console.error('[SystemLog]', err?.message ?? err));
      throw new UnauthorizedException(
        'Mã này đã đóng, không đăng nhập được. Liên hệ CSKH nếu cần mở lại.',
      );
    }

    await this.systemLogsService.create({
      nguoiTao: user.UserName,
      nguon: 'Auth:Login',
      hanhDong: 'Dang nhap',
      doiTuong: user.Id,
      noiDung: `UserName: ${user.UserName}`,
    }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

    return this.generateAuthResponse(user);
  }

  /**
   * Register new user
   */
  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    // Check if username exists
    const existingUsername = await this.userModel.findOne({
      where: { UserName: registerDto.username },
    });

    if (existingUsername) {
      // Nói rõ trùng cái gì và trùng với ai: báo "Username already exists" thì
      // người nhập không biết phải đổi trường nào.
      throw new ConflictException(
        `Tên đăng nhập "${registerDto.username}" đã có người dùng. Hãy chọn tên khác.`,
      );
    }

    // CSKH phụ trách: bắt buộc, và phải là CSKH đang làm — cùng danh sách với ô
    // chọn trên web (`UsersService.danhSachCskh`), để không ai gõ bừa qua API.
    const cskh = registerDto.cskhPhuTrach?.trim();
    if (!cskh) {
      throw new BadRequestException('Chưa chọn CSKH phụ trách. Mã khách mới phải gán CSKH thì mới tạo được.');
    }
    const [laCskh] = await this.sequelize.query<{ n: number }>(
      `SELECT COUNT(*) AS n
         FROM dbo.AspNetUsers u
         JOIN dbo.AspNetUserRoles ur ON ur.UserId = u.Id
         JOIN dbo.AspNetRoles r ON r.Id = ur.RoleId
        WHERE r.Name = 'CSKH' AND ISNULL(u.TrangThai, '') <> 'dong-ma' AND u.UserName = :cskh`,
      { replacements: { cskh }, type: QueryTypes.SELECT },
    );
    if (!Number(laCskh?.n)) {
      throw new BadRequestException(`"${cskh}" không phải CSKH đang làm. Chọn CSKH trong danh sách.`);
    }

    // Check if email exists
    const existingEmail = await this.userModel.findOne({
      where: { Email: registerDto.email },
    });

    if (existingEmail) {
      throw new ConflictException(
        `Email "${registerDto.email}" đã dùng cho tài khoản "${existingEmail.UserName}". ` +
          `Mỗi email chỉ gắn được một tài khoản.`,
      );
    }

    // Hash password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(registerDto.password, salt);

    // Create user — Id must be a GUID (ASP.NET Identity convention, not auto-generated by DB)
    const user = await this.userModel.create({
      Id: crypto.randomUUID(),
      UserName: registerDto.username,
      Email: registerDto.email,
      PasswordHash: hashedPassword,
      HoTen: registerDto.hoTen,
      DiaChi: registerDto.diaChi,
      TinhThanh: registerDto.tinhThanh,
      SoTaiKhoan: registerDto.soTaiKhoan,
      HinhThucNhanHang: registerDto.hinhThucNhanHang,
      KhachBuon: registerDto.khachBuon || false,
      LinkTaiKhoanMang: registerDto.linkTaiKhoanMang,
      VungMien: registerDto.vungMien,
      CSKHPhuTrach: cskh,
      roles: ['user'],
    });
    await ghiLichSuCskhSau(this.sequelize, String(registerDto.username), [registerDto.username]);

    await this.systemLogsService.create({
      nguoiTao: user.get('UserName') as string,
      nguon: 'Auth:Register',
      hanhDong: 'Them moi',
      doiTuong: user.get('Id') as string,
      noiDung: `UserName: ${registerDto.username}; Email: ${registerDto.email}; HoTen: ${registerDto.hoTen || ''}; CSKH: ${registerDto.cskhPhuTrach || '(chua gan)'}`,
    }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

    return this.generateAuthResponse(user);
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
      });

      const user = await this.userModel.findByPk(payload.sub);

      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const accessToken = this.jwtService.sign(
        { sub: user.Id, username: user.UserName },
        { expiresIn: '15m' },
      );

      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Generate authentication response with tokens
   */
  private generateAuthResponse(user: User): AuthResponseDto {
    const payload = { sub: user.Id, username: user.UserName };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.Id,
        username: user.UserName,
        email: user.Email,
        hoTen: user.HoTen,
        roles: user.roles,
        // Quyền tính sẵn để web khỏi phải gọi thêm một lượt sau khi đăng nhập.
        ...this.quyenService.tinh(user.roles ?? []),
      },
    };
  }

  // ========== Role Management ==========

  /**
   * Get all roles
   */
  async getRoles(): Promise<any[]> {
    try {
      const [data]: any[] = await this.sequelize.query(`
        SELECT Id, Name FROM dbo.AspNetRoles ORDER BY Name
      `);
      return data || [];
    } catch (error: any) {
      console.error('Error getting roles:', error.message);
      return [];
    }
  }

  /**
   * Get roles for a specific user
   */
  async getUserRoles(userId: string): Promise<string[]> {
    try {
      const [data]: any[] = await this.sequelize.query(`
        SELECT r.Name
        FROM dbo.AspNetUserRoles ur
        JOIN dbo.AspNetRoles r ON ur.RoleId = r.Id
        WHERE ur.UserId = '${userId}'
      `);
      return (data || []).map((row: any) => row.Name);
    } catch (error: any) {
      console.error('Error getting user roles:', error.message);
      return [];
    }
  }

  /**
   * Create new role
   */
  async createRole(roleName: string, nguoiTao = 'system'): Promise<{ success: boolean; message?: string }> {
    try {
      // Check if role exists
      const [existing]: any[] = await this.sequelize.query(`
        SELECT Id FROM dbo.AspNetRoles WHERE Name = '${roleName}'
      `);

      if (existing.length > 0) {
        return { success: false, message: 'Role already exists' };
      }

      await this.sequelize.query(`
        INSERT INTO dbo.AspNetRoles (Id, Name) VALUES (NEWID(), '${roleName}')
      `);

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'CreateNewRole',
        hanhDong: 'Them moi',
        doiTuong: '',
        noiDung: `RoleName: ${roleName}`,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error creating role:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Delete role
   */
  async deleteRole(roleId: number, nguoiTao = 'system'): Promise<{ success: boolean }> {
    try {
      await this.sequelize.query(`
        DELETE FROM dbo.AspNetRoles WHERE Id = ${roleId}
      `);

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'DeleteRole',
        hanhDong: 'Xoa',
        doiTuong: String(roleId),
        noiDung: `RoleId: ${roleId}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return { success: true };
    } catch (error: any) {
      console.error('Error deleting role:', error.message);
      return { success: false };
    }
  }
}
