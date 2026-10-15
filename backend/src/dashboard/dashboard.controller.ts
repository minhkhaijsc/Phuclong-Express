import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { VanHanhService } from './van-hanh.service';
import { TuoiNoService } from './tuoi-no.service';
import { KhachHangService } from './khach-hang.service';
import { SanLuongKhachService } from './san-luong-khach.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen, Quyen } from '../auth/quyen/quyen.decorator';
/**
 * Dashboard Controller
 *
 * Endpoint thống kê cho trang admin/dashboard.
 * Tất cả nhận ?fromDate&toDate (dd/MM/yyyy); mặc định tháng hiện tại.
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@MienQuyen('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly vanHanhService: VanHanhService,
    private readonly tuoiNoService: TuoiNoService,
    private readonly khachHangService: KhachHangService,
    private readonly sanLuongKhachService: SanLuongKhachService,
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

  /** Sản lượng theo TUYẾN và theo tháng — để so Hàn / Anh / Mỹ cạnh nhau. */
  @Get('output-by-route')
  async getOutputByRoute(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getOutputByRoute(query.fromDate, query.toDate);
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

  // ---------------- BÁO CÁO SẢN LƯỢNG KHÁCH HÀNG ----------------
  //
  // Màn con dưới Dashboard thống kê, yêu cầu bên khách 15/10/2026. Một dòng là
  // một cặp (khách × tuyến): kg, cước cân, phí mua hộ, tổng.

  /** Bảng khách × tuyến. Lọc được theo khoảng ngày, tuyến, và một khách. */
  @Get('san-luong-khach')
  async sanLuongKhach(@Query() q: any) {
    return this.sanLuongKhachService.bang(
      q.fromDate,
      q.toDate,
      Number(q.quocGiaId) || undefined,
      q.khach,
    );
  }

  /** Tuyến CÓ dữ liệu trong kỳ — đổ vào ô lọc của chính màn đó. */
  @Get('san-luong-khach/tuyen')
  async sanLuongKhachTuyen(@Query() q: any) {
    return this.sanLuongKhachService.tuyenCoDuLieu(q.fromDate, q.toDate);
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

  // ---------------- TUỔI NỢ ----------------
  //
  // PLE đã có 9 màn báo cáo công nợ nhưng không màn nào trả lời "ai nợ LÂU
  // nhất" — tất cả chỉ hiện số dư, không hiện thời gian.

  /** Bốn ô tổng hợp theo nhóm tuổi. */
  @Get('tuoi-no/tong-hop')
  async tuoiNoTongHop() {
    return this.tuoiNoService.tongHop();
  }

  /** Danh sách khách còn nợ; sapTheo = 'gia' (mặc định) | 'tien'. */
  @Get('tuoi-no/danh-sach')
  async tuoiNoDanhSach(@Query('sapTheo') sapTheo?: string, @Query('limit') limit?: string) {
    return this.tuoiNoService.danhSach(sapTheo === 'tien' ? 'tien' : 'gia', Number(limit) || 200);
  }

  /** Chi tiết các khoản còn nợ của một khách. */
  @Get('tuoi-no/chi-tiet')
  async tuoiNoChiTiet(@Query('khach') khach: string) {
    return this.tuoiNoService.chiTiet(khach);
  }

  // ---------------- TỔNG QUAN CỦA KHÁCH HÀNG ----------------
  //
  // Màn /tong-quan mà chính khách đăng nhập vào xem. Mọi đường dưới đây lấy
  // username TỪ JWT, không nhận từ query — xem ghi chú đầu `khach-hang.service.ts`.

  /**
   * Số liệu + sản lượng theo tuyến + chuỗi theo tháng, một lần gọi.
   *
   * `?khach=` CHỈ có tác dụng với tài khoản Admin (CSKH cần xem đúng thứ khách
   * đang thấy khi khách gọi lên hỏi). Khách thường truyền vào sẽ bị bỏ qua —
   * bỏ qua chứ không báo lỗi, vì đây không phải lỗi của người dùng thật, mà nếu
   * báo lỗi thì lại thành cách để dò xem username nào tồn tại.
   */
  @MienQuyen('rieng')
  @Get('khach-hang/tong-quan')
  async khachTongQuan(@Request() req: any, @Query('soThang') soThang?: string, @Query('khach') khach?: string) {
    return this.khachHangService.tongQuan(this.khachDuocXem(req, khach), Number(soThang) || undefined);
  }

  /** Danh sách khách để chọn khi xem hộ. Khách thường không được gọi. */
  @Quyen('xemDanhSachKhach')
  @Get('khach-hang/danh-sach')
  async khachDanhSach(@Query('tuKhoa') tuKhoa?: string) {
    return this.khachHangService.danhSachKhachCoDuLieu(tuKhoa);
  }

  /**
   * Được xem tổng quan của khách khác hay không.
   *
   * Trước đây chỗ này đòi đúng vai trò 'Admin'. Nhưng người cần xem hộ nhiều
   * nhất là CSKH — khách gọi lên hỏi "sao số của em lại thế này" thì CSKH phải
   * mở đúng màn hình khách đang thấy. Nay dùng quyền `xemDanhSachKhach`, tức
   * Admin và CSKH, khớp với yêu cầu "các bộ phận còn lại không được xem list tk
   * khách hàng".
   */
  private xemHoDuoc(req: any): boolean {
    return Array.isArray(req?.quyen?.quyen) && req.quyen.quyen.includes('xemDanhSachKhach');
  }

  /**
   * Username được phép xem: của chính mình, trừ khi là Admin và có chỉ định.
   *
   * Trả về chuỗi rỗng là KHÔNG được — truy vấn `UserName = ''` không khớp dòng
   * nào nên vẫn an toàn, nhưng JwtAuthGuard đã chặn trước, tới đây thì chắc
   * chắn có username.
   */
  private khachDuocXem(req: any, khach?: string): string {
    const toi = String(req?.user?.username ?? '').trim();
    const chiDinh = (khach ?? '').trim();
    if (chiDinh && this.xemHoDuoc(req)) return chiDinh;
    return toi;
  }
}
