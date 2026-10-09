import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { VanHanhService } from './van-hanh.service';
import { TuoiNoService } from './tuoi-no.service';
import { KhachHangService } from './khach-hang.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Dashboard Module — thống kê.
 *
 * Ba mảng: KINH DOANH (DashboardService: KH mới, doanh thu, công nợ), VẬN HÀNH
 * (VanHanhService: sản lượng vận chuyển theo tbTracking) và TỔNG QUAN CỦA KHÁCH
 * (KhachHangService: màn /tong-quan, khoá cứng theo username trong JWT).
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, VanHanhService, TuoiNoService, KhachHangService],
  exports: [DashboardService, VanHanhService, TuoiNoService, KhachHangService],
})
export class DashboardModule {}
