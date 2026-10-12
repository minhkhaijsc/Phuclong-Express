import { Controller, Get } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('ty-gia')
export class TyGiaController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  /**
   * Mở cho người chưa đăng nhập: trang /ty-gia trên web công khai dùng route
   * này, và nó chỉ trả tỷ giá đang niêm yết — không có dữ liệu khách hàng.
   */
  @Public()
  @Get()
  async findAll() {
    const data = await this.exchangeRatesService.findAll();
    return { data };
  }
}
