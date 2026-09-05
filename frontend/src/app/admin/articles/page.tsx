'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getArticles, deleteArticle } from '@/lib/api';

/**
 * Trang quản lý bài viết
 *
 * - Liệt kê cả bài đã đăng lẫn bản nháp
 * - Lọc theo chuyên mục / trạng thái, tìm theo tiêu đề
 * - Xóa mềm (bài vẫn còn trong CSDL để khôi phục được)
 */
export default function ArticlesPage() {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    q: '',
    articleType: '',
    published: -1,
  });

  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['articles', filters],
    queryFn: () =>
      getArticles({
        page: filters.page,
        limit: filters.limit,
        q: filters.q || undefined,
        articleType: filters.articleType || undefined,
        published: filters.published === -1 ? undefined : filters.published,
      }),
  });

  const removeMutation = useMutation({
    mutationFn: deleteArticle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      setConfirmingId(null);
    },
  });

  const handleFilterChange = (key: string, value: any) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));

  const totalPages = Math.ceil((data?.total || 0) / filters.limit);

  const formatDate = (v: string | null) =>
    v ? new Date(v).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">📰</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Quản lý bài viết</h1>
              <p className="text-sm text-gray-500">Soạn và đăng bài cho trang tin tức</p>
            </div>
          </div>
          <Link
            href="/admin/articles/new"
            className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            + Viết bài mới
          </Link>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Bộ lọc */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-gray-500">⚙️</span>
            <h2 className="font-semibold text-gray-800">Bộ lọc</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tìm kiếm</label>
              <input
                value={filters.q}
                onChange={(e) => handleFilterChange('q', e.target.value)}
                placeholder="Tiêu đề hoặc đường dẫn…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Chuyên mục</label>
              <select
                value={filters.articleType}
                onChange={(e) => handleFilterChange('articleType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">Tất cả</option>
                <option value="tin-tuc">Tin tức</option>
                <option value="huong-dan">Hướng dẫn</option>
                <option value="khuyen-mai">Khuyến mãi</option>
                <option value="bang-gia">Bảng giá</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Trạng thái</label>
              <select
                value={filters.published}
                onChange={(e) => handleFilterChange('published', Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value={-1}>Tất cả</option>
                <option value={1}>Đã đăng</option>
                <option value={0}>Bản nháp</option>
              </select>
            </div>
          </div>
        </div>

        {/* Danh sách */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-gray-500">Đang tải…</div>
          ) : error ? (
            <div className="p-10 text-center text-red-600">Không tải được danh sách bài viết.</div>
          ) : !data?.data.length ? (
            <div className="p-10 text-center text-gray-500">
              Chưa có bài viết nào.{' '}
              <Link href="/admin/articles/new" className="text-blue-600 hover:underline">
                Viết bài đầu tiên
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-gray-600">
                    <th className="px-5 py-3 font-medium">Bài viết</th>
                    <th className="px-5 py-3 font-medium whitespace-nowrap">Chuyên mục</th>
                    <th className="px-5 py-3 font-medium whitespace-nowrap">Trạng thái</th>
                    <th className="px-5 py-3 font-medium whitespace-nowrap">Ngày đăng</th>
                    <th className="px-5 py-3 font-medium whitespace-nowrap text-right">Lượt xem</th>
                    <th className="px-5 py-3 font-medium text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((a) => (
                    <tr key={a.Id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{a.Title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">/tin-tuc/{a.Slug}</p>
                        {a.Noindex && (
                          <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            Ẩn khỏi Google
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-gray-600">{a.ArticleType}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                            a.Published ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${a.Published ? 'bg-green-500' : 'bg-amber-500'}`} />
                          {a.Published ? 'Đã đăng' : 'Nháp'}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-gray-600 tabular-nums">
                        {formatDate(a.PublishedAt)}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-right text-gray-600 tabular-nums">
                        {a.ViewCount}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          {a.Published && (
                            <a
                              href={`/tin-tuc/${a.Slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                              Xem
                            </a>
                          )}
                          <Link
                            href={`/admin/articles/${a.Id}`}
                            className="px-2.5 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            Sửa
                          </Link>
                          {confirmingId === a.Id ? (
                            <>
                              <button
                                onClick={() => removeMutation.mutate(a.Id)}
                                disabled={removeMutation.isPending}
                                className="px-2.5 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                Xóa thật
                              </button>
                              <button
                                onClick={() => setConfirmingId(null)}
                                className="px-2.5 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                              >
                                Thôi
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmingId(a.Id)}
                              className="px-2.5 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                            >
                              Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Phân trang */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Trang {filters.page}/{totalPages} — {data?.total} bài
              </p>
              <div className="flex gap-2">
                <button
                  disabled={filters.page <= 1}
                  onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}
                  className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Trước
                </button>
                <button
                  disabled={filters.page >= totalPages}
                  onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
                  className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
