import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { duocXemLienHeCua } from '../users/che-lien-he';
import { dienMau, docCacO, kichThuocPng, laOAnh, NHAN_O, O_LUC_KY } from './docx-mau';

/**
 * HỢP ĐỒNG MẪU + KÝ ONLINE — yêu cầu bên khách 28/10/2026. Bối cảnh và hai
 * bảng xem `database/migrations/them-hop-dong.sql`; cách điền file xem
 * `docx-mau.ts`.
 *
 * Luồng:
 *   1. Admin/CSKH/Kế toán up file Word mẫu có ô `{TenO}`.
 *   2. Chọn khách + mẫu → máy chủ gợi ý sẵn tên, địa chỉ, SĐT… từ tài khoản
 *      khách; ô nào chưa biết (CCCD…) thì để trống và đánh dấu "khách tự điền".
 *   3. Sinh link `/hop-dong/<MaLink>` gửi khách. Khách mở (không cần đăng nhập)
 *      → xem hợp đồng, điền ô còn thiếu, gõ họ tên, vẽ chữ ký → ký.
 *   4. Lúc ký máy chủ điền lại lần cuối + ảnh chữ ký → `FileDaKy` + mã băm.
 *      Hợp đồng đã ký không sửa được nữa.
 */

export const TRANG_THAI = { choKy: 'cho-ky', daKy: 'da-ky', daHuy: 'da-huy' } as const;

/** File mẫu tối đa — hợp đồng chữ là chính, vài trăm KB là cùng. */
export const MAU_TOI_DA_BYTE = 5 * 1024 * 1024;
/** Ảnh chữ ký vẽ tay trên canvas, PNG. */
export const CHU_KY_TOI_DA_BYTE = 600 * 1024;

const GIO_VN = 'Asia/Ho_Chi_Minh';

const haiSo = (n: number) => String(n).padStart(2, '0');

/** Ngày theo giờ Việt Nam, dạng dd/MM/yyyy (máy chủ có thể không chạy giờ VN). */
export function ngayVN(d: Date): { ngay: string; thang: string; nam: string; du: string } {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: GIO_VN,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const lay = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const ngay = lay('day');
  const thang = lay('month');
  const nam = lay('year');
  return { ngay, thang, nam, du: `${ngay}/${thang}/${nam}` };
}

export function gioVN(d: Date): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: GIO_VN,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${p} ${ngayVN(d).du}`;
}

/** Ngày hết hiệu lực mặc định: một năm, trừ một ngày (01/11/2026 → 31/10/2027). */
export function hetHanMacDinh(tu: Date): string {
  const d = new Date(tu.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return ngayVN(d).du;
}

/** Số hợp đồng tự sinh: 0007/2026/MKL-<tài khoản>. */
export const soHopDongTuDong = (id: number, nam: string, userName: string) =>
  `${String(id).padStart(4, '0')}/${nam}/MKL-${userName}`;

/** Giữ lại đúng các ô hợp lệ, cắt độ dài — dữ liệu từ ngoài vào. */
export function locDuLieu(
  duLieu: unknown,
  choPhep: readonly string[],
): Record<string, string> {
  const ra: Record<string, string> = {};
  if (!duLieu || typeof duLieu !== 'object') return ra;
  for (const o of choPhep) {
    if (laOAnh(o) || O_LUC_KY.includes(o)) continue;
    const v = (duLieu as Record<string, unknown>)[o];
    if (v === undefined || v === null) continue;
    ra[o] = String(v).trim().slice(0, 500);
  }
  return ra;
}

interface DongMau {
  MauID: number;
  Ten: string;
  TenFile: string;
  CacO: string;
  NguoiTao: string | null;
  NgayTao: Date;
}

interface DongHopDong {
  HopDongID: number;
  MaLink: string;
  MauID: number;
  UserName: string;
  SoHopDong: string | null;
  DuLieu: string;
  OKhachDien: string | null;
  TrangThai: string;
  NguoiTao: string | null;
  NgayTao: Date;
  LanXemDau: Date | null;
  NgayKy: Date | null;
  TenNguoiKy: string | null;
  UserKy: string | null;
  IpKy: string | null;
  NgayHuy: Date | null;
  NguoiHuy: string | null;
  LyDoHuy: string | null;
}

const COT_HOP_DONG = `h.HopDongID, h.MaLink, h.MauID, h.UserName, h.SoHopDong, h.DuLieu, h.OKhachDien,
  h.TrangThai, h.NguoiTao, h.NgayTao, h.LanXemDau, h.NgayKy, h.TenNguoiKy, h.UserKy, h.IpKy,
  h.NgayHuy, h.NguoiHuy, h.LyDoHuy`;

const docJson = <T>(s: string | null | undefined, macDinh: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : macDinh;
  } catch {
    return macDinh;
  }
};

export interface YeuCauTao {
  mauId: number;
  userName: string;
  duLieu: Record<string, unknown>;
  /** Ô để khách tự điền lúc ký. */
  oKhachDien?: string[];
}

export interface YeuCauKy {
  tenNguoiKy: string;
  dongY: boolean;
  /** Ảnh chữ ký PNG, base64 (có hoặc không có tiền tố data:). */
  chuKy: string;
  /** Giá trị khách điền cho các ô `OKhachDien`. */
  duLieu?: Record<string, unknown>;
}

@Injectable()
export class HopDongService {
  constructor(
    @Inject('SEQUELIZE') private readonly sequelize: Sequelize,
    private readonly nhatKy: SystemLogsService,
  ) {}

  private async ghiNhatKy(nguoi: string, hanhDong: string, doiTuong: string, noiDung: string) {
    try {
      await this.nhatKy.create({ nguoiTao: nguoi || 'khach', nguon: 'HopDong', hanhDong, doiTuong, noiDung });
    } catch {
      /* nhật ký hỏng không được chặn nghiệp vụ */
    }
  }

  // ---------------------------------------------------------------- MẪU

  async danhSachMau() {
    const rows = await this.sequelize.query<DongMau>(
      `SELECT MauID, Ten, TenFile, CacO, NguoiTao, NgayTao
         FROM dbo.tbHopDongMau WHERE DaXoa = 0 ORDER BY NgayTao DESC`,
      { type: QueryTypes.SELECT },
    );
    return rows.map((r) => ({ ...r, CacO: docJson<string[]>(r.CacO, []) }));
  }

  async taoMau(file: Express.Multer.File | undefined, ten: string, nguoi: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Chưa chọn file mẫu.');
    if (file.size > MAU_TOI_DA_BYTE) throw new BadRequestException('File mẫu quá 5MB.');
    if (!/\.docx$/i.test(file.originalname || '')) {
      throw new BadRequestException('Mẫu phải là file Word .docx (file .doc cũ hãy mở bằng Word rồi Lưu thành .docx).');
    }
    let cacO: string[];
    try {
      cacO = await docCacO(file.buffer);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'Không đọc được file mẫu.');
    }
    if (!cacO.length) {
      throw new BadRequestException(
        'Mẫu chưa có ô nào để điền. Gõ chỗ cần điền dạng {TenKhach}, {DiaChi}… rồi up lại.',
      );
    }
    const tenMau = String(ten || '').trim().slice(0, 200) || file.originalname.replace(/\.docx$/i, '');
    const [r] = await this.sequelize.query<{ MauID: number }>(
      `INSERT INTO dbo.tbHopDongMau (Ten, TenFile, NoiDung, CacO, NguoiTao)
       VALUES (:ten, :tenFile, :noiDung, :cacO, :nguoi);
       SELECT CAST(SCOPE_IDENTITY() AS int) AS MauID;`,
      {
        replacements: {
          ten: tenMau,
          tenFile: String(file.originalname).slice(0, 260),
          noiDung: file.buffer,
          cacO: JSON.stringify(cacO),
          nguoi,
        },
        type: QueryTypes.SELECT,
      },
    );
    await this.ghiNhatKy(nguoi, 'Them mau', String(r.MauID), `Ten: ${tenMau}; O: ${cacO.join(', ')}`);
    return { mauId: r.MauID, ten: tenMau, cacO };
  }

  async xoaMau(mauId: number, nguoi: string) {
    await this.sequelize.query(
      `UPDATE dbo.tbHopDongMau SET DaXoa = 1, NguoiXoa = :nguoi, NgayXoa = GETDATE()
        WHERE MauID = :mauId AND DaXoa = 0`,
      { replacements: { mauId, nguoi } },
    );
    await this.ghiNhatKy(nguoi, 'Xoa mau', String(mauId), '');
    return { ok: true };
  }

  /** File mẫu — kể cả mẫu đã xoá, vì hợp đồng cũ còn trỏ tới. */
  private async fileMau(mauId: number): Promise<{ NoiDung: Buffer; CacO: string[]; Ten: string }> {
    const [r] = await this.sequelize.query<{ NoiDung: Buffer; CacO: string; Ten: string }>(
      `SELECT NoiDung, CacO, Ten FROM dbo.tbHopDongMau WHERE MauID = :mauId`,
      { replacements: { mauId }, type: QueryTypes.SELECT },
    );
    if (!r) throw new NotFoundException('Không tìm thấy mẫu hợp đồng.');
    return { NoiDung: Buffer.from(r.NoiDung), CacO: docJson<string[]>(r.CacO, []), Ten: r.Ten };
  }

  async taiMau(mauId: number) {
    const [r] = await this.sequelize.query<{ NoiDung: Buffer; TenFile: string }>(
      `SELECT NoiDung, TenFile FROM dbo.tbHopDongMau WHERE MauID = :mauId`,
      { replacements: { mauId }, type: QueryTypes.SELECT },
    );
    if (!r) throw new NotFoundException('Không tìm thấy mẫu hợp đồng.');
    return { file: Buffer.from(r.NoiDung), tenFile: r.TenFile };
  }

  // ---------------------------------------------------------------- TẠO

  /**
   * Gợi ý giá trị cho các ô từ tài khoản khách. SĐT/email chỉ điền khi người
   * tạo được xem liên hệ của khách đó (sales chỉ xem khách mình phụ trách, kế
   * toán không xem) — không thì để trống cho khách tự điền lúc ký.
   */
  async goiY(userName: string, req: any) {
    const [u] = await this.sequelize.query<any>(
      `SELECT TOP 1 u.UserName, u.HoTen, u.DiaChi, u.TinhThanh, u.PhoneNumber, u.Email, u.CSKHPhuTrach,
              CASE WHEN EXISTS (SELECT 1 FROM dbo.AspNetUserRoles r WHERE r.UserId = u.Id) THEN 1 ELSE 0 END AS laNhanVien
         FROM dbo.AspNetUsers u WHERE u.UserName = :userName`,
      { replacements: { userName: String(userName || '').trim() }, type: QueryTypes.SELECT },
    );
    if (!u) throw new NotFoundException('Không tìm thấy tài khoản khách.');
    if (Number(u.laNhanVien) === 1) throw new BadRequestException('Tài khoản này là nhân viên, không phải khách.');

    const homNay = ngayVN(new Date());
    const xemLienHe = duocXemLienHeCua(req, u.CSKHPhuTrach, u.UserName);
    const diaChi = [u.DiaChi, u.TinhThanh].map((x: any) => String(x ?? '').trim()).filter(Boolean).join(', ');
    return {
      userName: u.UserName as string,
      duLieu: {
        TenKhach: String(u.HoTen || u.UserName).trim(),
        DiaChi: diaChi,
        SoDienThoai: xemLienHe ? String(u.PhoneNumber ?? '').trim() : '',
        Email: xemLienHe ? String(u.Email ?? '').trim() : '',
        Ngay: homNay.ngay,
        Thang: homNay.thang,
        Nam: homNay.nam,
        HieuLucTu: homNay.du,
        HieuLucDen: hetHanMacDinh(new Date()),
      } as Record<string, string>,
      anLienHe: !xemLienHe,
    };
  }

  async tao(y: YeuCauTao, nguoi: string) {
    const mau = await this.fileMau(Number(y.mauId));
    const userName = String(y.userName || '').trim();
    const [u] = await this.sequelize.query<{ UserName: string }>(
      `SELECT TOP 1 UserName FROM dbo.AspNetUsers WHERE UserName = :userName`,
      { replacements: { userName }, type: QueryTypes.SELECT },
    );
    if (!u) throw new NotFoundException('Không tìm thấy tài khoản khách.');

    const duLieu = locDuLieu(y.duLieu, mau.CacO);
    const oKhachDien = (Array.isArray(y.oKhachDien) ? y.oKhachDien : [])
      .map(String)
      .filter((o) => mau.CacO.includes(o) && !laOAnh(o) && !O_LUC_KY.includes(o) && o !== 'SoHopDong');
    const maLink = randomBytes(24).toString('hex');

    const [r] = await this.sequelize.query<{ HopDongID: number }>(
      `INSERT INTO dbo.tbHopDong (MaLink, MauID, UserName, SoHopDong, DuLieu, OKhachDien, NguoiTao)
       VALUES (:maLink, :mauId, :userName, NULL, :duLieu, :oKhachDien, :nguoi);
       SELECT CAST(SCOPE_IDENTITY() AS int) AS HopDongID;`,
      {
        replacements: {
          maLink,
          mauId: Number(y.mauId),
          userName: u.UserName,
          duLieu: JSON.stringify(duLieu),
          oKhachDien: JSON.stringify(oKhachDien),
          nguoi,
        },
        type: QueryTypes.SELECT,
      },
    );
    const id = r.HopDongID;
    const soHopDong = duLieu.SoHopDong || soHopDongTuDong(id, duLieu.Nam || ngayVN(new Date()).nam, u.UserName);
    duLieu.SoHopDong = soHopDong;
    await this.sequelize.query(
      `UPDATE dbo.tbHopDong SET SoHopDong = :soHopDong, DuLieu = :duLieu WHERE HopDongID = :id`,
      { replacements: { id, soHopDong, duLieu: JSON.stringify(duLieu) } },
    );
    await this.ghiNhatKy(nguoi, 'Tao hop dong', String(id), `So: ${soHopDong}; Khach: ${u.UserName}; Mau: ${mau.Ten}`);
    return { hopDongId: id, maLink, soHopDong };
  }

  async danhSach(q: { userName?: string; trangThai?: string; page?: number; limit?: number }) {
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const dk: string[] = ['1 = 1'];
    const p: Record<string, unknown> = { boQua: (page - 1) * limit, lay: limit };
    if (q.userName) {
      dk.push('(h.UserName LIKE :tim OR h.SoHopDong LIKE :tim)');
      p.tim = `%${String(q.userName).trim()}%`;
    }
    if (q.trangThai && Object.values(TRANG_THAI).includes(q.trangThai as any)) {
      dk.push('h.TrangThai = :trangThai');
      p.trangThai = q.trangThai;
    }
    const where = dk.join(' AND ');
    const [rows, [dem]] = await Promise.all([
      this.sequelize.query<DongHopDong & { TenMau: string; HoTen: string | null }>(
        `SELECT ${COT_HOP_DONG}, m.Ten AS TenMau, u.HoTen
           FROM dbo.tbHopDong h
           JOIN dbo.tbHopDongMau m ON m.MauID = h.MauID
           LEFT JOIN dbo.AspNetUsers u ON u.UserName = h.UserName
          WHERE ${where}
          ORDER BY h.HopDongID DESC
          OFFSET :boQua ROWS FETCH NEXT :lay ROWS ONLY`,
        { replacements: p, type: QueryTypes.SELECT },
      ),
      this.sequelize.query<{ tong: number }>(
        `SELECT COUNT(*) AS tong FROM dbo.tbHopDong h WHERE ${where}`,
        { replacements: p, type: QueryTypes.SELECT },
      ),
    ]);
    return {
      data: rows.map(({ DuLieu, OKhachDien, ...r }) => ({
        ...r,
        tenKhach: docJson<Record<string, string>>(DuLieu, {}).TenKhach ?? r.HoTen ?? r.UserName,
        oKhachDien: docJson<string[]>(OKhachDien, []),
      })),
      total: Number(dem?.tong ?? 0),
      page,
      limit,
    };
  }

  async huy(id: number, lyDo: string, nguoi: string) {
    const [r] = await this.sequelize.query<{ HopDongID: number }>(
      `UPDATE dbo.tbHopDong SET TrangThai = 'da-huy', NgayHuy = GETDATE(), NguoiHuy = :nguoi, LyDoHuy = :lyDo
        OUTPUT inserted.HopDongID
        WHERE HopDongID = :id AND TrangThai = 'cho-ky'`,
      { replacements: { id, nguoi, lyDo: String(lyDo || '').slice(0, 500) }, type: QueryTypes.SELECT },
    );
    if (!r) throw new ConflictException('Chỉ huỷ được hợp đồng đang chờ ký.');
    await this.ghiNhatKy(nguoi, 'Huy hop dong', String(id), `LyDo: ${lyDo || ''}`);
    return { ok: true };
  }

  // ---------------------------------------------------------------- FILE

  private async motHopDong(dieuKien: string, p: Record<string, unknown>) {
    const [r] = await this.sequelize.query<DongHopDong & { TenMau: string }>(
      `SELECT TOP 1 ${COT_HOP_DONG}, m.Ten AS TenMau
         FROM dbo.tbHopDong h JOIN dbo.tbHopDongMau m ON m.MauID = h.MauID
        WHERE ${dieuKien}`,
      { replacements: p, type: QueryTypes.SELECT },
    );
    return r;
  }

  /** File để xem: đã ký thì đúng bản đã ký, chưa ký thì điền tạm từ mẫu. */
  private async fileCua(h: DongHopDong): Promise<Buffer> {
    if (h.TrangThai === TRANG_THAI.daKy) {
      const [r] = await this.sequelize.query<{ FileDaKy: Buffer }>(
        `SELECT FileDaKy FROM dbo.tbHopDong WHERE HopDongID = :id`,
        { replacements: { id: h.HopDongID }, type: QueryTypes.SELECT },
      );
      if (r?.FileDaKy) return Buffer.from(r.FileDaKy);
    }
    const mau = await this.fileMau(h.MauID);
    return dienMau(mau.NoiDung, docJson<Record<string, string>>(h.DuLieu, {}));
  }

  tenFile(h: { SoHopDong: string | null; UserName: string; TrangThai: string }) {
    const goc = `HopDong_${h.UserName}_${h.SoHopDong ?? ''}${h.TrangThai === TRANG_THAI.daKy ? '_DaKy' : ''}`;
    return goc.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/-+/g, '-').slice(0, 150) + '.docx';
  }

  async fileTheoId(id: number) {
    const h = await this.motHopDong('h.HopDongID = :id', { id });
    if (!h) throw new NotFoundException('Không tìm thấy hợp đồng.');
    return { file: await this.fileCua(h), tenFile: this.tenFile(h) };
  }

  // ---------------------------------------------------------------- PHÍA KHÁCH

  private async theoMa(ma: string) {
    const sach = String(ma || '').trim();
    if (!/^[a-f0-9]{32,64}$/.test(sach)) throw new NotFoundException('Link hợp đồng không đúng.');
    const h = await this.motHopDong('h.MaLink = :ma', { ma: sach });
    if (!h) throw new NotFoundException('Link hợp đồng không đúng hoặc đã bị xoá.');
    return h;
  }

  /** Thông tin cho trang ký. Không trả dữ liệu ô ngoài các ô khách cần điền. */
  async xemTheoMa(ma: string) {
    const h = await this.theoMa(ma);
    if (!h.LanXemDau && h.TrangThai === TRANG_THAI.choKy) {
      await this.sequelize.query(
        `UPDATE dbo.tbHopDong SET LanXemDau = GETDATE() WHERE HopDongID = :id AND LanXemDau IS NULL`,
        { replacements: { id: h.HopDongID } },
      );
    }
    const duLieu = docJson<Record<string, string>>(h.DuLieu, {});
    const oKhachDien = docJson<string[]>(h.OKhachDien, []);
    return {
      soHopDong: h.SoHopDong,
      tenMau: h.TenMau,
      tenKhach: duLieu.TenKhach ?? h.UserName,
      trangThai: h.TrangThai,
      ngayTao: h.NgayTao,
      ngayKy: h.NgayKy,
      tenNguoiKy: h.TenNguoiKy,
      lyDoHuy: h.TrangThai === TRANG_THAI.daHuy ? h.LyDoHuy : null,
      oKhachDien: oKhachDien.map((o) => ({ ten: o, nhan: NHAN_O[o] ?? o, giaTri: duLieu[o] ?? '' })),
      tenFile: this.tenFile(h),
    };
  }

  async fileTheoMa(ma: string) {
    const h = await this.theoMa(ma);
    if (h.TrangThai === TRANG_THAI.daHuy) throw new NotFoundException('Hợp đồng đã bị huỷ.');
    return { file: await this.fileCua(h), tenFile: this.tenFile(h) };
  }

  async ky(ma: string, y: YeuCauKy, ngoaiCanh: { ip: string; trinhDuyet: string; userKy: string | null }) {
    const h = await this.theoMa(ma);
    if (h.TrangThai === TRANG_THAI.daKy) throw new ConflictException('Hợp đồng này đã được ký.');
    if (h.TrangThai === TRANG_THAI.daHuy) throw new ConflictException('Hợp đồng đã bị huỷ, không ký được.');
    if (y?.dongY !== true) throw new BadRequestException('Cần tick đồng ý với nội dung hợp đồng trước khi ký.');

    const ten = String(y.tenNguoiKy || '').replace(/\s+/g, ' ').trim();
    if (ten.length < 2 || ten.length > 200) throw new BadRequestException('Nhập họ tên người ký.');

    const raw = String(y.chuKy || '').replace(/^data:image\/png;base64,/, '');
    let png: Buffer = Buffer.from(raw, 'base64');
    if (!png.length) throw new BadRequestException('Chưa có chữ ký.');
    if (png.length > CHU_KY_TOI_DA_BYTE) throw new BadRequestException('Ảnh chữ ký quá lớn.');
    try {
      kichThuocPng(png);
    } catch {
      throw new BadRequestException('Ảnh chữ ký không hợp lệ.');
    }
    // Cắt viền trắng/trong suốt quanh nét ký cho chữ ký khỏi lọt thỏm trong khung.
    try {
      const sharp = (await import('sharp')).default;
      png = await sharp(png).trim().png().toBuffer();
    } catch {
      /* không cắt được thì dùng ảnh gốc */
    }

    const duLieu = docJson<Record<string, string>>(h.DuLieu, {});
    const oKhachDien = docJson<string[]>(h.OKhachDien, []);
    const khachDien = locDuLieu(y.duLieu, oKhachDien);
    const thieu = oKhachDien.filter((o) => !String(khachDien[o] ?? duLieu[o] ?? '').trim());
    if (thieu.length) {
      throw new BadRequestException(`Còn thiếu: ${thieu.map((o) => NHAN_O[o] ?? o).join(', ')}.`);
    }

    const luc = new Date();
    const cuoi: Record<string, string> = {
      ...duLieu,
      ...khachDien,
      TenNguoiKy: ten,
      XacNhanKy: `Đã ký điện tử lúc ${gioVN(luc)}`,
    };
    const mau = await this.fileMau(h.MauID);
    const file = await dienMau(mau.NoiDung, cuoi, { ChuKyBenB: { png } });
    const bam = createHash('sha256').update(file).digest('hex');

    // Chỉ ghi khi vẫn đang chờ ký — hai người bấm Ký cùng lúc thì một người thua.
    const [r] = await this.sequelize.query<{ HopDongID: number }>(
      `UPDATE dbo.tbHopDong
          SET TrangThai = 'da-ky', NgayKy = GETDATE(), TenNguoiKy = :ten, UserKy = :userKy,
              IpKy = :ip, TrinhDuyetKy = :trinhDuyet, AnhChuKy = :anh, FileDaKy = :file,
              BamFileDaKy = :bam, DuLieu = :duLieu
        OUTPUT inserted.HopDongID
        WHERE HopDongID = :id AND TrangThai = 'cho-ky'`,
      {
        replacements: {
          id: h.HopDongID,
          ten,
          userKy: ngoaiCanh.userKy,
          ip: String(ngoaiCanh.ip || '').slice(0, 64),
          trinhDuyet: String(ngoaiCanh.trinhDuyet || '').slice(0, 400),
          anh: png,
          file,
          bam,
          duLieu: JSON.stringify(cuoi),
        },
        type: QueryTypes.SELECT,
      },
    );
    if (!r) throw new ConflictException('Hợp đồng vừa được ký hoặc huỷ ở nơi khác. Tải lại trang.');
    await this.ghiNhatKy(
      ngoaiCanh.userKy || 'khach-qua-link',
      'Ky hop dong',
      String(h.HopDongID),
      `So: ${h.SoHopDong}; Khach: ${h.UserName}; NguoiKy: ${ten}; IP: ${ngoaiCanh.ip}; SHA256: ${bam}`,
    );
    return { ok: true, ngayKy: luc, bam };
  }

  /** Hợp đồng của chính khách đang đăng nhập. */
  async cuaToi(userName: string) {
    const rows = await this.sequelize.query<DongHopDong & { TenMau: string }>(
      `SELECT ${COT_HOP_DONG}, m.Ten AS TenMau
         FROM dbo.tbHopDong h JOIN dbo.tbHopDongMau m ON m.MauID = h.MauID
        WHERE h.UserName = :userName AND h.TrangThai <> 'da-huy'
        ORDER BY h.HopDongID DESC`,
      { replacements: { userName }, type: QueryTypes.SELECT },
    );
    return rows.map((h) => ({
      maLink: h.MaLink,
      soHopDong: h.SoHopDong,
      tenMau: h.TenMau,
      trangThai: h.TrangThai,
      ngayTao: h.NgayTao,
      ngayKy: h.NgayKy,
    }));
  }
}
