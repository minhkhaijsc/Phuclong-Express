import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Một dòng đơn được chọn. `ngoaiTe` để trống = giữ nguyên ngoại tệ đang có. */
export class DongNccHangLoatDto {
  @IsInt()
  id: number;

  @IsOptional()
  @IsNumber()
  ngoaiTe?: number | null;
}

/**
 * Nhập giá nhà cung cấp cho nhiều dòng đơn một lượt.
 *
 * Bốn ô dùng chung (nccId, cong, tyGia, tracking) ĐỂ TRỐNG LÀ GIỮ NGUYÊN — xem
 * `ncc-hang-loat.ts`. Riêng ngoại tệ đi theo từng dòng vì mỗi món một giá.
 *
 * Trần 500 dòng: màn danh sách lấy tối đa 200 đơn một trang, nên 500 đã thừa
 * sức cho mọi thao tác thật, mà vẫn chặn được một yêu cầu gửi cả chục nghìn ID
 * làm nghẽn CSDL.
 */
export class NccHangLoatDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DongNccHangLoatDto)
  dong: DongNccHangLoatDto[];

  @IsOptional()
  @IsInt()
  nccId?: number | null;

  /** % công, nhập 3 nghĩa là 3%. */
  @IsOptional()
  @IsNumber()
  cong?: number | null;

  @IsOptional()
  @IsNumber()
  tyGia?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tracking?: string | null;

  /** Mặc định bật. */
  @IsOptional()
  @IsBoolean()
  tinhLaiTongPhaiTra?: boolean;
}
