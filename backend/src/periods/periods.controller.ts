import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { PeriodsService } from './periods.service';
import type { CreatePeriodDto, UpdatePeriodDto, QueryPeriodDetailDto } from './periods.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
@Controller('periods')
@MienQuyen('danhMuc')
export class PeriodsController {
  constructor(private readonly periodsService: PeriodsService) {}

  // Period List endpoints
  @Get()
  async findAll() {
    const data = await this.periodsService.findAll();
    return { data };
  }

  // GET /periods/by-status?daDong=true|false
  // Matches: DBConnect.LayDanhSachKyByTinhTrang(@DaDong) → SP_Lay_KyByTinhTrang
  @Get('by-status')
  async findByStatus(@Query('daDong') daDong: string) {
    const data = await this.periodsService.findByStatus(daDong === 'true');
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.periodsService.findOne(Number(id));
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() createDto: CreatePeriodDto, @Request() req: any) {
    return this.periodsService.create(createDto, req.user?.username || 'system');
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() updateDto: UpdatePeriodDto, @Request() req: any) {
    return this.periodsService.update({ ...updateDto, id: Number(id) }, req.user?.username || 'system');
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.periodsService.remove(Number(id), req.user?.username || 'system');
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/close')
  async closePeriod(@Param('id') id: string, @Request() req: any) {
    return this.periodsService.closePeriod(Number(id), req.user?.username || 'system');
  }

  // Period Detail endpoints (ChotKy)
  @Get('details/list')
  async findAllDetails(@Query() query: QueryPeriodDetailDto) {
    return this.periodsService.findAllDetails(query);
  }

  @UseGuards(JwtAuthGuard)
  @Post('details/:id/temp-open')
  async tempOpenPeriod(@Param('id') id: string, @Request() req: any) {
    return this.periodsService.tempOpenPeriod(Number(id), req.user?.username || 'system');
  }

  @UseGuards(JwtAuthGuard)
  @Post('details/:id/temp-close')
  async closeTempOpenPeriod(@Param('id') id: string, @Request() req: any) {
    return this.periodsService.closeTempOpenPeriod(Number(id), req.user?.username || 'system');
  }

  /**
   * GET /periods/user/dot-hang-gui
   * Get sent shipment batches for user with pagination (DotHangUser.aspx)
   * Matches: DotHangUser.cs -> SP_Lay_DotHangGui(@UserName, @PageSize=20, @PageNum)
   */
  @Get('user/dot-hang-gui')
  async getDotHangGui(
    @Query('username') username: string,
    @Query('pageSize') pageSize?: string,
    @Query('pageNum') pageNum?: string,
  ) {
    return this.periodsService.getDotHangGui(username, pageSize ? Number(pageSize) : 20, pageNum ? Number(pageNum) : 1);
  }

  /**
   * GET /periods/user/ten-dot-hang
   * Get shipment batch name dropdown for user (ThongTinDotHang.aspx)
   * Matches: ThongTinDotHang.cs -> SP_Lay_TenDotHangByUserName(@UserName)
   */
  @Get('user/ten-dot-hang')
  async getTenDotHangByUserName(@Query('username') username: string) {
    return this.periodsService.getTenDotHangByUserName(username);
  }

  /**
   * GET /periods/user/don-hang-theo-dot-hang
   * Get orders in a shipment batch (ThongTinDotHang.aspx - btTimKiem)
   * Matches: ThongTinDotHang.cs -> SP_Lay_DonHangUserTheoDotHang(@TenDotHang, @UserName)
   */
  @Get('user/don-hang-theo-dot-hang')
  async getDonHangUserTheoDotHang(
    @Query('tenDotHang') tenDotHang: string,
    @Query('username') username: string,
  ) {
    return this.periodsService.getDonHangUserTheoDotHang(tenDotHang, username);
  }
}
