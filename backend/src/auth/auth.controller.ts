import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { MienQuyen, Quyen } from './quyen/quyen.decorator';
import { QuyenService } from './quyen/quyen.service';

/**
 * Auth Controller
 *
 * Handles authentication endpoints.
 */
@Controller('auth')
@MienQuyen('rieng')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly quyenService: QuyenService,
  ) {}

  /**
   * POST /auth/login
   * Authenticate user with username and password
   */
  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * POST /auth/register
   *
   * ĐÃ ĐÓNG TỰ ĐĂNG KÝ. Route này trước đây không có guard nào: người lạ trên
   * mạng gọi được, tạo ra tài khoản khách thật và nhận luôn token dùng được.
   * Trên web Next hiện không có trang đăng ký nào gọi tới đây, còn yêu cầu
   * phân quyền thì ghi rõ "Admin tạo tất cả các tk, CSKH tạo tk cho KH" — nên
   * nay đòi quyền `taoKhach`. Muốn mở lại cho khách tự đăng ký thì đổi thành
   * @Public() và thêm chống lạm dụng (captcha, giới hạn theo IP).
   * Register a new user
   */
  @Quyen('taoKhach')
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  @Public()
  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken);
  }

  /**
   * GET /auth/profile
   * Get current user profile
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  async getProfile(@Request() req: any) {
    return {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      roles: req.user.roles,
      ...this.quyenService.tinh(req.user?.roles ?? []),
    };
  }

  /**
   * GET /auth/quyen-cua-toi
   *
   * Những gì tài khoản đang đăng nhập được làm, đã quy đổi xong từ vai trò thô.
   * Web dùng danh sách này để ẩn menu và nút — CHỈ để bớt bấm vào chỗ không có
   * quyền, không phải để chặn: chặn thật nằm ở QuyenGuard phía máy chủ. Sửa
   * localStorage thì menu hiện ra nhưng gọi API vẫn 403.
   */
  @Get('quyen-cua-toi')
  async quyenCuaToi(@Request() req: any) {
    return this.quyenService.tinh(req.user?.roles ?? []);
  }

  // ========== Role Endpoints ==========

  /**
   * GET /auth/roles - Get all roles
   */
  @Quyen('taiKhoan.xem')
  @Get('roles')
  async getRoles() {
    return this.authService.getRoles();
  }

  /**
   * POST /auth/roles - Create new role
   */
  @UseGuards(JwtAuthGuard)
  @Quyen('quanLyRole')
  @Post('roles')
  async createRole(@Body() body: { roleName: string }, @Request() req: any) {
    return this.authService.createRole(body.roleName, req.user?.username || 'system');
  }

  /**
   * DELETE /auth/roles/:id - Delete role
   */
  @UseGuards(JwtAuthGuard)
  @Quyen('quanLyRole')
  @Delete('roles/:id')
  async deleteRole(@Param('id') id: number, @Request() req: any) {
    return this.authService.deleteRole(Number(id), req.user?.username || 'system');
  }
}
