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
   * Yêu cầu bên khách 15/10/2026. Để trống được: mã tạo vội lúc chưa biết giao
   * cho ai thì vẫn tạo được, màn danh sách có bộ lọc "chưa gán" để nhặt lại.
   */
  @IsString()
  @IsOptional()
  cskhPhuTrach?: string;
}
