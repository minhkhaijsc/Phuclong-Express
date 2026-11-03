'use client';

import { useEffect, useRef } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';

interface DateRangeFilterProps {
  fromDate: string;
  toDate: string;
  onChange: (next: { fromDate: string; toDate: string }) => void;
  onSearch: () => void;
}

const toDdMmYyyy = (d: Date): string =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/**
 * Bộ lọc khoảng ngày (dd/MM/yyyy) — flatpickr, khớp các trang báo cáo hiện có.
 */
export function DateRangeFilter({ fromDate, toDate, onChange, onSearch }: DateRangeFilterProps) {
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  /*
   * Giá trị MỚI NHẤT của hai ô. flatpickr chỉ dựng một lần, nên hàm onChange
   * của nó giữ mãi giá trị lúc dựng: chọn "Từ" 01/10 rồi chọn "Đến" 31/10 thì
   * ô "Từ" bị trả về 01/11 (đầu tháng hiện tại) → khoảng 01/11–31/10 rỗng, mọi
   * chỉ số ra 0 (báo 03/11/2026: "tháng 10 không check được các chỉ số").
   */
  const moiNhat = useRef({ fromDate, toDate, onChange });
  moiNhat.current = { fromDate, toDate, onChange };

  useEffect(() => {
    const fpFrom = flatpickr(fromRef.current!, {
      dateFormat: 'd/m/Y',
      defaultDate: fromDate,
      onChange: (dates) => {
        const m = moiNhat.current;
        if (dates[0]) m.onChange({ fromDate: toDdMmYyyy(dates[0]), toDate: m.toDate });
      },
    });
    const fpTo = flatpickr(toRef.current!, {
      dateFormat: 'd/m/Y',
      defaultDate: toDate,
      onChange: (dates) => {
        const m = moiNhat.current;
        if (dates[0]) m.onChange({ fromDate: m.fromDate, toDate: toDdMmYyyy(dates[0]) });
      },
    });
    return () => {
      fpFrom.destroy();
      fpTo.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-white rounded-lg border border-[#14264b]/20 p-4 shadow-sm flex flex-wrap items-end gap-4">
      <div className="flex flex-col">
        <label className="text-xs text-gray-600 font-medium mb-1">Từ ngày</label>
        <input
          ref={fromRef}
          defaultValue={fromDate}
          className="border border-[#14264b]/20 rounded px-3 py-2 text-sm w-36"
          placeholder="dd/mm/yyyy"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-gray-600 font-medium mb-1">Đến ngày</label>
        <input
          ref={toRef}
          defaultValue={toDate}
          className="border border-[#14264b]/20 rounded px-3 py-2 text-sm w-36"
          placeholder="dd/mm/yyyy"
        />
      </div>
      <button
        onClick={onSearch}
        className="bg-[#14264b] text-white text-sm font-medium px-5 py-2 rounded hover:bg-[#14264b]/90 transition-colors"
      >
        Xem thống kê
      </button>
    </div>
  );
}
