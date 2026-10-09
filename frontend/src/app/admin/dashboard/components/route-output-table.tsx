'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/app/components/admin';
import { getDashboardOutputByRoute } from '@/lib/api';
import { BarChartNgang } from '@/app/components/bieu-do/bar-chart-ngang';

interface RouteOutputTableProps {
  fromDate: string;
  toDate: string;
}

const fmtInt = (v: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtKg = (v: number) =>
  (v ?? 0).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const columns = [
  { key: 'tenTuyen', label: 'Tuyến' },
  { key: 'thang', label: 'Tháng', align: 'center' as const, width: '120px' },
  { key: 'soDon', label: 'Số đơn', align: 'right' as const, render: (v: number) => fmtInt(v) },
  { key: 'sanLuongKg', label: 'Sản lượng (kg)', align: 'right' as const, render: (v: number) => fmtKg(v) },
];

/**
 * "Tuyến Hàn tháng này tổng được bao nhiêu" — bày sẵn cả Hàn, Anh, Mỹ cạnh nhau.
 *
 * Bảng sản lượng nhân viên ở dưới cũng lọc được theo tuyến, nhưng muốn so ba
 * tuyến thì phải đổi ô lọc ba lần rồi tự cộng. Bảng này cố tình KHÔNG có ô lọc
 * tuyến: lọc đi thì còn mỗi một dòng, mất luôn chỗ để so.
 */
export function RouteOutputTable({ fromDate, toDate }: RouteOutputTableProps) {
  const routes = useQuery({
    queryKey: ['dashboard-output-route', fromDate, toDate],
    queryFn: () => getDashboardOutputByRoute(fromDate, toDate),
  });
  const data = routes.data || [];

  const [chiSo, setChiSo] = useState<'kg' | 'don'>('kg');

  /**
   * Biểu đồ gom theo TUYẾN, bỏ chiều tháng.
   *
   * Bảng để tra số chính xác, biểu đồ để thấy ngay tuyến nào áp đảo. Khoảng
   * ngày trải hai tháng thì một tuyến có hai dòng trong bảng — cộng lại thành
   * một thanh, nếu không thì cùng một tuyến hiện hai thanh, nhìn như hai tuyến.
   */
  const duLieuBieuDo = Object.values(
    data.reduce<Record<string, { nhan: string; kg: number; don: number }>>((m, r) => {
      const k = r.tenTuyen;
      m[k] = m[k] || { nhan: k, kg: 0, don: 0 };
      m[k].kg += r.sanLuongKg || 0;
      m[k].don += r.soDon || 0;
      return m;
    }, {}),
  )
    .map((x) => ({ nhan: x.nhan, giaTri: chiSo === 'kg' ? x.kg : x.don }))
    .filter((x) => x.giaTri > 0)
    .sort((a, b) => b.giaTri - a.giaTri);

  const tong = data.reduce(
    (s, r) => ({ soDon: s.soDon + (r.soDon || 0), kg: s.kg + (r.sanLuongKg || 0) }),
    { soDon: 0, kg: 0 },
  );

  return (
    <div className="bg-white rounded-lg border border-[#14264b]/20 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-[#14264b]">Sản lượng theo tuyến</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Kỳ {fromDate} &ndash; {toDate}</span>
          <div className="flex rounded-md border border-[#14264b]/20 overflow-hidden text-xs">
            {([['kg', 'Sản lượng'], ['don', 'Số đơn']] as const).map(([ma, nhan]) => (
              <button
                key={ma}
                type="button"
                onClick={() => setChiSo(ma)}
                className={`px-2.5 py-1 ${chiSo === ma ? 'bg-[#14264b] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {nhan}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Biểu đồ trước, bảng sau: nhìn phát thấy tuyến nào to, cần số lẻ thì đọc bảng. */}
      <div className="mb-4">
        <BarChartNgang
          data={duLieuBieuDo}
          loading={routes.isLoading}
          hienTyTrong
          valueFormatter={chiSo === 'kg' ? (v) => `${fmtKg(v)} kg` : (v) => `${fmtInt(v)} đơn`}
        />
      </div>
      <DataTable
        columns={columns}
        data={data.map((r, i) => ({ ...r, id: `${r.quocGiaId ?? 'trong'}-${r.thang}-${i}` }))}
        rowKey="id"
        loading={routes.isLoading}
        emptyMessage="Không có dữ liệu trong khoảng đã chọn"
        footer={['Tổng tất cả tuyến', `${data.length} dòng`, fmtInt(tong.soDon), fmtKg(tong.kg)]}
      />
    </div>
  );
}
