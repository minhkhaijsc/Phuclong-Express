import { Injectable, Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';

/**
 * Báo cáo TUỔI NỢ.
 *
 * PLE đã có 9 màn báo cáo công nợ, nhưng không màn nào trả lời được "ai nợ LÂU
 * nhất" — tất cả chỉ hiện số dư, không hiện thời gian. Khảo sát 07/10/2026:
 * 165 khách còn nợ, tổng 450.270.501đ, trong đó có khoản 17,8 triệu đã 67 ngày
 * không phát sinh gì.
 *
 * CÁCH TÍNH TUỔI: khấu trừ tiền thu (CR) vào các khoản nợ (DR) theo thứ tự CŨ
 * TRƯỚC (FIFO). Đây là chỗ dễ làm sai nhất:
 *
 *   Nếu chỉ lấy số dư cuối rồi gán cho ngày ghi nợ gần nhất, thì một khách nợ
 *   từ 6 tháng trước nhưng tháng này có phát sinh mới sẽ hiện là "nợ 0-30 ngày"
 *   — nợ già bị giấu mất, đúng cái mà báo cáo này sinh ra để phát hiện.
 *
 * FIFO là cách kế toán vẫn dùng: tiền trả về thì trừ vào hoá đơn cũ nhất trước.
 *
 * CHỖ DỄ SAI NHẤT, ĐÃ TRẢ GIÁ MỘT LẦN: sổ công nợ này ghi BÚT TOÁN ĐẢO bằng
 * `DR` ÂM, không phải bằng `CR` — 1.943 dòng, tổng −7,44 tỷ, nội dung kiểu
 * "Cancel đơn hàng 26016", "Mass Received đơn hàng 24395".
 *
 * Bản đầu tiên lọc `DR > 0` nên vứt hết các bút toán đảo và thổi tổng nợ từ
 * 449 triệu lên 7,8 tỷ — gấp 17 lần. Vì vậy phải tính theo BIẾN ĐỘNG RÒNG của
 * từng dòng (`DR - CR`): dương là phát sinh nợ (có tuổi), âm là khoản giảm trừ
 * (khấu vào nợ cũ nhất trước).
 */

export interface DongTuoiNo {
  khach: string;
  tong: number;
  n0_30: number;
  n31_60: number;
  n61_90: number;
  tren90: number;
  /** Số ngày của khoản nợ CHƯA TRẢ cũ nhất — dùng để sắp xếp mức độ nghiêm trọng. */
  soNgayCuNhat: number;
  /** Lần cuối có phát sinh bất kỳ (nợ hoặc thu). */
  lanCuoi: string | null;
}

export interface TongHopTuoiNo {
  soKhachConNo: number;
  tongConNo: number;
  n0_30: number;
  n31_60: number;
  n61_90: number;
  tren90: number;
}

@Injectable()
export class TuoiNoService {
  constructor(@Inject('SEQUELIZE') private readonly sequelize: Sequelize) {}

  /**
   * Khấu trừ FIFO, trả về phần CHƯA TRẢ của từng dòng nợ kèm tuổi.
   *
   * `luyKeNo` là tổng nợ cộng dồn tới dòng đó. So với tổng đã thu:
   *   luyKeNo - tongThu <= 0        -> dòng này đã trả hết
   *   luyKeNo - tongThu >= DR       -> dòng này chưa trả đồng nào
   *   ở giữa                        -> trả một phần
   *
   * Bỏ qua khách có số dư <= 1.000đ: lẻ do làm tròn, đưa vào chỉ làm nhiễu.
   */
  private readonly SQL_FIFO = `
    WITH ChuyenDong AS (
      SELECT c.UserName, c.NgayGhiNo, c.CongNo_ID,
             ISNULL(c.DR,0) - ISNULL(c.CR,0) AS bien
      FROM CONGNO c WHERE c.DaXoa = 0
    ),
    TongGiam AS (
      SELECT UserName, SUM(CASE WHEN bien < 0 THEN -bien ELSE 0 END) AS tongGiam
      FROM ChuyenDong GROUP BY UserName
    ),
    No AS (
      SELECT d.UserName, d.NgayGhiNo, d.bien AS DR,
             SUM(d.bien) OVER (
               PARTITION BY d.UserName ORDER BY d.NgayGhiNo, d.CongNo_ID
               ROWS UNBOUNDED PRECEDING
             ) AS luyKeNo
      FROM ChuyenDong d
      WHERE d.bien > 0
    ),
    ChuaTra AS (
      SELECT n.UserName, n.NgayGhiNo,
             CASE
               WHEN n.luyKeNo - ISNULL(g.tongGiam,0) <= 0 THEN 0
               WHEN n.luyKeNo - ISNULL(g.tongGiam,0) >= n.DR THEN n.DR
               ELSE n.luyKeNo - ISNULL(g.tongGiam,0)
             END AS conLai
      FROM No n
      LEFT JOIN TongGiam g ON g.UserName = n.UserName
    )`;

  private async hoi<T = any>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> {
    const kq = await this.sequelize.query(sql, { replacements, type: 'SELECT' as const });
    if (!Array.isArray(kq)) return [];
    return (Array.isArray(kq[0]) ? kq[0] : kq) as T[];
  }

  /** Tổng hợp theo nhóm tuổi — bốn ô đầu màn. */
  async tongHop(): Promise<TongHopTuoiNo> {
    const [r] = await this.hoi<any>(`
      ${this.SQL_FIFO}
      , TheoKhach AS (
        SELECT UserName,
               SUM(conLai) AS tong,
               SUM(CASE WHEN DATEDIFF(day, NgayGhiNo, GETDATE()) <= 30 THEN conLai ELSE 0 END) AS n0_30,
               SUM(CASE WHEN DATEDIFF(day, NgayGhiNo, GETDATE()) BETWEEN 31 AND 60 THEN conLai ELSE 0 END) AS n31_60,
               SUM(CASE WHEN DATEDIFF(day, NgayGhiNo, GETDATE()) BETWEEN 61 AND 90 THEN conLai ELSE 0 END) AS n61_90,
               SUM(CASE WHEN DATEDIFF(day, NgayGhiNo, GETDATE()) > 90 THEN conLai ELSE 0 END) AS tren90
        FROM ChuaTra WHERE conLai > 0
        GROUP BY UserName
      )
      SELECT COUNT(*) AS soKhachConNo,
             SUM(tong) AS tongConNo,
             SUM(n0_30) AS n0_30, SUM(n31_60) AS n31_60,
             SUM(n61_90) AS n61_90, SUM(tren90) AS tren90
      FROM TheoKhach WHERE tong > 1000`);

    return {
      soKhachConNo: Number(r?.soKhachConNo ?? 0),
      tongConNo: Number(r?.tongConNo ?? 0),
      n0_30: Number(r?.n0_30 ?? 0),
      n31_60: Number(r?.n31_60 ?? 0),
      n61_90: Number(r?.n61_90 ?? 0),
      tren90: Number(r?.tren90 ?? 0),
    };
  }

  /**
   * Danh sách khách còn nợ.
   *
   * `sapTheo`:
   *   'gia'  (mặc định) — nợ già nhất lên đầu, đó là tiền khó đòi nhất
   *   'tien' — nợ to nhất lên đầu
   */
  async danhSach(sapTheo: 'gia' | 'tien' = 'gia', gioiHan = 200): Promise<DongTuoiNo[]> {
    const thuTu = sapTheo === 'tien' ? 'tong DESC' : 'soNgayCuNhat DESC, tong DESC';
    const rows = await this.hoi<any>(`
      ${this.SQL_FIFO}
      , PhatSinh AS (
        SELECT UserName, MAX(NgayGhiNo) AS lanCuoi FROM CONGNO WHERE DaXoa = 0 GROUP BY UserName
      )
      SELECT TOP (:gioiHan)
             c.UserName AS khach,
             SUM(c.conLai) AS tong,
             SUM(CASE WHEN DATEDIFF(day, c.NgayGhiNo, GETDATE()) <= 30 THEN c.conLai ELSE 0 END) AS n0_30,
             SUM(CASE WHEN DATEDIFF(day, c.NgayGhiNo, GETDATE()) BETWEEN 31 AND 60 THEN c.conLai ELSE 0 END) AS n31_60,
             SUM(CASE WHEN DATEDIFF(day, c.NgayGhiNo, GETDATE()) BETWEEN 61 AND 90 THEN c.conLai ELSE 0 END) AS n61_90,
             SUM(CASE WHEN DATEDIFF(day, c.NgayGhiNo, GETDATE()) > 90 THEN c.conLai ELSE 0 END) AS tren90,
             MAX(DATEDIFF(day, c.NgayGhiNo, GETDATE())) AS soNgayCuNhat,
             MAX(p.lanCuoi) AS lanCuoi
      FROM ChuaTra c
      LEFT JOIN PhatSinh p ON p.UserName = c.UserName
      WHERE c.conLai > 0
      GROUP BY c.UserName
      HAVING SUM(c.conLai) > 1000
      ORDER BY ${thuTu}`,
      { gioiHan },
    );

    return rows.map((r) => ({
      khach: String(r.khach ?? ''),
      tong: Number(r.tong ?? 0),
      n0_30: Number(r.n0_30 ?? 0),
      n31_60: Number(r.n31_60 ?? 0),
      n61_90: Number(r.n61_90 ?? 0),
      tren90: Number(r.tren90 ?? 0),
      soNgayCuNhat: Number(r.soNgayCuNhat ?? 0),
      lanCuoi: r.lanCuoi ? new Date(r.lanCuoi).toISOString() : null,
    }));
  }

  /** Chi tiết các khoản còn nợ của MỘT khách — bấm từ danh sách vào. */
  async chiTiet(khach: string): Promise<{ ngay: string; noiDung: string; conLai: number; soNgay: number }[]> {
    if (!khach || !khach.trim()) return [];
    const rows = await this.hoi<any>(`
      WITH ChuyenDong AS (
        SELECT c.CongNo_ID, c.UserName, c.NgayGhiNo, c.NoiDung,
               ISNULL(c.DR,0) - ISNULL(c.CR,0) AS bien
        FROM CONGNO c WHERE c.DaXoa = 0 AND c.UserName = :khach
      ),
      TongGiam AS (
        SELECT SUM(CASE WHEN bien < 0 THEN -bien ELSE 0 END) AS tongGiam FROM ChuyenDong
      ),
      No AS (
        SELECT d.NgayGhiNo, d.NoiDung, d.bien AS DR,
               SUM(d.bien) OVER (ORDER BY d.NgayGhiNo, d.CongNo_ID ROWS UNBOUNDED PRECEDING) AS luyKeNo
        FROM ChuyenDong d WHERE d.bien > 0
      )
      SELECT n.NgayGhiNo AS ngay, n.NoiDung AS noiDung,
             CASE
               WHEN n.luyKeNo - ISNULL(g.tongGiam,0) <= 0 THEN 0
               WHEN n.luyKeNo - ISNULL(g.tongGiam,0) >= n.DR THEN n.DR
               ELSE n.luyKeNo - ISNULL(g.tongGiam,0)
             END AS conLai,
             DATEDIFF(day, n.NgayGhiNo, GETDATE()) AS soNgay
      FROM No n CROSS JOIN TongGiam g
      ORDER BY n.NgayGhiNo`,
      { khach: khach.trim() },
    );
    return rows
      .filter((r) => Number(r.conLai) > 0)
      .map((r) => ({
        ngay: r.ngay ? new Date(r.ngay).toISOString().slice(0, 10) : '',
        noiDung: String(r.noiDung ?? ''),
        conLai: Number(r.conLai ?? 0),
        soNgay: Number(r.soNgay ?? 0),
      }));
  }
}
