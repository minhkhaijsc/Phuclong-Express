import { IsOptional, IsNumber, IsString, IsBoolean, Min, MaxLength, Matches } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Query parameters for the admin article list
 */
export class QueryArticleDto {
  /** Tim theo tieu de hoac slug */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  articleType?: string;

  /** 1 = da dang, 0 = ban nhap, bo trong = tat ca */
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  published?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}

/**
 * Query parameters for the public news list
 */
export class QueryPublicArticleDto {
  @IsOptional()
  @IsString()
  articleType?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  limit?: number = 12;
}

/**
 * Create a new article.
 *
 * Chi Title va Content la bat buoc. Slug bo trong thi tu sinh tu tieu de,
 * cac truong SEO bo trong thi khi tra ra cho trang cong khai se lay tam
 * Title/Excerpt lam mac dinh (xem buildSeo trong service).
 */
export class CreateArticleDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  articleType?: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  /**
   * Ngay dang hien tren bai, dang `yyyy-mm-dd`. Bo trong thi he thong tu lay
   * ngay bam Dang bai nhu truoc.
   *
   * CHI LA NGAY HIEN THI, khong phai hen gio: bai len web ngay khi `published`
   * bat, du ngay nay la mai sau. Dat ngay sau de danh dau "bai cu dang bu"
   * la viec thuong gap nen van cho phep.
   *
   * O trong tren man soan bai gui len CHUOI RONG chu khong phai undefined, ma
   * `@IsOptional` chi bo qua null/undefined — nen phai doi '' thanh undefined
   * ngay o day. Dat o DTO de moi noi goi khoi phai nho: ca
   * `POST /articles/seo-preview` (cham diem SEO sau moi lan go, dung CHINH
   * DTO nay) lan luc luu bai.
   */
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Ngày đăng phải ở dạng yyyy-mm-dd.',
  })
  publishedAt?: string;

  // ---- SEO ----

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  focusKeyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  canonicalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ogTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogImage?: string;

  @IsOptional()
  @IsBoolean()
  noindex?: boolean;
}

/**
 * Update an article — moi truong deu tuy chon, chi truong nao gui len moi bi ghi de.
 */
export class UpdateArticleDto extends CreateArticleDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  declare title: string;

  @IsOptional()
  @IsString()
  declare content: string;
}
