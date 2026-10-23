import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SystemLogsService } from '../system-logs/system-logs.service';

/**
 * THANH TOÁN CHO NHÀ CUNG CẤP — yêu cầu bên khách 23/10/2026.
 *
 *   "sau khi bên em thanh toán cho NCC sẽ có phần tick đã thanh toán, và nhập
 *    số tiền đã thanh toán cho từng đơn hàng. Và thêm 1 lựa chọn nữa là k cần
 *    tick, k cần nhập số tiền đã thanh toán cho đơn hàng bất kỳ, mà nhập 1 cục
 *    tiền đã thanh toán"
 *
 * Hỏi lại "trả gộp xử lý thế nào", bên khách chốt: "tự trừ vào đơn cũ nhất",
 * "ko tick đơn hàng, nhưng nhảy vào NCC đang thanh toán".
 *
 * Nên có HAI cách lập phiếu, ghi xuống CÙNG hai bảng (xem
 * `database/migrations/them-thanh-toan-ncc.sql`):
 *
 *   • theo đơn — người dùng tick đơn, gõ số tiền từng đơn
 *   • trả gộp  — người dùng chọn NCC, gõ một cục; máy chủ khấu vào đơn còn nợ
 *                CŨ NHẤT trước (theo ngày mua, rồi theo mã đơn)
 *
 * Phân bổ GHI XUỐNG lúc lập phiếu, không tính lại mỗi lần xem: có người sửa
 * giá NCC của một đơn cũ thì phiếu đã lập không tự trôi sang đơn khác.
 */

/** Dưới mức này coi như đã trả đủ — bụi làm tròn của cột `float` NCC_TongPhaiTra. */
export const NGUONG_DU = 1;

/** Trần số đơn trên một phiếu "theo đơn". */
export const SO_DON_TOI_DA = 500;

/** Tiền đã trả cho MỘT dòng đơn, chỉ tính phiếu chưa huỷ. Dùng chung mọi câu SQL. */
export const DA_TRA_SQL = `ISNULL((
  SELECT SUM(pd.SoTien)
  FROM   dbo.tbThanhToanNccDon pd
  JOIN   dbo.tbThanhToanNcc p ON p.PhieuID = pd.PhieuID AND p.DaXoa = 0
  WHERE  pd.DonHangID = dh.ID
), 0)`;

export interface DonConNo {
  ID: number;
  conLai: number;
}

export interface PhanBo {
  donHangId: number;
  soTien: number;
}

/** Làm tròn về 2 chữ số — đúng `decimal(18,2)` của bảng. */
const tron2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Khấu một cục tiền vào các đơn theo đúng thứ tự truyền vào (đã xếp cũ trước).
 *
 * Tách thành hàm thuần để kiểm được mà không cần CSDL: đây là chỗ một lỗi
 * nhỏ (lố một đơn, sót phần lẻ) là sổ phải trả lệch mà không ai thấy.
 */
export function phanBoCuTruoc(
  soTien: number,
  dsDon: DonConNo[],
): { phanBo: PhanBo[]; traDu: number } {
  let con = tron2(soTien);
  const phanBo: PhanBo[] = [];
  for (const d of dsDon) {
    if (con <= 0) break;
    const no = tron2(d.conLai);
    if (no < NGUONG_DU) continue;
    const tru = Math.min(con, no);
    phanBo.push({ donHangId: d.ID, soTien: tru });
    con = tron2(con - tru);
  }
  return { phanBo, traDu: con };
}

export interface YeuCauTheoDon {
  ngayTra?: string;
  ghiChu?: string;
  dong?: { donHangId?: unknown; soTien?: unknown }[];
}

export interface YeuCauGop {
  nccId?: unknown;
  ngayTra?: string;
  soTien?: unknown;
  ghiChu?: string;
}

export interface KetQuaLapPhieu {
  phieuId: number;
  soTien: number;
  soDon: number;
  daPhanBo: number;
  /** Phần tiền không gán được vào đơn nào — NCC đã hết nợ. */
  traDu: number;
}

@Injectable()
export class SupplierPaymentService {
  constructor(
    @Inject('SEQUELIZE') private readonly sequelize: Sequelize,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  private ngay(v?: string): string {
    const s = String(v ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s).getTime())) {
      throw new BadRequestException('Ngày thanh toán không hợp lệ.');
    }
    return s;
  }

  private tien(v: unknown, ten = 'Số tiền'): number {
    const n = typeof v === 'string' ? Number(v.replace(/[.,\s]/g, '')) : Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new BadRequestException(`${ten} phải lớn hơn 0.`);
    if (n > 1e13) throw new BadRequestException(`${ten} quá lớn.`);
    return tron2(n);
  }

  private async ghiPhieu(
    t: Transaction,
    p: { nccId: number; ngayTra: string; soTien: number; loai: 'theo-don' | 'gop'; ghiChu: string | null; nguoi: string },
    phanBo: PhanBo[],
  ): Promise<number> {
    const [r] = await this.sequelize.query<{ PhieuID: number }>(
      `INSERT INTO dbo.tbThanhToanNcc (NCC_ID, NgayTra, SoTien, Loai, GhiChu, NguoiTao)
       OUTPUT INSERTED.PhieuID
       VALUES (:nccId, :ngayTra, :soTien, :loai, :ghiChu, :nguoi)`,
      { replacements: p, type: QueryTypes.SELECT, transaction: t },
    );
    const phieuId = Number(r?.PhieuID);
    if (!phieuId) throw new Error('Không lấy được mã phiếu vừa tạo');
    for (const pb of phanBo) {
      await this.sequelize.query(
        `INSERT INTO dbo.tbThanhToanNccDon (PhieuID, DonHangID, SoTien) VALUES (:phieuId, :don, :soTien)`,
        { replacements: { phieuId, don: pb.donHangId, soTien: pb.soTien }, transaction: t },
      );
    }
    return phieuId;
  }

  private ghiNhatKy(nguoi: string, hanhDong: string, doiTuong: string, noiDung: string) {
    return this.systemLogsService
      .create({ nguoiTao: nguoi, nguon: 'ThanhToanNCC', hanhDong, doiTuong, noiDung })
      .catch((err) => console.error('[SystemLog]', err?.message ?? err));
  }

  /**
   * Trả THEO ĐƠN: tick đơn, gõ số tiền từng đơn.
   *
   * Mọi đơn trên một phiếu phải cùng một NCC — một phiếu là một lần chuyển
   * tiền cho một nhà cung cấp. Trả lố số còn nợ của một đơn thì từ chối: gõ
   * thừa một số 0 là chuyện thường, nhận vào thì sổ ra "trả dư" giả.
   */
  async lapTheoDon(yc: YeuCauTheoDon, nguoi: string): Promise<KetQuaLapPhieu> {
    const ngayTra = this.ngay(yc?.ngayTra);
    const ds = Array.isArray(yc?.dong) ? yc.dong : [];
    if (!ds.length) throw new BadRequestException('Chưa tick đơn nào.');
    if (ds.length > SO_DON_TOI_DA) {
      throw new BadRequestException(`Mỗi phiếu tối đa ${SO_DON_TOI_DA} đơn.`);
    }

    const dong: PhanBo[] = [];
    const daGap = new Set<number>();
    for (const d of ds) {
      const id = Number(d?.donHangId);
      if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Mã đơn không hợp lệ.');
      if (daGap.has(id)) throw new BadRequestException(`Đơn ${id} bị chọn hai lần.`);
      daGap.add(id);
      dong.push({ donHangId: id, soTien: this.tien(d?.soTien, `Số tiền đơn ${id}`) });
    }

    return this.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
      async (t) => {
        const rows = await this.sequelize.query<{
          ID: number; ordernumber: string | null; NCC_ID: number | null; DaXoa: boolean;
          NCC_TongPhaiTra: number | null; daTra: number;
        }>(
          `SELECT dh.ID, dh.ordernumber, dh.NCC_ID, dh.DaXoa, dh.NCC_TongPhaiTra,
                  ${DA_TRA_SQL} AS daTra
           FROM   dbo.DON_HANG dh
           WHERE  dh.ID IN (:ids)`,
          { replacements: { ids: dong.map((d) => d.donHangId) }, type: QueryTypes.SELECT, transaction: t },
        );
        const theoId = new Map(rows.map((r) => [Number(r.ID), r]));

        let nccId: number | null = null;
        for (const d of dong) {
          const r = theoId.get(d.donHangId);
          const ten = r?.ordernumber || d.donHangId;
          if (!r || r.DaXoa) throw new BadRequestException(`Không có đơn ${ten}.`);
          if (r.NCC_ID === null || r.NCC_TongPhaiTra === null) {
            throw new BadRequestException(`Đơn ${ten} chưa nhập giá nhà cung cấp.`);
          }
          if (nccId === null) nccId = Number(r.NCC_ID);
          else if (nccId !== Number(r.NCC_ID)) {
            throw new BadRequestException(
              'Các đơn đã tick thuộc nhiều nhà cung cấp. Mỗi phiếu chỉ cho một nhà cung cấp.',
            );
          }
          const conLai = tron2(Number(r.NCC_TongPhaiTra) - Number(r.daTra ?? 0));
          if (d.soTien > conLai + NGUONG_DU) {
            throw new BadRequestException(
              `Đơn ${ten} chỉ còn nợ ${Math.round(conLai).toLocaleString('vi-VN')}đ, ` +
                `không trả ${Math.round(d.soTien).toLocaleString('vi-VN')}đ được.`,
            );
          }
        }

        const soTien = tron2(dong.reduce((a, d) => a + d.soTien, 0));
        const phieuId = await this.ghiPhieu(
          t,
          { nccId: nccId as number, ngayTra, soTien, loai: 'theo-don', ghiChu: yc?.ghiChu?.trim() || null, nguoi },
          dong,
        );
        await this.ghiNhatKy(
          nguoi, 'Them', `Phieu ${phieuId}`,
          `Theo don; NCC ${nccId}; ${soTien}d; ${dong.map((d) => `${d.donHangId}=${d.soTien}`).join(', ')}`,
        );
        return { phieuId, soTien, soDon: dong.length, daPhanBo: soTien, traDu: 0 };
      },
    );
  }

  /**
   * Trả GỘP: chọn NCC, gõ một cục — tự khấu vào đơn còn nợ cũ nhất trước.
   *
   * SERIALIZABLE: hai người cùng lập phiếu gộp cho một NCC thì người sau phải
   * thấy phần người trước đã khấu, không thì cả hai cùng trừ vào một đơn.
   */
  async lapGop(yc: YeuCauGop, nguoi: string): Promise<KetQuaLapPhieu> {
    const ngayTra = this.ngay(yc?.ngayTra);
    const nccId = Number(yc?.nccId);
    if (!Number.isInteger(nccId) || nccId <= 0) throw new BadRequestException('Chưa chọn nhà cung cấp.');
    const soTien = this.tien(yc?.soTien);

    return this.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
      async (t) => {
        const [ncc] = await this.sequelize.query<{ n: number }>(
          `SELECT COUNT(*) AS n FROM dbo.tbNhaCungCap WHERE NhaCungCapID = :nccId`,
          { replacements: { nccId }, type: QueryTypes.SELECT, transaction: t },
        );
        if (!Number(ncc?.n)) throw new NotFoundException('Không có nhà cung cấp này.');

        const dsDon = await this.sequelize.query<DonConNo>(
          `SELECT ID, conLai FROM (
             SELECT dh.ID,
                    COALESCE(dh.ngaymuahang, dh.ngaysaveLink) AS ngay,
                    dh.NCC_TongPhaiTra - ${DA_TRA_SQL} AS conLai
             FROM   dbo.DON_HANG dh
             WHERE  dh.DaXoa = 0 AND dh.NCC_ID = :nccId AND dh.NCC_TongPhaiTra IS NOT NULL
           ) x
           WHERE  conLai >= :nguong
           ORDER  BY ngay, ID`,
          { replacements: { nccId, nguong: NGUONG_DU }, type: QueryTypes.SELECT, transaction: t },
        );

        const { phanBo, traDu } = phanBoCuTruoc(soTien, dsDon.map((d) => ({ ID: Number(d.ID), conLai: Number(d.conLai) })));
        const phieuId = await this.ghiPhieu(
          t,
          { nccId, ngayTra, soTien, loai: 'gop', ghiChu: yc?.ghiChu?.trim() || null, nguoi },
          phanBo,
        );
        const daPhanBo = tron2(soTien - traDu);
        await this.ghiNhatKy(
          nguoi, 'Them', `Phieu ${phieuId}`,
          `Tra gop; NCC ${nccId}; ${soTien}d; phan bo ${phanBo.length} don (${daPhanBo}d); du ${traDu}d; ` +
            phanBo.map((p) => `${p.donHangId}=${p.soTien}`).join(', '),
        );
        return { phieuId, soTien, soDon: phanBo.length, daPhanBo, traDu };
      },
    );
  }

  /** Danh sách phiếu, lọc theo NCC và NGÀY TRẢ. */
  async danhSach(loc: { nccId?: number; tuNgay?: string; denNgay?: string; coPhieuHuy?: boolean }) {
    const dk = ['1 = 1'];
    const thay: Record<string, unknown> = {};
    if (!loc.coPhieuHuy) dk.push('p.DaXoa = 0');
    if (loc.nccId) {
      dk.push('p.NCC_ID = :nccId');
      thay.nccId = loc.nccId;
    }
    if (loc.tuNgay && /^\d{4}-\d{2}-\d{2}$/.test(loc.tuNgay)) {
      dk.push('p.NgayTra >= :tuNgay');
      thay.tuNgay = loc.tuNgay;
    }
    if (loc.denNgay && /^\d{4}-\d{2}-\d{2}$/.test(loc.denNgay)) {
      dk.push('p.NgayTra <= :denNgay');
      thay.denNgay = loc.denNgay;
    }
    return this.sequelize.query(
      `SELECT TOP 500 p.PhieuID, p.NCC_ID, ncc.TenNhaCungCap, p.NgayTra, p.SoTien, p.Loai,
              p.GhiChu, p.NguoiTao, p.NgayTao, p.DaXoa, p.NguoiXoa, p.NgayXoa,
              (SELECT COUNT(*) FROM dbo.tbThanhToanNccDon d WHERE d.PhieuID = p.PhieuID) AS soDon,
              ISNULL((SELECT SUM(d.SoTien) FROM dbo.tbThanhToanNccDon d WHERE d.PhieuID = p.PhieuID), 0) AS daPhanBo
       FROM   dbo.tbThanhToanNcc p
       LEFT   JOIN dbo.tbNhaCungCap ncc ON ncc.NhaCungCapID = p.NCC_ID
       WHERE  ${dk.join(' AND ')}
       ORDER  BY p.NgayTra DESC, p.PhieuID DESC`,
      { replacements: thay, type: QueryTypes.SELECT },
    );
  }

  /** Phiếu đó đã trừ vào những đơn nào. */
  async chiTiet(phieuId: number) {
    return this.sequelize.query(
      `SELECT d.DonHangID, dh.ordernumber, dh.username,
              COALESCE(dh.ngaymuahang, dh.ngaysaveLink) AS ngayMua,
              dh.NCC_TongPhaiTra, d.SoTien
       FROM   dbo.tbThanhToanNccDon d
       LEFT   JOIN dbo.DON_HANG dh ON dh.ID = d.DonHangID
       WHERE  d.PhieuID = :phieuId
       ORDER  BY COALESCE(dh.ngaymuahang, dh.ngaysaveLink), d.DonHangID`,
      { replacements: { phieuId }, type: QueryTypes.SELECT },
    );
  }

  /**
   * Huỷ phiếu nhập nhầm. Không xoá: phân bổ của phiếu thôi được tính, nhưng
   * vẫn truy được ai lập, ai huỷ, lúc nào.
   */
  async huy(phieuId: number, nguoi: string): Promise<{ phieuId: number }> {
    const [r] = await this.sequelize.query<{ soDong: number }>(
      `SET NOCOUNT ON;
       UPDATE dbo.tbThanhToanNcc
       SET    DaXoa = 1, NguoiXoa = :nguoi, NgayXoa = GETDATE()
       WHERE  PhieuID = :phieuId AND DaXoa = 0;
       SELECT @@ROWCOUNT AS soDong;`,
      { replacements: { phieuId, nguoi }, type: QueryTypes.SELECT },
    );
    if (!Number(r?.soDong)) throw new NotFoundException('Không có phiếu này, hoặc phiếu đã huỷ.');
    await this.ghiNhatKy(nguoi, 'Xoa', `Phieu ${phieuId}`, 'Huy phieu thanh toan NCC');
    return { phieuId };
  }

  /**
   * Số dư từng NCC trên TOÀN BỘ sổ, không theo bộ lọc ngày: "còn nợ NCC bao
   * nhiêu" là câu hỏi về hôm nay, không phải về một khoảng ngày mua.
   */
  async soDu() {
    return this.sequelize.query(
      `WITH PT AS (
         SELECT dh.NCC_ID, SUM(dh.NCC_TongPhaiTra) AS phaiTra
         FROM   dbo.DON_HANG dh
         WHERE  dh.DaXoa = 0 AND dh.NCC_ID IS NOT NULL AND dh.NCC_TongPhaiTra IS NOT NULL
         GROUP  BY dh.NCC_ID
       ), TT AS (
         SELECT NCC_ID, SUM(SoTien) AS daTra FROM dbo.tbThanhToanNcc WHERE DaXoa = 0 GROUP BY NCC_ID
       )
       SELECT COALESCE(PT.NCC_ID, TT.NCC_ID) AS NCC_ID, ncc.TenNhaCungCap,
              ISNULL(PT.phaiTra, 0) AS phaiTra,
              ISNULL(TT.daTra, 0) AS daTra,
              ISNULL(PT.phaiTra, 0) - ISNULL(TT.daTra, 0) AS conNo
       FROM   PT FULL OUTER JOIN TT ON TT.NCC_ID = PT.NCC_ID
       LEFT   JOIN dbo.tbNhaCungCap ncc ON ncc.NhaCungCapID = COALESCE(PT.NCC_ID, TT.NCC_ID)
       ORDER  BY ISNULL(PT.phaiTra, 0) - ISNULL(TT.daTra, 0) DESC`,
      { type: QueryTypes.SELECT },
    );
  }
}
