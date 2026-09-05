'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getArticle } from '@/lib/api';
import ArticleEditor from '../_components/ArticleEditor';

export default function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, isLoading, error } = useQuery({
    queryKey: ['article', id],
    queryFn: () => getArticle(Number(id)),
  });

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 p-10 text-center text-gray-500">Đang tải bài viết…</div>;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-10 text-center space-y-3">
        <p className="text-red-600">Không tìm thấy bài viết này.</p>
        <Link href="/admin/articles" className="text-blue-600 hover:underline">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  return <ArticleEditor article={data} />;
}
