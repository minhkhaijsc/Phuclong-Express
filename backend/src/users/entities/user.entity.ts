import { DataTypes, Model } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

/**
 * User Model (Sequelize)
 *
 * Represents a user in the Phuc Long Express system.
 * Maps to AspNetUsers table.
 *
 * MỌI thuộc tính dưới đây phải có `declare`.
 *
 * Không có `declare`, TypeScript sinh ra một class field thật, và field đó CHE
 * MẤT getter mà Sequelize gắn trên prototype — `user.UserName` trả về
 * `undefined` trên mọi bản ghi đọc từ CSDL, lặng lẽ, không lỗi. Sequelize có
 * cảnh báo ("declaring public class fields ... shadowing Sequelize's attribute
 * getters") nhưng nó chỉ hiện một lần lúc khởi động, lẫn giữa hàng trăm dòng
 * log nên không ai thấy.
 *
 * Đã gây ra ít nhất ba lỗi:
 *   • `DELETE /users/:id` chết 500 với MỌI tài khoản — bộ chặn xoá nhận
 *     `undefined` rồi đưa xuống Sequelize ("Named replacement ':u' has no
 *     entry"). Giao diện chỉ hiện "Xóa thất bại".
 *   • `refreshToken()` phát thẻ mới với `sub: undefined`, nên thẻ vừa phát ra
 *     đã không tra được người dùng.
 *   • Nhật ký `UpdateUser` / `DeleteUser` ghi "UserName: undefined".
 *
 * Nơi nào đang gọi `user.get('UserName')` là vì lỗi này; sau khi có `declare`
 * thì đọc thẳng cũng đúng, nhưng `.get()` vẫn không sai nên không cần sửa.
 */
export class User extends Model {
  declare Id: string;
  declare UserName: string;
  declare Email: string;
  declare EmailConfirmed: boolean;
  declare PasswordHash: string;
  declare SecurityStamp: string;
  declare PhoneNumber: string;
  declare PhoneNumberConfirmed: boolean;
  declare TwoFactorEnabled: boolean;
  declare LockoutEndDateUtc: Date;
  declare LockoutEnabled: boolean;
  declare AccessFailedCount: number;
  declare HoTen: string;
  declare DiaChi: string;
  declare TinhThanh: string;
  declare SoTaiKhoan: string;
  declare HinhThucNhanHang: string;
  declare KhachBuon: boolean;
  declare LinkTaiKhoanMang: string;
  declare VungMien: string;
  /**
   * Trạng thái do CSKH/admin chốt: null | 'hoat-dong' | 'tam-nghi' | 'dong-ma'.
   * Thêm bởi `migrations/them-trang-thai-khach-hang.sql`.
   */
  declare TrangThai: string | null;
  declare NgayDoiTrangThai: Date | null;
  declare NguoiDoiTrangThai: string | null;
  declare LyDoTrangThai: string | null;
  declare roles: string[];
}

export const UserModel = (sequelize: Sequelize) => {
  User.init(
    {
      Id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      UserName: {
        type: DataTypes.STRING,
        unique: true,
      },
      Email: {
        type: DataTypes.STRING,
        unique: true,
      },
      EmailConfirmed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      PasswordHash: {
        type: DataTypes.STRING,
      },
      SecurityStamp: {
        type: DataTypes.STRING,
      },
      PhoneNumber: {
        type: DataTypes.STRING,
      },
      PhoneNumberConfirmed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      TwoFactorEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      LockoutEndDateUtc: {
        type: DataTypes.DATE,
      },
      LockoutEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      AccessFailedCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      HoTen: {
        type: DataTypes.STRING,
      },
      DiaChi: {
        type: DataTypes.STRING,
      },
      TinhThanh: {
        type: DataTypes.STRING,
      },
      SoTaiKhoan: {
        type: DataTypes.STRING,
      },
      HinhThucNhanHang: {
        type: DataTypes.STRING,
      },
      KhachBuon: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      LinkTaiKhoanMang: {
        type: DataTypes.STRING,
      },
      VungMien: {
        type: DataTypes.STRING,
      },
      // Bốn cột trạng thái. Phải khai ở đây, không chỉ để đọc cho đẹp:
      // Sequelize chỉ SELECT những cột được khai, nên thiếu thì `validateUser`
      // đọc `TrangThai` ra undefined và tài khoản đã đóng mã vẫn đăng nhập được.
      TrangThai: {
        type: DataTypes.STRING,
      },
      NgayDoiTrangThai: {
        type: DataTypes.DATE,
      },
      NguoiDoiTrangThai: {
        type: DataTypes.STRING,
      },
      LyDoTrangThai: {
        type: DataTypes.STRING,
      },
    },
    {
      sequelize,
      tableName: 'AspNetUsers',
      timestamps: false,
    },
  );

  return User;
};
