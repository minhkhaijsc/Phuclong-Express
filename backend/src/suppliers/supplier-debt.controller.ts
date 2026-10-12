import { Controller, Get, Query } from '@nestjs/common';
import { Quyen } from '../auth/quyen/quyen.decorator';
import { SupplierDebtService } from './supplier-debt.service';
import type { LocCongNoNcc } from './supplier-debt.service';

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
  constructor(private readonly service: SupplierDebtService) {}

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
      }),
      { soDon: 0, tongNgoaiTe: 0, tongCong: 0, tongPhaiTra: 0, tongThuKhach: 0, laiLo: 0 },
    );

    return { tongHop, theoNcc, chiTiet, soDonChuaNhap };
  }
}
