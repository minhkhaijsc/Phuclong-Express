import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  formatSqlDate,
  formatSqlEndOfDay,
  parseVietnameseDate,
} from '../helpers/sql-date.helper';
import { DA_TRA_SQL, NGUONG_DU } from './supplier-payment.service';

export interface LocCongNoNcc {
  tuNgay?: string;
  denNgay?: string;
  nccId?: number;
  /** Tuyến của ĐƠN (`DON_HANG.QuocGiaID`), không phải tuyến ghi trong tên NCC. */
  quocGiaId?: number;
  /**
   * 'con-no' = còn phải trả, 'da-tra' = đã trả đủ NCC. Bỏ trống = tất cả.
   * Tính theo PHIẾU THANH TOÁN (từ 23/10/2026), không còn theo trạng thái đơn.
   */
  trangThai?: 'con-no' | 'da-tra';
  page?: number;
  limit?: number;
}

export interface DongCongNoNcc {
  ID: number;
  ordernumber: string | null;
  username: string | null;
  ngayMua: Date | null;
  WebsiteName: string | null;
  TenQuocGia: string | null;
  linkweb: string | null;
  loaitien: string | null;
  soluong: number | null;
  tongtienVND: number | null;
  NCC_ID: number | null;
  TenNhaCungCap: string | null;
  NCC_NgoaiTe: number | null;
  NCC_Cong: number | null;
  NCC_TyGia: number | null;
  NCC_TongPhaiTra: number | null;
  NCC_Tracking: string | null;
  NCC_LaiLo: number | null;
  /** Đã trả NCC cho dòng này (tổng các phiếu chưa huỷ). */
  NCC_DaTra: number;
  trangthaiOrder: string | null;
}

export interface TongTheoNcc {
  NCC_ID: number | null;
  TenNhaCungCap: string | null;
  soDon: number;
  tongNgoaiTe: number;
  tongCong: number;
  tongPhaiTra: number;
  tongThuKhach: number;
  laiLo: number;
  /** Đã trả, phân bổ vào các đơn TRONG bộ lọc. */
  daTra: number;
}

export interface TongTheoTuyen extends Omit<TongTheoNcc, 'NCC_ID' | 'TenNhaCungCap'> {
  QuocGiaID: number | null;
  TenQuocGia: string | null;
}

/** Một đơn chưa nhập giá NCC — đủ để tìm ra đơn mà nhập bù. */
export interface DongChuaNhap {
  ID: number;
  ordernumber: string | null;
  username: string | null;
  usernamesave: string | null;
  ngayMua: Date | null;
  TenQuocGia: string | null;
  WebsiteName: string | null;
  linkweb: string | null;
  soluong: number | null;
  loaitien: string | null;
  tongtienVND: number | null;
  trangthaiOrder: string | null;
}

/**
 * Các cột cộng dồn, DÙNG CHUNG cho gộp theo NCC và gộp theo tuyến — hai bảng
 * phải cộng cùng một kiểu thì tổng hai bảng mới khớp nhau và khớp ô tổng hợp.
 */
const COT_TONG = `COUNT(*)                                       AS soDon,
              SUM(ISNULL(dh.NCC_NgoaiTe, 0))                 AS tongNgoaiTe,
              /*
               * NCC_Cong là PHẦN TRĂM (sửa 15/10/2026), nên CỘNG THẲNG CỘT ĐÓ
               * LÀ VÔ NGHĨA — ba đơn 3% + 5% + 2% ra "10", không phải tiền.
               * Cộng số tiền công thật: Ngoại tệ × %Công / 100.
               */
              SUM(ISNULL(dh.NCC_NgoaiTe, 0) * ISNULL(dh.NCC_Cong, 0) / 100) AS tongCong,
              SUM(ISNULL(dh.NCC_TongPhaiTra, 0))             AS tongPhaiTra,
              SUM(ISNULL(dh.tongtienVND, 0))                 AS tongThuKhach,
              SUM(ISNULL(dh.tongtienVND, 0) - ISNULL(dh.NCC_TongPhaiTra, 0)) AS laiLo,
              SUM(ISNULL(tt.daTra, 0))                       AS daTra`;

/* JOIN chứ không dùng DA_TRA_SQL: SQL Server không cho SUM() bọc một truy vấn
   con ("Cannot perform an aggregate function on an expression containing an
   aggregate or a subquery"). */
const JOIN_DA_TRA = `LEFT   JOIN (
         SELECT pd.DonHangID, SUM(pd.SoTien) AS daTra
         FROM   dbo.tbThanhToanNccDon pd
         JOIN   dbo.tbThanhToanNcc p ON p.PhieuID = pd.PhieuID AND p.DaXoa = 0
         GROUP  BY pd.DonHangID
       ) tt ON tt.DonHangID = dh.ID`;

/**
 * CÔNG NỢ PHẢI TRẢ NHÀ CUNG CẤP.
 *
 * Yêu cầu bên khách 12/10/2026: "Thiết kế thêm giúp em 1 trang chi tiết công nợ
 * phải trả cho NCC, quyền kế toán, GD dc xem".
 *
 * KHÁC HẲN `CONGNO` — bảng công nợ sẵn có là công nợ KHÁCH PHẢI TRẢ MÌNH, ghi
 * từng dòng nợ/có theo kỳ, có chốt kỳ và duyệt. Phía nhà cung cấp hiện chưa có
 * sổ nào cả; số phải trả nằm ngay trên dòng đơn (`DON_HANG.NCC_TongPhaiTra`).
 * Nên trang này ĐỌC TỪ ĐƠN HÀNG chứ không dựng thêm một sổ kế toán thứ hai:
 * dựng sổ thứ hai là phải có đối chiếu giữa hai sổ, mà bên khách chưa yêu cầu
 * tới mức đó. Khi nào cần theo dõi từng lần TRẢ TIỀN cho NCC (chứ không chỉ số
 * phải trả) thì lúc đó mới thêm bảng ghi phiếu trả.
 *
 * LỌC THEO NGÀY dùng `COALESCE(ngaymuahang, ngaysaveLink)`: ngày phát sinh nợ
 * với nhà cung cấp là ngày đi mua. Nhưng `ngaymuahang` để trống ở một phần đơn,
 * nên lùi về `ngaysaveLink` thay vì để những dòng đó biến mất khỏi sổ — thiếu
 * một dòng trong sổ phải trả tệ hơn là xếp nó vào hơi lệch ngày.
 */
@Injectable()
export class SupplierDebtService {
  constructor(@Inject('SEQUELIZE') private readonly sequelize: Sequelize) {}

  /**
   * Chỉ tính những dòng ĐÃ CÓ giá nhà cung cấp (`NCC_TongPhaiTra IS NOT NULL`).
   * Dòng chưa nhập không phải là nợ 0 đồng, nó là chưa biết — đưa vào sổ với
   * số 0 thì tổng phải trả nhìn như đã đủ trong khi còn thiếu.
   */
  /**
   * Mệnh đề lọc theo khoảng ngày. MỘT CHỖ DUY NHẤT — trước đây đoạn này được
   * chép ở hai nơi, nên lỗi dưới đây cũng tồn tại ở cả hai.
   *
   * PHẢI ĐỔI dd/MM/yyyy SANG yyyy-MM-dd TRƯỚC KHI BIND. Bản đầu (12/10/2026)
   * nhét thẳng chuỗi "15/10/2026" vào phép so với cột datetime; SQL Server quy
   * đổi theo DATEFORMAT của phiên — mặc định `mdy` — nên đọc 15 là THÁNG, không
   * có tháng 15, đổ lỗi và cả đường API trả 500. Tức là trang Công nợ phải trả
   * NCC hỏng với MỌI khoảng ngày có ngày từ 13 trở lên, mà hai ô ngày thì luôn
   * điền sẵn. Những ngày 1–12 thì không báo lỗi nhưng ra SAI: 05/10 bị hiểu
   * thành 10/05.
   *
   * Ngày không đọc được thì BỎ QUA mệnh đề đó thay vì ném lỗi — thà trả rộng
   * hơn còn hơn làm trắng cả trang.
   */
  private locTheoNgay(
    loc: LocCongNoNcc,
    dk: string[],
    thay: Record<string, any>,
  ): void {
    const tu = loc.tuNgay ? parseVietnameseDate(loc.tuNgay) : null;
    if (tu) {
      dk.push('COALESCE(dh.ngaymuahang, dh.ngaysaveLink) >= :tuNgay');
      thay.tuNgay = formatSqlDate(tu);
    }

    const den = loc.denNgay ? parseVietnameseDate(loc.denNgay) : null;
    if (den) {
      // HẾT ngày, không phải 00:00 — không thì đơn mua chiều hôm cuối kỳ rơi ra ngoài.
      dk.push('COALESCE(dh.ngaymuahang, dh.ngaysaveLink) <= :denNgay');
      thay.denNgay = formatSqlEndOfDay(
        new Date(den.getFullYear(), den.getMonth(), den.getDate(), 23, 59, 59),
      );
    }
  }

  /**
   * Lọc theo tuyến của ĐƠN. Một NCC có thể mua cho nhiều tuyến (thẻ VN 9852
   * dùng chung), nên lọc theo tên NCC không thay được lọc theo tuyến.
   */
  private locTheoTuyen(loc: LocCongNoNcc, dk: string[], thay: Record<string, any>): void {
    if (loc.quocGiaId) {
      dk.push('dh.QuocGiaID = :quocGiaId');
      thay.quocGiaId = loc.quocGiaId;
    }
  }

  private dieuKien(loc: LocCongNoNcc): { sql: string; thay: Record<string, any> } {
    const dk = ['dh.DaXoa = 0', 'dh.NCC_TongPhaiTra IS NOT NULL'];
    const thay: Record<string, any> = {};

    this.locTheoNgay(loc, dk, thay);
    if (loc.nccId) {
      dk.push('dh.NCC_ID = :nccId');
      thay.nccId = loc.nccId;
    }
    this.locTheoTuyen(loc, dk, thay);
    // "Đã trả" theo PHIẾU THANH TOÁN NCC (23/10/2026). Trước đó chưa có sổ trả
    // tiền nên tạm hiểu là đơn Completed — sai nghĩa: đơn xong với khách
    // không có nghĩa là đã trả tiền nhà cung cấp.
    if (loc.trangThai === 'da-tra') dk.push(`dh.NCC_TongPhaiTra - ${DA_TRA_SQL} < ${NGUONG_DU}`);
    if (loc.trangThai === 'con-no') dk.push(`dh.NCC_TongPhaiTra - ${DA_TRA_SQL} >= ${NGUONG_DU}`);

    return { sql: dk.join(' AND '), thay };
  }

  /** Gộp theo nhà cung cấp — phần trên của trang. */
  async tongTheoNcc(loc: LocCongNoNcc): Promise<TongTheoNcc[]> {
    const { sql, thay } = this.dieuKien(loc);
    return this.sequelize.query<TongTheoNcc>(
      `SELECT dh.NCC_ID,
              MAX(ncc.TenNhaCungCap)                         AS TenNhaCungCap,
              ${COT_TONG}
       FROM   dbo.DON_HANG dh
       LEFT   JOIN dbo.tbNhaCungCap ncc ON ncc.NhaCungCapID = dh.NCC_ID
       ${JOIN_DA_TRA}
       WHERE  ${sql}
       GROUP  BY dh.NCC_ID
       ORDER  BY SUM(ISNULL(dh.NCC_TongPhaiTra, 0)) DESC`,
      { replacements: thay, type: QueryTypes.SELECT },
    );
  }

  /**
   * Gộp theo TUYẾN của đơn (yêu cầu 02/11/2026): "muốn xem tổng theo tuyến",
   * và thẻ VN 9852 "dùng chung cho các tuyến" cần thấy từng tuyến bao nhiêu.
   * Cùng bộ lọc với bảng theo NCC — chọn NCC = thẻ thì bảng này tách thẻ đó
   * ra theo tuyến. Tuyến đã ẩn VẪN hiện: nợ cũ của tuyến ngừng vẫn là nợ.
   */
  async tongTheoTuyen(loc: LocCongNoNcc): Promise<TongTheoTuyen[]> {
    const { sql, thay } = this.dieuKien(loc);
    return this.sequelize.query<TongTheoTuyen>(
      `SELECT dh.QuocGiaID,
              MAX(qg.TenQuocGia)                             AS TenQuocGia,
              ${COT_TONG}
       FROM   dbo.DON_HANG dh
       LEFT   JOIN dbo.tbQuocGia qg ON qg.QuocGiaID = dh.QuocGiaID
       ${JOIN_DA_TRA}
       WHERE  ${sql}
       GROUP  BY dh.QuocGiaID
       ORDER  BY SUM(ISNULL(dh.NCC_TongPhaiTra, 0)) DESC`,
      { replacements: thay, type: QueryTypes.SELECT },
    );
  }

  /** Từng dòng đơn — phần dưới của trang. */
  async chiTiet(
    loc: LocCongNoNcc,
  ): Promise<{ data: DongCongNoNcc[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(loc.page) || 1);
    const limit = Math.min(Math.max(1, Number(loc.limit) || 50), 5000);
    const { sql, thay } = this.dieuKien(loc);

    const [dem] = await this.sequelize.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM dbo.DON_HANG dh WHERE ${sql}`,
      { replacements: thay, type: QueryTypes.SELECT },
    );

    // SQL Server 2014 có OFFSET/FETCH (từ 2012), không cần con trỏ như SP cũ.
    const data = await this.sequelize.query<DongCongNoNcc>(
      `SELECT dh.ID, dh.ordernumber, dh.username,
              COALESCE(dh.ngaymuahang, dh.ngaysaveLink) AS ngayMua,
              dh.WebsiteName, qg.TenQuocGia, dh.linkweb, dh.loaitien, dh.soluong,
              dh.tongtienVND,
              dh.NCC_ID, ncc.TenNhaCungCap,
              dh.NCC_NgoaiTe, dh.NCC_Cong, dh.NCC_TyGia, dh.NCC_TongPhaiTra,
              dh.NCC_Tracking,
              ISNULL(dh.tongtienVND, 0) - ISNULL(dh.NCC_TongPhaiTra, 0) AS NCC_LaiLo,
              ${DA_TRA_SQL} AS NCC_DaTra,
              dh.trangthaiOrder
       FROM   dbo.DON_HANG dh
       LEFT   JOIN dbo.tbNhaCungCap ncc ON ncc.NhaCungCapID = dh.NCC_ID
       LEFT   JOIN dbo.tbQuocGia qg     ON qg.QuocGiaID = dh.QuocGiaID
       WHERE  ${sql}
       ORDER  BY COALESCE(dh.ngaymuahang, dh.ngaysaveLink) DESC, dh.ID DESC
       OFFSET :boQua ROWS FETCH NEXT :lay ROWS ONLY`,
      {
        replacements: { ...thay, boQua: (page - 1) * limit, lay: limit },
        type: QueryTypes.SELECT,
      },
    );

    return { data, total: Number(dem?.total ?? 0), page, limit };
  }

  /**
   * Điều kiện "CHƯA NHẬP giá NCC" — dùng chung cho con số cảnh báo và danh
   * sách xem chi tiết, để hai chỗ luôn ra cùng một tập đơn.
   */
  private dieuKienChuaNhap(loc: LocCongNoNcc): { sql: string; thay: Record<string, any> } {
    const dk = ['dh.DaXoa = 0', 'dh.NCC_TongPhaiTra IS NULL'];
    const thay: Record<string, any> = {};
    this.locTheoNgay(loc, dk, thay);
    // Tuyến thì biết ngay trên đơn (khác NCC — đơn chưa nhập giá thường chưa có
    // NCC), nên lọc tuyến thì cảnh báo "còn N đơn chưa nhập" cũng theo tuyến đó.
    this.locTheoTuyen(loc, dk, thay);
    return { sql: dk.join(' AND '), thay };
  }

  /**
   * Số dòng CHƯA NHẬP giá nhà cung cấp trong cùng khoảng — để trang nói thật
   * về độ phủ. Không có con số này thì người xem tưởng tổng phải trả đã là
   * toàn bộ, trong khi có thể mới nhập được một phần.
   */
  async soDonChuaNhap(loc: LocCongNoNcc): Promise<number> {
    const { sql, thay } = this.dieuKienChuaNhap(loc);
    const [r] = await this.sequelize.query<{ soDon: number }>(
      `SELECT COUNT(*) AS soDon FROM dbo.DON_HANG dh WHERE ${sql}`,
      { replacements: thay, type: QueryTypes.SELECT },
    );
    return Number(r?.soDon ?? 0);
  }

  /**
   * Danh sách các đơn chưa nhập giá NCC (yêu cầu 03/11/2026: "làm sao để
   * check được 43 đơn này là đơn nào… cho em xin mục xem thêm"). Cùng điều
   * kiện với `soDonChuaNhap` nên số dòng khớp đúng con số cảnh báo.
   * Chặn 2000 dòng: đây là danh sách để đi nhập bù, không phải báo cáo.
   */
  async dsChuaNhap(loc: LocCongNoNcc): Promise<DongChuaNhap[]> {
    const { sql, thay } = this.dieuKienChuaNhap(loc);
    return this.sequelize.query<DongChuaNhap>(
      `SELECT TOP 2000 dh.ID, dh.ordernumber, dh.username, dh.usernamesave,
              COALESCE(dh.ngaymuahang, dh.ngaysaveLink) AS ngayMua,
              qg.TenQuocGia, dh.WebsiteName, dh.linkweb, dh.soluong, dh.loaitien,
              dh.tongtienVND, dh.trangthaiOrder
       FROM   dbo.DON_HANG dh
       LEFT   JOIN dbo.tbQuocGia qg ON qg.QuocGiaID = dh.QuocGiaID
       WHERE  ${sql}
       ORDER  BY COALESCE(dh.ngaymuahang, dh.ngaysaveLink) DESC, dh.ID DESC`,
      { replacements: thay, type: QueryTypes.SELECT },
    );
  }
}
