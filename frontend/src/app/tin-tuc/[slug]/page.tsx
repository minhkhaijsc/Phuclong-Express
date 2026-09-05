import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PublicLayout from '@/app/components/public-home/public-layout';
import { buildMetadata } from '@/lib/seo/build-metadata';
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from '@/lib/seo/site-config';
import {
  articleTypeLabel,
  fetchArticleBySlug,
  fetchRelatedArticles,
  formatArticleDate,
} from '@/lib/articles-server';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Ảnh chia sẻ phải là đường dẫn đầy đủ, Facebook/Zalo không hiểu đường dẫn tương đối */
function absoluteUrl(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await fetchArticleBySlug(slug);

  if (!article) {
    return buildMetadata({ title: 'Không tìm thấy bài viết', path: `/tin-tuc/${slug}`, noindex: true });
  }

  const { seo } = article;
  const ogImageUrl = absoluteUrl(seo.ogImage);

  const base = buildMetadata({
    title: seo.metaTitle,
    description: seo.metaDescription,
    path: `/tin-tuc/${article.Slug}`,
    noindex: seo.noindex,
    ogImage: ogImageUrl
      ? { url: ogImageUrl, width: 1200, height: 630, alt: seo.ogTitle }
      : DEFAULT_OG_IMAGE,
  });

  return {
    ...base,
    // Bài viết dùng canonical riêng khi được đăng lại từ nguồn khác.
    alternates: { ...base.alternates, canonical: seo.canonicalUrl || base.alternates?.canonical },
    authors: article.Author ? [{ name: article.Author }] : undefined,
    openGraph: {
      ...base.openGraph,
      type: 'article',
      title: seo.ogTitle,
      description: seo.ogDescription,
      publishedTime: article.PublishedAt ?? undefined,
      modifiedTime: article.UpdatedAt ?? article.PublishedAt ?? undefined,
      authors: article.Author ? [article.Author] : undefined,
      section: articleTypeLabel(article.ArticleType),
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await fetchArticleBySlug(slug);

  if (!article) notFound();

  const related = await fetchRelatedArticles(article.Slug, article.ArticleType);
  const url = `${SITE_URL}/tin-tuc/${article.Slug}`;
  const image = absoluteUrl(article.Thumbnail);

  // Article: giúp Google hiển thị ngày đăng + ảnh lớn trong kết quả tìm kiếm.
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.Title,
    description: article.seo.metaDescription,
    image: image ? [image] : [DEFAULT_OG_IMAGE.url],
    datePublished: article.PublishedAt ?? undefined,
    dateModified: article.UpdatedAt ?? article.PublishedAt ?? undefined,
    author: { '@type': article.Author ? 'Person' : 'Organization', name: article.Author || SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: DEFAULT_OG_IMAGE.url },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };

  // BreadcrumbList: Google hiển thị đường dẫn phân cấp thay cho URL trần.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Tin tức', item: `${SITE_URL}/tin-tuc` },
      { '@type': 'ListItem', position: 3, name: article.Title, item: url },
    ],
  };

  return (
    <PublicLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <article className="max-w-3xl mx-auto px-4 py-10">
        {/* Đường dẫn phân cấp */}
        <nav className="text-sm text-gray-500 mb-6" aria-label="Đường dẫn">
          <Link href="/" className="hover:text-[#14264b]">Trang chủ</Link>
          <span className="mx-2">/</span>
          <Link href="/tin-tuc" className="hover:text-[#14264b]">Tin tức</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-700">{articleTypeLabel(article.ArticleType)}</span>
        </nav>

        <header>
          <Link
            href={`/tin-tuc?chuyen_muc=${article.ArticleType}`}
            className="inline-flex px-2.5 py-1 rounded-full bg-blue-50 text-[#14264b] text-xs font-medium hover:bg-blue-100"
          >
            {articleTypeLabel(article.ArticleType)}
          </Link>

          {/* Chỉ đúng một thẻ H1 trên trang — phần còn lại của bài dùng H2/H3 */}
          <h1 className="mt-3 text-3xl md:text-4xl font-bold text-gray-900 text-balance leading-tight">
            {article.Title}
          </h1>

          <div className="mt-4 flex items-center gap-3 text-sm text-gray-500">
            {article.Author && <span>{article.Author}</span>}
            {article.Author && <span aria-hidden>·</span>}
            {article.PublishedAt && (
              <time dateTime={article.PublishedAt}>{formatArticleDate(article.PublishedAt)}</time>
            )}
            <span aria-hidden>·</span>
            <span>{article.ViewCount} lượt xem</span>
          </div>

          {article.Excerpt && (
            <p className="mt-5 text-lg text-gray-600 leading-relaxed">{article.Excerpt}</p>
          )}

          {article.Thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.Thumbnail}
              alt={article.Title}
              className="mt-6 w-full rounded-xl border border-gray-200"
            />
          )}
        </header>

        {/* Nội dung do biên tập viên soạn trong trang quản trị */}
        <div
          className="article-content mt-8 text-gray-800"
          dangerouslySetInnerHTML={{ __html: article.Content }}
        />

        {related.length > 0 && (
          <section className="mt-12 pt-8 border-t border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-5">Bài viết liên quan</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              {related.map((r) => (
                <Link
                  key={r.Id}
                  href={`/tin-tuc/${r.Slug}`}
                  className="group flex gap-4 rounded-xl border border-gray-200 p-3 hover:shadow-md transition"
                >
                  <div className="w-24 h-20 shrink-0 rounded-lg bg-gray-100 overflow-hidden">
                    {r.Thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.Thumbnail} alt={r.Title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">📰</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-gray-900 group-hover:text-[#14264b] line-clamp-2">
                      {r.Title}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">{formatArticleDate(r.PublishedAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-10">
          <Link href="/tin-tuc" className="text-[#14264b] font-medium hover:underline">
            ← Xem tất cả bài viết
          </Link>
        </div>
      </article>
    </PublicLayout>
  );
}
