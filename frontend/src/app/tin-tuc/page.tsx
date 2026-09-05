import Link from 'next/link';
import PublicLayout from '@/app/components/public-home/public-layout';
import { buildMetadata } from '@/lib/seo/build-metadata';
import { SITE_NAME, SITE_URL } from '@/lib/seo/site-config';
import {
  ARTICLE_TYPE_LABELS,
  articleTypeLabel,
  fetchPublishedArticles,
  formatArticleDate,
} from '@/lib/articles-server';

export const metadata = buildMetadata({
  title: 'Tin tức & Hướng dẫn',
  description:
    'Tin tức, hướng dẫn và bảng giá mới nhất về dịch vụ vận chuyển hàng quốc tế của Phuc Long Express: cước phí, thời gian giao, kinh nghiệm order hàng Mỹ, Nhật, Hàn, Trung.',
  path: '/tin-tuc',
  keywords: [
    'tin tức vận chuyển quốc tế',
    'hướng dẫn order hàng',
    'kinh nghiệm mua hàng Mỹ',
    'bảng giá vận chuyển',
  ],
});

const PAGE_SIZE = 12;

interface PageProps {
  searchParams: Promise<{ page?: string; chuyen_muc?: string }>;
}

export default async function TinTucPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const articleType = sp.chuyen_muc || '';

  const { data: articles, total } = await fetchPublishedArticles({
    page,
    limit: PAGE_SIZE,
    articleType: articleType || undefined,
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const [featured, ...rest] = articles;

  // Google dùng dữ liệu này để hiểu đây là trang danh sách bài viết.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Tin tức & Hướng dẫn',
    url: `${SITE_URL}/tin-tuc`,
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.map((a, i) => ({
        '@type': 'ListItem',
        position: (page - 1) * PAGE_SIZE + i + 1,
        url: `${SITE_URL}/tin-tuc/${a.Slug}`,
        name: a.Title,
      })),
    },
  };

  const buildHref = (nextPage: number) => {
    const qs = new URLSearchParams();
    if (articleType) qs.set('chuyen_muc', articleType);
    if (nextPage > 1) qs.set('page', String(nextPage));
    const s = qs.toString();
    return s ? `/tin-tuc?${s}` : '/tin-tuc';
  };

  return (
    <PublicLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="bg-[#14264b] text-white">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <p className="text-sm uppercase tracking-wider text-white/60">Phuc Long Express</p>
          <h1 className="text-3xl md:text-4xl font-bold mt-2">Tin tức &amp; Hướng dẫn</h1>
          <p className="mt-3 text-white/80 max-w-2xl">
            Cập nhật bảng giá, thời gian vận chuyển và kinh nghiệm order hàng quốc tế về Việt Nam.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Chuyên mục */}
        <nav className="flex flex-wrap gap-2 mb-8" aria-label="Chuyên mục">
          <Link
            href="/tin-tuc"
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              !articleType ? 'bg-[#14264b] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tất cả
          </Link>
          {Object.entries(ARTICLE_TYPE_LABELS).map(([value, label]) => (
            <Link
              key={value}
              href={`/tin-tuc?chuyen_muc=${value}`}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                articleType === value
                  ? 'bg-[#14264b] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {articles.length === 0 ? (
          <p className="py-16 text-center text-gray-500">Chưa có bài viết nào trong mục này.</p>
        ) : (
          <>
            {/* Bài nổi bật — chỉ ở trang đầu */}
            {page === 1 && featured && (
              <Link
                href={`/tin-tuc/${featured.Slug}`}
                className="group grid md:grid-cols-2 gap-6 mb-10 rounded-2xl overflow-hidden border border-gray-200 hover:shadow-lg transition"
              >
                <div className="aspect-[16/10] bg-gray-100 overflow-hidden">
                  {featured.Thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={featured.Thumbnail}
                      alt={featured.Title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-5xl">📰</div>
                  )}
                </div>
                <div className="p-6 flex flex-col justify-center">
                  <span className="inline-flex self-start px-2.5 py-1 rounded-full bg-blue-50 text-[#14264b] text-xs font-medium">
                    {articleTypeLabel(featured.ArticleType)}
                  </span>
                  <h2 className="mt-3 text-2xl font-bold text-gray-900 group-hover:text-[#14264b] text-balance">
                    {featured.Title}
                  </h2>
                  <p className="mt-3 text-gray-600 line-clamp-3">{featured.Excerpt}</p>
                  <p className="mt-4 text-sm text-gray-500">
                    {featured.Author && <>{featured.Author} · </>}
                    {formatArticleDate(featured.PublishedAt)}
                  </p>
                </div>
              </Link>
            )}

            {/* Lưới bài viết */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {(page === 1 ? rest : articles).map((a) => (
                <Link
                  key={a.Id}
                  href={`/tin-tuc/${a.Slug}`}
                  className="group flex flex-col rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg transition"
                >
                  <div className="aspect-[16/10] bg-gray-100 overflow-hidden">
                    {a.Thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.Thumbnail}
                        alt={a.Title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">📰</div>
                    )}
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <span className="inline-flex self-start px-2.5 py-1 rounded-full bg-blue-50 text-[#14264b] text-xs font-medium">
                      {articleTypeLabel(a.ArticleType)}
                    </span>
                    <h2 className="mt-2.5 font-semibold text-gray-900 group-hover:text-[#14264b] line-clamp-2 text-balance">
                      {a.Title}
                    </h2>
                    <p className="mt-2 text-sm text-gray-600 line-clamp-3 flex-1">{a.Excerpt}</p>
                    <p className="mt-3 text-xs text-gray-500">{formatArticleDate(a.PublishedAt)}</p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Phân trang — dùng thẻ <a> thật để Google đi theo được sang trang sau */}
            {totalPages > 1 && (
              <nav className="flex items-center justify-center gap-2 mt-10" aria-label="Phân trang">
                {page > 1 && (
                  <Link
                    href={buildHref(page - 1)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Trang trước
                  </Link>
                )}
                <span className="px-4 py-2 text-sm text-gray-600 tabular-nums">
                  Trang {page}/{totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={buildHref(page + 1)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Trang sau
                  </Link>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </PublicLayout>
  );
}
