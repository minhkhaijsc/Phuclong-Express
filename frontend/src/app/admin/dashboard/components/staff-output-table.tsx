'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/app/components/admin';
import { DashboardStaffOutput, getDashboardOutputByStaff, getDashboardOutputDetail, getQuocGia } from '@/lib/api';
import { downloadDataAsExcel } from '@/lib/excel-download';
import { BarChartNgang } from './bar-chart-ngang';

interface StaffOutputTableProps {
  fromDate: string;
  toDate: string;
}

const fmtInt = (v: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtKg = (v: number) =>
  (v ?? 0).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const summaryColumns = [
  { key: 'nhanVien', label: 'Nhân viên' },
  { key: 'thang', label: 'Tháng', align: 'center' as const, width: '120px' },
  { key: 'soDon', label: 'Số đơn', align: 'right' as const, render: (v: number) => fmtInt(v) },
  { key: 'sanLuongKg', label: 'Sản lượng (kg)', align: 'right' as const, render: (v: number) => fmtKg(v) },
];

const detailColumns = [
  { key: 'ngayGhiNo', label: 'Ngày ghi nợ', width: '120px' },
  { key: 'khachHang', label: 'Khách hàng' },
  { key: 'noiDung', label: 'Nội dung' },
  { key: 'sanLuongKg', label: 'Sản lượng (kg)', align: 'right' as const, render: (v: number) => fmtKg(v) },
  { key: 'ghiChu', label: 'Ghi chú' },
];

export function StaffOutputTable({ fromDate, toDate }: StaffOutputTableProps) {
  const [selected, setSelected] = useState<DashboardStaffOutput | null>(null);
  const [quocGiaId, setQuocGiaId] = useState<number | undefined>(undefined);
  const [chiSo, setChiSo] = useState<'kg' | 'don'>('kg');

  const countries = useQuery({ queryKey: ['quoc-gia-list'], queryFn: getQuocGia });

  const staff = useQuery({
    queryKey: ['dashboard-output-staff', fromDate, toDate, quocGiaId],
    queryFn: () => getDashboardOutputByStaff(fromDate, toDate, quocGiaId),
  });
  const data = staff.data || [];
  const loading = staff.isLoading;

  const detail = useQuery({
    queryKey: ['dashboard-output-detail', selected?.nhanVien, selected?.thang, quocGiaId],
    queryFn: () => getDashboardOutputDetail(selected!.nhanVien, selected!.thang, quocGiaId),
    enabled: !!selected,
  });

  const totalDetailKg = (detail.data || []).reduce((s, r) => s + r.sanLuongKg, 0);

  /**
   * Tổng của ĐÚNG những dòng đang hiện.
   *
   * `data` đã được máy chủ lọc sẵn theo tuyến (quocGiaId nằm trong queryKey),
   * nên cộng các dòng đang xem chính là tổng của tuyến đang chọn — không cần
   * gọi thêm API, và không bao giờ lệch với bảng bên trên.
   */
  const tong = data.reduce(
    (s, r) => ({ soDon: s.soDon + (r.soDon || 0), kg: s.kg + (r.sanLuongKg || 0) }),
    { soDon: 0, kg: 0 },
  );

  /**
   * Top 10 nhân viên để vẽ. Gom theo người (bỏ chiều tháng) rồi mới cắt top —
   * cắt trước khi gom thì người làm đều hai tháng lại thua người dồn một tháng.
   *
   * Cắt 10 vì biểu đồ này để thấy ai dẫn đầu; muốn xem đủ thì đã có bảng ngay
   * bên dưới, không giấu ai cả.
   */
  const duLieuBieuDo = Object.values(
    data.reduce<Record<string, { nhan: string; kg: number; don: number }>>((m, r) => {
      m[r.nhanVien] = m[r.nhanVien] || { nhan: r.nhanVien, kg: 0, don: 0 };
      m[r.nhanVien].kg += r.sanLuongKg || 0;
      m[r.nhanVien].don += r.soDon || 0;
      return m;
    }, {}),
  )
    .map((x) => ({ nhan: x.nhan, giaTri: chiSo === 'kg' ? x.kg : x.don }))
    .filter((x) => x.giaTri > 0)
    .sort((a, b) => b.giaTri - a.giaTri)
    .slice(0, 10);

  const tenTuyen = quocGiaId
    ? (countries.data || []).find((c) => c.QuocGiaID === quocGiaId)?.TenQuocGia
    : undefined;

  // Mỗi dòng là MỘT nhân viên trong MỘT tháng, nên khoảng ngày trải qua hai
  // tháng thì một người xuất hiện hai dòng — đếm "dòng" chứ không đếm "nhân
  // viên", nói sai số người còn tệ hơn là không nói.
  const nhanFooter = tenTuyen ? `Tổng — tuyến ${tenTuyen}` : 'Tổng — tất cả tuyến';

  const handleExport = () => {
    if (!selected || !detail.data?.length) return;
    const rows = [
      ['Ngày ghi nợ', 'Khách hàng', 'Nội dung', 'Sản lượng (kg)', 'Ghi chú'],
      ...detail.data.map((r) => [r.ngayGhiNo, r.khachHang, r.noiDung, r.sanLuongKg, r.ghiChu]),
    ];
    downloadDataAsExcel(rows, `ChiTietSanLuong_${selected.nhanVien}_${selected.thang}.xlsx`);
  };

  return (
    <>
      <div className="bg-white rounded-lg border border-[#14264b]/20 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-[#14264b]">Sản lượng nhân viên theo tháng</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 font-medium">Tuyến</label>
            <select
              value={quocGiaId ?? ''}
              onChange={(e) => setQuocGiaId(e.target.value ? Number(e.target.value) : undefined)}
              className="border border-[#14264b]/20 rounded px-2 py-1.5 text-sm"
            >
              <option value="">Tất cả tuyến</option>
              {(countries.data || []).map((c) => (
                <option key={c.QuocGiaID} value={c.QuocGiaID}>
                  {c.TenQuocGia}
                </option>
              ))}
            </select>
            <div className="flex rounded-md border border-[#14264b]/20 overflow-hidden text-xs">
              {([['kg', 'Sản lượng'], ['don', 'Số đơn']] as const).map(([ma, nhan]) => (
                <button
                  key={ma}
                  type="button"
                  onClick={() => setChiSo(ma)}
                  className={`px-2.5 py-1.5 ${chiSo === ma ? 'bg-[#14264b] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {nhan}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 10 người dẫn đầu; bảng bên dưới vẫn liệt kê đủ. */}
        <div className="mb-4">
          <BarChartNgang
            data={duLieuBieuDo}
            loading={loading}
            valueFormatter={chiSo === 'kg' ? (v) => `${fmtKg(v)} kg` : (v) => `${fmtInt(v)} đơn`}
          />
        </div>
        <DataTable
          columns={summaryColumns}
          data={(data || []).map((r) => ({ ...r, id: `${r.nhanVien}-${r.thang}` }))}
          rowKey="id"
          loading={loading}
          emptyMessage="Không có dữ liệu trong khoảng đã chọn"
          onRowClick={(row) => setSelected({ nhanVien: row.nhanVien, thang: row.thang, soDon: row.soDon, sanLuongKg: row.sanLuongKg })}
          footer={[nhanFooter, `${data.length} dòng`, fmtInt(tong.soDon), fmtKg(tong.kg)]}
        />
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#14264b]/20">
              <div>
                <h3 className="text-base font-semibold text-[#14264b]">Chi tiết sản lượng</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selected.nhanVien} &mdash; Tháng {selected.thang}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExport}
                  disabled={!detail.data?.length}
                  className="text-xs font-medium px-3 py-1.5 rounded-md bg-[#14264b] text-white hover:bg-[#14264b]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Xuất Excel
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="text-gray-400 hover:text-[#14264b] transition-colors text-xl leading-none"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-auto flex-1 px-5 py-4">
              <DataTable
                columns={detailColumns}
                data={(detail.data || []).map((r, i) => ({ ...r, id: i }))}
                rowKey="id"
                loading={detail.isLoading}
                emptyMessage="Không có dữ liệu chi tiết"
              />
            </div>

            {/* Footer tổng */}
            {!detail.isLoading && (detail.data?.length ?? 0) > 0 && (
              <div className="px-5 py-3 border-t border-[#14264b]/20 flex justify-end gap-6 text-sm">
                <span className="text-gray-500">{detail.data!.length} bản ghi</span>
                <span className="font-semibold text-[#14264b]">
                  Tổng: {fmtKg(totalDetailKg)} kg
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
