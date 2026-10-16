import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { VanHanhService } from './van-hanh.service';
import { TuoiNoService } from './tuoi-no.service';
import { KhachHangService } from './khach-hang.service';
import { SanLuongKhachService } from './san-luong-khach.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';

/**
 * Dashboard Module — thống kê.
 *
 * Ba mảng: KINH DOANH (DashboardService: KH mới, doanh thu, công nợ), VẬN HÀNH
 * (VanHanhService: sản lượng vận chuyển theo tbTracking) và TỔNG QUAN CỦA KHÁCH
 * (KhachHangService: màn /tong-quan, khoá cứng theo username trong JWT).
 *
 * Thêm SanLuongKhachService: báo cáo sản lượng theo khách × tuyến, màn con nằm
 * dưới Dashboard thống kê.
 */
@Module({
  // SystemLogsModule: đặt tuổi nợ là đường GHI, phải ghi nhật ký ai đặt.
  imports: [DatabaseModule, AuthModule, SystemLogsModule],
  controllers: [DashboardController],
  providers: [DashboardService, VanHanhService, TuoiNoService, KhachHangService, SanLuongKhachService],
  exports: [DashboardService, VanHanhService, TuoiNoService, KhachHangService, SanLuongKhachService],
})
export class DashboardModule {}
