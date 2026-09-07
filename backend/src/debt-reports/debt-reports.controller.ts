import { Controller, Get, Post, Put, Delete, Body, Query, Param, UseGuards, Request } from '@nestjs/common';
import { DebtReportsService } from './debt-reports.service';
import { QueryDebtReportDto, UpdateDebtDto, ExportDebtReportDto, QueryDebtReportByLotDto, QueryDebtReconciliationDto, UpdateOrderTotalVndDto, QueryTotalRevenueDto, QueryDebtByUserDto, QueryProfitLossByLotDto, QueryShippingSlipDto } from './dto/debt-report.dto';
import { QueryDebtManagementDto, CreateDebtDto, UpdateDebtManagementDto, ImportCreateDebtDto } from './dto/debt-management.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Debt Reports Controller
 *
 * Handles debt report operations
 */
@Controller('debt-reports')
@UseGuards(JwtAuthGuard)
export class DebtReportsController {
  constructor(private readonly debtReportsService: DebtReportsService) {}

  /**
   * Get detailed debt report with filters and pagination
   * Matches: LoadBaoCaoChiTietCongNo() in C#
   */
  @Get()
  async getDebtReports(@Query() query: QueryDebtReportDto) {
    return this.debtReportsService.getDebtReports(
      query.username,
      query.fromKyId,
      query.toKyId,
      query.page,
      query.limit,
    );
  }

  /**
   * Get all periods (Ky) for dropdown
   * Matches: LoadDanhSachKy() in C#
   */
  @Get('periods')
  async getPeriods(@Query('includeClosed') includeClosed?: boolean) {
    return this.debtReportsService.getPeriods(includeClosed);
  }

  /**
   * Get all users for dropdown
   * Matches: LoadDataUser() in C#
   */
  @Get('users')
  async getUsers() {
    return this.debtReportsService.getUsers();
  }

  /**
   * Update debt record
   * Matches: gvCongNo_RowUpdating() in C#
   */
  @Put(':id')
  async updateDebt(
    @Param('id') id: number,
    @Body() updateDto: UpdateDebtDto,
    @Request() req: any,
  ) {
    return this.debtReportsService.updateDebt(
      id,
      updateDto,
      req.user?.username || 'system',
    );
  }

  /**
   * Get customer debt report
   * Matches: LoadBaoCaoCongNoKhachhang() in C#
   */
  @Get('customer')
  async getCustomerDebtReport() {
    return this.debtReportsService.getCustomerDebtReport();
  }

  /**
   * Export customer debt report to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in C#
   */
  @Post('customer/export')
  async exportCustomerDebtReport() {
    return this.debtReportsService.exportCustomerDebtReport();
  }

  /**
   * Export debt report to Excel (all data with filter)
   * Matches: btExportToExcelAllWithFilter_Click() in C#
   */
  @Post('export')
  async exportDebtReport(@Body() exportDto: ExportDebtReportDto) {
    return this.debtReportsService.exportDebtReport(
      exportDto.username,
      exportDto.fromKyId,
      exportDto.toKyId,
    );
  }

  /**
   * Get debt report by lot (BaoCao_CongNoKhachHangTheoLo)
   * Matches: LoadBaoCaoCongNoKhachHangTheoLoHang() in C#
   */
  @Get('by-lot')
  async getDebtReportByLot(@Query() query: QueryDebtReportByLotDto) {
    return this.debtReportsService.getDebtReportByLot(
      query.fromDate,
      query.toDate,
    );
  }

  /**
   * Export debt report by lot to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in C#
   */
  @Post('by-lot/export')
  async exportDebtReportByLot(@Body() query: QueryDebtReportByLotDto) {
    return this.debtReportsService.exportDebtReportByLot(
      query.fromDate,
      query.toDate,
    );
  }

  // ========== BaoCao_CongNoTheoDotHang ==========

  /**
   * Get debt report by shipment lot
   * Matches: LoadBaoCao() in BaoCao_CongNoTheoDotHang.cs
   */
  @Get('by-shipment-lot')
  async getDebtReportByShipmentLot(@Query() query: QueryDebtReportByLotDto) {
    return this.debtReportsService.getDebtReportByShipmentLot(
      query.fromDate,
      query.toDate,
    );
  }

  /**
   * Export debt report by shipment lot to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in BaoCao_CongNoTheoDotHang.cs
   */
  @Post('by-shipment-lot/export')
  async exportDebtReportByShipmentLot(@Body() query: QueryDebtReportByLotDto) {
    return this.debtReportsService.exportDebtReportByShipmentLot(
      query.fromDate,
      query.toDate,
    );
  }

  // ========== BaoCao_DoiChieuCongNo ==========

  /**
   * Get debt reconciliation report
   * Matches: LoadBaoCaoDoiChieuCongNo() in BaoCao_DoiChieuCongNo.cs
   */
  @Get('reconciliation')
  async getDebtReconciliation(@Query() query: QueryDebtReconciliationDto) {
    return this.debtReportsService.getDebtReconciliationReport(
      query.fromDate,
      query.toDate,
      query.username,
      query.orderNumber,
    );
  }

  /**
   * Move order back to Received status
   * Matches: gvDoiChieuCongNo_RowCommand("ChuyenVeReceived") in C#
   */
  @Post('reconciliation/move-to-received')
  async moveToReceived(
    @Body() body: { ordernumber: string },
    @Request() req: any,
  ) {
    return this.debtReportsService.moveToReceived(
      body.ordernumber,
      req.user?.username || 'system',
    );
  }

  /**
   * Update order total amount in VND
   * Matches: gvDoiChieuCongNo_RowUpdating() in C#
   */
  @Put('reconciliation/update-total-vnd')
  async updateOrderTotalVND(
    @Body() body: UpdateOrderTotalVndDto,
    @Request() req: any,
  ) {
    return this.debtReportsService.updateOrderTotalVND(
      body.ordernumber,
      body.trackingNumber ?? '',
      body.tongTienOrderVND,
      req.user?.username || 'system',
    );
  }

  /**
   * Export debt reconciliation report to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in BaoCao_DoiChieuCongNo.cs
   */
  @Post('reconciliation/export')
  async exportDebtReconciliation(@Body() query: QueryDebtReconciliationDto) {
    return this.debtReportsService.exportDebtReconciliationReport(
      query.fromDate,
      query.toDate,
      query.username,
      query.orderNumber,
    );
  }

  // ========== BaoCao_TongDoanhThu ==========

  /**
   * Get total revenue report
   * Matches: LoadBaoCaoTongDoanhThu() in BaoCao_TongDoanhThu.cs
   */
  @Get('total-revenue')
  async getTotalRevenue(@Query() query: QueryTotalRevenueDto) {
    return this.debtReportsService.getTotalRevenueReport(
      query.fromDate,
      query.toDate,
    );
  }

  // ========== BaoCao_TongCongNoTheoUser ==========

  /**
   * Get total debt by user report
   * Matches: LoadBaoCaoTongCongNoTheoUser() in BaoCao_TongCongNoTheoUser.cs
   */
  @Get('debt-by-user')
  async getDebtByUser(@Query() query: QueryDebtByUserDto) {
    return this.debtReportsService.getTotalDebtByUser(
      query.fromDate,
      query.toDate,
      query.username,
    );
  }

  /**
   * Export total debt by user to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in BaoCao_TongCongNoTheoUser.cs
   */
  @Post('debt-by-user/export')
  async exportDebtByUser(@Body() query: QueryDebtByUserDto) {
    return this.debtReportsService.exportTotalDebtByUser(
      query.fromDate,
      query.toDate,
      query.username,
    );
  }

  // ========== BaoCao_PhanTichLaiLoTheoLoHang ==========

  /**
   * Get profit/loss analysis by lot
   * Matches: LoadBaoCaoPhanTichLaiLoTheoLoHang() in BaoCao_PhanTichLaiLoTheoLoHang.cs
   */
  @Get('profit-loss-by-lot')
  async getProfitLossByLot(@Query() query: QueryProfitLossByLotDto) {
    return this.debtReportsService.getProfitLossByLot(
      query.fromDate,
      query.toDate,
    );
  }

  /**
   * Export profit/loss by lot to Excel
   * Matches: btExportToExcel_Click() -> ExportToExcel() in BaoCao_PhanTichLaiLoTheoLoHang.cs
   */
  @Post('profit-loss-by-lot/export')
  async exportProfitLossByLot(@Body() query: QueryProfitLossByLotDto) {
    return this.debtReportsService.exportProfitLossByLot(
      query.fromDate,
      query.toDate,
    );
  }

  // ========== BaoCao_InPhieuShipTheoDotHang ==========

  /**
   * Get shipping slip by shipment lot
   * Matches: LoadBaoCao() in BaoCao_InPhieuShipTheoDotHang.cs
   */
  @Get('shipping-slip')
  async getShippingSlip(@Query() query: QueryShippingSlipDto) {
    return this.debtReportsService.getShippingSlip(
      query.orderId,
      query.user,
    );
  }

  // ========== Debt Management (ManageCongNo) ==========

  /**
   * Get debt management list with filters
   * Matches: LoadDanhSachCongNo() in ManageCongNo.cs
   */
  @Get('management/list')
  async getDebtManagementList(@Query() query: QueryDebtManagementDto) {
    return this.debtReportsService.getDebtManagementList(
      query.username,
      query.status,
      query.loaiPhatSinh,
      query.bankAccount,
      query.fromDate,
      query.toDate,
      query.page,
      query.limit,
      query.quocGiaId,
      query.loHang,
      query.orderNumber,
    );
  }

  /**
   * Create new debt record
   * Matches: btDongY_Click() -> Insert_CongNo() in ManageCongNo.cs
   */
  @Post('management')
  async createDebt(
    @Body() createDto: CreateDebtDto,
    @Request() req: any,
  ) {
    return this.debtReportsService.createDebt(
      createDto,
      req.user?.username || 'system',
    );
  }

  /**
   * Bulk-create debt records from a parsed Excel import ("Thêm mới công nợ" mode)
   * Matches: ManageCongNo_Import.cs in C# (add-new mode only)
   */
  @Post('management/import')
  async importCreateDebts(
    @Body() importDto: ImportCreateDebtDto,
    @Request() req: any,
  ) {
    return this.debtReportsService.importCreateDebts(
      importDto.rows,
      req.user?.username || 'system',
    );
  }

  /**
   * Update debt record
   * Matches: gvCongNo_RowUpdating() -> CapNhatCongNo() in ManageCongNo.cs
   */
  @Put('management/:id')
  async updateDebtManagement(
    @Param('id') id: number,
    @Body() updateDto: UpdateDebtManagementDto,
    @Request() req: any,
  ) {
    return this.debtReportsService.updateDebtManagement(
      id,
      updateDto,
      req.user?.username || 'system',
    );
  }

  /**
   * Delete debt record
   * Matches: gvCongNo_RowDeleting() -> XoaCongNo() in ManageCongNo.cs
   */
  @Delete('management/:id')
  async deleteDebt(
    @Param('id') id: number,
    @Request() req: any,
  ) {
    return this.debtReportsService.deleteDebt(
      id,
      req.user?.username || 'system',
    );
  }

  /**
   * Approve debt record
   * Matches: gvCongNo_RowCommand() -> ApproveCongNo() in ManageCongNo.cs
   */
  @Post('management/:id/approve')
  async approveDebt(
    @Param('id') id: number,
    @Request() req: any,
  ) {
    return this.debtReportsService.approveDebt(
      id,
      req.user?.username || 'system',
    );
  }

  /**
   * Get bank accounts for dropdown
   * Matches: LoadDanhSachTaiKhoanNganHang() in ManageCongNo.cs
   */
  @Get('management/bank-accounts')
  async getBankAccounts() {
    return this.debtReportsService.getBankAccounts();
  }

  /**
   * Get batches by username
   * Matches: LoadDanhSachLoHangTheoUser() in ManageCongNo.cs
   */
  @Get('management/batches')
  async getBatchesByUsername(@Query('username') username: string) {
    return this.debtReportsService.getBatchesByUsername(username);
  }

  /**
   * GET /debt-reports/user/chuyen-khoan
   * Get pending transfer list for user (ChuyenKhoan.aspx)
   * Matches: ChuyenKhoan.cs -> bLL.LayDanhSachCongNo(username, 0, 2)
   * SP: SP_Lay_CongNo @status=0, @style=2
   */
  @Get('user/chuyen-khoan')
  async getChuyenKhoanPendingList(@Query('username') username: string) {
    return this.debtReportsService.getChuyenKhoanPendingList(username);
  }
}
