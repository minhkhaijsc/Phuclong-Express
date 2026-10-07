import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { VanHanhService } from './van-hanh.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Dashboard Module — thống kê admin.
 *
 * Hai mảng: KINH DOANH (DashboardService: KH mới, doanh thu, công nợ) và
 * VẬN HÀNH (VanHanhService: sản lượng vận chuyển theo tbTracking).
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, VanHanhService],
  exports: [DashboardService, VanHanhService],
})
export class DashboardModule {}
