import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Kiểm tra máy chủ còn sống — phải mở, giám sát gọi không kèm token. */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
