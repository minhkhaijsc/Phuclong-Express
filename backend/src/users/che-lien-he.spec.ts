import { cheLienHe, cheLienHeDanhSach, coXemLienHe } from './che-lien-he';

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
