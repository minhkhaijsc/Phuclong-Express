import type { MucGiaiThich } from '@/app/components/admin';

/**
 * Lời giải thích cho bốn ô số trên đầu Dashboard.
 *
 * Yêu cầu bên khách 19/10/2026: "bổ sung phần hướng dẫn đọc và giải thích ý
 * nghĩa của từng chỉ số để người dùng hiểu đúng số liệu và tránh nhầm lẫn".
 *
 * CHỮ Ở ĐÂY DÒ TỪ THỦ TỤC THẬT TRONG CSDL, không chép từ tên cột:
 *
 *   Tổng KH mới     SP_Dashboard_KhachHangMoiTheoNgay
 *   Doanh thu/Đơn   SP_Dashboard_DoanhThuTheoNgay
 *   Sản lượng       SP_Dashboard_SanLuongTheoNgay
 *
 * SỬA THỦ TỤC THÌ SỬA LUÔN Ở ĐÂY. Một lời giải thích sai còn tệ hơn không có:
 * không có thì người ta đi hỏi, sai thì người ta tin.
 *
 * Cố ý KHÔNG ghi số liệu cụ thể (kiểu "12 dòng bị loại") vào mấy đoạn này —
 * hôm nay đúng, tháng sau sai, mà không ai nhớ ra để sửa. Chỉ ghi LUẬT và
 * những cái mốc không đổi.
 */
export const GIAI_THICH: Record<'khMoi' | 'doanhThu' | 'soDon' | 'sanLuong', MucGiaiThich> = {
  khMoi: {
    yNghia: 'Số tài khoản khách hàng được tạo mới trên hệ thống trong khoảng ngày đang lọc.',
    congThuc: 'Đếm tài khoản khách theo NGÀY TẠO TÀI KHOẢN.',
    dieuKien: [
      'Tính theo ngày tạo tài khoản, không phải ngày phát sinh giao dịch.',
      'Khách đã có sẵn trên hệ thống, nay mới phát sinh giao dịch lần đầu thì KHÔNG được tính.',
      'Không tính tài khoản nhân viên — chỉ tài khoản khách hàng.',
    ],
    luuY:
      'Chỉ tài khoản có ghi ngày tạo mới vào được thống kê. Hệ thống bắt đầu ghi ngày tạo từ 01/08/2023; tài khoản cũ hơn không có ngày nên không xuất hiện ở đây.',
  },

  doanhThu: {
    yNghia: 'Tổng tiền (VNĐ) của các đơn đã hoàn tất trong khoảng ngày đang lọc.',
    congThuc: 'Cộng "tổng tiền VNĐ" của những đơn ở trạng thái Hoàn tất, xếp theo NGÀY HOÀN THÀNH.',
    dieuKien: [
      'Ghi nhận theo ngày hoàn thành đơn — không phải ngày tạo đơn, cũng không phải ngày khách thanh toán.',
      'Chỉ đơn trạng thái Hoàn tất. Đơn đang xử lý, đơn đã huỷ: không tính.',
      'Đơn đã xoá: không tính.',
    ],
    luuY:
      'Đơn hoàn tất mà thiếu ngày hoàn thành thì không vào được thống kê. Hệ thống bắt đầu ghi ngày này từ 22/05/2025, nên chọn khoảng trước mốc đó số sẽ rất thấp hoặc bằng 0.',
  },

  soDon: {
    yNghia: 'Số lượng đơn của đúng tập đơn đã tính ở ô Tổng doanh thu.',
    congThuc: 'Đếm đơn ở trạng thái Hoàn tất, xếp theo NGÀY HOÀN THÀNH.',
    dieuKien: [
      '"Hoàn tất" nghĩa là đơn đã được chuyển sang trạng thái Hoàn tất trên hệ thống.',
      'KHÔNG phải "đã giao thành công", cũng KHÔNG phải "đã thanh toán đủ" — hai việc đó hệ thống không dùng để tính ô này.',
      'Cùng bộ lọc với ô Tổng doanh thu, nên lấy Tổng doanh thu chia cho số này ra doanh thu bình quân mỗi đơn.',
    ],
  },

  sanLuong: {
    yNghia: 'Tổng số kg hàng cân trong khoảng ngày đang lọc.',
    congThuc: 'Cộng số kg trên các dòng công nợ loại "Cân Kg", xếp theo NGÀY GHI NỢ.',
    dieuKien: [
      'CHỈ hàng cân. Hàng mua hộ và các loại phát sinh khác không được tính vào đây.',
      'Ghi nhận theo ngày ghi nợ của dòng công nợ.',
      'Dòng công nợ đã xoá: không tính.',
    ],
    luuY:
      'Dòng nào mà lấy tiền chia cho số kg ra đơn giá nằm ngoài khoảng 50.000–2.000.000 đ/kg thì bị loại khỏi tổng, vì gần như chắc chắn là nhập nhầm đơn vị (nhập gam thành kg). Số bị loại rất ít, nhưng đây là lý do tổng ở đây có thể lệch vài kg so với khi cộng tay cả bảng công nợ.',
  },
};
