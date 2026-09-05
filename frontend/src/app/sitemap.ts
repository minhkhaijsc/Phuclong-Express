import type { MetadataRoute } from 'next';
import { PUBLIC_ROUTES, SITE_URL } from '@/lib/seo/site-config';
import { fetchArticleSitemap } from '@/lib/articles-server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path === '/' ? '' : route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  // Từng bài viết một dòng, để Google tìm ra bài mới mà không phải chờ dò link.
  // Bài đặt "ẩn khỏi Google" đã bị backend loại sẵn.
  const articles = await fetchArticleSitemap();
  const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${SITE_URL}/tin-tuc/${a.Slug}`,
    lastModified: a.UpdatedAt ? new Date(a.UpdatedAt) : a.PublishedAt ? new Date(a.PublishedAt) : now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...articleRoutes];
}
