import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MienQuyen, Quyen } from '../auth/quyen/quyen.decorator';
import { Public } from '../common/decorators/public.decorator';
import { HopDongService, MAU_TOI_DA_BYTE } from './hop-dong.service';
import type { YeuCauKy, YeuCauTao } from './hop-dong.service';

const KIEU_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Gửi file .docx, tên có dấu tiếng Việt thì dùng filename* (RFC 5987). */
function guiDocx(res: Response, file: Buffer, tenFile: string, taiVe: boolean) {
  const ascii = tenFile.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7e]/g, '_');
  res.set({
    'Content-Type': KIEU_DOCX,
    'Content-Disposition': `${taiVe ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(tenFile)}`,
    'Content-Length': String(file.length),
    'Cache-Control': 'no-store',
  });
  res.end(file);
}

/** Người dùng — iisnode chuyển tiếp IP qua header, không có thì lấy IP kết nối. */
function ipCua(req: any): string {
  const xff = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  return xff || String(req.headers?.['x-iisnode-remote_addr'] ?? '') || String(req.ip ?? '');
}

/**
 * Hợp đồng — phía NỘI BỘ (Admin, CSKH, Kế toán: quyền `hopDong`).
 * Xem `hop-dong.service.ts`.
 */
@Controller('hop-dong')
@Quyen('hopDong')
export class HopDongController {
  constructor(private readonly service: HopDongService) {}

  @Get('mau')
  danhSachMau() {
    return this.service.danhSachMau();
  }

  @Post('mau')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAU_TOI_DA_BYTE } }))
  taoMau(@UploadedFile() file: Express.Multer.File, @Body('ten') ten: string, @Request() req: any) {
    return this.service.taoMau(file, ten, req.user?.username);
  }

  @Post('mau/:id/xoa')
  xoaMau(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.xoaMau(id, req.user?.username);
  }

  @Get('mau/:id/file')
  async taiMau(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { file, tenFile } = await this.service.taiMau(id);
    guiDocx(res, file, tenFile, true);
  }

  /** Giá trị gợi ý cho các ô, lấy từ tài khoản khách. */
  @Get('goi-y/:userName')
  goiY(@Param('userName') userName: string, @Request() req: any) {
    return this.service.goiY(userName, req);
  }

  @Get()
  danhSach(@Query() q: any) {
    return this.service.danhSach(q);
  }

  @Post()
  tao(@Body() body: YeuCauTao, @Request() req: any) {
    return this.service.tao(body, req.user?.username);
  }

  @Post(':id/huy')
  huy(@Param('id', ParseIntPipe) id: number, @Body('lyDo') lyDo: string, @Request() req: any) {
    return this.service.huy(id, lyDo, req.user?.username);
  }

  @Get(':id/file')
  async file(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { file, tenFile } = await this.service.fileTheoId(id);
    guiDocx(res, file, tenFile, true);
  }
}

/**
 * Hợp đồng — phía KHÁCH. Bên khách chốt "khách có link là xem đc", nên xem và
 * ký đi bằng mã trong link, không cần đăng nhập. Mã là 48 ký tự hex ngẫu nhiên.
 */
@Controller('hop-dong-khach')
export class HopDongKhachController {
  constructor(private readonly service: HopDongService) {}

  /** Khách đã đăng nhập: danh sách hợp đồng của chính mình. */
  @MienQuyen('rieng')
  @Get('cua-toi')
  cuaToi(@Request() req: any) {
    return this.service.cuaToi(req.user?.username);
  }

  @Public()
  @Get(':ma')
  xem(@Param('ma') ma: string) {
    return this.service.xemTheoMa(ma);
  }

  @Public()
  @Get(':ma/file')
  async file(@Param('ma') ma: string, @Query('tai') tai: string, @Res() res: Response) {
    const { file, tenFile } = await this.service.fileTheoMa(ma);
    guiDocx(res, file, tenFile, tai === '1');
  }

  @Public()
  @Post(':ma/ky')
  ky(@Param('ma') ma: string, @Body() body: YeuCauKy, @Request() req: any) {
    return this.service.ky(ma, body, {
      ip: ipCua(req),
      trinhDuyet: String(req.headers?.['user-agent'] ?? ''),
      userKy: null,
    });
  }
}
