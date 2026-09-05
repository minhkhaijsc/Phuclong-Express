import { Module } from '@nestjs/common';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Articles Module
 *
 * Quan ly bai viet cho trang tin tuc.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
