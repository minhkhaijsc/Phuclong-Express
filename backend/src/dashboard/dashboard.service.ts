import { Injectable, Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { formatSqlDate, formatSqlEndOfDay, parseVietnameseDate } from '../helpers/sql-date.helper';

/**
 * Dashboard Service
 *
 * Tổng hợp số liệu thống kê admin qua các stored procedure (SQL Server).
 * Mọi GROUP BY/SUM/COUNT làm ở SP — service chỉ EXEC + map key sang camelCase.
 * Tham số ngày: dd/MM/yyyy; mặc định = đầu→cuối tháng hiện tại.
 */
@Injectable()
export class DashboardService {
  constructor(@Inject('SEQUELIZE') private readonly sequelize: Sequelize) {}

  /** Resolve khoảng ngày: parse dd/MM/yyyy, fallback = tháng hiện tại. */
  private resolveRange(fromDate?: string, toDate?: string): { tuNgay: string; denNgay: string } {
    const now = new Date();
    const from = parseVietnameseDate(fromDate || '') || new Date(now.getFullYear(), now.getMonth(), 1);
    const to = parseVietnameseDate(toDate || '') || new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { tuNgay: formatSqlDate(from), denNgay: formatSqlEndOfDay(new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59)) };
  }

  /** EXEC 1 SP nhận @TuNgay/@DenNgay, trả mảng rows (chuẩn hoá nested array của MSSQL). */
  private async execRange(sp: string, fromDate?: string, toDate?: string): Promise<any[]> {
    const { tuNgay, denNgay } = this.resolveRange(fromDate, toDate);
    const results = await this.sequelize.query(`EXEC ${sp} @TuNgay = :tuNgay, @DenNgay = :denNgay`, {
      replacements: { tuNgay, denNgay },
      type: 'SELECT' as const,
    });
    if (Array.isArray(results)) {
      return Array.isArray(results[0]) ? (results[0] as any[]) : (results as any[]);
    }
    return [];
  }

  /** KH mới theo ngày. */
  async getNewCustomersByDay(fromDate?: string, toDate?: string): Promise<{ ngay: string; soKHMoi: number }[]> {
    try {
      const rows = await this.execRange('SP_Dashboard_KhachHangMoiTheoNgay', fromDate, toDate);
      return rows.map((r) => ({ ngay: r.Ngay, soKHMoi: Number(r.SoKHMoi) || 0 }));
    } catch (error) {
      console.error('Error in getNewCustomersByDay:', error.message);
      return [];
    }
  }

  /** Doanh thu theo ngày (đơn đã hoàn tất). */
  async getRevenueByDay(
    fromDate?: string,
    toDate?: string,
  ): Promise<{ ngay: string; doanhThu: number; soDon: number }[]> {
    try {
      const rows = await this.execRange('SP_Dashboard_DoanhThuTheoNgay', fromDate, toDate);
      return rows.map((r) => ({
        ngay: r.Ngay,
        doanhThu: Number(r.DoanhThu) || 0,
        soDon: Number(r.SoDon) || 0,
      }));
    } catch (error) {
      console.error('Error in getRevenueByDay:', error.message);
      return [];
    }
  }

  /** Sản lượng (kg) theo ngày. */
  async getOutputByDay(fromDate?: string, toDate?: string): Promise<{ ngay: string; sanLuongKg: number }[]> {
    try {
      const rows = await this.execRange('SP_Dashboard_SanLuongTheoNgay', fromDate, toDate);
      return rows.map((r) => ({ ngay: r.Ngay, sanLuongKg: Number(r.SanLuongKg) || 0 }));
    } catch (error) {
      console.error('Error in getOutputByDay:', error.message);
      return [];
    }
  }

  /** Sản lượng mỗi nhân viên theo tháng (số đơn + số kg), lọc được theo Tuyến (Quốc gia). */
  async getOutputByStaff(
    fromDate?: string,
    toDate?: string,
    quocGiaId?: number,
  ): Promise<{ nhanVien: string; thang: string; soDon: number; sanLuongKg: number }[]> {
    try {
      const { tuNgay, denNgay } = this.resolveRange(fromDate, toDate);
      const results = await this.sequelize.query(
        `EXEC SP_Dashboard_SanLuongNhanVienTheoThang @TuNgay = :tuNgay, @DenNgay = :denNgay, @QuocGiaID = :quocGiaId`,
        { replacements: { tuNgay, denNgay, quocGiaId: quocGiaId ?? null }, type: 'SELECT' as const },
      );
      const rows: any[] = Array.isArray(results)
        ? Array.isArray(results[0]) ? (results[0] as any[]) : (results as any[])
        : [];
      return rows.map((r) => ({
        nhanVien: r.NhanVien || '',
        thang: r.Thang || '',
        soDon: Number(r.SoDon) || 0,
        sanLuongKg: Number(r.SanLuongKg) || 0,
      }));
    } catch (error) {
      console.error('Error in getOutputByStaff:', error.message);
      return [];
    }
  }

  /**
   * Sản lượng theo TUYẾN và theo tháng — "tuyến Hàn tháng này tổng bao nhiêu".
   *
   * Bảng sản lượng nhân viên lọc được theo tuyến, nhưng muốn so Hàn với Anh với
   * Mỹ thì phải đổi ô lọc ba lần rồi tự cộng. Bảng này bày sẵn cả ba.
   *
   * Dùng ĐÚNG cách tính của SP_Dashboard_SanLuongNhanVienTheoThang, chỉ đổi chỗ
   * gom nhóm từ nhân viên sang tuyến: số đơn đếm trên DON_HANG, sản lượng cộng
   * trên CONGNO, hai bảng giữ Tuyến riêng nên FULL OUTER JOIN để không rớt bên
   * nào. Lệch cách tính là hai bảng cạnh nhau ra hai con số, không ai tin nữa.
   *
   * Viết thẳng SQL thay vì thêm một SP: trên máy chủ thật phải chạy migration
   * mới có SP, mà phần lớn logic ở đây lại trùng với SP đã có.
   *
   * Tuyến trống (QuocGiaID NULL) vẫn hiện thành "Chưa gán tuyến" — giấu đi thì
   * cộng các dòng lại không bằng tổng, người xem tưởng báo cáo sai.
   */
  async getOutputByRoute(
    fromDate?: string,
    toDate?: string,
  ): Promise<{ quocGiaId: number | null; tenTuyen: string; thang: string; soDon: number; sanLuongKg: number }[]> {
    try {
      const { tuNgay, denNgay } = this.resolveRange(fromDate, toDate);
      const results = await this.sequelize.query(
        `WITH DonTheoTuyen AS (
           SELECT QuocGiaID, FORMAT(ngaymuahang, 'yyyy-MM') AS Thang, COUNT(*) AS SoDon
           FROM dbo.DON_HANG
           WHERE DaXoa = 0 AND ngaymuahang BETWEEN :tuNgay AND :denNgay
           GROUP BY QuocGiaID, FORMAT(ngaymuahang, 'yyyy-MM')
         ),
         KgTheoTuyen AS (
           SELECT QuocGiaID, FORMAT(NgayGhiNo, 'yyyy-MM') AS Thang, SUM(ISNULL(SanLuong, 0)) AS SanLuongKg
           FROM dbo.CONGNO
           WHERE DaXoa = 0 AND SanLuong IS NOT NULL AND NgayGhiNo BETWEEN :tuNgay AND :denNgay
           GROUP BY QuocGiaID, FORMAT(NgayGhiNo, 'yyyy-MM')
         ),
         Gop AS (
           SELECT ISNULL(d.QuocGiaID, k.QuocGiaID) AS QuocGiaID,
                  ISNULL(d.Thang, k.Thang)         AS Thang,
                  ISNULL(d.SoDon, 0)               AS SoDon,
                  ISNULL(k.SanLuongKg, 0)          AS SanLuongKg
           FROM DonTheoTuyen d
           FULL OUTER JOIN KgTheoTuyen k ON d.QuocGiaID = k.QuocGiaID AND d.Thang = k.Thang
         )
         SELECT g.QuocGiaID, g.Thang, g.SoDon, g.SanLuongKg, q.TenQuocGia
         FROM Gop g
         LEFT JOIN dbo.tbQuocGia q ON q.QuocGiaID = g.QuocGiaID
         ORDER BY g.Thang, g.SanLuongKg DESC, g.SoDon DESC`,
        { replacements: { tuNgay, denNgay }, type: 'SELECT' as const },
      );
      const rows: any[] = Array.isArray(results)
        ? Array.isArray(results[0]) ? (results[0] as any[]) : (results as any[])
        : [];
      return rows.map((r) => ({
        quocGiaId: r.QuocGiaID == null ? null : Number(r.QuocGiaID),
        tenTuyen: r.TenQuocGia || 'Chưa gán tuyến',
        thang: r.Thang || '',
        soDon: Number(r.SoDon) || 0,
        sanLuongKg: Number(r.SanLuongKg) || 0,
      }));
    } catch (error) {
      console.error('Error in getOutputByRoute:', error.message);
      return [];
    }
  }

  /** Chi tiết sản lượng từng bản ghi CONGNO của 1 nhân viên trong 1 tháng, lọc được theo Tuyến. */
  async getOutputDetailByStaff(
    nhanVien: string,
    thang: string,
    quocGiaId?: number,
  ): Promise<{ ngayGhiNo: string; khachHang: string; noiDung: string; sanLuongKg: number; ghiChu: string }[]> {
    try {
      const results = await this.sequelize.query(
        `EXEC SP_Dashboard_SanLuongChiTiet @NhanVien = :nhanVien, @Thang = :thang, @QuocGiaID = :quocGiaId`,
        { replacements: { nhanVien, thang, quocGiaId: quocGiaId ?? null }, type: 'SELECT' as const },
      );
      const rows: any[] = Array.isArray(results)
        ? Array.isArray(results[0]) ? (results[0] as any[]) : (results as any[])
        : [];
      return rows.map((r) => ({
        ngayGhiNo: r.NgayGhiNo ? String(r.NgayGhiNo).slice(0, 10) : '',
        khachHang: r.KhachHang || '',
        noiDung: r.NoiDung || '',
        sanLuongKg: Number(r.SanLuongKg) || 0,
        ghiChu: r.GhiChu || '',
      }));
    } catch (error) {
      console.error('Error in getOutputDetailByStaff:', error.message);
      return [];
    }
  }
}
