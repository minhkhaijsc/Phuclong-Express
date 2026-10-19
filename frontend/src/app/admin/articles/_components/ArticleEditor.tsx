'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createArticle,
  updateArticle,
  previewArticleSeo,
  uploadArticleImage,
  type ArticleDetail,
  type ArticlePayload,
  type SeoResult,
} from '@/lib/api';
import RichTextEditor from './RichTextEditor';
import SeoPanel from './SeoPanel';

/** Bỏ dấu tiếng Việt để gợi ý đường dẫn ngay khi gõ tiêu đề. Backend vẫn là nơi chốt slug cuối cùng. */
function slugify(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200)
    .replace(/^-+|-+$/g, '');
}

const ARTICLE_TYPES = [
  { value: 'tin-tuc', label: 'Tin tức' },
  { value: 'huong-dan', label: 'Hướng dẫn' },
  { value: 'khuyen-mai', label: 'Khuyến mãi' },
  { value: 'bang-gia', label: 'Bảng giá' },
];

interface ArticleEditorProps {
  /** Có giá trị = đang sửa bài; bỏ trống = viết bài mới */
  article?: ArticleDetail;
}

type FormState = ArticlePayload;

function initialState(a?: ArticleDetail): FormState {
  return {
    title: a?.Title ?? '',
    content: a?.Content ?? '',
    slug: a?.Slug ?? '',
    excerpt: a?.Excerpt ?? '',
    thumbnail: a?.Thumbnail ?? '',
    author: a?.Author ?? '',
    articleType: a?.ArticleType ?? 'tin-tuc',
    published: a?.Published ?? false,
    // '2026-10-19T09:45:56.537Z' -> '2026-10-19', đúng dạng ô <input type="date">.
    publishedAt: a?.PublishedAt ? a.PublishedAt.slice(0, 10) : '',
    metaTitle: a?.MetaTitle ?? '',
    metaDescription: a?.MetaDescription ?? '',
    focusKeyword: a?.FocusKeyword ?? '',
    canonicalUrl: a?.CanonicalUrl ?? '',
    ogTitle: a?.OgTitle ?? '',
    ogDescription: a?.OgDescription ?? '',
    ogImage: a?.OgImage ?? '',
    noindex: a?.Noindex ?? false,
  };
}

export default function ArticleEditor({ article }: ArticleEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialState(article));
  const [showSeo, setShowSeo] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Khi người viết tự sửa đường dẫn thì thôi không tự sinh theo tiêu đề nữa.
  const slugTouched = useRef(Boolean(article?.Slug));

  const [seo, setSeo] = useState<SeoResult | null>(article?.seo ?? null);
  const [seoLoading, setSeoLoading] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleTitle = (title: string) => {
    setForm((prev) => ({
      ...prev,
      title,
      slug: slugTouched.current ? prev.slug : slugify(title),
    }));
  };

  // Chấm lại điểm SEO sau khi ngừng gõ 700ms, tránh gọi API mỗi phím.
  useEffect(() => {
    if (!form.title && !form.content) {
      setSeo(null);
      return;
    }
    setSeoLoading(true);
    const timer = setTimeout(() => {
      previewArticleSeo(form)
        .then((r) => setSeo(r.seo))
        .catch(() => undefined)
        .finally(() => setSeoLoading(false));
    }, 700);
    return () => clearTimeout(timer);
  }, [form]);

  const queryClient = useQueryClient();

  const [dangTaiAnh, setDangTaiAnh] = useState(false);

  /** Tải một ảnh lên; trả về đường dẫn, hoặc chuỗi rỗng nếu hỏng (người gọi bỏ qua). */
  const taiAnh = async (file: File): Promise<string> => {
    setDangTaiAnh(true);
    setError(null);
    try {
      return await uploadArticleImage(file);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Không tải được ảnh lên.');
      return '';
    } finally {
      setDangTaiAnh(false);
    }
  };

  const save = useMutation({
    mutationFn: async (published: boolean) => {
      const payload = { ...form, published };
      return article
        ? updateArticle(article.Id, payload)
        : createArticle(payload as ArticlePayload);
    },
    onSuccess: async () => {
      // Bỏ bản trong bộ nhớ đệm TRƯỚC khi rời trang. Thiếu bước này thì lần sau
      // mở lại bài, react-query trả bản cũ còn trong đệm — người soạn tưởng bấm
      // lưu không ăn, trong khi cơ sở dữ liệu đã ghi đúng.
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
      if (article) {
        await queryClient.invalidateQueries({ queryKey: ['article', String(article.Id)] });
      }
      router.push('/admin/articles');
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message || e?.message || 'Không lưu được bài viết.'),
  });

  const submit = (published: boolean) => {
    setError(null);
    if (!form.title.trim()) return setError('Bài viết cần có tiêu đề.');
    if (!form.content.trim()) return setError('Bài viết chưa có nội dung.');
    save.mutate(published);
  };

  const metaTitlePreview = form.metaTitle?.trim() || form.title;
  const metaDescPreview = form.metaDescription?.trim() || form.excerpt || '';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">📝</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {article ? 'Sửa bài viết' : 'Viết bài mới'}
              </h1>
              <p className="text-sm text-gray-500">
                {article?.Published ? 'Bài đang hiển thị trên web' : 'Bản nháp — chưa hiển thị trên web'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/admin/articles')}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Quay lại
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => submit(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Lưu nháp
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => submit(true)}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {save.isPending ? 'Đang lưu…' : article?.Published ? 'Cập nhật' : 'Đăng bài'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Cột soạn bài */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Tiêu đề bài viết <span className="text-red-500">*</span>
              </label>
              <input
                value={form.title}
                onChange={(e) => handleTitle(e.target.value)}
                placeholder="VD: Bảng giá vận chuyển hàng đi Mỹ mới nhất 2026"
                className="w-full px-3 py-2.5 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Đường dẫn</label>
              <div className="flex items-center rounded-lg border border-gray-300 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
                <span className="px-3 py-2.5 bg-gray-50 text-gray-500 text-sm border-r border-gray-300 whitespace-nowrap">
                  /tin-tuc/
                </span>
                <input
                  value={form.slug}
                  onChange={(e) => {
                    slugTouched.current = true;
                    set('slug', e.target.value);
                  }}
                  onBlur={(e) => set('slug', slugify(e.target.value))}
                  placeholder="tu-sinh-tu-tieu-de"
                  className="flex-1 px-3 py-2.5 outline-none text-sm"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Đường dẫn nên ngắn, có từ khóa chính, và không nên đổi sau khi bài đã lên Google.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nội dung <span className="text-red-500">*</span></label>
              <RichTextEditor
                initialHtml={article?.Content ?? ''}
                onChange={(html) => set('content', html)}
                onUploadImage={taiAnh}
              />
            </div>
          </div>

          {/* Khối SEO */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <button
              type="button"
              onClick={() => setShowSeo((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4"
            >
              <span className="font-semibold text-gray-800 flex items-center gap-2">
                <span>🎯</span> Tối ưu SEO
              </span>
              <span className="text-gray-400">{showSeo ? '▲' : '▼'}</span>
            </button>

            {showSeo && (
              <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Từ khóa chính</label>
                  <input
                    value={form.focusKeyword}
                    onChange={(e) => set('focusKeyword', e.target.value)}
                    placeholder="VD: vận chuyển hàng đi Mỹ"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Cụm từ bạn muốn khách gõ lên Google để tìm ra bài này.
                  </p>
                </div>

                <div>
                  <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1.5">
                    <span>Tiêu đề SEO</span>
                    <span className={`text-xs tabular-nums ${(metaTitlePreview?.length ?? 0) > 60 ? 'text-red-500' : 'text-gray-400'}`}>
                      {metaTitlePreview?.length ?? 0}/60
                    </span>
                  </label>
                  <input
                    value={form.metaTitle}
                    onChange={(e) => set('metaTitle', e.target.value)}
                    placeholder="Để trống sẽ dùng tiêu đề bài viết"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1.5">
                    <span>Mô tả SEO</span>
                    <span className={`text-xs tabular-nums ${(metaDescPreview?.length ?? 0) > 160 ? 'text-red-500' : 'text-gray-400'}`}>
                      {metaDescPreview?.length ?? 0}/160
                    </span>
                  </label>
                  <textarea
                    value={form.metaDescription}
                    onChange={(e) => set('metaDescription', e.target.value)}
                    rows={3}
                    placeholder="Đoạn mô tả hiện dưới tiêu đề trên Google. Nên 120–160 ký tự và có chứa từ khóa chính."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Tiêu đề khi chia sẻ</label>
                    <input
                      value={form.ogTitle}
                      onChange={(e) => set('ogTitle', e.target.value)}
                      placeholder="Để trống sẽ dùng tiêu đề SEO"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Ảnh khi chia sẻ</label>
                    <input
                      value={form.ogImage}
                      onChange={(e) => set('ogImage', e.target.value)}
                      placeholder="Để trống sẽ dùng ảnh đại diện"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Mô tả khi chia sẻ</label>
                  <textarea
                    value={form.ogDescription}
                    onChange={(e) => set('ogDescription', e.target.value)}
                    rows={2}
                    placeholder="Để trống sẽ dùng mô tả SEO"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Đường dẫn gốc (canonical)</label>
                  <input
                    value={form.canonicalUrl}
                    onChange={(e) => set('canonicalUrl', e.target.value)}
                    placeholder="Chỉ điền khi bài này đăng lại từ nơi khác"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.noindex}
                    onChange={(e) => set('noindex', e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-sm text-gray-700">
                    Ẩn bài khỏi Google
                    <span className="block text-xs text-gray-500">
                      Bài vẫn hiển thị trên web nhưng không xuất hiện trong kết quả tìm kiếm.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Cột phải */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <span>⚙️</span> Thông tin bài
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Chuyên mục</label>
              <select
                value={form.articleType}
                onChange={(e) => set('articleType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {ARTICLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Ngày đăng</label>
              <input
                type="date"
                value={form.publishedAt ?? ''}
                onChange={(e) => set('publishedAt', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                Để trống thì lấy ngày bấm Đăng bài. Đây là ngày hiện trên bài chứ không phải
                hẹn giờ — bài lên web ngay khi bấm Đăng.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Ảnh đại diện</label>

              <label
                className={`flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed cursor-pointer text-sm transition ${
                  dangTaiAnh
                    ? 'border-gray-300 text-gray-400 cursor-wait'
                    : 'border-blue-400 text-blue-700 hover:bg-blue-50'
                }`}
              >
                {dangTaiAnh ? 'Đang tải ảnh lên…' : '⬆ Chọn ảnh từ máy'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={dangTaiAnh}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    // Xoá giá trị để chọn lại đúng file vừa rồi vẫn kích hoạt onChange.
                    e.target.value = '';
                    if (!file) return;
                    const url = await taiAnh(file);
                    // Hỏng thì giữ nguyên ảnh cũ, đừng xoá trắng ô của người ta.
                    if (url) set('thumbnail', url);
                  }}
                />
              </label>

              <input
                value={form.thumbnail}
                onChange={(e) => set('thumbnail', e.target.value)}
                placeholder="hoặc dán sẵn đường dẫn ảnh"
                className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              {form.thumbnail ? (
                <div className="relative mt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.thumbnail}
                    alt="Xem trước ảnh đại diện"
                    className="w-full h-32 object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => set('thumbnail', '')}
                    className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded bg-black/60 text-white text-xs hover:bg-black/80"
                  >
                    Bỏ ảnh
                  </button>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tóm tắt</label>
              <textarea
                value={form.excerpt}
                onChange={(e) => set('excerpt', e.target.value)}
                rows={3}
                placeholder="Để trống sẽ tự lấy đoạn đầu bài viết"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tác giả</label>
              <input
                value={form.author}
                onChange={(e) => set('author', e.target.value)}
                placeholder="Để trống sẽ lấy tên tài khoản đang đăng nhập"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <SeoPanel
            seo={seo}
            loading={seoLoading}
            slug={form.slug ?? ''}
            metaTitle={metaTitlePreview ?? ''}
            metaDescription={metaDescPreview ?? ''}
          />
        </div>
      </div>
    </div>
  );
}
