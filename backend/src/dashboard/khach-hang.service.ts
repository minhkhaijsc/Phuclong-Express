import { Injectable, Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';

/**
 * Số liệu tổng quan cho TÀI KHOẢN KHÁCH HÀNG (màn /tong-quan).
 *
 * Khác hẳn dashboard admin: ở đây mọi câu lệnh đều bị khoá cứng vào một
 * username. Username KHÔNG BAO GIỜ lấy từ query string — controller đọc từ
 * JWT rồi truyền xuống. Nếu để khách tự truyền `?khach=` thì khách A xem được
 * công nợ của khách B, mà công nợ là thứ nhạy cảm nhất trong hệ này.
 *
 * CHỌN THƯỚC ĐO — đo dữ liệu thật ngày 09/10/2026 rồi mới chọn:
 *
 *   • "Sản lượng" = SỐ KIỆN, lấy từ tbTracking. Lý do: 131.594 kiện trong 12
 *     tháng, chỉ 4 kiện thiếu tuyến (0,003%) → chia theo tuyến tin được.
 *   • KG chỉ là số phụ, KHÔNG dùng làm thước đo chính: CONGNO.SanLuong mới
 *     được điền từ 06/2026, cả 12 tháng chỉ 7.856/55.677 dòng có số. Lấy kg
 *     làm cột chính thì khách nhìn 5 tháng đầu tưởng mình không gửi gì.
 *   • Công nợ: DR = phát sinh, CR = đã trả. Dư nợ = Σ DR − Σ CR từ đầu, giống
 *     đúng cách bảng "Cân đối công nợ" đang tính (SP_BaoCao_ChiTietCongNo1 với
 *     @TuKyID=-1 cho số đầu kỳ = 0).
 *
 * Số dư ÂM là chuyện bình thường (khách trả trước — HP3028 đang âm 12,9 tr),
 * nên bên giao diện phải đổi nhãn theo dấu, đừng hiện "Dư nợ: -12.906.335đ".
 */

/** Tài khoản kho gom hàng chưa khớp chủ — không phải khách thật. */
const KHO_CHUA_CO_CHU = 'CHECKKHACH';

export interface SoLieuKhach {
  /** Tổng kiện trong khoảng đang xem. */
  soKien: number;
  /** Kiện của 30 ngày gần nhất — để khách thấy nhịp hiện tại. */
  soKien30Ngay: number;
  /** Kg đã cân được; `kgThieuSo` = true khi có kiện mà chưa có kg nào. */
  soKg: number;
  kgThieuSo: boolean;
  soTuyen: number;
  /** Σ DR − Σ CR TỪ ĐẦU (không theo khoảng ngày) — số dư thật hôm nay. */
  duNo: number;
  tongPhatSinh: number;
  tongDaTra: number;
  lanGuiGanNhat: string | null;
}

export interface TuyenCuaKhach {
  tenQuocGia: string;
  soKien: number;
  tyLe: number;
}

export interface ThangCuaKhach {
  /** yyyy-MM */
  thang: string;
  soKien: number;
  soKg: number;
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

    const [kien] = await this.hoi<any>(
      `SELECT COUNT(*) AS soKien,
              COUNT(DISTINCT t.QuocGiaID) AS soTuyen,
              SUM(CASE WHEN t.NgayTao >= DATEADD(day,-30,GETDATE()) THEN 1 ELSE 0 END) AS soKien30Ngay,
              MAX(t.NgayTao) AS lanGuiGanNhat
       FROM tbTracking t
       WHERE t.DaXoa = 0 AND t.UserName = :khach AND t.NgayTao >= :tu`,
      p,
    );

    const [kg] = await this.hoi<any>(
      `SELECT SUM(ISNULL(c.SanLuong,0)) AS soKg
       FROM CONGNO c
       WHERE c.DaXoa = 0 AND c.UserName = :khach AND c.NgayGhiNo >= :tu`,
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

    const soKien = Number(kien?.soKien ?? 0);
    const soKg = Number(kg?.soKg ?? 0);
    const tongPhatSinh = Number(no?.tongPhatSinh ?? 0);
    const tongDaTra = Number(no?.tongDaTra ?? 0);

    return {
      soKien,
      soKien30Ngay: Number(kien?.soKien30Ngay ?? 0),
      soKg: Math.round(soKg * 100) / 100,
      kgThieuSo: soKien > 0 && soKg <= 0,
      soTuyen: Number(kien?.soTuyen ?? 0),
      duNo: Math.round((tongPhatSinh - tongDaTra) * 100) / 100,
      tongPhatSinh,
      tongDaTra,
      lanGuiGanNhat: kien?.lanGuiGanNhat ? new Date(kien.lanGuiGanNhat).toISOString() : null,
    };
  }

  /** Sản lượng chia theo tuyến — để vẽ sơ đồ tròn/thanh. */
  async theoTuyen(username: string, soThang?: number): Promise<TuyenCuaKhach[]> {
    const rows = await this.hoi<any>(
      `SELECT ISNULL(q.TenQuocGia, N'(chưa gán tuyến)') AS tenQuocGia, COUNT(*) AS soKien
       FROM tbTracking t
       LEFT JOIN tbQuocGia q ON q.QuocGiaID = t.QuocGiaID
       WHERE t.DaXoa = 0 AND t.UserName = :khach AND t.NgayTao >= :tu
       GROUP BY q.TenQuocGia
       ORDER BY 2 DESC`,
      { khach: username, tu: this.tuNgay(this.chuanHoaSoThang(soThang)) },
    );
    const tong = rows.reduce((s, r) => s + Number(r.soKien ?? 0), 0);
    return rows.map((r) => ({
      tenQuocGia: String(r.tenQuocGia),
      soKien: Number(r.soKien ?? 0),
      tyLe: tong > 0 ? Math.round((Number(r.soKien ?? 0) / tong) * 1000) / 10 : 0,
    }));
  }

  /**
   * Chuỗi theo tháng: sản lượng và công nợ cạnh nhau.
   *
   * Hai nguồn (tbTracking cho kiện, CONGNO cho tiền) được gộp Ở ĐÂY chứ không
   * FULL JOIN trong SQL: tháng có tiền mà không có kiện (khách chỉ trả nợ cũ)
   * và tháng có kiện mà chưa ghi nợ đều tồn tại thật, FULL JOIN trên SQL Server
   * 2014 viết ra dài mà vẫn phải vá tháng trống bằng JS.
   *
   * Tháng KHÔNG có dữ liệu vẫn được trả về với số 0 — thiếu tháng thì biểu đồ
   * nối thẳng hai cột cách nhau 3 tháng, nhìn như liên tiếp.
   */
  async theoThang(username: string, soThang?: number): Promise<ThangCuaKhach[]> {
    const n = this.chuanHoaSoThang(soThang);
    const p = { khach: username, tu: this.tuNgay(n) };

    const kien = await this.hoi<any>(
      `SELECT CONVERT(char(7), t.NgayTao, 126) AS thang, COUNT(*) AS soKien
       FROM tbTracking t
       WHERE t.DaXoa = 0 AND t.UserName = :khach AND t.NgayTao >= :tu
       GROUP BY CONVERT(char(7), t.NgayTao, 126)`,
      p,
    );

    const tien = await this.hoi<any>(
      `SELECT CONVERT(char(7), c.NgayGhiNo, 126) AS thang,
              SUM(ISNULL(c.DR,0)) AS phatSinh,
              SUM(ISNULL(c.CR,0)) AS daTra,
              SUM(ISNULL(c.SanLuong,0)) AS soKg
       FROM CONGNO c
       WHERE c.DaXoa = 0 AND c.UserName = :khach AND c.NgayGhiNo >= :tu
       GROUP BY CONVERT(char(7), c.NgayGhiNo, 126)`,
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
        soKien: mKien.get(thang) ?? 0,
        soKg: Math.round(Number(t?.soKg ?? 0) * 100) / 100,
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
