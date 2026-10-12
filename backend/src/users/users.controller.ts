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
import { TrangThaiKhachService, RaSoatXoa } from './trang-thai-khach.service';
import { DuLieuTaiKhoanService } from './du-lieu-tai-khoan.service';
import { TaoTaiKhoanService } from './tao-tai-khoan.service';
import type { YeuCauTaoTaiKhoan } from './tao-tai-khoan.service';
// `import type`: kiểu này nằm trong chữ ký có decorator, để import thường thì
// `emitDecoratorMetadata` cố sinh siêu dữ liệu cho một thứ không tồn tại lúc chạy.
import type { YeuCauXuLy } from './du-lieu-tai-khoan.service';
import { User } from './entities/user.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen, Quyen } from '../auth/quyen/quyen.decorator';
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
@MienQuyen('taiKhoan')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly trangThaiKhachService: TrangThaiKhachService,
    private readonly duLieuTaiKhoanService: DuLieuTaiKhoanService,
    private readonly taoTaiKhoanService: TaoTaiKhoanService,
  ) {}

  /**
   * GET /users
   * List all users
   */
  @Quyen('taiKhoan.xem', 'xemDanhSachKhach')
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
   * GET /users/trang-thai/mot/:id
   *
   * Một tài khoản kèm mốc giao dịch cuối + dư nợ. Màn danh sách User chỉ có
   * dòng `AspNetUsers` thô, không có hai thứ đó — mà đóng mã khi chưa biết
   * khách còn nợ bao nhiêu thì đúng là làm mò.
   *
   * KHÔNG lọc theo vai trò: tài khoản nhân viên cũng phải mở được ở đây.
   */
  @Get('trang-thai/mot/:id')
  async motTrangThai(@Param('id') id: string) {
    return this.trangThaiKhachService.motKhach(id);
  }

  /**
   * GET /users/tim-nhanh?q=&nhom=
   * Gợi ý mã nhận cho ô "chuyển sang". Phải khai TRƯỚC `@Get(':id')` — để sau thì "tim-nhanh" bị bắt làm giá trị
   * của :id và luôn trả "không tìm thấy".
   */
  @Get('tim-nhanh')
  async timNhanh(@Query('q') q?: string, @Query('nhom') nhom?: string) {
    return this.duLieuTaiKhoanService.timNhanh(
      q ?? '',
      nhom === 'khach' || nhom === 'nhap' ? nhom : undefined,
    );
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
   *
   * Tạo tài khoản. Phải nói ngay trong cùng một lần gửi là KHÁCH HÀNG hay
   * NHÂN VIÊN — nhân viên thì kèm bộ phận, và vai trò được gán trong cùng giao
   * dịch với lúc tạo. Xem `tao-tai-khoan.service.ts` để biết vì sao không để
   * mặc định.
   */
  @Post()
  async create(@Body() body: YeuCauTaoTaiKhoan, @Request() req: any): Promise<User> {
    return this.taoTaiKhoanService.tao(
      body ?? {},
      req.quyen,
      req.user?.username || 'system',
    );
  }

  // ---------------- KIỂM KÊ / CHUYỂN / XOÁ ----------------

  /**
   * GET /users/:id/kiem-ke
   *
   * Tài khoản này còn dính bao nhiêu dòng, ở những bảng nào, còn nợ bao nhiêu.
   * Hộp thoại xoá gọi đường này TRƯỚC khi hỏi "có chắc không" — hỏi mà không
   * cho người ta thấy hậu quả thì câu hỏi ấy vô nghĩa.
   */
  @Get(':id/kiem-ke')
  async kiemKe(@Param('id') id: string) {
    return this.duLieuTaiKhoanService.kiemKe(id);
  }

  /**
   * POST /users/:id/xu-ly
   *
   * Chuyển dữ liệu sang mã khác và/hoặc xoá hẳn tài khoản, trong MỘT giao dịch.
   * Thay cho `DELETE /users/:id` ở màn danh sách: đường DELETE không có chỗ nào
   * để nói "chuyển đơn sang ai", nên nó chỉ còn là lối chặn cho mọi nơi gọi cũ.
   */
  @Quyen('taiKhoan.sua', 'quanLyRole')
  @Post(':id/xu-ly')
  async xuLy(@Param('id') id: string, @Body() body: YeuCauXuLy, @Request() req: any) {
    return this.duLieuTaiKhoanService.xuLy(id, body ?? {}, req.user?.username || 'system');
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
    await this.taoTaiKhoanService.chanNeuLaNhanVien(id, req.quyen);
    return this.usersService.update(id, userData, req.user?.username || 'system');
  }

  /**
   * DELETE /users/:id
   * Delete user
   */
  @Quyen('taiKhoan.sua', 'quanLyRole')
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any): Promise<void> {
    // "Khách nghỉ, KHÔNG xoá": AspNetUsers bị xoá cứng (`user.destroy()`) trong
    // khi CONGNO / tbTracking / Don_Hang trỏ tới tài khoản bằng CHUỖI UserName,
    // không khoá ngoại nào (đã kiểm: 0 foreign key trỏ về AspNetUsers). Xoá một
    // mã đang có dữ liệu là để lại hàng nghìn dòng mồ côi, âm thầm, không cách
    // nào dựng lại. Chặn tại đây và chỉ sang đổi trạng thái.
    const u = await this.usersService.findByStringId(id);
    const rs = await this.trangThaiKhachService.raSoatXoa(u.UserName);
    if (rs.chan) {
      throw new BadRequestException(this.loiChanXoa(u, rs));
    }
    return this.usersService.remove(id, req.user?.username || 'system');
  }

  /**
   * Câu từ chối xoá.
   *
   * Viết dài có chủ ý. Người bấm xoá đang muốn dọn danh sách, câu trả về phải
   * nói đủ ba điều, không thì họ chỉ thấy "lỗi": vì sao chặn, CON SỐ nào đang
   * bị chặn, và làm gì thay thế. Bản đầu gọi mọi tài khoản là "khách" và chỉ
   * đẩy sang "đóng mã" — với tài khoản kế toán hay CSKH thì câu đó vừa sai vừa
   * dẫn vào đường cùng, vì màn nhắc đóng mã chỉ liệt kê tài khoản không có vai
   * trò.
   */
  private loiChanXoa(u: User, rs: RaSoatXoa): string {
    // Làm tròn về đồng: dư nợ là cột float, để nguyên thì câu hiện
    // "14.666.335,55đ" — hai số lẻ đó là bụi làm tròn, không phải tiền.
    const so = (n: number) => Math.round(n).toLocaleString('vi-VN');
    const ten = u.HoTen ? `${u.UserName} (${u.HoTen})` : u.UserName;

    const ke = (g: { congNo: number; tracking: number; donHang: number }) =>
      [
        g.congNo ? `${so(g.congNo)} dòng công nợ` : '',
        g.tracking ? `${so(g.tracking)} kiện hàng` : '',
        g.donHang ? `${so(g.donHang)} đơn mua hộ` : '',
      ]
        .filter(Boolean)
        .join(', ');

    const phan: string[] = [];
    if (rs.laKhach.tong > 0) phan.push(`đang mang ${ke(rs.laKhach)} của chính mã này`);
    if (rs.daTao.tong > 0) phan.push(`là người nhập ${ke(rs.daTao)}`);

    const dong: string[] = [
      `Không xoá được ${rs.laNhanVien ? 'tài khoản nhân viên' : 'mã khách'} ${ten}: ` +
        `${phan.join('; ')}.`,
    ];

    // Tiền là lý do mạnh nhất, và là thứ duy nhất không dọn được về sau.
    if (rs.duNo >= 1000) dong.push(`Mã này còn nợ ${so(rs.duNo)}đ — chốt nợ trước đã.`);
    else if (rs.duNo <= -1000) dong.push(`Mã này đang dư trả trước ${so(-rs.duNo)}đ.`);

    dong.push(
      rs.laNhanVien
        ? 'Xoá đi thì những dòng trên mất tên người nhập, không truy lại được việc về ai. ' +
            'Nhân viên nghỉ việc thì đổi trạng thái sang "Đã đóng mã" — tài khoản không ' +
            'đăng nhập được nữa mà dữ liệu cũ vẫn tra được.'
        : 'Khách ngừng giao dịch thì đổi trạng thái sang "Đã đóng mã", đừng xoá.',
    );
    // Đường DELETE này giờ chỉ còn là lối chặn cho những nơi gọi cũ; nút Xoá ở
    // màn danh sách đi qua `POST /users/:id/xu-ly`, nơi có kiểm kê và ô chọn mã
    // nhận. Nói ra chỗ đó, đừng để người ta tưởng là hết đường.
    dong.push('Cần xoá thật thì bấm nút Xoá ở màn Danh sách User — ở đó xem được tài khoản còn giữ những gì và chuyển dữ liệu sang mã khác trước.');

    return dong.join(' ');
  }

  /**
   * POST /users/clear-data
   * Clear all data for a specific user
   */
  @Quyen('taiKhoan.sua', 'quanLyRole')
  @Post('clear-data')
  async clearUserData(@Body() body: { username: string }, @Request() req: any) {
    return this.usersService.clearUserData(body.username, req.user?.username || 'system');
  }

  /**
   * POST /users/import/sheets
   * Get sheets from uploaded Excel file
   */
  @Quyen('taiKhoan.sua', 'quanLyRole')
  @Post('import/sheets')
  @UseInterceptors(FileInterceptor('file'))
  async getSheets(@UploadedFile() file: Express.Multer.File) {
    return this.usersService.getExcelSheets(file);
  }

  /**
   * POST /users/import/validate
   * Validate Excel data before import
   */
  @Quyen('taiKhoan.sua', 'quanLyRole')
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
  @Quyen('taiKhoan.sua', 'quanLyRole')
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
  @Quyen('quanLyRole')
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
  @Quyen('quanLyRole')
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
    await this.taoTaiKhoanService.chanNeuLaNhanVien(id, req.quyen);
    return this.usersService.resetPassword(id, body.password, req.user?.username || 'system');
  }
}
