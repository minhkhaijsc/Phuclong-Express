import { Injectable, NotFoundException, Inject, BadRequestException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes, Op } from 'sequelize';
import { Order, OrderModel, OrderStatus } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { CreateQuickOrderDto, CreateQuickOrdersDto } from './dto/create-quick-order.dto';
import { MassUpdateDto, MassDeleteDto, MassCompleteDto, MassReceivedDto, MassShippedDto, MassCancelDto } from './dto/mass-update.dto';
import { UpdateOrderNoteDto } from './dto/update-order-note.dto';
import { UpdateReturnDateDto } from './dto/update-return-date.dto';
import { formatSqlDate, parseVietnameseDate } from '../helpers/sql-date.helper';
import { ImportOrdersDto, ImportOrderItemDto } from './dto/import-orders.dto';
import { QueryQLDatHangDto, QLDatHangResponseDto } from './dto/query-qldathang.dto';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ImageUploadService } from '../common/services/image-upload.service';
import {
  cheNcc,
  cheNccDanhSach,
  docThanNcc,
  ganNcc,
  nhatKyNcc,
} from './ncc-don-hang';

/**
 * Orders Service
 *
 * Handles order CRUD operations and business logic using Sequelize.
 */
@Injectable()
export class OrdersService {
  private orderModel: typeof Order;

  /**
   * Lọc ô "Mã đặt hàng" về dạng an toàn cho SP_Lay_DonHang.
   *
   * SP nối thẳng tham số này vào câu lệnh động rồi chạy bằng sp_executesql:
   *     SET @Sql = @Sql + ' AND ID IN (' + @MaDatHang + ')'
   * Nên đây KHÔNG phải mã đơn hàng mà là danh sách ID (số) nội bộ, và mọi thứ
   * gõ vào đi thẳng vào SQL. Gõ chữ ("UHSA8Y") thì câu lệnh thành
   * `ID IN (UHSA8Y)` → SQL Server báo lỗi, vỡ cả màn hình; gõ dấu nháy thì
   * thành lỗ SQL injection.
   *
   * Giữ lại đúng chữ số và dấu phẩy, bỏ phần còn lại. Không còn số nào thì trả
   * chuỗi rỗng — SP bỏ qua điều kiện, danh sách vẫn hiện bình thường, hơn là
   * ném lỗi vào mặt người dùng.
   */
  private locMaDatHang(v: unknown): string {
    const tho = String(v ?? '').trim();
    if (!tho) return '';

    const phan = tho.split(/[,;\s]+/).filter((x) => x.length > 0);
    // TOÀN BỘ phải là số thì mới nhận. Không được "nhặt số ra khỏi chữ": mã đơn
    // thật có dạng "UHSA8Y", nhặt số ra thành 8 rồi lọc theo ID 8 là trả về một
    // đơn hoàn toàn khác — sai âm thầm, tệ hơn hẳn báo lỗi.
    if (!phan.every((x) => /^[0-9]{1,10}$/.test(x))) return '';
    return phan.join(',');
  }

  /**
   * Tách ô "Filter" thành danh sách mã khi người dùng dán nhiều mã cùng lúc.
   *
   * HD dán một cột mã từ Excel vào ô Filter và muốn xem hết một lượt. Dán từ
   * Excel ra chuỗi ngăn bởi xuống dòng; gõ tay thì hay dùng dấu phẩy hoặc
   * khoảng trắng — nhận cả ba.
   *
   * CHỈ chuyển sang chế độ nhiều mã khi có TỪ HAI mã trở lên. Một giá trị thì
   * giữ nguyên đường cũ (@NoiDungTim, tìm LIKE) vì người ta còn dùng ô này để
   * tìm một phần ghi chú, tên đợt hàng, link web — đổi sang khớp chính xác là
   * làm hỏng cách dùng sẵn có.
   *
   * Trả '' nghĩa là "không phải danh sách mã, cứ xử lý như cũ".
   */
  private tachDanhSachMa(v: unknown): string {
    const tho = String(v ?? '').trim();
    if (!tho) return '';

    const ma = tho
      // CHỈ tách theo dấu phẩy / chấm phẩy / xuống dòng — KHÔNG tách theo
      // khoảng trắng. Người ta vẫn gõ cụm từ vào ô này để tìm ghi chú
      // ("hang de vo"); tách theo khoảng trắng là biến cụm đó thành 3 mã
      // rồi trả 0 đơn — hỏng hẳn một cách dùng sẵn có.
      .split(/[,;\r\n]+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

    if (ma.length < 2) return '';
    // Mã dài bất thường thì nhiều khả năng không phải mã — đừng đoán bừa.
    if (ma.some((x) => x.length > 100)) return '';

    // Bỏ trùng, giữ nguyên thứ tự người dùng dán vào.
    return Array.from(new Set(ma)).join(',');
  }

  constructor(
    @Inject('SEQUELIZE') private sequelize: Sequelize,
    private readonly systemLogsService: SystemLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly imageUploadService: ImageUploadService,
  ) {
    if (!sequelize.models.Order) {
      OrderModel(sequelize);
    }
    this.orderModel = sequelize.models.Order as typeof Order;
  }

  /**
   * Get basic order info (username, orderNumber) for a list of IDs.
   * Used to send notifications to the right users after admin actions.
   */
  private async getOrdersInfo(ids: (number | string)[]): Promise<{ id: number; username: string; orderNumber: string }[]> {
    if (!ids.length) return [];
    const idList = ids.map(Number).join(',');
    const [rows]: any[] = await this.sequelize.query(
      `SELECT ID as id, username, ordernumber as orderNumber FROM dbo.DON_HANG WHERE ID IN (${idList})`,
    );
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * Lấy tỷ giá hiện tại theo loại tiền của đơn hàng đầu tiên trong danh sách ID.
   * Tương đương: DBConnect.LayTyGiaHienTaiTuDanhSachDonHang(string id)
   *   → SP_Lay_TyGiaHienTaiTuDanhSachDonHang (note.txt:5075)
   *
   *   SELECT TyGiaVND FROM TY_GIA
   *   WHERE Name = (SELECT TOP 1 loaitien FROM DON_HANG
   *                 WHERE ID IN (SELECT CAST(s as int) FROM dbo.SplitString(@id, ',')))
   *
   * Trả null nếu không tìm thấy. Caller có quyền hiển thị "" để user nhập tay.
   */
  async getCurrentTyGiaFromOrders(ids: string): Promise<{ tyGia: number | null; loaiTien: string | null }> {
    const idList = (ids || '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!idList.length) return { tyGia: null, loaiTien: null };

    const [rows]: any[] = await this.sequelize.query(
      `SELECT TOP 1 t.TyGiaVND AS tyGia, d.loaitien AS loaiTien
       FROM dbo.DON_HANG d
       LEFT JOIN dbo.TY_GIA t ON t.Name = d.loaitien
       WHERE d.ID IN (${idList.join(',')})`,
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return { tyGia: null, loaiTien: null };
    return {
      tyGia: row.tyGia !== null && row.tyGia !== undefined ? Number(row.tyGia) : null,
      loaiTien: row.loaiTien ?? null,
    };
  }

  /**
   * Send order notifications to affected users after an admin action.
   * Fires-and-forgets (non-blocking) — errors are logged but do not fail the request.
   */
  private notifyOrderUsers(
    orders: { username: string; orderNumber: string }[],
    title: string,
    message: (o: { username: string; orderNumber: string }) => string,
    refIds: (number | string)[],
    adminUsername: string,
  ): void {
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      const refId = refIds[i] !== undefined ? String(refIds[i]) : undefined;
      try {
        this.notificationsService
          .create({
            username: o.username,
            title,
            message: message(o),
            type: 'order',
            createdBy: adminUsername,
            refType: 'order',
            refId,
          })
          .catch((err) => console.error('[notify] Failed to send notification:', err));
      } catch (err) {
        console.error('[notify] Unexpected error creating notification:', err);
      }
    }
  }

  /**
   * Generate order number
   * Format: ORD-{YYYYMMDD}-{Random4Digits}
   */
  private generateOrderNumber(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${dateStr}-${random}`;
  }

  /**
   * Parse "dd/mm/yyyy" hoặc ISO date string -> "YYYY-MM-DD" (MSSQL DATE format).
   * Trả về null nếu input rỗng/không hợp lệ — để SP dùng default GETDATE().
   */
  private parseToIsoDate(input?: string | null): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    // dd/mm/yyyy
    const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy;
      return `${yyyy}-${mm}-${dd}`;
    }

    // ISO or other parseable
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  /**
   * Calculate order totals
   */
  private calculateTotals(orderData: Partial<Order>): Partial<Order> {
    const tyGia = orderData.tyGia || 1;

    if (orderData.giaSauOffUsd && tyGia) {
      orderData.giaSauOffVnd = Number(orderData.giaSauOffUsd) * Number(tyGia);
    }

    if (orderData.tienCongUsd && tyGia) {
      orderData.tienCongVnd = Number(orderData.tienCongUsd) * Number(tyGia);
    }

    if (orderData.tongTienUsd && tyGia) {
      orderData.tongTienVnd = Number(orderData.tongTienUsd) * Number(tyGia);
    }

    return orderData;
  }

  /**
   * Create a new order
   */
  async create(createOrderDto: CreateOrderDto, nguoiTao?: string): Promise<Order> {
    if (!createOrderDto.orderNumber) {
      createOrderDto.orderNumber = this.generateOrderNumber();
    }

    createOrderDto.ngaySaveLink = createOrderDto.ngaySaveLink || new Date().toISOString();
    createOrderDto.loaiTien = createOrderDto.loaiTien || 'USD';
    createOrderDto.trangThaiOrder = createOrderDto.trangThaiOrder || OrderStatus.RECEIVED;
    createOrderDto.soLuong = createOrderDto.soLuong || 1;
    createOrderDto.donGiaWeb = createOrderDto.donGiaWeb || 0;
    createOrderDto.tax = createOrderDto.tax || 0;
    createOrderDto.yeuCauGuiHang = createOrderDto.yeuCauGuiHang || 0;
    createOrderDto.daQuaHanMuc = createOrderDto.daQuaHanMuc || false;
    createOrderDto.laKhachVip = createOrderDto.laKhachVip || false;
    createOrderDto.hangKhoan = createOrderDto.hangKhoan || false;

    if (nguoiTao) {
      createOrderDto.nguoiTao = nguoiTao;
    }

    const orderData = this.calculateTotals(createOrderDto as Partial<Order>);
    return this.orderModel.create(orderData as any);
  }

  /**
   * Create quick order WITH auto-calculation (QLDatHang_Them)
   * Converted from: QLDatHang_Them.cs - ThemDatHangSimpleCoTamTinh
   * Uses stored procedure: SP_Them_DonHang_Simple_CoTamTinh
   *
   * Calculates:
   * - giaSauOffUsd = donGiaWeb * soLuong * (1 - saleOff/100)
   * - tienCongVnd = depends on GiaTienCong (percentage or fixed per item)
   * - tongTienUsd = giaSauOffUsd * (1 + tax/100) + (shipUsa + phuThu) * soLuong
   * - tongTienVnd = tongTienUsd * tyGia + tienCongVnd
   */
  async createQuickOrderCoTamTinh(createQuickOrderDto: CreateQuickOrderDto): Promise<{ success: boolean; error?: string; tienCongVnd?: number; tongTienVnd?: number }> {
    try {
      const {
        websiteName = '',
        username = '',
        usernameSave = '',
        linkWeb,
        linkHinh = '',
        color = '',
        size = '',
        soLuong,
        donGiaWeb = 0,
        loaiTien = 'USD',
        ghiChu = '',
        tyGia = 1,
        saleOff = 0,
        hangKhoan = false,
        loaiHangId,
        maSoHang = '',
        quocGiaId,
        nguoiTao = '',
        cong = 0,
        shipUsa = 0,
        tax = 0,
        phuThu = 0,
      } = createQuickOrderDto;

      await this.sequelize.query(
        `EXEC dbo.SP_Them_DonHang_Simple_CoTamTinh
          @WebsiteName = :websiteName,
          @username = :username,
          @usernamesave = :usernameSave,
          @linkweb = :linkweb,
          @linkhinh = :linkhinh,
          @corlor = :corlor,
          @size = :size,
          @soluong = :soLuong,
          @dongiaweb = :donGiaWeb,
          @loaitien = :loaitien,
          @ghichu = :ghiChu,
          @tygia = :tyGia,
          @saleoff = :saleOff,
          @HangKhoan = :hangKhoan,
          @cong = :cong,
          @shipUSA = :shipUsa,
          @tax = :tax,
          @phuthu = :phuThu,
          @QuocGiaID = :quocGiaId`,
        {
          replacements: {
            websiteName: websiteName.replace(/'/g, "''"),
            username: username.replace(/'/g, "''"),
            usernameSave: usernameSave.replace(/'/g, "''"),
            linkweb: linkWeb.replace(/'/g, "''"),
            linkhinh: linkHinh.replace(/'/g, "''"),
            corlor: color.replace(/'/g, "''"),
            size: size.replace(/'/g, "''"),
            soLuong,
            donGiaWeb,
            loaitien: loaiTien,
            ghiChu: ghiChu.replace(/'/g, "''"),
            tyGia,
            saleOff,
            hangKhoan: hangKhoan ? 1 : 0,
            cong,
            shipUsa: shipUsa || null,
            tax,
            phuThu,
            quocGiaId: quocGiaId || null,
          },
          type: QueryTypes.RAW,
        },
      );

      // Log to system logs (giống QLDatHang_Them.cs)
      if (nguoiTao) {
        const noiDung = [
          `username: ${username}`,
          `linkweb: ${linkWeb}`,
          `linkhinh: ${linkHinh}`,
          `corlor: ${color}`,
          `size: ${size}`,
          `soluong: ${soLuong}`,
          `dongiaweb: ${donGiaWeb}`,
          `loaitien: ${loaiTien}`,
          `tygia: ${tyGia}`,
          `saleoff: ${saleOff}`,
          `cong: ${cong}`,
          `shipUSA: ${shipUsa}`,
          `tax: ${tax}`,
          `phuthu: ${phuThu}`,
        ].join('; ');

        await this.systemLogsService.create({
          nguoiTao,
          nguon: 'QLDatHang_Them:ThemDatHangSimpleCoTamTinh',
          hanhDong: 'Them moi',
          doiTuong: '',
          noiDung,
        });
      }

      return { success: true };
    } catch (error) {
      console.error('createQuickOrderCoTamTinh error:', error);
      throw new BadRequestException((error as any).message || 'Thêm đơn hàng thất bại');
    }
  }

  /**
   * Upload and resize image to 640x480 for EditOrderDetail.
   * Converted from EditOrderDetail.cs - fuHinhAnh upload logic.
   * Delegates to the shared ImageUploadService.
   */
  async uploadImage(_orderId: number, file: Express.Multer.File): Promise<{ linkHinh: string }> {
    return this.imageUploadService.upload(file);
  }

  /**
   * Upload and resize image for QLDatHang_Them (footer form).
   * Converted from QLDatHang_Them.cs - fuHinhAnh upload logic.
   */
  async uploadQuickOrderImage(file: Express.Multer.File): Promise<{ linkHinh: string }> {
    return this.imageUploadService.upload(file);
  }

  /**
   * Calculate service fee (GiaTienCong) for QLDatHang_Them
   * Converted from: QLDatHang_Them.cs - giaTienCong calculation
   *
   * If percentage-based: tienCongVnd = giaSauOffUsd * cong/100 * tyGia
   * If fixed: tienCongVnd = TienCong1Mon * soLuong
   */
  async calculateTienCong(params: {
    loaiTien: string;
    donGiaWeb: number;
    soLuong: number;
    saleOff: number;
    cong: number;
    tyGia: number;
    username: string;
    tax?: number;
    shipUsa?: number;
    phuThu?: number;
  }): Promise<{ tienCongVnd: number; giaSauOffUsd: number; tongTienUsd: number; tongTienVnd: number }> {
    const { loaiTien, donGiaWeb, soLuong, saleOff, cong, tyGia, username, tax = 0, shipUsa = 0, phuThu = 0 } = params;

    // giaSauOffUsd = (100 - saleOff) / 100 * donGiaWeb * soLuong
    const giaSauOffUsd = ((100 - saleOff) / 100) * donGiaWeb * soLuong;

    const giaTienCong = await this.getGiaTienCong(loaiTien, donGiaWeb, username);
    let tienCongVnd: number;

    if (giaTienCong.tinhTheoPhanTram) {
      tienCongVnd = giaSauOffUsd * cong / 100 * tyGia;
    } else {
      tienCongVnd = giaTienCong.tienCong1Mon * soLuong;
    }

    // tongTienUsd = giaSauOff + tax% + shipUsa/item + phuThu/item (mirrors old C# formula)
    const tongTienUsd = giaSauOffUsd + giaSauOffUsd * 0.01 * tax + shipUsa * soLuong + phuThu * soLuong;

    const tongTienVnd = Math.ceil(tongTienUsd * tyGia + tienCongVnd);

    return { tienCongVnd, giaSauOffUsd, tongTienUsd, tongTienVnd };
  }
  async createQuickOrder(createQuickOrderDto: CreateQuickOrderDto): Promise<{ success: boolean; error?: string }> {
    try {
      const {
        websiteName = '',
        username = '',
        usernameSave = '',
        linkWeb,
        linkHinh = '',
        color = '',
        size = '',
        soLuong,
        donGiaWeb = 0,
        loaiTien = 'USD',
        ghiChu = '',
        tyGia = 1,
        saleOff = 0,
        hangKhoan = false,
        loaiHangId,
        maSoHang = '',
        quocGiaId,
        nguoiTao = '',
      } = createQuickOrderDto;

      await this.sequelize.query(
        `EXEC dbo.SP_Them_DonHang_Simple
          @WebsiteName = :websiteName,
          @username = :username,
          @usernamesave = :usernameSave,
          @linkweb = :linkweb,
          @linkhinh = :linkhinh,
          @corlor = :color,
          @size = :size,
          @soluong = :soLuong,
          @dongiaweb = :donGiaWeb,
          @loaitien = :loaiTien,
          @ghichu = :ghiChu,
          @tygia = :tyGia,
          @saleoff = :saleOff,
          @HangKhoan = :hangKhoan,
          @LoaiHangID = :loaiHangId,
          @MaSoHang = :maSoHang,
          @QuocGiaID = :quocGiaId`,
        {
          replacements: {
            websiteName: websiteName.replace(/'/g, "''"),
            username: username.replace(/'/g, "''"),
            usernameSave: usernameSave.replace(/'/g, "''"),
            linkweb: linkWeb.replace(/'/g, "''"),
            linkhinh: linkHinh.replace(/'/g, "''"),
            color: color.replace(/'/g, "''"),
            size: size.replace(/'/g, "''"),
            soLuong,
            donGiaWeb,
            loaiTien,
            ghiChu: ghiChu.replace(/'/g, "''"),
            tyGia,
            saleOff,
            hangKhoan: hangKhoan ? 1 : 0,
            loaiHangId: loaiHangId || null,
            maSoHang: maSoHang,
            quocGiaId: quocGiaId || null,
          },
          type: QueryTypes.RAW,
        },
      );

      // Log to system logs (giống DatHangM.aspx - ThemDatHangSimple)
      if (nguoiTao) {
        const noiDung = [
          `username: ${username}`,
          `linkweb: ${linkWeb}`,
          `linkhinh: ${linkHinh}`,
          `corlor: ${color}`,
          `size: ${size}`,
          `soluong: ${soLuong}`,
          `dongiaweb: ${donGiaWeb}`,
          `loaitien: ${loaiTien}`,
          `tygia: ${tyGia}`,
          `saleoff: ${saleOff}`,
        ].join('; ');

        await this.systemLogsService.create({
          nguoiTao,
          nguon: 'DatHangM:ThemDatHangSimple',
          hanhDong: 'Them moi',
          doiTuong: '',
          noiDung,
        });
      }

      return { success: true };
    } catch (error) {
      console.error('createQuickOrder error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create multiple quick orders at once
   * Converted from: DatHangM.aspx - GuiYeuCau (loop through items)
   */
  async createQuickOrders(createQuickOrdersDto: CreateQuickOrdersDto, nguoiTao?: string): Promise<{ success: number; failed: number; errors: string[] }> {
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    const actorUsername = nguoiTao || '';

    for (const order of createQuickOrdersDto.orders) {
      const result = await this.createQuickOrder({
        ...order,
        username: order.username || actorUsername,
        usernameSave: actorUsername || order.usernameSave,
        nguoiTao: actorUsername,
      });
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
        errors.push(result.error || 'Unknown error');
      }
    }

    return { success: successCount, failed: failedCount, errors };
  }

  /**
   * Find all orders with filters and pagination
   * Uses SP_Lay_DonHang stored procedure (matching C# DBConnect.LayDanhSachDonHang)
   */
  /**
   * Bản đồ NhaCungCapID -> tên, nạp MỘT LẦN cho cả trang danh sách.
   *
   * Không join tbNhaCungCap vào `SP_Lay_DonHang`: SP đó là bản ASP cũ, trang
   * web ASP vẫn đang gọi chính nó, nên sửa SP là sửa cho hai hệ cùng lúc.
   * Danh mục NCC chỉ vài chục dòng, đọc cả bảng rẻ hơn hẳn một lần đổi SP.
   *
   * Lỗi đọc KHÔNG được làm vỡ danh sách đơn: nếu bảng chưa tồn tại (migration
   * chưa chạy) thì trả bản đồ rỗng, các dòng hiện "chưa rõ" chứ không 500.
   */
  private async banDoTenNcc(): Promise<Map<number, string>> {
    try {
      const rows = await this.sequelize.query<{ NhaCungCapID: number; TenNhaCungCap: string }>(
        `SELECT NhaCungCapID, TenNhaCungCap FROM dbo.tbNhaCungCap`,
        { type: QueryTypes.SELECT },
      );
      return new Map(rows.map((r) => [Number(r.NhaCungCapID), r.TenNhaCungCap]));
    } catch (error: any) {
      console.error('banDoTenNcc:', error?.message || error);
      return new Map();
    }
  }

  /**
   * `coGiaNcc` = người gọi có quyền lẻ `giaNcc`. MẶC ĐỊNH false, cố ý: SP dùng
   * `SELECT DH.*` nên sáu cột NCC_* tự chảy ra ngoài ngay khi migration chạy.
   * Mặc định mở thì mỗi chỗ gọi mới quên truyền là một chỗ lộ giá nhập.
   */
  async findAll(query: QueryOrderDto, coGiaNcc = false): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const { website, username, status, statuses, search, startDate, endDate, page = 1, limit = 20, includeDeleted = false, quocGiaId, ids } = query;

    // Cap limit to 500 max to match @Max(500) validation
    const safeLimit = Math.min(limit, 10000);

    const danhSachMa = this.tachDanhSachMa(search);

    try {
      // Build status string for SP (e.g., "'Received','Confirmed'")
      let trangthaiOrder = '';
      if (statuses && statuses.length > 0) {
        trangthaiOrder = statuses.map(s => `'${s}'`).join(',');
      } else if (status) {
        trangthaiOrder = `'${status}'`;
      }

      // Execute stored procedure matching C# DBConnect.LayDanhSachDonHang
      const results = await this.sequelize.query(
        `EXEC SP_Lay_DonHang
          @WebsiteName = :website,
          @username = :username,
          @trangthaiOrder = :trangthaiOrder,
          @NoiDungTim = :search,
          @TimTheo = -1,
          @MaDatHang = :MaDatHang,
          @TenDotHang = '',
          @HangKhoan = 0,
          @QuocGiaID = :quocGiaId,
          @PageSize = :limit,
          @PageNum = :page,
          @DaXoa = :includeDeleted,
          @TuNgay = :startDate,
          @DenNgay = :endDate,
          @DanhSachMa = :DanhSachMa`,
        {
          replacements: {
            website: website || '',
            username: username || '',
            trangthaiOrder,
            // Dán nhiều mã vào ô Filter thì chuyển sang khớp chính xác theo
            // danh sách; một giá trị thì vẫn đi đường LIKE như cũ.
            search: danhSachMa ? '' : search || '',
            DanhSachMa: danhSachMa,
            // Ô "Mã đặt hàng" của màn /admin/orders/list. Trước truyền cứng chuỗi
            // rỗng nên gõ mã vào đó KHÔNG lọc gì — danh sách trả về y như không
            // gõ, mà ô vẫn hiện nên người dùng tưởng mình tra sai mã.
            // getQLDatHangList gọi ĐÚNG SP này và vẫn truyền `ids` vào
            // @MaDatHang từ trước, nên đây chỉ là chỗ này quên.
            MaDatHang: this.locMaDatHang(ids),
            quocGiaId: quocGiaId || -1,
            limit: safeLimit,
            page,
            includeDeleted: includeDeleted,
            startDate: startDate || '',
            endDate: endDate || '',
          },
          type: 'SELECT' as const,
        },
      );

      // SP returns multiple result sets: [count, data, ...]
      const data = Array.isArray(results) ? results : [];

      // Extract total from first result (SP returns total count in first table)
      const firstItem = data.length > 0 ? data[0] as any : null;
      const total = firstItem?.TotalCount ? Number(firstItem.TotalCount) : (firstItem?.Total ? Number(firstItem.Total) : data.length);

      // Map SQL column names to camelCase for frontend (matching existing mapping)
      const mappedData = (data.slice(1) || []).map((row: any) => ({
        id: row.ID,
        orderNumber: row.ordernumber,
        username: row.username,
        usernameSave: row.usernamesave,
        linkWeb: row.linkweb,
        linkHinh: row.linkhinh,
        color: row.corlor,
        size: row.size,
        soLuong: row.soluong,
        donGiaWeb: row.dongiaweb,
        saleOff: row.saleoff,
        phuThu: row.phuthu,
        shipUsa: row.shipUSA,
        tax: row.tax,
        cong: row.cong,
        loaiTien: row.loaitien,
        ghiChu: row.ghichu,
        tyGia: row.tygia,
        giaSauOffUsd: row.giasauoffUSD,
        giaSauOffVnd: row.giasauoffVND,
        tienCongUsd: row.tiencongUSD,
        tienCongVnd: row.tiencongVND,
        tongTienUsd: row.tongtienUSD,
        tongTienVnd: row.tongtienVND,
        trangThaiOrder: row.trangthaiOrder,
        adminNote: row.AdminNote,
        ngayVeVn: row.ngayveVN,
        ngaySaveLink: row.ngaysaveLink || null,
        ngayMuaHang: row.ngaymuahang || null,
        ngayHoanThanh: row.NgayHoanThanh || null,
        namTaiChinh: row.nam_taichinh,
        websiteName: row.WebsiteName,
        tenDotHang: row.TenDotHang,
        yeuCauGuiHang: row.YeuCauGuiHang,
        daQuaHanMuc: row.DaQuaHanMuc,
        laKhachVip: row.LaKhachVip,
        ngayYeuCauGuiHang: row.NgayYeuCauGuiHang,
        yeuCauGuiGhiChu: row.YeuCauGui_GhiChu,
        guiHangSoKg: row.GuiHang_SoKg,
        guiHangTien: row.GuiHang_Tien,
        loaiHangId: row.LoaiHangID,
        tenLoaiHang: row.TenLoaiHang,
        canHangSoKg: row.CanHang_SoKg,
        canHangTienShipVeVn: row.CanHang_TienShipVeVN,
        canHangTienShipTrongNuoc: row.CanHang_TienShipTrongNuoc,
        hangKhoan: row.HangKhoan,
        maSoHang: row.MaSoHang,
        quocGiaId: row.QuocGiaID,
        tenQuocGia: row.TenQuocGia,
        linkTaiKhoanMang: row.LinkTaiKhoanMang,
        vungMien: row.VungMien,
        nguoiTao: row.nguoiTao,
        isDeleted: row.DaXoa,
        // Khối nhà cung cấp giữ NGUYÊN tên cột CSDL (NCC_*) chứ không đổi sang
        // camelCase như các trường trên. Cố ý: `cheNcc` xoá theo đúng danh sách
        // khoá đó, nên một tên duy nhất cho cả `GET /orders/:id` (trả dòng thô)
        // và đường này là thứ bảo đảm không có khoá nào sót lại chưa được che.
        NCC_ID: row.NCC_ID ?? null,
        NCC_NgoaiTe: row.NCC_NgoaiTe ?? null,
        NCC_Cong: row.NCC_Cong ?? null,
        NCC_TyGia: row.NCC_TyGia ?? null,
        NCC_TongPhaiTra: row.NCC_TongPhaiTra ?? null,
        NCC_Tracking: row.NCC_Tracking ?? null,
      }));

      if (!coGiaNcc) {
        return { data: cheNccDanhSach(mappedData), total, page, limit: safeLimit };
      }

      const tenNcc = await this.banDoTenNcc();
      return {
        data: mappedData.map((r) => ganNcc(r, tenNcc)),
        total,
        page,
        limit: safeLimit,
      };
    } catch (error: any) {
      console.error('Error in findAll (SP_Lay_DonHang):', error?.message || error);
      return {
        data: [],
        total: 0,
        page,
        limit: safeLimit,
      };
    }
  }

  /**
   * Find order by ID using stored procedure
   */
  async findOne(id: number, includeDeleted = false, coGiaNcc = false): Promise<any> {
    try {
      const [result]: any[] = await this.sequelize.query(
        `EXEC SP_Lay_DonHangByID @ID=${id}`
      );

      if (!result || result.length === 0) {
        throw new NotFoundException(`Order with ID ${id} not found`);
      }

      const order = result[0];

      if (!includeDeleted && order.DaXoa) {
        throw new NotFoundException(`Order with ID ${id} not found`);
      }

      // SP trả `SELECT DH.*` nên sáu cột NCC_* có sẵn trong dòng này. Người
      // không có quyền `giaNcc` phải nhận dòng ĐÃ XOÁ các khoá đó — ẩn ô trên
      // web là không đủ, mở tab Network ra là đọc được giá nhập.
      if (!coGiaNcc) return cheNcc(order);
      return ganNcc(order, await this.banDoTenNcc());
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error in findOne:', error.message);
      throw new NotFoundException(`Order with ID ${id} not found`);
    }
  }

  /**
   * Get orders for QLDatHang_LietKe (Order Management List)
   * Converted from: QLDatHang_LietKe.cs - LoadDanhSachDonHang()
   *
   * Default filters:
   * - status = 'Received' (hardcoded like C#)
   * - DaXoa = 0 (not deleted)
   * - pageSize = 2000
   * - order by ID DESC
   *
   * @param query - Query parameters matching QLDatHang_LietKe filters
   * @returns QLDatHangResponseDto - { totalItem, danhSachDonHang, page, limit }
   */
  async getQLDatHangList(query: QueryQLDatHangDto, coGiaNcc = false): Promise<QLDatHangResponseDto> {
    const {
      website,
      username,
      status,
      statuses,
      search,
      ids,
      quocGiaId,
      startDate,
      endDate,
      page = 1,
      limit = 2000,
      daXoa = 0,
    } = query;

    try {
      const allowedStatuses = new Set(Object.values(OrderStatus));
      const buildStatusFilter = (values: string[]) =>
        values.filter((value) => allowedStatuses.has(value as OrderStatus)).map((value) => `'${value}'`).join(',');
      let trangthaiOrder = "'Received'";

      if (Array.isArray(statuses)) {
        trangthaiOrder = buildStatusFilter(statuses);
      } else if (status) {
        trangthaiOrder = buildStatusFilter([status]);
      }

      // Gọi stored procedure SP_Lay_DonHang giống C# DBConnect.LayDanhSachDonHang()
      const results = await this.sequelize.query(
        `EXEC dbo.SP_Lay_DonHang
          @WebsiteName = :website,
          @username = :username,
          @trangthaiOrder = :trangthaiOrder,
          @NoiDungTim = :NoiDungTim,
          @TimTheo = -1,
          @MaDatHang = :MaDatHang,
          @TenDotHang = '',
          @HangKhoan = -1,
          @QuocGiaID = :QuocGiaID,
          @DaXoa = :DaXoa,
          @TuNgay = :TuNgay,
          @DenNgay = :DenNgay,
          @PageSize = :PageSize,
          @PageNum = :PageNum`,
        {
          replacements: {
            website: website || '',
            username: username || '',
            trangthaiOrder,
            NoiDungTim: search || '',
            MaDatHang: ids || '',
            QuocGiaID: quocGiaId && quocGiaId > 0 ? quocGiaId : -1,
            DaXoa: daXoa,
            TuNgay: startDate || '',
            DenNgay: endDate || '',
            PageSize: limit,
            PageNum: page,
          },
          type: QueryTypes.SELECT,
        }
      );

      // SP_Lay_DonHang trả về: [ { TOTALROW: 50 }, [{row1}, {row2}, ...] ]
      const resultsAny = results as any;
      const totalItem = resultsAny[0]?.TOTALROW || 0;
      const rawData = resultsAny.slice(1) || [];

      // Map data to match Order interface
      const danhSachDonHang = rawData.map((row: any) => ({
        id: row.ID,
        orderNumber: row.ordernumber,
        username: row.username,
        usernameSave: row.usernamesave,
        linkWeb: row.linkweb,
        linkHinh: row.linkhinh,
        color: row.corlor,
        size: row.size,
        soLuong: row.soluong,
        donGiaWeb: row.dongiaweb,
        saleOff: row.saleoff,
        phuThu: row.phuthu,
        shipUsa: row.shipUSA,
        tax: row.tax,
        cong: row.cong,
        loaiTien: row.loaitien,
        ghiChu: row.ghichu,
        tyGia: row.tygia,
        giaSauOffUsd: row.giasauoffUSD,
        giaSauOffVnd: row.giasauoffVND,
        tienCongUsd: row.tiencongUSD,
        tienCongVnd: row.tiencongVND,
        tongTienUsd: row.tongtienUSD,
        tongTienVnd: row.tongtienVND,
        trangThaiOrder: row.trangthaiOrder,
        adminNote: row.AdminNote,
        ngayVeVn: row.ngayveVN,
        ngaySaveLink: row.ngaysaveLink,
        ngayMuaHang: row.ngaymuahang,
        ngayHoanThanh: row.NgayHoanThanh || null,
        namTaiChinh: row.nam_taichinh,
        websiteName: row.WebsiteName,
        tenDotHang: row.TenDotHang,
        yeuCauGuiHang: row.YeuCauGuiHang,
        daQuaHanMuc: row.DaQuaHanMuc,
        laKhachVip: row.LaKhachVip,
        ngayYeuCauGuiHang: row.NgayYeuCauGuiHang,
        yeuCauGuiGhiChu: row.YeuCauGui_GhiChu,
        guiHangSoKg: row.GuiHang_SoKg,
        guiHangTien: row.GuiHang_Tien,
        loaiHangId: row.LoaiHangID,
        tenLoaiHang: row.TenLoaiHang,
        canHangSoKg: row.CanHang_SoKg,
        canHangTienShipVeVn: row.CanHang_TienShipVeVN,
        canHangTienShipTrongNuoc: row.CanHang_TienShipTrongNuoc,
        hangKhoan: row.HangKhoan,
        maSoHang: row.MaSoHang,
        quocGiaId: row.QuocGiaID,
        tenQuocGia: row.TenQuocGia,
        linkTaiKhoanMang: row.LinkTaiKhoanMang,
        vungMien: row.VungMien,
        // Xem ghi chú cùng chỗ trong `findAll` về việc giữ tên cột NCC_*.
        NCC_ID: row.NCC_ID ?? null,
        NCC_NgoaiTe: row.NCC_NgoaiTe ?? null,
        NCC_Cong: row.NCC_Cong ?? null,
        NCC_TyGia: row.NCC_TyGia ?? null,
        NCC_TongPhaiTra: row.NCC_TongPhaiTra ?? null,
        NCC_Tracking: row.NCC_Tracking ?? null,
      }));

      if (!coGiaNcc) {
        return { totalItem, danhSachDonHang: cheNccDanhSach(danhSachDonHang), page, limit };
      }

      const tenNcc = await this.banDoTenNcc();
      return {
        totalItem,
        danhSachDonHang: danhSachDonHang.map((r: any) => ganNcc(r, tenNcc)),
        page,
        limit,
      };
    } catch (error) {
      console.error('Error in getQLDatHangList:', error);
      throw error;
    }
  }

  /**
   * Update order using SP_CapNhatDonHangSimpleCoTamTinh (inline edit from QLDatHang_LietKe)
   * Converted from: QLDatHang_LietKe.cs - gvDonHang_RowUpdating
   * Uses stored procedure: SP_CapNhatDonHangSimpleCoTamTinh
   *
   * Calculates:
   * - giaSauOffUsd = donGiaWeb * soLuong * (1 - saleOff/100)
   * - tienCongVnd = depends on GiaTienCong (percentage or fixed per item)
   * - tongTienUsd = giaSauOffUsd * (1 + tax/100) + (shipUsa + phuThu) * soLuong
   * - tongTienVnd = tongTienUsd * tyGia + tienCongVnd
   */
  async update(id: number, updateOrderDto: UpdateOrderDto, actorUsername = ''): Promise<Order> {
    const order = await this.findOne(id);

    // Build old data for logging
    const oldDataStr = `Website: ${order.websiteName}, Username: ${order.username}, Link: ${order.linkWeb}, SL: ${order.soLuong}, Gia: ${order.donGiaWeb}`;

    const {
      websiteName = order.websiteName || '',
      username = order.username || '',
      linkWeb = '',
      linkHinh = '',
      color = '',
      size = '',
      soLuong = order.soLuong || 1,
      donGiaWeb = order.donGiaWeb || 0,
      loaiTien = order.loaiTien || 'USD',
      ghiChu = (updateOrderDto as any).ghiChu ?? order.ghiChu ?? '',
      tyGia = order.tyGia || 1,
      saleOff = 0,
      cong = 0,
      shipUsa = 0,
      tax = 0,
      phuThu = 0,
      quocGiaId,
      usernameSave = '',
    } = updateOrderDto as any;

    // Ưu tiên usernameSave từ body (FE chủ động set, e.g. legacy parity);
    // fallback sang actor đăng nhập từ JWT để SP nhận đúng `@NguoiTao` thay vì 'system'.
    const effectiveUsernameSave = usernameSave || actorUsername || '';

    await this.sequelize.query(
      `EXEC dbo.SP_CapNhatDonHangSimpleCoTamTinh
        @ID = :id,
        @WebsiteName = :websiteName,
        @username = :username,
        @linkweb = :linkweb,
        @linkhinh = :linkhinh,
        @corlor = :corlor,
        @size = :size,
        @soluong = :soLuong,
        @dongiaweb = :donGiaWeb,
        @loaitien = :loaiTien,
        @ghichu = :ghiChu,
        @tygia = :tyGia,
        @saleoff = :saleOff,
        @cong = :cong,
        @shipUSA = :shipUsa,
        @tax = :tax,
        @phuthu = :phuThu,
        @QuocGiaID = :quocGiaId,
        @NguoiTao = :usernameSave`,
      {
        replacements: {
          id,
          websiteName: (websiteName || '').toString().replace(/'/g, "''"),
          username: (username || '').toString().replace(/'/g, "''"),
          linkweb: (linkWeb || '').toString().replace(/'/g, "''"),
          linkhinh: (linkHinh || '').toString().replace(/'/g, "''"),
          corlor: (color || '').toString().replace(/'/g, "''"),
          size: (size || '').toString().replace(/'/g, "''"),
          soLuong,
          donGiaWeb,
          loaiTien: (loaiTien || 'USD').toString().replace(/'/g, "''"),
          ghiChu: (ghiChu || '').toString().replace(/'/g, "''"),
          tyGia,
          saleOff,
          cong,
          shipUsa: shipUsa || null,
          tax,
          phuThu,
          quocGiaId: quocGiaId || null,
          usernameSave: effectiveUsernameSave.toString().replace(/'/g, "''"),
        },
        type: QueryTypes.RAW,
      },
    );

    // Log the update action
    const newDataStr = `Website: ${websiteName}, Username: ${username}, Link: ${linkWeb}, SL: ${soLuong}, Gia: ${donGiaWeb}`;
    await this.systemLogsService.create({
      nguoiTao: effectiveUsernameSave || 'system',
      nguon: 'QLDatHang_LietKe:CapNhatDonHangSimpleCoTamTinh',
      hanhDong: 'Chinh sua',
      doiTuong: id.toString(),
      noiDung: `Old: ${oldDataStr} | New: ${newDataStr}`,
    });

    // Reload order from DB after SP update
    return this.findOne(id);
  }

  /**
   * Soft delete order
   */
  async remove(id: number, nguoiTao = 'system'): Promise<void> {
    const order = await this.findOne(id);
    await order.update({ DaXoa: true });

    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'EditOrder:XoaDonHang',
      hanhDong: 'Xoa',
      doiTuong: '',
      noiDung: `ID: ${id}`,
    });
  }

  /**
   * Mass soft delete orders using stored procedure (same as EditOrder logic)
   */
  async massDelete(massDeleteDto: MassDeleteDto, nguoiTao = 'system'): Promise<{ deleted: number }> {
    const { ids } = massDeleteDto;

    // Check kỳ đóng (giống EditOrder KiemTraDuocCapNhatCongNo)
    const ngayGhiNo = new Date().toISOString().split('T')[0];
    const [checkResult]: any[] = await this.sequelize.query(
      `DECLARE @ret int; EXEC @ret = dbo.SP_KiemTra_DuocCapNhatCongNo @NgayGhiNo = :ngayGhiNo, @UserName = :username; SELECT @ret AS DuocCapNhat`,
      {
        replacements: { ngayGhiNo, username: nguoiTao || '' },
        type: QueryTypes.RAW,
      }
    );
    const checkDataRaw = Array.isArray(checkResult) && checkResult.length > 0 ? checkResult[0] as any : { DuocCapNhat: -1 };
    const checkValue = checkDataRaw?.DuocCapNhat ?? -1;

    if (checkValue !== 0) {
      throw new BadRequestException('Kỳ đã đóng không thể thực hiện cancel');
    }

    // SP_CapNhat_MassCancel1: @id, @NguoiTao (không có @ghichu)
    try {
      await this.sequelize.query(
        `EXEC dbo.SP_CapNhat_MassCancel1 @id = :ids, @NguoiTao = :username`,
        {
        replacements: { ids: ids.join(','), username: nguoiTao || '' },
          type: QueryTypes.RAW,
        }
      );
    } catch (error) {
      console.error('MassCancel1 error:', error);
      throw new BadRequestException('Failed to mass delete orders');
    }

    // Get order info before returning (for notifications)
    const cancelledOrders = await this.getOrdersInfo(ids);

    // Log the mass delete action
    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'EditOrder:MassCancel1',
      hanhDong: 'Chinh sua',
      doiTuong: '',
      noiDung: `ID: ${ids.join(',')}`,
    });

    // Notify each order's user that their order was cancelled
    this.notifyOrderUsers(
      cancelledOrders,
      'Đơn hàng đã bị hủy',
      (o) => `Đơn hàng #${o.orderNumber} của bạn đã bị hủy bởi admin.`,
      cancelledOrders.map((o) => o.id),
      nguoiTao,
    );

    return { deleted: ids.length };
  }

  /**
   * Mass cancel orders với ghi chú lý do hủy (legacy parity với QLDatHang_LietKe).
   * Converted from: QLDatHang_LietKe.cs -> QLDatHang_MassCancel.aspx -> DBConnect.MassCancel
   * Calls: SP_CapNhat_MassCancel(@id, @ghichu, @NguoiTao)
   *
   * Khác massDelete (SP_CapNhat_MassCancel1) ở chỗ append `ghichu` vào field `ghichu` của DON_HANG.
   */
  async massCancel(dto: MassCancelDto, nguoiTao = 'system'): Promise<{ cancelled: number }> {
    const { ids, ghiChu = '' } = dto;

    // Check kỳ đóng (giống legacy EditOrder.cs:406 KiemTraDuocCapNhatCongNo)
    const ngayGhiNo = new Date().toISOString().split('T')[0];
    const [checkResult]: any[] = await this.sequelize.query(
      `DECLARE @ret int; EXEC @ret = dbo.SP_KiemTra_DuocCapNhatCongNo @NgayGhiNo = :ngayGhiNo, @UserName = :username; SELECT @ret AS DuocCapNhat`,
      {
        replacements: { ngayGhiNo, username: nguoiTao || '' },
        type: QueryTypes.RAW,
      },
    );
    const checkValue = (Array.isArray(checkResult) && checkResult.length > 0 ? (checkResult[0] as any).DuocCapNhat : -1) ?? -1;
    if (checkValue !== 0) {
      throw new BadRequestException('Kỳ đã đóng không thể thực hiện cancel');
    }

    try {
      await this.sequelize.query(
        `EXEC dbo.SP_CapNhat_MassCancel @id = :ids, @ghichu = :ghichu, @NguoiTao = :username`,
        {
          replacements: { ids: ids.join(','), ghichu: ghiChu, username: nguoiTao || '' },
          type: QueryTypes.RAW,
        },
      );
    } catch (error) {
      console.error('MassCancel error:', error);
      throw new BadRequestException('Failed to mass cancel orders');
    }

    // Log legacy parity: HanhDong='Xoa', DoiTuong=ids csv, NoiDung="ID: " + ids csv
    // (giống QLDatHang_MassCancel.cs:37 - ThemSystemLogs với HanhDong.Xoa)
    const idsCsv = ids.join(',');
    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'QLDatHang_MassCancel:MassCancel',
      hanhDong: 'Xoa',
      doiTuong: idsCsv,
      noiDung: `ID: ${idsCsv}`,
    });

    // V2 enhancement (legacy KHÔNG có): notify chủ đơn về việc hủy
    const cancelledOrders = await this.getOrdersInfo(ids);
    this.notifyOrderUsers(
      cancelledOrders,
      'Đơn hàng đã bị hủy',
      (o) => `Đơn hàng #${o.orderNumber} của bạn đã bị hủy bởi admin${ghiChu ? `: ${ghiChu}` : ''}.`,
      cancelledOrders.map((o) => o.id),
      nguoiTao,
    );

    return { cancelled: ids.length };
  }

  /**
   * Mass complete orders using stored procedure (giống EditOrder logic)
   */
  async massComplete(
    ids: string,
    nguoiTao = 'system',
    nguon = 'EditOrder',
    ngayHoanThanh?: string,
  ): Promise<{ completed: number }> {
    // SP_CapNhat_MassComplete: @id (comma-separated IDs), @NgayHoanThanh (DATE, optional)
    // Accept dd/mm/yyyy hoặc ISO; normalize -> YYYY-MM-DD cho MSSQL
    const parsedNgay = this.parseToIsoDate(ngayHoanThanh);
    try {
      await this.sequelize.query(
        `EXEC dbo.SP_CapNhat_MassComplete @id = :ids, @NgayHoanThanh = :ngayHoanThanh`,
        {
          replacements: { ids, ngayHoanThanh: parsedNgay },
          type: QueryTypes.RAW,
        },
      );
    } catch (error) {
      console.error('MassComplete error:', error);
      throw new BadRequestException('Failed to mass complete orders');
    }

    const idList = ids.split(',').map(Number);
    const completedOrders = await this.getOrdersInfo(idList);

    // System log (giống EditOrder)
    await this.systemLogsService.create({
      nguoiTao: nguoiTao || 'system',
      nguon: nguon === 'CanHang' ? 'CanHang:MassComplete' : 'EditOrder:MassComplete',
      hanhDong: 'Chinh sua',
      doiTuong: '',
      noiDung: `ID: ${ids}`,
    });

    // Notify each order's user that their order is completed
    this.notifyOrderUsers(
      completedOrders,
      'Đơn hàng hoàn thành',
      (o) => `Đơn hàng #${o.orderNumber} của bạn đã hoàn thành.`,
      completedOrders.map((o) => o.id),
      nguoiTao || 'system',
    );

    return { completed: idList.length };
  }

  /**
   * Mass received orders using stored procedure (giống EditOrder logic)
   * Converted from: EditOrder.cs - lbtMassReceived_Click
   * Calls: SP_CapNhat_MassReceived (@id, @NguoiTao)
   */
  async massReceived(ids: string, nguoiTao = 'system'): Promise<{ received: number }> {
    // Check kỳ đóng trước khi thực hiện (giống code cũ)
    const [checkResult]: any[] = await this.sequelize.query(
      `DECLARE @ret int; EXEC @ret = dbo.SP_KiemTra_DuocCapNhatCongNo @NgayGhiNo = :ngayGhiNo, @UserName = :username; SELECT @ret AS DuocCapNhat`,
      {
        replacements: { ngayGhiNo: new Date().toISOString().split('T')[0], username: '' },
        type: QueryTypes.RAW,
      },
    );
    const checkDataRaw = Array.isArray(checkResult) && checkResult.length > 0 ? checkResult[0] as any : { DuocCapNhat: -1 };
    const checkValue = checkDataRaw?.DuocCapNhat ?? -1;

    if (checkValue !== 0) {
      throw new BadRequestException('Kỳ đã đóng không thể thực hiện mass received');
    }

    // Call stored procedure SP_CapNhat_MassReceived
    try {
      await this.sequelize.query(`EXEC dbo.SP_CapNhat_MassReceived @id = :ids, @NguoiTao = :nguoiTao`, {
        replacements: { ids, nguoiTao: nguoiTao || '' },
        type: QueryTypes.RAW,
      });
    } catch (error) {
      console.error('MassReceived error:', error);
      throw new BadRequestException('Failed to mass received orders');
    }

    const receivedIds = ids.split(',').map(Number);
    const receivedOrders = await this.getOrdersInfo(receivedIds);

    // System log (giống EditOrder)
    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'EditOrder:MassReceived',
      hanhDong: 'Chinh sua',
      doiTuong: '',
      noiDung: `ID: ${ids}`,
    });

    // Notify each order's user that their order has been received in Vietnam
    this.notifyOrderUsers(
      receivedOrders,
      'Đơn hàng đã về VN',
      (o) => `Đơn hàng #${o.orderNumber} của bạn đã nhận hàng về Việt Nam.`,
      receivedOrders.map((o) => o.id),
      nguoiTao,
    );

    return { received: receivedIds.length };
  }

  /**
   * Mass shipped orders using stored procedure (giống EditOrder logic)
   * Converted from: EditOrder.cs - lbtMassShipped_Click + DBConnect.MassShipped
   * Calls: SP_CapNhat_MassShipped (@id)
   * Note: Không check kỳ đóng (giống code cũ)
   */
  async massShipped(ids: string, nguoiTao = 'system', nguon = 'EditOrder'): Promise<{ shipped: number }> {
    // Call stored procedure SP_CapNhat_MassShipped
    try {
      await this.sequelize.query(`EXEC dbo.SP_CapNhat_MassShipped @id = :ids`, {
        replacements: { ids },
        type: QueryTypes.RAW,
      });
    } catch (error) {
      console.error('MassShipped error:', error);
      throw new BadRequestException('Failed to mass shipped orders');
    }

    const shippedIds = ids.split(',').map(Number);
    const shippedOrders = await this.getOrdersInfo(shippedIds);

    // System log (giống EditOrder)
    await this.systemLogsService.create({
      nguoiTao,
      nguon: nguon === 'CanHang' ? 'CanHang:MassShipped' : 'EditOrder:MassShipped',
      hanhDong: 'Chinh sua',
      doiTuong: '',
      noiDung: `ID: ${ids}`,
    });

    // Notify each order's user that their order has been shipped
    this.notifyOrderUsers(
      shippedOrders,
      'Đơn hàng đã ship',
      (o) => `Đơn hàng #${o.orderNumber} của bạn đã được ship.`,
      shippedOrders.map((o) => o.id),
      nguoiTao,
    );

    return { shipped: shippedIds.length };
  }

  /**
   * Mass update orders
   * Converted from QLDatHang_MassUpdate.cs - btShare_Click -> DBConnect.ShareOrders
   * Uses stored procedure SP_ShareOrders
   */
  async massUpdate(massUpdateDto: MassUpdateDto): Promise<{ updated: number }> {
    const { items, username: nguoiTao } = massUpdateDto;
    const ids = items.map(item => item.id).join(',');

    // Get first item to get common values (for batch updates, all items share same values)
    const firstItem = items[0];
    if (!firstItem) {
      return { updated: 0 };
    }

    const {
      id, // exclude id from update data
      orderNumber,
      tyGia = 0,
      cong = 0,
      saleOff = 0,
      phuThu = 0,
      shipUsa = 0,
      tax = 0,
      totalCharged = 0,
      totalItem = 0,
      heThongTuTinhCong = false,
      trangThaiOrder,
      adminNote,
    } = firstItem;

    try {
      // Call the stored procedure SP_ShareOrders
      // This matches the C# logic in DBConnect.ShareOrders()
      await this.sequelize.query(
        `EXEC dbo.SP_ShareOrders
          @id = :ids,
          @ordernumber = :orderNumber,
          @cong = :cong,
          @saleoff = :saleOff,
          @phuthu = :phuThu,
          @shipUSA = :shipUsa,
          @tax = :tax,
          @TotalCharged = :totalCharged,
          @TotalItem = :totalItem,
          @HeThongTuTinhCong = :heThongTuTinhCong,
          @tygia = :tyGia,
          @NguoiTao = :nguoiTao`,
        {
          replacements: {
            ids,
            orderNumber: orderNumber || '',
            cong,
            saleOff,
            phuThu,
            shipUsa,
            tax,
            totalCharged,
            totalItem,
            heThongTuTinhCong,
            tyGia,
            nguoiTao: nguoiTao || 'system',
          },
          type: QueryTypes.RAW,
        },
      );

      // Log the action
      console.log(`[massUpdate] Updated orders: ${ids}`);

      return { updated: items.length };
    } catch (error) {
      console.error('[massUpdate] Error:', error);
      throw new Error(`Failed to mass update orders: ${error.message}`);
    }
  }

  /**
   * Restore soft-deleted order
   */
  async restore(id: number, nguoiTao = 'system'): Promise<Order> {
    const order = await this.orderModel.findByPk(id);

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const restored = await order.update({ DaXoa: false });

    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'OrderDaXoa:KhoiPhucDonHang',
      hanhDong: 'Chinh sua',
      doiTuong: String(id),
      noiDung: `OrderID: ${id}`,
    }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

    return restored;
  }

  /**
   * Batch restore multiple deleted orders
   */
  async batchRestore(ids: number[], nguoiTao = 'system'): Promise<{ success: boolean; count: number }> {
    try {
      const [updated] = await this.orderModel.update(
        { DaXoa: false },
        { where: { id: { [Op.in]: ids }, DaXoa: true } }
      );

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'OrderDaXoa:KhoiPhucHangLoat',
        hanhDong: 'Chinh sua',
        doiTuong: ids.join(','),
        noiDung: `KhoiPhuc: ${updated} don hang; IDs: ${ids.join(', ')}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return { success: true, count: updated };
    } catch (error: any) {
      console.error('Error in batchRestore:', error.message);
      return { success: false, count: 0 };
    }
  }

  /**
   * Permanently delete an order (vĩnh viễn xóa)
   */
  async permanentDelete(id: number, nguoiTao = 'system'): Promise<{ success: boolean }> {
    try {
      await this.orderModel.destroy({ where: { id }, force: true });

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'OrderDaXoa:XoaVinhVien',
        hanhDong: 'Xoa',
        doiTuong: String(id),
        noiDung: `XoaVinhVien OrderID: ${id}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return { success: true };
    } catch (error: any) {
      console.error('Error in permanentDelete:', error.message);
      return { success: false };
    }
  }

  /**
   * Mass cancel orders
   */
  async batchCancel(ids: number[], nguoiTao = 'system'): Promise<{ success: boolean; count: number }> {
    try {
      const [updated] = await this.orderModel.update(
        { trangThaiOrder: 'Cancelled' },
        { where: { id: { [Op.in]: ids }, DaXoa: true } }
      );

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'OrderDaXoa:HuyHangLoat',
        hanhDong: 'Chinh sua',
        doiTuong: ids.join(','),
        noiDung: `Huy: ${updated} don hang; IDs: ${ids.join(', ')}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return { success: true, count: updated };
    } catch (error: any) {
      console.error('Error in batchCancel:', error.message);
      return { success: false, count: 0 };
    }
  }

  /**
   * Mass complete orders (only Ordered/Shipped can be completed)
   */
  async batchComplete(ids: number[], nguoiTao = 'system'): Promise<{ success: boolean; count: number; message?: string }> {
    try {
      // Only update orders that are Ordered or Shipped
      const [updated] = await this.orderModel.update(
        { trangThaiOrder: 'Completed' },
        { where: { id: { [Op.in]: ids }, DaXoa: true, trangThaiOrder: { [Op.in]: ['Ordered', 'Shipped'] } } }
      );

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'OrderDaXoa:HoanThanhHangLoat',
        hanhDong: 'Chinh sua',
        doiTuong: ids.join(','),
        noiDung: `HoanThanh: ${updated} don hang; IDs: ${ids.join(', ')}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return { success: true, count: updated };
    } catch (error: any) {
      console.error('Error in batchComplete:', error.message);
      return { success: false, count: 0 };
    }
  }

  /**
   * Mass set orders to Received status
   */
  async batchReceived(ids: number[], nguoiTao = 'system'): Promise<{ success: boolean; count: number }> {
    try {
      const [updated] = await this.orderModel.update(
        { trangThaiOrder: 'Received' },
        { where: { id: { [Op.in]: ids }, DaXoa: true } }
      );

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'OrderDaXoa:DaNhanHangLoat',
        hanhDong: 'Chinh sua',
        doiTuong: ids.join(','),
        noiDung: `DaNhan: ${updated} don hang; IDs: ${ids.join(', ')}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return { success: true, count: updated };
    } catch (error: any) {
      console.error('Error in batchReceived:', error.message);
      return { success: false, count: 0 };
    }
  }

  /**
   * Mass set orders to Shipped status
   */
  async batchShipped(ids: number[], nguoiTao = 'system'): Promise<{ success: boolean; count: number }> {
    try {
      const [updated] = await this.orderModel.update(
        { trangThaiOrder: 'Shipped' },
        { where: { id: { [Op.in]: ids }, DaXoa: true } }
      );

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'OrderDaXoa:DaShipHangLoat',
        hanhDong: 'Chinh sua',
        doiTuong: ids.join(','),
        noiDung: `DaShip: ${updated} don hang; IDs: ${ids.join(', ')}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return { success: true, count: updated };
    } catch (error: any) {
      console.error('Error in batchShipped:', error.message);
      return { success: false, count: 0 };
    }
  }

  /**
   * Find all deleted orders with filters and pagination
   *
   * Converted from OrderDaXoa.aspx.cs - LoadDanhSachDonHangDaXoa()
   */
  async findDeleted(query: QueryOrderDto): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const { website, username, status, statuses, search, startDate, endDate, quocGiaId, page = 1, limit = 20, orderId } = query;

    const safeLimit = Math.min(limit, 500);
    try {
      let trangthaiOrder = '';
      if (statuses && statuses.length > 0) {
        trangthaiOrder = statuses.map((s) => `'${s}'`).join(',');
      } else if (status) {
        trangthaiOrder = `'${status}'`;
      }

      // Use same SP as findAll with DaXoa = 1 for accurate username resolution
      const results = await this.sequelize.query(
        `EXEC SP_Lay_DonHang
          @WebsiteName = :website,
          @username = :username,
          @trangthaiOrder = :trangthaiOrder,
          @NoiDungTim = :search,
          @TimTheo = -1,
          @MaDatHang = :MaDatHang,
          @TenDotHang = '',
          @HangKhoan = 0,
          @QuocGiaID = :quocGiaId,
          @PageSize = :limit,
          @PageNum = :page,
          @DaXoa = 1,
          @TuNgay = :startDate,
          @DenNgay = :endDate`,
        {
          replacements: {
            website: website || '',
            username: username || '',
            trangthaiOrder,
            search: search || '',
            // Ô "Mã đặt hàng" của màn /admin/orders/deleted. Cùng lỗi như findAll:
            // giao diện gửi `orderId`, DTO nhận, nhưng chỗ này không truyền đi.
            MaDatHang: this.locMaDatHang(orderId),
            quocGiaId: quocGiaId || -1,
            limit: safeLimit,
            page,
            startDate: startDate || '',
            endDate: endDate || '',
          },
          type: 'SELECT' as const,
        },
      );

      const data = Array.isArray(results) ? results : [];
      const firstItem = data.length > 0 ? (data[0] as any) : null;
      const total = firstItem?.TotalCount
        ? Number(firstItem.TotalCount)
        : firstItem?.Total
          ? Number(firstItem.Total)
          : data.length;

      const mappedData = (data.slice(1) || []).map((row: any) => ({
        id: row.ID,
        orderNumber: row.ordernumber,
        username: row.username,
        usernameSave: row.usernamesave,
        linkWeb: row.linkweb,
        linkHinh: row.linkhinh,
        color: row.corlor,
        size: row.size,
        soLuong: row.soluong,
        donGiaWeb: row.dongiaweb,
        saleOff: row.saleoff,
        phuThu: row.phuthu,
        shipUsa: row.shipUSA,
        tax: row.tax,
        cong: row.cong,
        loaiTien: row.loaitien,
        ghiChu: row.ghichu,
        tyGia: row.tygia,
        giaSauOffUsd: row.giasauoffUSD,
        giaSauOffVnd: row.giasauoffVND,
        tienCongUsd: row.tiencongUSD,
        tienCongVnd: row.tiencongVND,
        tongTienUsd: row.tongtienUSD,
        tongTienVnd: row.tongtienVND,
        trangThaiOrder: row.trangthaiOrder,
        adminNote: row.AdminNote,
        ngayVeVn: row.ngayveVN,
        ngaySaveLink: row.ngaysaveLink || null,
        ngayMuaHang: row.ngaymuahang || null,
        ngayHoanThanh: row.NgayHoanThanh || null,
        namTaiChinh: row.nam_taichinh,
        websiteName: row.WebsiteName,
        tenDotHang: row.TenDotHang,
        yeuCauGuiHang: row.YeuCauGuiHang,
        daQuaHanMuc: row.DaQuaHanMuc,
        laKhachVip: row.LaKhachVip,
        ngayYeuCauGuiHang: row.NgayYeuCauGuiHang,
        yeuCauGuiGhiChu: row.YeuCauGui_GhiChu,
        guiHangSoKg: row.GuiHang_SoKg,
        guiHangTien: row.GuiHang_Tien,
        loaiHangId: row.LoaiHangID,
        tenLoaiHang: row.TenLoaiHang,
        canHangSoKg: row.CanHang_SoKg,
        canHangTienShipVeVn: row.CanHang_TienShipVeVN,
        canHangTienShipTrongNuoc: row.CanHang_TienShipTrongNuoc,
        hangKhoan: row.HangKhoan,
        maSoHang: row.MaSoHang,
        quocGiaId: row.QuocGiaID,
        tenQuocGia: row.TenQuocGia,
        linkTaiKhoanMang: row.LinkTaiKhoanMang,
        vungMien: row.VungMien,
        nguoiTao: row.nguoiTao,
        isDeleted: row.DaXoa,
      }));

      return {
        data: mappedData,
        total,
        page,
        limit: safeLimit,
      };
    } catch (error: any) {
      console.error('Error in findDeleted (SP_Lay_DonHang):', error?.message || error);
      return {
        data: [],
        total: 0,
        page,
        limit: safeLimit,
      };
    }
  }

  /**
   * Get count of deleted orders by status
   * For CheckBoxList with counts like C# version
   */
  async getDeletedStatusCounts(): Promise<{ status: string; count: number }[]> {
    try {
      const [results]: any[] = await this.sequelize.query(`
        SELECT trangThaiOrder as status, COUNT(*) as count
        FROM dbo.DON_HANG
        WHERE DaXoa = 1
        GROUP BY trangThaiOrder
      `);
      return results || [];
    } catch (error: any) {
      console.error('Error in getDeletedStatusCounts:', error.message);
      return [];
    }
  }

  /**
   * Update order note (add additional note)
   *
   * Converted from EditOrder_BoSungGhiChu.aspx.cs
   */
  async updateNote(ids: number[], updateNoteDto: UpdateOrderNoteDto, nguoiTao = 'system'): Promise<any> {
    // Converted from EditOrder_BoSungGhiChu.aspx.cs - btCapNhat_Click()
    // Calls stored procedure SP_CapNhat_BoSungGhiChu which handles batch note update
    // SP uses SplitString(@id, ',') to parse comma-separated IDs
    try {
      const idsParam = ids.join(',');
      await this.sequelize.query(
        `EXEC dbo.SP_CapNhat_BoSungGhiChu @id = :ids, @BoSungGhiChu = :note`,
        {
          replacements: {
            ids: idsParam,
            note: (updateNoteDto.boSungGhiChu || '').replace(/'/g, "''"),
          },
          type: QueryTypes.RAW,
        },
      );
      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'EditOrder_BoSungGhiChu:btCapNhat_Click',
        hanhDong: 'Chinh sua',
        doiTuong: idsParam,
        noiDung: `ID: ${idsParam}; BoSungGhiChu: ${updateNoteDto.boSungGhiChu || ''}`,
      });

      // Notify each order's user that admin added a note
      const noteOrders = await this.getOrdersInfo(ids);
      this.notifyOrderUsers(
        noteOrders,
        'Đơn hàng có ghi chú mới',
        (o) => `Đơn hàng #${o.orderNumber} của bạn có ghi chú mới từ admin.`,
        noteOrders.map((o) => o.id),
        nguoiTao,
      );

      // Return first updated order for response
      return this.findOne(ids[0]);
    } catch (error) {
      console.error('UpdateNote error:', error);
      throw new Error(`Failed to update note for orders ${ids.join(',')}`);
    }
  }

  /**
   * Update order return date to Vietnam
   *
   * Converted from EditOrder_NgayVeVN.aspx.cs - btCapNhat_Click()
   * Calls stored procedure SP_CapNhat_NgayVeVN which handles:
   * - Update ngayVeVN
   * - Auto-generate tenDotHang = yyyyMMdd format
   * - Optionally change status to Completed
   * - Optionally append additional note
   * - Auto create/update DotHang (shipment batch)
   * - Log system action
   */
  async updateReturnDate(
    id: number,
    updateReturnDateDto: UpdateReturnDateDto,
    username?: string,
  ): Promise<Order> {
    const { ngayVeVn, boSungGhiChu, chuyenVeCompleted, ngayHoanThanh } = updateReturnDateDto;

    // Reuse helper port của DateTimeUtil.getSqlDatetime:
    // parseVietnameseDate accept DD/MM/YYYY (legacy datepicker) + ISO YYYY-MM-DD (FE mới).
    // formatSqlDate ↔ getSqlDatetime(DateTime) → yyyy-MM-dd.
    const parsed = parseVietnameseDate(ngayVeVn);
    if (!parsed) {
      throw new BadRequestException(`ngayVeVn invalid format: ${ngayVeVn}`);
    }
    const sqlDate = formatSqlDate(parsed);
    const tenDotHang = sqlDate.replace(/-/g, '');

    // Call stored procedure SP_CapNhat_NgayVeVN
    await this.sequelize.query(
      `EXEC SP_CapNhat_NgayVeVN
        @id = '${id}',
        @NgayVeVN = '${sqlDate}',
        @TenDotHang = '${tenDotHang}',
        @BoSungGhiChu = '${(boSungGhiChu || '').replace(/'/g, "''")}',
        @ChuyenSangComplete = ${chuyenVeCompleted ? 1 : 0}`,
    );

    // Khi chuyển sang Completed → ghi DON_HANG.NgayHoanThanh.
    // SP_CapNhat_NgayVeVN không nhận @NgayHoanThanh, nên update riêng ở đây
    // để giữ migration đơn giản, cùng convention với SP_CapNhat_MassComplete.
    if (chuyenVeCompleted) {
      let ngayHoanThanhSql: string;
      if (ngayHoanThanh) {
        const parsedHoanThanh = parseVietnameseDate(ngayHoanThanh);
        if (!parsedHoanThanh) {
          throw new BadRequestException(`ngayHoanThanh invalid format: ${ngayHoanThanh}`);
        }
        ngayHoanThanhSql = formatSqlDate(parsedHoanThanh);
      } else {
        ngayHoanThanhSql = formatSqlDate(new Date()); // mặc định hôm nay
      }
      await this.sequelize.query(
        `UPDATE DON_HANG SET NgayHoanThanh = :ngay WHERE ID = :id`,
        { replacements: { ngay: ngayHoanThanhSql, id } },
      );
    }

    // Fetch updated order
    const updatedOrder = await this.findOne(id);

    // System logging (from EditOrder_NgayVeVN.aspx.cs)
    if (username && updatedOrder) {
      await this.systemLogsService.create({
        nguoiTao: username,
        nguon: 'EditOrder_NgayVeVN:CapNhatNgayVeVN',
        hanhDong: 'Chinh sua',
        doiTuong: String(id),
        noiDung: `ID: ${id}; NgayVeVN: ${ngayVeVn}; BoSungGhiChu: ${boSungGhiChu || ''}`,
      });
    }

    // Notify order owner about return date update
    if (updatedOrder) {
      const orderNum = (updatedOrder as any).orderNumber || (updatedOrder as any).ordernumber || String(id);
      const ownerUsername = (updatedOrder as any).username;
      if (ownerUsername) {
        this.notificationsService
          .create({
            username: ownerUsername,
            title: chuyenVeCompleted ? 'Đơn hàng hoàn thành' : 'Đơn hàng đã về VN',
            message: chuyenVeCompleted
              ? `Đơn hàng #${orderNum} của bạn đã hoàn thành. Ngày về VN: ${ngayVeVn}.`
              : `Đơn hàng #${orderNum} của bạn đã cập nhật ngày về VN: ${ngayVeVn}.`,
            type: 'order',
            createdBy: username,
            refType: 'order',
            refId: String(id),
          })
          .catch((err) => console.error('[notify] Failed to send notification:', err));
      }
    }

    return updatedOrder;
  }

  /**
   * Import orders from Excel file
   *
   * Converted from QLDatHang_Import.aspx.cs
   * This is a simplified version - actual implementation would parse Excel file
   */
  async importOrders(
    file: any,
    importDto: ImportOrdersDto,
  ): Promise<{ imported: number; errors?: string[] }> {
    const errors: string[] = [];
    let imported = 0;

    // Check if file is provided
    if (!file) {
      // If no file, return stub response for now
      return { imported: 0, errors: ['No file uploaded'] };
    }

    // Validate file type
    if (!file.originalname.endsWith('.xlsx')) {
      throw new BadRequestException('Only .xlsx files are supported');
    }

    // In a full implementation, we would:
    // 1. Parse the Excel file using xlsx library
    // 2. Validate each row against required fields
    // 3. Create or update orders based on mode
    // 4. Return import results

    // For now, return a placeholder response
    return {
      imported: 0,
      errors: ['Excel import not fully implemented - requires xlsx library'],
    };
  }

  /**
   * Generate Excel import template with dropdown validation for
   * username, currency (loại tiền), and country (quốc gia).
   * Uses exceljs on the server to avoid browser compatibility issues.
   */
  async generateImportTemplate(): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();

    // Fetch reference data
    const [usernameRows] = await this.sequelize.query(
      `SELECT UserName FROM dbo.AspNetUsers ORDER BY UserName`,
    );
    const [countryRows] = await this.sequelize.query(
      `SELECT TenQuocGia FROM dbo.tbQuocGia ORDER BY TenQuocGia`,
    );
    const [rateRows] = await this.sequelize.query(
      `SELECT Name FROM dbo.TY_GIA ORDER BY Name`,
    );

    const usernames = (usernameRows as any[]).map((r) => r.UserName as string);
    const countries = (countryRows as any[]).map((r) => r.TenQuocGia as string);
    const currencies = (rateRows as any[]).map((r) => r.Name as string);

    // Sheet 1: main data entry sheet
    const ws = wb.addWorksheet('DonHang');

    // Sheet 2: visible reference sheet with dropdown data
    const refSheet = wb.addWorksheet('RefData');
    const refHeader = refSheet.getRow(1);
    ['Username', 'Loại tiền', 'Tên quốc gia'].forEach((h, i) => {
      const cell = refHeader.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B7280' } };
      cell.alignment = { horizontal: 'center' };
    });
    refHeader.height = 20;
    refSheet.getColumn(1).width = 24;
    refSheet.getColumn(2).width = 14;
    refSheet.getColumn(3).width = 24;

    const maxRef = Math.max(usernames.length, currencies.length, countries.length, 1);
    for (let i = 0; i < maxRef; i++) {
      refSheet.addRow([usernames[i] ?? '', currencies[i] ?? '', countries[i] ?? '']);
    }

    // Freeze header of RefData too
    refSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const HEADERS = [
      'Username', 'Loại tiền', 'Tên quốc gia', 'Link sản phẩm',
      'Màu', 'Size', 'Số lượng', 'Link hình', 'Giá web', '%Sale Off',
    ];
    const COL_WIDTHS = [22, 14, 22, 52, 14, 10, 12, 52, 14, 12];

    ws.addRow(HEADERS);
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14264B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    headerRow.height = 22;
    HEADERS.forEach((_, i) => { ws.getColumn(i + 1).width = COL_WIDTHS[i]; });

    // Example row
    ws.addRow(['nguyen_van_a', 'USD', 'Mỹ', 'https://www.amazon.com/dp/B08N5WRWNW', 'Black', 'M', 1, '', 49.99, 10]);

    // Freeze header
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // Data validation dropdowns (rows 2–1000)
    const dv = ws.dataValidations;

    // RefData row 1 = header → data starts at row 2
    dv.add('A2:A1000', {
      type: 'list', allowBlank: false,
      formulae: [`RefData!$A$2:$A$${usernames.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Username không hợp lệ',
      error: 'Vui lòng chọn username từ danh sách',
    });
    dv.add('B2:B1000', {
      type: 'list', allowBlank: false,
      formulae: [`RefData!$B$2:$B$${currencies.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Loại tiền không hợp lệ',
      error: `Chọn một trong: ${currencies.join(', ')}`,
    });
    dv.add('C2:C1000', {
      type: 'list', allowBlank: false,
      formulae: [`RefData!$C$2:$C$${countries.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Quốc gia không hợp lệ',
      error: 'Vui lòng chọn quốc gia từ danh sách',
    });
    dv.add('G2:G1000', {
      type: 'whole', operator: 'greaterThan', formulae: [0],
      showErrorMessage: true,
      errorTitle: 'Số lượng không hợp lệ',
      error: 'Phải là số nguyên dương',
    });
    dv.add('J2:J1000', {
      type: 'decimal', operator: 'between', formulae: [0, 100],
      showErrorMessage: true,
      errorTitle: '%Sale Off không hợp lệ',
      error: 'Phải từ 0 đến 100',
    });

    return wb.xlsx.writeBuffer();
  }

  /**
   * Import orders from parsed Excel JSON rows
   * Called from POST /orders/import-json
   */
  async importOrdersJson(
    items: ImportOrderItemDto[],
    mode: string,
    nguoiTao: string,
  ): Promise<{
    imported: number;
    errors: string[];
    successItems: Array<{
      excelRowIndex: number;
      username: string;
      loaitien: string;
      tenQuocGia: string;
      linkweb: string;
      color: string;
      size: string;
      soluong: number;
      dongiaweb: number;
      saleoff: number;
    }>;
  }> {
    const errors: string[] = [];
    const successItems: Array<{
      excelRowIndex: number; username: string; loaitien: string;
      tenQuocGia: string; linkweb: string; color: string; size: string;
      soluong: number; dongiaweb: number; saleoff: number;
    }> = [];

    for (const item of items) {
      const rowLabel = `Dòng ${item.excelRowIndex ?? successItems.length + errors.length + 1}`;
      try {
        await this.sequelize.query(
          `EXEC dbo.SP_Them_DonHang_Simple_CoTamTinh
            @WebsiteName = :websiteName,
            @username = :username,
            @usernamesave = :usernameSave,
            @linkweb = :linkweb,
            @linkhinh = :linkhinh,
            @corlor = :corlor,
            @size = :size,
            @soluong = :soLuong,
            @dongiaweb = :donGiaWeb,
            @loaitien = :loaitien,
            @ghichu = :ghiChu,
            @tygia = :tyGia,
            @saleoff = :saleOff,
            @HangKhoan = 0,
            @cong = :cong,
            @shipUSA = :shipUsa,
            @tax = :tax,
            @phuthu = :phuThu,
            @QuocGiaID = :quocGiaId`,
          {
            replacements: {
              websiteName: (item.websiteName || '').replace(/'/g, "''"),
              username: (item.username || '').replace(/'/g, "''"),
              usernameSave: nguoiTao.replace(/'/g, "''"),
              linkweb: (item.linkweb || '').replace(/'/g, "''"),
              linkhinh: (item.linkhinh || '').replace(/'/g, "''"),
              corlor: (item.color || '').replace(/'/g, "''"),
              size: (item.size || '').replace(/'/g, "''"),
              soLuong: item.soluong || 1,
              donGiaWeb: item.dongiaweb || 0,
              loaitien: item.loaitien || 'USD',
              ghiChu: (item.ghichu || '').replace(/'/g, "''"),
              tyGia: item.tygia || 1,
              saleOff: item.saleoff || 0,
              cong: item.cong || 0,
              shipUsa: null,
              tax: item.tax || 0,
              phuThu: item.phuthu || 0,
              quocGiaId: item.quocGiaId || null,
            },
            type: QueryTypes.RAW,
          },
        );
        successItems.push({
          excelRowIndex: item.excelRowIndex ?? 0,
          username: item.username,
          loaitien: item.loaitien,
          tenQuocGia: item.tenQuocGia,
          linkweb: item.linkweb,
          color: item.color || '',
          size: item.size || '',
          soluong: item.soluong,
          dongiaweb: item.dongiaweb,
          saleoff: item.saleoff || 0,
        });
      } catch (err) {
        errors.push(`${rowLabel}: ${(err as Error).message}`);
      }
    }

    return { imported: successItems.length, errors, successItems };
  }

  /**
   * Get product types (LoaiHang) for can hang dropdown
   *
   * Converted from CanHang.aspx.cs - LoadDataLoaiHang
   */
  async getProductTypes(): Promise<{ data: Array<{ LoaiHangID: number; TenLoaiHang: string }> }> {
    try {
      const [data] = await this.sequelize.query(`
        SELECT LoaiHangID, TenLoaiHang FROM dbo.LoaiHang ORDER BY TenLoaiHang
      `);
      return { data: data as any };
    } catch (error) {
      console.error('Error fetching product types:', error);
      return { data: [] };
    }
  }

  /**
   * Get order counts by status for can hang page
   *
   * Converted from CanHang.aspx.cs - LoadSoLuongDonHang
   */
  async getStatusCounts(): Promise<Record<string, number>> {
    try {
      const [data] = await this.sequelize.query(`
        SELECT trangThaiOrder, COUNT(*) as SL
        FROM dbo.DON_HANG
        WHERE DaXoa = 0
        GROUP BY trangThaiOrder
      `);

      const counts: Record<string, number> = {
        Received: 0,
        Ordered: 0,
        Shipped: 0,
        Completed: 0,
        Cancelled: 0,
      };

      (data as any[]).forEach((row) => {
        if (counts.hasOwnProperty(row.trangThaiOrder)) {
          counts[row.trangThaiOrder] = parseInt(row.SL);
        }
      });

      return counts;
    } catch (error) {
      console.error('Error fetching status counts:', error);
      return {
        Received: 0,
        Ordered: 0,
        Shipped: 0,
        Completed: 0,
        Cancelled: 0,
      };
    }
  }

  /**
   * Calculate shipping fee based on weight, product type, currency, and user
   *
   * Converted from CanHang.aspx.cs - gvDonHang_RowCommand (TinhTienShip)
   * Uses: EnhancedMath.RoundUp(weight * LayCongShipVeVN(loaiHangId, loaiTien, userName))
   */
  async calculateShipping(body: { weight: number; loaiHangId: number; loaiTien: string; username: string }): Promise<{ shippingFee: number }> {
    try {
      const { weight, loaiHangId, loaiTien, username } = body;

      // Get shipping rate from database - LayCongShipVeVN
      const [rates] = await this.sequelize.query(`
        SELECT CongShipVeVN FROM dbo.LoaiHang WHERE LoaiHangID = ${loaiHangId}
      `);

      if (!rates || (rates as any[]).length === 0) {
        return { shippingFee: 0 };
      }

      const rate = (rates as any[])[0].CongShipVeVN || 0;

      // Calculate: RoundUp(weight * rate)
      const shippingFee = Math.ceil(weight * rate);

      return { shippingFee };
    } catch (error) {
      console.error('Error calculating shipping:', error);
      return { shippingFee: 0 };
    }
  }

  async updateCanHang(
    id: number,
    body: {
      loaiHangId: number;
      canHangSoKg: number;
      canHangTienShipVeVn: number;
      canHangTienShipTrongNuoc?: number;
      canHangGhiChuShipVeVn?: string;
    },
    nguoiTao = 'system',
  ): Promise<{ success: boolean }> {
    const canHangTienShipTrongNuoc = body.canHangTienShipTrongNuoc ?? 0;
    const canHangGhiChuShipVeVn = body.canHangGhiChuShipVeVn || '';

    await this.sequelize.query(
      `EXEC dbo.SP_CanHang
        @ID = :id,
        @LoaiHangID = :loaiHangId,
        @CanHang_SoKg = :canHangSoKg,
        @CanHang_TienShipVeVN = :canHangTienShipVeVn,
        @CanHang_TienShipTrongNuoc = :canHangTienShipTrongNuoc,
        @CanHang_GhiChuShipVeVN = :canHangGhiChuShipVeVn,
        @NguoiTao = :nguoiTao`,
      {
        replacements: {
          id,
          loaiHangId: body.loaiHangId,
          canHangSoKg: body.canHangSoKg ?? 0,
          canHangTienShipVeVn: body.canHangTienShipVeVn ?? 0,
          canHangTienShipTrongNuoc,
          canHangGhiChuShipVeVn,
          nguoiTao,
        },
        type: QueryTypes.RAW,
      },
    );

    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'CanHang:CanHang',
      hanhDong: 'Chinh sua',
      doiTuong: String(id),
      noiDung: `ID: ${id}; LoaiHang: ${body.loaiHangId}; CanHang_SoKg: ${body.canHangSoKg ?? 0}; CanHang_TienShipVeVN: ${body.canHangTienShipVeVn ?? 0}; CanHang_GhiChuShipVeVN: ${canHangGhiChuShipVeVn}`,
    });

    // Notify order owner that their order has been weighed
    const [canHangOrder] = await this.getOrdersInfo([id]);
    if (canHangOrder) {
      try {
        this.notifyOrderUsers(
          [canHangOrder],
          'Đơn hàng đã được cân hàng',
          (o) => `Đơn hàng #${o.orderNumber} của bạn đã được cân hàng (${body.canHangSoKg ?? 0} kg).`,
          [id],
          nguoiTao,
        );
      } catch (e: any) {
        console.error('notifyOrderUsers failed:', e.message);
      }
    }

    return { success: true };
  }

  /**
   * Get list of usernames for can hang dropdown
   *
   * Converted from CanHang.aspx.cs - LoadDataUser
   * Uses: UserManager.Users (AspNetUsers table)
   */
  async getUsernames(): Promise<{ username: string }[]> {
    try {
      const [data] = await this.sequelize.query(`
        SELECT UserName as username FROM dbo.AspNetUsers ORDER BY UserName
      `);
      return data as any;
    } catch (error) {
      console.error('Error fetching usernames:', error);
      return [];
    }
  }

  /**
   * Get list of batches (DotHang) for can hang dropdown
   *
   * Converted from CanHang.aspx.cs - LoadDataDotHang
   * Uses: LayDanhSachTenDotHang(DateTime.Today.AddYears(-1))
   */
  async getBatches(): Promise<{ tenDotHang: string }[]> {
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const [data] = await this.sequelize.query(`
        SELECT DISTINCT tenDotHang FROM dbo.DON_HANG
        WHERE DaXoa = 0 AND tenDotHang IS NOT NULL AND ngayVeVN >= '${oneYearAgo.toISOString().split('T')[0]}'
        ORDER BY tenDotHang DESC
      `);
      return data as any;
    } catch (error) {
      console.error('Error fetching batches:', error);
      return [];
    }
  }

  /**
   * Update order - converted from EditOrderDetail.cs - btCapNhat_Click
   *
   * Steps:
   * 1. Check permission using SP_KiemTra_DuocCapNhatDonHang
   * 2. Update order using SP_CapNhatDonHang
   * 3. Log action to SystemLogs
   * 4. Update ngayVeVN using SP_CapNhat_NgayVeVN (if provided)
   *
   * Returns:
   *   { success: true } - Update success
   *   { error: 'closed_period' } - Kỳ đã đóng
   *   { error: 'failed' } - Update failed
   */
  async updateOrderDetail(
    id: number,
    // Accept both camelCase and snake_case from frontend
    updateData: {
      username: string;
      linkweb?: string;
      linkhinh?: string;
      linkWeb?: string;
      linkHinh?: string;
      corlor?: string;
      size?: string;
      soluong: number;
      dongiaweb?: number;
      donGiaWeb?: number;
      saleoff?: number;
      saleOff?: number;
      phuthu?: number;
      phuThu?: number;
      shipUSA?: number;
      tax?: number;
      cong?: number;
      loaitien?: string;
      loaiTien?: string;
      ghichu?: string;
      ghiChu?: string;
      tygia?: number;
      tyGia?: number;
      giasauoffUSD?: number;
      giaSauOffUsd?: number;
      giasauoffVND?: number;
      giaSauOffVnd?: number;
      tiencongUSD?: number;
      tienCongUsd?: number;
      tiencongVND?: number;
      tienCongVnd?: number;
      tongtienUSD?: number;
      tongTienUsd?: number;
      tongtienVND?: number;
      tongTienVnd?: number;
      ordernumber?: string;
      orderNumber?: string;
      trangthaiOrder?: string;
      trangThaiOrder?: string;
      ngaymuahang?: string;
      ngayMuaHang?: string;
      ngayveVN?: string;
      ngayVeVn?: string;
      /** Ngày hoàn thành — chỉ ghi vào DON_HANG.NgayHoanThanh khi trangthaiOrder='Completed' */
      ngayHoanThanh?: string;
      adminNote?: string;
      LoaiHangID?: number;
      loaiHangId?: number;
      QuocGiaID?: number;
      quocGiaId?: number;
      usernamesave?: string;
      nguoiTao: string;
      /** Khối nhà cung cấp — xem `ncc-don-hang.ts`. Chỉ ghi khi `coGiaNcc`. */
      NCC_ID?: number | null;
      NCC_NgoaiTe?: number | null;
      NCC_Cong?: number | null;
      NCC_TyGia?: number | null;
      NCC_TongPhaiTra?: number | null;
      NCC_Tracking?: string | null;
    },
    actorUsername = 'system',
    coGiaNcc = false,
  ): Promise<{ success: boolean; error?: string }> {
    const {
      username,
      linkweb: linkWeb,
      linkhinh: linkHinh,
      corlor,
      size,
      soluong,
      dongiaweb: donGiaWeb,
      saleoff: saleOff,
      phuthu: phuThu,
      // Frontend gửi `shipUSA` (chữ hoa USA) — destructure phải khớp key
      shipUSA: shipUsa,
      tax,
      cong,
      loaitien: loaiTien,
      ghichu: ghiChu,
      tygia: tyGia,
      giasauoffUSD: giaSauOffUsd,
      giasauoffVND: giaSauOffVnd,
      tiencongUSD: tienCongUsd,
      tiencongVND: tienCongVnd,
      tongtienUSD: tongTienUsd,
      tongtienVND: tongTienVnd,
      ordernumber: orderNumber,
      trangthaiOrder: trangThaiOrder,
      ngaymuahang: ngayMuaHang,
      ngayveVN: ngayVeVn,
      ngayHoanThanh,
      adminNote,
      LoaiHangID: loaiHangId,
      QuocGiaID: quocGiaId,
      usernamesave,
      nguoiTao,
    } = updateData;
    const logUsername = actorUsername || nguoiTao || 'system';

    // Step 1: Check permission using SP_KiemTra_DuocCapNhatDonHang
    const [checkResult]: any[] = await this.sequelize.query(
      `DECLARE @ret int; EXEC @ret = dbo.SP_KiemTra_DuocCapNhatDonHang @ID = :id, @UserName = :username; SELECT @ret AS DuocCapNhat`,
      {
        replacements: { id, username: username || '' },
        type: QueryTypes.RAW,
      },
    );
    const checkDataRaw = Array.isArray(checkResult) && checkResult.length > 0 ? checkResult[0] as any : { DuocCapNhat: -1 };
    const checkValue = checkDataRaw?.DuocCapNhat ?? -1;

    if (checkValue === 1) {
      return { success: false, error: 'closed_period' }; // Kỳ đã đóng
    }
    if (checkValue === 2) {
      return { success: false, error: 'debt_locked' }; // Công nợ bị khóa
    }
    if (checkValue !== 0) {
      return { success: false, error: 'failed' };
    }

    // Step 2: Build NoiDung for SystemLogs (giống BLL.NoiDungDonHangSystemLogs)
    const noiDung = [
      `username: ${username}`,
      `linkweb: ${linkWeb}`,
      `linkhinh: ${linkHinh}`,
      `corlor: ${corlor}`,
      `size: ${size}`,
      `soluong: ${soluong}`,
      `dongiaweb: ${donGiaWeb}`,
      `saleoff: ${saleOff}`,
      `phuthu: ${phuThu}`,
      `shipUSA: ${shipUsa}`,
      `tax: ${tax}`,
      `cong: ${cong}`,
      `loaitien: ${loaiTien}`,
      `ghichu: ${ghiChu}`,
      `tygia: ${tyGia}`,
      `giasauoffUSD: ${giaSauOffUsd}`,
      `giasauoffVND: ${giaSauOffVnd}`,
      `tiencongUSD: ${tienCongUsd}`,
      `tiencongVND: ${tienCongVnd}`,
      `tongtienUSD: ${tongTienUsd}`,
      `tongtienVND: ${tongTienVnd}`,
      `ordernumber: ${orderNumber}`,
      `trangthaiOrder: ${trangThaiOrder}`,
      `ngaymuahang: ${ngayMuaHang || ''}`,
    ].join('; ');

    // Step 3: Update order using SP_CapNhatDonHang
    try {
      await this.sequelize.query(
        `EXEC dbo.SP_CapNhatDonHang
          @ID = :id,
          @username = :username,
          @usernamesave = :usernamesave,
          @linkweb = :linkweb,
          @linkhinh = :linkhinh,
          @corlor = :corlor,
          @size = :size,
          @soluong = :soluong,
          @dongiaweb = :dongiaweb,
          @saleoff = :saleoff,
          @phuthu = :phuthu,
          @shipUSA = :shipusa,
          @tax = :tax,
          @cong = :cong,
          @loaitien = :loaitien,
          @ghichu = :ghichu,
          @tygia = :tygia,
          @giasauoffUSD = :giasauoffUSD,
          @giasauoffVND = :giasauoffVND,
          @tiencongUSD = :tiencongUSD,
          @tiencongVND = :tiencongVND,
          @tongtienUSD = :tongtienUSD,
          @tongtienVND = :tongtienVND,
          @ordernumber = :ordernumber,
          @trangthaiOrder = :trangthaiOrder,
          @ngaymuahang = :ngaymuahang,
          @ngayveVN = :ngayvevn,
          @AdminNote = :adminNote,
          @LoaiHangID = :loaiHangId,
          @QuocGiaID = :quocGiaId,
          @NguoiTao = :nguoiTao`,
        {
          replacements: {
            id,
            username: username || '',
            usernamesave: usernamesave || '',
            linkweb: (linkWeb || '').replace(/'/g, "''"),
            linkhinh: (linkHinh || '').replace(/'/g, "''"),
            corlor: (corlor || '').replace(/'/g, "''"),
            size: (size || '').replace(/'/g, "''"),
            soluong,
            dongiaweb: donGiaWeb,
            saleoff: saleOff,
            phuthu: phuThu || 0,
            shipusa: shipUsa || null,
            tax: tax || 0,
            cong: cong || 0,
            loaitien: loaiTien || 'USD',
            ghichu: (ghiChu || '').replace(/'/g, "''"),
            tygia: tyGia || 0,
            giasauoffUSD: giaSauOffUsd || 0,
            giasauoffVND: giaSauOffVnd || 0,
            tiencongUSD: tienCongUsd || 0,
            tiencongVND: tienCongVnd || 0,
            tongtienUSD: tongTienUsd || 0,
            tongtienVND: tongTienVnd || 0,
            ordernumber: orderNumber || '',
            trangthaiOrder: trangThaiOrder || 'Received',
            ngaymuahang: ngayMuaHang || null,
            ngayvevn: ngayVeVn || null,
            adminNote: (adminNote || '').replace(/'/g, "''"),
            loaiHangId: loaiHangId || null,
            quocGiaId: quocGiaId || null,
            nguoiTao: logUsername,
          },
          type: QueryTypes.RAW,
        },
      );
    } catch (error) {
      console.error('updateOrderDetail error:', error);
      return { success: false, error: 'failed' };
    }

    // Step 3.5: Khi status = Completed → ghi DON_HANG.NgayHoanThanh.
    // SP_CapNhatDonHang không nhận @NgayHoanThanh, nên update riêng (cùng convention
    // với updateReturnDate). Không clear khi đổi sang status khác (giữ history).
    if ((trangThaiOrder || '') === 'Completed') {
      try {
        const parsed = ngayHoanThanh
          ? parseVietnameseDate(ngayHoanThanh)
          : new Date();
        if (!parsed) {
          return { success: false, error: 'invalid_ngay_hoan_thanh' };
        }
        await this.sequelize.query(
          `UPDATE DON_HANG SET NgayHoanThanh = :ngay WHERE ID = :id`,
          { replacements: { ngay: formatSqlDate(parsed), id } },
        );
      } catch (error) {
        console.error('updateOrderDetail NgayHoanThanh error:', error);
        // Không block flow chính — Detail update đã thành công ở Step 3
      }
    }

    // Step 3.6: KHỐI NHÀ CUNG CẤP.
    //
    // Cập nhật RIÊNG, không nhồi vào SP_CapNhatDonHang: SP đó là bản sinh từ
    // trang ASP cũ và trang ASP vẫn đang gọi chính nó. Thêm tham số vào SP là
    // sửa chung cho hai hệ, mà bên kia không ai dựng lại được để thử.
    //
    // HAI ĐIỀU KIỆN, cả hai đều cần:
    //   • `coGiaNcc` — người gọi có quyền. Thiếu thì BỎ QUA im lặng chứ không
    //     báo lỗi: biểu mẫu của CSKH không hiện khối này nên họ không cố ghi,
    //     ném lỗi chỉ làm họ không lưu được những sửa đổi hợp lệ khác.
    //   • `docThanNcc` khác null — thân yêu cầu CÓ ít nhất một khoá NCC. Đây
    //     là chỗ dễ sai nhất: nếu coi "thân không có khoá" là "đặt về null"
    //     thì một người CÓ quyền mở đơn ra, sửa ghi chú rồi bấm Cập nhật là
    //     xoá sạch giá nhập, vì biểu mẫu nào không gửi khối đó cũng thành lệnh
    //     xoá.
    let noiDungNcc = '';
    const thanNcc = coGiaNcc ? docThanNcc(updateData as any) : null;
    if (thanNcc) {
      try {
        await this.sequelize.query(
          `UPDATE dbo.DON_HANG
           SET    NCC_ID = :nccId,
                  NCC_NgoaiTe = :ngoaiTe,
                  NCC_Cong = :cong,
                  NCC_TyGia = :tyGia,
                  NCC_TongPhaiTra = :tongPhaiTra,
                  NCC_Tracking = :tracking
           WHERE  ID = :id`,
          {
            replacements: {
              id,
              nccId: thanNcc.NCC_ID,
              ngoaiTe: thanNcc.NCC_NgoaiTe,
              cong: thanNcc.NCC_Cong,
              tyGia: thanNcc.NCC_TyGia,
              tongPhaiTra: thanNcc.NCC_TongPhaiTra,
              tracking: thanNcc.NCC_Tracking,
            },
            type: QueryTypes.UPDATE,
          },
        );
        noiDungNcc = `; ${nhatKyNcc(thanNcc)}`;
      } catch (error) {
        console.error('updateOrderDetail NCC error:', error);
        // Không chặn luồng chính — Step 3 đã lưu xong phần đơn hàng.
      }
    }

    // Step 4: Log to SystemLogs
    await this.systemLogsService.create({
      nguoiTao: logUsername,
      nguon: 'EditOrderDetail:CapNhatDonHang',
      hanhDong: 'Chinh sua',
      doiTuong: String(id),
      noiDung: `ID: ${id}; ${noiDung}${noiDungNcc}`,
    });

    // Step 5: Update ngayVeVN using SP_CapNhat_NgayVeVN if provided.
    // Port từ EditOrderDetail.cs:360-364 — chỉ chạy khi parse được ngày
    // (tương đương `DateTime?.HasValue` ở C#). Dùng parseVietnameseDate để
    // chấp nhận cả DD/MM/YYYY (legacy datepicker) lẫn ISO YYYY-MM-DD.
    if (ngayVeVn) {
      const parsedNgayVe = parseVietnameseDate(ngayVeVn);
      if (parsedNgayVe) {
        const sqlDate = formatSqlDate(parsedNgayVe);
        const tenDotHang = sqlDate.replace(/-/g, '');
        try {
          await this.sequelize.query(
            `EXEC dbo.SP_CapNhat_NgayVeVN
              @id = :id,
              @NgayVeVN = :ngayVeVN,
              @TenDotHang = :tenDotHang,
              @BoSungGhiChu = '',
              @ChuyenSangComplete = 0`,
            {
              replacements: { id, ngayVeVN: sqlDate, tenDotHang },
              type: QueryTypes.RAW,
            },
          );
        } catch (error) {
          console.error('updateOrderDetail ngayVeVN error:', error);
          // Continue even if ngayVeVN update fails
        }
      }
    }

    // Notify order owner that admin has updated their order
    if (username) {
      this.notificationsService
        .create({
          username,
          title: 'Đơn hàng đã được cập nhật',
          message: `Đơn hàng #${orderNumber || id} của bạn đã được admin cập nhật.`,
          type: 'order',
          createdBy: logUsername,
          refType: 'order',
          refId: String(id),
        })
        .catch((err) => console.error('[notify] Failed to send notification:', err));
    }

    return { success: true };
  }

  /**
   * Get list of countries (QuocGia)
   *
   * Converted from EditOrder.aspx.cs - LoadDataQuocGia()
   * Uses: dBConnect.LayDanhSachQuocGia() -> SP_Lay_QuocGia
   */
  /**
   * Danh sách tuyến cho ô chọn.
   *
   * Mặc định BỎ những tuyến đã đánh dấu ẩn (`tbQuocGia.DaAn = 1`) — vận hành
   * xin bỏ Đức/Pháp/Úc/Bồ Đào Nha khỏi danh sách nhập liệu. Ẩn chứ không xoá:
   * vẫn còn dòng công nợ thật tháng 7–8 trỏ tới Pháp và Bồ Đào Nha, xoá là
   * những dòng đó mất tên tuyến trong báo cáo. Bật lại chỉ là đổi một bit.
   *
   * `tatCa = true` thì trả về đủ, kể cả tuyến đã ẩn — dùng cho Ô LỌC, để còn
   * lọc ra được những đơn/công nợ cũ thuộc tuyến đã ngừng.
   */
  async getQuocGia(tatCa = false): Promise<{ QuocGiaID: number; TenQuocGia: string; PhiShipVeVN: number }[]> {
    try {
      const [data] = await this.sequelize.query(`
        SELECT QuocGiaID, TenQuocGia, PhiShipVeVN
        FROM dbo.tbQuocGia
        ${tatCa ? '' : 'WHERE ISNULL(DaAn, 0) = 0'}
        ORDER BY TenQuocGia
      `);
      return data as any;
    } catch (error) {
      console.error('Error fetching countries:', error);
      return [];
    }
  }

  /**
   * Get exchange rates (TyGia) for EditOrderDetail
   *
   * Converted from EditOrderDetail.cs - LoadDataTyGia()
   * Uses: BLL.LayDanhSachTyGia() -> DBConnect.LayDanhSachTyGia
   */
  async getExchangeRates(): Promise<{ name: string; tyGiaVND: number; congShipVeVN: number }[]> {
    try {
      const [data] = await this.sequelize.query(`
        SELECT Name, TyGiaVND, CongShipVeVN FROM dbo.TY_GIA ORDER BY Name
      `);
      return data as any;
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      return [];
    }
  }

  /**
   * Get product types (LoaiHang) for EditOrderDetail
   *
   * Converted from EditOrderDetail.cs - LoadDataLoaiHang()
   * Uses: BLL.LayDanhSachLoaiHang()
   */
  async getLoaiHang(): Promise<{ LoaiHangID: number; TenLoaiHang: string }[]> {
    try {
      const [data] = await this.sequelize.query(`
        SELECT LoaiHangID, TenLoaiHang FROM dbo.LoaiHang ORDER BY TenLoaiHang
      `);
      return data as any;
    } catch (error) {
      console.error('Error fetching LoaiHang:', error);
      return [];
    }
  }

  /**
   * Calculate service fee (GiaTienCong) for EditOrderDetail
   *
   * Converted from EditOrderDetail.cs - drLoaitien_SelectedIndexChanged()
   * Uses: BLL.LayGiaTienCong(loaiTien, donGiaWeb, khachBuon)
   */
  async getGiaTienCong(loaiTien: string, donGiaWeb: number, username: string): Promise<{ tienCong1Mon: number; tinhTheoPhanTram: boolean }> {
    try {
      // Get user's KhachBuon status
      const [users] = await this.sequelize.query(
        `SELECT KhachBuon FROM dbo.AspNetUsers WHERE UserName = :username`,
        {
          replacements: { username },
          type: QueryTypes.RAW,
        },
      );
      const khachBuon = (users as any[])?.[0]?.KhachBuon || false;

      // Call SP_Lay_GiaTienCong exactly as old C# code: DBConnect.LayGiaTienCong(LoaiTien, SoTien1Mon, KhachBuon)
      try {
        const [giaTienCong] = await this.sequelize.query(
          `EXEC SP_Lay_GiaTienCong @LoaiTien = :loaiTien, @SoTien1Mon = :donGiaWeb, @KhachBuon = :khachBuon`,
          {
            replacements: { loaiTien, donGiaWeb, khachBuon: khachBuon ? 1 : 0 },
            type: QueryTypes.RAW,
          },
        );

        if ((giaTienCong as any[]).length === 0) {
          return { tienCong1Mon: khachBuon ? 0 : 0, tinhTheoPhanTram: false };
        }

        const gia = (giaTienCong as any[])[0];
        return {
          tienCong1Mon: gia.TienCong1Mon || 0,
          tinhTheoPhanTram: !!gia.TinhTheoPhanTram,
        };
      } catch (tableError) {
        // Table may not exist - return default values
        console.warn('Table tbGiaTienCong not found, using default values');
        return { tienCong1Mon: khachBuon ? 0 : 0, tinhTheoPhanTram: false };
      }
    } catch (error) {
      console.error('Error calculating GiaTienCong:', error);
      return { tienCong1Mon: 0, tinhTheoPhanTram: false };
    }
  }

  /**
   * Update tracking number for LIST_ORDER
   * Converted from: TrackingNumber.aspx - btCapNhat_Click
   * Uses: orderNumber (string) as input, matching C# capNhatTrackingNumber
   */
  async updateTrackingNumber(orderNumber: string, trackingNumber: string, ngayNhanTaiNuocNgoai: string, trackingLink: string, nguoiTao = 'system'): Promise<{ success: boolean; message: string }> {
    try {
      const orderNumberSafe = orderNumber.replace(/'/g, "''");

      // Check if order exists in LIST_ORDER by orderNumber
      const [existing]: any[] = await this.sequelize.query(
        `SELECT ID FROM dbo.LIST_ORDER WHERE OrderNumber = N'${orderNumberSafe}'`
      );

      if (!existing || existing.length === 0) {
        return { success: false, message: 'Order not found' };
      }

      // Update tracking number - USING STORED PROCEDURE like C#
      await this.sequelize.query(`
        EXEC dbo.SP_CapNhat_TrackingNumber
          @ordernumber = N'${orderNumberSafe}',
          @tracking_number = N'${trackingNumber || ''}',
          ${ngayNhanTaiNuocNgoai ? `@NgayNhanTaiNuocNgoai = '${ngayNhanTaiNuocNgoai}'` : '@NgayNhanTaiNuocNgoai = NULL'},
          @TrackingLink = N'${trackingLink || ''}'
      `);

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'TrackingNumber:CapNhatTrackingNumber',
        hanhDong: 'Chinh sua',
        doiTuong: orderNumber,
        noiDung: `OrderNumber: ${orderNumber}; TrackingNumber: ${trackingNumber}; NgayNhan: ${ngayNhanTaiNuocNgoai || ''}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return { success: true, message: 'Đã cập nhật thành công' };
    } catch (error) {
      console.error('Error in updateTrackingNumber:', error.message);
      return { success: false, message: 'Có lỗi xảy ra' };
    }
  }

  /**
   * Search orders by order number OR tracking number for TrackingNumber page
   * Converted from: TrackingNumber.aspx - btTimKiem_Click
   * Calls BLL.LayDanhSachListOrder with both orderNumber and trackingNumber search
   */
  async searchByOrderOrTracking(orderNumber: string, trackingNumber: string, page: number = 1, limit: number = 20): Promise<{ data: any[]; total: number }> {
    try {
      const orderNumberSafe = orderNumber?.replace(/'/g, "''") || '';
      const trackingNumberSafe = trackingNumber?.replace(/'/g, "''") || '';

      // Search using STORED PROCEDURE like C# SP_Lay_ListOrder
      // SP returns: [ { TOTALROW: 50 }, {row1}, {row2}, ... ]
      const results: any[] = await this.sequelize.query(`
        EXEC dbo.SP_Lay_ListOrder
          @OrderNumber = N'${orderNumberSafe || ''}',
          @TrackingNumber = N'${trackingNumberSafe || ''}',
          @PageSize = ${limit},
          @PageNum = ${page}
      `);

      const total = Number(results[0]?.TOTALROW) || 0;
      const data = results.slice(1) || [];

      return { data, total };
    } catch (error) {
      console.error('Error in searchByOrderOrTracking:', error.message);
      return { data: [], total: 0 };
    }
  }

  /**
   * Get totals for QLDatHang_LietKe page
   * Converted from: QLDatHang_LietKe.aspx - CheckAllItem JavaScript calculation
   */
  async getTotals(query: QueryOrderDto): Promise<{ totalCount: number; totalPrice: number; totalVnd: number }> {
    try {
      const { website, username, status, statuses, search, startDate, endDate, quocGiaId } = query;

      let whereClause = 'WHERE dh.DaXoa = 0';

      if (website) whereClause += ` AND dh.WebsiteName LIKE '%${website}%'`;
      if (username) whereClause += ` AND dh.username LIKE '%${username}%'`;
      if (statuses && statuses.length > 0) {
        const statusList = statuses.map(s => `'${s}'`).join(',');
        whereClause += ` AND dh.trangthaiOrder IN (${statusList})`;
      } else if (status) {
        whereClause += ` AND dh.trangthaiOrder = '${status}'`;
      }
      if (search) whereClause += ` AND (dh.ordernumber LIKE '%${search}%' OR dh.username LIKE '%${search}%')`;
      if (startDate) whereClause += ` AND dh.ngaySaveLink >= '${startDate}'`;
      if (endDate) whereClause += ` AND dh.ngaySaveLink <= '${endDate}'`;
      if (quocGiaId && quocGiaId > 0) whereClause += ` AND dh.QuocGiaID = ${quocGiaId}`;

      const [result]: any[] = await this.sequelize.query(`
        SELECT
          SUM(dh.soluong) as totalCount,
          SUM(dh.giasauoffusd * dh.soluong) as totalPrice,
          SUM(dh.tongtienvnd) as totalVnd
        FROM dbo.DON_HANG dh
        ${whereClause}
      `);

      return {
        totalCount: Number(result[0]?.totalCount) || 0,
        totalPrice: Number(result[0]?.totalPrice) || 0,
        totalVnd: Number(result[0]?.totalVnd) || 0,
      };
    } catch (error) {
      console.error('Error in getTotals:', error.message);
      return { totalCount: 0, totalPrice: 0, totalVnd: 0 };
    }
  }

  /**
   * Get order counts by status for user (DanhSachDonHang.aspx)
   * Matches: DanhSachDonHang.cs -> LoadSoLuongDonHang -> SP_Lay_SoLuongDonHang(@username, @HangKhoan=-1, @DaXoa=false)
   */
  async getUserStatusCounts(username: string, hangKhoan: number = -1): Promise<any[]> {
    try {
      const results = await this.sequelize.query(
        `EXEC SP_Lay_SoLuongDonHang
          @username = :username,
          @HangKhoan = :hangKhoan,
          @DaXoa = 0`,
        { replacements: { username, hangKhoan }, type: 'SELECT' as const },
      );
      return Array.isArray(results) ? results : [];
    } catch (error) {
      console.error('Error in getUserStatusCounts:', (error as any).message);
      return [];
    }
  }

  /**
   * Delete order via SP (DanhSachDonHang.aspx)
   * Matches: DanhSachDonHang.cs -> lbtDelete_Click -> bLL.XoaDonHang(id, username)
   * Uses: SP_Xoa_DonHang @ID, @NguoiTao
   * Note: Only for orders with trangthaiOrder='Received' and HangKhoan=false (enforced by UI)
   */
  async xoaDonHangSP(id: number, nguoiTao: string): Promise<{ success: boolean }> {
    try {
      await this.sequelize.query(
        `EXEC SP_Xoa_DonHang @ID = :id, @NguoiTao = :nguoiTao`,
        { replacements: { id, nguoiTao }, type: QueryTypes.RAW },
      );
      return { success: true };
    } catch (error) {
      console.error('Error in xoaDonHangSP:', (error as any).message);
      return { success: false };
    }
  }

  /**
   * Update order for user (SuaDonHang.aspx)
   * Matches: SuaDonHang.cs -> btCapNhat_Click -> dBConnect.CapNhatDonHangSimple(...)
   * Uses: SP_CapNhatDonHangSimple (NOT CoTamTinh — different params: has @LoaiHangID, @MaSoHang; no @cong/@tax/@shipUSA)
   */
  async updateForUser(id: number, dto: {
    websiteName: string;
    username: string;
    linkWeb: string;
    linkHinh: string;
    color: string;
    size: string;
    soLuong: number;
    donGiaWeb: number;
    loaiTien: string;
    ghiChu: string;
    tyGia: number;
    saleOff: number;
    loaiHangId?: number | null;
    maSoHang?: string;
    quocGiaId?: number | null;
    nguoiTao: string;
  }): Promise<{ success: boolean }> {
    try {
      await this.sequelize.query(
        `EXEC SP_CapNhatDonHangSimple
          @ID = :id,
          @WebsiteName = :websiteName,
          @username = :username,
          @linkweb = :linkWeb,
          @linkhinh = :linkHinh,
          @corlor = :color,
          @size = :size,
          @soluong = :soLuong,
          @dongiaweb = :donGiaWeb,
          @loaitien = :loaiTien,
          @ghichu = :ghiChu,
          @tygia = :tyGia,
          @saleoff = :saleOff,
          @LoaiHangID = :loaiHangId,
          @MaSoHang = :maSoHang,
          @QuocGiaID = :quocGiaId,
          @NguoiTao = :nguoiTao`,
        {
          replacements: {
            id,
            websiteName: dto.websiteName || '',
            username: dto.username || '',
            linkWeb: dto.linkWeb || '',
            linkHinh: dto.linkHinh || '',
            color: dto.color || '',
            size: dto.size || '',
            soLuong: dto.soLuong,
            donGiaWeb: dto.donGiaWeb,
            loaiTien: dto.loaiTien || 'USD',
            ghiChu: dto.ghiChu || '',
            tyGia: dto.tyGia,
            saleOff: dto.saleOff || 0,
            loaiHangId: dto.loaiHangId ?? null,
            maSoHang: dto.maSoHang || '',
            quocGiaId: dto.quocGiaId ?? null,
            nguoiTao: dto.nguoiTao,
          },
          type: QueryTypes.RAW,
        },
      );
      return { success: true };
    } catch (error) {
      console.error('Error in updateForUser:', (error as any).message);
      return { success: false };
    }
  }
}
