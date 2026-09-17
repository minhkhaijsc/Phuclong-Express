import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { ImageUploadService } from '../common/services/image-upload.service';
import {
  khoaSo,
  laTenAnh,
  tenCoSo,
  ungVienTracking,
} from './anh-tracking.helper';

export interface TrackingKhop {
  TrackingID: number;
  TrackingNumber: string;
  UserName: string | null;
  TinhTrang: string | null;
}

export interface KetQuaKhop {
  tenFile: string;
  laAnh: boolean;
  /** Số tracking đúng như trong hệ thống; null nếu không khớp. */
  soTracking: string | null;
  /** Khớp được nhờ bỏ đuôi `_1`, `(2)`… chứ không phải tên nguyên văn. */
  boDuoi: boolean;
  tracking: Omit<TrackingKhop, 'TrackingNumber'>[];
  soAnhDaCo: number;
  /** Tracking này đã có ảnh cùng tên file — up nữa sẽ THAY ảnh cũ. */
  trungTen: boolean;
}

export interface AnhTracking {
  AnhTrackingID: number;
  TrackingID: number;
  LinkHinh: string;
  TenFileGoc: string | null;
  NguoiTao: string | null;
  NgayTao: string;
}

/** SQL Server giới hạn 2100 tham số một lệnh; chia nhỏ cho an toàn. */
const CO_LO = 500;

const chiaLo = <T>(ds: T[], co = CO_LO): T[][] => {
  const ra: T[][] = [];
  for (let i = 0; i < ds.length; i += co) ra.push(ds.slice(i, i + co));
  return ra;
};

const thieuBang = (e: unknown) =>
  /Invalid object name.*tbAnhTracking/i.test(String((e as any)?.message ?? e));

/**
 * Ảnh hàng gắn vào tracking.
 *
 * Kho up cả thư mục ảnh, tên ảnh = số tracking. Ảnh có thể ít hơn số tracking
 * trong file Excel — tracking nào không có ảnh thì thôi.
 */
@Injectable()
export class AnhTrackingService {
  constructor(
    @Inject('SEQUELIZE') private sequelize: Sequelize,
    private readonly systemLogsService: SystemLogsService,
    private readonly imageUploadService: ImageUploadService,
  ) {}

  /**
   * Xem trước: mỗi tên file khớp tracking nào. Không ghi gì.
   * Trang up ảnh gọi cái này với danh sách tên file trước khi tải ảnh lên.
   */
  async khopTenFile(tenFiles: string[]): Promise<KetQuaKhop[]> {
    const tep = tenFiles.map((t) => {
      const ten = tenCoSo(t);
      const laAnh = laTenAnh(ten);
      return { ten, laAnh, ungVien: laAnh ? ungVienTracking(ten) : [] };
    });

    // 1) Mọi ứng viên của mọi file, tra một lượt.
    const tatCa = [...new Set(tep.flatMap((t) => t.ungVien))];
    const theoSo = new Map<string, TrackingKhop[]>();
    for (const lo of chiaLo(tatCa)) {
      const rows = await this.sequelize.query<TrackingKhop>(
        `SELECT TrackingID, TrackingNumber, UserName, TinhTrang
         FROM dbo.tbTracking
         WHERE DaXoa = 0 AND TrackingNumber IN (:ds)`,
        { replacements: { ds: lo }, type: QueryTypes.SELECT },
      );
      for (const r of rows) {
        const k = khoaSo(r.TrackingNumber);
        theoSo.set(k, [...(theoSo.get(k) ?? []), r]);
      }
    }

    const ketQua = tep.map((t) => {
      const i = t.ungVien.findIndex((u) => theoSo.has(khoaSo(u)));
      const trung = i >= 0 ? theoSo.get(khoaSo(t.ungVien[i]))! : [];
      return {
        tenFile: t.ten,
        laAnh: t.laAnh,
        soTracking: trung[0]?.TrackingNumber?.trim() ?? null,
        boDuoi: i > 0,
        tracking: trung.map(({ TrackingID, UserName, TinhTrang }) => ({
          TrackingID,
          UserName,
          TinhTrang,
        })),
        soAnhDaCo: 0,
        trungTen: false,
      } as KetQuaKhop;
    });

    // 2) Ảnh đã có của các tracking vừa khớp — để báo "sẽ thay ảnh cũ".
    const ids = [
      ...new Set(ketQua.flatMap((k) => k.tracking.map((x) => x.TrackingID))),
    ];
    const daCo = new Map<number, string[]>();
    for (const lo of chiaLo(ids)) {
      const rows = await this.docBangAnh(() =>
        this.sequelize.query<{ TrackingID: number; TenFileGoc: string | null }>(
          `SELECT TrackingID, TenFileGoc
           FROM dbo.tbAnhTracking
           WHERE DaXoa = 0 AND TrackingID IN (:ids)`,
          { replacements: { ids: lo }, type: QueryTypes.SELECT },
        ),
      );
      for (const r of rows)
        daCo.set(r.TrackingID, [
          ...(daCo.get(r.TrackingID) ?? []),
          khoaSo(r.TenFileGoc ?? ''),
        ]);
    }
    for (const k of ketQua) {
      const ten = daCo.get(k.tracking[0]?.TrackingID) ?? [];
      k.soAnhDaCo = ten.length;
      k.trungTen = ten.includes(khoaSo(k.tenFile));
    }
    return ketQua;
  }

  /**
   * Lưu một ảnh. Máy chủ tự khớp lại từ tên file — không tin mã tracking do
   * trình duyệt gửi lên.
   *
   * Cùng tracking đã có ảnh trùng tên file thì ảnh cũ bị thay (xoá mềm) — up
   * lại cả thư mục sau khi chụp bổ sung không sinh ảnh đôi.
   * Một số tracking có nhiều dòng (trùng số) thì gắn cho tất cả.
   */
  async luuAnh(
    file: { buffer?: Buffer; originalname?: string; size?: number } | undefined,
    tenFileGoc: string | undefined,
    nguoiTao: string,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Chưa có file ảnh.');
    const ten = tenCoSo(tenFileGoc || file.originalname || '').trim();
    if (!laTenAnh(ten))
      throw new BadRequestException(`"${ten}" không phải file ảnh.`);

    const [k] = await this.khopTenFile([ten]);
    if (!k.tracking.length) {
      throw new BadRequestException(
        `Không có tracking "${ungVienTracking(ten)[0] ?? ten}" trong hệ thống.`,
      );
    }

    const { linkHinh } = await this.imageUploadService.luuAnhHang(file.buffer);
    let thayThe = 0;
    try {
      await this.sequelize.transaction(async (transaction) => {
        for (const t of k.tracking) {
          const cu = await this.sequelize.query<{ AnhTrackingID: number }>(
            `UPDATE dbo.tbAnhTracking
             SET DaXoa = 1, NguoiXoa = :nguoiTao, NgayXoa = GETDATE()
             OUTPUT INSERTED.AnhTrackingID
             WHERE TrackingID = :trackingId AND DaXoa = 0 AND TenFileGoc = :ten`,
            {
              replacements: { nguoiTao, trackingId: t.TrackingID, ten },
              type: QueryTypes.SELECT,
              transaction,
            },
          );
          thayThe += cu.length;

          await this.sequelize.query(
            `INSERT INTO dbo.tbAnhTracking (TrackingID, LinkHinh, TenFileGoc, NguoiTao)
             OUTPUT INSERTED.AnhTrackingID
             VALUES (:trackingId, :linkHinh, :ten, :nguoiTao)`,
            {
              replacements: {
                trackingId: t.TrackingID,
                linkHinh,
                ten,
                nguoiTao,
              },
              type: QueryTypes.SELECT,
              transaction,
            },
          );

          await this.systemLogsService.create(
            {
              nguoiTao,
              nguon: 'Tracking_Anh:ThemAnh',
              hanhDong: cu.length ? 'Chinh sua' : 'Them moi',
              doiTuong: String(t.TrackingID),
              noiDung:
                `TrackingNumber: ${k.soTracking}; File: ${ten}; LinkHinh: ${linkHinh}` +
                (cu.length
                  ? `; Thay anh cu: ${cu.map((c) => c.AnhTrackingID).join(',')}`
                  : ''),
            },
            transaction,
          );
        }
      });
    } catch (e) {
      this.imageUploadService.xoaFile(linkHinh);
      if (thieuBang(e)) throw this.loiThieuBang();
      throw e;
    }

    return {
      tenFile: ten,
      soTracking: k.soTracking,
      trackingIds: k.tracking.map((t) => t.TrackingID),
      linkHinh,
      thayThe,
    };
  }

  /** Ảnh của một tracking, theo tên file để `_1, _2, _3` đứng đúng thứ tự. */
  async layAnh(trackingId: number): Promise<AnhTracking[]> {
    return this.docBangAnh(() =>
      this.sequelize.query<AnhTracking>(
        `SELECT AnhTrackingID, TrackingID, LinkHinh, TenFileGoc, NguoiTao, NgayTao
         FROM dbo.tbAnhTracking
         WHERE TrackingID = :trackingId AND DaXoa = 0
         ORDER BY TenFileGoc, AnhTrackingID`,
        { replacements: { trackingId }, type: QueryTypes.SELECT },
      ),
    );
  }

  /** Số ảnh của nhiều tracking — cho cột ảnh ở trang danh sách, một lệnh cho cả trang. */
  async demAnh(trackingIds: number[]): Promise<Map<number, number>> {
    const ra = new Map<number, number>();
    const ids = [
      ...new Set(trackingIds.filter((x) => Number.isInteger(x) && x > 0)),
    ];
    for (const lo of chiaLo(ids)) {
      const rows = await this.docBangAnh(() =>
        this.sequelize.query<{ TrackingID: number; SoAnh: number }>(
          `SELECT TrackingID, COUNT(*) AS SoAnh
           FROM dbo.tbAnhTracking
           WHERE DaXoa = 0 AND TrackingID IN (:ids)
           GROUP BY TrackingID`,
          { replacements: { ids: lo }, type: QueryTypes.SELECT },
        ),
      );
      for (const r of rows) ra.set(r.TrackingID, Number(r.SoAnh));
    }
    return ra;
  }

  /** Chủ tracking — để khách chỉ xem được ảnh tracking của chính mình. */
  async chuTracking(trackingId: number): Promise<string | null | undefined> {
    const rows = await this.sequelize.query<{ UserName: string | null }>(
      `SELECT TOP 1 UserName FROM dbo.tbTracking WHERE TrackingID = :trackingId AND DaXoa = 0`,
      { replacements: { trackingId }, type: QueryTypes.SELECT },
    );
    return rows.length ? rows[0].UserName : undefined;
  }

  /** Xoá mềm một ảnh. File trên đĩa giữ nguyên. */
  async xoaAnh(anhTrackingId: number, nguoiTao: string) {
    const rows = await this.sequelize.query<{
      TrackingID: number;
      LinkHinh: string;
      TenFileGoc: string | null;
    }>(
      `UPDATE dbo.tbAnhTracking
       SET DaXoa = 1, NguoiXoa = :nguoiTao, NgayXoa = GETDATE()
       OUTPUT INSERTED.TrackingID, INSERTED.LinkHinh, INSERTED.TenFileGoc
       WHERE AnhTrackingID = :anhTrackingId AND DaXoa = 0`,
      { replacements: { nguoiTao, anhTrackingId }, type: QueryTypes.SELECT },
    );
    if (!rows.length) throw new NotFoundException('Ảnh không còn tồn tại.');

    const r = rows[0];
    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'Tracking_Anh:XoaAnh',
      hanhDong: 'Xoa',
      doiTuong: String(r.TrackingID),
      noiDung: `AnhTrackingID: ${anhTrackingId}; File: ${r.TenFileGoc ?? ''}; LinkHinh: ${r.LinkHinh}`,
    });
    return { TrackingID: r.TrackingID };
  }

  /**
   * Chạy truy vấn đọc bảng ảnh. Bảng chưa tạo (chưa chạy migration) thì trả
   * rỗng — danh sách / tra cứu tracking vẫn chạy bình thường, chỉ không có ảnh.
   */
  private async docBangAnh<T>(fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn();
    } catch (e) {
      if (thieuBang(e)) return [];
      throw e;
    }
  }

  private loiThieuBang() {
    return new BadRequestException(
      'Máy chủ chưa có bảng ảnh tracking (tbAnhTracking) — cần chạy create-anh-tracking-table.sql.',
    );
  }
}
