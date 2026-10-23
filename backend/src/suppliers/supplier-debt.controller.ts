import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Request } from '@nestjs/common';
import { Quyen } from '../auth/quyen/quyen.decorator';
import { SupplierDebtService } from './supplier-debt.service';
import type { LocCongNoNcc } from './supplier-debt.service';
import { SupplierPaymentService } from './supplier-payment.service';
import type { YeuCauGop, YeuCauTheoDon } from './supplier-payment.service';

/**
 * Công nợ phải trả nhà cung cấp — CHỈ Kế toán, Giám đốc, Admin.
 *
 * Quyền `congNoNcc` hẹp hơn `giaNcc` một bậc: yêu cầu bên khách cho Mua hàng
 * xem khối NCC trên đơn nhưng KHÔNG nêu Mua hàng ở trang công nợ phải trả.
 *
 * Để riêng một controller thay vì nhập vào `SuppliersController`: ở đó đã có
 * `@Get(':id')` với ParseIntPipe, thêm `@Get('cong-no')` vào sau là 400 vì
 * Nest khớp route theo thứ tự khai báo. Tách ra thì không có bẫy thứ tự nào.
 */
@Controller('supplier-debt')
@Quyen('congNoNcc')
export class SupplierDebtController {
  constructor(
    private readonly service: SupplierDebtService,
    private readonly thanhToan: SupplierPaymentService,
  ) {}

  /**
   * Cả trang trong MỘT lời gọi: gộp theo NCC, chi tiết từng đơn, và số đơn
   * chưa nhập giá. Ba truy vấn nhẹ trên cùng một bộ lọc — gọi ba lần từ web
   * thì ba lần đó có thể lệch nhau nếu có người nhập giá vào giữa.
   */
  @Get()
  async congNo(@Query() q: LocCongNoNcc) {
    const loc: LocCongNoNcc = {
      tuNgay: q.tuNgay || undefined,
      denNgay: q.denNgay || undefined,
      nccId: q.nccId ? Number(q.nccId) : undefined,
      trangThai: q.trangThai === 'con-no' || q.trangThai === 'da-tra' ? q.trangThai : undefined,
      page: q.page ? Number(q.page) : 1,
      limit: q.limit ? Number(q.limit) : 50,
    };

    const [theoNcc, chiTiet, soDonChuaNhap] = await Promise.all([
      this.service.tongTheoNcc(loc),
      this.service.chiTiet(loc),
      this.service.soDonChuaNhap(loc),
    ]);

    const tongHop = theoNcc.reduce(
      (a, r) => ({
        soDon: a.soDon + Number(r.soDon || 0),
        tongNgoaiTe: a.tongNgoaiTe + Number(r.tongNgoaiTe || 0),
        tongCong: a.tongCong + Number(r.tongCong || 0),
        tongPhaiTra: a.tongPhaiTra + Number(r.tongPhaiTra || 0),
        tongThuKhach: a.tongThuKhach + Number(r.tongThuKhach || 0),
        laiLo: a.laiLo + Number(r.laiLo || 0),
        daTra: a.daTra + Number(r.daTra || 0),
      }),
      { soDon: 0, tongNgoaiTe: 0, tongCong: 0, tongPhaiTra: 0, tongThuKhach: 0, laiLo: 0, daTra: 0 },
    );

    return { tongHop, theoNcc, chiTiet, soDonChuaNhap };
  }

  // ---------------- THANH TOÁN NCC (23/10/2026) ----------------
  //
  // Cùng quyền `congNoNcc` với trang xem: Kế toán, Giám đốc, Admin. Người trả
  // tiền nhà cung cấp chính là người đang xem sổ phải trả.

  /** Số dư từng NCC trên toàn sổ — phải trả, đã trả, còn nợ. */
  @Get('so-du')
  async soDu() {
    return this.thanhToan.soDu();
  }

  /** Danh sách phiếu thanh toán, lọc theo NCC + ngày trả. */
  @Get('thanh-toan')
  async danhSachPhieu(
    @Query('nccId') nccId?: string,
    @Query('tuNgay') tuNgay?: string,
    @Query('denNgay') denNgay?: string,
    @Query('coPhieuHuy') coPhieuHuy?: string,
  ) {
    return this.thanhToan.danhSach({
      nccId: nccId ? Number(nccId) : undefined,
      tuNgay,
      denNgay,
      coPhieuHuy: coPhieuHuy === '1',
    });
  }

  /** Phiếu đã trừ vào những đơn nào. */
  @Get('thanh-toan/:id')
  async chiTietPhieu(@Param('id', ParseIntPipe) id: number) {
    return this.thanhToan.chiTiet(id);
  }

  /** Trả THEO ĐƠN: tick đơn + số tiền từng đơn. */
  @Post('thanh-toan/theo-don')
  async lapTheoDon(@Body() body: YeuCauTheoDon, @Request() req: any) {
    return this.thanhToan.lapTheoDon(body ?? {}, req.user?.username || 'system');
  }

  /** Trả GỘP: chọn NCC + một cục tiền, tự trừ đơn cũ nhất trước. */
  @Post('thanh-toan/gop')
  async lapGop(@Body() body: YeuCauGop, @Request() req: any) {
    return this.thanhToan.lapGop(body ?? {}, req.user?.username || 'system');
  }

  /** Huỷ phiếu nhập nhầm (không xoá cứng). */
  @Post('thanh-toan/:id/huy')
  async huyPhieu(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.thanhToan.huy(id, req.user?.username || 'system');
  }
}
