import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

/**
 * Walk up from __dirname until package.json found → that is the app root.
 * Works regardless of how Plesk/Passenger sets process.cwd().
 */
function findAppRoot(): string {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Shared Image Upload Service.
 *
 * Ports the v1 (ASP.NET) upload pattern used across:
 *  - EditOrderDetail.cs, QLDatHang_Them.cs (orders)
 *  - Tracking_ThemSua.cs, SuaTracking.cs (tracking detail)
 *  - HangKhoan_Them.cs (purchased items)
 *  - HangCoSan_Them.cs (in-stock items — folded into /imgLink/YYYYMM/)
 *
 * Behavior matches v1: UUID filename + YYYYMM subfolder + resize to 640x480
 * preserving aspect ratio, no enlargement.
 */
@Injectable()
export class ImageUploadService {
  private readonly uploadDir =
    process.env.UPLOAD_DIR || path.join(findAppRoot(), 'imgLink');

  async upload(file: Express.Multer.File): Promise<{ linkHinh: string }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '');
    const targetDir = path.join(this.uploadDir, yearMonth);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const ext = path.extname(file.originalname || '.jpg').toLowerCase();
    const filename = `${uuidv4()}${ext}`;
    const filepath = path.join(targetDir, filename);

    await sharp(file.buffer)
      .resize(640, 480, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toFile(filepath);

    return { linkHinh: `/imgLink/${yearMonth}/${filename}` };
  }

  /**
   * Lưu ảnh chụp hàng (ảnh tracking up theo thư mục).
   *
   * Khác `upload()` ở ba chỗ, đều vì đây là ảnh để NHÌN RÕ món hàng:
   *  - xoay theo EXIF: ảnh điện thoại chụp dọc lưu ngang kèm cờ xoay, không
   *    xoay thì lên web nằm nghiêng (sharp bỏ EXIF khi ghi ra).
   *  - cạnh dài tối đa 1600px thay vì 640x480 — 640 không đọc nổi nhãn hàng.
   *  - luôn ghi JPEG: PNG/WebP chụp màn hình vẫn nhẹ, và đường dẫn đồng nhất.
   */
  async luuAnhHang(buffer: Buffer): Promise<{ linkHinh: string }> {
    const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '');
    const targetDir = path.join(this.uploadDir, yearMonth);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filename = `${uuidv4()}.jpg`;
    try {
      await sharp(buffer)
        .rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(path.join(targetDir, filename));
    } catch {
      throw new BadRequestException('Không đọc được ảnh (file hỏng hoặc định dạng chưa hỗ trợ).');
    }

    return { linkHinh: `/imgLink/${yearMonth}/${filename}` };
  }

  /** Gỡ file vừa ghi khi bước lưu cơ sở dữ liệu sau đó hỏng — khỏi để ảnh mồ côi. */
  xoaFile(linkHinh: string): void {
    const m = /^\/imgLink\/(\d{6})\/([0-9a-f-]+\.jpg)$/i.exec(linkHinh);
    if (!m) return;
    fs.promises.unlink(path.join(this.uploadDir, m[1], m[2])).catch(() => undefined);
  }
}
