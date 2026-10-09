import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  Req,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { TrangThaiKhachService } from './trang-thai-khach.service';
import { User } from './entities/user.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Users Controller
 *
 * Handles user CRUD endpoints.
 *
 * `@UseGuards` đặt Ở CẤP LỚP, cố ý: trước đây chỉ hai đường (`POST /users` và
 * `POST /users/clear-data`) có khoá, nên `GET /users` trả về danh sách 981 tài
 * khoản kèm email + điện thoại, `PUT /users/:id` và `DELETE /users/:id` đều
 * gọi được mà KHÔNG CẦN đăng nhập. Mọi nơi gọi trong giao diện đều là màn admin
 * và `apiClient` luôn gắn token, nên khoá cả lớp không làm hỏng gì.
 *
 * Việc này cũng là điều kiện để phần trạng thái khách chạy đúng: nhật ký đổi
 * trạng thái ghi `req.user.username`, không có khoá thì mọi thay đổi đều mang
 * tên "system" và không truy được ai làm.
 */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly trangThaiKhachService: TrangThaiKhachService,
  ) {}

  /**
   * GET /users
   * List all users
   */
  @Get()
  async findAll(@Query('keyword') keyword?: string): Promise<User[]> {
    return this.usersService.findAll(keyword);
  }

  // ---------------- TRẠNG THÁI KHÁCH HÀNG ----------------
  //
  // Khai TRƯỚC `@Get(':id')`: Nest so khớp theo thứ tự khai báo, để sau thì
  // 'trang-thai' bị bắt làm giá trị của :id và luôn trả "không tìm thấy".

  /**
   * GET /users/trang-thai/tong-hop
   * Các con số để nhắc CSKH đóng mã.
   */
  @Get('trang-thai/tong-hop')
  async trangThaiTongHop() {
    return this.trangThaiKhachService.tongHop();
  }

  /**
   * GET /users/trang-thai
   * Danh sách khách kèm tình trạng giao dịch. `nhom=can-dong-ma` cho việc cần làm.
   */
  @Get('trang-thai')
  async trangThaiDanhSach(
    @Query('nhom') nhom?: string,
    @Query('tuKhoa') tuKhoa?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.trangThaiKhachService.danhSach({
      nhom,
      tuKhoa,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });
  }

  /**
   * PUT /users/trang-thai/:id
   * CSKH chốt trạng thái: hoat-dong | tam-nghi | dong-ma (đóng mã phải có lý do).
   */
  @Put('trang-thai/:id')
  async datTrangThai(
    @Param('id') id: string,
    @Body() body: { trangThai: string; lyDo?: string },
    @Request() req: any,
  ) {
    return this.trangThaiKhachService.dat(
      id,
      body?.trangThai,
      body?.lyDo,
      req.user?.username || 'system',
    );
  }

  /**
   * GET /users/:id
   * Get user by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findByStringId(id);
  }

  /**
   * POST /users
   * Create new user
   */
  @Post()
  async create(@Body() userData: Partial<User>, @Request() req: any): Promise<User> {
    return this.usersService.create(userData, req.user?.username || 'system');
  }

  /**
   * PUT /users/:id
   * Update user
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() userData: Partial<User>,
    @Request() req: any,
  ): Promise<User> {
    return this.usersService.update(id, userData, req.user?.username || 'system');
  }

  /**
   * DELETE /users/:id
   * Delete user
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any): Promise<void> {
    // "Khách nghỉ, KHÔNG xoá": AspNetUsers bị xoá cứng (`user.destroy()`) trong
    // khi CONGNO / tbTracking / Don_Hang trỏ tới khách bằng CHUỖI UserName,
    // không khoá ngoại nào. Xoá một mã đang có giao dịch là để lại hàng nghìn
    // dòng công nợ mồ côi, âm thầm, không cách nào dựng lại. Chặn tại đây và
    // chỉ sang đổi trạng thái.
    const u = await this.usersService.findByStringId(id);
    const gd = await this.trangThaiKhachService.coGiaoDich(u.UserName);
    if (gd.co) {
      throw new BadRequestException(
        `Không xoá được: mã ${u.UserName} đang có ${gd.congNo} dòng công nợ, ` +
          `${gd.tracking} kiện hàng, ${gd.donHang} đơn mua hộ. ` +
          `Khách ngừng giao dịch thì đổi trạng thái sang "Đã đóng mã", đừng xoá.`,
      );
    }
    return this.usersService.remove(id, req.user?.username || 'system');
  }

  /**
   * POST /users/clear-data
   * Clear all data for a specific user
   */
  @Post('clear-data')
  async clearUserData(@Body() body: { username: string }, @Request() req: any) {
    return this.usersService.clearUserData(body.username, req.user?.username || 'system');
  }

  /**
   * POST /users/import/sheets
   * Get sheets from uploaded Excel file
   */
  @Post('import/sheets')
  @UseInterceptors(FileInterceptor('file'))
  async getSheets(@UploadedFile() file: Express.Multer.File) {
    return this.usersService.getExcelSheets(file);
  }

  /**
   * POST /users/import/validate
   * Validate Excel data before import
   */
  @Post('import/validate')
  @UseInterceptors(FileInterceptor('file'))
  async validateImport(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { sheet: string; mode: string; editableColumns: number[] },
  ) {
    return this.usersService.validateImportData(file, body.sheet, body.mode, body.editableColumns);
  }

  /**
   * POST /users/import/execute
   * Execute the import
   */
  @Post('import/execute')
  @UseInterceptors(FileInterceptor('file'))
  async executeImport(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { sheet: string; mode: string; editableColumns: number[] },
  ) {
    return this.usersService.executeImport(file, body.sheet, body.mode, body.editableColumns);
  }

  /**
   * GET /users/:id/roles
   * Get roles for a user
   */
  @Get(':id/roles')
  async getUserRoles(@Param('id') id: string) {
    return this.usersService.getUserRoles(id);
  }

  /**
   * POST /users/:id/roles
   * Add role to user
   */
  @Post(':id/roles')
  async addRole(
    @Param('id') id: string,
    @Body() body: { roleName: string },
    @Request() req: any,
  ) {
    return this.usersService.addRoleToUser(id, body.roleName, req.user?.username || 'system');
  }

  /**
   * DELETE /users/:id/roles/:roleName
   * Remove role from user
   */
  @Delete(':id/roles/:roleName')
  async removeRole(
    @Param('id') id: string,
    @Param('roleName') roleName: string,
    @Request() req: any,
  ) {
    return this.usersService.removeRoleFromUser(id, roleName, req.user?.username || 'system');
  }

  /**
   * POST /users/:id/reset-password
   * Reset user password
   */
  @Post(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { password: string },
    @Request() req: any,
  ) {
    return this.usersService.resetPassword(id, body.password, req.user?.username || 'system');
  }
}
