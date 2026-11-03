import { Injectable, Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { formatSqlDate, formatSqlEndOfDay, parseVietnameseDate } from '../helpers/sql-date.helper';
import {
  DEM_KHONG_DOC_DUOC,
  KG_CROSS_APPLY,
  STYLE_CAN_KG,
  TONG_KG,
  TUYEN_CROSS_APPLY,
  TUYEN_ID,
} from './san-luong-kg';

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
  /** CSKH phụ trách khách (`AspNetUsers.CSKHPhuTrach`, mã đăng nhập) — thêm 03/11/2026. */
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
}

/** Nhãn cho nhóm không tra được tuyến. Không gán bừa vào một nước nào. */
export const NHAN_CHUA_RO_TUYEN = 'Chưa rõ tuyến';

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
  ): Promise<BangSanLuongKhach> {
    const { tu, den } = this.khoang(tuNgay, denNgay);
    const p = {
      tu,
      den,
      quocGiaId: quocGiaId && quocGiaId > 0 ? quocGiaId : null,
      khach: khach && khach.trim() ? khach.trim() : null,
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
               ${TONG_KG} AS kg,
               SUM(ISNULL(c.DR, 0)) AS cuoc,
               ${DEM_KHONG_DOC_DUOC} AS dongThieuKg
          FROM CONGNO c ${KG_CROSS_APPLY} ${TUYEN_CROSS_APPLY}
         WHERE c.DaXoa = 0 AND c.style = ${STYLE_CAN_KG}
           AND c.NgayGhiNo BETWEEN :tu AND :den
           AND (:khach IS NULL OR c.UserName = :khach)
         GROUP BY c.UserName, ${TUYEN_ID}
      ),
      mua AS (
        SELECT c.UserName AS maKh,
               d.QuocGiaID AS tuyenId,
               SUM(ISNULL(c.DR, 0)) AS phiMua
          FROM CONGNO c
         OUTER APPLY (SELECT TOP 1 dh.QuocGiaID
                        FROM DON_HANG dh
                       WHERE dh.id = ${MA_DON_CUOI_NOI_DUNG}) d
         WHERE c.DaXoa = 0 AND c.style = ${STYLE_PHI_MUA}
           AND c.NgayGhiNo BETWEEN :tu AND :den
           AND (:khach IS NULL OR c.UserName = :khach)
         GROUP BY c.UserName, d.QuocGiaID
      )
      SELECT COALESCE(can.maKh, mua.maKh) AS maKh,
             u.HoTen AS tenKhach,
             u.CSKHPhuTrach AS cskh,
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
        LEFT JOIN tbQuocGia q ON q.QuocGiaID = COALESCE(can.tuyenId, mua.tuyenId)
        LEFT JOIN AspNetUsers u ON u.UserName = COALESCE(can.maKh, mua.maKh)
        LEFT JOIN AspNetUsers cs ON cs.UserName = u.CSKHPhuTrach
       WHERE (:quocGiaId IS NULL OR COALESCE(can.tuyenId, mua.tuyenId) = :quocGiaId)
       ORDER BY ISNULL(can.cuoc, 0) + ISNULL(mua.phiMua, 0) DESC`;

    const tho = await this.hoi<any>(cauLenh, p);

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
    };
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
