import {
  cheNcc,
  cheNccDanhSach,
  docThanNcc,
  ganNcc,
  laiLo,
  nhatKyNcc,
  tongPhaiTraGoiY,
} from './ncc-don-hang';

describe('laiLo', () => {
  it('thu khách trừ phải trả NCC', () => {
    expect(laiLo({ tongtienVND: 1_000_000, NCC_TongPhaiTra: 800_000 })).toBe(200_000);
  });

  it('âm khi lỗ', () => {
    expect(laiLo({ tongtienVND: 800_000, NCC_TongPhaiTra: 1_000_000 })).toBe(-200_000);
  });

  it('CHƯA NHẬP giá NCC thì null, KHÔNG phải 0', () => {
    // Đây là chỗ quan trọng nhất: 0 nghĩa là hoà vốn, null nghĩa là chưa biết.
    // Gộp hai thứ thì bảng tổng lãi/lỗ cộng cả đơn chưa nhập như thể hoà vốn.
    expect(laiLo({ tongtienVND: 1_000_000, NCC_TongPhaiTra: null })).toBeNull();
    expect(laiLo({ tongtienVND: 1_000_000 })).toBeNull();
  });

  it('phải trả 0 là một con số thật, không phải chưa nhập', () => {
    expect(laiLo({ tongtienVND: 1_000_000, NCC_TongPhaiTra: 0 })).toBe(1_000_000);
  });

  it('nhận cả tên cột lẫn camelCase của tổng tiền', () => {
    expect(laiLo({ tongTienVnd: 500_000, NCC_TongPhaiTra: 300_000 })).toBe(200_000);
  });

  it('thiếu tổng tiền thì coi là 0 chứ không nổ', () => {
    expect(laiLo({ NCC_TongPhaiTra: 300_000 })).toBe(-300_000);
  });

  it('làm tròn về đồng', () => {
    expect(laiLo({ tongtienVND: 1_000_000.6, NCC_TongPhaiTra: 0.1 })).toBe(1_000_001);
  });
});

describe('tongPhaiTraGoiY', () => {
  it('(ngoại tệ + công) × tỷ giá', () => {
    expect(tongPhaiTraGoiY(100, 5, 26_000)).toBe(2_730_000);
  });

  it('ô trống tính là 0', () => {
    expect(tongPhaiTraGoiY(100, null, 26_000)).toBe(2_600_000);
    expect(tongPhaiTraGoiY(undefined, undefined, undefined)).toBe(0);
  });

  it('chuỗi số từ biểu mẫu cũng tính được', () => {
    expect(tongPhaiTraGoiY('100', '5', '26000')).toBe(2_730_000);
  });

  it('chữ không phải số thì coi là 0, không ra NaN', () => {
    expect(tongPhaiTraGoiY('abc', 0, 26_000)).toBe(0);
  });
});

describe('cheNcc', () => {
  const don = {
    ID: 1,
    username: 'HP591',
    tongtienVND: 1_000_000,
    NCC_ID: 3,
    NCC_NgoaiTe: 40,
    NCC_Cong: 2,
    NCC_TyGia: 26_000,
    NCC_TongPhaiTra: 1_092_000,
    NCC_Tracking: 'ABC123',
    NCC_TenNhaCungCap: 'Amazon',
    NCC_LaiLo: -92_000,
  };

  it('xoá đủ tám khoá NCC, giữ nguyên phần còn lại', () => {
    const ra = cheNcc(don) as Record<string, unknown>;
    for (const k of Object.keys(don).filter((k) => k.startsWith('NCC_'))) {
      expect(Object.prototype.hasOwnProperty.call(ra, k)).toBe(false);
    }
    expect(ra.ID).toBe(1);
    expect(ra.tongtienVND).toBe(1_000_000);
  });

  it('XOÁ khoá chứ không đặt về null', () => {
    // Để người gọi phân biệt "không có quyền xem" với "chưa ai nhập".
    expect('NCC_TongPhaiTra' in (cheNcc(don) as object)).toBe(false);
  });

  it('không sửa dòng gốc', () => {
    cheNcc(don);
    expect(don.NCC_TongPhaiTra).toBe(1_092_000);
  });

  it('cả danh sách', () => {
    const ra = cheNccDanhSach([don, don]);
    expect(ra).toHaveLength(2);
    expect(ra.every((r) => !('NCC_ID' in r))).toBe(true);
  });

  it('danh sách rỗng hoặc undefined thì ra mảng rỗng', () => {
    expect(cheNccDanhSach([])).toEqual([]);
    expect(cheNccDanhSach(undefined as never)).toEqual([]);
  });
});

describe('ganNcc', () => {
  const ten = new Map([
    [3, 'Amazon'],
    [7, 'Coupang'],
  ]);

  it('gắn tên nhà cung cấp và lãi/lỗ', () => {
    const ra = ganNcc(
      { NCC_ID: 3, tongtienVND: 1_000_000, NCC_TongPhaiTra: 800_000 },
      ten,
    );
    expect(ra.NCC_TenNhaCungCap).toBe('Amazon');
    expect(ra.NCC_LaiLo).toBe(200_000);
  });

  it('NCC đã bị xoá khỏi danh mục thì tên null, KHÔNG nổ', () => {
    const ra = ganNcc({ NCC_ID: 99, NCC_TongPhaiTra: 1 }, ten);
    expect(ra.NCC_TenNhaCungCap).toBeNull();
  });

  it('chưa gán NCC thì tên null và lãi/lỗ null', () => {
    const ra = ganNcc({ NCC_ID: null, tongtienVND: 1_000_000 }, ten);
    expect(ra.NCC_TenNhaCungCap).toBeNull();
    expect(ra.NCC_LaiLo).toBeNull();
  });
});

describe('docThanNcc', () => {
  it('THÂN KHÔNG CÓ KHOÁ NCC NÀO thì trả null — không phải "đặt về null"', () => {
    // Bài kiểm tra quan trọng nhất của tệp này. Biểu mẫu của người không có
    // quyền `giaNcc` không hiện khối NCC nên không gửi khoá nào. Coi đó là
    // lệnh xoá thì một lần bấm Cập nhật là mất sạch giá nhập.
    expect(docThanNcc({ username: 'HP591', ghichu: 'sửa ghi chú' })).toBeNull();
    expect(docThanNcc({})).toBeNull();
    expect(docThanNcc(null)).toBeNull();
    expect(docThanNcc(undefined)).toBeNull();
  });

  it('có MỘT khoá thôi cũng là có ý định ghi', () => {
    const t = docThanNcc({ NCC_Tracking: 'X1' });
    expect(t).not.toBeNull();
    expect(t!.NCC_Tracking).toBe('X1');
    // Những ô khác không gửi thì về null — đúng ý "ô để trống".
    expect(t!.NCC_NgoaiTe).toBeNull();
  });

  it('gửi rỗng tường minh thì XOÁ được giá nhập', () => {
    const t = docThanNcc({
      NCC_ID: null,
      NCC_NgoaiTe: '',
      NCC_Cong: null,
      NCC_TyGia: null,
      NCC_TongPhaiTra: null,
      NCC_Tracking: '',
    });
    expect(t).toEqual({
      NCC_ID: null,
      NCC_NgoaiTe: null,
      NCC_Cong: null,
      NCC_TyGia: null,
      NCC_TongPhaiTra: null,
      NCC_Tracking: null,
    });
  });

  it('nhận cả camelCase mà phía web hay gửi', () => {
    const t = docThanNcc({
      nccId: 3,
      nccNgoaiTe: 40,
      nccCong: 2,
      nccTyGia: 26000,
      nccTongPhaiTra: 1092000,
      nccTracking: ' ABC ',
    });
    expect(t).toEqual({
      NCC_ID: 3,
      NCC_NgoaiTe: 40,
      NCC_Cong: 2,
      NCC_TyGia: 26000,
      NCC_TongPhaiTra: 1092000,
      NCC_Tracking: 'ABC',
    });
  });

  it('chuỗi số từ input type=number vẫn thành số', () => {
    expect(docThanNcc({ NCC_NgoaiTe: '40.5' })!.NCC_NgoaiTe).toBe(40.5);
  });

  it('giá trị không đọc được thành null chứ không NaN xuống CSDL', () => {
    expect(docThanNcc({ NCC_NgoaiTe: 'khong-phai-so' })!.NCC_NgoaiTe).toBeNull();
  });

  it('tracking dài quá 100 ký tự bị cắt, không để CSDL ném lỗi', () => {
    const t = docThanNcc({ NCC_Tracking: 'x'.repeat(150) });
    expect(t!.NCC_Tracking).toHaveLength(100);
  });
});

describe('nhatKyNcc', () => {
  it('ghi đủ sáu ô để sau truy được ai sửa giá nhập', () => {
    const d = nhatKyNcc({
      NCC_ID: 3,
      NCC_NgoaiTe: 40,
      NCC_Cong: 2,
      NCC_TyGia: 26000,
      NCC_TongPhaiTra: 1092000,
      NCC_Tracking: 'ABC',
    });
    expect(d).toBe(
      'NCC_ID: 3; NCC_NgoaiTe: 40; NCC_Cong: 2; NCC_TyGia: 26000; NCC_TongPhaiTra: 1092000; NCC_Tracking: ABC',
    );
  });

  it('ô trống hiện rỗng, không hiện "null"', () => {
    const d = nhatKyNcc({
      NCC_ID: null,
      NCC_NgoaiTe: null,
      NCC_Cong: null,
      NCC_TyGia: null,
      NCC_TongPhaiTra: null,
      NCC_Tracking: null,
    });
    expect(d).not.toContain('null');
  });
});
