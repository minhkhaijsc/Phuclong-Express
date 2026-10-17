import { Sequelize } from 'sequelize-typescript';
import { User, UserModel } from './user.entity';

/**
 * Canh ĐÚNG MỘT VIỆC: đọc thuộc tính trên bản ghi User phải ra giá trị thật.
 *
 * Nếu khai thuộc tính trong lớp mà thiếu `declare`, TypeScript sinh ra một class
 * field thật và field đó che mất getter Sequelize gắn trên prototype — mọi phép
 * đọc trả về `undefined`, lặng lẽ, không lỗi. Đã làm `DELETE /users/:id` chết
 * 500 với mọi tài khoản, làm `refreshToken()` phát thẻ `sub: undefined`, và làm
 * nhật ký ghi "UserName: undefined".
 *
 * `build()` không cần nối CSDL nên phần kiểm này chạy được ở mọi nơi.
 */
describe('User entity', () => {
  const sq = new Sequelize({ dialect: 'mssql', logging: false });
  beforeAll(() => UserModel(sq as any));

  it('đọc thẳng thuộc tính ra giá trị thật, không ra undefined', () => {
    const u = User.build({
      Id: 'id-1',
      UserName: 'KETOANHA',
      HoTen: 'Lô Thị Ngọc Hà',
      Email: 'a@x.com',
    } as any);
    expect(u.UserName).toBe('KETOANHA');
    expect(u.Id).toBe('id-1');
    expect(u.HoTen).toBe('Lô Thị Ngọc Hà');
    expect(u.Email).toBe('a@x.com');
  });

  it('bốn cột trạng thái cũng đọc được — thiếu thì mã đã đóng vẫn đăng nhập được', () => {
    const u = User.build({
      UserName: 'HP3028',
      TrangThai: 'dong-ma',
      LyDoTrangThai: 'nghỉ việc 09/2026',
    } as any);
    expect(u.TrangThai).toBe('dong-ma');
    expect(u.LyDoTrangThai).toBe('nghỉ việc 09/2026');
  });

  it('không khai thuộc tính nào thành class field', () => {
    // `declare` thì không có field nào trên bản ghi; thiếu `declare` thì mỗi
    // thuộc tính thành một key riêng mang giá trị undefined.
    const u = User.build({ UserName: 'X' } as any);
    expect(Object.prototype.hasOwnProperty.call(u, 'UserName')).toBe(false);
  });
});

/**
 * Ngày 17/10/2026: kế toán không import được công nợ cho HP3085 — màn hình báo
 * `User "HP3085" không tồn tại` trong khi tài khoản có thật và đang có 10 dòng
 * công nợ. Tên lưu trong CSDL là `'HP3085 '`, dính một dấu cách ở cuối do người
 * nhập dán từ Excel sang. SQL Server bỏ qua khoảng trắng cuối khi so sánh nên
 * mọi màn hình chạy SQL vẫn thấy bình thường; chỉ chỗ so chuỗi bằng JavaScript
 * là trượt. Cắt ngay tại model để không sinh thêm mã nào như vậy nữa.
 */
describe('User.UserName — cắt khoảng trắng thừa', () => {
  const sq = new Sequelize({ dialect: 'mssql', logging: false });
  beforeAll(() => UserModel(sq as any));

  it('cắt dấu cách ở cuối — đúng ca HP3085', () => {
    expect(User.build({ UserName: 'HP3085 ' } as any).UserName).toBe('HP3085');
  });

  it('cắt cả hai đầu', () => {
    expect(User.build({ UserName: '  HP3090  ' } as any).UserName).toBe('HP3090');
  });

  it('không đụng tới tên đã sạch', () => {
    expect(User.build({ UserName: 'KETOANHA' } as any).UserName).toBe('KETOANHA');
  });

  it('cắt cả khi sửa, không riêng lúc tạo', () => {
    const u = User.build({ UserName: 'HP1000' } as any);
    u.UserName = 'HP1000 ';
    expect(u.UserName).toBe('HP1000');
  });

  it('không nuốt mất giá trị rỗng hay null', () => {
    expect(User.build({ UserName: '' } as any).UserName).toBe('');
    expect(User.build({ UserName: null } as any).UserName).toBeNull();
  });
});
