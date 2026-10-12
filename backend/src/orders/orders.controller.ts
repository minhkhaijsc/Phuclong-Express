import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { QueryOrderListDto } from './dto/query-order-list.dto';
import { MassUpdateDto, MassDeleteDto, MassCompleteDto, MassReceivedDto, MassShippedDto, MassCancelDto } from './dto/mass-update.dto';
import { UpdateOrderNoteDto } from './dto/update-order-note.dto';
import { BatchUpdateNoteDto } from './dto/batch-update-note.dto';
import { UpdateReturnDateDto } from './dto/update-return-date.dto';
import { ImportOrdersDto, ImportOrderItemDto } from './dto/import-orders.dto';
import { QueryQLDatHangDto, QLDatHangResponseDto } from './dto/query-qldathang.dto';
import { CreateQuickOrderDto, CreateQuickOrdersDto } from './dto/create-quick-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen, Quyen } from '../auth/quyen/quyen.decorator';
/**
 * Orders Controller
 *
 * Handles order CRUD endpoints.
 */
@Controller('orders')
@UseGuards(JwtAuthGuard)
@MienQuyen('muaHang')
export class OrdersController {
  /**
   * Người gọi có xem được khối nhà cung cấp không.
   *
   * `req.quyen` do QuyenGuard gắn vào. Dùng `=== true` chứ không phải khác
   * undefined: thiếu `req.quyen` (route nào đó chưa qua guard) thì coi là KHÔNG
   * có quyền — siết, chứ không nới.
   */
  private coGiaNcc(req: any): boolean {
    return req?.quyen?.quyen?.includes('giaNcc') === true;
  }

  constructor(private readonly ordersService: OrdersService) {}

  // ========== SPECIAL ROUTES FIRST (before :id routes) ==========

  /**
   * GET /orders/usernames
   * Get list of usernames for can hang dropdown
   */
  @Get('usernames')
  async getUsernames(): Promise<{ username: string }[]> {
    return this.ordersService.getUsernames();
  }

  /**
   * GET /orders/batches
   * Get list of batches (DotHang) for can hang dropdown
   */
  @Get('batches')
  async getBatches(): Promise<{ tenDotHang: string }[]> {
    return this.ordersService.getBatches();
  }

  /**
   * GET /orders/product-types
   * Get product types (LoaiHang) for can hang dropdown
   */
  @Get('product-types')
  async getProductTypes(): Promise<{ data: Array<{ LoaiHangID: number; TenLoaiHang: string }> }> {
    return this.ordersService.getProductTypes();
  }

  /**
   * GET /orders/status-counts
   * Get order counts by status for can hang page
   */
  @Get('status-counts')
  async getStatusCounts(): Promise<Record<string, number>> {
    return this.ordersService.getStatusCounts();
  }

  /**
   * GET /orders/countries
   * Get list of countries (QuocGia) for dropdown
   */
  @Get('countries')
  async getQuocGia(
    @Query('all') all?: string,
  ): Promise<{ QuocGiaID: number; TenQuocGia: string; PhiShipVeVN: number }[]> {
    // ?all=1 -> lấy cả tuyến đã ẩn, dùng cho ô lọc để còn tra được dữ liệu cũ.
    return this.ordersService.getQuocGia(all === '1' || all === 'true');
  }

  /**
   * GET /orders/import-template
   * Download Excel template with dropdowns for username, currency, country
   */
  @Get('import-template')
  async downloadImportTemplate(@Res() res: Response): Promise<void> {
    const buffer = await this.ordersService.generateImportTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template_import_donhang.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /**
   * GET /orders/current-ty-gia?ids=1,2,3
   * Lấy tỷ giá hiện tại theo loại tiền của đơn hàng đầu tiên trong danh sách ID.
   * Dùng để auto-fill tỷ giá ở popup Mass Update (QLDatHang_MassUpdate.aspx → LoadTyGia).
   */
  @Get('current-ty-gia')
  async getCurrentTyGia(@Query('ids') ids: string): Promise<{ tyGia: number | null; loaiTien: string | null }> {
    return this.ordersService.getCurrentTyGiaFromOrders(ids || '');
  }

  /**
   * GET /orders/deleted
   * List deleted orders with filters
   */
  @Get('deleted')
  async findDeleted(@Query() query: QueryOrderDto): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    return this.ordersService.findDeleted(query);
  }

  /**
   * GET /orders/deleted/status-counts
   * Get count of deleted orders by status (for CheckBoxList with counts)
   */
  @Get('deleted/status-counts')
  async getDeletedStatusCounts(): Promise<{ status: string; count: number }[]> {
    return this.ordersService.getDeletedStatusCounts();
  }

  /**
   * POST /orders/calculate-shipping
   * Calculate shipping fee based on weight, product type, currency, and user
   */
  @Quyen('muaHang.xem')
  @Post('calculate-shipping')
  @HttpCode(HttpStatus.OK)
  async calculateShipping(
    @Body() body: { weight: number; loaiHangId: number; loaiTien: string; username: string },
  ): Promise<{ shippingFee: number }> {
    return this.ordersService.calculateShipping(body);
  }

  /**
   * PUT /orders/:id/can-hang
   * Update weighed order fields from CanHang.gvDonHang_RowUpdating.
   */
  @Put(':id/can-hang')
  async updateCanHang(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { loaiHangId: number; canHangSoKg: number; canHangTienShipVeVn: number; canHangTienShipTrongNuoc?: number; canHangGhiChuShipVeVn?: string },
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    return this.ordersService.updateCanHang(id, body, req.user?.username || 'system');
  }

  // ========== MAIN CRUD ROUTES ==========

  /**
   * GET /orders/exchange-rates
   * Get exchange rates (TyGia) for EditOrderDetail
   * Converted from: EditOrderDetail.cs - LoadDataTyGia()
   */
  @Get('exchange-rates')
  async getExchangeRates(): Promise<{ name: string; tyGiaVND: number; congShipVeVN: number }[]> {
    return this.ordersService.getExchangeRates();
  }

  /**
   * GET /orders/product-types-detail
   * Get product types (LoaiHang) for EditOrderDetail
   * Converted from: EditOrderDetail.cs - LoadDataLoaiHang()
   */
  @Get('product-types-detail')
  async getLoaiHang(): Promise<{ LoaiHangID: number; TenLoaiHang: string }[]> {
    return this.ordersService.getLoaiHang();
  }

  /**
   * POST /orders/calculate-fee
   * Calculate service fee (GiaTienCong) for EditOrderDetail
   * Converted from: EditOrderDetail.cs - drLoaitien_SelectedIndexChanged()
   *
   * Body: { loaiTien: string, donGiaWeb: number, username: string }
   */
  @Quyen('muaHang.xem')
  @Post('calculate-fee')
  @HttpCode(HttpStatus.OK)
  async getGiaTienCong(
    @Body() body: { loaiTien: string; donGiaWeb: number; username: string },
  ): Promise<{ tienCong1Mon: number; tinhTheoPhanTram: boolean }> {
    return this.ordersService.getGiaTienCong(body.loaiTien, body.donGiaWeb, body.username);
  }

  /**
   * GET /orders
   * List orders with filters and pagination
   */
  @Get()
  async findAll(
    @Query() query: QueryOrderDto,
    @Request() req: any,
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    return this.ordersService.findAll(query, this.coGiaNcc(req));
  }

  /**
   * POST /orders/list
   * List orders with filters and pagination (POST method for complex filters)
   */
  @Quyen('muaHang.xem')
  @Post('list')
  async findAllPost(
    @Body() query: QueryOrderListDto,
    @Request() req: any,
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    return this.ordersService.findAll(query as QueryOrderDto, this.coGiaNcc(req));
  }

  /**
   * POST /orders/qldathang-list
   * Get orders for Order Management List page (QLDatHang_LietKe)
   * Converted from: QLDatHang_LietKe.aspx.cs
   *
   * Response matches DonHangPhanTrang from C#:
   * - totalItem: total count
   * - danhSachDonHang: list of orders
   * - page, limit: pagination
   */
  @Quyen('muaHang.xem')
  @Post('qldathang-list')
  async getQLDatHangList(
    @Body() query: QueryQLDatHangDto,
    @Request() req: any,
  ): Promise<QLDatHangResponseDto> {
    return this.ordersService.getQLDatHangList(query, this.coGiaNcc(req));
  }

  /**
   * POST /orders
   * Create new order
   */
  @Post()
  async create(@Body() createOrderDto: CreateOrderDto): Promise<Order> {
    return this.ordersService.create(createOrderDto);
  }

  /**
   * POST /orders/quick
   * Create quick order (DatHangM - simple order)
   * Converted from: DatHangM.aspx - ThemDatHangSimple
   */
  /**
   * Inject actor từ JWT để fallback cho `usernameSave` & `nguoiTao` khi FE quên gửi.
   * SP_Them_DonHang_Simple dùng `@usernamesave` làm NguoiTao khi insert CONGNO (note.txt:5565),
   * nếu trống sẽ tạo CONGNO `NguoiTao=''`. Legacy luôn pass `base.User.Identity.GetUserName()`.
   */
  @Post('quick')
  @HttpCode(HttpStatus.OK)
  async createQuickOrder(
    @Body() createQuickOrderDto: CreateQuickOrderDto,
    @Request() req: any,
  ): Promise<{ success: boolean; error?: string }> {
    const actorUsername = req.user?.username || '';
    if (!createQuickOrderDto.usernameSave) {
      createQuickOrderDto.usernameSave = actorUsername;
    }
    if (!createQuickOrderDto.nguoiTao) {
      createQuickOrderDto.nguoiTao = actorUsername;
    }
    return this.ordersService.createQuickOrder(createQuickOrderDto);
  }

  /**
   * POST /orders/quick/calculate
   * Calculate service fee for QLDatHang_Them footer form
   * Converted from: QLDatHang_Them.cs - giaTienCong calculation
   */
  @Quyen('muaHang.xem')
  @Post('quick/calculate')
  @HttpCode(HttpStatus.OK)
  async calculateTienCong(
    @Body() params: { loaiTien: string; donGiaWeb: number; soLuong: number; saleOff: number; cong: number; tyGia: number; username: string; tax?: number; shipUsa?: number; phuThu?: number },
  ): Promise<{ tienCongVnd: number; giaSauOffUsd: number; tongTienUsd: number; tongTienVnd: number }> {
    return this.ordersService.calculateTienCong(params);
  }

  /**
   * POST /orders/quick/upload-image
   * Upload and resize image for QLDatHang_Them footer form
   * Converted from: QLDatHang_Them.cs - fuHinhAnh upload
   */
  @Post('quick/upload-image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadQuickOrderImage(
    @UploadedFile() file: any,
  ): Promise<{ linkHinh: string }> {
    return this.ordersService.uploadQuickOrderImage(file);
  }

  /**
   * POST /orders/quick/add
   * Create order for QLDatHang_Them page (uses SP_Them_DonHang_Simple_CoTamTinh)
   * Converted from: QLDatHang_Them.cs - Insert command
   */
  @Post('quick/add')
  @HttpCode(HttpStatus.OK)
  async createQuickOrderAdd(
    @Body() createQuickOrderDto: CreateQuickOrderDto,
    @Request() req: any,
  ): Promise<{ success: boolean; error?: string }> {
    const actorUsername = req.user?.username || '';
    if (!createQuickOrderDto.usernameSave) {
      createQuickOrderDto.usernameSave = actorUsername;
    }
    if (!createQuickOrderDto.nguoiTao) {
      createQuickOrderDto.nguoiTao = actorUsername;
    }
    return this.ordersService.createQuickOrderCoTamTinh(createQuickOrderDto);
  }

  /**
   * POST /orders/quick/batch
   * Create multiple quick orders at once
   * Converted from: DatHangM.aspx - GuiYeuCau
   */
  @Post('quick/batch')
  @HttpCode(HttpStatus.OK)
  async createQuickOrders(
    @Body() createQuickOrdersDto: CreateQuickOrdersDto,
    @Request() req: any,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    return this.ordersService.createQuickOrders(createQuickOrdersDto, req.user?.username || 'system');
  }

  /**
   * POST /orders/mass-delete
   * Mass soft delete orders
   */
  @Post('mass-delete')
  @HttpCode(HttpStatus.OK)
  async massDelete(@Body() massDeleteDto: MassDeleteDto, @Request() req: any): Promise<{ deleted: number }> {
    return this.ordersService.massDelete(massDeleteDto, req.user?.username || 'system');
  }

  /**
   * POST /orders/mass-cancel
   * Mass cancel orders với ghi chú lý do hủy (legacy parity).
   * Calls SP_CapNhat_MassCancel(@id, @ghichu, @NguoiTao) — KHÔNG dùng SP_ShareOrders.
   */
  @Post('mass-cancel')
  @HttpCode(HttpStatus.OK)
  async massCancel(@Body() massCancelDto: MassCancelDto, @Request() req: any): Promise<{ cancelled: number }> {
    return this.ordersService.massCancel(massCancelDto, req.user?.username || 'system');
  }

  /**
   * POST /orders/mass-update
   * Mass update orders
   */
  @Post('mass-update')
  @HttpCode(HttpStatus.OK)
  async massUpdate(@Body() massUpdateDto: MassUpdateDto): Promise<{ updated: number }> {
    return this.ordersService.massUpdate(massUpdateDto);
  }

  /**
   * POST /orders/mass-complete
   * Mass complete orders using stored procedure (giống EditOrder logic)
   */
  @Post('mass-complete')
  @HttpCode(HttpStatus.OK)
  async massComplete(@Body() massCompleteDto: MassCompleteDto, @Request() req: any): Promise<{ completed: number }> {
    const ids = massCompleteDto.ids.join(',');
    return this.ordersService.massComplete(
      ids,
      req.user?.username || 'system',
      massCompleteDto.nguon,
      massCompleteDto.ngayHoanThanh,
    );
  }

  /**
   * POST /orders/mass-received
   * Mass received orders using stored procedure (giống EditOrder logic)
   * Converted from: EditOrder.cs - lbtMassReceived_Click + DBConnect.MassReceived
   * Checks kỳ đóng before executing
   * Logs action to system logs
   */
  @Post('mass-received')
  @HttpCode(HttpStatus.OK)
  async massReceived(@Body() massReceivedDto: MassReceivedDto, @Request() req: any): Promise<{ received: number }> {
    const ids = massReceivedDto.ids.join(',');
    return this.ordersService.massReceived(ids, req.user?.username || 'system');
  }

  /**
   * POST /orders/mass-shipped
   * Mass shipped orders using stored procedure (giống EditOrder logic)
   * Converted from: EditOrder.cs - lbtMassShipped_Click + DBConnect.MassShipped
   * Calls: SP_CapNhat_MassShipped (@id)
   * Logs action to system logs
   */
  @Post('mass-shipped')
  @HttpCode(HttpStatus.OK)
  async massShipped(@Body() massShippedDto: MassShippedDto, @Request() req: any): Promise<{ shipped: number }> {
    const ids = massShippedDto.ids.join(',');
    return this.ordersService.massShipped(ids, req.user?.username || 'system', massShippedDto.nguon);
  }

  /**
   * POST /orders/import
   * Import orders from Excel
   */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async importOrders(
    @UploadedFile() file: any,
    @Body() importDto: ImportOrdersDto,
  ): Promise<{ imported: number; errors?: string[] }> {
    return this.ordersService.importOrders(file, importDto);
  }

  /**
   * POST /orders/import-json
   * Import orders from parsed Excel rows (JSON)
   */
  @Post('import-json')
  @HttpCode(HttpStatus.OK)
  async importOrdersJson(
    @Body() body: { items: ImportOrderItemDto[]; mode?: string },
    @Request() req: any,
  ): Promise<{ imported: number; errors: string[] }> {
    const nguoiTao: string = req.user?.username || '';
    return this.ordersService.importOrdersJson(body.items || [], body.mode || '0', nguoiTao);
  }

  /**
   * PUT /orders/tracking-number
   * Update tracking number for LIST_ORDER (TrackingNumber.aspx)
   * Uses orderNumber (string) as param, matching C# capNhatTrackingNumber
   */
  @Put('tracking-number')
  async updateTrackingNumber(
    @Body() body: { orderNumber: string; trackingNumber: string; ngayNhanTaiNuocNgoai: string; trackingLink: string },
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    return this.ordersService.updateTrackingNumber(body.orderNumber, body.trackingNumber, body.ngayNhanTaiNuocNgoai, body.trackingLink, req.user?.username || 'system');
  }

  /**
   * GET /orders/totals
   * Get totals for QLDatHang_LietKe page (Total count, Total price, Total VND)
   */
  @Get('totals')
  async getTotals(@Query() query: QueryOrderDto): Promise<{ totalCount: number; totalPrice: number; totalVnd: number }> {
    return this.ordersService.getTotals(query);
  }

  /**
   * GET /orders/user-status-counts
   * Get order badge counts by status for user (DanhSachDonHang.aspx)
   * Matches: DanhSachDonHang.cs -> SP_Lay_SoLuongDonHang(@username, @HangKhoan=-1, @DaXoa=false)
   */
  @Get('user-status-counts')
  async getUserStatusCounts(
    @Query('username') username: string,
    @Query('hangKhoan') hangKhoan?: string,
  ): Promise<any[]> {
    return this.ordersService.getUserStatusCounts(username, hangKhoan !== undefined ? Number(hangKhoan) : -1);
  }

  // ========== PARAMETERIZED ROUTES (must come last) ==========

  /**
   * GET /orders/:id
   * Get order by ID
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<Order> {
    return this.ordersService.findOne(id, includeDeleted === 'true', this.coGiaNcc(req));
  }

  /**
   * PUT /orders/:id
   * Update order — inject actor từ JWT (req.user) để truyền `@NguoiTao` xuống SP,
   * tránh fallback 'system' khi FE quên gửi `usernameSave` trong body.
   */
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @Request() req: any,
  ): Promise<Order> {
    return this.ordersService.update(id, updateOrderDto, req.user?.username || '');
  }

  /**
   * DELETE /orders/:id
   * Soft delete order
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any): Promise<void> {
    return this.ordersService.remove(id, req.user?.username || 'system');
  }

  /**
   * POST /orders/:id/restore
   * Restore soft-deleted order
   */
  @Post(':id/restore')
  async restore(@Param('id', ParseIntPipe) id: number, @Request() req: any): Promise<Order> {
    return this.ordersService.restore(id, req.user?.username || 'system');
  }

  /**
   * POST /orders/batch-restore
   * Restore multiple deleted orders
   */
  @Post('batch-restore')
  async batchRestore(@Body() body: { ids: number[] }, @Request() req: any): Promise<{ success: boolean; count: number }> {
    return this.ordersService.batchRestore(body.ids, req.user?.username || 'system');
  }

  /**
   * DELETE /orders/:id/permanent
   * Permanently delete an order (vĩnh viễn xóa)
   */
  @Delete(':id/permanent')
  async permanentDelete(@Param('id', ParseIntPipe) id: number, @Request() req: any): Promise<{ success: boolean }> {
    return this.ordersService.permanentDelete(id, req.user?.username || 'system');
  }

  /**
   * POST /orders/batch-cancel
   * Mass cancel deleted orders
   */
  @Post('batch-cancel')
  async batchCancel(@Body() body: { ids: number[] }, @Request() req: any): Promise<{ success: boolean; count: number }> {
    return this.ordersService.batchCancel(body.ids, req.user?.username || 'system');
  }

  /**
   * POST /orders/batch-complete
   * Mass complete deleted orders (only Ordered/Shipped)
   */
  @Post('batch-complete')
  async batchComplete(@Body() body: { ids: number[] }, @Request() req: any): Promise<{ success: boolean; count: number; message?: string }> {
    return this.ordersService.batchComplete(body.ids, req.user?.username || 'system');
  }

  /**
   * POST /orders/batch-received
   * Mass set orders to Received status
   */
  @Post('batch-received')
  async batchReceived(@Body() body: { ids: number[] }, @Request() req: any): Promise<{ success: boolean; count: number }> {
    return this.ordersService.batchReceived(body.ids, req.user?.username || 'system');
  }

  /**
   * POST /orders/batch-shipped
   * Mass set orders to Shipped status
   */
  @Post('batch-shipped')
  async batchShipped(@Body() body: { ids: number[] }, @Request() req: any): Promise<{ success: boolean; count: number }> {
    return this.ordersService.batchShipped(body.ids, req.user?.username || 'system');
  }

  /**
   * GET /orders/:id/details
   * Get order details (products in order)
   */
  @Get(':id/details')
  async findDetails(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<Order> {
    return this.ordersService.findOne(id, includeDeleted === 'true', this.coGiaNcc(req));
  }

  /**
   * PUT /orders/note/batch
   * Add additional note to one or more orders (batch)
   * Body: { ids: number[], boSungGhiChu: string }
   */
  @Put('note/batch')
  @HttpCode(HttpStatus.OK)
  async updateNoteBatch(
    @Body() batchDto: BatchUpdateNoteDto,
    @Request() req: any,
  ): Promise<any> {
    console.log('[updateNoteBatch] received:', JSON.stringify(batchDto));
    return this.ordersService.updateNote(batchDto.ids, { boSungGhiChu: batchDto.boSungGhiChu }, req.user?.username || 'system');
  }

  /**
   * PUT /orders/:id/note
   * Add additional note to single order
   */
  @Put(':id/note')
  async updateNoteSingle(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateNoteDto: UpdateOrderNoteDto,
    @Request() req: any,
  ): Promise<Order> {
    return this.ordersService.updateNote([id], updateNoteDto, req.user?.username || 'system');
  }

  /**
   * PUT /orders/:id/return-date
   * Update return date to Vietnam
   */
  @Put(':id/return-date')
  async updateReturnDate(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateReturnDateDto: UpdateReturnDateDto,
    @Request() req: any,
  ): Promise<Order> {
    return this.ordersService.updateReturnDate(id, updateReturnDateDto, req.user?.username || 'system');
  }

  // ========== EDIT ORDER DETAIL ENDPOINTS (converted from EditOrderDetail.cs) ==========

  /**
   * POST /orders/:id/upload-image
   * Upload and resize image to 640x480 for EditOrderDetail
   * Converted from: EditOrderDetail.cs - fuHinhAnh upload logic
   *
   * Saves to: /imgLink/YYYYMM/ directory
   */
  @Post(':id/upload-image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
  ): Promise<{ linkHinh: string }> {
    return this.ordersService.uploadImage(id, file);
  }

  /**
   * PUT /orders/:id/detail
   * Update order detail with full edit flow
   * Converted from: EditOrderDetail.cs - btCapNhat_Click
   *
   * Checks: SP_KiemTra_DuocCapNhatDonHang (kỳ đóng)
   * Updates: SP_CapNhatDonHang
   * Logs: SystemLogs
   * Updates: ngayVeVN via SP_CapNhat_NgayVeVN
   */
  @Put(':id/detail')
  async updateOrderDetail(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Request() req: any,
  ): Promise<{ success: boolean; error?: string }> {
    return this.ordersService.updateOrderDetail(
      id,
      body,
      req.user?.username || 'system',
      this.coGiaNcc(req),
    );
  }

  /**
   * POST /orders/search-by-tracking
   * Search orders by order number OR tracking number (TrackingNumber.aspx)
   * Calls BLL.LayDanhSachListOrder with both parameters
   */
  @Quyen('muaHang.xem')
  @Post('search-by-tracking')
  async searchByOrderOrTracking(
    @Body() body: { orderNumber?: string; trackingNumber?: string; page?: number; limit?: number },
  ): Promise<{ data: any[]; total: number }> {
    return this.ordersService.searchByOrderOrTracking(body.orderNumber || '', body.trackingNumber || '', body.page, body.limit);
  }

  /**
   * DELETE /orders/:id/sp-xoa
   * Delete order via SP (DanhSachDonHang.aspx - only Received, non-HangKhoan)
   * Matches: DanhSachDonHang.cs -> lbtDelete_Click -> SP_Xoa_DonHang(@ID, @NguoiTao)
   */
  @Delete(':id/sp-xoa')
  async xoaDonHangSP(
    @Param('id', ParseIntPipe) id: number,
    @Query('nguoiTao') nguoiTao: string,
  ): Promise<{ success: boolean }> {
    return this.ordersService.xoaDonHangSP(id, nguoiTao);
  }

  /**
   * PUT /orders/:id/user-update
   * Update order for user (SuaDonHang.aspx)
   * Matches: SuaDonHang.cs -> btCapNhat_Click -> SP_CapNhatDonHangSimple
   * Different from PUT /orders/:id which uses SP_CapNhatDonHangSimpleCoTamTinh (admin)
   */
  @Put(':id/user-update')
  async updateForUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
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
    },
  ): Promise<{ success: boolean }> {
    return this.ordersService.updateForUser(id, body);
  }
}
