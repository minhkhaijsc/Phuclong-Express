'use client';

import type { SeoResult } from '@/lib/api';
import { SITE_URL } from '@/lib/seo/site-config';

interface SeoPanelProps {
  seo: SeoResult | null;
  loading: boolean;
  slug: string;
  metaTitle: string;
  metaDescription: string;
}

const STATUS_STYLE = {
  good: { dot: 'bg-green-500', text: 'text-gray-700' },
  warning: { dot: 'bg-amber-500', text: 'text-gray-700' },
  error: { dot: 'bg-red-500', text: 'text-gray-700' },
} as const;

/** Màu vòng điểm: đỏ dưới 50, vàng dưới 80, xanh từ 80 */
function scoreColor(score: number) {
  if (score >= 80) return { ring: 'text-green-500', label: 'Tốt' };
  if (score >= 50) return { ring: 'text-amber-500', label: 'Cần cải thiện' };
  return { ring: 'text-red-500', label: 'Chưa đạt' };
}

/**
 * Bảng điểm SEO + xem trước kết quả trên Google.
 *
 * Điểm và danh sách kiểm tra đều do backend chấm (`/articles/seo-preview`)
 * để chỉ có một bộ tiêu chí duy nhất, tránh lệch giữa lúc soạn và lúc lưu.
 */
export default function SeoPanel({
  seo,
  loading,
  slug,
  metaTitle,
  metaDescription,
}: SeoPanelProps) {
  const score = seo?.score ?? 0;
  const { ring, label } = scoreColor(score);
  const circumference = 2 * Math.PI * 26;

  const previewUrl = `${SITE_URL}/tin-tuc/${slug || 'duong-dan-bai-viet'}`;

  return (
    <div className="space-y-4">
      {/* Điểm SEO */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span>📈</span> Điểm SEO
        </h3>

        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" strokeWidth="6" className="stroke-gray-200" />
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                className={`${ring} transition-all duration-500`}
                stroke="currentColor"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - score / 100)}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-800 tabular-nums">
              {score}
            </span>
          </div>
          <div>
            <p className="font-medium text-gray-800">{label}</p>
            <p className="text-sm text-gray-500">
              {loading ? 'Đang chấm lại…' : `${seo?.checks.filter((c) => c.status === 'good').length ?? 0}/${seo?.checks.length ?? 0} tiêu chí đạt`}
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-2.5">
          {(seo?.checks ?? []).map((c) => (
            <li key={c.key} className="flex gap-2.5 text-sm">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${STATUS_STYLE[c.status].dot}`} />
              <span className={STATUS_STYLE[c.status].text}>
                <span className="font-medium">{c.label}:</span> {c.message}
              </span>
            </li>
          ))}
          {!seo && !loading && (
            <li className="text-sm text-gray-500">Nhập tiêu đề và nội dung để chấm điểm.</li>
          )}
        </ul>
      </div>

      {/* Xem trước trên Google */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <span>🔍</span> Hiển thị trên Google
        </h3>
        <p className="text-xs text-gray-500 mb-4">Bài viết sẽ trông như thế này trong kết quả tìm kiếm.</p>

        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <p className="text-xs text-gray-600 truncate">{previewUrl}</p>
          <p className="text-[#1a0dab] text-lg leading-snug mt-1 hover:underline cursor-default line-clamp-2">
            {metaTitle || 'Tiêu đề bài viết sẽ hiện ở đây'}
          </p>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
            {metaDescription || 'Mô tả ngắn của bài viết sẽ hiện ở đây. Viết 120–160 ký tự để không bị Google cắt.'}
          </p>
        </div>
      </div>
    </div>
  );
}
