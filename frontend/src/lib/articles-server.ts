/**
 * Lấy bài viết ở phía máy chủ (server component).
 *
 * Trang tin tức phải render sẵn nội dung trong HTML thì Google mới đọc được —
 * nếu chờ trình duyệt gọi API rồi mới vẽ, con bot thường chỉ thấy trang trống.
 * Vì vậy các trang /tin-tuc dùng hàm ở đây thay cho `apiClient` (axios, chạy ở trình duyệt).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** Bài viết đã đăng — mỗi 5 phút mới lấy lại, đủ tươi mà không đập vào API mỗi lượt truy cập */
const REVALIDATE_SECONDS = 300;

export interface PublicArticleListItem {
  Id: number;
  Title: string;
  Slug: string;
  Excerpt: string | null;
  Thumbnail: string | null;
  Author: string | null;
  ArticleType: string;
  PublishedAt: string | null;
  ViewCount: number;
}

export interface PublicArticle extends PublicArticleListItem {
  Content: string;
  UpdatedAt: string | null;
  seo: {
    metaTitle: string;
    metaDescription: string;
    canonicalUrl: string | null;
    ogTitle: string;
    ogDescription: string;
    ogImage: string | null;
    noindex: boolean;
  };
}

export interface PublicArticleList {
  data: PublicArticleListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ArticleSitemapEntry {
  Slug: string;
  ArticleType: string;
  PublishedAt: string | null;
  UpdatedAt: string | null;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // API chết thì trang tin vẫn phải mở được, chỉ là không có bài.
    return null;
  }
}

export async function fetchPublishedArticles(params: {
  page?: number;
  limit?: number;
  articleType?: string;
  q?: string;
} = {}): Promise<PublicArticleList> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.articleType) qs.set('articleType', params.articleType);
  if (params.q) qs.set('q', params.q);

  const result = await getJson<PublicArticleList>(`/articles/public?${qs.toString()}`);
  return result ?? { data: [], total: 0, page: params.page ?? 1, limit: params.limit ?? 12 };
}

export async function fetchArticleBySlug(slug: string): Promise<PublicArticle | null> {
  return getJson<PublicArticle>(`/articles/public/${encodeURIComponent(slug)}`);
}

export async function fetchRelatedArticles(
  slug: string,
  articleType: string,
): Promise<PublicArticleListItem[]> {
  const result = await getJson<PublicArticleListItem[]>(
    `/articles/public/${encodeURIComponent(slug)}/related?articleType=${encodeURIComponent(articleType)}`,
  );
  return result ?? [];
}

export async function fetchArticleSitemap(): Promise<ArticleSitemapEntry[]> {
  const result = await getJson<ArticleSitemapEntry[]>('/articles/public/sitemap');
  return result ?? [];
}

/** Tên chuyên mục hiển thị cho người đọc */
export const ARTICLE_TYPE_LABELS: Record<string, string> = {
  'tin-tuc': 'Tin tức',
  'huong-dan': 'Hướng dẫn',
  'khuyen-mai': 'Khuyến mãi',
  'bang-gia': 'Bảng giá',
};

export function articleTypeLabel(type: string): string {
  return ARTICLE_TYPE_LABELS[type] ?? 'Tin tức';
}

export function formatArticleDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
