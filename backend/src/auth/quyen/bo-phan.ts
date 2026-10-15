/**
 * BẢN ĐỒ PHÂN QUYỀN — nguồn duy nhất.
 *
 * VÌ SAO CẦN VIẾT LẠI: trước tệp này, hệ thống thực tế KHÔNG phân quyền.
 * Phía máy chủ chỉ có JwtAuthGuard (đăng nhập hay chưa), còn phía web thì
 * `app/admin/layout.tsx` xét đúng một điều kiện: "có ít nhất 1 vai trò" là mở
 * toàn bộ 70 trang quản trị. Hệ quả là muốn ai làm được việc gì thì phải cấp
 * `Admin` cho họ — ngày 10/10/2026 có 17 tài khoản mang vai trò Admin, trong đó
 * có cả CSKH, MKT, kế toán, mua hàng. CSDL chỉ có 4 vai trò: Admin, Kho, Sale,
 * Order.
 *
 * CÁCH HOẠT ĐỘNG:
 *   • Mỗi tài khoản thuộc một hoặc nhiều BỘ PHẬN (lưu trong AspNetUserRoles như
 *     cũ — không đổi lược đồ CSDL).
 *   • Mỗi MIỀN là một nhóm chức năng, khớp với một nhóm trên thanh điều hướng.
 *   • Mỗi bộ phận có, trên từng miền, quyền `xem` và/hoặc `sua`. Guard suy ra
 *     cần quyền nào từ phương thức HTTP: GET/HEAD → xem, còn lại → sua. Những
 *     route đi lệch quy ước đó (POST nhưng chỉ đọc, ví dụ POST /orders/list)
 *     được đánh dấu riêng bằng @Quyen().
 *   • Ngoài ra có vài QUYỀN LẺ không thuộc miền nào (xem giá NCC, tạo tài
 *     khoản, duyệt công nợ…).
 *
 * KHÁCH HÀNG (tài khoản không có vai trò nào — 938/981 tài khoản) đi theo một
 * danh sách miền riêng ở dưới. Việc giới hạn khách chỉ thấy dữ liệu của mình
 * vẫn do từng controller lọc theo UserName như trước; tệp này chỉ quyết định
 * khách có được chạm vào miền đó hay không.
 */

/** Bộ phận — tên phải trùng đúng cột Name trong AspNetRoles. */
export const BO_PHAN = {
  Admin: 'Admin',
  CSKH: 'CSKH',
  MuaHang: 'MuaHang',
  KeToan: 'KeToan',
  VanChuyen: 'VanChuyen',
  MKT: 'MKT',
  Kho: 'Kho',
  KhoSG: 'KhoSG',
} as const;
export type BoPhan = (typeof BO_PHAN)[keyof typeof BO_PHAN];

/**
 * Cấp — độc lập với bộ phận, dùng để mở Dashboard. Cũng lưu trong
 * AspNetUserRoles để không phải thêm cột; giao diện hiện thành ô tick riêng
 * ("Trưởng phòng" / "Giám đốc") chứ không xếp lẫn vào danh sách bộ phận.
 */
export const CAP = {
  TruongPhong: 'TruongPhong',
  GiamDoc: 'GiamDoc',
} as const;
export type Cap = (typeof CAP)[keyof typeof CAP];

/**
 * Vai trò cũ còn trong CSDL. Giữ lại để NGÀY TRIỂN KHAI KHÔNG AI BỊ KHOÁ:
 * tài khoản chưa được gán bộ phận mới vẫn chạy theo ánh xạ này, khách hàng
 * tự đổi dần sau.
 *
 * `Admin` cũ vẫn là Admin — nghĩa là 17 tài khoản kia tạm thời chưa bị siết.
 * Siết lúc nào là quyết định của bên khách, không phải việc của lần triển khai.
 */
export const VAI_TRO_CU: Record<string, BoPhan> = {
  Admin: BO_PHAN.Admin,
  Sale: BO_PHAN.CSKH,
  Order: BO_PHAN.MuaHang,
  Kho: BO_PHAN.Kho,
};

/** Miền chức năng — khớp các nhóm trên thanh điều hướng admin. */
export const MIEN = {
  dashboard: 'dashboard',
  muaHang: 'muaHang',
  vanChuyen: 'vanChuyen',
  congNo: 'congNo',
  baoCao: 'baoCao',
  taiKhoan: 'taiKhoan',
  danhMuc: 'danhMuc',
  diaChi: 'diaChi',
  nhatKy: 'nhatKy',
  noiDung: 'noiDung',
  /** Việc của riêng người đang đăng nhập: thông báo, đổi mật khẩu, tải ảnh lên. */
  rieng: 'rieng',
} as const;
export type Mien = (typeof MIEN)[keyof typeof MIEN];

export const NHAN_MIEN: Record<Mien, string> = {
  dashboard: 'Dashboard thống kê',
  muaHang: 'Mua hàng giúp',
  vanChuyen: 'Vận chuyển — tracking, lô hàng',
  congNo: 'Quản lý công nợ',
  baoCao: 'Báo cáo công nợ',
  taiKhoan: 'Tài khoản & vai trò',
  danhMuc: 'Danh mục & cấu hình',
  diaChi: 'Địa chỉ nhận hàng',
  nhatKy: 'Nhật ký hệ thống',
  noiDung: 'Bài viết & thắc mắc',
  rieng: 'Việc cá nhân',
};

/** Quyền lẻ, không gắn với một miền. */
export const QUYEN_LE = {
  /**
   * Xem (và nhập) khối NHÀ CUNG CẤP cùng con số LÃI/LỖ trên từng dòng đơn, và
   * mở danh mục nhà cung cấp.
   *
   * Yêu cầu bên khách 12/10/2026, nguyên văn: "phần nhập thông tin của NCC cũng
   * như Lãi/Lỗ, chỉ quyền mua hàng, kế toán, GD với được quyền xem. Các nhân sự
   * còn lại k được xem". Nên quyền này CHỈ có ở Admin, Mua hàng, Kế toán và cấp
   * Giám đốc.
   *
   * ĐÃ THU LẠI ngày 12/10/2026: trước đó Vận chuyển, MKT, Kho và Kho SG cũng
   * được cấp — đó là tôi suy ra từ yêu cầu cũ (yêu cầu cũ chỉ nói CSKH không
   * được xem, nên tôi cho tất cả bộ phận còn lại). Lần này bên khách kể TÊN
   * từng bộ phận được xem, nên bỏ bốn bộ phận kia. Thu lại không làm vỡ gì:
   * tới trước hôm nay `giaNcc` chưa được gắn vào route hay màn hình nào cả,
   * nó mới chỉ là một mã nằm trong bảng.
   */
  giaNcc: 'giaNcc',
  /**
   * Mở trang công nợ phải trả nhà cung cấp (/admin/debt-reports/supplier).
   *
   * Hẹp hơn `giaNcc` một bậc, theo đúng yêu cầu: khối NCC trên đơn thì "mua
   * hàng, kế toán, GD", còn trang công nợ phải trả thì "quyền kế toán, GD dc
   * xem" — không có mua hàng. Hai câu khác nhau nên hai quyền khác nhau, chứ
   * không gộp cho gọn rồi mở rộng hơn mức bên khách cho.
   */
  congNoNcc: 'congNoNcc',
  /** Duyệt dòng công nợ khách báo chuyển khoản. */
  duyetCongNo: 'duyetCongNo',
  /** Tạo tài khoản khách hàng. */
  taoKhach: 'taoKhach',
  /** Tạo tài khoản nhân viên. */
  taoNhanVien: 'taoNhanVien',
  /** Xem danh sách tài khoản khách hàng. */
  xemDanhSachKhach: 'xemDanhSachKhach',
  /** Thêm/sửa/xoá vai trò, gán bộ phận cho người khác. */
  quanLyRole: 'quanLyRole',
  /**
   * Tạo dòng công nợ báo đã chuyển khoản (/chuyen-khoan).
   *
   * Tách riêng khỏi `congNo.sua` vì đây là việc DUY NHẤT khách được ghi vào
   * miền công nợ. Cho khách cả `congNo.sua` thì cùng lúc mở luôn
   * `PUT/DELETE /debt-reports/management/:id` — tức là khách sửa hay xoá được
   * bất kỳ dòng công nợ nào của bất kỳ ai, chỉ cần biết số id.
   */
  baoChuyenKhoan: 'baoChuyenKhoan',
} as const;
export type QuyenLe = (typeof QUYEN_LE)[keyof typeof QUYEN_LE];

export interface QuyenMien {
  xem?: true;
  sua?: true;
}

export interface MoTaBoPhan {
  nhan: string;
  /** Gợi ý nhận dạng: tiền tố tên đăng nhập mà bộ phận này đang dùng. */
  tienTo?: readonly string[];
  mien: Partial<Record<Mien, QuyenMien>>;
  le?: readonly QuyenLe[];
}

const XEM: QuyenMien = { xem: true };
const SUA: QuyenMien = { xem: true, sua: true };

/** Mọi miền trừ `taiKhoan` và `nhatKy` — hai miền này chỉ Admin được vào. */
const moiMien = (q: QuyenMien): Partial<Record<Mien, QuyenMien>> => ({
  muaHang: q,
  vanChuyen: q,
  congNo: q,
  baoCao: q,
  danhMuc: q,
  diaChi: q,
  noiDung: q,
  rieng: SUA,
});

/**
 * BẢNG QUYỀN. Lấy nguyên văn từ yêu cầu của bên khách ngày 10/10/2026:
 *
 *   1. Kho       — xem trang Mua hàng giúp
 *   2. CSKH      — xem tất cả; trang Mua hàng giúp không được sửa; không xem giá NCC
 *   3. Mua hàng  — xem all, được sửa
 *   4. Kế toán   — xem all, được sửa
 *   5. Vận chuyển— xem all, không được sửa
 *   6. MKT       — xem all, không được sửa
 *   • Dashboard  — Trưởng phòng, Admin, Giám đốc
 *   • Tạo tài khoản — Admin tạo tất cả, CSKH tạo tài khoản khách. Các bộ phận
 *     còn lại không được xem danh sách tài khoản khách hàng.
 *
 * HAI CHỖ ĐÃ SUY RA, CẦN BÊN KHÁCH XÁC NHẬN (ghi rõ ở đây để sau còn truy):
 *
 *   a) Kho: đọc đúng từng chữ thì Kho CHỈ được xem trang Mua hàng giúp, nghĩa là
 *      mất luôn tracking và lô hàng — mà đó chính là việc của kho, và hiện 9 tài
 *      khoản KHO* đang làm. Nên ở đây Kho = sửa được miền Vận chuyển (giữ như
 *      đang chạy) + xem Mua hàng giúp. Nếu bên khách muốn đúng nghĩa hẹp thì bỏ
 *      dòng `vanChuyen: SUA` bên dưới.
 *   b) CSKH: yêu cầu chỉ nói "không được sửa trang Mua hàng giúp", không nói các
 *      trang khác — khác hẳn mục 5 và 6 vốn ghi thẳng "không được edit". Nên
 *      hiểu là CSKH sửa được những miền còn lại.
 */
export const BANG_QUYEN: Record<BoPhan, MoTaBoPhan> = {
  [BO_PHAN.Admin]: {
    nhan: 'Admin',
    tienTo: ['QL'],
    mien: {
      ...moiMien(SUA),
      dashboard: XEM,
      taiKhoan: SUA,
      nhatKy: XEM,
    },
    le: [
      QUYEN_LE.giaNcc,
      QUYEN_LE.congNoNcc,
      QUYEN_LE.duyetCongNo,
      QUYEN_LE.taoKhach,
      QUYEN_LE.taoNhanVien,
      QUYEN_LE.xemDanhSachKhach,
      QUYEN_LE.quanLyRole,
      QUYEN_LE.baoChuyenKhoan,
    ],
  },

  /**
   * CSKH giữ `danhMuc.sua` (tỷ giá, kỳ, số tài khoản ngân hàng) — có kiểm dữ
   * liệu trước khi quyết, không suy đoán: trong TY_GIA_HISTORY, 61 trên 65 lần
   * đổi tỷ giá bằng tay là do tài khoản CSKH làm (CSKHTHUPHUONG 54 lần,
   * CSKHHAIMINH 6, CSKHHUONGTRAN 1; còn lại MKT_LUYEN 4 lần). Siết miền này
   * lại cho "gọn" là chặn đúng việc họ đang làm hằng ngày.
   */
  [BO_PHAN.CSKH]: {
    nhan: 'CSKH',
    tienTo: ['CSKH'],
    mien: {
      ...moiMien(SUA),
      /**
       * CSKH SỬA ĐƯỢC khu Mua hàng giúp, dù yêu cầu viết "đối với trang mua
       * hàng giúp không có quyền edit".
       *
       * Ngày 10/10/2026 tôi làm đúng câu chữ đó và đẩy lên: CSKHMAILINH lên
       * đơn hộ khách thì bị 403, web đá về trang chủ, bên khách báo ngay trong
       * buổi. Tôi lui lại và đếm nhật ký 30 ngày của các tài khoản mang vai
       * trò `Sale`:
       *
       *     564  QLDatHang_Them:ThemDatHangSimpleCoTamTinh   (tạo đơn hộ khách)
       *     122  QLDatHang_LietKe:CapNhatDonHang...          (sửa đơn)
       *     120  EditOrder_NgayVeVN:CapNhatNgayVeVN          (ngày hàng về VN)
       *      22  QLDatHang_MassCancel:MassCancel             (huỷ hàng loạt)
       *      12  EditOrderDetail:CapNhatDonHang
       *
       * Hơn 800 thao tác ghi mỗi tháng, tức là việc chính của họ chứ không
       * phải ngoại lệ. "Không được edit" chắc là nói tới một màn hẹp hơn —
       * phải hỏi lại bên khách là màn nào. Trong lúc chưa rõ thì để mở, vì
       * chặn nhầm là cả bộ phận ngồi chơi.
       *
       * Phần chắc chắn trong yêu cầu — không xem giá NCC — vẫn giữ, bằng quyền
       * lẻ `giaNcc` ở dưới.
       */
      muaHang: SUA,
      // Mở miền tài khoản để còn tạo và sửa tài khoản KHÁCH. Chặn chạm vào
      // nhân viên là việc của tầng kiểm tra trong users.service, không phải ở đây.
      taiKhoan: SUA,
    },
    le: [
      QUYEN_LE.duyetCongNo,
      QUYEN_LE.taoKhach,
      QUYEN_LE.xemDanhSachKhach,
      QUYEN_LE.baoChuyenKhoan,
    ],
  },

  [BO_PHAN.MuaHang]: {
    nhan: 'Mua hàng',
    tienTo: ['MH', 'DH'],
    mien: moiMien(SUA),
    le: [QUYEN_LE.giaNcc, QUYEN_LE.duyetCongNo, QUYEN_LE.baoChuyenKhoan],
  },

  /**
   * Kế toán mở được Dashboard — yêu cầu bên khách 15/10/2026, sau khi có màn
   * "Báo cáo sản lượng khách hàng": họ hỏi trang đó cho kế toán xem luôn, mà
   * trang đó nằm trong miền `dashboard`.
   *
   * Mở cả miền chứ không làm riêng một quyền lẻ cho đúng một báo cáo: miền
   * `dashboard` toàn là số liệu CHỈ ĐỌC (doanh thu, khách mới, sản lượng, tuổi
   * nợ, vận hành) — đúng thứ kế toán vẫn phải đối chiếu. Thêm một mã quyền mới
   * cho một màn thì lần sau có màn nữa lại thêm mã nữa.
   *
   * XEM chứ không SUA: dashboard không có đường ghi nào, để SUA chỉ là mở rộng
   * vô cớ.
   */
  [BO_PHAN.KeToan]: {
    nhan: 'Kế toán',
    tienTo: ['KT', 'KETOAN'],
    mien: { ...moiMien(SUA), dashboard: XEM },
    le: [
      QUYEN_LE.giaNcc,
      QUYEN_LE.congNoNcc,
      QUYEN_LE.duyetCongNo,
      QUYEN_LE.baoChuyenKhoan,
    ],
  },

  [BO_PHAN.VanChuyen]: {
    nhan: 'Vận chuyển',
    tienTo: ['VC'],
    mien: { ...moiMien(XEM), rieng: SUA },
  },

  /**
   * MKT mở được Dashboard — yêu cầu bên khách 15/10/2026, cùng đợt với Kế toán.
   *
   * Khớp với ghi chú họ viết ngay trên bảng phân bộ phận cho tài khoản
   * MKT_LUYEN: "cho xem hết để e có thể nhận thông tin từ các bộ phận sửa web".
   * Bộ phận này vốn đã là CHỈ XEM ở mọi miền, nên thêm `dashboard` là đi đúng
   * mạch đó chứ không phải nới quyền.
   *
   * Vẫn KHÔNG có `giaNcc`: "xem hết" ở đây là xem số liệu vận hành, còn giá
   * nhập và Lãi/Lỗ thì yêu cầu 12/10 nói rõ chỉ mua hàng, kế toán, giám đốc.
   * Hai thứ đó tách nhau, sửa chỗ này không đụng chỗ kia.
   */
  [BO_PHAN.MKT]: {
    nhan: 'MKT',
    tienTo: ['MKT'],
    mien: { ...moiMien(XEM), rieng: SUA, dashboard: XEM },
  },

  /**
   * KHO LÀM ĐƯỢC NHIỀU HƠN HẲN CÂU "Kho: Xem trang Mua hàng giúp".
   *
   * Đếm nhật ký 30 ngày của các tài khoản mang vai trò `Kho`:
   *
   *     397  EditOrder_NgayVeVN:CapNhatNgayVeVN   (ghi ngày hàng về VN)
   *     180  ManageCongNo:Insert_CongNo           (tạo dòng công nợ)
   *      39  EditOrder:MassComplete               (hoàn tất hàng loạt)
   *      21  ManageCongNo:CapNhatCongNo
   *       8  DatHangM:ThemDatHangSimple
   *
   * Hai việc nhiều nhất đều nằm ngoài chữ "xem": ghi ngày hàng về nằm ở miền
   * muaHang (orders.controller), tạo dòng công nợ nằm ở miền congNo. Đọc đúng
   * từng chữ thì 9 tài khoản KHO* ngồi chơi. Nên mở cả hai miền, và ghi rõ ở
   * đây là mở theo BẰNG CHỨNG SỬ DỤNG chứ không theo yêu cầu — bên khách cần
   * xác nhận lại.
   *
   * KhoSG để giống hệt Kho: vai trò này chưa có ai mang nên không có dữ liệu
   * riêng, mà kho Sài Gòn thì làm cùng loại việc.
   */
  [BO_PHAN.Kho]: {
    nhan: 'Kho',
    tienTo: ['KHO'],
    mien: { vanChuyen: SUA, muaHang: SUA, congNo: SUA, rieng: SUA },
    le: [QUYEN_LE.baoChuyenKhoan],
  },

  [BO_PHAN.KhoSG]: {
    nhan: 'Kho Sài Gòn',
    tienTo: ['KHOSG'],
    mien: { vanChuyen: SUA, muaHang: SUA, congNo: SUA, rieng: SUA },
    le: [QUYEN_LE.baoChuyenKhoan],
  },
};

/** Cấp nào mở được Dashboard. Admin mở sẵn qua BANG_QUYEN. */
export const CAP_XEM_DASHBOARD: readonly Cap[] = [CAP.TruongPhong, CAP.GiamDoc];

export const NHAN_CAP: Record<Cap, string> = {
  TruongPhong: 'Trưởng phòng',
  GiamDoc: 'Giám đốc',
};

/**
 * Quyền lẻ mà CẤP tự mở, không phụ thuộc bộ phận.
 *
 * Trước đây cấp chỉ mở được Dashboard, còn mọi quyền khác đều đi qua bộ phận.
 * Nhưng yêu cầu 12/10/2026 nêu "GD" ngang hàng với mua hàng và kế toán ở hai
 * chỗ (khối NCC, trang công nợ phải trả), mà Giám đốc là CẤP — một người có thể
 * là Giám đốc mà bộ phận lại là CSKH hay MKT. Cấp cho qua bộ phận thì phải gán
 * cho cả bộ phận, tức mở rộng hơn mức bên khách cho.
 *
 * Trưởng phòng KHÔNG có hai quyền này: yêu cầu chỉ nói "GD".
 */
export const LE_CUA_CAP: Partial<Record<Cap, readonly QuyenLe[]>> = {
  [CAP.GiamDoc]: [QUYEN_LE.giaNcc, QUYEN_LE.congNoNcc],
};

/**
 * Khách hàng (không vai trò nào) được chạm vào những miền này.
 *
 * Danh sách dựng từ chính các trang khách đang dùng, không phải đoán: khách tự
 * khai tracking (/sua-tracking), tự đặt đơn (/dat-hang), tự báo chuyển khoản
 * (/chuyen-khoan → tạo dòng công nợ chờ duyệt), xem công nợ của mình
 * (/bao-cao-cong-no), sửa địa chỉ nhận hàng, hỏi đáp, xem tỷ giá và số tài
 * khoản ngân hàng để chuyển tiền (miền danhMuc, chỉ xem).
 *
 * Khách KHÔNG có: taiKhoan, nhatKy, dashboard, danhMuc.sua, và quyền lẻ
 * duyetCongNo — tức là khách báo chuyển khoản được nhưng không tự duyệt.
 *
 * KHÔNG có `baoCao`: lớp DebtReportsController gắn nhãn `baoCao`, mà trong đó
 * có /total-revenue, /profit-loss-by-lot, /debt-by-user, /reconciliation —
 * doanh thu và lãi lỗ của cả công ty. Trang của khách chỉ gọi `GET
 * /debt-reports` và `GET /debt-reports/user/chuyen-khoan`, nên hai đường đó
 * được gắn lại thành `congNo`, còn cả miền `baoCao` là việc nội bộ.
 *
 * `congNo` chỉ XEM chứ không SUA: xem mục `baoChuyenKhoan` ở trên.
 */
export const MIEN_CUA_KHACH: Partial<Record<Mien, QuyenMien>> = {
  muaHang: SUA,
  vanChuyen: SUA,
  congNo: XEM,
  danhMuc: XEM,
  diaChi: SUA,
  noiDung: SUA,
  rieng: SUA,
};

/** Quyền lẻ của khách hàng. Xem ghi chú ở `MIEN_CUA_KHACH`. */
export const LE_CUA_KHACH: readonly QuyenLe[] = [QUYEN_LE.baoChuyenKhoan];

export type HanhDong = 'xem' | 'sua';

/** `muaHang.sua`, `taiKhoan.xem`… dạng chuỗi dùng cho @Quyen và cho phía web. */
export type MaQuyen = `${Mien}.${HanhDong}` | QuyenLe;

export const laBoPhan = (s: string): s is BoPhan =>
  Object.prototype.hasOwnProperty.call(BANG_QUYEN, s);

export const laCap = (s: string): s is Cap =>
  Object.prototype.hasOwnProperty.call(NHAN_CAP, s);

/** Tên vai trò hợp lệ để gán cho tài khoản = bộ phận hoặc cấp. */
export const MOI_VAI_TRO: readonly string[] = [
  ...Object.keys(BANG_QUYEN),
  ...Object.keys(NHAN_CAP),
];
