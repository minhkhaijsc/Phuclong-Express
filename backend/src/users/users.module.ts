import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TrangThaiKhachService } from './trang-thai-khach.service';
import { DuLieuTaiKhoanService } from './du-lieu-tai-khoan.service';
import { TaoTaiKhoanService } from './tao-tai-khoan.service';
import { DatabaseModule } from '../database/database.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Users Module
 */
@Module({
  imports: [
    DatabaseModule,
    SystemLogsModule,
    AuthModule,
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, TrangThaiKhachService, DuLieuTaiKhoanService, TaoTaiKhoanService],
  exports: [UsersService, TrangThaiKhachService, DuLieuTaiKhoanService, TaoTaiKhoanService],
})
export class UsersModule {}
