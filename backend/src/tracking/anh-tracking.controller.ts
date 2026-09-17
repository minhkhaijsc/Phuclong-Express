import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnhTrackingService } from './anh-tracking.service';

interface NguoiDung {
  user?: { username?: string; roles?: string[] };
}

/** Giới hạn số tên file cho một lần xem trước — thư mục to hơn thì trang tự chia lô. */
const TOI_DA_TEN_FILE = 2000;

/**
 * Ảnh hàng của tracking.
 *
 *   POST   /tracking/anh/khop      xem trước tên file khớp tracking nào (nhân viên)
 *   POST   /tracking/anh/tai-len   tải một ảnh lên, tự gắn theo tên file (nhân viên)
 *   GET    /tracking/:id/anh       ảnh của một tracking (nhân viên, hoặc khách chủ tracking)
 *   DELETE /tracking/anh/:anhId    xoá mềm một ảnh (nhân viên)
 *
 * Tra cứu công khai trên trang chủ lấy ảnh qua GET /tracking/search/:code.
 */
@UseGuards(JwtAuthGuard)
@Controller('tracking')
export class AnhTrackingController {
  constructor(private readonly anhTrackingService: AnhTrackingService) {}

  /**
   * Khách đăng ký qua web không có dòng nào trong AspNetUserRoles, nên "có ít
   * nhất một vai trò" là ranh giới nhân viên / khách — cùng điều kiện trang
   * /admin đang dùng.
   */
  private laNhanVien(req: NguoiDung) {
    return (req.user?.roles ?? []).length > 0;
  }

  private batBuocNhanVien(req: NguoiDung) {
    if (!this.laNhanVien(req))
      throw new ForbiddenException(
        'Chỉ nhân viên mới được up / xoá ảnh tracking.',
      );
  }

  @Post('anh/khop')
  @HttpCode(HttpStatus.OK)
  async khop(@Body() body: { tenFile?: unknown }, @Req() req: NguoiDung) {
    this.batBuocNhanVien(req);
    const ds = Array.isArray(body?.tenFile) ? body.tenFile.map(String) : [];
    if (!ds.length) throw new BadRequestException('Chưa có tên file nào.');
    if (ds.length > TOI_DA_TEN_FILE) {
      throw new BadRequestException(`Tối đa ${TOI_DA_TEN_FILE} file một lần.`);
    }
    return this.anhTrackingService.khopTenFile(ds);
  }

  @Post('anh/tai-len')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }),
  )
  async taiLen(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { tenFileGoc?: string },
    @Req() req: NguoiDung,
  ) {
    this.batBuocNhanVien(req);
    return this.anhTrackingService.luuAnh(
      file,
      body?.tenFileGoc,
      req.user?.username || 'system',
    );
  }

  @Get(':id/anh')
  async layAnh(@Param('id', ParseIntPipe) id: number, @Req() req: NguoiDung) {
    if (!this.laNhanVien(req)) {
      const chu = await this.anhTrackingService.chuTracking(id);
      // Báo "không tìm thấy" chứ không 403: web tự đăng xuất khi gặp 403, và
      // cũng không nên cho biết mã tracking đó có tồn tại.
      if (
        chu === undefined ||
        (chu ?? '').toLowerCase() !== (req.user?.username ?? '').toLowerCase()
      ) {
        throw new NotFoundException('Không tìm thấy tracking.');
      }
    }
    return this.anhTrackingService.layAnh(id);
  }

  @Delete('anh/:anhId')
  async xoaAnh(
    @Param('anhId', ParseIntPipe) anhId: number,
    @Req() req: NguoiDung,
  ) {
    this.batBuocNhanVien(req);
    return this.anhTrackingService.xoaAnh(
      anhId,
      req.user?.username || 'system',
    );
  }
}
