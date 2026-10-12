import { Controller, Get, Post, Put, Delete, Body, Query, Param, UseGuards, Request } from '@nestjs/common';
import { QnaService } from './qna.service';
import { QueryQnaDto, AnswerQnaDto, CreateQnaDto } from './dto/qna.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
/**
 * Q&A Controller
 *
 * Handles Q&A management operations
 */
@Controller('qna')
@UseGuards(JwtAuthGuard)
@MienQuyen('noiDung')
export class QnaController {
  constructor(private readonly qnaService: QnaService) {}

  /**
   * Get Q&A list with filters
   * Matches: LoadDanhSachThacMac() in HoiDapAdmin.cs
   */
  /**
   * Khách chỉ thấy thắc mắc của chính mình; nhân viên lọc theo username nào
   * cũng được, để trống là xem tất.
   *
   * CHỖ NÀY TỪNG RÒ: điều kiện cũ là `roles.length === 1 && roles[0] === 'user'`
   * — nhưng tài khoản khách KHÔNG có dòng nào trong AspNetUserRoles, nên
   * `roles` là mảng rỗng và điều kiện ấy luôn sai. Kết quả là mọi khách đăng
   * nhập vào /hoi-dap đều đọc được thắc mắc của toàn bộ khách khác, và còn
   * truyền `?username=` để xem đích danh một người. Vai trò 'user' chỉ tồn tại
   * trong một đối tượng tạm ở auth.service, chưa bao giờ được ghi vào CSDL.
   */
  @Get()
  async getQnaList(@Query() query: QueryQnaDto, @Request() req: any) {
    const laKhach = req.quyen?.laKhach !== false;
    const usernameFilter = laKhach ? (req.user?.username ?? '') : (query.username ?? '');
    return this.qnaService.getQnaList(usernameFilter, query.daTraLoi, query.page, query.limit);
  }

  /**
   * Create new Q&A question
   * Matches: HoiDap.cs -> btTaoCauHoi_Click() -> ThemThacMac()
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createQna(@Body() createDto: CreateQnaDto, @Request() req: any) {
    return this.qnaService.createQna(createDto.cauHoi, req.user?.username || 'system');
  }

  /**
   * Answer Q&A question
   * Matches: gvThacMac_RowUpdating() -> CapNhatTraLoiThacMac() in HoiDapAdmin.cs
   */
  @Put(':id/answer')
  @UseGuards(JwtAuthGuard)
  async answerQna(
    @Param('id') id: number,
    @Body() answerDto: AnswerQnaDto,
    @Request() req: any,
  ) {
    return this.qnaService.answerQna(
      id,
      answerDto.traLoi,
      req.user?.username || 'system',
    );
  }

  /**
   * Delete Q&A question
   * Matches: gvThacMac_RowDeleting() -> XoaThacMac() in HoiDapAdmin.cs
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteQna(@Param('id') id: number, @Request() req: any) {
    return this.qnaService.deleteQna(id, req.user?.username || 'system');
  }
}
