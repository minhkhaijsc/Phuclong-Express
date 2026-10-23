import {
  cheLienHe,
  cheLienHeDanhSach,
  coXemLienHe,
  cheTheoNguoiXem,
  cheTheoNguoiXemDanhSach,
  duocXemLienHeCua,
  mucXemLienHe,
} from './che-lien-he';

describe('che-lien-he — cắt email/sđt khỏi dữ liệu khách', () => {
  const khach = {
    Id: 'abc',
    UserName: 'PL0001',
    HoTen: 'Nguyễn Văn A',
    Email: 'a@example.com',
    PhoneNumber: '0900000000',
    DiaChi: 'Hà Nội',
  };

  it('xoá hẳn hai khoá, không đặt về null', () => {
    const ra = cheLienHe(khach);
    // `in` chứ không so với null: web cần phân biệt "không có quyền" (mất
    // khoá) với "khách chưa khai" (khoá còn, giá trị rỗng).
    expect('Email' in ra).toBe(false);
    expect('PhoneNumber' in ra).toBe(false);
  });

  it('giữ nguyên mọi cột khác', () => {
    expect(cheLienHe(khach)).toEqual({
      Id: 'abc',
      UserName: 'PL0001',
      HoTen: 'Nguyễn Văn A',
      DiaChi: 'Hà Nội',
    });
  });

  it('không sửa vào dòng gốc', () => {
    cheLienHe(khach);
    expect(khach.Email).toBe('a@example.com');
  });

  it('chạy được cho cả danh sách, và danh sách rỗng/null', () => {
    expect(cheLienHeDanhSach([khach, khach]).every((r) => !('Email' in r))).toBe(true);
    expect(cheLienHeDanhSach([])).toEqual([]);
    expect(cheLienHeDanhSach(null as any)).toEqual([]);
  });

  describe('coXemLienHe', () => {
    const req = (quyen: string[]) => ({ quyen: { quyen } });

    it('true khi có mã', () => {
      expect(coXemLienHe(req(['xemDanhSachKhach', 'xemLienHeKhach']))).toBe(true);
    });

    it('false khi chỉ có quyền xem danh sách — đúng ca của kế toán', () => {
      expect(coXemLienHe(req(['xemDanhSachKhach']))).toBe(false);
    });

    it('SIẾT khi thiếu req.quyen: route chưa qua guard thì coi như không có quyền', () => {
      expect(coXemLienHe({})).toBe(false);
      expect(coXemLienHe(undefined)).toBe(false);
      expect(coXemLienHe({ quyen: {} })).toBe(false);
    });
  });
});

describe('che theo người phụ trách — yêu cầu 23/10/2026', () => {
  const nguoi = (username: string, ...quyen: string[]) => ({ user: { username }, quyen: { quyen } });
  const sales = nguoi('CSKHMAILINH', 'xemLienHeKhach');
  const tp = nguoi('CSKHTHUPHUONG', 'xemLienHeKhach', 'xemLienHeMoiKhach');
  const keToan = nguoi('KETOANDIEP', 'xemDanhSachKhach');
  const dong = (CSKHPhuTrach: string | null, UserName = 'HP1') => ({
    UserName,
    CSKHPhuTrach,
    Email: 'a@x.vn',
    PhoneNumber: '0900000000',
  });

  it('sales thấy khách MÌNH phụ trách', () => {
    expect('PhoneNumber' in cheTheoNguoiXem(sales, dong('CSKHMAILINH'))).toBe(true);
  });

  it('so tên bỏ khoảng trắng, không phân biệt hoa thường', () => {
    expect('PhoneNumber' in cheTheoNguoiXem(sales, dong(' cskhmailinh '))).toBe(true);
  });

  it('sales KHÔNG thấy khách của sales khác', () => {
    const ra = cheTheoNguoiXem(sales, dong('CSKHNGA'));
    expect('PhoneNumber' in ra).toBe(false);
    expect('Email' in ra).toBe(false);
    expect(ra.UserName).toBe('HP1');
  });

  it('khách CHƯA GÁN thì sales nào cũng thấy (chốt 23/10)', () => {
    expect('PhoneNumber' in cheTheoNguoiXem(sales, dong(null))).toBe(true);
    expect('PhoneNumber' in cheTheoNguoiXem(sales, dong('   '))).toBe(true);
  });

  it('TP/PP thấy cả khách của sales khác', () => {
    expect('PhoneNumber' in cheTheoNguoiXem(tp, dong('CSKHNGA'))).toBe(true);
  });

  it('kế toán vẫn bị che hết, kể cả khách chưa gán', () => {
    expect('PhoneNumber' in cheTheoNguoiXem(keToan, dong(null))).toBe(false);
  });

  it('không có req.quyen (route chưa qua guard) thì che', () => {
    expect(duocXemLienHeCua({}, null)).toBe(false);
    expect(mucXemLienHe(undefined)).toBe('khong');
  });

  it('luôn thấy chính tài khoản của mình', () => {
    expect(duocXemLienHeCua(sales, 'CSKHNGA', 'CSKHMAILINH')).toBe(true);
  });

  it('che cả danh sách theo từng dòng', () => {
    const ra = cheTheoNguoiXemDanhSach(sales, [dong('CSKHMAILINH', 'A'), dong('CSKHNGA', 'B'), dong(null, 'C')]);
    expect(ra.map((r) => 'PhoneNumber' in r)).toEqual([true, false, true]);
  });
});
