import { Controller, Get, Put, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';
import type { UpdateExchangeRateDto } from './exchange-rates.service';
import { ExchangeRateSchedulerService } from './exchange-rate-scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
import { Public } from '../common/decorators/public.decorator';
@Controller('exchange-rates')
@MienQuyen('danhMuc')
export class ExchangeRatesController {
  constructor(
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly schedulerService: ExchangeRateSchedulerService,
  ) {}

  @Get()
  async findAll() {
    const data = await this.exchangeRatesService.findAll();
    return { data };
  }

  /**
   * Trang /ty-gia trên web là trang CÔNG KHAI, khách chưa đăng nhập vẫn xem
   * được, và nó nạp bảng này. Không mở thì trang công khai gãy ngay khi bật
   * phân quyền. Dữ liệu ở đây đúng là thứ đang hiển thị công khai, không có
   * gì riêng tư.
   */
  @Public()
  @Get('daily-rates')
  async getDailyRates(@Query('days') days?: string) {
    const daysNum = Math.min(parseInt(days || '60', 10) || 60, 60);
    const data = await this.exchangeRatesService.getDailyRates(daysNum);
    return { data };
  }

  /** Cũng do trang công khai /ty-gia gọi — xem ghi chú ở `daily-rates`. */
  @Public()
  @Get(':name/history')
  async getHistory(@Param('name') name: string) {
    const data = await this.exchangeRatesService.getHistory(name);
    return { data };
  }

  @Get(':name')
  async findOne(@Param('name') name: string) {
    const data = await this.exchangeRatesService.findOne(name);
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @Post('sync')
  async sync() {
    return this.schedulerService.syncFromVietcombank();
  }

  @UseGuards(JwtAuthGuard)
  @Put(':name')
  async update(
    @Param('name') name: string,
    @Body() updateDto: UpdateExchangeRateDto,
    @Request() req: any,
  ) {
    return this.exchangeRatesService.update({ ...updateDto, name }, req.user?.username || 'system');
  }
}
