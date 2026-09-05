import {
  Controller, Get, Post, Put, Delete, Body, Query, Param, ParseIntPipe, HttpCode, HttpStatus,
  UseGuards, Request, ForbiddenException,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import {
  QueryArticleDto, QueryPublicArticleDto, CreateArticleDto, UpdateArticleDto,
} from './dto/article.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

/**
 * Articles Controller
 *
 * Hai nhom duong dan:
 *   /articles/public/*  — trang tin tuc cong khai doc, khong can dang nhap
 *   /articles/*         — trang quan tri soan bai, phai dang nhap va la nhan vien
 */
@Controller('articles')
@UseGuards(JwtAuthGuard)
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  /**
   * Chi nhan vien moi duoc soan bai.
   *
   * Khach hang dang ky qua web khong duoc gan dong nao trong AspNetUserRoles,
   * nen "co it nhat mot vai tro" chinh la ranh gioi nhan vien / khach hang —
   * dung dieu kien ma trang /admin ben frontend dang dung de chan.
   * Khong doc duoc vai trong thi tu choi, khong mo mac dinh.
   */
  private assertStaff(req: any) {
    const roles: string[] = req.user?.roles ?? [];
    if (roles.length === 0) {
      throw new ForbiddenException('Bạn không có quyền quản lý bài viết.');
    }
  }

  // ----------------------------------------------------------------- public

  /** Danh sach bai da dang cho trang /tin-tuc */
  @Public()
  @Get('public')
  async getPublished(@Query() query: QueryPublicArticleDto) {
    return this.articlesService.getPublished(
      query.articleType, query.q, query.page, query.limit,
    );
  }

  /** Slug + ngay cap nhat de trang web dung sinh sitemap.xml */
  @Public()
  @Get('public/sitemap')
  async getSitemap() {
    return this.articlesService.getSitemapEntries();
  }

  /** Bai lien quan hien duoi chan bai viet */
  @Public()
  @Get('public/:slug/related')
  async getRelated(@Param('slug') slug: string, @Query('articleType') articleType: string) {
    return this.articlesService.getRelated(slug, articleType, 4);
  }

  /** Chi tiet mot bai theo duong dan, kem san cac the SEO */
  @Public()
  @Get('public/:slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.articlesService.getBySlug(slug);
  }

  // ------------------------------------------------------------------ admin

  /** Danh sach bai trong trang quan tri, ke ca ban nhap */
  @Get()
  async getList(@Query() query: QueryArticleDto, @Request() req: any) {
    this.assertStaff(req);
    return this.articlesService.getList(
      query.q, query.articleType, query.published, query.page, query.limit,
    );
  }

  /** Cham diem SEO cho bai dang soan, chua can luu */
  @Post('seo-preview')
  @HttpCode(HttpStatus.OK) // Chi cham diem, khong tao gi - khong dung 201
  async seoPreview(@Body() dto: CreateArticleDto, @Request() req: any) {
    this.assertStaff(req);
    return this.articlesService.preview(dto);
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    this.assertStaff(req);
    return this.articlesService.getById(id);
  }

  @Post()
  async create(@Body() dto: CreateArticleDto, @Request() req: any) {
    this.assertStaff(req);
    return this.articlesService.create(dto, req.user?.username || 'system');
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArticleDto,
    @Request() req: any,
  ) {
    this.assertStaff(req);
    return this.articlesService.update(id, dto, req.user?.username || 'system');
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    this.assertStaff(req);
    return this.articlesService.remove(id, req.user?.username || 'system');
  }
}
