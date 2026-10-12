import { Global, Module } from '@nestjs/common';
import { QuyenService } from './quyen.service';

/**
 * Toàn cục vì QuyenGuard chạy ở tầng ứng dụng (APP_GUARD) nên phải tiêm được
 * QuyenService mà không bắt từng module đi import lại.
 */
@Global()
@Module({
  providers: [QuyenService],
  exports: [QuyenService],
})
export class QuyenModule {}
