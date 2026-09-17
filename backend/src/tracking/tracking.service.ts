import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import Excel from 'exceljs';
import { CreateTrackingDto } from './dto/create-tracking.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { QueryTrackingDto } from './dto/query-tracking.dto';
import { MassUpdateTrackingDto } from './dto/mass-update-tracking.dto';
import {
  ImportTrackingDto,
  ImportTrackingResult,
} from './dto/import-tracking.dto';
import {
  parseTrackingExcel,
  parseEditColumns,
  validateRows,
  EDIT_COLUMN_COUNT,
  type ParsedTrackingRow,
  type RefData,
} from './tracking-import.helper';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { AnhTrackingService } from './anh-tracking.service';

/**
 * Tracking Service
 *
 * Handles tracking CRUD operations.
 */
@Injectable()
export class TrackingService {
  private readonly procedureParamsCache = new Map<string, Set<string>>();

  /**
   * Concurrency for the Excel-import hot loops. Default Sequelize pool max is
   * 5; staying at or below that prevents pool starvation while letting us
   * fan out enough to avoid the 200ms-per-row serialization that was timing
   * out 1000-row imports.
   */
  private static readonly IMPORT_CONCURRENCY = 5;

  /**
   * Rows packed into one TDS batch by persistCreateBatch. Each row contributes
   * 14 SP params + 5 log params = 19 → 50 rows = 950 params, well under the
   * SQL Server 2100-per-batch limit.
   */
  private static readonly IMPORT_BATCH_SIZE = 50;

  constructor(
    @Inject('SEQUELIZE') private sequelize: Sequelize,
    private readonly systemLogsService: SystemLogsService,
    private readonly anhTrackingService: AnhTrackingService,
  ) {}

  /**
   * Run `fn` over `items` in fixed-size chunks, awaiting Promise.all per chunk.
   * Keeps in-flight work bounded by `size` so we don't queue thousands of
   * queries on a tiny pool.
   */
  private async runInChunks<T, R>(
    items: T[],
    size: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const out: R[] = [];
    for (let i = 0; i < items.length; i += size) {
      const chunk = items.slice(i, i + size);
      const results = await Promise.all(chunk.map(fn));
      out.push(...results);
    }
    return out;
  }

  /**
   * Find all tracking with filters and pagination
   * Uses: SP_Lay_Tracking
   */
  async findAll(query: QueryTrackingDto): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const { username, statuses, search, trackingNumber, tenLoHang, quocGiaId, startDate, endDate, page = 1, limit = 20 } = query;

    try {
      // Build comma-separated status list for SP
      const tinhTrang = statuses ?  `N'${statuses.split(',').map(x => `''${x.trim()}''`).join(',')}'` : `''`;
      // Use SP_Lay_Tracking
      const results = await this.sequelize.query(
        `EXEC dbo.SP_Lay_Tracking
          @UserName = :username,
          @TinhTrang = ${tinhTrang},
          @NoiDungTim = :search,
          @TimTheo = -1,
          @TrackingNumber = :trackingNumber,
          @TenLoHang = :tenLoHang,
          @PageSize = :limit,
          @PageNum = :page,
          @QuocGiaID = :quocGiaId,
          @DaXoa = 0,
          @TuNgay = :startDate,
          @DenNgay = :endDate`,
        {
          replacements: {
            username: username || '',
            // tinhTrang,
            search: search || '',
            trackingNumber: trackingNumber || '',
            tenLoHang: tenLoHang || '',
            quocGiaId: quocGiaId && quocGiaId > 0 ? quocGiaId : -1,
            startDate: startDate || '',
            endDate: endDate || '',
            limit,
            page,
          },
          type: QueryTypes.SELECT,
        }
      );

      // SP_Lay_Tracking returns: [ { TOTALROW: 50 }, {row1}, {row2}, ... ]
      const resultsAny = results as any;
      const totalItem = resultsAny[0]?.TOTALROW || 0;
      const data = resultsAny.slice(1) || [];

      // Số ảnh hàng của từng dòng — một lệnh cho cả trang. Lỗi thì danh sách
      // vẫn phải hiện, chỉ thiếu biểu tượng ảnh.
      try {
        const soAnh = await this.anhTrackingService.demAnh(data.map((d: any) => Number(d.TrackingID)));
        for (const d of data) d.SoAnh = soAnh.get(Number(d.TrackingID)) ?? 0;
      } catch (e) {
        console.error('Error counting tracking photos:', (e as any)?.message);
      }

      return {
        data,
        total: totalItem,
        page,
        limit,
      };
    } catch (error) {
      console.error('Error in findAll tracking:', error);
      return {
        data: [],
        total: 0,
        page,
        limit,
      };
    }
  }

  /**
   * Search tracking by code (public lookup)
   * Revert to original logic: only return history from tbTinhTrangTracking
   * With Vietnamese status descriptions
   */
  async searchByCode(code: string): Promise<any> {
    try {
      const safeCode = code.replace(/'/g, "''");

      // Find tracking by code first to get TrackingID
      const [trackingData] = await this.sequelize.query(`
        SELECT TOP 1 TrackingID
        FROM dbo.tbTracking
        WHERE DaXoa = 0
          AND (TrackingNumber = N'${safeCode}' OR OrderNumber = N'${safeCode}')
      `);

      if (!trackingData || !Array.isArray(trackingData) || trackingData.length === 0) {
        return { found: false, message: 'Không tìm thấy dữ liệu' };
      }

      const trackingInfo = trackingData[0] as any;
      const trackingId = trackingInfo.TrackingID;

      // Get history from tbTinhTrangTracking with Vietnamese descriptions
      const [history] = await this.sequelize.query(`
        SELECT
          NgayTao as ngay,
          TinhTrang as tinhTrang,
          CASE TinhTrang
            WHEN 'Received' THEN N'Nhận thông tin tại kho'
            WHEN 'InTransit' THEN N'Đã chuyển lên máy bay về VN'
            WHEN 'InVN' THEN N'Đã đến VN, đang soạn hàng'
            WHEN 'VNTransit' THEN N'Đang ship nội địa'
            WHEN 'Completed' THEN N'Đã giao hàng cho khách'
            WHEN 'Cancelled' THEN N'Đã hủy'
            ELSE TinhTrang
          END as moTa,
          GhiChu as ghiChu
        FROM dbo.tbTinhTrangTracking
        WHERE TrackingID = ${trackingId}
        ORDER BY NgayTao DESC
      `);

      // Ảnh hàng kho đã up. Có ảnh mà chưa có dòng tình trạng nào thì vẫn
      // cho khách thấy ảnh, không báo "không tìm thấy".
      const anh = await this.anhTrackingService
        .layAnh(trackingId)
        .then((ds) => ds.map((a) => a.LinkHinh))
        .catch(() => [] as string[]);

      const coLichSu = Array.isArray(history) && history.length > 0;
      if (!coLichSu && anh.length === 0) {
        return { found: false, message: 'Không tìm thấy dữ liệu' };
      }

      return {
        found: true,
        history: coLichSu ? history : [],
        anh,
      };
    } catch (error) {
      console.error('Error in searchByCode:', error.message);
      console.error('Errors array:', (error as any).errors);
      return { found: false, message: 'Có lỗi xảy ra khi tra cứu' };
    }
  }

  /**
   * Get tracking counts by status
   * Uses: SP_Lay_SoLuongTracking (same as C# dBConnect.LaySoLuongTracking(UserName))
   */
  async getCounts(username = ''): Promise<any> {
    try {
      // SP returns rows: { TinhTrang, SL }
      const data = await this.sequelize.query(
        `EXEC dbo.SP_Lay_SoLuongTracking @UserName = :username`,
        { replacements: { username }, type: QueryTypes.SELECT }
      );

      const counts: Record<string, number> = {
        Received: 0,
        InTransit: 0,
        InVN: 0,
        VNTransit: 0,
        Completed: 0,
        Cancelled: 0,
      };

      if (data) {
        for (const row of data as any[]) {
          counts[row.TinhTrang] = Number(row.SL);
        }
      }

      return counts;
    } catch (error) {
      console.error('Error in getCounts:', error.message);
      return {
        Received: 0,
        InTransit: 0,
        InVN: 0,
        VNTransit: 0,
        Completed: 0,
        Cancelled: 0,
      };
    }
  }

  /**
   * Find tracking by ID
   * Uses: SP_Lay_TrackingByID (same as C# BLL.LayTrackingByID)
   */
  async findOne(id: number): Promise<any> {
    try {
      const results = await this.sequelize.query(
        `EXEC dbo.SP_Lay_TrackingByID @TrackingID = :id`,
        { replacements: { id }, type: QueryTypes.SELECT }
      );

      if (!results || results.length === 0) {
        throw new NotFoundException(`Tracking with ID ${id} not found`);
      }

      return results[0];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error in findOne tracking:', error.message);
      throw new NotFoundException(`Tracking with ID ${id} not found`);
    }
  }

  /**
   * Create new tracking
   * Uses: SP_Them_Tracking (same as C# DBConnect.ThemTracking)
   * Logs: ThemSystemLogs with nguon='Tracking_ThemSua:ThemTracking', hanhDong='Them moi'
   */
  async create(createTrackingDto: CreateTrackingDto): Promise<any> {
    const { username, trackingNumber, orderNumber, ngayDatHang, nhaVanChuyenId, quocGiaId, tinhTrang, ghiChu, kien, mawb, hawb, nguoiTao } = createTrackingDto;

    try {
      // SP_Them_Tracking returns: { ID: newTrackingId }
      const [result]: any[] = await this.sequelize.query(`
        EXEC dbo.SP_Them_Tracking
          @UserName = :username,
          @TrackingNumber = :trackingNumber,
          @OrderNumber = :orderNumber,
          @NgayDatHang = :ngayDatHang,
          @NhaVanChuyenID = :nhaVanChuyenId,
          @QuocGiaID = :quocGiaId,
          @TinhTrang = :tinhTrang,
          @GhiChu = :ghiChu,
          @NguoiTao = :nguoiTao,
          @Kien = :kien,
          @Mawb = :mawb,
          @Hawb = :hawb,
          @CoTaoLoHang = 0,
          @GhiChuLoHang = ''
      `,
      {
        replacements: {
          username: username || '',
          trackingNumber: trackingNumber || '',
          orderNumber: orderNumber || '',
          ngayDatHang: ngayDatHang || new Date().toISOString().split('T')[0],
          nhaVanChuyenId: nhaVanChuyenId || null,
          quocGiaId: quocGiaId || null,
          tinhTrang: tinhTrang || 'Received',
          ghiChu: ghiChu || '',
          nguoiTao: nguoiTao || '',
          kien: kien || '',
          mawb: mawb || '',
          hawb: hawb || '',
        },
        type: QueryTypes.SELECT,
      });

      const insertedTracking = result && result.length > 0 ? result[0] : null;
      const insertId = insertedTracking?.ID || insertedTracking?.TrackingID;

      // Log system operation
      await this.systemLogsService.create({
        nguoiTao: nguoiTao || '',
        nguon: 'Tracking_ThemSua:ThemTracking',
        hanhDong: 'Them moi',
        doiTuong: insertId?.toString() || '',
        noiDung: `TrackingNumber: ${trackingNumber}; OrderNumber: ${orderNumber}; TinhTrang: ${tinhTrang}`,
      });

      return;
    } catch (error) {
      console.error('Error in create tracking:', error.message);
      throw error;
    }
  }

  /**
   * Update tracking
   * Uses: SP_CapNhat_Tracking (same as C# DBConnect.CapNhatTracking)
   * Logs: ThemSystemLogs with nguon='Tracking_ThemSua:CapNhatTracking', hanhDong='Chinh sua'
   */
  async update(id: number, updateTrackingDto: UpdateTrackingDto, actorUsername?: string): Promise<any> {
    try {
      const currentTracking = await this.findOne(id);
      const allValues: Record<string, any> = {
        id,
        username: updateTrackingDto.username ?? currentTracking.UserName ?? '',
        trackingNumber: updateTrackingDto.trackingNumber ?? currentTracking.TrackingNumber ?? '',
        orderNumber: updateTrackingDto.orderNumber ?? currentTracking.OrderNumber ?? '',
        ngayDatHang: updateTrackingDto.ngayDatHang ?? currentTracking.NgayDatHang ?? new Date().toISOString().split('T')[0],
        nhaVanChuyenId: updateTrackingDto.nhaVanChuyenId ?? currentTracking.NhaVanChuyenID ?? null,
        quocGiaId: updateTrackingDto.quocGiaId ?? currentTracking.QuocGiaID ?? null,
        tinhTrang: updateTrackingDto.tinhTrang ?? currentTracking.TinhTrang ?? 'Received',
        ghiChu: updateTrackingDto.ghiChu ?? currentTracking.GhiChu ?? '',
        nguoiTao: actorUsername ?? updateTrackingDto.nguoiTao ?? currentTracking.NguoiTao ?? '',
        kien: updateTrackingDto.kien ?? currentTracking.Kien ?? '',
        mawb: updateTrackingDto.mawb ?? currentTracking.Mawb ?? '',
        hawb: updateTrackingDto.hawb ?? currentTracking.Hawb ?? '',
        coTaoLoHang: 0,
        ghiChuLoHang: '',
        udUserName: 1,
        udTrackingNumber: 1,
        udOrderNumber: 1,
        udNgayDatHang: 1,
        udNhaVanChuyenID: 1,
        udQuocGiaID: 1,
        udTinhTrang: 1,
        udGhiChu: 1,
        udKien: 1,
        udMawb: 1,
        udHawb: 1,
        udGhiChuLoHang: 0,
      };

      const paramMap: Array<{ spParam: string; replacementKey: string }> = [
        { spParam: 'TrackingID', replacementKey: 'id' },
        { spParam: 'UserName', replacementKey: 'username' },
        { spParam: 'TrackingNumber', replacementKey: 'trackingNumber' },
        { spParam: 'OrderNumber', replacementKey: 'orderNumber' },
        { spParam: 'NgayDatHang', replacementKey: 'ngayDatHang' },
        { spParam: 'NhaVanChuyenID', replacementKey: 'nhaVanChuyenId' },
        { spParam: 'QuocGiaID', replacementKey: 'quocGiaId' },
        { spParam: 'TinhTrang', replacementKey: 'tinhTrang' },
        { spParam: 'GhiChu', replacementKey: 'ghiChu' },
        { spParam: 'NguoiTao', replacementKey: 'nguoiTao' },
        { spParam: 'Kien', replacementKey: 'kien' },
        { spParam: 'Mawb', replacementKey: 'mawb' },
        { spParam: 'Hawb', replacementKey: 'hawb' },
        { spParam: 'CoTaoLoHang', replacementKey: 'coTaoLoHang' },
        { spParam: 'GhiChuLoHang', replacementKey: 'ghiChuLoHang' },
        { spParam: 'udUserName', replacementKey: 'udUserName' },
        { spParam: 'udTrackingNumber', replacementKey: 'udTrackingNumber' },
        { spParam: 'udOrderNumber', replacementKey: 'udOrderNumber' },
        { spParam: 'udNgayDatHang', replacementKey: 'udNgayDatHang' },
        { spParam: 'udNhaVanChuyenID', replacementKey: 'udNhaVanChuyenID' },
        { spParam: 'udQuocGiaID', replacementKey: 'udQuocGiaID' },
        { spParam: 'udTinhTrang', replacementKey: 'udTinhTrang' },
        { spParam: 'udGhiChu', replacementKey: 'udGhiChu' },
        { spParam: 'udKien', replacementKey: 'udKien' },
        { spParam: 'udMawb', replacementKey: 'udMawb' },
        { spParam: 'udHawb', replacementKey: 'udHawb' },
        { spParam: 'udGhiChuLoHang', replacementKey: 'udGhiChuLoHang' },
      ];

      const spParams = await this.getProcedureParams('dbo.SP_CapNhat_Tracking');
      const selectedParams = paramMap.filter((p) => spParams.has(p.spParam.toLowerCase()));

      const execSql = `EXEC dbo.SP_CapNhat_Tracking\n${selectedParams
        .map((p) => `  @${p.spParam} = :${p.replacementKey}`)
        .join(',\n')}`;
      const replacements = selectedParams.reduce((acc, p) => {
        acc[p.replacementKey] = allValues[p.replacementKey];
        return acc;
      }, {} as Record<string, any>);

      await this.sequelize.query(execSql, {
        replacements,
        type: QueryTypes.RAW,
      });

      // Log system operation
      const updatedFields = Object.keys(updateTrackingDto).filter(k => updateTrackingDto[k] !== undefined);
      await this.systemLogsService.create({
        nguoiTao: currentTracking.NguoiTao || '',
        nguon: 'Tracking_ThemSua:CapNhatTracking',
        hanhDong: 'Chinh sua',
        doiTuong: id.toString(),
        noiDung: `Fields: ${updatedFields.join(', ')}`,
      });

      return this.findOne(id);
    } catch (error) {
      console.error('Error in update tracking:', (error as any).message);
      throw error;
    }
  }

  private async getProcedureParams(procedureName: string): Promise<Set<string>> {
    if (this.procedureParamsCache.has(procedureName)) {
      return this.procedureParamsCache.get(procedureName)!;
    }

    const rows = await this.sequelize.query(
      `SELECT p.name AS parameterName
       FROM sys.parameters p
       WHERE p.object_id = OBJECT_ID(:procedureName)`,
      { replacements: { procedureName }, type: QueryTypes.SELECT },
    );

    const result = new Set(
      (rows as Array<{ parameterName: string }>)
        .map((x) => (x.parameterName || '').replace(/^@/, '').toLowerCase())
        .filter(Boolean),
    );

    this.procedureParamsCache.set(procedureName, result);
    return result;
  }

  /**
   * Soft delete tracking
   * Uses: SP_Xoa_Tracking (same as C# DBConnect.XoaTracking)
   */
  async remove(id: number, actorUsername = ''): Promise<void> {
    // Verify tracking exists first
    await this.findOne(id);

    try {
      await this.sequelize.query(
        `EXEC dbo.SP_Xoa_Tracking @TrackingID = :id`,
        { replacements: { id }, type: QueryTypes.RAW }
      );

      await this.systemLogsService.create({
        nguoiTao: actorUsername,
        nguon: 'DanhSachTracking:XoaTracking',
        hanhDong: 'Xoa',
        doiTuong: id.toString(),
        noiDung: `ID: ${id}`,
      });
    } catch (error) {
      console.error('Error in remove tracking:', (error as any).message);
      throw error;
    }
  }

  /**
   * Mass delete tracking
   * Uses: SP_Xoa_MassDeleteTracking (same as C# dBConnect.MassDeleteTracking(idList))
   * Logs: ThemSystemLogs(nguoiTao, "Tracking_LietKe:MassDelete", "Xoa", "", "ID: ...")
   */
  async massDelete(ids: number[], nguoiTao = ''): Promise<{ deleted: number }> {
    const idList = ids.join(',');

    await this.sequelize.query(
      `EXEC dbo.SP_Xoa_MassDeleteTracking @id = :id`,
      { replacements: { id: idList }, type: QueryTypes.RAW }
    );

    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'Tracking_LietKe:MassDelete',
      hanhDong: 'Xoa',
      doiTuong: '',
      noiDung: `ID: ${idList}`,
    });

    return { deleted: ids.length };
  }

  /**
   * Mass update status
   * Uses: SP_CapNhat_MassStatusTracking (same as C# dBConnect.MassStatusTracking(idList, tinhTrang, null, nguoiTao))
   * Logs: ThemSystemLogs(nguoiTao, "Tracking_LietKe:MassXxx", "Chinh sua", "", "ID: ...")
   */
  async massStatus(massUpdateDto: MassUpdateTrackingDto): Promise<{ updated: number }> {
    const { ids, tinhTrang, nguoiTao = '' } = massUpdateDto;
    const idList = ids.join(',');

    await this.sequelize.query(
      `EXEC dbo.SP_CapNhat_MassStatusTracking
        @id = :id,
        @TinhTrang = :tinhTrang,
        @NgayChuyenTinhTrang = NULL,
        @NguoiTao = :nguoiTao`,
      { replacements: { id: idList, tinhTrang, nguoiTao }, type: QueryTypes.RAW }
    );

    await this.systemLogsService.create({
      nguoiTao,
      nguon: `Tracking_LietKe:Mass${tinhTrang}`,
      hanhDong: 'Chinh sua',
      doiTuong: '',
      noiDung: `ID: ${idList}`,
    });

    return { updated: ids.length };
  }

  /**
   * Mass complete tracking
   * Uses: SP_CapNhat_MassStatusTracking with TinhTrang='Completed'
   */
  async massComplete(ids: number[], nguoiTao = ''): Promise<{ updated: number }> {
    const idList = ids.join(',');

    await this.sequelize.query(
      `EXEC dbo.SP_CapNhat_MassStatusTracking
        @id = :id,
        @TinhTrang = 'Completed',
        @NgayChuyenTinhTrang = NULL,
        @NguoiTao = :nguoiTao`,
      { replacements: { id: idList, nguoiTao }, type: QueryTypes.RAW }
    );

    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'Tracking_LietKe:MassComplete',
      hanhDong: 'Chinh sua',
      doiTuong: '',
      noiDung: `ID: ${idList}`,
    });

    return { updated: ids.length };
  }

  /**
   * Mass complete tracking with filters
   * Uses: SP_CapNhat_MassStatusAllTrackingWithFilter (same as C# dBConnect.MassStatusAllTrackingWithFilter(...))
   * Logs: ThemSystemLogs with full filter details
   */
  async massCompleteAll(query: QueryTrackingDto, nguoiTao = ''): Promise<{ updated: number }> {
    const { username = '', statuses = '', search = '', trackingNumber = '', tenLoHang = '', quocGiaId, startDate = '', endDate = '' } = query;

    // Build comma-separated status filter same as C# (e.g. "'Received','InTransit'")
    const tinhTrangFilter = statuses ? statuses.replace(/,/g, "','") : '';

    await this.sequelize.query(
      `EXEC dbo.SP_CapNhat_MassStatusAllTrackingWithFilter
        @UserName = :username,
        @TinhTrangFilter = :tinhTrangFilter,
        @NoiDungTim = :search,
        @TimTheo = -1,
        @TrackingNumber = :trackingNumber,
        @TenLoHang = :tenLoHang,
        @QuocGiaID = :quocGiaId,
        @DaXoa = 0,
        @TuNgay = :startDate,
        @DenNgay = :endDate,
        @TinhTrang = 'Completed',
        @NgayChuyenTinhTrang = NULL,
        @NguoiTao = :nguoiTao`,
      {
        replacements: {
          username,
          tinhTrangFilter,
          search,
          trackingNumber,
          tenLoHang,
          quocGiaId: quocGiaId && quocGiaId > 0 ? quocGiaId : -1,
          startDate,
          endDate,
          nguoiTao,
        },
        type: QueryTypes.RAW,
      }
    );

    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'Tracking_LietKe:MassCompleteAllWithFilter',
      hanhDong: 'Chinh sua',
      doiTuong: '',
      noiDung: `UserName: ${username}; TinhTrangFilter: ${tinhTrangFilter}; NoiDungTim: ${search}; Tracking number: ${trackingNumber}; QuocGiaID: ${quocGiaId ?? -1}; Từ ngày: ${startDate}; Đến ngày: ${endDate}`,
    });

    return { updated: 0 };
  }

  /**
   * Find tracking details
   * Matches: SuaTracking.cs -> LoadDataChiTietTracking -> SP_Lay_DanhSachChiTietTrackingByID(@TrackingID)
   */
  async findDetails(id: number): Promise<any> {
    const [tracking, chiTiet, history, anh] = await Promise.all([
      this.findOne(id),
      this.sequelize.query(
        `EXEC dbo.SP_Lay_DanhSachChiTietTrackingByID @TrackingID = :id`,
        { replacements: { id }, type: QueryTypes.SELECT },
      ),
      this.findHistory(id),
      this.anhTrackingService.layAnh(id).catch(() => []),
    ]);

    return {
      ...tracking,
      chiTietTracking: chiTiet || [],
      lichSuTracking: history,
      anhTracking: anh,
    };
  }

  /**
   * Find tracking status history
   */
  async findHistory(id: number): Promise<any[]> {
    try {
      const data = await this.sequelize.query(
        `EXEC dbo.SP_Lay_DanhSachTinhTrangTrackingByID @TrackingID = :id`,
        { replacements: { id }, type: QueryTypes.SELECT },
      );
      return (Array.isArray(data) ? data : []) as any[];
    } catch (error) {
      console.error('Error in findHistory:', (error as any).message);
      return [];
    }
  }

  /**
   * Add tracking status
   * Note: No dedicated SP in C#, uses direct INSERT
   */
  async addHistory(id: number, ghiChu: string, nguoiTao = ''): Promise<any> {
    try {
      await this.sequelize.query(`
        INSERT INTO dbo.tbTinhTrangTracking (TrackingID, GhiChu, NgayTao)
        VALUES (:id, :ghiChu, GETDATE())
      `,
      { replacements: { id, ghiChu }, type: QueryTypes.RAW });

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'Tracking_ThemSua:ThemTinhTrangTracking',
        hanhDong: 'Them moi',
        doiTuong: id.toString(),
        noiDung: `TrackingID: ${id}; GhiChu: ${ghiChu}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return this.findOne(id);
    } catch (error) {
      console.error('Error in addHistory:', (error as any).message);
      throw error;
    }
  }

  /**
   * Update tracking status
   * Uses: SP_CapNhat_TinhTrangTracking
   * Logs: ThemSystemLogs with nguon='Tracking_ThemSua:CapNhatTinhTrangTracking', hanhDong='Chinh sua'
   */
  async updateHistory(historyId: number, ghiChu: string, nguoiTao = ''): Promise<any> {
    try {
      await this.sequelize.query(`
        EXEC dbo.SP_CapNhat_TinhTrangTracking
          @TinhTrangTrackingID = :historyId,
          @GhiChu = :ghiChu
      `,
      { replacements: { historyId, ghiChu }, type: QueryTypes.RAW });

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'Tracking_ThemSua:CapNhatTinhTrangTracking',
        hanhDong: 'Chinh sua',
        doiTuong: historyId.toString(),
        noiDung: `GhiChu: ${ghiChu}`,
      });

      return { id: historyId };
    } catch (error) {
      console.error('Error in updateHistory:', (error as any).message);
      throw error;
    }
  }

  /**
   * Delete tracking status
   * Uses: SP_Xoa_TinhTrangTracking
   * Logs: ThemSystemLogs with nguon='Tracking_ThemSua:XoaTinhTrangTracking', hanhDong='Xoa'
   */
  async deleteHistory(historyId: number, nguoiTao = ''): Promise<void> {
    try {
      await this.sequelize.query(`
        EXEC dbo.SP_Xoa_TinhTrangTracking @TinhTrangTrackingID = :historyId
      `,
      { replacements: { historyId }, type: QueryTypes.RAW });

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'Tracking_ThemSua:XoaTinhTrangTracking',
        hanhDong: 'Xoa',
        doiTuong: historyId.toString(),
        noiDung: `TinhTrangTrackingID: ${historyId}`,
      });
    } catch (error) {
      console.error('Error in deleteHistory:', (error as any).message);
      throw error;
    }
  }

  /**
   * Add chi tiet tracking
   * Uses: SP_Them_ChiTietTracking
   * Logs: ThemSystemLogs with nguon='Tracking_ThemSua:ThemChiTietTracking', hanhDong='Them moi'
   */
  async addChiTiet(trackingId: number, linkHinh: string, soLuong: number, gia: number, ghiChu: string, nguoiTao: string = ''): Promise<any> {
    try {
      await this.sequelize.query(`
        EXEC dbo.SP_Them_ChiTietTracking
          @TrackingID = :trackingId,
          @LinkHinh = :linkHinh,
          @SoLuong = :soLuong,
          @Gia = :gia,
          @GhiChu = :ghiChu
      `,
      {
        replacements: { trackingId, linkHinh, soLuong, gia, ghiChu },
        type: QueryTypes.RAW,
      });

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'Tracking_ThemSua:ThemChiTietTracking',
        hanhDong: 'Them moi',
        doiTuong: trackingId.toString(),
        noiDung: `TrackingID: ${trackingId}; LinkHinh: ${linkHinh}; SoLuong: ${soLuong}; Gia: ${gia}; GhiChu: ${ghiChu}`,
      });

      return this.findDetails(trackingId);
    } catch (error) {
      console.error('Error in addChiTiet:', (error as any).message);
      throw error;
    }
  }

  /**
   * Update chi tiet tracking
   * Uses: SP_CapNhat_ChiTietTracking
   * Logs: ThemSystemLogs with nguon='Tracking_ThemSua:CapNhatChiTietTracking', hanhDong='Chinh sua'
   */
  async updateChiTiet(chiTietTrackingId: number, linkHinh: string, soLuong: number, gia: number, ghiChu: string, trackingId: number, nguoiTao: string = ''): Promise<any> {
    try {
      await this.sequelize.query(`
        EXEC dbo.SP_CapNhat_ChiTietTracking
          @ChiTietTrackingID = :chiTietTrackingId,
          @LinkHinh = :linkHinh,
          @SoLuong = :soLuong,
          @Gia = :gia,
          @GhiChu = :ghiChu
      `,
      {
        replacements: { chiTietTrackingId, linkHinh, soLuong, gia, ghiChu },
        type: QueryTypes.RAW,
      });

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'Tracking_ThemSua:CapNhatChiTietTracking',
        hanhDong: 'Chinh sua',
        doiTuong: chiTietTrackingId.toString(),
        noiDung: `LinkHinh: ${linkHinh}; SoLuong: ${soLuong}; Gia: ${gia}; GhiChu: ${ghiChu}`,
      });

      return this.findDetails(trackingId);
    } catch (error) {
      console.error('Error in updateChiTiet:', (error as any).message);
      throw error;
    }
  }

  /**
   * Delete chi tiet tracking
   * Uses: SP_Xoa_ChiTietTracking
   * Logs: ThemSystemLogs with nguon='Tracking_ThemSua:XoaChiTietTracking', hanhDong='Xoa'
   */
  async deleteChiTiet(chiTietTrackingId: number, trackingId: number, nguoiTao: string = ''): Promise<any> {
    try {
      await this.sequelize.query(`
        EXEC dbo.SP_Xoa_ChiTietTracking @ChiTietTrackingID = :chiTietTrackingId
      `,
      { replacements: { chiTietTrackingId }, type: QueryTypes.RAW });

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'Tracking_ThemSua:XoaChiTietTracking',
        hanhDong: 'Xoa',
        doiTuong: chiTietTrackingId.toString(),
        noiDung: `ChiTietTrackingID: ${chiTietTrackingId}`,
      });

      return this.findDetails(trackingId);
    } catch (error) {
      console.error('Error in deleteChiTiet:', (error as any).message);
      throw error;
    }
  }

  /**
   * Get users for dropdown (Tracking_ThemSua form)
   * Mirrors C# code: userManager.Users.OrderBy(u => u.UserName)
   */
  async getUsers(): Promise<any[]> {
    try {
      const users = await this.sequelize.query(
        `SELECT UserName FROM AspNetUsers ORDER BY UserName`,
        { type: QueryTypes.SELECT }
      );
      return (Array.isArray(users) ? users : []) as any[];
    } catch (error) {
      console.error('Error in getUsers:', (error as any).message);
      return [];
    }
  }

  /**
   * Get shipping providers for dropdown (Tracking_ThemSua form)
   * Uses: SP_Lay_NhaVanChuyen (same as C# DBConnect.LayDanhSachNhaVanChuyen)
   */
  async getNhaVanChuyen(): Promise<any[]> {
    try {
      const providers = await this.sequelize.query(
        `EXEC dbo.SP_Lay_NhaVanChuyen`,
        { type: QueryTypes.SELECT }
      );
      return (Array.isArray(providers) ? providers : []) as any[];
    } catch (error) {
      console.error('Error in getNhaVanChuyen:', (error as any).message);
      return [];
    }
  }

  /**
   * Get sheets from Excel file for import pages
   * Converted from: Tracking_Import.aspx - Step 1: Upload file to get sheets
   */
  async getExcelSheets(file: any): Promise<{ sheets: string[] }> {
    try {
      const workbook = new Excel.Workbook();
      await workbook.xlsx.load(file.buffer as any);
      const sheets = workbook.worksheets.map(ws => ws.name);
      return { sheets };
    } catch (error) {
      console.error('Error reading Excel sheets:', (error as any).message);
      return { sheets: [] };
    }
  }

  /**
   * Load ref data needed to validate the imported rows (countries, carriers,
   * usernames). Each lookup keyed by lower-cased name.
   */
  private async loadImportRefData(): Promise<RefData> {
    const [quocGia, nhaVanChuyen, users] = await Promise.all([
      this.sequelize.query<{ QuocGiaID: number; TenQuocGia: string }>(
        `SELECT QuocGiaID, TenQuocGia FROM dbo.tbQuocGia`,
        { type: QueryTypes.SELECT },
      ),
      this.sequelize.query<{ NhaVanChuyenID: number; TenNhaVanChuyen: string }>(
        `EXEC dbo.SP_Lay_NhaVanChuyen`,
        { type: QueryTypes.SELECT },
      ),
      this.sequelize.query<{ UserName: string }>(
        `SELECT UserName FROM AspNetUsers`,
        { type: QueryTypes.SELECT },
      ),
    ]);

    const quocGiaByName = new Map<string, number>();
    for (const row of quocGia) {
      if (row.TenQuocGia) quocGiaByName.set(row.TenQuocGia.toLowerCase(), row.QuocGiaID);
    }
    const nhaVanChuyenByName = new Map<string, number>();
    for (const row of nhaVanChuyen) {
      if (row.TenNhaVanChuyen) {
        nhaVanChuyenByName.set(row.TenNhaVanChuyen.toLowerCase(), row.NhaVanChuyenID);
      }
    }
    const usernames = new Set<string>();
    for (const row of users) {
      if (row.UserName) usernames.add(row.UserName.toLowerCase());
    }

    return { quocGiaByName, nhaVanChuyenByName, usernames };
  }

  /**
   * Look up existing TrackingIDs by TrackingNumber for the rows being imported
   * in edit mode. Returns a Set of TrackingNumber values that exist and a Map
   * keyed by TrackingNumber -> TrackingID for actual SP calls.
   */
  private async loadExistingTrackingNumbers(
    trackingNumbers: string[],
  ): Promise<{ existing: Set<string>; idByNumber: Map<string, number> }> {
    const existing = new Set<string>();
    const idByNumber = new Map<string, number>();
    if (trackingNumbers.length === 0) return { existing, idByNumber };

    // Mirror legacy DBConnect.LayTrackingIDByTrackingNumber — invoked once per
    // unique number. Volume is bounded by the upload size (typically <1k rows).
    // Bounded concurrency: legacy code ran serially; we keep SP semantics
    // identical but fan out IMPORT_CONCURRENCY at a time so 1000-row uploads
    // don't queue 1000 calls on a 5-conn pool.
    const unique = Array.from(new Set(trackingNumbers.filter(Boolean)));
    const results = await this.runInChunks(
      unique,
      TrackingService.IMPORT_CONCURRENCY,
      async (tn) => {
        try {
          const rows = await this.sequelize.query(
            `EXEC dbo.SP_Lay_TrackingIDByTrackingNumber @TrackingNumber = :tn`,
            { replacements: { tn }, type: QueryTypes.SELECT },
          );
          const first: any = (rows as any[])[0];
          // SP uses ExecuteScalar in C# — returns a single scalar/column. Handle
          // both shapes: { TrackingID: n } or a bare number / { '': n }.
          const id =
            typeof first === 'number'
              ? first
              : first && typeof first === 'object'
                ? (first.TrackingID ?? Object.values(first)[0] ?? null)
                : null;
          return { tn, id: typeof id === 'number' && id > 0 ? id : null };
        } catch {
          return { tn, id: null };
        }
      },
    );

    for (const { tn, id } of results) {
      if (id !== null && id !== undefined) {
        existing.add(tn);
        idByNumber.set(tn, id);
      }
    }
    return { existing, idByNumber };
  }

  /**
   * Import tracking rows from an uploaded Excel file.
   *
   * Converted from Tracking_Import.aspx.cs (DocDuLieu + ValidateExcelData +
   * LuuExcel). Two modes:
   *  - create (mode != '1'): inserts via SP_Them_Tracking
   *  - edit (mode == '1'): updates via SP_CapNhat_Tracking, with the user
   *    selecting which columns to overwrite via editColumns.
   *
   * If `commit !== 'true'` we return the validation preview without writing.
   */
  async importTracking(
    file: any,
    dto: ImportTrackingDto,
    actorUsername?: string,
  ): Promise<ImportTrackingResult> {
    if (!file) {
      throw new NotFoundException('No file uploaded');
    }
    if (!file.originalname?.toLowerCase().endsWith('.xlsx')) {
      throw new NotFoundException('Only .xlsx files are supported');
    }
    if (!dto.sheetName) {
      throw new NotFoundException('sheetName is required');
    }

    const editMode = dto.mode === '1';
    const editColumns = parseEditColumns(dto.editColumns);
    // In create mode every column applies; build a full set so we always check.
    const effectiveCols = editMode
      ? editColumns
      : new Set(Array.from({ length: EDIT_COLUMN_COUNT }, (_, i) => i));

    const rows = await parseTrackingExcel(file.buffer as Buffer, dto.sheetName);
    const ref = await this.loadImportRefData();

    // For edit mode we need to know which tracking numbers exist in DB.
    const trackingNumbers = rows.map((r) => r.trackingNumber).filter(Boolean);
    const { existing, idByNumber } = editMode
      ? await this.loadExistingTrackingNumbers(trackingNumbers)
      : { existing: new Set<string>(), idByNumber: new Map<string, number>() };

    const errorCount = validateRows(rows, ref, editMode, effectiveCols, existing);

    const commit = dto.commit === 'true';
    let imported = 0;
    if (commit && errorCount < rows.length) {
      imported = await this.persistImportRows(
        rows,
        ref,
        idByNumber,
        editMode,
        effectiveCols,
        actorUsername || '',
      );
    }

    return {
      rows: rows.map(({ ngayDatHangIso, ngayDatHangInvalid, ...rest }) => rest),
      errorCount,
      imported,
      committed: commit,
    };
  }

  /**
   * Build the noiDung string for a tracking system log row.
   *
   * Mirrors C# BLL.NoiDungTrackingSystemLogs (BLL.cs:1530) — field order and
   * formatting must match so audit log queries that filter on substring stay
   * compatible across legacy and new entries.
   */
  private buildTrackingLogContent(args: {
    username: string;
    trackingNumber: string;
    orderNumber: string;
    ngayDatHang: string; // dd/MM/yyyy or empty
    nhaVanChuyenId: number | null;
    quocGiaId: number | null;
    tinhTrang: string;
    ghiChu: string;
    nguoiTao: string;
    kien: string;
    mawb: string;
    hawb: string;
  }): string {
    const v = (n: number | null) => (n === null || n === undefined ? '' : String(n));
    return (
      `UserName: ${args.username};` +
      `TrackingNumber: ${args.trackingNumber};` +
      `OrderNumber: ${args.orderNumber};` +
      `NgayDatHang: ${args.ngayDatHang};` +
      `NhaVanChuyenID: ${v(args.nhaVanChuyenId)};` +
      `QuocGiaID: ${v(args.quocGiaId)};` +
      `TinhTrang: ${args.tinhTrang};` +
      `GhiChu: ${args.ghiChu};` +
      `NguoiTao: ${args.nguoiTao};` +
      `Kien: ${args.kien};` +
      `Mawb: ${args.mawb};` +
      `Hawb: ${args.hawb};`
    );
  }

  /**
   * Persist validated rows: insert (create mode) or update (edit mode).
   * Skips rows that have errors. Logs each successful row to system logs.
   *
   * Routing:
   *  - create mode → persistCreateBatch (gom N SP_Them_Tracking + N log
   *    INSERT vào 1 TDS batch, atomic per chunk; fallback per-row khi batch
   *    fail để gán lỗi đúng row).
   *  - edit mode  → chunked-parallel single calls (SP_CapNhat_Tracking có
   *    chữ ký động theo editColumns nên batching SQL phức tạp, không đáng).
   */
  private async persistImportRows(
    rows: ParsedTrackingRow[],
    ref: RefData,
    idByNumber: Map<string, number>,
    editMode: boolean,
    editColumns: Set<number>,
    actor: string,
  ): Promise<number> {
    // Filter once so neither path sees rows legacy would skip
    // (legacy `if (Error) continue;` short-circuit).
    const targets = rows.filter((r) => r.errors.length === 0);

    if (editMode) {
      const results = await this.runInChunks(
        targets,
        TrackingService.IMPORT_CONCURRENCY,
        (row) =>
          this.persistOneRow(row, ref, idByNumber, true, editColumns, actor),
      );
      return results.reduce((n, ok) => n + (ok ? 1 : 0), 0);
    }

    // Create mode: bulk per chunk, fall back to per-row on chunk failure so
    // we can attribute the error to the offending row (matches legacy's
    // "skip bad row, keep going" semantic).
    let imported = 0;
    for (let i = 0; i < targets.length; i += TrackingService.IMPORT_BATCH_SIZE) {
      const chunk = targets.slice(i, i + TrackingService.IMPORT_BATCH_SIZE);
      try {
        await this.persistCreateBatch(chunk, ref, actor);
        // Batch succeeded → ROLLBACK never fired → all chunk rows committed.
        imported += chunk.length;
      } catch (error) {
        // Server-side TRY/CATCH rolled the whole chunk back atomically.
        // Re-run per-row to attribute the failing row.
        console.error(
          `Bulk batch [${i}-${i + chunk.length - 1}] failed, falling back to per-row:`,
          (error as any).message,
        );
        const fb = await this.runInChunks(
          chunk,
          TrackingService.IMPORT_CONCURRENCY,
          (row) =>
            this.persistOneRow(row, ref, idByNumber, false, editColumns, actor),
        );
        imported += fb.reduce((n, ok) => n + (ok ? 1 : 0), 0);
      }
    }
    return imported;
  }

  /**
   * Per-row persistence — byte-identical to legacy LuuExcel inner loop:
   * same SP calls, same log payload, same `row.errors.push` on failure.
   * Used by edit mode (always) and as the fallback when persistCreateBatch
   * rolls back a batch.
   */
  private async persistOneRow(
    row: ParsedTrackingRow,
    ref: RefData,
    idByNumber: Map<string, number>,
    editMode: boolean,
    editColumns: Set<number>,
    actor: string,
  ): Promise<boolean> {
    const quocGiaId = row.tenQuocGia
      ? ref.quocGiaByName.get(row.tenQuocGia.toLowerCase()) ?? null
      : null;
    const nhaVanChuyenId = row.tenNhaVanChuyen
      ? ref.nhaVanChuyenByName.get(row.tenNhaVanChuyen.toLowerCase()) ?? null
      : null;
    const tinhTrang = row.tinhTrang || 'Received';
    const ngayDatHang = row.ngayDatHangIso; // may be null
    const ghiChuLoHang = row.ghiChuLoHang || '';
    const coTaoLoHang = ghiChuLoHang ? 1 : 0;
    const noiDung = this.buildTrackingLogContent({
      username: row.username,
      trackingNumber: row.trackingNumber,
      orderNumber: row.orderNumber,
      ngayDatHang: row.ngayDatHang, // dd/MM/yyyy display string (matches C# DateTime.ToString("dd/MM/yyyy"))
      nhaVanChuyenId,
      quocGiaId,
      tinhTrang,
      ghiChu: row.ghiChu,
      nguoiTao: actor,
      kien: row.kien,
      mawb: row.mawb,
      hawb: row.hawb,
    });

    try {
      if (editMode) {
        const trackingId = idByNumber.get(row.trackingNumber);
        if (!trackingId) return false;
        await this.execCapNhatTracking({
          trackingId,
          row,
          quocGiaId,
          nhaVanChuyenId,
          tinhTrang,
          ngayDatHang,
          coTaoLoHang,
          ghiChuLoHang,
          actor,
          editColumns,
        });
        // Mirror C#: nguon = "Tracking_Import:CapNhatTrackingKhongMoDB",
        // hanhDong = HanhDong.ChinhSua, doiTuong = TrackingID
        await this.systemLogsService.create({
          nguoiTao: actor,
          nguon: 'Tracking_Import:CapNhatTrackingKhongMoDB',
          hanhDong: 'Chinh sua',
          doiTuong: String(trackingId),
          noiDung,
        });
      } else {
        await this.sequelize.query(
          `EXEC dbo.SP_Them_Tracking
              @UserName = :username,
              @TrackingNumber = :trackingNumber,
              @OrderNumber = :orderNumber,
              @NgayDatHang = :ngayDatHang,
              @NhaVanChuyenID = :nhaVanChuyenId,
              @QuocGiaID = :quocGiaId,
              @TinhTrang = :tinhTrang,
              @GhiChu = :ghiChu,
              @NguoiTao = :nguoiTao,
              @Kien = :kien,
              @Mawb = :mawb,
              @Hawb = :hawb,
              @CoTaoLoHang = :coTaoLoHang,
              @GhiChuLoHang = :ghiChuLoHang`,
          {
            replacements: {
              username: row.username,
              trackingNumber: row.trackingNumber,
              orderNumber: row.orderNumber,
              // Pass null when date is empty, mirroring DBConnect.ThemTrackingKhongMoDB:
              // `if NgayDatHang.HasValue { @NgayDatHang = value } else { DBNull.Value }`
              ngayDatHang,
              nhaVanChuyenId,
              quocGiaId,
              tinhTrang,
              ghiChu: row.ghiChu,
              nguoiTao: actor,
              kien: row.kien,
              mawb: row.mawb,
              hawb: row.hawb,
              coTaoLoHang,
              ghiChuLoHang,
            },
            type: QueryTypes.RAW,
          },
        );
        // Mirror C#: nguon = "Tracking_Import:ThemTrackingKhongMoDB",
        // hanhDong = HanhDong.ThemMoi, doiTuong = ""
        await this.systemLogsService.create({
          nguoiTao: actor,
          nguon: 'Tracking_Import:ThemTrackingKhongMoDB',
          hanhDong: 'Them moi',
          doiTuong: '',
          noiDung,
        });
      }
      return true;
    } catch (error) {
      console.error(
        `Error persisting tracking row ${row.excelRowIndex}:`,
        (error as any).message,
      );
      row.errors.push(`Lưu thất bại: ${(error as any).message}`);
      return false;
    }
  }

  /**
   * Bulk path for create mode: gom toàn bộ chunk vào 1 TDS batch
   *   SET XACT_ABORT ON; BEGIN TRAN;
   *   EXEC SP_Them_Tracking @... (× N);
   *   INSERT INTO tbSystemLogs ... VALUES (...), (...) ... (× N);
   *   COMMIT;
   *
   * - Vẫn dùng SP_Them_Tracking (KHÔNG đụng business logic trong SP).
   * - XACT_ABORT ON → bất kỳ lỗi nào trong batch sẽ rollback toàn bộ chunk,
   *   caller chuyển sang per-row fallback. Tránh duplicate insert.
   * - Param count: 14 + 5 = 19 per row × IMPORT_BATCH_SIZE (50) = 950, dưới
   *   ngưỡng 2100 của SQL Server.
   *
   * Throws on any T-SQL error — caller catches and falls back to per-row.
   */
  private async persistCreateBatch(
    rows: ParsedTrackingRow[],
    ref: RefData,
    actor: string,
  ): Promise<void> {
    if (rows.length === 0) return;

    const spStmts: string[] = [];
    const logValues: string[] = [];
    const replacements: Record<string, any> = {};

    rows.forEach((row, idx) => {
      const quocGiaId = row.tenQuocGia
        ? ref.quocGiaByName.get(row.tenQuocGia.toLowerCase()) ?? null
        : null;
      const nhaVanChuyenId = row.tenNhaVanChuyen
        ? ref.nhaVanChuyenByName.get(row.tenNhaVanChuyen.toLowerCase()) ?? null
        : null;
      const tinhTrang = row.tinhTrang || 'Received';
      const ngayDatHang = row.ngayDatHangIso; // null when date empty
      const ghiChuLoHang = row.ghiChuLoHang || '';
      const coTaoLoHang = ghiChuLoHang ? 1 : 0;
      const noiDung = this.buildTrackingLogContent({
        username: row.username,
        trackingNumber: row.trackingNumber,
        orderNumber: row.orderNumber,
        ngayDatHang: row.ngayDatHang,
        nhaVanChuyenId,
        quocGiaId,
        tinhTrang,
        ghiChu: row.ghiChu,
        nguoiTao: actor,
        kien: row.kien,
        mawb: row.mawb,
        hawb: row.hawb,
      });

      // Unique replacement keys per row index — sequelize substitutes by name
      // so each :u_0, :u_1 ... maps to its own parameter.
      const p = idx;
      spStmts.push(
        `EXEC dbo.SP_Them_Tracking
            @UserName = :u_${p},
            @TrackingNumber = :tn_${p},
            @OrderNumber = :on_${p},
            @NgayDatHang = :nd_${p},
            @NhaVanChuyenID = :nv_${p},
            @QuocGiaID = :qg_${p},
            @TinhTrang = :tt_${p},
            @GhiChu = :gc_${p},
            @NguoiTao = :ng_${p},
            @Kien = :k_${p},
            @Mawb = :mw_${p},
            @Hawb = :hw_${p},
            @CoTaoLoHang = :ct_${p},
            @GhiChuLoHang = :gcl_${p}`,
      );
      replacements[`u_${p}`] = row.username;
      replacements[`tn_${p}`] = row.trackingNumber;
      replacements[`on_${p}`] = row.orderNumber;
      replacements[`nd_${p}`] = ngayDatHang;
      replacements[`nv_${p}`] = nhaVanChuyenId;
      replacements[`qg_${p}`] = quocGiaId;
      replacements[`tt_${p}`] = tinhTrang;
      replacements[`gc_${p}`] = row.ghiChu;
      replacements[`ng_${p}`] = actor;
      replacements[`k_${p}`] = row.kien;
      replacements[`mw_${p}`] = row.mawb;
      replacements[`hw_${p}`] = row.hawb;
      replacements[`ct_${p}`] = coTaoLoHang;
      replacements[`gcl_${p}`] = ghiChuLoHang;

      // Log row — mirrors legacy ThemSystemLogsKhongMoDB nguon/hanhDong/doiTuong
      logValues.push(
        `(:lng_${p}, GETDATE(), :lnguon_${p}, :lhd_${p}, :ldt_${p}, :lnd_${p})`,
      );
      replacements[`lng_${p}`] = actor;
      replacements[`lnguon_${p}`] = 'Tracking_Import:ThemTrackingKhongMoDB';
      replacements[`lhd_${p}`] = 'Them moi';
      replacements[`ldt_${p}`] = '';
      replacements[`lnd_${p}`] = noiDung;
    });

    // TRY/CATCH thay cho SET XACT_ABORT ON để KHÔNG leak session state vào
    // connection pool. Atomic giống y XACT_ABORT: bất kỳ lỗi nào trong TRY
    // → ROLLBACK + THROW → caller chuyển sang fallback per-row.
    const sql =
      `SET NOCOUNT ON;\n` +
      `BEGIN TRY\n` +
      `  BEGIN TRANSACTION;\n` +
      `  ${spStmts.join(';\n  ')};\n` +
      `  INSERT INTO dbo.tbSystemLogs (NguoiTao, NgayTao, Nguon, HanhDong, DoiTuong, NoiDung)\n` +
      `  VALUES ${logValues.join(',\n    ')};\n` +
      `  COMMIT TRANSACTION;\n` +
      `END TRY\n` +
      `BEGIN CATCH\n` +
      `  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;\n` +
      `  THROW;\n` +
      `END CATCH;`;

    // Let any T-SQL error propagate — server-side TRY/CATCH already rolled
    // the chunk back atomically. Caller's try/catch routes to per-row fallback.
    await this.sequelize.query(sql, {
      replacements,
      type: QueryTypes.RAW,
    });
  }

  /**
   * Call SP_CapNhat_Tracking with only the columns the user opted to update.
   * Matches the udXxx flag convention from CapNhatTrackingKhongMoDB.
   */
  private async execCapNhatTracking(args: {
    trackingId: number;
    row: ParsedTrackingRow;
    quocGiaId: number | null;
    nhaVanChuyenId: number | null;
    tinhTrang: string;
    ngayDatHang: string | null;
    coTaoLoHang: number;
    ghiChuLoHang: string;
    actor: string;
    editColumns: Set<number>;
  }): Promise<void> {
    const { trackingId, row, quocGiaId, nhaVanChuyenId, tinhTrang, ngayDatHang, coTaoLoHang, ghiChuLoHang, actor, editColumns } = args;
    const has = (i: number) => (editColumns.has(i) ? 1 : 0);

    const allValues = {
      id: trackingId,
      username: row.username,
      trackingNumber: row.trackingNumber,
      orderNumber: row.orderNumber,
      // Pass null when empty, mirroring DBConnect.CapNhatTrackingKhongMoDB's
      // DBNull.Value branch.
      ngayDatHang,
      nhaVanChuyenId,
      quocGiaId,
      tinhTrang,
      ghiChu: row.ghiChu,
      nguoiTao: actor,
      kien: row.kien,
      mawb: row.mawb,
      hawb: row.hawb,
      coTaoLoHang,
      ghiChuLoHang,
      udUserName: has(1),
      udTrackingNumber: 0, // TrackingNumber is the lookup key, never overwritten
      udOrderNumber: has(2),
      udNgayDatHang: has(3),
      udNhaVanChuyenID: has(4),
      udQuocGiaID: has(0),
      udTinhTrang: has(5),
      udGhiChu: has(6),
      udKien: has(7),
      udMawb: has(8),
      udHawb: has(9),
      udGhiChuLoHang: has(10),
    };

    const paramMap: Array<{ spParam: string; replacementKey: string }> = [
      { spParam: 'TrackingID', replacementKey: 'id' },
      { spParam: 'UserName', replacementKey: 'username' },
      { spParam: 'TrackingNumber', replacementKey: 'trackingNumber' },
      { spParam: 'OrderNumber', replacementKey: 'orderNumber' },
      { spParam: 'NgayDatHang', replacementKey: 'ngayDatHang' },
      { spParam: 'NhaVanChuyenID', replacementKey: 'nhaVanChuyenId' },
      { spParam: 'QuocGiaID', replacementKey: 'quocGiaId' },
      { spParam: 'TinhTrang', replacementKey: 'tinhTrang' },
      { spParam: 'GhiChu', replacementKey: 'ghiChu' },
      { spParam: 'NguoiTao', replacementKey: 'nguoiTao' },
      { spParam: 'Kien', replacementKey: 'kien' },
      { spParam: 'Mawb', replacementKey: 'mawb' },
      { spParam: 'Hawb', replacementKey: 'hawb' },
      { spParam: 'CoTaoLoHang', replacementKey: 'coTaoLoHang' },
      { spParam: 'GhiChuLoHang', replacementKey: 'ghiChuLoHang' },
      { spParam: 'udUserName', replacementKey: 'udUserName' },
      { spParam: 'udTrackingNumber', replacementKey: 'udTrackingNumber' },
      { spParam: 'udOrderNumber', replacementKey: 'udOrderNumber' },
      { spParam: 'udNgayDatHang', replacementKey: 'udNgayDatHang' },
      { spParam: 'udNhaVanChuyenID', replacementKey: 'udNhaVanChuyenID' },
      { spParam: 'udQuocGiaID', replacementKey: 'udQuocGiaID' },
      { spParam: 'udTinhTrang', replacementKey: 'udTinhTrang' },
      { spParam: 'udGhiChu', replacementKey: 'udGhiChu' },
      { spParam: 'udKien', replacementKey: 'udKien' },
      { spParam: 'udMawb', replacementKey: 'udMawb' },
      { spParam: 'udHawb', replacementKey: 'udHawb' },
      { spParam: 'udGhiChuLoHang', replacementKey: 'udGhiChuLoHang' },
    ];

    const spParams = await this.getProcedureParams('dbo.SP_CapNhat_Tracking');
    const selected = paramMap.filter((p) => spParams.has(p.spParam.toLowerCase()));
    const execSql = `EXEC dbo.SP_CapNhat_Tracking\n${selected
      .map((p) => `  @${p.spParam} = :${p.replacementKey}`)
      .join(',\n')}`;
    const replacements = selected.reduce((acc, p) => {
      acc[p.replacementKey] = (allValues as Record<string, any>)[p.replacementKey];
      return acc;
    }, {} as Record<string, any>);

    await this.sequelize.query(execSql, { replacements, type: QueryTypes.RAW });
  }
}
