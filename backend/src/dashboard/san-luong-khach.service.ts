import { Injectable, Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { formatSqlDate, formatSqlEndOfDay, parseVietnameseDate } from '../helpers/sql-date.helper';
import {
  DEM_KHONG_DOC_DUOC,
  DON_GIA_MAX,
  DON_GIA_MIN,
  KG,
  KG_CROSS_APPLY,
  STYLE_CAN_KG,
  TONG_KG,
  TUYEN_CROSS_APPLY,
  TUYEN_ID,
} from './san-luong-kg';
import { BANG_LICH_SU_CSKH, dongBoLichSuCskh } from '../users/lich-su-cskh';

/**
 * BÁO CÁO SẢN LƯỢNG KHÁCH HÀNG — mỗi dòng là một cặp (khách × tuyến).
 *
 * Yêu cầu bên khách 15/10/2026: mã khách hàng, tuyến, sản lượng (kg), doanh số.
 * Doanh số tách làm hai cột theo chốt của bên khách — xem `STYLE_*` ngay dưới
 * đây để biết hai cột đó là tiền gì.
 *
 * KHÔNG dùng stored procedure, cùng lý do đã ghi ở `van-hanh.service.ts`: đây
 * là màn chỉ đọc, và viết thẳng với `replacements` thì tham số được bind đúng
 * cách. Phần tính kg và tuyến thì dùng lại nguyên các mảnh trong
 * `san-luong-kg.ts` — chép lại là hai màn ra hai con số khác nhau.
 */

/** Dòng "Phí mua / Cancel / Mass Received đơn hàng" — tiền hàng mua hộ. */
export const STYLE_PHI_MUA = 1;

/**
 * Mã đơn nằm ở CUỐI `NoiDung`, lấy theo khoảng trắng cuối cùng.
 *
 * Bốn dạng có thật trong 12 tháng gần nhất (đếm 15/10/2026):
 *
 *     14.060  "Phí mua 42838"                  +25,76 tỷ
 *        659  "Cancel đơn hàng 35688"          -1,32 tỷ
 *        121  "Mass Received đơn hàng 42703"   -0,51 tỷ
 *          1  "Cập nhật đơn hàng ..."          -0,006 tỷ
 *
 * Ba dạng sau mang số ÂM — đó là huỷ đơn và điều chỉnh, tức doanh số phải trừ
 * đi. Bản nháp đầu tiên của báo cáo này cắt chữ "Phí mua" nên ba dạng kia không
 * ra mã đơn, mất tuyến, và dồn hết vào nhóm "chưa rõ tuyến" thành một dòng âm
 * 662 triệu. Lấy theo khoảng trắng cuối thì cả 14.841 dòng đều ra mã đơn, và
 * 14.841/14.841 dòng tra được tuyến từ `DON_HANG.QuocGiaID` — phủ 100%.
 */
export const MA_DON_CUOI_NOI_DUNG = `TRY_CONVERT(int, RIGHT(c.NoiDung, CHARINDEX(' ', REVERSE(c.NoiDung) + ' ') - 1))`;

export interface DongSanLuongKhach {
  maKh: string;
  tenKhach: string | null;
  /**
   * CSKH phụ trách khách VÀO NGÀY PHÁT SINH dòng tiền (mã đăng nhập), tra từ
   * `tbLichSuCskh` — từ 04/11/2026. Khách chuyển CSKH giữa kỳ thì ra hai dòng,
   * mỗi CSKH giữ phần của mình.
   */
  cskh: string | null;
  /** Họ tên CSKH đó; null nếu mã không còn tài khoản. */
  tenCskh: string | null;
  tuyenId: number | null;
  tuyen: string;
  kg: number;
  /** Cước cân kg — tiền của chính những dòng cân tạo ra số kg. */
  cuoc: number;
  /** Phí mua hộ hàng, đã trừ đơn huỷ. */
  phiMua: number;
  tong: number;
}

export interface BangSanLuongKhach {
  dong: DongSanLuongKhach[];
  tong: {
    kg: number;
    cuoc: number;
    phiMua: number;
    tong: number;
    soKhach: number;
    soDong: number;
  };
  /** Nói thật về độ phủ, đừng để người đọc tưởng con số là tuyệt đối. */
  canhBao: {
    /** Dòng cân không đọc được số kg — tiền vẫn tính, kg thì không. */
    dongThieuKg: number;
    /** kg nằm ở nhóm chưa rõ tuyến. */
    kgChuaRoTuyen: number;
  };
  /**
   * Chính các dòng cân đếm trong `canhBao.dongThieuKg`, để người xem mở ra sửa
   * — yêu cầu bên khách 03/11/2026 ("8 dòng không đọc được xem ở đâu").
   */
  dsThieuKg: DongThieuKg[];
}

/** Một dòng công nợ cân kg mà không lần ra được số kg. */
export interface DongThieuKg {
  congNoId: number;
  ngay: string | null;
  maKh: string;
  tenKhach: string | null;
  tuyen: string;
  noiDung: string | null;
  ghiChu: string | null;
  /** Số kg thô đọc được (Sản lượng, hoặc số trong ghi chú); null nếu không có. */
  kgTho: number | null;
  tien: number;
  phuThu: number;
  nguoiTao: string | null;
  /** Vì sao không nhận số kg này — viết cho người sửa đọc. */
  lyDo: string;
}

/** Trần số dòng thiếu kg trả về một lần — thường chỉ vài dòng một tháng. */
export const GIOI_HAN_THIEU_KG = 500;

/** Giá trị ô lọc CSKH nghĩa là "khách chưa gán CSKH nào". */
export const CSKH_CHUA_GAN = '__chua-gan';

/** Nhãn cho nhóm không tra được tuyến. Không gán bừa vào một nước nào. */
export const NHAN_CHUA_RO_TUYEN = 'Chưa rõ tuyến';

/**
 * CSKH của dòng công nợ `c` VÀO NGÀY ghi nợ — dòng lịch sử mới nhất có
 * TuNgay <= NgayGhiNo (cùng ngày thì ID lớn thắng). Không có dòng nào = chưa
 * gán ai lúc đó. Ra cột `ls.CSKH`.
 */
export const CSKH_LUC_PHAT_SINH = `
  OUTER APPLY (SELECT TOP 1 x.CSKH
                 FROM dbo.${BANG_LICH_SU_CSKH} x
                WHERE x.UserName = c.UserName AND x.TuNgay <= c.NgayGhiNo
                ORDER BY x.TuNgay DESC, x.ID DESC) ls`;

/**
 * Lọc theo NHIỀU CSKH một lúc (yêu cầu 04/11/2026). `bieuThuc` là cột CSKH
 * lúc phát sinh; `CSKH_CHUA_GAN` trong danh sách = lấy cả dòng chưa gán ai.
 */
const locCskh = (bieuThuc: string) => `(:locCskh = 0
          OR (:coChuaGan = 1 AND ${bieuThuc} IS NULL)
          OR ${bieuThuc} IN (:dsCskh))`;

/** "a,b" hoặc ['a','b'] → danh sách mã CSKH đã cắt khoảng trắng, bỏ trùng. */
export function docDsCskh(v: unknown): string[] {
  const tho = Array.isArray(v) ? v : String(v ?? '').split(',');
  return [...new Set(tho.map((x) => String(x ?? '').trim()).filter(Boolean))];
}

const vnd = (v: number) => Math.round(v).toLocaleString('vi-VN');

/** Dòng thô → dòng thiếu kg, kèm lý do viết cho người sửa đọc. */
export function docDongThieuKg(r: any): DongThieuKg {
  const kgTho = r.kgTho === null || r.kgTho === undefined ? null : Number(r.kgTho);
  const tien = Number(r.tien) || 0;
  const phuThu = Number(r.phuThu) || 0;
  let lyDo: string;
  if (kgTho === null || !(kgTho > 0)) {
    lyDo = 'Không có số kg (Sản lượng trống hoặc 0, ghi chú không phải số)';
  } else {
    lyDo =
      `${vnd(tien)}đ cho ${kgTho.toLocaleString('vi-VN', { maximumFractionDigits: 3 })} kg ` +
      `= ${vnd(tien / kgTho)}đ/kg, ngoài khoảng ${vnd(DON_GIA_MIN)}–${vnd(DON_GIA_MAX)}đ/kg nên nghi nhập sai kg`;
    if (phuThu > 0) lyDo += ` (trong tiền có ${vnd(phuThu)}đ phụ thu)`;
  }
  return {
    congNoId: Number(r.congNoId),
    ngay: r.ngay ? new Date(r.ngay).toISOString() : null,
    maKh: String(r.maKh ?? ''),
    tenKhach: r.tenKhach ?? null,
    tuyen: r.tuyen || NHAN_CHUA_RO_TUYEN,
    noiDung: r.noiDung ?? null,
    ghiChu: r.ghiChu ?? null,
    kgTho,
    tien,
    phuThu,
    nguoiTao: r.nguoiTao ?? null,
    lyDo,
  };
}

@Injectable()
export class SanLuongKhachService {
  constructor(@Inject('SEQUELIZE') private readonly sequelize: Sequelize) {}

  /** Khoảng ngày dd/MM/yyyy; mặc định tháng hiện tại. */
  private khoang(tuNgay?: string, denNgay?: string) {
    const nay = new Date();
    const dauThang = new Date(nay.getFullYear(), nay.getMonth(), 1);
    const tu = parseVietnameseDate(tuNgay || '') || dauThang;
    const den = parseVietnameseDate(denNgay || '') || nay;
    return {
      tu: formatSqlDate(tu),
      den: formatSqlEndOfDay(new Date(den.getFullYear(), den.getMonth(), den.getDate(), 23, 59, 59)),
    };
  }

  private async hoi<T = any>(sql: string, replacements: Record<string, unknown>): Promise<T[]> {
    const kq = await this.sequelize.query(sql, { replacements, type: 'SELECT' as const });
    return (kq as unknown as T[]) ?? [];
  }

  /**
   * Bảng chính.
   *
   * Trả về TOÀN BỘ dòng, không phân trang: khoảng 1.550 dòng cho 12 tháng,
   * khoảng 200 cho một tháng — nhỏ, mà màn hình cần sắp xếp và xuất Excel trọn
   * bộ. Vẫn chặn trần `GIOI_HAN` phòng khi ai đó chọn khoảng ngày khổng lồ.
   */
  async bang(
    tuNgay?: string,
    denNgay?: string,
    quocGiaId?: number,
    khach?: string,
    cskh?: string | string[],
  ): Promise<BangSanLuongKhach> {
    const { tu, den } = this.khoang(tuNgay, denNgay);
    const ds = docDsCskh(cskh);
    const dsThat = ds.filter((x) => x !== CSKH_CHUA_GAN);
    const p = {
      tu,
      den,
      quocGiaId: quocGiaId && quocGiaId > 0 ? quocGiaId : null,
      khach: khach && khach.trim() ? khach.trim() : null,
      locCskh: ds.length ? 1 : 0,
      coChuaGan: ds.includes(CSKH_CHUA_GAN) ? 1 : 0,
      // IN () rỗng là lỗi cú pháp; '' không bao giờ là CSKH (lịch sử lưu NULL).
      dsCskh: dsThat.length ? dsThat : [''],
    };


    /*
     * Hai nhánh gộp bằng FULL OUTER JOIN, không phải UNION rồi GROUP lại:
     * một cặp (khách × tuyến) có thể chỉ có cước (khách tự mua rồi gửi về),
     * chỉ có phí mua (đơn đã tính tiền hàng nhưng chưa cân), hoặc có cả hai.
     * INNER JOIN thì mất hẳn hai nhóm đầu — và nhóm "chỉ có cước" chính là
     * phần lớn tuyến Mỹ.
     *
     * Điều kiện nối phải xử lý NULL tường minh (`tuyenId IS NULL` hai bên),
     * vì `NULL = NULL` trong SQL là không khớp: thiếu vế đó thì nhóm chưa rõ
     * tuyến bị tách làm hai dòng cho cùng một khách.
     */
    const cauLenh = `
      WITH can AS (
        SELECT c.UserName AS maKh,
               ${TUYEN_ID} AS tuyenId,
               ls.CSKH AS cskh,
               ${TONG_KG} AS kg,
               SUM(ISNULL(c.DR, 0)) AS cuoc,
               ${DEM_KHONG_DOC_DUOC} AS dongThieuKg
          FROM CONGNO c ${KG_CROSS_APPLY} ${TUYEN_CROSS_APPLY} ${CSKH_LUC_PHAT_SINH}
         WHERE c.DaXoa = 0 AND c.style = ${STYLE_CAN_KG}
           AND c.NgayGhiNo BETWEEN :tu AND :den
           AND (:khach IS NULL OR c.UserName = :khach)
           AND ${locCskh('ls.CSKH')}
         GROUP BY c.UserName, ${TUYEN_ID}, ls.CSKH
      ),
      mua AS (
        SELECT c.UserName AS maKh,
               d.QuocGiaID AS tuyenId,
               ls.CSKH AS cskh,
               SUM(ISNULL(c.DR, 0)) AS phiMua
          FROM CONGNO c
         OUTER APPLY (SELECT TOP 1 dh.QuocGiaID
                        FROM DON_HANG dh
                       WHERE dh.id = ${MA_DON_CUOI_NOI_DUNG}) d
         ${CSKH_LUC_PHAT_SINH}
         WHERE c.DaXoa = 0 AND c.style = ${STYLE_PHI_MUA}
           AND c.NgayGhiNo BETWEEN :tu AND :den
           AND (:khach IS NULL OR c.UserName = :khach)
           AND ${locCskh('ls.CSKH')}
         GROUP BY c.UserName, d.QuocGiaID, ls.CSKH
      )
      SELECT COALESCE(can.maKh, mua.maKh) AS maKh,
             u.HoTen AS tenKhach,
             COALESCE(can.cskh, mua.cskh) AS cskh,
             cs.HoTen AS tenCskh,
             COALESCE(can.tuyenId, mua.tuyenId) AS tuyenId,
             q.TenQuocGia AS tuyen,
             ISNULL(can.kg, 0) AS kg,
             ISNULL(can.cuoc, 0) AS cuoc,
             ISNULL(mua.phiMua, 0) AS phiMua,
             ISNULL(can.cuoc, 0) + ISNULL(mua.phiMua, 0) AS tong,
             ISNULL(can.dongThieuKg, 0) AS dongThieuKg
        FROM can
        FULL OUTER JOIN mua
          ON mua.maKh = can.maKh
         AND (mua.tuyenId = can.tuyenId
              OR (mua.tuyenId IS NULL AND can.tuyenId IS NULL))
         AND (mua.cskh = can.cskh
              OR (mua.cskh IS NULL AND can.cskh IS NULL))
        LEFT JOIN tbQuocGia q ON q.QuocGiaID = COALESCE(can.tuyenId, mua.tuyenId)
        LEFT JOIN AspNetUsers u ON u.UserName = COALESCE(can.maKh, mua.maKh)
        LEFT JOIN AspNetUsers cs ON cs.UserName = COALESCE(can.cskh, mua.cskh)
       WHERE (:quocGiaId IS NULL OR COALESCE(can.tuyenId, mua.tuyenId) = :quocGiaId)
       ORDER BY ISNULL(can.cuoc, 0) + ISNULL(mua.phiMua, 0) DESC`;

    /*
     * Cùng bộ lọc với bảng chính, để danh sách này khớp đúng con số cảnh báo.
     * Chỉ lấy dòng có tiền (DR > 0) — xem ghi chú ở `DEM_KHONG_DOC_DUOC`.
     */
    const cauThieuKg = `
      SELECT TOP ${GIOI_HAN_THIEU_KG}
             c.CongNo_ID AS congNoId, c.NgayGhiNo AS ngay, c.UserName AS maKh,
             u.HoTen AS tenKhach, q.TenQuocGia AS tuyen,
             c.NoiDung AS noiDung, c.GhiChu AS ghiChu,
             t.tho AS kgTho, c.DR AS tien, ISNULL(c.PhuThu, 0) AS phuThu,
             c.NguoiTao AS nguoiTao
        FROM CONGNO c ${KG_CROSS_APPLY} ${TUYEN_CROSS_APPLY} ${CSKH_LUC_PHAT_SINH}
        LEFT JOIN tbQuocGia q ON q.QuocGiaID = ${TUYEN_ID}
        LEFT JOIN AspNetUsers u ON u.UserName = c.UserName
       WHERE c.DaXoa = 0 AND c.style = ${STYLE_CAN_KG}
         AND c.DR > 0 AND ${KG} IS NULL
         AND c.NgayGhiNo BETWEEN :tu AND :den
         AND (:khach IS NULL OR c.UserName = :khach)
         AND (:quocGiaId IS NULL OR ${TUYEN_ID} = :quocGiaId)
         AND ${locCskh('ls.CSKH')}
       ORDER BY c.NgayGhiNo, c.CongNo_ID`;

    const [tho, thieuKg] = await Promise.all([
      this.hoi<any>(cauLenh, p),
      this.hoi<any>(cauThieuKg, p),
    ]);

    const dong: DongSanLuongKhach[] = tho.map((r) => ({
      maKh: String(r.maKh ?? ''),
      tenKhach: r.tenKhach ?? null,
      cskh: r.cskh ? String(r.cskh).trim() || null : null,
      tenCskh: r.tenCskh ?? null,
      tuyenId: r.tuyenId ?? null,
      tuyen: r.tuyen || NHAN_CHUA_RO_TUYEN,
      kg: Number(r.kg) || 0,
      cuoc: Number(r.cuoc) || 0,
      phiMua: Number(r.phiMua) || 0,
      tong: Number(r.tong) || 0,
    }));

    const cong = (lay: (d: DongSanLuongKhach) => number) =>
      dong.reduce((a, d) => a + lay(d), 0);

    return {
      dong,
      tong: {
        kg: cong((d) => d.kg),
        cuoc: cong((d) => d.cuoc),
        phiMua: cong((d) => d.phiMua),
        tong: cong((d) => d.tong),
        soKhach: new Set(dong.map((d) => d.maKh)).size,
        soDong: dong.length,
      },
      canhBao: {
        dongThieuKg: tho.reduce((a, r) => a + (Number(r.dongThieuKg) || 0), 0),
        kgChuaRoTuyen: dong
          .filter((d) => d.tuyenId === null)
          .reduce((a, d) => a + d.kg, 0),
      },
      dsThieuKg: thieuKg.map(docDongThieuKg),
    };
  }

  /**
   * Lưới đỡ trước khi đọc báo cáo: đường đổi CSKH nào lỡ không ghi lịch sử thì
   * bù ngay. Lỗi ở đây không chặn báo cáo — chỉ là lịch sử có thể trễ một nhịp.
   */
  async dongBoLichSu(): Promise<void> {
    await dongBoLichSuCskh(this.sequelize, 'dong-bo-bao-cao').catch((e) =>
      console.error('[LichSuCskh]', e?.message ?? e),
    );
  }

  /**
   * CSKH cho ô lọc: CSKH đang làm, cộng những mã đang được gán cho khách dù đã
   * nghỉ — lọc theo người cũ vẫn phải ra được khách của họ.
   *
   * Không dùng `GET /users/cskh`: đường đó cần quyền xem danh sách khách, mà
   * Kế toán / MKT xem được báo cáo này thì chưa chắc có quyền đó.
   */
  async dsCskh(): Promise<{ username: string; hoTen: string }[]> {
    const rows = await this.hoi<any>(
      `SELECT x.username, ISNULL(MAX(cs.HoTen), x.username) AS hoTen
         FROM (
           SELECT u.UserName AS username
             FROM AspNetUsers u
             JOIN AspNetUserRoles ur ON ur.UserId = u.Id
             JOIN AspNetRoles r ON r.Id = ur.RoleId
            WHERE r.Name = 'CSKH' AND ISNULL(u.TrangThai, '') <> 'dong-ma'
           UNION
           SELECT DISTINCT LTRIM(RTRIM(k.CSKHPhuTrach))
             FROM AspNetUsers k
            WHERE ISNULL(LTRIM(RTRIM(k.CSKHPhuTrach)), '') <> ''
           UNION
           SELECT DISTINCT h.CSKH FROM dbo.${BANG_LICH_SU_CSKH} h WHERE h.CSKH IS NOT NULL
         ) x
         LEFT JOIN AspNetUsers cs ON cs.UserName = x.username
        GROUP BY x.username
        ORDER BY 2`,
      {},
    );
    return rows.map((r) => ({ username: String(r.username), hoTen: String(r.hoTen ?? r.username) }));
  }

  /**
   * Danh sách tuyến CÓ dữ liệu trong kỳ, để đổ vào ô lọc.
   *
   * Không lấy cả `tbQuocGia`: bảng đó có 15 nước kể cả hai tuyến xuất vừa thêm
   * 12/10 chưa phát sinh đơn nào, hiện ra ô lọc chỉ làm người dùng chọn rồi
   * nhận bảng rỗng.
   */
  async tuyenCoDuLieu(tuNgay?: string, denNgay?: string): Promise<{ id: number; ten: string }[]> {
    const { tu, den } = this.khoang(tuNgay, denNgay);
    const rows = await this.hoi<any>(
      `SELECT DISTINCT q.QuocGiaID AS id, q.TenQuocGia AS ten
         FROM (
           SELECT ${TUYEN_ID} AS tuyenId
             FROM CONGNO c ${KG_CROSS_APPLY} ${TUYEN_CROSS_APPLY}
            WHERE c.DaXoa = 0 AND c.style = ${STYLE_CAN_KG}
              AND c.NgayGhiNo BETWEEN :tu AND :den
           UNION
           SELECT d.QuocGiaID
             FROM CONGNO c
            OUTER APPLY (SELECT TOP 1 dh.QuocGiaID
                           FROM DON_HANG dh
                          WHERE dh.id = ${MA_DON_CUOI_NOI_DUNG}) d
            WHERE c.DaXoa = 0 AND c.style = ${STYLE_PHI_MUA}
              AND c.NgayGhiNo BETWEEN :tu AND :den
         ) x
         JOIN tbQuocGia q ON q.QuocGiaID = x.tuyenId
        ORDER BY q.TenQuocGia`,
      { tu, den },
    );
    return rows.map((r) => ({ id: Number(r.id), ten: String(r.ten ?? '') }));
  }
}
