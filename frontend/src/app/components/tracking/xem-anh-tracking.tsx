'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiCamera, FiChevronLeft, FiChevronRight, FiExternalLink, FiX } from 'react-icons/fi';
import { layAnhTracking, loiDeDoc } from '@/lib/anh-tracking';

export interface AnhXem {
  src: string;
  ten?: string | null;
}

/**
 * Xem ảnh cỡ lớn, lật qua lại. Esc đóng, ← → chuyển ảnh, bấm ra ngoài để đóng.
 * Gắn thẳng vào <body> để không bị khung cuộn / backdrop-blur của trang cắt mất.
 */
export function KhungXemAnh({ anh, viTri = 0, onDong }: { anh: AnhXem[]; viTri?: number; onDong: () => void }) {
  const [i, setI] = useState(viTri);
  const n = anh.length;
  const lui = useCallback(() => setI((x) => (x - 1 + n) % n), [n]);
  const toi = useCallback(() => setI((x) => (x + 1) % n), [n]);

  useEffect(() => {
    const phim = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDong();
      else if (e.key === 'ArrowLeft') lui();
      else if (e.key === 'ArrowRight') toi();
    };
    window.addEventListener('keydown', phim);
    const cuonCu = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', phim);
      document.body.style.overflow = cuonCu;
    };
  }, [lui, toi, onDong]);

  if (!n || typeof document === 'undefined') return null;
  const hien = anh[Math.min(i, n - 1)];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh hàng"
      className="fixed inset-0 z-[1000] flex flex-col bg-black/90"
      onClick={onDong}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
        <span className="truncate font-mono">
          {n > 1 && <span className="mr-2 text-white">{i + 1}/{n}</span>}
          {hien.ten}
        </span>
        <div className="flex items-center gap-1">
          <a
            href={hien.src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 hover:bg-white/10"
          >
            <FiExternalLink className="h-4 w-4" /> <span className="hidden sm:inline">Mở tab mới</span>
          </a>
          <button type="button" onClick={onDong} aria-label="Đóng" className="rounded-lg p-2 hover:bg-white/10 cursor-pointer">
            <FiX className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-14">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={hien.src}
          src={hien.src}
          alt={hien.ten ?? 'Ảnh hàng'}
          className="max-h-full max-w-full rounded object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
        {n > 1 && (
          <>
            <button
              type="button"
              aria-label="Ảnh trước"
              onClick={(e) => { e.stopPropagation(); lui(); }}
              className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/25 cursor-pointer sm:left-3"
            >
              <FiChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label="Ảnh sau"
              onClick={(e) => { e.stopPropagation(); toi(); }}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/25 cursor-pointer sm:right-3"
            >
              <FiChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Nút "📷 3" cạnh số tracking trong danh sách. Bấm mới tải ảnh — danh sách
 * 200 dòng không kéo về 200 bộ ảnh.
 */
export function NutAnhTracking({ trackingId, soAnh, className = '' }: { trackingId: number; soAnh?: number | null; className?: string }) {
  const [anh, setAnh] = useState<AnhXem[] | null>(null);
  const [dangTai, setDangTai] = useState(false);

  if (!soAnh) return null;

  const mo = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dangTai) return;
    setDangTai(true);
    try {
      const ds = await layAnhTracking(trackingId);
      if (!ds.length) {
        alert('Tracking này không còn ảnh nào.');
        return;
      }
      setAnh(ds.map((a) => ({ src: a.LinkHinh, ten: a.TenFileGoc })));
    } catch (err) {
      alert(`Không tải được ảnh: ${loiDeDoc(err)}`);
    } finally {
      setDangTai(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={mo}
        title={`Xem ${soAnh} ảnh hàng`}
        className={`inline-flex items-center gap-1 rounded-md border border-[#eb7325]/30 bg-[#eb7325]/10 px-1.5 py-0.5 text-xs font-semibold text-[#c25a14] hover:bg-[#eb7325]/20 cursor-pointer align-middle ${dangTai ? 'animate-pulse' : ''} ${className}`}
      >
        <FiCamera className="h-3.5 w-3.5" />
        {soAnh}
      </button>
      {anh && <KhungXemAnh anh={anh} onDong={() => setAnh(null)} />}
    </>
  );
}
