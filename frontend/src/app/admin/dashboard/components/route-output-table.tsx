'use client';

import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/app/components/admin';
import { getDashboardOutputByRoute } from '@/lib/api';

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

  const tong = data.reduce(
    (s, r) => ({ soDon: s.soDon + (r.soDon || 0), kg: s.kg + (r.sanLuongKg || 0) }),
    { soDon: 0, kg: 0 },
  );

  return (
    <div className="bg-white rounded-lg border border-[#14264b]/20 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-[#14264b]">Sản lượng theo tuyến</h3>
        <span className="text-xs text-gray-500">Kỳ {fromDate} &ndash; {toDate}</span>
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
