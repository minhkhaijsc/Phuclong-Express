'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import {
  FiArrowLeft, FiEdit2, FiPackage, FiUser, FiHash,
  FiCalendar, FiGlobe, FiFileText, FiClock, FiImage, FiCamera, FiTrash2, FiUpload,
} from 'react-icons/fi';
import { KhungXemAnh } from '@/app/components/tracking/xem-anh-tracking';
import { loiDeDoc, xoaAnhTracking, type AnhTracking } from '@/lib/anh-tracking';

interface TrackingDetail {
  TrackingID: number;
  UserName: string;
  TrackingNumber: string;
  OrderNumber: string;
  NgayDatHang: string;
  TenLoHang: string;
  NhaVanChuyenID: number;
  QuocGiaID: number;
  TenQuocGia: string;
  TinhTrang: string;
  GhiChu: string;
  Kien: string;
  Mawb: string;
  Hawb: string;
  NguoiTao: string;
  NgayTao: string;
  chiTietTracking: TrackingDetailItem[];
  lichSuTracking: TrackingHistory[];
  anhTracking?: AnhTracking[];
}

interface TrackingDetailItem {
  ID: number;
  LinkHinh: string | null;
  SoLuong: number | null;
  Gia: number | null;
  GhiChu: string | null;
}

interface TrackingHistory {
  TinhTrangTrackingID: number;
  TrackingID: number;
  TinhTrang: string;
  NgayChuyenTinhTrang: string | null;
  GhiChu: string | null;
  NgayTao: string | null;
  NguoiTao: string | null;
  DaXoa: boolean;
  MoTaTinhTrang: string | null;
}

const getTrackingDetails = async (id: number) => {
  const response = await apiClient.get<TrackingDetail>(`/tracking/${id}/details`);
  return response.data;
};

const formatDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('vi-VN');
};

const formatDateTime = (date: string | null) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('vi-VN');
};

const statusConfig: Record<string, { badge: string; dot: string }> = {
  Received:  { badge: 'bg-blue-50 text-blue-700 border border-blue-200',      dot: 'bg-blue-400' },
  InTransit: { badge: 'bg-amber-50 text-amber-700 border border-amber-200',    dot: 'bg-amber-400' },
  InVN:      { badge: 'bg-orange-50 text-orange-700 border border-orange-200', dot: 'bg-orange-400' },
  VNTransit: { badge: 'bg-violet-50 text-violet-700 border border-violet-200', dot: 'bg-violet-400' },
  Completed: { badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-400' },
  Cancelled: { badge: 'bg-rose-50 text-rose-700 border border-rose-200',       dot: 'bg-rose-400' },
};

function InfoField({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium text-slate-800 mt-0.5 break-words">{value || '-'}</p>
      </div>
    </div>
  );
}

export default function TrackingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const [xemAnh, setXemAnh] = useState<number | null>(null);
  const [dangXoa, setDangXoa] = useState<number | null>(null);

  const xoaAnh = async (a: AnhTracking) => {
    if (!confirm(`Xoá ảnh "${a.TenFileGoc ?? ''}" khỏi tracking này?`)) return;
    setDangXoa(a.AnhTrackingID);
    try {
      await xoaAnhTracking(a.AnhTrackingID);
      await queryClient.invalidateQueries({ queryKey: ['tracking', id] });
    } catch (e) {
      alert(`Không xoá được: ${loiDeDoc(e)}`);
    } finally {
      setDangXoa(null);
    }
  };

  const { data: tracking, isLoading, error } = useQuery({
    queryKey: ['tracking', id],
    queryFn: () => getTrackingDetails(id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 border-2 border-[#14264b] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-rose-500">
        <FiPackage className="h-10 w-10 opacity-40" />
        <p>Lỗi tải dữ liệu</p>
        <button onClick={() => router.push('/admin/tracking')}
          className="text-sm text-slate-500 hover:text-slate-700 underline cursor-pointer">
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const statusCfg = statusConfig[tracking.TinhTrang] || { badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };

  return (
    <div className="max-w-4xl space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/admin/tracking"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#14264b] transition-colors cursor-pointer">
          <FiArrowLeft className="h-4 w-4" />
          Danh sách tracking
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-medium text-slate-700 font-mono">{tracking.TrackingNumber}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#14264b]/10">
            <FiPackage className="h-5 w-5 text-[#14264b]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 font-mono">{tracking.TrackingNumber}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusCfg.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                {tracking.TinhTrang}
              </span>
              <span className="text-xs text-slate-400">ID: #{tracking.TrackingID}</span>
            </div>
          </div>
        </div>
        <button onClick={() => router.push(`/admin/tracking/${id}/edit`)}
          className="flex items-center gap-2 bg-[#14264b] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-cyan-400 transition-colors cursor-pointer shadow-sm shadow-cyan-300/40">
          <FiEdit2 className="h-4 w-4" />
          Chỉnh sửa
        </button>
      </div>

      {/* Info grid */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 pb-3 border-b border-slate-100">Thông tin tracking</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <InfoField icon={FiUser}     label="Username"      value={tracking.UserName} />
          <InfoField icon={FiHash}     label="Order Number"  value={tracking.OrderNumber} />
          <InfoField icon={FiCalendar} label="Ngày đặt"      value={formatDate(tracking.NgayDatHang)} />
          <InfoField icon={FiPackage}  label="Lô hàng"       value={tracking.TenLoHang} />
          <InfoField icon={FiGlobe}    label="Quốc gia"      value={tracking.TenQuocGia} />
          <InfoField icon={FiPackage}  label="Kiện"          value={tracking.Kien} />
          <InfoField icon={FiHash}     label="MAWB"          value={tracking.Mawb} />
          <InfoField icon={FiHash}     label="HAWB"          value={tracking.Hawb} />
          <InfoField icon={FiUser}     label="Người tạo"     value={tracking.NguoiTao} />
        </div>
        {tracking.GhiChu && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <FiFileText className="h-4 w-4 text-slate-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ghi chú</p>
              <p className="text-sm text-slate-700 mt-0.5">{tracking.GhiChu}</p>
            </div>
          </div>
        )}
      </div>

      {/* Ảnh hàng */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <FiCamera className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Ảnh hàng</h2>
          {(tracking.anhTracking?.length ?? 0) > 0 && (
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              {tracking.anhTracking!.length} ảnh
            </span>
          )}
          <Link href="/admin/tracking/anh"
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[#14264b] hover:text-cyan-600">
            <FiUpload className="h-3.5 w-3.5" /> Up ảnh
          </Link>
        </div>
        {(tracking.anhTracking?.length ?? 0) > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {tracking.anhTracking!.map((a, i) => (
              <div key={a.AnhTrackingID} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <button type="button" onClick={() => setXemAnh(i)} className="block w-full cursor-zoom-in" title="Xem ảnh lớn">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.LinkHinh} alt={a.TenFileGoc ?? ''} loading="lazy" className="aspect-square w-full object-cover" />
                </button>
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11px] text-slate-600" title={a.TenFileGoc ?? ''}>{a.TenFileGoc}</p>
                    <p className="truncate text-[10px] text-slate-400">{a.NguoiTao} · {formatDateTime(a.NgayTao)}</p>
                  </div>
                  <button type="button" onClick={() => xoaAnh(a)} disabled={dangXoa === a.AnhTrackingID}
                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer disabled:opacity-40"
                    title="Xoá ảnh">
                    <FiTrash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-4 text-center">Chưa có ảnh</p>
        )}
        {xemAnh !== null && tracking.anhTracking?.length ? (
          <KhungXemAnh
            anh={tracking.anhTracking.map((a) => ({ src: a.LinkHinh, ten: a.TenFileGoc }))}
            viTri={xemAnh}
            onDong={() => setXemAnh(null)}
          />
        ) : null}
      </div>

      {/* Status history */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <FiClock className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Lịch sử tình trạng</h2>
          {tracking.lichSuTracking?.length > 0 && (
            <span className="ml-auto text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              {tracking.lichSuTracking.length} mục
            </span>
          )}
        </div>
        {tracking.lichSuTracking?.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="min-w-[820px] space-y-0.5">
              <div className="grid grid-cols-[4rem_7rem_10rem_7rem_1fr_1fr] gap-x-3 px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <span>ID</span>
              <span>Người thao tác</span>
              <span>Thời gian</span>
              <span>Tình trạng</span>
              <span>Mô tả</span>
              <span>Ghi chú</span>
              </div>
              {tracking.lichSuTracking.map((item, idx: number) => (
                <div key={item.TinhTrangTrackingID}
                  className={`grid grid-cols-[4rem_7rem_10rem_7rem_1fr_1fr] gap-x-3 px-3 py-2.5 rounded-lg text-sm ${idx % 2 === 0 ? 'bg-slate-50' : ''}`}>
                  <span className="text-slate-400 font-mono text-xs">{item.TinhTrangTrackingID}</span>
                  <span className="text-slate-700">{item.NguoiTao || '-'}</span>
                  <span className="text-slate-400 text-xs whitespace-nowrap">{formatDateTime(item.NgayChuyenTinhTrang)}</span>
                  <span className="text-slate-700">{item.TinhTrang || '-'}</span>
                  <span className="text-slate-700">{item.MoTaTinhTrang || '-'}</span>
                  <span className="text-slate-700">{item.GhiChu || '-'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-4 text-center">Chưa có lịch sử</p>
        )}
      </div>

      {/* Chi tiết tracking */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <FiImage className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Chi tiết tracking</h2>
          {tracking.chiTietTracking?.length > 0 && (
            <span className="ml-auto text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              {tracking.chiTietTracking.length} mục
            </span>
          )}
        </div>
        {tracking.chiTietTracking?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-slate-50 rounded-lg">
                  {['ID', 'Hình ảnh', 'Số lượng', 'Giá', 'Ghi chú'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide first:rounded-l-lg last:rounded-r-lg">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tracking.chiTietTracking.map((item) => (
                  <tr key={item.ID} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2.5 text-sm text-slate-500 font-mono">{item.ID}</td>
                    <td className="px-4 py-2.5 text-sm">
                      {item.LinkHinh ? (
                        <a href={item.LinkHinh} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[#14264b] hover:text-cyan-600 transition-colors text-xs font-medium cursor-pointer">
                          <FiImage className="h-3.5 w-3.5" /> Xem hình
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-700 font-medium">{item.SoLuong ?? '-'}</td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-700 font-medium">{item.Gia ?? '-'}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{item.GhiChu || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-4 text-center">Chưa có chi tiết</p>
        )}
      </div>
    </div>
  );
}
