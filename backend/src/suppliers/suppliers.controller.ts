import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
} from '@nestjs/common';
import { Quyen } from '../auth/quyen/quyen.decorator';
import { SuppliersService } from './suppliers.service';
import type { SuaNhaCungCapDto, TaoNhaCungCapDto } from './suppliers.service';

/**
 * Danh mục nhà cung cấp.
 *
 * TOÀN BỘ controller đòi quyền lẻ `giaNcc` — kể cả đường ĐỌC. Danh mục này
 * không phải danh mục bình thường như website hay loại hàng: chỉ cần danh sách
 * tên nhà cung cấp cũng đã là thông tin bên khách nói rõ "các nhân sự còn lại k
 * được xem". Nên KHÔNG gắn `@MienQuyen('danhMuc')` như các danh mục khác, vì
 * CSKH có `danhMuc.sua`.
 *
 * Đường GHI đòi THÊM `danhMuc.sua`: xem được danh mục không có nghĩa là được
 * thêm sửa trong đó. `@Quyen` đòi đủ TẤT CẢ mã nêu ra.
 */
@Controller('suppliers')
@Quyen('giaNcc')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  /** `tatCa=1` thì trả cả nhà cung cấp đã ẩn — dùng cho ô lọc, không phải ô nhập. */
  @Get()
  async danhSach(@Query('tatCa') tatCa?: string) {
    const data = await this.suppliersService.danhSach(tatCa === '1' || tatCa === 'true');
    return { data };
  }

  @Get(':id')
  async motCai(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.suppliersService.motCai(id) };
  }

  @Quyen('giaNcc', 'danhMuc.sua')
  @Post()
  async tao(@Body() dto: TaoNhaCungCapDto, @Request() req: any) {
    const data = await this.suppliersService.tao(dto, req.user?.username || 'system');
    return { data };
  }

  @Quyen('giaNcc', 'danhMuc.sua')
  @Put(':id')
  async sua(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SuaNhaCungCapDto,
    @Request() req: any,
  ) {
    const data = await this.suppliersService.sua(id, dto, req.user?.username || 'system');
    return { data };
  }

  /** Ẩn, không xoá — xem ghi chú trong service. */
  @Quyen('giaNcc', 'danhMuc.sua')
  @Delete(':id')
  async an(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.suppliersService.an(id, req.user?.username || 'system');
  }
}
