import { IsArray, IsBoolean, IsOptional, IsNumber, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query parameters for debt management list
 * Matches: LoadDanhSachCongNo() in C#
 */
export class QueryDebtManagementDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  status?: number;

  @IsOptional()
  @IsString()
  loaiPhatSinh?: string;

  /** Lọc theo tuyến (tbQuocGia.QuocGiaID). Bỏ trống = không lọc. */
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  quocGiaId?: number;

  /** Lọc theo lô hàng — là NGÀY dạng yyyy-MM-dd. Bỏ trống = không lọc. */
  @IsOptional()
  @IsString()
  loHang?: string;

  /** Lọc theo order number của đơn hàng. Khớp một phần. */
  @IsOptional()
  @IsString()
  orderNumber?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  limit?: number = 200;
}

/**
 * Create debt record
 * Matches: btDongY_Click() -> Insert_CongNo() in C#
 */
export class CreateDebtDto {
  @IsString()
  username: string;

  @IsString()
  noiDung: string;

  @IsString()
  ngay: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dr?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  cr?: number;

  @IsOptional()
  @IsString()
  ghiChu?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  loHangId?: number;

  @IsOptional()
  @IsString()
  loHangText?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  loaiPhatSinh?: number;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  status?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allowEmptyNoiDung?: boolean;

  // Sản lượng (kg) — chỉ áp dụng cho loại phát sinh "Cân Kg" (loaiPhatSinh = 8)
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sanLuong?: number;

  // Tuyến (Quốc gia) — độc lập với đơn hàng, chọn từ tbQuocGia
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  quocGiaId?: number;

  // Doanh thu và phụ thu — máy chủ cộng lại thành phát sinh nợ (DR)
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  doanhThu?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  phuThu?: number;
}

/**
 * Update debt record
 * Matches: gvCongNo_RowUpdating() -> CapNhatCongNo() in C#
 */
export class UpdateDebtManagementDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  noiDung?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dr?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  cr?: number;

  @IsOptional()
  @IsString()
  ghiChu?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  status?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  loHangId?: number;

  @IsOptional()
  @IsString()
  updatedBy?: string;

  // Loại phát sinh ([style]) — service dùng để quyết định lưu/null sản lượng khi sửa
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  loaiPhatSinh?: number;

  // Sản lượng (kg) — chỉ áp dụng cho loại phát sinh "Cân Kg" (loaiPhatSinh = 8)
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sanLuong?: number;

  // Tuyến (Quốc gia) — độc lập với đơn hàng, chọn từ tbQuocGia
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  quocGiaId?: number;

  // Doanh thu và phụ thu — máy chủ cộng lại thành phát sinh nợ (DR)
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  doanhThu?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  phuThu?: number;
}

/**
 * Import debts from Excel
 * Matches: ManageCongNo_Import.cs in C#
 */
export class ImportDebtDto {
  @IsString()
  mode: string; // '0' for new, '1' for edit

  @IsString()
  sheetName: string;

  @IsOptional()
  @IsString()
  editFields?: string; // JSON string of fields to edit in edit mode
}

/**
 * Single row for bulk "Thêm mới công nợ" import from Excel
 */
export class ImportCreateDebtRowDto {
  @IsString()
  username: string;

  @IsString()
  noiDung: string;

  @IsString()
  ngay: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dr?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  cr?: number;

  @IsOptional()
  @IsString()
  ghiChu?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  loaiPhatSinh?: number;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sanLuong?: number;

  // Tuyến (Quốc gia) — độc lập với đơn hàng, chọn từ tbQuocGia
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  quocGiaId?: number;
}

/**
 * Bulk import debts (Thêm mới mode) — rows already parsed/validated client-side from Excel
 */
export class ImportCreateDebtDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCreateDebtRowDto)
  rows: ImportCreateDebtRowDto[];
}

/**
 * Bank account for dropdown
 */
export class BankAccountDto {
  ID: number;
  TenNganHang: string;
  SoTaiKhoan: string;
  ChuTaiKhoan: string;
}

/**
 * Batch/Lot for dropdown
 */
export class BatchDto {
  LoHang_ID: number;
  TenLoHang: string;
  NgayLoHang: Date;
}
