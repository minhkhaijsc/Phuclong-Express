'use client';

import React from 'react';

interface Column {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: any) => React.ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  rowKey?: string;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: any) => void;
  /**
   * Hàng tổng ở đáy bảng — mỗi phần tử ứng với MỘT cột, đúng thứ tự `columns`.
   *
   * Để trong `<tfoot>` chứ không phải một ô chữ đặt dưới bảng, để con số tổng
   * nằm thẳng cột với con số nó cộng ra — nhìn phát biết là tổng của cột nào.
   *
   * Bảng rỗng thì không hiện: "Tổng: 0" dễ bị đọc nhầm thành "kỳ này không có
   * sản lượng" trong khi thật ra là chưa lọc ra dòng nào.
   */
  footer?: React.ReactNode[];
}

export function DataTable({
  columns,
  data,
  rowKey = 'id',
  loading = false,
  emptyMessage = 'Không có dữ liệu',
  onRowClick,
  footer,
}: DataTableProps) {
  if (loading) {
    return (
      <div className="border border-[#14264b]/20 rounded-lg overflow-hidden">
        <div className="bg-[#14264b]/5 h-14 animate-pulse border-b border-[#14264b]/20" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b border-[#14264b]/20 h-16 bg-gray-50 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="border border-[#14264b]/20 rounded-lg overflow-x-auto bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#14264b]/20 bg-[#14264b]/5">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 font-semibold text-[#14264b] text-${col.align || 'left'}`}
                style={{ width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data && data.length > 0 ? (
            data.map((row, idx) => (
              <tr
                key={row[rowKey] || idx}
                className="border-b border-[#14264b]/10 hover:bg-[#14264b]/5 transition-colors cursor-pointer"
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={`${row[rowKey]}-${col.key}`}
                    className={`px-4 py-3 text-gray-700 text-${col.align || 'left'}`}
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
        {footer && data && data.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-[#14264b]/30 bg-[#14264b]/5 font-semibold text-[#14264b]">
              {columns.map((col, i) => (
                <td key={col.key} className={`px-4 py-3 text-${col.align || 'left'}`}>
                  {footer[i]}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
