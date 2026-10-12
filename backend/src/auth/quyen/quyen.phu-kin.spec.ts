import * as fs from 'fs';
import * as path from 'path';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { MIEN_KEY, QUYEN_KEY } from './quyen.decorator';
import { MIEN, MIEN_CUA_KHACH, QUYEN_LE } from './bo-phan';

/**
 * QuyenGuard ĐÓNG MẶC ĐỊNH: route không gắn @MienQuyen, @Quyen hay @Public thì
 * bị từ chối. Thế thì người thêm route mới sẽ thấy 403 mà không hiểu vì sao —
 * trừ khi có bài kiểm tra này, nó gọi tên đúng cái route bị thiếu nhãn.
 *
 * Quét bằng Reflect trên chính các lớp controller, không đọc chuỗi trong tệp,
 * nên đổi cách xuống dòng hay thứ tự decorator đều không ảnh hưởng.
 */
describe('Phân quyền phủ kín mọi route', () => {
  const goc = path.join(__dirname, '..', '..');

  const timFile = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return timFile(p);
      return e.isFile() && e.name.endsWith('.controller.ts') ? [p] : [];
    });

  const tep = timFile(goc);

  it('tìm được các tệp controller', () => {
    // Nếu đường dẫn đổi mà bài kiểm tra vẫn "xanh" với 0 tệp thì nó vô dụng.
    expect(tep.length).toBeGreaterThan(20);
  });

  const thieu: string[] = [];

  for (const f of tep) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(f);
    for (const ten of Object.keys(mod)) {
      const lop = mod[ten];
      if (typeof lop !== 'function' || !lop.prototype) continue;
      if (Reflect.getMetadata('path', lop) === undefined) continue; // không phải controller

      const coNhanLop =
        Reflect.getMetadata(MIEN_KEY, lop) !== undefined ||
        Reflect.getMetadata(QUYEN_KEY, lop) !== undefined;

      for (const ham of Object.getOwnPropertyNames(lop.prototype)) {
        if (ham === 'constructor') continue;
        const fn = lop.prototype[ham];
        if (typeof fn !== 'function') continue;
        if (Reflect.getMetadata('path', fn) === undefined) continue; // không phải route

        const coNhan =
          coNhanLop ||
          Reflect.getMetadata(MIEN_KEY, fn) !== undefined ||
          Reflect.getMetadata(QUYEN_KEY, fn) !== undefined ||
          Reflect.getMetadata(IS_PUBLIC_KEY, fn) === true ||
          Reflect.getMetadata(IS_PUBLIC_KEY, lop) === true;

        if (!coNhan) thieu.push(`${ten}.${ham}`);
      }
    }
  }

  it('mọi route đều có @MienQuyen, @Quyen hoặc @Public', () => {
    expect(thieu).toEqual([]);
  });

  it('mã quyền trong @Quyen đều là mã có thật', () => {
    const hopLe = new Set<string>([
      ...Object.values(MIEN).flatMap((m) => [`${m}.xem`, `${m}.sua`]),
      ...Object.values(QUYEN_LE),
    ]);
    const sai: string[] = [];

    for (const f of tep) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(f);
      for (const ten of Object.keys(mod)) {
        const lop = mod[ten];
        if (typeof lop !== 'function' || !lop.prototype) continue;
        if (Reflect.getMetadata('path', lop) === undefined) continue;

        const kiem = (ma: unknown, o: string) => {
          for (const x of (ma as string[]) ?? []) {
            if (!hopLe.has(x)) sai.push(`${o}: ${x}`);
          }
        };
        kiem(Reflect.getMetadata(QUYEN_KEY, lop), ten);
        for (const ham of Object.getOwnPropertyNames(lop.prototype)) {
          const fn = lop.prototype[ham];
          if (typeof fn !== 'function' || ham === 'constructor') continue;
          kiem(Reflect.getMetadata(QUYEN_KEY, fn), `${ten}.${ham}`);
        }
      }
    }
    expect(sai).toEqual([]);
  });

  it('khách không được chạm vào miền quản trị', () => {
    // Nếu ai đó mở thêm miền cho khách, bài này đổ — buộc phải cân nhắc.
    for (const m of ['taiKhoan', 'nhatKy', 'dashboard'] as const) {
      expect(MIEN_CUA_KHACH[m]).toBeUndefined();
    }
    expect(MIEN_CUA_KHACH.danhMuc?.sua).toBeUndefined();
  });
});
