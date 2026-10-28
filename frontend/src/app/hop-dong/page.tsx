'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth-context';

interface Dong {
  maLink: string;
  soHopDong: string | null;
  tenMau: string;
  trangThai: 'cho-ky' | 'da-ky';
  ngayTao: string;
  ngayKy: string | null;
}

/** "Hợp đồng của tôi" — khách đăng nhập xem lại các hợp đồng của mình. */
export default function HopDongCuaToiPage() {
  const { user } = useAuth();
  const [ds, setDs] = useState<Dong[] | null>(null);
  const [loi, setLoi] = useState('');

  useEffect(() => {
    if (!user?.username) return;
    apiClient
      .get<Dong[]>('/hop-dong-khach/cua-toi')
      .then((r) => setDs(r.data))
      .catch((e) => setLoi(e?.response?.data?.message || 'Không tải được danh sách hợp đồng.'));
  }, [user?.username]);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-28">
      <h1 className="mb-4 text-xl font-bold text-slate-800">Hợp đồng của tôi</h1>
      {!user?.username && <p className="text-slate-500">Đăng nhập để xem hợp đồng của bạn.</p>}
      {loi && <p className="text-red-600">{loi}</p>}
      {ds && ds.length === 0 && <p className="text-slate-500">Chưa có hợp đồng nào.</p>}
      {ds && ds.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm">
          {ds.map((h) => (
            <Link
              key={h.maLink}
              href={`/hop-dong/${h.maLink}`}
              className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"
            >
              <div>
                <p className="font-medium text-slate-800">Hợp đồng số {h.soHopDong}</p>
                <p className="text-sm text-slate-500">{h.tenMau}</p>
              </div>
              {h.trangThai === 'da-ky' ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
                  Đã ký {h.ngayKy ? new Date(h.ngayKy).toLocaleDateString('vi-VN') : ''}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-700">Chờ ký</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
