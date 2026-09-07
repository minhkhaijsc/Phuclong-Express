import { Injectable, Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { formatSqlDate, formatSqlEndOfDay, parseVietnameseDate } from '../helpers/sql-date.helper';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Debt Reports Service
 *
 * Uses Sequelize for MSSQL to get multiple result sets from stored procedures
 */
@Injectable()
export class DebtReportsService {
  constructor(
    @Inject('SEQUELIZE') private readonly sequelize: Sequelize,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Get detailed debt report
   * Matches: DBConnect.BaoCaoChiTietCongNo() -> SP_BaoCao_ChiTietCongNo1
   *
   * SP returns flat mixed result set:
   * - Rows with Loai (A/B/C/F) + SoTien — cân đối summary (Tables[2] in C#)
   * - Row with DauKy/TongPhatSinh/TongThanhToan/CuoiKy — period summary (Tables[1] in C#)
   * - Row with TOTALROW — total count (Tables[0] in C#)
   * - Remaining rows — detail data (CongNo_ID, NoiDung, NgayGhiNo, DR, CR, LuyKe, GhiChu)
   */
  async getDebtReports(
    username?: string,
    fromKyId?: number,
    toKyId?: number,
    page: number = 1,
    limit: number = 100,
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    summary: { dauKy: number; tongPhatSinh: number; tongThanhToan: number; cuoiKy: number };
    canDoiSummary: { loaiA: number; loaiB: number; loaiC: number; loaiF: number };
  }> {
    try {
      // Use raw query to get all result sets
      // Default -1 matches C# behavior: BaoCaoChiTietCongNo(username, -1, -1, pageSize, pageNum)
      const [results] = await this.sequelize.query(
        `EXEC SP_BaoCao_ChiTietCongNo1
          @username = :username,
          @TuKyID = :fromKyId,
          @DenKyID = :toKyId,
          @PageSize = :limit,
          @PageNum = :page`,
        {
          replacements: {
            username: username ?? null,
            fromKyId: fromKyId ?? -1,
            toKyId: toKyId ?? -1,
            limit,
            page,
          },
          raw: true,
        },
      );

      // Handle single array result from MSSQL
      const resultArray = results as unknown as Array<Record<string, unknown>>;
      let data: any[] = [];
      let summary = { dauKy: 0, tongPhatSinh: 0, tongThanhToan: 0, cuoiKy: 0 };
      let canDoiSummary = { loaiA: 0, loaiB: 0, loaiC: 0, loaiF: 0 };
      let total = 0;

      if (Array.isArray(resultArray) && resultArray.length > 0) {
        // Find period summary row (DauKy/TongPhatSinh/TongThanhToan/CuoiKy)
        const summaryItem = resultArray.find((item) => item && 'DauKy' in item);
        if (summaryItem) {
          summary = {
            dauKy: (summaryItem.DauKy as number) ?? 0,
            tongPhatSinh: (summaryItem.TongPhatSinh as number) ?? 0,
            tongThanhToan: (summaryItem.TongThanhToan as number) ?? 0,
            cuoiKy: (summaryItem.CuoiKy as number) ?? 0,
          };
        }

        // Extract Loai rows (A/B/C/F) — matches C# Tables[2] logic
        // C#: dataTable.Select("Loai = 'A'")[0]["SoTien"]
        const loaiItems = resultArray.filter((item) => item && 'Loai' in item);
        const getLoaiSoTien = (loai: string): number => {
          const item = loaiItems.find((i) => (i.Loai as string) === loai);
          return item ? ((item.SoTien as number) ?? 0) : 0;
        };
        canDoiSummary = {
          loaiA: getLoaiSoTien('A'),
          loaiB: getLoaiSoTien('B'),
          loaiC: getLoaiSoTien('C'),
          loaiF: getLoaiSoTien('F'),
        };

        // Find total count (item with TOTALROW)
        const totalItem = resultArray.find((item) => item && 'TOTALROW' in item);
        if (totalItem) {
          total = (totalItem.TOTALROW as number) ?? 0;
        }

        // Detail rows only — exclude TOTALROW, DauKy, and Loai rows
        data = resultArray.filter((item) => {
          if (!item) return false;
          return !('TOTALROW' in item) && !('DauKy' in item) && !('Loai' in item);
        });
      }

      return {
        data,
        total,
        page,
        limit,
        summary,
        canDoiSummary,
      };
    } catch (error) {
      console.error('Error in getDebtReports:', error.message);
      return {
        data: [],
        total: 0,
        page,
        limit,
        summary: { dauKy: 0, tongPhatSinh: 0, tongThanhToan: 0, cuoiKy: 0 },
        canDoiSummary: { loaiA: 0, loaiB: 0, loaiC: 0, loaiF: 0 },
      };
    }
  }

  /**
   * Get periods (Ky) for dropdown
   * Matches: DBConnect.LayDanhSachKy() and LayDanhSachKyByTinhTrang()
   */
  async getPeriods(includeClosed?: boolean): Promise<any[]> {
    try {
      let result: any[];

      if (includeClosed === true) {
        result = await this.sequelize.query(
          `EXEC SP_Lay_KyByTinhTrang @DaDong = :DaDong`,
          {
            replacements: { DaDong: 1 },
            type: 'SELECT' as const,
          },
        );
      } else {
        result = await this.sequelize.query(`EXEC SP_Lay_Ky`, {
          type: 'SELECT' as const,
        });
      }

      return result || [];
    } catch (error) {
      console.error('Error in getPeriods:', error.message);
      return [];
    }
  }

  /**
   * Get all users for dropdown
   * Matches: UserManager.Users in C#
   */
  async getUsers(): Promise<any[]> {
    try {
      const result = await this.sequelize.query(
        `SELECT Id, UserName FROM dbo.AspNetUsers ORDER BY UserName`,
        { type: 'SELECT' as const },
      );
      return result || [];
    } catch (error) {
      console.error('Error in getUsers:', error.message);
      return [];
    }
  }

  /**
   * Update debt record
   * Matches: DBConnect.CapNhatCongNoSimple() -> SP_CapNhat_CongNoSimple
   */
  async updateDebt(
    id: number,
    updateDto: { noiDung?: string; dr?: number; cr?: number; ghiChu?: string },
    username?: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      if (!updateDto.noiDung || updateDto.noiDung.trim() === '') {
        return { success: false, message: 'Bạn phải nhập nội dung công nợ' };
      }

      const dr = updateDto.dr ?? 0;
      const cr = updateDto.cr ?? 0;

      if (dr === 0 && cr === 0) {
        return { success: false, message: 'Phải nhập ít nhất một giá trị DR hoặc CR' };
      }

      await this.sequelize.query(
        `EXEC SP_CapNhat_CongNoSimple
          @CongNo_ID = :id,
          @NoiDung = :noiDung,
          @DR = :dr,
          @CR = :cr,
          @GhiChu = :ghiChu,
          @NguoiTao = :username`,
        {
          replacements: {
            id,
            noiDung: updateDto.noiDung.trim(),
            dr,
            cr,
            ghiChu: updateDto.ghiChu?.trim() || '',
            username: username || 'system',
          },
          type: 'SELECT' as const,
        },
      );

      // Log the action
      if (username) {
        await this.sequelize.query(
          `EXEC SP_Them_SystemLogs
            @NguoiTao = :username,
            @Nguon = :chucNang,
            @HanhDong = :hanhDong,
            @DoiTuong = :ma,
            @NoiDung = :ghiChu`,
          {
            replacements: {
              username,
              chucNang: 'ManageCongNo:CapNhatCongNo',
              hanhDong: 'Chinh sua',
              ma: id.toString(),
              ghiChu: `ID:${id}; NoiDung: ${updateDto.noiDung?.trim()}; DR: ${dr}; CR: ${cr}; GhiChu: ${updateDto.ghiChu?.trim() || ''}; status: true`,
            },
            type: 'SELECT' as const,
          },
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error in updateDebt:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get customer debt report (BaoCao_CongNoKhachHang)
   * Matches: DBConnect.BaoCaoCongNoKhachHang() -> SP_BaoCao_CongNoKhachHang
   * Data: UserName, TienNo, TienHangChuaGiao, PhanTram
   */
  async getCustomerDebtReport(): Promise<any[]> {
    try {
      // Use SET NOCOUNT ON
      const results = await this.sequelize.query(
        `SET NOCOUNT ON; EXEC SP_BaoCao_CongNoKhachHang`,
        { type: 'SELECT', raw: true },
      ) as any;

      // Handle array result from sequelize
      let data: any[] = [];
      if (Array.isArray(results)) {
        // Check if nested array
        if (results.length > 0 && Array.isArray(results[0])) {
          data = results[0];
        } else {
          data = results;
        }
      }

      return data;
    } catch (error) {
      console.error('Error in getCustomerDebtReport:', error.message);
      return [];
    }
  }

  /**
   * Export customer debt report to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in C#
   */
  async exportCustomerDebtReport(): Promise<{ csv: string; filename: string }> {
    try {
      const data = await this.getCustomerDebtReport();

      const lines: string[] = [];
      // Headers
      lines.push('UserName,TienNo,TienHangChuaGiao,PhanTram');

      for (const row of data) {
        const values = [
          row.UserName || '',
          row.TienNo || '0',
          row.TienHangChuaGiao || '0',
          row.PhanTram || '0',
        ];
        lines.push(values.join(','));
      }

      const csv = '\uFEFF' + lines.join('\r\n');
      const filename = `CongNoKhachHang_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}.csv`;

      return { csv, filename };
    } catch (error) {
      console.error('Error in exportCustomerDebtReport:', error.message);
      throw error;
    }
  }

  /**
   * Export debt report to Excel
   * Matches: btExportToExcelAllWithFilter_Click() in C#
   */
  async exportDebtReport(
    username?: string,
    fromKyId?: number,
    toKyId?: number,
  ): Promise<{ csv: string; filename: string }> {
    try {
      const result = await this.getDebtReports(username, fromKyId, toKyId, 1, 10000000);

      const lines: string[] = [];
      lines.push(`Đầu kỳ,${result.summary.dauKy.toString().replace(/,/g, '')}`);
      lines.push(`Tổng phát sinh,${result.summary.tongPhatSinh.toString().replace(/,/g, '')}`);
      lines.push(`Đã thanh toán,${result.summary.tongThanhToan.toString().replace(/,/g, '')}`);
      lines.push(`Cuối kỳ,${result.summary.cuoiKy.toString().replace(/,/g, '')}`);
      lines.push('');

      if (result.data.length > 0) {
        const headers = ['CongNo_ID', 'NoiDung', 'NgayGhiNo', 'DR', 'CR', 'LuyKe', 'GhiChu'];
        lines.push(headers.join(','));

        for (const row of result.data) {
          const values = [
            row.CongNo_ID || '',
            (row.NoiDung || '').replace(/,/g, ';').replace(/\n/g, ' ').replace(/\r/g, ' '),
            row.NgayGhiNo ? new Date(row.NgayGhiNo).toLocaleDateString('vi-VN') : '',
            row.DR || '0',
            row.CR || '0',
            row.LuyKe || '0',
            (row.GhiChu || '').replace(/,/g, ';').replace(/\n/g, ' ').replace(/\r/g, ' '),
          ];
          lines.push(values.join(','));
        }
      }

      const csv = '\uFEFF' + lines.join('\r\n');
      const filename = `ChiTietCongNo_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}.csv`;

      return { csv, filename };
    } catch (error) {
      console.error('Error in exportDebtReport:', error.message);
      throw error;
    }
  }

  /**
   * Get debt report by lot (BaoCao_CongNoKhachHangTheoLo)
   * Matches: DBConnect.BaoCaoCongNoKhachHangTheoLoHang() -> SP_BaoCao_CongNoKhachHangTheoLo
   * Data: UserName, NgayLoHang, TenLoHang, LoaiTien, TyGia, TienLoHangA, TienPhiHaiQuanB, TongTienLoHangAB, DaThu, ConLai
   */
  async getDebtReportByLot(fromDate?: string, toDate?: string): Promise<any[]> {
    try {
      // Parse dates from dd/MM/yyyy format
      let tuNgay: Date;
      let denNgay: Date;

      if (fromDate) {
        const parts = fromDate.split('/');
        if (parts.length === 3) {
          tuNgay = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), 0, 0, 0);
        } else {
          tuNgay = new Date(fromDate);
        }
      } else {
        // Default to first day of current month
        tuNgay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      }

      if (toDate) {
        const parts = toDate.split('/');
        if (parts.length === 3) {
          denNgay = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), 23, 59, 59);
        } else {
          denNgay = new Date(toDate);
          denNgay.setHours(23, 59, 59, 999);
        }
      } else {
        // Default to last day of current month
        denNgay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);
      }

      const [results] = await this.sequelize.query(
        `EXEC SP_BaoCao_CongNoKhachHangTheoLo
          @TuNgay = :tuNgay,
          @DenNgay = :denNgay`,
        {
          replacements: {
            tuNgay: formatSqlDate(tuNgay),
            denNgay: formatSqlEndOfDay(denNgay),
          },
          type: 'SELECT' as const,
        },
      );

      return results || [];
    } catch (error) {
      console.error('Error in getDebtReportByLot:', error.message);
      return [];
    }
  }

  /**
   * Export debt report by lot to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in C#
   */
  async exportDebtReportByLot(
    fromDate?: string,
    toDate?: string,
  ): Promise<{ csv: string; filename: string }> {
    try {
      const data = await this.getDebtReportByLot(fromDate, toDate);

      const lines: string[] = [];
      // Headers
      lines.push(
        'UserName,NgayLoHang,TenLoHang,LoaiTien,TyGia,TienLoHangA,TienPhiHaiQuanB,TongTienLoHangAB,DaThu,ConLai',
      );

      for (const row of data) {
        const values = [
          row.UserName || '',
          row.NgayLoHang ? new Date(row.NgayLoHang).toLocaleDateString('vi-VN') : '',
          row.TenLoHang || '',
          row.LoaiTien || '',
          row.TyGia || '0',
          row.TienLoHangA || '0',
          row.TienPhiHaiQuanB || '0',
          row.TongTienLoHangAB || '0',
          row.DaThu || '0',
          row.ConLai || '0',
        ];
        lines.push(values.join(','));
      }

      const csv = '\uFEFF' + lines.join('\r\n');
      const filename = `CongNoKhachHangTheoLo_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}.csv`;

      return { csv, filename };
    } catch (error) {
      console.error('Error in exportDebtReportByLot:', error.message);
      throw error;
    }
  }

  // ========== BaoCao_CongNoTheoDotHang (by-shipment-lot) ==========

  /**
   * Get debt report by shipment lot (BaoCao_CongNoTheoDotHang)
   * Matches: DBConnect.BaoCaoCongNoTheoDotHang() -> SP_BaoCao_CongNoTheoDotHang
   * Data: UserName, HoTen, TenDotHang, NgayVeVN, TienHang, TienShip, TongTien, PhoneNumber, DiaChi
   */
  async getDebtReportByShipmentLot(fromDate?: string, toDate?: string): Promise<any[]> {
    try {
      // Parse dates from dd/MM/yyyy or YYYY-MM-DD format (from frontend input type="date")
      let tuNgay: string;
      let denNgay: string;

      if (fromDate) {
        // Check if format is YYYY-MM-DD (from input type="date")
        if (fromDate.includes('-') && fromDate.split('-').length === 3) {
          const parts = fromDate.split('-');
          tuNgay = `${parts[0]}-${parts[1]}-${parts[2]} 00:00:00`;
        } else if (fromDate.includes('/') && fromDate.split('/').length === 3) {
          // Format dd/MM/yyyy
          const parts = fromDate.split('/');
          tuNgay = `${parts[2]}-${parts[1]}-${parts[0]} 00:00:00`;
        } else {
          tuNgay = new Date(fromDate).toISOString().replace('T', ' ').slice(0, 19);
        }
      } else {
        // Default to 10 days ago
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() - 10);
        tuNgay = defaultDate.toISOString().replace('T', ' ').slice(0, 19);
      }

      if (toDate) {
        // Check if format is YYYY-MM-DD (from input type="date")
        if (toDate.includes('-') && toDate.split('-').length === 3) {
          const parts = toDate.split('-');
          denNgay = `${parts[0]}-${parts[1]}-${parts[2]} 23:59:59`;
        } else if (toDate.includes('/') && toDate.split('/').length === 3) {
          // Format dd/MM/yyyy
          const parts = toDate.split('/');
          denNgay = `${parts[2]}-${parts[1]}-${parts[0]} 23:59:59`;
        } else {
          denNgay = new Date(toDate).toISOString().replace('T', ' ').slice(0, 19);
        }
      } else {
        denNgay = new Date().toISOString().replace('T', ' ').slice(0, 19);
      }

      console.log('getDebtReportByShipmentLot - tuNgay:', tuNgay, 'denNgay:', denNgay);

      const results = await this.sequelize.query(
        `EXEC SP_BaoCao_CongNoTheoDotHang
          @TuNgay = :tuNgay,
          @DenNgay = :denNgay`,
        {
          replacements: {
            tuNgay,
            denNgay,
          },
          raw: true,
        },
      );

      // Handle raw results - can be [data] or [data, metadata] depending on MSSQL
      let data: any[] = [];
      if (Array.isArray(results)) {
        if (results.length > 0) {
          // First element is usually the data array
          if (Array.isArray(results[0])) {
            data = results[0];
          } else if (results[0] && typeof results[0] === 'object') {
            data = [results[0]];
          }
        }
      }

      // Normalize keys to PascalCase (matching C# convention)
      data = data.map((row: any) => {
        const normalized: any = {};
        for (const key of Object.keys(row)) {
          const keyLower = key.toLowerCase();
          // Convert lowercase keys to PascalCase for known fields
          if (keyLower === 'username') normalized['UserName'] = row[key];
          else if (keyLower === 'ngayvevn') normalized['NgayVeVN'] = row[key];
          else normalized[key] = row[key];
        }
        return normalized;
      });

      return data;
    } catch (error) {
      console.error('Error in getDebtReportByShipmentLot:', error.message);
      return [];
    }
  }

  /**
   * Export debt report by shipment lot to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in C#
   */
  async exportDebtReportByShipmentLot(
    fromDate?: string,
    toDate?: string,
  ): Promise<{ csv: string; filename: string }> {
    try {
      const data = await this.getDebtReportByShipmentLot(fromDate, toDate);

      const lines: string[] = [];
      // Headers
      lines.push('UserName,HoTen,NgayVeVN,TienHang,TienShip,TongTien,PhoneNumber,DiaChi');

      for (const row of data) {
        const values = [
          row.UserName || '',
          row.HoTen || '',
          row.NgayVeVN ? new Date(row.NgayVeVN).toLocaleDateString('vi-VN') : '',
          row.TienHang || '0',
          row.TienShip || '0',
          row.TongTien || '0',
          row.PhoneNumber || '',
          (row.DiaChi || '').replace(/,/g, ';'),
        ];
        lines.push(values.join(','));
      }

      const csv = '\uFEFF' + lines.join('\r\n');
      const filename = `CongNoTheoDotHang_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}.csv`;

      return { csv, filename };
    } catch (error) {
      console.error('Error in exportDebtReportByShipmentLot:', error.message);
      throw error;
    }
  }

  // ========== BaoCao_DoiChieuCongNo (reconciliation) ==========

  /**
   * Get debt reconciliation report (BaoCao_DoiChieuCongNo)
   * Matches: DBConnect.BaoCaoDoiChieuCongNo() -> SP_BaoCao_DoiChieuCongNo1
   * Data: ordernumber, UserName, ngaymuahang, SoLinkA, SotienA, SoLinkB, SotienB, tracking_number, SoTienAVND, SotienBVND, KiemTraVND
   */
  async getDebtReconciliationReport(
    fromDate?: string,
    toDate?: string,
    username?: string,
    orderNumber?: string,
  ): Promise<any[]> {
    try {
      // Parse ISO dates (YYYY-MM-DD) sent by frontend — avoid new Date() UTC offset issues
      const parseIsoToSqlDate = (dateStr: string): string | null => {
        if (!dateStr) return null;
        // YYYY-MM-DD → use directly
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        // dd/MM/yyyy → convert
        const parts = dateStr.split('/');
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        return null;
      };

      const tuNgay = parseIsoToSqlDate(fromDate || '');
      const rawDenNgay = parseIsoToSqlDate(toDate || '');
      const denNgay = rawDenNgay ? `${rawDenNgay} 23:59:59` : null;

      const results = await this.sequelize.query(
        `EXEC SP_BaoCao_DoiChieuCongNo1
          @TuNgay = :tuNgay,
          @DenNgay = :denNgay,
          @UserName = :username,
          @OrderNumber = :orderNumber`,
        {
          replacements: {
            tuNgay,
            denNgay,
            username: username || '',
            orderNumber: orderNumber || '',
          },
          type: 'SELECT' as const,
        },
      );
      return (results as any[]) || [];
    } catch (error) {
      console.error('Error in getDebtReconciliationReport:', error.message);
      return [];
    }
  }

  /**
   * Move order back to Received status
   * Matches: DBConnect.ChuyenVeReceived() -> SP_CapNhat_ChuyenVeReceived
   */
  async moveToReceived(ordernumber: string, username?: string): Promise<{ success: boolean; message?: string }> {
    try {
      await this.sequelize.query(
        `EXEC SP_CapNhat_ChuyenVeReceived @ordernumber = :ordernumber`,
        {
          replacements: { ordernumber },
          type: 'SELECT' as const,
        },
      );

      // Log the action
      if (username) {
        await this.sequelize.query(
          `EXEC SP_Them_SystemLogs
            @NguoiTao = :username,
            @Nguon = :chucNang,
            @HanhDong = :hanhDong,
            @DoiTuong = :ma,
            @NoiDung = :ghiChu`,
          {
            replacements: {
              username,
              chucNang: 'BaoCao_DoiChieuCongNo:ChuyenVeReceived',
              hanhDong: 'Chinh sua',
              ma: ordernumber,
              ghiChu: `ID: ${ordernumber}`,
            },
            type: 'SELECT' as const,
          },
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error in moveToReceived:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Update total amount in VND for an order
   * Matches: DBConnect.CapNhatTongTienOrderVND() -> SP_CapNhat_TongTienOrderVND
   */
  async updateOrderTotalVND(
    ordernumber: string,
    trackingNumber: string,
    tongTienOrderVND: number,
    username?: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      await this.sequelize.query(
        `EXEC SP_CapNhat_TongTienOrderVND
          @ordernumber = :ordernumber,
          @tracking_number = :trackingNumber,
          @TongTienOrderVND = :tongTienOrderVND`,
        {
          replacements: {
            ordernumber,
            trackingNumber,
            tongTienOrderVND,
          },
          type: 'SELECT' as const,
        },
      );

      // Log the action
      if (username) {
        await this.sequelize.query(
          `EXEC SP_Them_SystemLogs
            @NguoiTao = :username,
            @Nguon = :chucNang,
            @HanhDong = :hanhDong,
            @DoiTuong = :ma,
            @NoiDung = :ghiChu`,
          {
            replacements: {
              username,
              chucNang: 'BaoCao_DoiChieuCongNo:CapNhatTongTienOrderVND',
              hanhDong: 'Chinh sua',
              ma: ordernumber,
              ghiChu: `OrderNumber: ${ordernumber}; TrackingNumber: ${trackingNumber}; SotienBVND: ${tongTienOrderVND}`,
            },
            type: 'SELECT' as const,
          },
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error in updateOrderTotalVND:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Export debt reconciliation report to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in C#
   */
  async exportDebtReconciliationReport(
    fromDate?: string,
    toDate?: string,
    username?: string,
    orderNumber?: string,
  ): Promise<{ csv: string; filename: string }> {
    try {
      const data = await this.getDebtReconciliationReport(fromDate, toDate, username, orderNumber);

      const lines: string[] = [];
      // Headers
      lines.push(
        'ordernumber,UserName,ngaymuahang,SoLinkA,SotienA,SoLinkB,SotienB,tracking_number,SoTienAVND,SotienBVND,KiemTraVND',
      );

      for (const row of data) {
        const values = [
          row.ordernumber || '',
          row.UserName || '',
          row.ngaymuahang ? new Date(row.ngaymuahang).toLocaleDateString('vi-VN') : '',
          row.SoLinkA || '0',
          row.SotienA || '0',
          row.SoLinkB || '0',
          row.SotienB || '0',
          row.tracking_number || '',
          row.SoTienAVND || '0',
          row.SotienBVND || '0',
          row.KiemTraVND || '0',
        ];
        lines.push(values.join(','));
      }

      const csv = '\uFEFF' + lines.join('\r\n');
      const filename = `DoiChieuCongNo_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}.csv`;

      return { csv, filename };
    } catch (error) {
      console.error('Error in exportDebtReconciliationReport:', error.message);
      throw error;
    }
  }

  // Helper method to parse date from dd/MM/yyyy to SQL datetime string
  private parseDateToSql(dateStr: string): string {
    const date = parseVietnameseDate(dateStr);
    if (date) {
      return formatSqlDate(date);
    }
    return formatSqlDate(new Date());
  }

  // ========== BaoCao_TongDoanhThu ==========

  /**
   * Get total revenue report (BaoCao_TongDoanhThu)
   * Matches: DBConnect.BaoCaoTongDoanhThu() -> SP_BaoCao_TongDoanhThu
   * Data: DauKy, PhanNo, PhanCo, ChenhLech, CanDoi
   */
  async getTotalRevenueReport(
    fromDate?: string,
    toDate?: string,
  ): Promise<{
    dauKy: number;
    phanNo: number;
    phanCo: number;
    chenhLech: number;
    canDoi: number;
  }> {
    try {
      // Parse dates from dd/MM/yyyy format
      let tuNgay: Date;
      let denNgay: Date;

      if (fromDate) {
        const parts = fromDate.split('/');
        if (parts.length === 3) {
          tuNgay = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), 0, 0, 0);
        } else {
          tuNgay = new Date(fromDate);
        }
      } else {
        // Default to first day of current month
        tuNgay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      }

      if (toDate) {
        const parts = toDate.split('/');
        if (parts.length === 3) {
          denNgay = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), 23, 59, 59);
        } else {
          denNgay = new Date(toDate);
        }
      } else {
        // Default to last day of current month
        denNgay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);
      }

      const [results] = await this.sequelize.query(
        `EXEC SP_BaoCao_TongDoanhThu
          @TuNgay = :tuNgay,
          @DenNgay = :denNgay`,
        {
          replacements: {
            tuNgay: formatSqlDate(tuNgay),
            denNgay: formatSqlEndOfDay(denNgay),
          },
          type: 'SELECT' as const,
        },
      );

      // Handle both array and object return types from sequelize
      let data: { DauKy?: number; PhanNo?: number; PhanCo?: number; ChenhLech?: number; CanDoi?: number } | null = null;
      if (Array.isArray(results) && results.length > 0) {
        data = results[0] as any;
      } else if (results && typeof results === 'object' && !Array.isArray(results)) {
        data = results as any;
      }

      return {
        dauKy: data?.DauKy || 0,
        phanNo: data?.PhanNo || 0,
        phanCo: data?.PhanCo || 0,
        chenhLech: data?.ChenhLech || 0,
        canDoi: data?.CanDoi || 0,
      };
    } catch (error) {
      console.error('Error in getTotalRevenueReport:', error.message);
      return {
        dauKy: 0,
        phanNo: 0,
        phanCo: 0,
        chenhLech: 0,
        canDoi: 0,
      };
    }
  }

  // ========== BaoCao_TongCongNoTheoUser ==========

  /**
   * Get total debt report by user (BaoCao_TongCongNoTheoUser)
   * Matches: DBConnect.BaoCaoTongCongNoTheoUser() -> SP_BaoCao_TongCongNoTheoUser
   * Data: UserName, DauKy, PhanThu, PhanChi, CuoiKy
   */
  async getTotalDebtByUser(
    fromDate?: string,
    toDate?: string,
    username?: string,
  ): Promise<any[]> {
    try {
      // Convert dd/MM/yyyy to yyyy-MM-dd for SQL
      const tuNgay = parseVietnameseDate(fromDate || '');
      const denNgay = parseVietnameseDate(toDate || '');
      const tuNgayStr = tuNgay ? formatSqlDate(tuNgay) : '';
      const denNgayStr = denNgay ? formatSqlDate(denNgay) : '';
      const results = await this.sequelize.query(
        `EXEC SP_BaoCao_TongCongNoTheoUser
          @UserName = :username,
          @TuNgay = :tuNgay,
          @DenNgay = :denNgay`,
        {
          replacements: {
            username: username || '',
            tuNgay: tuNgayStr,
            denNgay: denNgayStr,
          },
          type: 'SELECT' as const,
        },
      );

      return results
    } catch (error) {
      console.error('Error in getTotalDebtByUser:', error.message);
      return [];
    }
  }

  /**
   * Export total debt by user to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in C#
   */
  async exportTotalDebtByUser(
    fromDate?: string,
    toDate?: string,
    username?: string,
  ): Promise<{ csv: string; filename: string }> {
    try {
      const data = await this.getTotalDebtByUser(fromDate, toDate, username);

      const lines: string[] = [];
      // Headers
      lines.push('UserName,DauKy,PhanThu,PhanChi,CuoiKy');

      for (const row of data) {
        const values = [
          row.UserName || '',
          row.DauKy || '0',
          row.PhanThu || '0',
          row.PhanChi || '0',
          row.CuoiKy || '0',
        ];
        lines.push(values.join(','));
      }

      const csv = '\uFEFF' + lines.join('\r\n');
      const filename = `TongCongNoTheoUser_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}.csv`;

      return { csv, filename };
    } catch (error) {
      console.error('Error in exportTotalDebtByUser:', error.message);
      throw error;
    }
  }

  // ========== BaoCao_PhanTichLaiLoTheoLoHang ==========

  /**
   * Get profit/loss analysis by lot (BaoCao_PhanTichLaiLoTheoLoHang)
   * Matches: DBConnect.BaoCaoPhanTichLaiLoTheoLoHang() -> SP_BaoCao_PhanTichLaiLoTheoLoHang
   * Data: NgayLoHang, TenLoHang, TienLoHangA, TienPhiHaiQuanB, TongTienLoHangAB, TienChiPhiLoHangC, LaiLoD
   */
  async getProfitLossByLot(
    fromDate?: string,
    toDate?: string,
  ): Promise<any[]> {
    try {
      // Parse dates from dd/MM/yyyy format
      let tuNgay: Date;
      let denNgay: Date;

      if (fromDate) {
        const parts = fromDate.split('/');
        if (parts.length === 3) {
          tuNgay = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), 0, 0, 0);
        } else {
          tuNgay = new Date(fromDate);
        }
      } else {
        // Default to first day of current month
        tuNgay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      }

      if (toDate) {
        const parts = toDate.split('/');
        if (parts.length === 3) {
          denNgay = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), 23, 59, 59);
        } else {
          denNgay = new Date(toDate);
        }
      } else {
        // Default to last day of current month
        denNgay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);
      }

      const [results] = await this.sequelize.query(
        `EXEC SP_BaoCao_LaiLoTheoLo
          @TuNgay = :tuNgay,
          @DenNgay = :denNgay`,
        {
          replacements: {
            tuNgay: formatSqlDate(tuNgay),
            denNgay: formatSqlDate(denNgay),
          },
          type: 'SELECT' as const,
        },
      );

      return results || [];
    } catch (error) {
      console.error('Error in getProfitLossByLot:', error.message);
      return [];
    }
  }

  /**
   * Export profit/loss by lot to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in C#
   */
  async exportProfitLossByLot(
    fromDate?: string,
    toDate?: string,
  ): Promise<{ csv: string; filename: string }> {
    try {
      const data = await this.getProfitLossByLot(fromDate, toDate);

      const lines: string[] = [];
      // Headers
      lines.push('NgayLoHang,TenLoHang,TienLoHangA,TienPhiHaiQuanB,TongTienLoHangAB,TienChiPhiLoHangC,LaiLoD');

      for (const row of data) {
        const values = [
          row.NgayLoHang ? new Date(row.NgayLoHang).toLocaleDateString('vi-VN') : '',
          row.TenLoHang || '',
          row.TienLoHangA || '0',
          row.TienPhiHaiQuanB || '0',
          row.TongTienLoHangAB || '0',
          row.TienChiPhiLoHangC || '0',
          row.LaiLoD || '0',
        ];
        lines.push(values.join(','));
      }

      const csv = '\uFEFF' + lines.join('\r\n');
      const filename = `PhanTichLaiLoTheoLoHang_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}.csv`;

      return { csv, filename };
    } catch (error) {
      console.error('Error in exportProfitLossByLot:', error.message);
      throw error;
    }
  }

  // ========== BaoCao_InPhieuShipTheoDotHang ==========

  /**
   * Get shipping slip by shipment lot (BaoCao_InPhieuShipTheoDotHang)
   * Matches: DBConnect.BaoCaoInPhieuShipTheoDotHang() -> SP_BaoCao_InPhieuShipTheoDotHang
   * Returns 2 tables: Table[0] = Customer info, Table[1] = Order items
   */
  async getShippingSlip(
    orderId: string,
    userName: string,
  ): Promise<{
    customerInfo: {
      HoTen: string;
      PhoneNumber: string;
      DiaChiNhanHang: string;
      NgayVeVN: string;
      TongTien: number;
      TienShipVeVN: number;
      TienShipTrongNuoc: number;
      TienHang: number;
      TienDatCoc: number;
      TienPhaiThanhToan: number;
    };
    orderItems: any[];
  }> {
    try {
      const results = await this.sequelize.query(
        `EXEC SP_BaoCao_InPhieuShipTheoDotHang
          @TenDotHang = :orderId,
          @UserName = :userName`,
        {
          replacements: {
            orderId,
            userName,
          },
          type: 'SELECT' as const,
          raw: true,
        },
      );

      // Handle multiple result sets from MSSQL
      // results can be [[customerRow], [orderItem1, orderItem2, ...]] or nested arrays
      let customerData: any[] = [];
      let orderItemsData: any[] = [];

      if (Array.isArray(results)) {
        // Check if results is nested array (multiple result sets)
        if (results.length > 0) {
          if (Array.isArray(results[0])) {
            // Multiple result sets: [customerTable, orderItemsTable]
            customerData = Array.isArray(results[0]) ? results[0] : [];
            orderItemsData = Array.isArray(results[1]) ? results[1] : [];
          } else {
            // Single result set - might be customer data
            customerData = results as any[];
          }
        }
      }

      // Extract customer info from first row of first table
      const customerRow = customerData.length > 0 ? customerData[0] : null;

      if (!customerRow) {
        return {
          customerInfo: {
            HoTen: '',
            PhoneNumber: '',
            DiaChiNhanHang: '',
            NgayVeVN: '',
            TongTien: 0,
            TienShipVeVN: 0,
            TienShipTrongNuoc: 0,
            TienHang: 0,
            TienDatCoc: 0,
            TienPhaiThanhToan: 0,
          },
          orderItems: [],
        };
      }

      // Parse customer info - matching C# logic in BaoCao_InPhieuShipTheoDotHang.cs:60-75
      const tongTien = customerRow.TongTien ?? 0;
      const tienDatCoc = customerRow.TienDatCoc ?? 0;

      const customerInfo = {
        HoTen: customerRow.HoTen || '',
        PhoneNumber: customerRow.PhoneNumber || '',
        DiaChiNhanHang: customerRow.DiaChiNhanHang || '',
        NgayVeVN: customerRow.NgayVeVN || '',
        TongTien: Number(tongTien),
        TienShipVeVN: Number(customerRow.TienShipVeVN ?? 0),
        TienShipTrongNuoc: Number(customerRow.TienShipTrongNuoc ?? 0),
        TienHang: Number(customerRow.TienHang ?? 0),
        TienDatCoc: Number(tienDatCoc),
        TienPhaiThanhToan: Number(tongTien) - Number(tienDatCoc),
      };

      // Parse order items - matching gvDonHang.DataSource = dataSet.Tables[1]
      // Normalize keys to match FE interface
      const orderItems = orderItemsData.map((item: any) => ({
        ID: item.ID ?? 0,
        MaSoHang: item.MaSoHang || item.MaSanPham || '',
        linkhinh: item.linkhinh || item.LinkHinh || '',
        corlor: item.corlor || item.MauSac || '',
        size: item.size || item.KichThuoc || '',
        soluong: item.soluong || item.SoLuong || 0,
        dongiaweb: item.dongiaweb || item.DonGiaWeb || 0,
        tongtienVND: item.tongtienVND || item.TongTienVND || 0,
      }));

      return { customerInfo, orderItems };
    } catch (error) {
      console.error('Error in getShippingSlip:', error.message);
      return {
        customerInfo: {
          HoTen: '',
          PhoneNumber: '',
          DiaChiNhanHang: '',
          NgayVeVN: '',
          TongTien: 0,
          TienShipVeVN: 0,
          TienShipTrongNuoc: 0,
          TienHang: 0,
          TienDatCoc: 0,
          TienPhaiThanhToan: 0,
        },
        orderItems: [],
      };
    }
  }

  // ========== Debt Management (ManageCongNo) ==========

  /**
   * Get debt management list with filters and pagination
   * Matches: LoadDanhSachCongNo() in ManageCongNo.cs
   */
  async getDebtManagementList(
    username?: string,
    status?: number,
    loaiPhatSinh?: string,
    bankAccount?: string,
    fromDate?: string,
    toDate?: string,
    page: number = 1,
    limit: number = 200,
    quocGiaId?: number,
    loHang?: string,
    orderNumber?: string,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    try {
      // Parse dates
      let tuNgay: string | null = null;
      let denNgay: string | null = null;

      if (fromDate) {
        tuNgay = this.parseDateToSql(fromDate);
      }
      if (toDate) {
        denNgay = this.parseDateToSql(toDate);
      }

      // Use SP_Lay_CongNo1 similar to C#
      const [results] = await this.sequelize.query(
        `EXEC SP_Lay_CongNo1
          @username = :username,
          @status = :status,
          @LoaiPhatSinh = :loaiPhatSinh,
          @NoiDungTim = :noiDungTim,
          @TuNgay = :tuNgay,
          @DenNgay = :denNgay,
          @PageSize = :limit,
          @PageNum = :page,
          @QuocGiaID = :quocGiaId,
          @LoHang = :loHang,
          @OrderNumber = :orderNumber`,
        {
          replacements: {
            username: username || '',
            status: status ?? -1,
            loaiPhatSinh: loaiPhatSinh || '',
            noiDungTim: bankAccount || '',
            tuNgay,
            denNgay,
            limit,
            page,
            // Lô hàng nằm trong ghi chú dạng "Lô hàng: yyyy-MM-dd" — bảng tbLoHang
            // rỗng và CONGNO.LoHangID không dòng nào có giá trị, nên SP so chuỗi
            // đó chứ không join theo mã lô.
            loHang: loHang || null,
            orderNumber: orderNumber || null,
            // NULL = không lọc tuyến; SP hiểu NULL là bỏ qua điều kiện này.
            quocGiaId: quocGiaId ?? null,
          },
        },
      );

      const data = Array.isArray(results) ? results : [];

      // Get total count from first row metadata
      const firstItem = data.length > 0 ? data[0] as any : null;
      const total = firstItem?.TOTALROW ? Number(firstItem.TOTALROW) : 0;

      const loaiPhatSinhMap: Record<number, string> = {
        1: 'Phí mua hàng',
        2: 'Phát sinh khác',
        3: 'Phí ship từ nước ngoài về',
        4: 'Phí ship trong nước',
        5: 'Đặt cọc',
        6: 'Phí ship về VN lô hàng',
        7: 'Thuế hải quan lô hàng',
        8: 'Cân Kg',
      };

      // SP returns column "style" (int) — BLL.cs line 371: dtRow["style"]
      const rows = (data.slice(1) as any[]).map((row) => {
        const style = row.style ?? 2;
        return {
          ...row,
          LoaiPhatSinh: style,
          LoaiPhatSinhText: loaiPhatSinhMap[style] || '',
        };
      });

      return { data: rows, total, page, limit };
    } catch (error) {
      console.error('Error in getDebtManagementList:', error.message);
      return { data: [], total: 0, page, limit };
    }
  }

  /**
   * Create new debt record
   * Matches: btDongY_Click() -> Insert_CongNo() in ManageCongNo.cs
   */
  async createDebt(
    dto: {
      username: string;
      noiDung: string;
      ngay: string;
      dr?: number;
      cr?: number;
      ghiChu?: string;
      loHangId?: number;
      loHangText?: string;
      loaiPhatSinh?: number;
      bankAccount?: string;
      status?: number;
      allowEmptyNoiDung?: boolean;
      sanLuong?: number;
      quocGiaId?: number;
    },
    username?: string,
  ): Promise<{ success: boolean; message?: string }> {
    return this.createDebtCore(dto, username);
  }

  /**
   * Core insert logic shared by createDebt() and importCreateDebts().
   * `skipLog` avoids writing one SystemLogs row per record during a bulk Excel
   * import — importCreateDebts() writes a single summary log entry instead.
   */
  private async createDebtCore(
    dto: {
      username: string;
      noiDung: string;
      ngay: string;
      dr?: number;
      cr?: number;
      ghiChu?: string;
      loHangId?: number;
      loHangText?: string;
      loaiPhatSinh?: number;
      bankAccount?: string;
      status?: number;
      allowEmptyNoiDung?: boolean;
      sanLuong?: number;
      quocGiaId?: number;
    },
    username?: string,
    opts?: { skipLog?: boolean },
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const noiDung = dto.noiDung?.trim() || '';

      if (!dto.allowEmptyNoiDung && noiDung === '') {
        return { success: false, message: 'Bạn phải nhập nội dung công nợ' };
      }

      if (!dto.ngay || dto.ngay.trim() === '') {
        return { success: false, message: 'Bạn phải nhập ngày phát sinh công nợ' };
      }

      if (dto.loaiPhatSinh === 8 && !dto.quocGiaId) {
        return { success: false, message: 'Bạn phải chọn Tuyến cho loại phát sinh Cân Kg' };
      }

      const dr = dto.dr ?? 0;
      const cr = dto.cr ?? 0;

      if (dr === 0 && cr === 0) {
        return { success: false, message: 'Phải nhập ít nhất một giá trị Nợ hoặc Có' };
      }
      const ngayGhiNo = this.parseDateToSql(dto.ngay);

      let ghiChu = dto.ghiChu?.trim() || '';
      // Matches C# ManageCongNo.cs btDongY_Click logic:
      // 1. Append bank transfer info if bank selected AND CR != 0
      if (dto.bankAccount && dto.cr !== undefined && dto.cr !== 0) {
        ghiChu = ghiChu + (ghiChu ? ' - ' : '') + 'Báo chuyển khoản - ' + dto.bankAccount;
      }
      // 2. Ghi lô hàng vào ghi chú — CHỈ với loại phát sinh "Cân Kg" (8).
      //    Lô hàng chỉ có nghĩa với loại này; các loại khác (ck công nợ, phát
      //    sinh khác...) chẳng dính lô nào. Trước đây ghi bất kể loại, mà ô Lô
      //    hàng bên web mặc định là hôm nay, nên mọi dòng đều bị nối thêm
      //    "Lô hàng: <ngày hôm nay>" vào Ghi chú — vận hành báo là thừa.
      //    Web đã dọn giá trị trước khi gửi; chốt thêm ở đây để client nào gửi
      //    thừa cũng không làm bẩn ghi chú.
      if (dto.loaiPhatSinh === 8 && dto.loHangText && dto.loHangText.trim()) {
        ghiChu = ghiChu + ' - Lô hàng: ' + dto.loHangText.trim();
      }
      // Sản lượng (kg): chỉ lưu khi loại phát sinh là "Cân Kg" (8), ngược lại NULL
      const sanLuong = dto.loaiPhatSinh === 8 ? (dto.sanLuong ?? null) : null;

      await this.sequelize.query(
        `EXEC CongNo_Insert
          @UserName = :username,
          @NoiDung = :noiDung,
          @NgayGhiNo = :ngayGhiNo,
          @DR = :dr,
          @CR = :cr,
          @GhiChu = :ghiChu,
          @Status = :status,
          @LoHangID = :loHangID,
          @NguoiTao = :nguoiTao,
          @LoaiPhatSinh = :loaiPhatSinh,
          @SanLuong = :sanLuong,
          @QuocGiaID = :quocGiaId`,
        {
          replacements: {
            username: dto.username,
            noiDung,
            ngayGhiNo,
            dr,
            cr,
            ghiChu: ghiChu.trim(),
            status: dto.status ?? 1,
            loHangID: dto.loHangId || null,
            nguoiTao: username || 'system',
            loaiPhatSinh: dto.loaiPhatSinh || 2,
            sanLuong,
            quocGiaId: dto.quocGiaId || null,
          },
          type: 'SELECT' as const,
        },
      );

      // Log the action
      if (username && !opts?.skipLog) {
        await this.sequelize.query(
          `EXEC SP_Them_SystemLogs
            @NguoiTao = :username,
            @Nguon = :chucNang,
            @HanhDong = :hanhDong,
            @DoiTuong = :ma,
            @NoiDung = :ghiChu`,
          {
            replacements: {
              username,
              chucNang: dto.status === 0 ? 'ChuyenKhoan:Insert_CongNo' : 'ManageCongNo:Insert_CongNo',
              hanhDong: 'Them moi',
              ma: '',
              ghiChu: `UserName: ${dto.username}; NoiDung: ${noiDung}; Ngay: ${dto.ngay}; DR: ${dr}; CR: ${cr}; GhiChu: ${ghiChu}; LoaiPhatSinh: ${dto.loaiPhatSinh || 2}`,
            },
            type: 'SELECT' as const,
          },
        );
      }

      // Notify the recipient user about the new debt record
      try {
        const drText = dr > 0 ? `Nợ: ${dr.toLocaleString('vi-VN')} VNĐ` : '';
        const crText = cr > 0 ? `Có: ${cr.toLocaleString('vi-VN')} VNĐ` : '';
        const amountText = [drText, crText].filter(Boolean).join(' | ');

        await this.notificationsService.create({
          username:  dto.username,
          title:     'Thông tin công nợ mới',
          message:   `${noiDung}${amountText ? '. ' + amountText : ''}. Ngày: ${dto.ngay}.`,
          type:      'debt',
          createdBy: username || 'system',
          refType:   'DEBT',
        });
      } catch (notifyError) {
        // Notification failure must never block the main debt creation flow
        console.error('Failed to send debt notification:', (notifyError as Error).message);
      }

      return { success: true };
    } catch (error) {
      console.error('Error in createDebt:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Bulk-create debt records from a parsed Excel import ("Thêm mới công nợ" mode).
   * Matches: ManageCongNo_Import.cs in C# (add-new mode only)
   *
   * Rows are inserted one by one so a single bad row doesn't block the rest;
   * per-row audit logging is skipped in favor of one summary log entry.
   */
  async importCreateDebts(
    rows: {
      username: string;
      noiDung: string;
      ngay: string;
      dr?: number;
      cr?: number;
      ghiChu?: string;
      loaiPhatSinh?: number;
      bankAccount?: string;
      sanLuong?: number;
      quocGiaId?: number;
    }[],
    username: string,
  ): Promise<{
    successCount: number;
    failCount: number;
    results: { row: number; success: boolean; message?: string }[];
  }> {
    const results: { row: number; success: boolean; message?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const result = await this.createDebtCore(rows[i], username, { skipLog: true });
      results.push({ row: i + 1, success: result.success, message: result.message });
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    try {
      await this.sequelize.query(
        `EXEC SP_Them_SystemLogs
          @NguoiTao = :username,
          @Nguon = :chucNang,
          @HanhDong = :hanhDong,
          @DoiTuong = :ma,
          @NoiDung = :ghiChu`,
        {
          replacements: {
            username,
            chucNang: 'ManageCongNo:Import_CongNo',
            hanhDong: 'Import Excel',
            ma: '',
            ghiChu: `Import Excel công nợ: ${successCount} thành công / ${failCount} lỗi trên tổng ${rows.length} dòng`,
          },
          type: 'SELECT' as const,
        },
      );
    } catch (logError) {
      console.error('Failed to log import summary:', (logError as Error).message);
    }

    return { successCount, failCount, results };
  }

  /**
   * Update debt record
   * Matches: gvCongNo_RowUpdating() -> CapNhatCongNo() in ManageCongNo.cs
   */
  async updateDebtManagement(
    id: number,
    dto: {
      username?: string;
      noiDung?: string;
      dr?: number;
      cr?: number;
      ghiChu?: string;
      status?: number;
      loHangId?: number;
      updatedBy?: string;
      loaiPhatSinh?: number;
      sanLuong?: number;
      quocGiaId?: number;
    },
    username?: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Check permission to update
      const checkResult = await this.sequelize.query(
        `SET NOCOUNT ON; DECLARE @DuocCapNhat INT; EXEC @DuocCapNhat = SP_KiemTra_DuocCapNhatCongNoByID @ID = :id, @UserName = :username; SELECT @DuocCapNhat AS Result`,
        {
          replacements: { id, username: dto.username || '' },
          type: 'SELECT' as const,
        },
      );
      const checkDataRaw = Array.isArray(checkResult) && checkResult.length > 0 ? checkResult[0] as any : { Result: -1 };
      const checkValue = checkDataRaw?.Result ?? -1;

      if (checkValue === 3 || checkValue === 1 || checkValue === 2) {
        return { success: false, message: 'Không được cập nhật công nợ này do đã đóng kỳ' };
      }
      if (checkValue === -1) {
        return { success: false, message: 'Có lỗi trong quá trình thực hiện' };
      }

      if (dto.loaiPhatSinh === 8 && !dto.quocGiaId) {
        return { success: false, message: 'Bạn phải chọn Tuyến cho loại phát sinh Cân Kg' };
      }

      const dr = dto.dr ?? 0;
      const cr = dto.cr ?? 0;
      const status = dto.status ?? 1;
      // Sản lượng (kg): chỉ lưu khi loại phát sinh là "Cân Kg" (8), ngược lại NULL
      const sanLuong = dto.loaiPhatSinh === 8 ? (dto.sanLuong ?? null) : null;

      await this.sequelize.query(
        `EXEC SP_CapNhat_CongNo
          @CongNo_ID = :id,
          @UserName = :username,
          @NoiDung = :noiDung,
          @DR = :dr,
          @CR = :cr,
          @GhiChu = :ghiChu,
          @Status = :status,
          @LoHangID = :loHangID,
          @NguoiTao = :nguoiCapNhat,
          @SanLuong = :sanLuong,
          @QuocGiaID = :quocGiaId,
          @udUserName = 1,
          @udNoiDung = 1,
          @udDR = 1,
          @udCR = 1,
          @udGhiChu = 1,
          @udStatus = 1,
          @udLoHangID = 1,
          @udSanLuong = 1,
          @udQuocGiaID = 1`,
        {
          replacements: {
            id,
            username: dto.username || '',
            noiDung: dto.noiDung?.trim() || '',
            dr,
            cr,
            ghiChu: dto.ghiChu?.trim() || '',
            status,
            loHangID: dto.loHangId || null,
            nguoiCapNhat: dto.updatedBy || username || 'system',
            sanLuong,
            quocGiaId: dto.quocGiaId || null,
          },
          type: 'SELECT' as const,
        },
      );

      // Log the action
      if (username) {
        await this.sequelize.query(
          `EXEC SP_Them_SystemLogs
            @NguoiTao = :username,
            @Nguon = :chucNang,
            @HanhDong = :hanhDong,
            @DoiTuong = :ma,
            @NoiDung = :ghiChu`,
          {
            replacements: {
              username,
              chucNang: 'ManageCongNo:CapNhatCongNo',
              hanhDong: 'Chinh sua',
              ma: id.toString(),
              ghiChu: `ID:${id}; UserName: ${dto.username}; NoiDung: ${dto.noiDung}; DR: ${dr}; CR: ${cr}; GhiChu: ${dto.ghiChu}; status: ${status}`,
            },
            type: 'SELECT' as const,
          },
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error in updateDebtManagement:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Delete debt record
   * Matches: gvCongNo_RowDeleting() -> XoaCongNo() in ManageCongNo.cs
   */
  async deleteDebt(id: number, username?: string): Promise<{ success: boolean; message?: string }> {
    try {
      await this.sequelize.query(
        `EXEC SP_Xoa_CongNo @CongNo_ID = :id, @NguoiTao = :username`,
        {
          replacements: { id, username: username || 'system' },
          type: 'SELECT' as const,
        },
      );

      // Log the action
      if (username) {
        await this.sequelize.query(
          `EXEC SP_Them_SystemLogs
            @NguoiTao = :username,
            @Nguon = :chucNang,
            @HanhDong = :hanhDong,
            @DoiTuong = :ma,
            @NoiDung = :ghiChu`,
          {
            replacements: {
              username,
              chucNang: 'ManageCongNo:XoaCongNo',
              hanhDong: 'Xoa',
              ma: '',
              ghiChu: `ID: ${id}`,
            },
            type: 'SELECT' as const,
          },
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error in deleteDebt:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Approve debt record
   * Matches: gvCongNo_RowCommand() -> ApproveCongNo() in ManageCongNo.cs
   */
  async approveDebt(id: number, username?: string): Promise<{ success: boolean; message?: string }> {
    try {
      await this.sequelize.query(
        `EXEC SP_Approve_CongNo @CongNo_ID = :id, @NguoiTao = :username`,
        {
          replacements: { id, username: username || 'system' },
          type: 'SELECT' as const,
        },
      );

      // Log the action
      if (username) {
        await this.sequelize.query(
          `EXEC SP_Them_SystemLogs
            @NguoiTao = :username,
            @Nguon = :chucNang,
            @HanhDong = :hanhDong,
            @DoiTuong = :ma,
            @NoiDung = :ghiChu`,
          {
            replacements: {
              username,
              chucNang: 'ManageCongNo:ApproveCongNo',
              hanhDong: 'Chinh sua',
              ma: '',
              ghiChu: `ID: ${id}`,
            },
            type: 'SELECT' as const,
          },
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error in approveDebt:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get bank accounts for dropdown
   * Matches: LoadDanhSachTaiKhoanNganHang() in ManageCongNo.cs
   */
  async getBankAccounts(): Promise<any[]> {
    try {
      const results = await this.sequelize.query(
        `EXEC SP_LayTaiKhoanNganHang`,
        { type: 'SELECT' as const },
      );
      // Ensure always return array (Sequelize may return single object when only 1 row)
      return Array.isArray(results) ? results : [];
    } catch (error) {
      console.error('Error in getBankAccounts:', error);
      return [];
    }
  }

  /**
   * Get batches by username for dropdown
   * Matches: LoadDanhSachLoHangTheoUser() in ManageCongNo.cs
   */
  async getBatchesByUsername(username: string): Promise<any[]> {
    try {
      const [results] = await this.sequelize.query(
        `EXEC SP_Lay_DanhSachLoHangTheoUser @UserName = :username`,
        {
          replacements: { username },
          type: 'SELECT' as const,
        },
      );
      return results || [];
    } catch (error) {
      console.error('Error in getBatchesByUsername:', error.message);
      return [];
    }
  }

  /**
   * Get pending transfer list for user (ChuyenKhoan.aspx)
   * Matches: ChuyenKhoan.cs -> bLL.LayDanhSachCongNo(username, 0, 2, ...)
   * Uses: SP_Lay_CongNo @username, @status=0 (chờ duyệt), @style=2 (chuyển khoản)
   */
  async getChuyenKhoanPendingList(username: string): Promise<any[]> {
    try {
      const [results] = await this.sequelize.query(
        `EXEC SP_Lay_CongNo
          @username = :username,
          @status = 0,
          @style = 2,
          @NoiDungTim = '',
          @PageSize = 100,
          @PageNum = 1,
          @TuNgay = NULL,
          @DenNgay = NULL`,
        { replacements: { username } },
      );
      const data = Array.isArray(results) ? (results as Record<string, unknown>[]) : [];
      return data.length > 0 && 'TOTALROW' in data[0] ? data.slice(1) : data;
    } catch (error) {
      console.error('Error in getChuyenKhoanPendingList:', (error as any).message);
      return [];
    }
  }
}
