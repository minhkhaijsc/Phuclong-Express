import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { VanHanhService } from './van-hanh.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Dashboard Controller
 *
 * Endpoint thống kê cho trang admin/dashboard.
 * Tất cả nhận ?fromDate&toDate (dd/MM/yyyy); mặc định tháng hiện tại.
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly vanHanhService: VanHanhService,
  ) {}

  /** KH mới theo ngày. */
  @Get('new-customers')
  async getNewCustomers(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getNewCustomersByDay(query.fromDate, query.toDate);
  }

  /** Doanh thu theo ngày (đơn đã hoàn tất). */
  @Get('revenue')
  async getRevenue(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getRevenueByDay(query.fromDate, query.toDate);
  }

  /** Sản lượng (kg) theo ngày. */
  @Get('output-daily')
  async getOutputDaily(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getOutputByDay(query.fromDate, query.toDate);
  }

  /** Sản lượng mỗi nhân viên theo tháng (số đơn + kg), lọc được theo Tuyến. */
  @Get('output-by-staff')
  async getOutputByStaff(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getOutputByStaff(query.fromDate, query.toDate, query.quocGiaId);
  }

  /** Chi tiết từng bản ghi CONGNO của 1 nhân viên trong 1 tháng, lọc được theo Tuyến. */
  @Get('output-detail')
  async getOutputDetail(
    @Query('nhanVien') nhanVien: string,
    @Query('thang') thang: string,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getOutputDetailByStaff(nhanVien || '', thang || '', query.quocGiaId);
  }

  // ---------------- VẬN HÀNH (mảng vận chuyển, tbTracking) ----------------
  //
  // Dashboard cũ chỉ đo DON_HANG và CONGNO, bỏ qua ~93% khối lượng thật.
  // Các đường dưới đây đo đúng mảng đó.

  /** Các con số đầu màn: kiện hôm nay, chưa có chủ, chưa có ảnh… */
  @Get('van-hanh/so-lieu')
  async laySoLieuVanHanh(@Query() q: any) {
    return this.vanHanhService.laySoLieu(q.fromDate, q.toDate, Number(q.quocGiaId) || undefined, q.khach);
  }

  /** Kiện về theo ngày, kèm phần chưa khớp được chủ. */
  @Get('van-hanh/theo-ngay')
  async kienTheoNgay(@Query() q: any) {
    return this.vanHanhService.kienTheoNgay(q.fromDate, q.toDate, Number(q.quocGiaId) || undefined, q.khach);
  }

  /** Sản lượng theo tuyến. */
  @Get('van-hanh/theo-tuyen')
  async kienTheoTuyen(@Query() q: any) {
    return this.vanHanhService.kienTheoTuyen(q.fromDate, q.toDate, q.khach);
  }

  /** Top khách theo sản lượng (đã loại tài khoản gom hàng chưa có chủ). */
  @Get('van-hanh/top-khach')
  async topKhach(@Query() q: any) {
    return this.vanHanhService.topKhach(q.fromDate, q.toDate, Number(q.quocGiaId) || undefined, Number(q.limit) || 10);
  }

  /** Cảnh báo chất lượng dữ liệu, hiện thẳng trên dashboard. */
  @Get('van-hanh/canh-bao')
  async canhBao() {
    return this.vanHanhService.canhBaoDuLieu();
  }

  /** Danh sách tuyến có dữ liệu, để đổ vào ô lọc. */
  @Get('van-hanh/tuyen')
  async danhSachTuyen() {
    return this.vanHanhService.danhSachTuyen();
  }
}
