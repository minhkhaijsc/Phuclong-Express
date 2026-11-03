import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  IsOptional,
  IsBoolean,
} from 'class-validator';

/**
 * Register DTO
 *
 * Used for user registration with all customer details.
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  hoTen?: string;

  @IsString()
  @IsOptional()
  diaChi?: string;

  @IsString()
  @IsOptional()
  tinhThanh?: string;

  @IsString()
  @IsOptional()
  soTaiKhoan?: string;

  @IsString()
  @IsOptional()
  hinhThucNhanHang?: string;

  @IsBoolean()
  @IsOptional()
  khachBuon?: boolean;

  @IsString()
  @IsOptional()
  linkTaiKhoanMang?: string;

  @IsString()
  @IsOptional()
  vungMien?: string;

  /**
   * Tên ĐĂNG NHẬP của CSKH phụ trách mã khách này (vd `CSKHMAILINH`).
   * Yêu cầu bên khách 15/10/2026. BẮT BUỘC từ 03/11/2026 ("bắt buộc CSKH gán
   * tên của CSKH vào user thì mới tạo được tài khoản") — trước đó để trống được
   * nên gần như không mã nào có CSKH, báo cáo theo CSKH trống trơn. Kiểm ở
   * `AuthService.register` (phải là CSKH đang làm), không chỉ ở web.
   */
  @IsString()
  @IsOptional()
  cskhPhuTrach?: string;
}
