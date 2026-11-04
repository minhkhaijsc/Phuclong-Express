'use client';

import { useEffect, useRef, useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { CSKH_CHUA_GAN } from '@/lib/api';

/**
 * Ô lọc CHỌN NHIỀU CSKH — yêu cầu bên khách 04/11/2026 ("lọc được nhiều CSKH
 * cùng 1 lúc"). Không chọn gì = tất cả.
 */
export function ChonNhieuCskh({
  ds,
  chon,
  onChange,
}: {
  ds: { username: string; hoTen: string }[];
  chon: string[];
  onChange: (v: string[]) => void;
}) {
  const [mo, setMo] = useState(false);
  const [tim, setTim] = useState('');
  const hop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => {
      if (hop.current && !hop.current.contains(e.target as Node)) setMo(false);
    };
    document.addEventListener('mousedown', dong);
    return () => document.removeEventListener('mousedown', dong);
  }, [mo]);

  const nhan = (u: string) => {
    if (u === CSKH_CHUA_GAN) return 'Chưa gán CSKH';
    const c = ds.find((x) => x.username === u);
    return c && c.hoTen && c.hoTen !== c.username ? c.hoTen : u;
  };

  const tat = (u: string) =>
    onChange(chon.includes(u) ? chon.filter((x) => x !== u) : [...chon, u]);

  const tuKhoa = tim.trim().toLowerCase();
  const loc = ds.filter(
    (c) => !tuKhoa || c.username.toLowerCase().includes(tuKhoa) || c.hoTen.toLowerCase().includes(tuKhoa),
  );

  const chu =
    chon.length === 0
      ? '— Tất cả CSKH —'
      : chon.length === 1
        ? nhan(chon[0])
        : `${chon.length} CSKH đã chọn`;

  return (
    <div ref={hop} className="relative">
      <button
        type="button"
        onClick={() => setMo((v) => !v)}
        className="flex w-56 items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm focus:border-[#14264b] focus:outline-none"
      >
        <span className={`truncate ${chon.length ? 'text-gray-900' : 'text-gray-500'}`}>{chu}</span>
        <FiChevronDown size={14} className="shrink-0 text-gray-400" />
      </button>
      {mo && (
        <div className="absolute z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              autoFocus
              value={tim}
              onChange={(e) => setTim(e.target.value)}
              placeholder="Tìm CSKH…"
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-[#14264b] focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm italic text-gray-600 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={chon.includes(CSKH_CHUA_GAN)}
                onChange={() => tat(CSKH_CHUA_GAN)}
              />
              Chưa gán CSKH
            </label>
            {loc.map((c) => (
              <label
                key={c.username}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                <input type="checkbox" checked={chon.includes(c.username)} onChange={() => tat(c.username)} />
                <span className="truncate">
                  {c.hoTen && c.hoTen !== c.username ? c.hoTen : c.username}
                  {c.hoTen && c.hoTen !== c.username && (
                    <span className="ml-1 text-xs text-gray-400">{c.username}</span>
                  )}
                </span>
              </label>
            ))}
            {!loc.length && <div className="px-3 py-2 text-sm text-gray-400">Không có CSKH khớp.</div>}
          </div>
          <div className="flex justify-between border-t border-gray-100 px-3 py-2 text-xs">
            <button type="button" onClick={() => onChange([])} className="text-gray-500 hover:text-gray-800">
              Bỏ chọn hết
            </button>
            <button type="button" onClick={() => setMo(false)} className="font-semibold text-[#14264b]">
              Xong
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
