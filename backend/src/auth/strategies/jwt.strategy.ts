import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Sequelize } from 'sequelize-typescript';
import { User, UserModel } from '../../users/entities/user.entity';

/**
 * JWT Strategy
 *
 * Validates JWT tokens for authenticated requests using Sequelize.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private userModel: typeof User;

  constructor(@Inject('SEQUELIZE') private sequelize: Sequelize) {
    console.log('[JWT] ⚡ Strategy constructor called!');
    const secret = process.env.JWT_SECRET || 'your_jwt_secret_key_here';
    console.log('[JWT] Strategy init with secret:', secret);
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    });
    if (!sequelize.models.User) {
      UserModel(sequelize);
    }
    this.userModel = sequelize.models.User as typeof User;
  }

  async validate(payload: { sub: string; username: string }) {
    console.log('[JWT] Validate payload:', payload);
    const user = await this.userModel.findByPk(payload.sub);

    if (!user) {
      console.log('[JWT] User not found, sub:', payload.sub);
      throw new UnauthorizedException('User not found');
    }

    console.log('[JWT] User found:', user.get('UserName'));
    return {
      id: payload.sub,
      username: payload.username,
      email: user.get('Email'),
      roles: await this.getRoles(payload.sub),
    };
  }

  /**
   * Doc vai trò từ AspNetUserRoles.
   *
   * Trước đây chỗ này lấy `user.get('roles')`, nhưng 'roles' không phải cột
   * khai báo trong User.init() nên luôn ra undefined — mọi kiểm tra phân quyền
   * dựa vào req.user.roles đều bị vô hiệu. Vai trò chỉ có trong bảng nối.
   */
  private async getRoles(userId: string): Promise<string[]> {
    try {
      const rows = (await this.sequelize.query(
        `SELECT r.Name
         FROM   dbo.AspNetUserRoles ur
         JOIN   dbo.AspNetRoles r ON ur.RoleId = r.Id
         WHERE  ur.UserId = :userId`,
        { replacements: { userId }, type: 'SELECT' as const },
      )) as any[];
      return (rows || []).map((row: any) => row.Name);
    } catch (error: any) {
      // Không đọc được vai trò thì coi như không có quyền gì, hơn là mở toang.
      console.error('[JWT] Không đọc được vai trò:', error.message);
      return [];
    }
  }
}
