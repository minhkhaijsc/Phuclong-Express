import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { ImageUploadService } from './image-upload.service';

describe('ImageUploadService.luuAnhHang — ảnh chụp hàng', () => {
  const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'anh-hang-'));
  let service: ImageUploadService;

  beforeAll(() => {
    process.env.UPLOAD_DIR = thuMuc;
    service = new ImageUploadService();
  });
  afterAll(() => {
    delete process.env.UPLOAD_DIR;
    fs.rmSync(thuMuc, { recursive: true, force: true });
  });

  const duongDan = (link: string) =>
    path.join(thuMuc, ...link.replace(/^\/imgLink\//, '').split('/'));

  it('ảnh điện thoại chụp dọc (lưu ngang + cờ xoay EXIF) ra đúng chiều dọc, cạnh dài 1600', async () => {
    // 3000x2000 kèm orientation 6 = điện thoại cầm dọc
    const goc = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#c33' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const { linkHinh } = await service.luuAnhHang(goc);
    expect(linkHinh).toMatch(/^\/imgLink\/\d{6}\/[0-9a-f-]{36}\.jpg$/);

    const m = await sharp(duongDan(linkHinh)).metadata();
    expect(m.format).toBe('jpeg');
    expect([m.width, m.height]).toEqual([1067, 1600]);
    expect(m.orientation ?? 1).toBe(1);
  });

  it('ảnh nhỏ không bị phóng to; PNG đổi sang JPEG', async () => {
    const png = await sharp({
      create: { width: 800, height: 600, channels: 4, background: '#0a0' },
    })
      .png()
      .toBuffer();
    const { linkHinh } = await service.luuAnhHang(png);
    const m = await sharp(duongDan(linkHinh)).metadata();
    expect([m.format, m.width, m.height]).toEqual(['jpeg', 800, 600]);
  });

  it('file hỏng báo lỗi dễ hiểu; xoaFile gỡ đúng file, bỏ qua đường dẫn lạ', async () => {
    await expect(
      service.luuAnhHang(Buffer.from('khong phai anh')),
    ).rejects.toThrow('Không đọc được ảnh');

    const jpg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#000' },
    })
      .jpeg()
      .toBuffer();
    const { linkHinh } = await service.luuAnhHang(jpg);
    expect(fs.existsSync(duongDan(linkHinh))).toBe(true);
    service.xoaFile('/imgLink/../../windows/win.ini');
    service.xoaFile(linkHinh);
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(duongDan(linkHinh))).toBe(false);
  });
});
