'use client';

import { useEffect, useRef, useState } from 'react';
import apiClient from '@/lib/api-client';

/**
 * Hiện một file .docx ngay trên trang (thư viện docx-preview, chạy trong
 * trình duyệt). Máy chủ PLE là Plesk nên không đổi được sang PDF; hiện thẳng
 * file Word là cách để khách đọc hợp đồng mà không phải tải về mở bằng Word.
 *
 * `duongDan` là đường API trả file (vd `/hop-dong-khach/<mã>/file`).
 * `phienBan` đổi thì tải lại (sau khi ký xong).
 */
export function XemDocx({ duongDan, phienBan = 0 }: { duongDan: string; phienBan?: number }) {
  const khung = useRef<HTMLDivElement>(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');

  useEffect(() => {
    let huy = false;
    (async () => {
      setDangTai(true);
      setLoi('');
      try {
        const { data } = await apiClient.get<ArrayBuffer>(duongDan, { responseType: 'arraybuffer' });
        const { renderAsync } = await import('docx-preview');
        if (huy || !khung.current) return;
        khung.current.innerHTML = '';
        await renderAsync(data, khung.current, undefined, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          breakPages: true,
        });
      } catch (e: any) {
        if (!huy) setLoi(e?.response?.status === 404 ? 'Không tìm thấy hợp đồng.' : 'Không hiện được hợp đồng. Thử tải file về.');
      } finally {
        if (!huy) setDangTai(false);
      }
    })();
    return () => {
      huy = true;
    };
  }, [duongDan, phienBan]);

  return (
    <div className="relative w-full overflow-x-auto rounded-xl border border-slate-200 bg-slate-100">
      {dangTai && <div className="p-8 text-center text-sm text-slate-500">Đang tải hợp đồng…</div>}
      {loi && <div className="p-8 text-center text-sm text-red-600">{loi}</div>}
      <div ref={khung} className="hop-dong-docx" />
    </div>
  );
}
