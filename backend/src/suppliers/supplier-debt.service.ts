import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

export interface LocCongNoNcc {
  tuNgay?: string;
  denNgay?: string;
  nccId?: number;
  /** 'con-no' = còn phải trả, 'da-tra' = đã trả xong. Bỏ trống = tất cả. */
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
}

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
  private dieuKien(loc: LocCongNoNcc): { sql: string; thay: Record<string, any> } {
    const dk = ['dh.DaXoa = 0', 'dh.NCC_TongPhaiTra IS NOT NULL'];
    const thay: Record<string, any> = {};

    if (loc.tuNgay) {
      dk.push('COALESCE(dh.ngaymuahang, dh.ngaysaveLink) >= :tuNgay');
      thay.tuNgay = loc.tuNgay;
    }
    if (loc.denNgay) {
      dk.push('COALESCE(dh.ngaymuahang, dh.ngaysaveLink) <= :denNgay');
      thay.denNgay = loc.denNgay;
    }
    if (loc.nccId) {
      dk.push('dh.NCC_ID = :nccId');
      thay.nccId = loc.nccId;
    }
    // Chưa có bảng ghi phiếu trả tiền, nên "đã trả" tạm hiểu là đơn đã hoàn
    // tất. Khi nào có phiếu trả thì sửa đúng ở đây, một chỗ.
    if (loc.trangThai === 'da-tra') dk.push("dh.trangthaiOrder = 'Completed'");
    if (loc.trangThai === 'con-no') dk.push("dh.trangthaiOrder <> 'Completed'");

    return { sql: dk.join(' AND '), thay };
  }

  /** Gộp theo nhà cung cấp — phần trên của trang. */
  async tongTheoNcc(loc: LocCongNoNcc): Promise<TongTheoNcc[]> {
    const { sql, thay } = this.dieuKien(loc);
    return this.sequelize.query<TongTheoNcc>(
      `SELECT dh.NCC_ID,
              MAX(ncc.TenNhaCungCap)                         AS TenNhaCungCap,
              COUNT(*)                                       AS soDon,
              SUM(ISNULL(dh.NCC_NgoaiTe, 0))                 AS tongNgoaiTe,
              SUM(ISNULL(dh.NCC_Cong, 0))                    AS tongCong,
              SUM(ISNULL(dh.NCC_TongPhaiTra, 0))             AS tongPhaiTra,
              SUM(ISNULL(dh.tongtienVND, 0))                 AS tongThuKhach,
              SUM(ISNULL(dh.tongtienVND, 0) - ISNULL(dh.NCC_TongPhaiTra, 0)) AS laiLo
       FROM   dbo.DON_HANG dh
       LEFT   JOIN dbo.tbNhaCungCap ncc ON ncc.NhaCungCapID = dh.NCC_ID
       WHERE  ${sql}
       GROUP  BY dh.NCC_ID
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
   * Số dòng CHƯA NHẬP giá nhà cung cấp trong cùng khoảng — để trang nói thật
   * về độ phủ. Không có con số này thì người xem tưởng tổng phải trả đã là
   * toàn bộ, trong khi có thể mới nhập được một phần.
   */
  async soDonChuaNhap(loc: LocCongNoNcc): Promise<number> {
    const dk = ['dh.DaXoa = 0', 'dh.NCC_TongPhaiTra IS NULL'];
    const thay: Record<string, any> = {};
    if (loc.tuNgay) {
      dk.push('COALESCE(dh.ngaymuahang, dh.ngaysaveLink) >= :tuNgay');
      thay.tuNgay = loc.tuNgay;
    }
    if (loc.denNgay) {
      dk.push('COALESCE(dh.ngaymuahang, dh.ngaysaveLink) <= :denNgay');
      thay.denNgay = loc.denNgay;
    }
    const [r] = await this.sequelize.query<{ soDon: number }>(
      `SELECT COUNT(*) AS soDon FROM dbo.DON_HANG dh WHERE ${dk.join(' AND ')}`,
      { replacements: thay, type: QueryTypes.SELECT },
    );
    return Number(r?.soDon ?? 0);
  }
}
