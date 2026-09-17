import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { DatabaseModule } from '../database/database.module';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { AuthModule } from '../auth/auth.module';
import { AnhTrackingController } from './anh-tracking.controller';
import { AnhTrackingService } from './anh-tracking.service';

/**
 * Tracking Module
 *
 * Handles tracking management.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  // Ảnh đứng trước: đường dẫn /tracking/anh/* phải được xét trước /tracking/:id.
  controllers: [AnhTrackingController, TrackingController],
  providers: [TrackingService, AnhTrackingService, SystemLogsService],
  exports: [TrackingService],
})
export class TrackingModule {}
