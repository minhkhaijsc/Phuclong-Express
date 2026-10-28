import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { HopDongController, HopDongKhachController } from './hop-dong.controller';
import { HopDongService } from './hop-dong.service';

@Module({
  imports: [DatabaseModule, AuthModule, SystemLogsModule],
  controllers: [HopDongController, HopDongKhachController],
  providers: [HopDongService],
})
export class HopDongModule {}
