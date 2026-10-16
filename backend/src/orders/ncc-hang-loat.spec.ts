import { tinhNccHangLoat, tongPhaiTraTuDong, GiaNccTrenDon } from './ncc-hang-loat';

const don = (id: number, v: Partial<GiaNccTrenDon> = {}): GiaNccTrenDon => ({
  ID: id,
  NCC_ID: null,
  NCC_NgoaiTe: null,
  NCC_Cong: null,
  NCC_TyGia: null,
  NCC_TongPhaiTra: null,
  NCC_Tracking: null,
  ...v,
});

/** Tám mã ĐH của order 6103975945 trong ảnh bên khách gửi — rút gọn còn ba. */
const BA_DON = [don(41947), don(41944), don(41943)];

describe('tinhNccHangLoat', () => {
  describe('ô dùng chung', () => {
    it('áp cùng NCC, %công, tỷ giá cho mọi dòng được chọn', () => {
      const kq = tinhNccHangLoat(BA_DON, {
        dong: [
          { id: 41947, ngoaiTe: 11.03 },
          { id: 41944, ngoaiTe: 35.78 },
          { id: 41943, ngoaiTe: 22.49 },
        ],
        nccId: 7,
        cong: 3,
        tyGia: 27700,
      });

      expect(kq.apDung).toHaveLength(3);
      expect(kq.apDung.every((d) => d.NCC_ID === 7 && d.NCC_Cong === 3)).toBe(true);
      expect(kq.apDung.every((d) => d.NCC_TyGia === 27700)).toBe(true);
    });

    it('ngoại tệ gõ RIÊNG từng dòng, không dùng chung', () => {
      const kq = tinhNccHangLoat(BA_DON, {
        dong: [
          { id: 41947, ngoaiTe: 11.03 },
          { id: 41944, ngoaiTe: 35.78 },
          { id: 41943 },
        ],
        tyGia: 27700,
      });

      expect(kq.apDung.find((d) => d.ID === 41947)?.NCC_NgoaiTe).toBe(11.03);
      expect(kq.apDung.find((d) => d.ID === 41944)?.NCC_NgoaiTe).toBe(35.78);
      // Dòng không gõ ngoại tệ: chỉ nhận tỷ giá, ngoại tệ vẫn trống.
      expect(kq.apDung.find((d) => d.ID === 41943)?.NCC_NgoaiTe).toBeNull();
    });
  });

  describe('ô để trống = GIỮ NGUYÊN', () => {
    it('không gửi nccId thì KHÔNG xoá nhà cung cấp đang có', () => {
      const kq = tinhNccHangLoat([don(1, { NCC_ID: 4, NCC_Tracking: 'ABC' })], {
        dong: [{ id: 1 }],
        cong: 5,
      });

      expect(kq.apDung[0].NCC_ID).toBe(4);
      expect(kq.apDung[0].NCC_Tracking).toBe('ABC');
    });

    it('gửi null cũng là giữ nguyên, không phải lệnh xoá', () => {
      // Màn hàng loạt mà hiểu null là xoá thì một lần bấm nhầm mất sạch giá
      // nhập của vài chục đơn.
      const kq = tinhNccHangLoat([don(1, { NCC_ID: 4, NCC_TyGia: 27000 })], {
        dong: [{ id: 1, ngoaiTe: null }],
        nccId: null,
        tyGia: null,
        tracking: null,
      });

      expect(kq.apDung).toHaveLength(0);
      expect(kq.khongDoi).toEqual([1]);
    });

    it('tracking rỗng/toàn khoảng trắng cũng là giữ nguyên', () => {
      const kq = tinhNccHangLoat([don(1, { NCC_Tracking: 'CU' })], {
        dong: [{ id: 1 }],
        tracking: '   ',
      });

      expect(kq.khongDoi).toEqual([1]);
    });

    it('nhưng %công = 0 thì GHI 0, không coi là ô trống', () => {
      const kq = tinhNccHangLoat([don(1, { NCC_Cong: 3 })], {
        dong: [{ id: 1 }],
        cong: 0,
      });

      expect(kq.apDung[0].NCC_Cong).toBe(0);
    });
  });

  describe('tổng phải trả', () => {
    it('tính theo (Ngoại tệ + %Công) × Tỷ giá — đúng công thức đã sửa 15/10', () => {
      const kq = tinhNccHangLoat([don(1)], {
        dong: [{ id: 1, ngoaiTe: 88.2 }],
        cong: 3,
        tyGia: 26700,
      });

      expect(kq.apDung[0].NCC_TongPhaiTra).toBe(2425588);
      // Cách hiểu cũ (Công là số tiền) ra con số này — không được phép quay lại.
      expect(kq.apDung[0].NCC_TongPhaiTra).not.toBe(2435040);
    });

    it('thiếu ngoại tệ thì GIỮ số cũ, không ghi 0', () => {
      // NCC_TongPhaiTra khác null là dấu "đã nhập giá" của trang công nợ NCC.
      const kq = tinhNccHangLoat([don(1, { NCC_TongPhaiTra: 500000 })], {
        dong: [{ id: 1 }],
        tyGia: 27700,
      });

      expect(kq.apDung[0].NCC_TongPhaiTra).toBe(500000);
    });

    it('thiếu tỷ giá thì đơn chưa nhập vẫn để trống, không thành 0 đồng', () => {
      const kq = tinhNccHangLoat([don(1)], { dong: [{ id: 1, ngoaiTe: 11.03 }] });

      expect(kq.apDung[0].NCC_TongPhaiTra).toBeNull();
    });

    it('tắt tính lại thì không đụng tới tổng phải trả đã nhập tay', () => {
      const kq = tinhNccHangLoat(
        [don(1, { NCC_NgoaiTe: 100, NCC_TyGia: 27000, NCC_TongPhaiTra: 2_700_123 })],
        { dong: [{ id: 1 }], tracking: 'TRK9', tinhLaiTongPhaiTra: false },
      );

      expect(kq.apDung[0].NCC_TongPhaiTra).toBe(2_700_123);
      expect(kq.apDung[0].NCC_Tracking).toBe('TRK9');
    });
  });

  describe('đếm và bỏ sót', () => {
    it('dòng y như cũ thì không ghi lại', () => {
      const kq = tinhNccHangLoat(
        [don(1, { NCC_ID: 2, NCC_NgoaiTe: 10, NCC_TyGia: 27000, NCC_TongPhaiTra: 270000 })],
        { dong: [{ id: 1, ngoaiTe: 10 }], nccId: 2, tyGia: 27000 },
      );

      expect(kq.apDung).toHaveLength(0);
      expect(kq.khongDoi).toEqual([1]);
    });

    it('ID không có trong CSDL thì báo riêng, không làm hỏng cả mẻ', () => {
      const kq = tinhNccHangLoat([don(1)], {
        dong: [{ id: 1, ngoaiTe: 5 }, { id: 999 }],
        tyGia: 27000,
      });

      expect(kq.apDung.map((d) => d.ID)).toEqual([1]);
      expect(kq.khongThay).toEqual([999]);
    });

    it('ID gửi trùng chỉ tính MỘT lần, lần gõ sau thắng', () => {
      // Trùng mà tính hai lần là ghi hai lượt và để lại hai dòng nhật ký y hệt.
      const kq = tinhNccHangLoat([don(1)], {
        dong: [{ id: 1, ngoaiTe: 5 }, { id: 1, ngoaiTe: 9 }],
        tyGia: 27000,
      });

      expect(kq.apDung).toHaveLength(1);
      expect(kq.apDung[0].NCC_NgoaiTe).toBe(9);
    });

    it('cắt tracking về 100 ký tự như cột trong CSDL', () => {
      const kq = tinhNccHangLoat([don(1)], {
        dong: [{ id: 1 }],
        tracking: 'X'.repeat(150),
      });

      expect(kq.apDung[0].NCC_Tracking).toHaveLength(100);
    });
  });
});

describe('tongPhaiTraTuDong', () => {
  it('ngoại tệ hoặc tỷ giá <= 0 đều trả null', () => {
    expect(tongPhaiTraTuDong(don(1, { NCC_NgoaiTe: 0, NCC_TyGia: 27000 }))).toBeNull();
    expect(tongPhaiTraTuDong(don(1, { NCC_NgoaiTe: 10, NCC_TyGia: 0 }))).toBeNull();
    expect(tongPhaiTraTuDong(don(1, { NCC_NgoaiTe: -5, NCC_TyGia: 27000 }))).toBeNull();
  });

  it('thiếu %công thì coi như 0%, vẫn ra tiền', () => {
    expect(tongPhaiTraTuDong(don(1, { NCC_NgoaiTe: 10, NCC_TyGia: 27000 }))).toBe(270000);
  });
});
