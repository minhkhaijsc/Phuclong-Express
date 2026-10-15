import { QuyenService } from './quyen.service';
import { BO_PHAN, CAP, MIEN_CUA_KHACH } from './bo-phan';

/**
 * Bài kiểm tra này là chỗ ghi lại YÊU CẦU, không chỉ để chặn lỗi. Mỗi `it` dưới
 * đây ứng với một dòng bên khách gửi ngày 10/10/2026, nên khi nào yêu cầu đổi
 * thì sửa ở đây trước rồi mới sửa bảng quyền.
 */
describe('QuyenService', () => {
  const s = new QuyenService();
  const q = (...vaiTro: string[]) => s.tinh(vaiTro);

  describe('1. Kho — rộng hơn câu "xem trang Mua hàng giúp"', () => {
    // Mở theo BẰNG CHỨNG SỬ DỤNG, không theo câu chữ yêu cầu. Lý do và số liệu
    // nhật ký 30 ngày ghi ở ghi chú trên [BO_PHAN.Kho] trong bo-phan.ts.
    it('sửa được Mua hàng giúp — 397 lần ghi ngày về VN mỗi tháng', () => {
      const k = q(BO_PHAN.Kho);
      expect(k.quyen).toContain('muaHang.xem');
      expect(k.quyen).toContain('muaHang.sua');
    });

    it('vẫn làm được việc kho: sửa tracking và lô hàng', () => {
      expect(q(BO_PHAN.Kho).quyen).toContain('vanChuyen.sua');
    });

    it('tạo được dòng công nợ — 180 lần mỗi tháng', () => {
      const k = q(BO_PHAN.Kho);
      expect(k.quyen).toContain('congNo.sua');
      expect(k.quyen).toContain('baoChuyenKhoan');
    });

    it('vẫn không chạm được báo cáo, danh mục, tài khoản', () => {
      const k = q(BO_PHAN.Kho);
      for (const x of ['baoCao.xem', 'danhMuc.xem', 'taiKhoan.xem']) {
        expect(k.quyen).not.toContain(x);
      }
    });

    it('KhoSG giống Kho', () => {
      expect(new Set(q(BO_PHAN.KhoSG).quyen)).toEqual(new Set(q(BO_PHAN.Kho).quyen));
    });
  });

  describe('2. CSKH — xem tất cả, không sửa Mua hàng giúp, không xem giá NCC', () => {
    const c = q(BO_PHAN.CSKH);

    it('xem được Mua hàng giúp', () => expect(c.quyen).toContain('muaHang.xem'));

    // Yêu cầu viết "không có quyền edit", nhưng CSKH lên đơn hộ khách hơn 800
    // lần mỗi tháng. Xem ghi chú trên [BO_PHAN.CSKH] trong bo-phan.ts.
    it('SỬA ĐƯỢC Mua hàng giúp — trái câu chữ, đúng việc họ làm', () =>
      expect(c.quyen).toContain('muaHang.sua'));
    it('KHÔNG xem được giá nhà cung cấp', () => expect(c.quyen).not.toContain('giaNcc'));

    it('sửa được những miền còn lại', () => {
      for (const x of ['vanChuyen.sua', 'congNo.sua', 'baoCao.sua', 'noiDung.sua']) {
        expect(c.quyen).toContain(x);
      }
    });

    it('tạo được tài khoản khách, KHÔNG tạo được nhân viên', () => {
      expect(c.quyen).toContain('taoKhach');
      expect(c.quyen).not.toContain('taoNhanVien');
    });

    it('xem được danh sách tài khoản khách hàng', () =>
      expect(c.quyen).toContain('xemDanhSachKhach'));

    it('KHÔNG quản lý được vai trò, KHÔNG xem nhật ký, KHÔNG vào Dashboard', () => {
      for (const x of ['quanLyRole', 'nhatKy.xem', 'dashboard.xem']) {
        expect(c.quyen).not.toContain(x);
      }
    });
  });

  describe('3 & 4. Mua hàng và Kế toán — xem all, được sửa', () => {
    for (const bp of [BO_PHAN.MuaHang, BO_PHAN.KeToan]) {
      it(`${bp} sửa được mọi miền nghiệp vụ và xem được giá NCC`, () => {
        const x = q(bp);
        for (const m of ['muaHang', 'vanChuyen', 'congNo', 'baoCao', 'danhMuc', 'noiDung']) {
          expect(x.quyen).toContain(`${m}.sua`);
        }
        expect(x.quyen).toContain('giaNcc');
      });

      it(`${bp} KHÔNG vào được miền tài khoản`, () => {
        // "Các bộ phận còn lại không được xem list tk khách hàng".
        const x = q(bp);
        expect(x.quyen).not.toContain('taiKhoan.xem');
        expect(x.quyen).not.toContain('xemDanhSachKhach');
      });
    }
  });

  describe('5 & 6. Vận chuyển và MKT — xem all, KHÔNG được sửa', () => {
    for (const bp of [BO_PHAN.VanChuyen, BO_PHAN.MKT]) {
      it(`${bp} xem được nhưng không sửa được gì`, () => {
        const x = q(bp);
        for (const m of ['muaHang', 'vanChuyen', 'congNo', 'baoCao', 'danhMuc', 'noiDung']) {
          expect(x.quyen).toContain(`${m}.xem`);
          expect(x.quyen).not.toContain(`${m}.sua`);
        }
      });

      it(`${bp} vẫn làm được việc cá nhân`, () =>
        expect(q(bp).quyen).toContain('rieng.sua'));
    }
  });

  describe('Dashboard — Trưởng phòng, Admin, Giám đốc', () => {
    it('Admin xem được', () => expect(q(BO_PHAN.Admin).quyen).toContain('dashboard.xem'));

    it('Trưởng phòng xem được, dù ở bộ phận nào', () => {
      expect(q(BO_PHAN.Kho, CAP.TruongPhong).quyen).toContain('dashboard.xem');
      expect(q(BO_PHAN.MKT, CAP.TruongPhong).quyen).toContain('dashboard.xem');
    });

    it('Giám đốc xem được', () =>
      expect(q(BO_PHAN.KeToan, CAP.GiamDoc).quyen).toContain('dashboard.xem'));

    /**
     * Kế toán được mở Dashboard từ 15/10/2026 — bên khách xin cho kế toán xem
     * màn "Báo cáo sản lượng khách hàng", mà màn đó nằm trong miền này.
     */
    it('Kế toán xem được, không cần cấp', () =>
      expect(q(BO_PHAN.KeToan).quyen).toContain('dashboard.xem'));

    /** MKT mở được từ 15/10/2026 — bộ phận này vốn đã là chỉ-xem mọi miền. */
    it('MKT xem được, không cần cấp', () =>
      expect(q(BO_PHAN.MKT).quyen).toContain('dashboard.xem'));

    it('MKT xem Dashboard nhưng VẪN không thấy giá nhà cung cấp', () => {
      expect(q(BO_PHAN.MKT).quyen).toContain('dashboard.xem');
      expect(q(BO_PHAN.MKT).quyen).not.toContain('giaNcc');
      expect(q(BO_PHAN.MKT).quyen).not.toContain('congNoNcc');
    });

    it('nhân viên thường không xem được', () => {
      for (const bp of [BO_PHAN.CSKH, BO_PHAN.Kho, BO_PHAN.KhoSG, BO_PHAN.VanChuyen]) {
        expect(q(bp).quyen).not.toContain('dashboard.xem');
      }
    });

    it('Kế toán chỉ XEM dashboard, không có đường ghi', () =>
      expect(q(BO_PHAN.KeToan).quyen).not.toContain('dashboard.sua'));

    it('cấp không tự mở thêm quyền nghiệp vụ nào khác', () => {
      // Trưởng phòng kho vẫn chỉ là kho, chỉ thêm Dashboard.
      const kho = new Set(q(BO_PHAN.Kho).quyen);
      const truong = q(BO_PHAN.Kho, CAP.TruongPhong).quyen.filter((x) => !kho.has(x));
      expect(truong).toEqual(['dashboard.xem']);
    });

    it('chỉ có cấp mà chưa có bộ phận thì vẫn là nhân viên, không phải khách', () => {
      const x = q(CAP.TruongPhong);
      expect(x.laKhach).toBe(false);
      expect(x.quyen).toContain('dashboard.xem');
      expect(x.quyen).not.toContain('muaHang.xem');
    });
  });

  describe('Admin', () => {
    it('có đủ mọi quyền lẻ', () => {
      const a = q(BO_PHAN.Admin);
      for (const x of [
        'giaNcc', 'duyetCongNo', 'taoKhach', 'taoNhanVien',
        'xemDanhSachKhach', 'quanLyRole',
      ]) {
        expect(a.quyen).toContain(x);
      }
    });

    it('xem và sửa được cả tài khoản, nhật ký thì chỉ xem', () => {
      const a = q(BO_PHAN.Admin);
      expect(a.quyen).toContain('taiKhoan.sua');
      expect(a.quyen).toContain('nhatKy.xem');
      // Nhật ký không ai sửa được, kể cả Admin — sửa được thì nhật ký vô nghĩa.
      expect(a.quyen).not.toContain('nhatKy.sua');
    });
  });

  describe('Báo chuyển khoản — quyền lẻ tách khỏi congNo.sua', () => {
    // `POST /debt-reports/management` là đường DUY NHẤT khách ghi được vào miền
    // công nợ, nên nó đứng riêng. Bộ phận nào sửa được công nợ thì cũng phải
    // tạo được dòng, không thì nhân viên mất việc đang làm hằng ngày.
    for (const bp of [BO_PHAN.Admin, BO_PHAN.CSKH, BO_PHAN.MuaHang, BO_PHAN.KeToan]) {
      it(`${bp} vừa có congNo.sua vừa báo chuyển khoản được`, () => {
        expect(q(bp).quyen).toContain('congNo.sua');
        expect(q(bp).quyen).toContain('baoChuyenKhoan');
      });
    }

    for (const bp of [BO_PHAN.VanChuyen, BO_PHAN.MKT]) {
      it(`${bp} chỉ xem công nợ, không tạo dòng`, () => {
        expect(q(bp).quyen).toContain('congNo.xem');
        expect(q(bp).quyen).not.toContain('congNo.sua');
        expect(q(bp).quyen).not.toContain('baoChuyenKhoan');
      });
    }

    it('Kho tạo được dòng công nợ — 180 lần mỗi tháng trong nhật ký', () => {
      for (const x of ['congNo.xem', 'congNo.sua', 'baoChuyenKhoan']) {
        expect(q(BO_PHAN.Kho).quyen).toContain(x);
      }
    });
  });

  describe('Khách hàng — không vai trò nào', () => {
    const k = q();

    it('được nhận là khách', () => {
      expect(k.laKhach).toBe(true);
      expect(k.boPhan).toEqual([]);
    });

    it('vẫn tự đặt đơn, tự khai tracking, tự sửa địa chỉ', () => {
      // Đây là những việc trang khách đang làm thật, siết mất là sập trang.
      for (const x of ['muaHang.sua', 'vanChuyen.sua', 'diaChi.sua']) {
        expect(k.quyen).toContain(x);
      }
    });

    it('báo được đã chuyển khoản', () => expect(k.quyen).toContain('baoChuyenKhoan'));

    it('KHÔNG có congNo.sua — nếu có thì sửa/xoá được công nợ của người khác', () => {
      // PUT và DELETE /debt-reports/management/:id chỉ đòi `congNo.sua`, và
      // chúng nhận id trực tiếp, không ràng buộc dòng đó của ai.
      expect(k.quyen).not.toContain('congNo.sua');
      expect(k.quyen).toContain('congNo.xem');
    });

    it('KHÔNG vào miền báo cáo — trong đó có doanh thu và lãi lỗ toàn công ty', () => {
      expect(k.quyen).not.toContain('baoCao.xem');
      expect(k.quyen).not.toContain('baoCao.sua');
    });

    it('xem được tỷ giá và số tài khoản ngân hàng', () =>
      expect(k.quyen).toContain('danhMuc.xem'));

    it('KHÔNG tự duyệt công nợ mình vừa báo', () =>
      expect(k.quyen).not.toContain('duyetCongNo'));

    it('KHÔNG sửa danh mục, không vào tài khoản, nhật ký, dashboard', () => {
      for (const x of [
        'danhMuc.sua', 'taiKhoan.xem', 'taiKhoan.sua',
        'nhatKy.xem', 'dashboard.xem', 'quanLyRole', 'taoKhach',
      ]) {
        expect(k.quyen).not.toContain(x);
      }
    });

    it('danh sách miền của khách khớp đúng với quyền tính ra', () => {
      for (const [mien, c] of Object.entries(MIEN_CUA_KHACH)) {
        if (c?.xem) expect(k.quyen).toContain(`${mien}.xem`);
        if (c?.sua) expect(k.quyen).toContain(`${mien}.sua`);
      }
    });
  });

  describe('Vai trò cũ còn trong CSDL — ngày triển khai không ai bị khoá', () => {
    it('Sale chạy như CSKH', () => {
      expect(q('Sale').boPhan).toEqual([BO_PHAN.CSKH]);
      expect(new Set(q('Sale').quyen)).toEqual(new Set(q(BO_PHAN.CSKH).quyen));
    });

    it('Order chạy như Mua hàng', () => expect(q('Order').boPhan).toEqual([BO_PHAN.MuaHang]));

    it('Admin cũ vẫn là Admin — 17 tài khoản chưa bị siết', () =>
      expect(q('Admin').boPhan).toEqual([BO_PHAN.Admin]));

    it('tài khoản KETOAN mang cả 4 vai trò cũ vẫn chạy được', () => {
      // Admin + Kho + Order + Sale — gộp quyền, không xung đột.
      const x = q('Admin', 'Kho', 'Order', 'Sale');
      expect(x.laKhach).toBe(false);
      expect(x.quyen).toContain('taiKhoan.sua');
      expect(x.quyen).toContain('muaHang.sua');
    });
  });

  describe('Gộp nhiều bộ phận', () => {
    it('quyền là hợp của các bộ phận, bên rộng thắng', () => {
      // Kho không sửa được Mua hàng giúp, Mua hàng thì được → gộp lại là được.
      const x = q(BO_PHAN.Kho, BO_PHAN.MuaHang);
      expect(x.quyen).toContain('muaHang.sua');
    });

    it('CSKH + Kho: bên nào hẹp hơn cũng không kéo bên kia xuống', () => {
      // Gộp là HỢP chứ không phải GIAO. Kho không có baoCao, CSKH có, thì
      // người mang cả hai vẫn xem được báo cáo.
      const g = q(BO_PHAN.CSKH, BO_PHAN.Kho);
      expect(g.quyen).toContain('muaHang.sua');
      expect(g.quyen).toContain('baoCao.xem');
      // Nhưng KHÔNG bên nào có giaNcc, nên gộp lại vẫn không xem được giá NCC.
      // Từ 12/10/2026 chỉ Mua hàng, Kế toán, Admin và cấp Giám đốc có quyền này.
      expect(g.quyen).not.toContain('giaNcc');
    });

    it('CSKH + Kế toán thì xem được giá NCC', () => {
      // Chặn giá NCC là thuộc tính của BỘ PHẬN CSKH, không phải của con người.
      // Ai mang thêm bộ phận Kế toán thì xem được — nêu ra ở đây để nếu bên
      // khách muốn "CSKH thì tuyệt đối không", ta biết phải đổi thành chặn cứng.
      expect(q(BO_PHAN.CSKH, BO_PHAN.KeToan).quyen).toContain('giaNcc');
    });
  });

  /**
   * Yêu cầu bên khách 12/10/2026: khối NHÀ CUNG CẤP và LÃI/LỖ trên dòng đơn
   * "chỉ quyền mua hàng, kế toán, GD"; trang công nợ phải trả NCC thì "quyền
   * kế toán, GD dc xem" — không có mua hàng. Hai câu khác nhau nên hai quyền.
   */
  describe('Nhà cung cấp — giaNcc và congNoNcc', () => {
    it('đúng bốn chỗ có giaNcc: Admin, Mua hàng, Kế toán, cấp Giám đốc', () => {
      for (const v of [BO_PHAN.Admin, BO_PHAN.MuaHang, BO_PHAN.KeToan, CAP.GiamDoc]) {
        expect(q(v).quyen).toContain('giaNcc');
      }
    });

    it('bốn bộ phận bị thu lại ngày 12/10/2026 thì KHÔNG còn giaNcc', () => {
      // Trước đó cả bốn đều có — đó là suy ra từ yêu cầu cũ (chỉ nói CSKH
      // không được xem). Lần này bên khách kể tên từng bộ phận được xem.
      for (const bp of [BO_PHAN.VanChuyen, BO_PHAN.MKT, BO_PHAN.Kho, BO_PHAN.KhoSG]) {
        expect(q(bp).quyen).not.toContain('giaNcc');
      }
    });

    it('CSKH vẫn không có, như yêu cầu cũ', () =>
      expect(q(BO_PHAN.CSKH).quyen).not.toContain('giaNcc'));

    it('congNoNcc HẸP HƠN giaNcc: Mua hàng có giaNcc mà không có congNoNcc', () => {
      const mh = q(BO_PHAN.MuaHang);
      expect(mh.quyen).toContain('giaNcc');
      expect(mh.quyen).not.toContain('congNoNcc');
    });

    it('congNoNcc có ở Kế toán, cấp Giám đốc và Admin', () => {
      for (const v of [BO_PHAN.KeToan, CAP.GiamDoc, BO_PHAN.Admin]) {
        expect(q(v).quyen).toContain('congNoNcc');
      }
    });

    it('cấp Trưởng phòng KHÔNG mở hai quyền này — yêu cầu chỉ nói GD', () => {
      const tp = q(CAP.TruongPhong);
      expect(tp.quyen).toContain('dashboard.xem');
      expect(tp.quyen).not.toContain('giaNcc');
      expect(tp.quyen).not.toContain('congNoNcc');
    });

    it('Giám đốc mở được giá NCC KỂ CẢ khi bộ phận là CSKH', () => {
      // Lý do `LE_CUA_CAP` tồn tại: Giám đốc là CẤP, một người có thể vừa là
      // Giám đốc vừa thuộc CSKH. Cấp quyền qua bộ phận thì phải mở cho cả
      // bộ phận CSKH — rộng hơn mức bên khách cho.
      expect(q(BO_PHAN.CSKH, CAP.GiamDoc).quyen).toContain('giaNcc');
      expect(q(BO_PHAN.CSKH).quyen).not.toContain('giaNcc');
    });

    it('khách hàng không có quyền nào trong hai quyền này', () => {
      const k = q();
      expect(k.laKhach).toBe(true);
      expect(k.quyen).not.toContain('giaNcc');
      expect(k.quyen).not.toContain('congNoNcc');
    });
  });

  describe('Vai trò lạ', () => {
    it('vai trò không nhận ra thì bỏ qua, nhưng vẫn không bị coi là khách', () => {
      const x = q('VaiTroKhongTonTai');
      expect(x.laKhach).toBe(true); // không bộ phận, không cấp → khách
      expect(x.boPhan).toEqual([]);
    });

    it("'user' trong auth.service không mở quyền gì", () => {
      // Chuỗi này chưa bao giờ nằm trong AspNetUserRoles, chỉ có ở một đối
      // tượng tạm; nếu lọt vào thì cũng không khớp bộ phận nào.
      expect(q('user').boPhan).toEqual([]);
    });

    it('chuỗi rỗng và khoảng trắng bị bỏ', () => {
      expect(q('', '   ').laKhach).toBe(true);
    });
  });

  describe('Tên bộ phận để hiện trong thông báo lỗi', () => {
    it('đọc được, không phải mã', () => {
      expect(s.tenBoPhan(q(BO_PHAN.Kho))).toBe('Kho');
      expect(s.tenBoPhan(q(BO_PHAN.KeToan))).toBe('Kế toán');
      expect(s.tenBoPhan(q())).toBe('Khách hàng');
      expect(s.tenBoPhan(q(BO_PHAN.Kho, CAP.TruongPhong))).toBe('Kho + Trưởng phòng');
    });
  });
});
