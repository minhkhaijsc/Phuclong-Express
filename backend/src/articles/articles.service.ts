import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';

/** Cac cot tra ve cho trang quan tri (day du) */
const ADMIN_COLUMNS = `
  Id, Title, Slug, Content, Excerpt, Thumbnail, Author, ArticleType,
  Published, PublishedAt, MetaTitle, MetaDescription, FocusKeyword,
  CanonicalUrl, OgTitle, OgDescription, OgImage, Noindex,
  ViewCount, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy`;

/** Danh sach thi khong can keo ca noi dung bai ve cho nhe */
const LIST_COLUMNS = `
  Id, Title, Slug, Excerpt, Thumbnail, Author, ArticleType,
  Published, PublishedAt, MetaTitle, MetaDescription, FocusKeyword, Noindex,
  ViewCount, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy`;

/**
 * Bo dau tieng Viet va doi thanh slug dung duoc tren URL.
 * "Bảng giá vận chuyển 2026" -> "bang-gia-van-chuyen-2026"
 */
export function slugify(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // bo dau
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200)
    // Tieu de bat dau/ket thuc bang dau cau se de lai gach thua o hai dau.
    .replace(/^-+|-+$/g, '');
}

/** Bo the HTML de dem tu / cat doan tom tat */
function stripHtml(html: string): string {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SeoCheck {
  key: string;
  label: string;
  status: 'good' | 'warning' | 'error';
  message: string;
}

/**
 * Cham diem SEO cho bai viet.
 *
 * Day la nhung tieu chi co ban ma Google/Rank Math deu soi: do dai tieu de,
 * mo ta, tu khoa xuat hien o dau, so tu, anh, the H2. Khong phai luat cua
 * Google — chi la checklist de nguoi viet khong bo sot.
 */
export function analyzeSeo(a: {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  thumbnail?: string;
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
}): { score: number; checks: SeoCheck[] } {
  const checks: SeoCheck[] = [];
  const text = stripHtml(a.content || '');
  const words = text ? text.split(/\s+/).length : 0;
  const kw = (a.focusKeyword || '').trim().toLowerCase();
  const metaTitle = (a.metaTitle || a.title || '').trim();
  const metaDesc = (a.metaDescription || a.excerpt || '').trim();

  const push = (key: string, label: string, ok: boolean, warn: boolean, msg: string) =>
    checks.push({ key, label, status: ok ? 'good' : warn ? 'warning' : 'error', message: msg });

  // Tieu de SEO: Google cat khoang 60 ky tu.
  push(
    'metaTitle', 'Tiêu đề SEO',
    metaTitle.length >= 30 && metaTitle.length <= 60,
    metaTitle.length > 0,
    metaTitle.length === 0
      ? 'Chưa có tiêu đề.'
      : metaTitle.length < 30
        ? `Hơi ngắn (${metaTitle.length} ký tự) — nên 30–60 để tận dụng hết chỗ hiển thị.`
        : metaTitle.length > 60
          ? `Dài ${metaTitle.length} ký tự — Google sẽ cắt bớt, nên rút về dưới 60.`
          : `Độ dài tốt (${metaTitle.length} ký tự).`,
  );

  // Mo ta SEO: khoang 120-160 ky tu.
  push(
    'metaDescription', 'Mô tả SEO',
    metaDesc.length >= 120 && metaDesc.length <= 160,
    metaDesc.length > 0,
    metaDesc.length === 0
      ? 'Chưa có mô tả — Google sẽ tự lấy một đoạn bất kỳ trong bài.'
      : metaDesc.length < 120
        ? `Hơi ngắn (${metaDesc.length} ký tự) — nên 120–160.`
        : metaDesc.length > 160
          ? `Dài ${metaDesc.length} ký tự — sẽ bị cắt, nên rút về dưới 160.`
          : `Độ dài tốt (${metaDesc.length} ký tự).`,
  );

  // Tu khoa chinh
  if (!kw) {
    push('focusKeyword', 'Từ khóa chính', false, true, 'Chưa đặt từ khóa chính cho bài.');
  } else {
    push('kwInTitle', 'Từ khóa trong tiêu đề', metaTitle.toLowerCase().includes(kw), false,
      metaTitle.toLowerCase().includes(kw) ? 'Tiêu đề có chứa từ khóa.' : 'Tiêu đề chưa chứa từ khóa chính.');
    push('kwInDesc', 'Từ khóa trong mô tả', metaDesc.toLowerCase().includes(kw), false,
      metaDesc.toLowerCase().includes(kw) ? 'Mô tả có chứa từ khóa.' : 'Mô tả chưa chứa từ khóa chính.');
    push('kwInSlug', 'Từ khóa trong đường dẫn', (a.slug || '').includes(slugify(kw)), false,
      (a.slug || '').includes(slugify(kw)) ? 'Đường dẫn có chứa từ khóa.' : 'Đường dẫn chưa chứa từ khóa chính.');

    // Trong 10% noi dung dau tien
    const opening = text.slice(0, Math.max(200, Math.floor(text.length * 0.1))).toLowerCase();
    push('kwInOpening', 'Từ khóa ở đoạn mở đầu', opening.includes(kw), false,
      opening.includes(kw) ? 'Từ khóa xuất hiện sớm trong bài.' : 'Nên nhắc từ khóa ngay trong đoạn đầu.');
  }

  // Do dai bai
  push('wordCount', 'Độ dài bài viết', words >= 600, words >= 300,
    words < 300 ? `Chỉ ${words} từ — bài quá ngắn, khó lên top.`
      : words < 600 ? `${words} từ — tạm được, bài 600+ từ thường xếp hạng tốt hơn.`
        : `${words} từ — độ dài tốt.`);

  // Anh dai dien
  push('thumbnail', 'Ảnh đại diện', !!a.thumbnail, false,
    a.thumbnail ? 'Đã có ảnh đại diện.' : 'Chưa có ảnh đại diện — bài chia sẻ lên Facebook/Zalo sẽ không có ảnh.');

  // The H2 giup Google hieu bo cuc bai
  const hasH2 = /<h2[\s>]/i.test(a.content || '');
  push('headings', 'Tiêu đề mục (H2)', hasH2, false,
    hasH2 ? 'Bài có chia mục bằng H2.' : 'Chưa có mục H2 nào — nên chia bài thành các mục nhỏ.');

  // Anh trong bai co alt
  const imgs = (a.content || '').match(/<img[^>]*>/gi) || [];
  const imgsNoAlt = imgs.filter((t) => !/\salt\s*=\s*["'][^"']+["']/i.test(t));
  if (imgs.length > 0) {
    push('imgAlt', 'Mô tả ảnh (alt)', imgsNoAlt.length === 0, false,
      imgsNoAlt.length === 0 ? 'Mọi ảnh đều có mô tả alt.' : `${imgsNoAlt.length}/${imgs.length} ảnh chưa có mô tả alt.`);
  }

  const good = checks.filter((c) => c.status === 'good').length;
  const score = checks.length ? Math.round((good / checks.length) * 100) : 0;
  return { score, checks };
}

/**
 * Articles Service
 *
 * Quan ly bai viet trang tin tuc. Dung SQL truc tiep (khong qua stored procedure)
 * giong module Notifications, vi day la bang moi khong co san SP ben he thong cu.
 */
@Injectable()
export class ArticlesService {
  constructor(@Inject('SEQUELIZE') private readonly sequelize: Sequelize) {}

  // ---------------------------------------------------------------- helpers

  /**
   * Bao dam slug khong trung. Neu trung thi them hau to -2, -3...
   * excludeId dung khi sua bai (bo qua chinh no).
   */
  private async ensureUniqueSlug(base: string, excludeId?: number): Promise<string> {
    const root = slugify(base) || 'bai-viet';
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? root : `${root}-${i + 1}`;
      const rows = (await this.sequelize.query(
        `SELECT TOP 1 Id FROM Articles
         WHERE Slug = :slug AND IsDeleted = 0 AND (:excludeId IS NULL OR Id <> :excludeId)`,
        { replacements: { slug: candidate, excludeId: excludeId ?? null }, type: 'SELECT' as const },
      )) as any[];
      if (!rows || rows.length === 0) return candidate;
    }
    throw new BadRequestException('Không tạo được đường dẫn duy nhất cho bài viết, vui lòng đổi tiêu đề.');
  }

  /** Tu sinh doan tom tat tu noi dung khi nguoi viet de trong */
  private buildExcerpt(content: string, excerpt?: string): string | null {
    if (excerpt && excerpt.trim()) return excerpt.trim().slice(0, 500);
    const text = stripHtml(content);
    if (!text) return null;
    return text.length <= 300 ? text : `${text.slice(0, 297)}...`;
  }

  // ------------------------------------------------------------------ admin

  /** Danh sach bai viet trong trang quan tri (ke ca ban nhap) */
  async getList(q: string | undefined, articleType: string | undefined, published: number | undefined, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const rows = (await this.sequelize.query(
      `SELECT ${LIST_COLUMNS}, COUNT(*) OVER() AS TotalRow
       FROM   Articles
       WHERE  IsDeleted = 0
         AND (:q IS NULL OR Title LIKE :like OR Slug LIKE :like)
         AND (:articleType IS NULL OR ArticleType = :articleType)
         AND (:published IS NULL OR Published = :published)
       ORDER  BY CreatedAt DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      {
        replacements: {
          q: q?.trim() || null,
          like: `%${q?.trim() ?? ''}%`,
          articleType: articleType || null,
          published: published === undefined || published === null ? null : published,
          offset,
          limit,
        },
        type: 'SELECT' as const,
      },
    )) as any[];

    const data = Array.isArray(rows) ? rows : [];
    const total = data.length > 0 ? Number(data[0].TotalRow ?? 0) : 0;
    return { data, total, page, limit };
  }

  /** Chi tiet bai viet cho trang sua, kem ket qua cham diem SEO */
  async getById(id: number) {
    const rows = (await this.sequelize.query(
      `SELECT ${ADMIN_COLUMNS} FROM Articles WHERE Id = :id AND IsDeleted = 0`,
      { replacements: { id }, type: 'SELECT' as const },
    )) as any[];
    if (!rows || rows.length === 0) throw new NotFoundException('Không tìm thấy bài viết.');

    const a = rows[0];
    return {
      ...a,
      seo: analyzeSeo({
        title: a.Title, slug: a.Slug, content: a.Content, excerpt: a.Excerpt,
        thumbnail: a.Thumbnail, metaTitle: a.MetaTitle, metaDescription: a.MetaDescription,
        focusKeyword: a.FocusKeyword,
      }),
    };
  }

  /** Tao bai moi */
  async create(dto: CreateArticleDto, username: string) {
    const slug = await this.ensureUniqueSlug(dto.slug || dto.title);
    const published = dto.published === true;

    const rows = (await this.sequelize.query(
      `INSERT INTO Articles
         (Title, Slug, Content, Excerpt, Thumbnail, Author, ArticleType, Published, PublishedAt,
          MetaTitle, MetaDescription, FocusKeyword, CanonicalUrl, OgTitle, OgDescription, OgImage, Noindex,
          CreatedBy)
       OUTPUT INSERTED.Id
       VALUES
         (:title, :slug, :content, :excerpt, :thumbnail, :author, :articleType, :published,
          CASE WHEN :published = 1 THEN GETDATE() ELSE NULL END,
          :metaTitle, :metaDescription, :focusKeyword, :canonicalUrl, :ogTitle, :ogDescription, :ogImage, :noindex,
          :createdBy)`,
      {
        replacements: {
          title: dto.title.trim(),
          slug,
          content: dto.content,
          excerpt: this.buildExcerpt(dto.content, dto.excerpt),
          thumbnail: dto.thumbnail || null,
          author: dto.author?.trim() || username,
          articleType: dto.articleType || 'tin-tuc',
          published: published ? 1 : 0,
          metaTitle: dto.metaTitle?.trim() || null,
          metaDescription: dto.metaDescription?.trim() || null,
          focusKeyword: dto.focusKeyword?.trim() || null,
          canonicalUrl: dto.canonicalUrl?.trim() || null,
          ogTitle: dto.ogTitle?.trim() || null,
          ogDescription: dto.ogDescription?.trim() || null,
          ogImage: dto.ogImage?.trim() || null,
          noindex: dto.noindex === true ? 1 : 0,
          createdBy: username,
        },
        type: 'SELECT' as const,
      },
    )) as any[];

    const id = Number(rows?.[0]?.Id);
    return this.getById(id);
  }

  /**
   * Sua bai. Chi truong nao co trong dto moi bi ghi de — COALESCE khong dung duoc
   * o day vi nguoi viet co quyen xoa trang mot truong, nen dung co IsNull rieng.
   */
  async update(id: number, dto: UpdateArticleDto, username: string) {
    const current = (await this.sequelize.query(
      `SELECT Id, Title, Slug, Content, Published FROM Articles WHERE Id = :id AND IsDeleted = 0`,
      { replacements: { id }, type: 'SELECT' as const },
    )) as any[];
    if (!current || current.length === 0) throw new NotFoundException('Không tìm thấy bài viết.');
    const before = current[0];

    // Doi slug khi nguoi viet tu sua slug, hoac khi doi tieu de ma slug dang de trong.
    let slug = before.Slug;
    if (dto.slug !== undefined && slugify(dto.slug) !== before.Slug) {
      slug = await this.ensureUniqueSlug(dto.slug || dto.title || before.Title, id);
    }

    const content = dto.content !== undefined ? dto.content : before.Content;
    const has = (k: keyof UpdateArticleDto) => (dto[k] !== undefined ? 1 : 0);

    await this.sequelize.query(
      `UPDATE Articles SET
         Title           = CASE WHEN :hasTitle       = 1 THEN :title       ELSE Title           END,
         Slug            = :slug,
         Content         = CASE WHEN :hasContent     = 1 THEN :content     ELSE Content         END,
         Excerpt         = CASE WHEN :hasExcerpt     = 1 THEN :excerpt     ELSE Excerpt         END,
         Thumbnail       = CASE WHEN :hasThumbnail   = 1 THEN :thumbnail   ELSE Thumbnail       END,
         Author          = CASE WHEN :hasAuthor      = 1 THEN :author      ELSE Author          END,
         ArticleType     = CASE WHEN :hasType        = 1 THEN :articleType ELSE ArticleType     END,
         MetaTitle       = CASE WHEN :hasMetaTitle   = 1 THEN :metaTitle   ELSE MetaTitle       END,
         MetaDescription = CASE WHEN :hasMetaDesc    = 1 THEN :metaDesc    ELSE MetaDescription END,
         FocusKeyword    = CASE WHEN :hasKeyword     = 1 THEN :focusKeyword ELSE FocusKeyword   END,
         CanonicalUrl    = CASE WHEN :hasCanonical   = 1 THEN :canonicalUrl ELSE CanonicalUrl   END,
         OgTitle         = CASE WHEN :hasOgTitle     = 1 THEN :ogTitle     ELSE OgTitle         END,
         OgDescription   = CASE WHEN :hasOgDesc      = 1 THEN :ogDesc      ELSE OgDescription   END,
         OgImage         = CASE WHEN :hasOgImage     = 1 THEN :ogImage     ELSE OgImage         END,
         Noindex         = CASE WHEN :hasNoindex     = 1 THEN :noindex     ELSE Noindex         END,
         Published       = CASE WHEN :hasPublished   = 1 THEN :published   ELSE Published       END,
         -- Lan dau bam dang thi ghi moc thoi gian, cac lan sua sau giu nguyen.
         PublishedAt     = CASE WHEN :hasPublished = 1 AND :published = 1 AND PublishedAt IS NULL
                                THEN GETDATE() ELSE PublishedAt END,
         UpdatedAt       = GETDATE(),
         UpdatedBy       = :username
       WHERE Id = :id`,
      {
        replacements: {
          id,
          slug,
          username,
          hasTitle: has('title'),      title: dto.title?.trim() ?? null,
          hasContent: has('content'),  content,
          hasExcerpt: has('excerpt') || has('content'),
          excerpt: this.buildExcerpt(content, dto.excerpt),
          hasThumbnail: has('thumbnail'), thumbnail: dto.thumbnail?.trim() || null,
          hasAuthor: has('author'),    author: dto.author?.trim() || null,
          hasType: has('articleType'), articleType: dto.articleType || null,
          hasMetaTitle: has('metaTitle'), metaTitle: dto.metaTitle?.trim() || null,
          hasMetaDesc: has('metaDescription'), metaDesc: dto.metaDescription?.trim() || null,
          hasKeyword: has('focusKeyword'), focusKeyword: dto.focusKeyword?.trim() || null,
          hasCanonical: has('canonicalUrl'), canonicalUrl: dto.canonicalUrl?.trim() || null,
          hasOgTitle: has('ogTitle'),  ogTitle: dto.ogTitle?.trim() || null,
          hasOgDesc: has('ogDescription'), ogDesc: dto.ogDescription?.trim() || null,
          hasOgImage: has('ogImage'),  ogImage: dto.ogImage?.trim() || null,
          hasNoindex: has('noindex'),  noindex: dto.noindex === true ? 1 : 0,
          hasPublished: has('published'), published: dto.published === true ? 1 : 0,
        },
        type: 'SELECT' as const,
      },
    );

    return this.getById(id);
  }

  /** Xoa mem — giu lai bai de con khoi phuc duoc */
  async remove(id: number, username: string) {
    const rows = (await this.sequelize.query(
      `UPDATE Articles SET IsDeleted = 1, UpdatedAt = GETDATE(), UpdatedBy = :username
       OUTPUT INSERTED.Id
       WHERE Id = :id AND IsDeleted = 0`,
      { replacements: { id, username }, type: 'SELECT' as const },
    )) as any[];
    if (!rows || rows.length === 0) throw new NotFoundException('Không tìm thấy bài viết.');
    return { success: true };
  }

  /** Cham diem SEO cho noi dung dang soan, khong can luu bai */
  preview(dto: CreateArticleDto) {
    const slug = slugify(dto.slug || dto.title || '');
    return {
      slug,
      seo: analyzeSeo({ ...dto, slug }),
    };
  }

  // ----------------------------------------------------------------- public

  /** Danh sach bai da dang cho trang tin tuc cong khai */
  async getPublished(articleType: string | undefined, q: string | undefined, page = 1, limit = 12) {
    const offset = (page - 1) * limit;
    const rows = (await this.sequelize.query(
      `SELECT Id, Title, Slug, Excerpt, Thumbnail, Author, ArticleType, PublishedAt, ViewCount,
              COUNT(*) OVER() AS TotalRow
       FROM   Articles
       WHERE  IsDeleted = 0 AND Published = 1
         AND (:articleType IS NULL OR ArticleType = :articleType)
         AND (:q IS NULL OR Title LIKE :like OR Excerpt LIKE :like)
       ORDER  BY PublishedAt DESC, Id DESC
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      {
        replacements: {
          articleType: articleType || null,
          q: q?.trim() || null,
          like: `%${q?.trim() ?? ''}%`,
          offset,
          limit,
        },
        type: 'SELECT' as const,
      },
    )) as any[];

    const data = Array.isArray(rows) ? rows : [];
    const total = data.length > 0 ? Number(data[0].TotalRow ?? 0) : 0;
    return { data, total, page, limit };
  }

  /**
   * Chi tiet bai theo slug cho trang cong khai.
   * Tra kem cac truong SEO da dien san mac dinh de trang chi viec do vao <head>.
   */
  async getBySlug(slug: string) {
    const rows = (await this.sequelize.query(
      `SELECT ${ADMIN_COLUMNS} FROM Articles
       WHERE Slug = :slug AND IsDeleted = 0 AND Published = 1`,
      { replacements: { slug }, type: 'SELECT' as const },
    )) as any[];
    if (!rows || rows.length === 0) throw new NotFoundException('Không tìm thấy bài viết.');
    const a = rows[0];

    // Dem luot xem — hong cung khong duoc lam gay trang bai viet.
    this.sequelize
      .query(`UPDATE Articles SET ViewCount = ViewCount + 1 WHERE Id = :id`, {
        replacements: { id: a.Id },
        type: 'SELECT' as const,
      })
      .catch(() => undefined);

    return {
      ...a,
      seo: {
        metaTitle: a.MetaTitle || a.Title,
        metaDescription: a.MetaDescription || a.Excerpt || '',
        canonicalUrl: a.CanonicalUrl || null,
        ogTitle: a.OgTitle || a.MetaTitle || a.Title,
        ogDescription: a.OgDescription || a.MetaDescription || a.Excerpt || '',
        ogImage: a.OgImage || a.Thumbnail || null,
        noindex: !!a.Noindex,
      },
    };
  }

  /** Bai lien quan hien duoi chan bai viet */
  async getRelated(slug: string, articleType: string, limit = 4) {
    return this.sequelize.query(
      `SELECT TOP (:limit) Id, Title, Slug, Excerpt, Thumbnail, PublishedAt
       FROM   Articles
       WHERE  IsDeleted = 0 AND Published = 1 AND Slug <> :slug
         AND (:articleType IS NULL OR ArticleType = :articleType)
       ORDER  BY PublishedAt DESC`,
      { replacements: { slug, articleType: articleType || null, limit }, type: 'SELECT' as const },
    );
  }

  /** Danh sach slug + ngay sua cuoi cho sitemap.xml */
  async getSitemapEntries() {
    return this.sequelize.query(
      `SELECT Slug, ArticleType, PublishedAt, UpdatedAt
       FROM   Articles
       WHERE  IsDeleted = 0 AND Published = 1 AND Noindex = 0
       ORDER  BY PublishedAt DESC`,
      { type: 'SELECT' as const },
    );
  }
}
