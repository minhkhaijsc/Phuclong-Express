import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ImageUploadService } from '../services/image-upload.service';

import { MienQuyen } from '../../auth/quyen/quyen.decorator';
/**
 * Generic upload endpoints used across all modules.
 *
 * POST /api/upload/image
 *   - multipart/form-data, field name: "file"
 *   - returns { linkHinh: "/imgLink/YYYYMM/<uuid>.<ext>" }
 *
 * Caller stores the returned `linkHinh` in subsequent create/update payloads
 * (tracking detail, purchased item, in-stock item, etc.).
 */
@Controller('upload')
@UseGuards(JwtAuthGuard)
@MienQuyen('rieng')
export class UploadController {
  constructor(private readonly imageUploadService: ImageUploadService) {}

  @Post('image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ linkHinh: string }> {
    return this.imageUploadService.upload(file);
  }
}
