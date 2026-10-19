'use client';

import { useEffect, useRef, useState } from 'react';
import { FiInfo } from 'react-icons/fi';

/**
 * Dấu ⓘ giải thích một chỉ số: ý nghĩa, công thức, điều kiện ghi nhận.
 *
 * Yêu cầu bên khách 19/10/2026: "Mỗi chỉ số trên Dashboard nên có biểu tượng
 * thông tin (ⓘ). Khi người dùng di chuột hoặc nhấn vào biểu tượng sẽ hiển thị
 * phần giải thích ngắn gọn".
 *
 * MỞ BẰNG CẢ HAI CÁCH, cố ý: di chuột cho máy tính, bấm cho máy bảng — kế toán
 * và CSKH xem dashboard trên iPad thì không có chuột để mà rê. Bấm rồi thì giữ
 * nguyên bảng cho tới khi bấm ra ngoài, để còn đọc hết mấy dòng điều kiện.
 *
 * Không thêm thư viện tooltip nào: cả dự án chưa có cái nào, mà thứ cần ở đây
 * chỉ là một khung chữ.
 */
export interface MucGiaiThich {
  /** Chỉ số này nói lên điều gì, một câu. */
  yNghia: string;
  /** Máy cộng/đếm cái gì — nói bằng tiếng người, không phải SQL. */
  congThuc: string;
  /** Tính cái gì, KHÔNG tính cái gì. Mỗi ý một dòng. */
  dieuKien: string[];
  /** Chỗ dễ hiểu nhầm hoặc dữ liệu còn thiếu. Bỏ trống nếu không có. */
  luuY?: string;
}

export function GiaiThichChiSo({ noiDung, nhan }: { noiDung: MucGiaiThich; nhan: string }) {
  const [moBangBam, setMoBangBam] = useState(false);
  const [moBangChuot, setMoBangChuot] = useState(false);
  const boc = useRef<HTMLSpanElement>(null);
  const bang = useRef<HTMLSpanElement>(null);
  const mo = moBangBam || moBangChuot;
  /** Thả xuôi sang phải thì tràn màn -> lật sang trái. */
  const [latTrai, setLatTrai] = useState(false);

  /**
   * Ô ngoài cùng bên phải: bảng thả xuôi sang phải thì chạy ra ngoài màn hình,
   * đọc được đúng một nửa. Đo sau khi mở rồi lật hướng.
   *
   * Phải ĐO chứ không đoán theo thứ tự thẻ: lưới đổi từ 4 cột sang 2 cột rồi 1
   * cột tuỳ bề ngang màn, nên thẻ nào nằm sát mép phải là thay đổi theo.
   */
  useEffect(() => {
    if (!mo) {
      setLatTrai(false);
      return;
    }
    const el = bang.current;
    if (!el) return;
    const o = el.getBoundingClientRect();
    if (o.right > window.innerWidth - 8) setLatTrai(true);
  }, [mo]);

  // Bấm ra ngoài hoặc Esc thì đóng — bảng này che mất số bên cạnh.
  useEffect(() => {
    if (!moBangBam) return;
    const ngoai = (e: MouseEvent) => {
      if (boc.current && !boc.current.contains(e.target as Node)) setMoBangBam(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMoBangBam(false);
    document.addEventListener('mousedown', ngoai);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', ngoai);
      document.removeEventListener('keydown', esc);
    };
  }, [moBangBam]);

  return (
    <span ref={boc} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Giải thích chỉ số ${nhan}`}
        aria-expanded={mo}
        onClick={() => setMoBangBam((v) => !v)}
        onMouseEnter={() => setMoBangChuot(true)}
        onMouseLeave={() => setMoBangChuot(false)}
        onFocus={() => setMoBangChuot(true)}
        onBlur={() => setMoBangChuot(false)}
        className="text-gray-400 hover:text-[#14264b] focus:text-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/30 rounded-full"
      >
        <FiInfo size={15} />
      </button>

      {mo && (
        <span
          ref={bang}
          role="tooltip"
          /* `max-w` theo bề ngang màn hình để trên điện thoại không bị đẩy ngang.
             Hướng mở do `latTrai` quyết, xem ghi chú ở useEffect bên trên. */
          className={
            'absolute top-6 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg ' +
            (latTrai ? 'right-0' : 'left-0')
          }
        >
          <span className="block text-xs font-semibold text-[#14264b]">{nhan}</span>
          <span className="mt-1 block text-xs leading-relaxed text-gray-700">{noiDung.yNghia}</span>

          <span className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Cách tính
          </span>
          <span className="block text-xs leading-relaxed text-gray-700">{noiDung.congThuc}</span>

          <span className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Điều kiện ghi nhận
          </span>
          <span className="block">
            {noiDung.dieuKien.map((d) => (
              <span key={d} className="mt-0.5 flex gap-1.5 text-xs leading-relaxed text-gray-700">
                <span className="text-gray-400">•</span>
                <span>{d}</span>
              </span>
            ))}
          </span>

          {noiDung.luuY && (
            <span className="mt-2 block rounded border border-amber-200 bg-amber-50 p-2 text-xs leading-relaxed text-amber-900">
              {noiDung.luuY}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
