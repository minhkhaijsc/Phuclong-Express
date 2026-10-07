import { Injectable, Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { formatSqlDate, formatSqlEndOfDay, parseVietnameseDate } from '../helpers/sql-date.helper';

/**
 * Số liệu VẬN HÀNH cho dashboard — mảng vận chuyển (tbTracking).
 *
 * VÌ SAO CÓ TỆP NÀY: dashboard cũ chỉ đo DON_HANG (≈664 đơn/tháng) và CONGNO,
 * không chạm tbTracking (≈9.500 kiện/tháng) — tức bỏ qua khoảng 93% khối lượng
 * thực tế. Khảo sát dữ liệu ngày 07/10/2026.
 *
 * VÌ SAO KHÔNG DÙNG STORED PROCEDURE như phần còn lại của module:
 *   - Đây là báo cáo CHỈ ĐỌC, không có nghiệp vụ nào cần nằm trong CSDL.
 *   - Các SP sẵn có trong hệ này nối chuỗi thô vào SQL động rồi EXEC
 *     (xem ghi chú ở `docs/deploy.md`); viết thẳng với `replacements` thì tham
 *     số được bind đúng cách, không có chỗ cho SQL injection.
 *   - Không phải đụng vào CSDL thật để thêm SP mới cho một màn hình đọc.
 *
 * HAI CHỖ DỮ LIỆU HỎNG đã biết, số liệu dưới đây né sẵn:
 *   1. `TinhTrang='Completed'` không được ghi lần nào từ 22/03/2025, nên KHÔNG
 *      dựng phễu trạng thái hay "tồn kho" trên trường đó — sẽ ra số sai mà nhìn
 *      vẫn hợp lý.
 *   2. `NhaVanChuyenID` trống ở 9.502/9.504 kiện gần đây → không làm bộ lọc
 *      theo nhà vận chuyển.
 */

/** Tài khoản gom hàng về chưa khớp được chủ. 11.690 kiện, 100% thiếu OrderNumber. */
export const KHO_CHUA_CO_CHU = 'CHECKKHACH';

export interface SoLieuVanHanh {
  /**
   * Hàng về THEO ĐỢT chứ không đều ngày — nhìn chuỗi ngày thật: 23/9, 25/9,
   * 26/9, 30/9, 6/10. Nên thẻ "hôm nay" sẽ hiện 0 gần như mọi hôm và trông như
   * hỏng. Thay bằng lần nhập gần nhất: ngày nào, bao nhiêu kiện, cách đây mấy ngày.
   */
  ngayNhapGanNhat: string | null;
  kienLanGanNhat: number;
  soNgayTuLanNhap: number | null;
  kien7Ngay: number;
  kienTrongKy: number;
  /** Kiện về nhưng chưa khớp được chủ — việc cần làm, không phải số để ngắm. */
  kienChuaCoChu: number;
  /** Phần trăm trên tổng kiện trong kỳ. */
  tyLeChuaCoChu: number;
  /** Kiện chưa có tấm ảnh nào. */
  kienChuaCoAnh: number;
  soKhach: number;
}

@Injectable()
export class VanHanhService {
  constructor(@Inject('SEQUELIZE') private readonly sequelize: Sequelize) {}

  /** Khoảng ngày: dd/MM/yyyy, mặc định 30 ngày gần nhất. */
  private khoang(tuNgay?: string, denNgay?: string) {
    const nay = new Date();
    const macDinhTu = new Date(nay.getFullYear(), nay.getMonth(), nay.getDate() - 29);
    const tu = parseVietnameseDate(tuNgay || '') || macDinhTu;
    const den = parseVietnameseDate(denNgay || '') || nay;
    return {
      tu: formatSqlDate(tu),
      den: formatSqlEndOfDay(new Date(den.getFullYear(), den.getMonth(), den.getDate(), 23, 59, 59)),
    };
  }

  /**
   * Mệnh đề lọc dùng chung.
   *
   * `quocGiaId` và `khach` là tuỳ chọn. Dùng dạng `(:x IS NULL OR cot = :x)` để
   * một câu lệnh phục vụ mọi tổ hợp lọc — không phải ghép chuỗi theo điều kiện,
   * tức không có chỗ nào cho SQL injection chen vào.
   */
  private readonly LOC = `
    t.DaXoa = 0
    AND t.NgayTao BETWEEN :tu AND :den
    AND (:quocGiaId IS NULL OR t.QuocGiaID = :quocGiaId)
    AND (:khach IS NULL OR t.UserName = :khach)`;

  private thamSo(tuNgay?: string, denNgay?: string, quocGiaId?: number, khach?: string) {
    const { tu, den } = this.khoang(tuNgay, denNgay);
    return {
      tu,
      den,
      quocGiaId: quocGiaId && quocGiaId > 0 ? quocGiaId : null,
      khach: khach && khach.trim() ? khach.trim() : null,
    };
  }

  private async hoi<T = any>(sql: string, replacements: Record<string, unknown>): Promise<T[]> {
    const kq = await this.sequelize.query(sql, { replacements, type: 'SELECT' as const });
    if (!Array.isArray(kq)) return [];
    return (Array.isArray(kq[0]) ? kq[0] : kq) as T[];
  }

  /** Các con số đầu màn vận hành. */
  async laySoLieu(
    tuNgay?: string,
    denNgay?: string,
    quocGiaId?: number,
    khach?: string,
  ): Promise<SoLieuVanHanh> {
    const p = this.thamSo(tuNgay, denNgay, quocGiaId, khach);

    const [tong] = await this.hoi<any>(
      `SELECT
         COUNT(*) AS kienTrongKy,
         COUNT(DISTINCT t.UserName) AS soKhach,
         SUM(CASE WHEN t.UserName = :khoChuaCoChu THEN 1 ELSE 0 END) AS kienChuaCoChu,
         SUM(CASE WHEN t.NgayTao >= DATEADD(day,-7,GETDATE()) THEN 1 ELSE 0 END) AS kien7Ngay,
         MAX(CAST(t.NgayTao AS date)) AS ngayNhapGanNhat
       FROM tbTracking t
       WHERE ${this.LOC}`,
      { ...p, khoChuaCoChu: KHO_CHUA_CO_CHU },
    );

    // Kiện chưa có tấm ảnh nào. Bảng ảnh nối bằng TrackingID (khoá), KHÔNG phải
    // TrackingNumber — một mã tracking có thể xuất hiện ở nhiều dòng nên nối
    // bằng mã sẽ đếm sai.
    const [anh] = await this.hoi<any>(
      `SELECT COUNT(*) AS kienChuaCoAnh
       FROM tbTracking t
       WHERE ${this.LOC}
         AND NOT EXISTS (
           SELECT 1 FROM tbAnhTracking a
           WHERE a.TrackingID = t.TrackingID AND a.DaXoa = 0
         )`,
      p,
    );

    const kienTrongKy = Number(tong?.kienTrongKy ?? 0);
    const kienChuaCoChu = Number(tong?.kienChuaCoChu ?? 0);

    // Số kiện của chính ngày nhập gần nhất — "đợt vừa rồi về bao nhiêu".
    const ngayGanNhat: Date | null = tong?.ngayNhapGanNhat ? new Date(tong.ngayNhapGanNhat) : null;
    let kienLanGanNhat = 0;
    if (ngayGanNhat) {
      const [ln] = await this.hoi<any>(
        `SELECT COUNT(*) AS soKien FROM tbTracking t
         WHERE ${this.LOC} AND CAST(t.NgayTao AS date) = :ngay`,
        { ...p, ngay: ngayGanNhat.toISOString().slice(0, 10) },
      );
      kienLanGanNhat = Number(ln?.soKien ?? 0);
    }

    return {
      kienTrongKy,
      soKhach: Number(tong?.soKhach ?? 0),
      kienChuaCoChu,
      tyLeChuaCoChu: kienTrongKy > 0 ? Math.round((kienChuaCoChu / kienTrongKy) * 1000) / 10 : 0,
      ngayNhapGanNhat: ngayGanNhat ? ngayGanNhat.toISOString().slice(0, 10) : null,
      kienLanGanNhat,
      soNgayTuLanNhap: ngayGanNhat
        ? Math.floor((Date.now() - ngayGanNhat.getTime()) / 86400000)
        : null,
      kien7Ngay: Number(tong?.kien7Ngay ?? 0),
      kienChuaCoAnh: Number(anh?.kienChuaCoAnh ?? 0),
    };
  }

  /** Kiện về theo ngày, tách riêng phần chưa có chủ để nhìn ra xu hướng. */
  async kienTheoNgay(tuNgay?: string, denNgay?: string, quocGiaId?: number, khach?: string) {
    const p = this.thamSo(tuNgay, denNgay, quocGiaId, khach);
    const rows = await this.hoi<any>(
      `SELECT CAST(t.NgayTao AS date) AS ngay,
              COUNT(*) AS soKien,
              SUM(CASE WHEN t.UserName = :khoChuaCoChu THEN 1 ELSE 0 END) AS chuaCoChu
       FROM tbTracking t
       WHERE ${this.LOC}
       GROUP BY CAST(t.NgayTao AS date)
       ORDER BY 1`,
      { ...p, khoChuaCoChu: KHO_CHUA_CO_CHU },
    );
    return rows.map((r) => ({
      ngay: r.ngay instanceof Date ? r.ngay.toISOString().slice(0, 10) : String(r.ngay).slice(0, 10),
      soKien: Number(r.soKien ?? 0),
      chuaCoChu: Number(r.chuaCoChu ?? 0),
    }));
  }

  /** Sản lượng theo tuyến (quốc gia). */
  async kienTheoTuyen(tuNgay?: string, denNgay?: string, khach?: string) {
    const p = this.thamSo(tuNgay, denNgay, undefined, khach);
    const rows = await this.hoi<any>(
      `SELECT q.QuocGiaID AS quocGiaId,
              ISNULL(q.TenQuocGia, N'(chưa gán tuyến)') AS tenQuocGia,
              COUNT(*) AS soKien
       FROM tbTracking t
       LEFT JOIN tbQuocGia q ON q.QuocGiaID = t.QuocGiaID
       WHERE ${this.LOC}
       GROUP BY q.QuocGiaID, q.TenQuocGia
       ORDER BY 3 DESC`,
      p,
    );
    return rows.map((r) => ({
      quocGiaId: r.quocGiaId === null ? null : Number(r.quocGiaId),
      tenQuocGia: String(r.tenQuocGia),
      soKien: Number(r.soKien ?? 0),
    }));
  }

  /**
   * Top khách theo sản lượng.
   *
   * Luôn LOẠI tài khoản gom hàng chưa có chủ: nó chiếm ~27% khối lượng và sẽ
   * đứng đầu bảng, đẩy khách thật xuống dưới trong khi nó không phải khách.
   */
  async topKhach(tuNgay?: string, denNgay?: string, quocGiaId?: number, gioiHan = 10) {
    const p = this.thamSo(tuNgay, denNgay, quocGiaId, undefined);
    const rows = await this.hoi<any>(
      `SELECT TOP (:gioiHan)
              t.UserName AS khach,
              COUNT(*) AS soKien,
              MAX(t.NgayTao) AS lanCuoi
       FROM tbTracking t
       WHERE ${this.LOC} AND t.UserName <> :khoChuaCoChu
       GROUP BY t.UserName
       ORDER BY 2 DESC`,
      { ...p, gioiHan, khoChuaCoChu: KHO_CHUA_CO_CHU },
    );
    return rows.map((r) => ({
      khach: String(r.khach ?? ''),
      soKien: Number(r.soKien ?? 0),
      lanCuoi: r.lanCuoi ? new Date(r.lanCuoi).toISOString() : null,
    }));
  }

  /**
   * Cảnh báo chất lượng dữ liệu — hiện thẳng trên dashboard.
   *
   * Người dùng chọn "hiện thật kèm cảnh báo" thay vì giấu đi: con số xấu mà
   * đúng còn hơn dashboard đẹp mà giấu mất việc phải sửa.
   */
  async canhBaoDuLieu() {
    const [tt] = await this.hoi<any>(
      `SELECT MAX(NgayChuyenTinhTrang) AS lanCuoi
       FROM tbTinhTrangTracking WHERE TinhTrang = 'Completed'`,
      {},
    );
    const [vc] = await this.hoi<any>(
      `SELECT COUNT(*) AS tong,
              SUM(CASE WHEN NhaVanChuyenID IS NULL THEN 1 ELSE 0 END) AS thieuNhaVanChuyen
       FROM tbTracking
       WHERE DaXoa = 0 AND NgayTao >= DATEADD(day,-30,GETDATE())`,
      {},
    );

    const ds: { muc: string; noiDung: string }[] = [];
    if (tt?.lanCuoi) {
      const ngay = new Date(tt.lanCuoi);
      const soNgay = Math.floor((Date.now() - ngay.getTime()) / 86400000);
      if (soNgay > 60) {
        ds.push({
          muc: 'Trạng thái "Hoàn tất" không còn được cập nhật',
          noiDung:
            `Lần cuối có kiện chuyển sang "Completed" là ${ngay.toLocaleDateString('vi-VN')} ` +
            `(${soNgay} ngày trước). Vì vậy dashboard KHÔNG dựng chỉ số tồn kho hay tỷ lệ ` +
            `hoàn tất trên trạng thái này — sẽ ra số sai.`,
        });
      }
    }
    const tong = Number(vc?.tong ?? 0);
    const thieu = Number(vc?.thieuNhaVanChuyen ?? 0);
    if (tong > 0 && thieu / tong > 0.9) {
      ds.push({
        muc: 'Chưa ghi nhà vận chuyển',
        noiDung: `${thieu}/${tong} kiện trong 30 ngày không có nhà vận chuyển, nên không lọc theo tiêu chí này được.`,
      });
    }
    return ds;
  }

  /** Danh sách tuyến có dữ liệu, để đổ vào ô lọc. */
  async danhSachTuyen() {
    return this.hoi<any>(
      `SELECT q.QuocGiaID AS quocGiaId, q.TenQuocGia AS tenQuocGia, COUNT(t.TrackingID) AS soKien
       FROM tbQuocGia q
       LEFT JOIN tbTracking t ON t.QuocGiaID = q.QuocGiaID AND t.DaXoa = 0
            AND t.NgayTao >= DATEADD(day,-90,GETDATE())
       GROUP BY q.QuocGiaID, q.TenQuocGia
       HAVING COUNT(t.TrackingID) > 0
       ORDER BY 3 DESC`,
      {},
    ).then((rows) =>
      rows.map((r) => ({
        quocGiaId: Number(r.quocGiaId),
        tenQuocGia: String(r.tenQuocGia),
        soKien: Number(r.soKien ?? 0),
      })),
    );
  }
}
