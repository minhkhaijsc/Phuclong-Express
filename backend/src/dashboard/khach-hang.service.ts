import { Injectable, Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { KG_CROSS_APPLY, TONG_KG, TUYEN_CROSS_APPLY, TUYEN_ID, STYLE_CAN_KG, KG } from './san-luong-kg';

/**
 * Số liệu tổng quan cho TÀI KHOẢN KHÁCH HÀNG (màn /tong-quan).
 *
 * Khác hẳn dashboard admin: ở đây mọi câu lệnh đều bị khoá cứng vào một
 * username. Username KHÔNG BAO GIỜ lấy từ query string — controller đọc từ
 * JWT rồi truyền xuống. Nếu để khách tự truyền `?khach=` thì khách A xem được
 * công nợ của khách B, mà công nợ là thứ nhạy cảm nhất trong hệ này.
 *
 * THƯỚC ĐO:
 *
 *   • "Sản lượng" = SỐ KG. Đây là cách bên vận hành hiểu từ này, và là thứ
 *     khách trả tiền theo. Cách lấy kg từ dữ liệu khá lắt léo (cột mới chỉ có
 *     từ 06/2026, trước đó nằm trong ô ghi chú, lại dính vài dòng mất dấu
 *     thập phân) — toàn bộ nằm ở `san-luong-kg.ts`, đọc ở đó.
 *   • Số KIỆN vẫn lấy từ tbTracking và vẫn hiện, nhưng là số phụ: nó trả lời
 *     "bao nhiêu gói", còn kg mới là sản lượng.
 *   • Công nợ: DR = phát sinh, CR = đã trả. Dư nợ = Σ DR − Σ CR từ đầu, giống
 *     đúng cách bảng "Cân đối công nợ" đang tính (SP_BaoCao_ChiTietCongNo1 với
 *     @TuKyID=-1 cho số đầu kỳ = 0).
 *
 * Số dư ÂM là chuyện bình thường (khách trả trước — HP3028 đang dư 13 triệu),
 * nên bên giao diện phải đổi nhãn theo dấu, đừng hiện "Dư nợ: -13.021.336đ".
 */

/** Tài khoản kho gom hàng chưa khớp chủ — không phải khách thật. */
const KHO_CHUA_CO_CHU = 'CHECKKHACH';

export interface SoLieuKhach {
  /** Tổng kg trong khoảng đang xem — thước đo chính. */
  soKg: number;
  /** Kg của 30 ngày gần nhất — để khách thấy nhịp hiện tại. */
  soKg30Ngay: number;
  /** Số kiện (tbTracking) — số phụ, đi kèm cho dễ hình dung. */
  soKien: number;
  /**
   * Số dòng cân KHÔNG đọc được kg trong khoảng xem. Khác 0 thì giao diện phải
   * nói ra, đừng để khách tưởng tổng kg là đầy đủ.
   */
  soDongThieuKg: number;
  soTuyen: number;
  /** Σ DR − Σ CR TỪ ĐẦU (không theo khoảng ngày) — số dư thật hôm nay. */
  duNo: number;
  tongPhatSinh: number;
  tongDaTra: number;
  lanGuiGanNhat: string | null;
}

export interface TuyenCuaKhach {
  tenQuocGia: string;
  soKg: number;
  tyLe: number;
}

export interface ThangCuaKhach {
  /** yyyy-MM */
  thang: string;
  soKg: number;
  soKien: number;
  phatSinh: number;
  daTra: number;
  /** Dư nợ tích luỹ đến hết tháng đó. */
  duNoCuoiThang: number;
}

@Injectable()
export class KhachHangService {
  constructor(@Inject('SEQUELIZE') private readonly sequelize: Sequelize) {}

  private async hoi<T = any>(sql: string, replacements: Record<string, unknown>): Promise<T[]> {
    const kq = await this.sequelize.query(sql, { replacements, type: 'SELECT' as const });
    if (!Array.isArray(kq)) return [];
    return (Array.isArray(kq[0]) ? kq[0] : kq) as T[];
  }

  /**
   * Mốc đầu của khoảng xem: lùi `soThang` tháng, về ngày 1.
   *
   * Lùi về đầu tháng chứ không lùi đúng ngày: biểu đồ theo tháng mà mốc đầu là
   * giữa tháng thì cột đầu tiên luôn thấp giả tạo, khách tưởng tháng đó sụt.
   */
  private tuNgay(soThang: number): string {
    const n = new Date();
    const d = new Date(n.getFullYear(), n.getMonth() - (soThang - 1), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  private chuanHoaSoThang(soThang?: number): number {
    const n = Number(soThang);
    if (!Number.isFinite(n) || n < 1) return 12;
    return Math.min(Math.floor(n), 36);
  }

  /** Bốn ô số đầu màn. */
  async soLieu(username: string, soThang?: number): Promise<SoLieuKhach> {
    const p = { khach: username, tu: this.tuNgay(this.chuanHoaSoThang(soThang)) };

    // Sản lượng: kg từ CONGNO, kèm số dòng không đọc được để màn nói thật.
    const [sl] = await this.hoi<any>(
      `SELECT ${TONG_KG} AS soKg,
              SUM(CASE WHEN c.NgayGhiNo >= DATEADD(day,-30,GETDATE()) THEN ISNULL(${KG},0) ELSE 0 END) AS soKg30Ngay,
              SUM(CASE WHEN ${KG} IS NULL THEN 1 ELSE 0 END) AS soDongThieuKg
       FROM CONGNO c ${KG_CROSS_APPLY}
       WHERE c.DaXoa = 0 AND c.style = ${STYLE_CAN_KG}
         AND c.UserName = :khach AND c.NgayGhiNo >= :tu`,
      p,
    );

    // Số kiện và lần gửi gần nhất: tbTracking.
    const [kien] = await this.hoi<any>(
      `SELECT COUNT(*) AS soKien, MAX(t.NgayTao) AS lanGuiGanNhat
       FROM tbTracking t
       WHERE t.DaXoa = 0 AND t.UserName = :khach AND t.NgayTao >= :tu`,
      p,
    );

    // Số tuyến đếm từ CHÍNH nguồn vẽ biểu đồ tuyến (CONGNO), không đếm từ
    // tbTracking: hai bảng không khớp nhau (HP3028 có 1 kiện đi Mỹ trong
    // tracking nhưng không có dòng cân nào cho tuyến đó), nên đếm chéo nguồn
    // thì ô số ghi "2 tuyến" mà biểu đồ ngay bên dưới chỉ vẽ 1.
    const [tuyen] = await this.hoi<any>(
      `SELECT COUNT(DISTINCT ${TUYEN_ID}) AS soTuyen
       FROM CONGNO c ${KG_CROSS_APPLY} ${TUYEN_CROSS_APPLY}
       WHERE c.DaXoa = 0 AND c.style = ${STYLE_CAN_KG}
         AND c.UserName = :khach AND c.NgayGhiNo >= :tu
         AND ${KG} IS NOT NULL AND ${TUYEN_ID} IS NOT NULL`,
      p,
    );

    // Dư nợ tính TỪ ĐẦU, không giới hạn khoảng ngày: số dư là số tích luỹ, cắt
    // theo khoảng xem sẽ ra con số không khớp bảng cân đối công nợ.
    const [no] = await this.hoi<any>(
      `SELECT SUM(ISNULL(c.DR,0)) AS tongPhatSinh, SUM(ISNULL(c.CR,0)) AS tongDaTra
       FROM CONGNO c
       WHERE c.DaXoa = 0 AND c.UserName = :khach`,
      { khach: username },
    );

    const tongPhatSinh = Number(no?.tongPhatSinh ?? 0);
    const tongDaTra = Number(no?.tongDaTra ?? 0);

    return {
      soKg: Math.round(Number(sl?.soKg ?? 0) * 100) / 100,
      soKg30Ngay: Math.round(Number(sl?.soKg30Ngay ?? 0) * 100) / 100,
      soDongThieuKg: Number(sl?.soDongThieuKg ?? 0),
      soKien: Number(kien?.soKien ?? 0),
      soTuyen: Number(tuyen?.soTuyen ?? 0),
      duNo: Math.round((tongPhatSinh - tongDaTra) * 100) / 100,
      tongPhatSinh,
      tongDaTra,
      lanGuiGanNhat: kien?.lanGuiGanNhat ? new Date(kien.lanGuiGanNhat).toISOString() : null,
    };
  }

  /** Sản lượng (kg) chia theo tuyến — để vẽ sơ đồ. */
  async theoTuyen(username: string, soThang?: number): Promise<TuyenCuaKhach[]> {
    const rows = await this.hoi<any>(
      `SELECT ISNULL(q.TenQuocGia, N'(chưa rõ tuyến)') AS tenQuocGia, ${TONG_KG} AS soKg
       FROM CONGNO c ${KG_CROSS_APPLY} ${TUYEN_CROSS_APPLY}
       LEFT JOIN tbQuocGia q ON q.QuocGiaID = ${TUYEN_ID}
       WHERE c.DaXoa = 0 AND c.style = ${STYLE_CAN_KG}
         AND c.UserName = :khach AND c.NgayGhiNo >= :tu
         AND ${KG} IS NOT NULL
       GROUP BY q.TenQuocGia
       ORDER BY 2 DESC`,
      { khach: username, tu: this.tuNgay(this.chuanHoaSoThang(soThang)) },
    );
    const tong = rows.reduce((s, r) => s + Number(r.soKg ?? 0), 0);
    return rows.map((r) => ({
      tenQuocGia: String(r.tenQuocGia),
      soKg: Math.round(Number(r.soKg ?? 0) * 100) / 100,
      tyLe: tong > 0 ? Math.round((Number(r.soKg ?? 0) / tong) * 1000) / 10 : 0,
    }));
  }

  /**
   * Chuỗi theo tháng: sản lượng và công nợ cạnh nhau.
   *
   * Ba nguồn (kg và tiền từ CONGNO, kiện từ tbTracking) được gộp Ở ĐÂY chứ
   * không FULL JOIN trong SQL: tháng có tiền mà không có hàng (khách chỉ trả nợ
   * cũ) và tháng có hàng mà chưa ghi nợ đều tồn tại thật, FULL JOIN trên SQL
   * Server 2014 viết ra dài mà vẫn phải vá tháng trống bằng JS.
   *
   * Tháng KHÔNG có dữ liệu vẫn được trả về với số 0 — thiếu tháng thì biểu đồ
   * nối thẳng hai cột cách nhau 3 tháng, nhìn như liên tiếp.
   */
  async theoThang(username: string, soThang?: number): Promise<ThangCuaKhach[]> {
    const n = this.chuanHoaSoThang(soThang);
    const p = { khach: username, tu: this.tuNgay(n) };

    const tien = await this.hoi<any>(
      `SELECT CONVERT(char(7), c.NgayGhiNo, 126) AS thang,
              SUM(ISNULL(c.DR,0)) AS phatSinh,
              SUM(ISNULL(c.CR,0)) AS daTra,
              ${TONG_KG} AS soKg
       FROM CONGNO c ${KG_CROSS_APPLY}
       WHERE c.DaXoa = 0 AND c.UserName = :khach AND c.NgayGhiNo >= :tu
       GROUP BY CONVERT(char(7), c.NgayGhiNo, 126)`,
      p,
    );

    const kien = await this.hoi<any>(
      `SELECT CONVERT(char(7), t.NgayTao, 126) AS thang, COUNT(*) AS soKien
       FROM tbTracking t
       WHERE t.DaXoa = 0 AND t.UserName = :khach AND t.NgayTao >= :tu
       GROUP BY CONVERT(char(7), t.NgayTao, 126)`,
      p,
    );

    // Số dư TRƯỚC khoảng đang xem, để cột lũy kế của tháng đầu không bắt đầu
    // lại từ 0 — khách đang nợ 50tr từ năm ngoái mà biểu đồ vẽ từ 0 là sai.
    const [truoc] = await this.hoi<any>(
      `SELECT SUM(ISNULL(c.DR,0)) - SUM(ISNULL(c.CR,0)) AS duDauKy
       FROM CONGNO c
       WHERE c.DaXoa = 0 AND c.UserName = :khach AND c.NgayGhiNo < :tu`,
      p,
    );

    const mKien = new Map(kien.map((r) => [String(r.thang), Number(r.soKien ?? 0)]));
    const mTien = new Map(tien.map((r) => [String(r.thang), r]));

    const nay = new Date();
    let luyKe = Number(truoc?.duDauKy ?? 0);
    const kq: ThangCuaKhach[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(nay.getFullYear(), nay.getMonth() - i, 1);
      const thang = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const t: any = mTien.get(thang);
      const phatSinh = Number(t?.phatSinh ?? 0);
      const daTra = Number(t?.daTra ?? 0);
      luyKe += phatSinh - daTra;
      kq.push({
        thang,
        soKg: Math.round(Number(t?.soKg ?? 0) * 100) / 100,
        soKien: mKien.get(thang) ?? 0,
        phatSinh,
        daTra,
        duNoCuoiThang: Math.round(luyKe * 100) / 100,
      });
    }

    /**
     * Cắt các tháng TRỐNG Ở ĐẦU dãy.
     *
     * Khách mở mã tháng 4/2026 mà chọn xem 12 tháng thì năm tháng đầu toàn 0 —
     * chiếm gần nửa biểu đồ để nói "lúc đó bạn chưa là khách". Chỉ cắt ở ĐẦU,
     * không cắt khoảng trống ở giữa: tháng khách nghỉ giữa kỳ là thông tin thật.
     *
     * Điều kiện gồm cả `duNoCuoiThang === 0` để không cắt mất tháng mà khách
     * chưa gửi gì nhưng vẫn đang treo nợ cũ.
     */
    let dau = 0;
    while (
      dau < kq.length - 1 &&
      kq[dau].soKg === 0 &&
      kq[dau].soKien === 0 &&
      kq[dau].phatSinh === 0 &&
      kq[dau].daTra === 0 &&
      kq[dau].duNoCuoiThang === 0
    ) {
      dau++;
    }
    return kq.slice(dau);
  }

  /**
   * Cả màn trong một lần gọi.
   *
   * Gộp vì đây là màn "cái nhìn tổng quan": ba khối luôn hiện cùng nhau, cùng
   * một khoảng thời gian. Ba lần gọi riêng chỉ thêm ba trạng thái tải mà không
   * cho khách thêm thông tin gì.
   */
  async tongQuan(username: string, soThang?: number) {
    const n = this.chuanHoaSoThang(soThang);
    const [soLieu, theoTuyen, theoThang] = await Promise.all([
      this.soLieu(username, n),
      this.theoTuyen(username, n),
      this.theoThang(username, n),
    ]);
    return { khach: username, soThang: n, soLieu, theoTuyen, theoThang };
  }

  /**
   * Danh sách khách để admin/CSKH xem hộ màn của khách.
   *
   * Loại tài khoản kho gom hàng: nó không phải khách, mà lại đứng đầu mọi bảng
   * xếp theo sản lượng.
   */
  async danhSachKhachCoDuLieu(tuKhoa?: string) {
    const tim = (tuKhoa ?? '').trim();
    return this.hoi<any>(
      `SELECT TOP 50 t.UserName AS khach, COUNT(*) AS soKien, MAX(t.NgayTao) AS lanCuoi
       FROM tbTracking t
       WHERE t.DaXoa = 0 AND t.UserName <> :khoChuaCoChu
         AND t.NgayTao >= DATEADD(month,-12,GETDATE())
         AND (:tim = '' OR t.UserName LIKE '%' + :tim + '%')
       GROUP BY t.UserName
       ORDER BY 2 DESC`,
      { tim, khoChuaCoChu: KHO_CHUA_CO_CHU },
    ).then((rows) =>
      rows.map((r) => ({
        khach: String(r.khach ?? ''),
        soKien: Number(r.soKien ?? 0),
        lanCuoi: r.lanCuoi ? new Date(r.lanCuoi).toISOString() : null,
      })),
    );
  }
}
