/**
 * Central SEO configuration for Phuc Long Express.
 *
 * Override the canonical site URL by setting `NEXT_PUBLIC_SITE_URL` in `.env`.
 * Must be a full origin (https://...) with no trailing slash.
 */

const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://phuclongexpress.com';
export const SITE_URL = rawSiteUrl.replace(/\/+$/, '');

export const SITE_NAME = 'Phuc Long Express';

export const SITE_TAGLINE = 'Dịch vụ vận chuyển hàng quốc tế về Việt Nam';

export const SITE_DESCRIPTION =
  'Phuc Long Express — Dịch vụ đặt hàng và vận chuyển hàng hóa quốc tế (Mỹ, Nhật, Hàn, Trung, Châu Âu) về Việt Nam an toàn, nhanh chóng, giá tốt. Tra cứu tracking, tỷ giá, đặt hàng online 24/7.';

export const SITE_KEYWORDS = [
  'vận chuyển hàng Mỹ',
  'order hàng quốc tế',
  'vận chuyển hàng về Việt Nam',
  'ship hàng từ Mỹ',
  'ship hàng từ Nhật',
  'ship hàng từ Hàn',
  'tra cứu tracking',
  'tỷ giá ngoại tệ',
  'Phuc Long Express',
];

export const DEFAULT_LOCALE = 'vi_VN';
export const SUPPORTED_LOCALES = ['vi_VN', 'en_US'] as const;

/**
 * hreflang map. Keys are BCP-47 language tags; values are absolute URLs.
 * Currently the site is Vietnamese only. The structure is here so adding
 * an English variant later only requires populating the `en` URL pattern.
 */
export const LANGUAGE_ALTERNATES: Record<string, string> = {
  'vi-VN': SITE_URL,
  'x-default': SITE_URL,
};

export const DEFAULT_OG_IMAGE = {
  url: `${SITE_URL}/LOGO_PHUC_LONG_EXPRESS_FULL.png`,
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
};

export const TWITTER_HANDLE = '@phuclongexpress';

/**
 * Routes that must never be indexed (auth-gated user data + admin + auth UI).
 * Used by `app/robots.ts` to generate Disallow rules.
 */
export const DISALLOWED_PATHS = [
  '/api/',
  '/admin/',
  '/login',
  '/danh-sach-don-hang',
  '/danh-sach-tracking',
  '/dot-hang-user',
  '/sua-don-hang',
  '/sua-tracking',
  '/thong-tin-dot-hang',
  '/thong-tin-lo-hang',
  '/thong-tin-ship-hang',
  '/yeu-cau-ship-hang-liet-ke',
  '/bao-cao-cong-no',
  '/chuyen-khoan',
  '/shipper-detail',
] as const;

/**
 * Public routes included in sitemap.xml. Ordered by SEO priority.
 */
export const PUBLIC_ROUTES: ReadonlyArray<{
  path: string;
  priority: number;
  changeFrequency:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never';
}> = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/dat-hang', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/ty-gia', priority: 0.8, changeFrequency: 'daily' },
  { path: '/tin-tuc', priority: 0.8, changeFrequency: 'daily' },
  { path: '/hoi-dap', priority: 0.7, changeFrequency: 'weekly' },
];
