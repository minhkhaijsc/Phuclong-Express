'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  huyPhieuNcc,
  layChiTietPhieuNcc,
  layPhieuThanhToanNcc,
  traNccGop,
  type KetQuaLapPhieuNcc,
  type NhaCungCap,
  type SoDuNcc,
} from '@/lib/api';

/**
 * THANH TOÁN NHÀ CUNG CẤP — yêu cầu bên khách 23/10/2026: "có thể lựa chọn
 * thanh toán theo đơn hàng, hoặc k theo đơn hàng".
 *
 * File này giữ phần "KHÔNG theo đơn" (trả gộp) và sổ phiếu. Phần theo đơn
 * (tick + số tiền từng dòng) nằm ngay trên bảng chi tiết của trang, vì đó là
 * chỗ người dùng đang nhìn các đơn.
 */

const soVn = (v: number | null | undefined) => Math.round(v ?? 0).toLocaleString('vi-VN');
const homNay = () => new Date().toISOString().slice(0, 10);
const loiMayChu = (e: any) => e?.response?.data?.message || e?.message || 'Không ghi được';

/** Ô nhập tiền: hiện có dấu chấm ngăn cách, giữ giá trị là số. */
export function OTien({
  giaTri,
  doi,
  className = '',
}: {
  giaTri: number;
  doi: (n: number) => void;
  className?: string;
}) {
  return (
    <input
      inputMode="numeric"
      value={giaTri ? Math.round(giaTri).toLocaleString('vi-VN') : ''}
      onChange={(e) => doi(Number(e.target.value.replace(/\D/g, '')) || 0)}
      className={`rounded-lg border border-gray-200 px-2 py-1.5 text-right text-sm ${className}`}
    />
  );
}

/**
 * Trả gộp: chọn NCC, gõ một cục. Máy chủ tự khấu vào đơn còn nợ CŨ NHẤT
 * trước — đúng lời bên khách: "tự trừ vào đơn cũ nhất", "ko tick đơn hàng,
 * nhưng nhảy vào NCC đang thanh toán".
 */
export function TraGop({
  dsNcc,
  soDu,
  nccMacDinh,
  onXong,
}: {
  dsNcc: NhaCungCap[];
  soDu: SoDuNcc[];
  nccMacDinh?: string;
  onXong: () => void;
}) {
  const [nccId, setNccId] = useState(nccMacDinh ?? '');
  const [ngayTra, setNgayTra] = useState(homNay);
  const [soTien, setSoTien] = useState(0);
  const [ghiChu, setGhiChu] = useState('');
  const [ketQua, setKetQua] = useState<KetQuaLapPhieuNcc | null>(null);
  const [loi, setLoi] = useState('');

  const conNo = soDu.find((s) => String(s.NCC_ID) === nccId)?.conNo ?? 0;

  const ghi = useMutation({
    mutationFn: () => traNccGop({ nccId: Number(nccId), ngayTra, soTien, ghiChu: ghiChu || undefined }),
    onSuccess: (kq) => {
      setKetQua(kq);
      setSoTien(0);
      setGhiChu('');
      onXong();
    },
    onError: (e) => setLoi(loiMayChu(e)),
  });

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">Thanh toán gộp (không theo đơn)</h2>
      <p className="mb-3 text-xs text-gray-500">
        Chọn nhà cung cấp và nhập tổng số tiền đã chuyển. Hệ thống tự trừ vào các đơn còn nợ của NCC đó,
        đơn mua cũ nhất trước.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Nhà cung cấp</label>
          <select
            value={nccId}
            onChange={(e) => { setNccId(e.target.value); setKetQua(null); setLoi(''); }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">— Chọn —</option>
            {dsNcc.map((n) => (
              <option key={n.NhaCungCapID} value={n.NhaCungCapID}>
                {n.TenNhaCungCap}{n.DaAn ? ' (đã ẩn)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Ngày thanh toán</label>
          <input
            type="date"
            value={ngayTra}
            onChange={(e) => setNgayTra(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Số tiền (VNĐ)</label>
          <OTien giaTri={soTien} doi={setSoTien} className="w-40 py-2" />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">Ghi chú</label>
          <input
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            placeholder="vd: CK Vietcombank 23/10"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => { setLoi(''); setKetQua(null); ghi.mutate(); }}
          disabled={!nccId || soTien <= 0 || ghi.isPending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {ghi.isPending ? 'Đang ghi…' : 'Ghi thanh toán'}
        </button>
      </div>

      {nccId && (
        <p className="mt-2 text-xs text-gray-500">
          NCC này đang còn nợ <b className="text-gray-700">{soVn(conNo)}đ</b>.
          {soTien > conNo && conNo >= 0 && (
            <span className="text-amber-700">
              {' '}Số nhập lớn hơn số còn nợ — phần thừa {soVn(soTien - Math.max(0, conNo))}đ sẽ ghi là trả dư.
            </span>
          )}
        </p>
      )}
      {loi && <p className="mt-2 text-sm text-red-600">{loi}</p>}
      {ketQua && (
        <p className="mt-2 text-sm text-emerald-700">
          Đã ghi phiếu #{ketQua.phieuId}: {soVn(ketQua.soTien)}đ, trừ vào <b>{ketQua.soDon}</b> đơn
          ({soVn(ketQua.daPhanBo)}đ)
          {ketQua.traDu > 0 && <span className="text-amber-700"> · trả dư {soVn(ketQua.traDu)}đ</span>}.
        </p>
      )}
    </div>
  );
}

/** Sổ phiếu thanh toán: xem phiếu trừ vào đơn nào, huỷ phiếu nhập nhầm. */
export function SoPhieu({
  nccId,
  tuNgay,
  denNgay,
  phienBan,
  onDoi,
}: {
  nccId?: number;
  tuNgay: string;
  denNgay: string;
  /** Tăng lên mỗi khi vừa ghi phiếu, để sổ nạp lại. */
  phienBan: number;
  onDoi: () => void;
}) {
  const [phieuHuy, setPhieuHuy] = useState<'an' | 'ca' | 'chi'>('an');
  const [mo, setMo] = useState<number | null>(null);
  const [hoiHuy, setHoiHuy] = useState<number | null>(null);
  const [loi, setLoi] = useState('');

  const { data: ds = [], refetch } = useQuery({
    queryKey: ['phieu-ncc', nccId, tuNgay, denNgay, phieuHuy, phienBan],
    queryFn: () => layPhieuThanhToanNcc({ nccId, tuNgay, denNgay, phieuHuy }),
  });

  const { data: chiTiet = [] } = useQuery({
    queryKey: ['phieu-ncc-ct', mo],
    queryFn: () => layChiTietPhieuNcc(mo as number),
    enabled: mo !== null,
  });

  const huy = useMutation({
    mutationFn: (id: number) => huyPhieuNcc(id),
    onSuccess: () => { setHoiHuy(null); refetch(); onDoi(); },
    onError: (e) => setLoi(loiMayChu(e)),
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-700">
          Phiếu thanh toán NCC ({ds.length}) <span className="font-normal text-gray-400">— lọc theo ngày thanh toán</span>
        </h2>
        <select
          value={phieuHuy}
          onChange={(e) => setPhieuHuy(e.target.value as 'an' | 'ca' | 'chi')}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
        >
          <option value="an">Phiếu đang hiệu lực</option>
          <option value="ca">Cả phiếu đã huỷ</option>
          <option value="chi">Chỉ phiếu đã huỷ</option>
        </select>
      </div>
      {loi && <p className="px-4 py-2 text-sm text-red-600">{loi}</p>}
      <table className="min-w-full divide-y divide-gray-100 text-xs">
        <thead className="bg-gray-50">
          <tr>
            {['#', 'Ngày TT', 'Nhà cung cấp', 'Cách trả', 'Số tiền', 'Trừ vào', 'Ghi chú', 'Người ghi', 'Trạng thái', ''].map((h) => (
              <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {ds.length === 0 && (
            <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-400">Chưa có phiếu nào trong khoảng này.</td></tr>
          )}
          {ds.map((p) => {
            const du = Number(p.SoTien) - Number(p.daPhanBo);
            return [
              <tr key={p.PhieuID} className={p.DaXoa ? 'bg-red-50/40 text-gray-500' : ''}>
                <td className="px-3 py-2">{p.PhieuID}</td>
                <td className="px-3 py-2">{new Date(p.NgayTra).toLocaleDateString('vi-VN')}</td>
                <td className={`px-3 py-2 ${p.DaXoa ? 'font-semibold text-gray-700' : ''}`}>{p.TenNhaCungCap || p.NCC_ID}</td>
                <td className="px-3 py-2">{p.Loai === 'gop' ? 'Gộp (tự trừ đơn cũ)' : 'Theo đơn'}</td>
                <td className={`px-3 py-2 text-right font-semibold ${p.DaXoa ? 'line-through' : ''}`}>{soVn(p.SoTien)}</td>
                <td className="px-3 py-2">
                  <button type="button" className="text-[#14264b] underline" onClick={() => setMo(mo === p.PhieuID ? null : p.PhieuID)}>
                    {p.soDon} đơn
                  </button>
                  {du >= 1 && <span className="ml-1 text-amber-700">· dư {soVn(du)}</span>}
                </td>
                <td className="px-3 py-2">{p.GhiChu || '-'}</td>
                <td className="px-3 py-2">{p.NguoiTao}</td>
                <td className="px-3 py-2">
                  {p.DaXoa ? (
                    <span className="text-red-600">
                      Đã huỷ
                      {p.NgayXoa ? ` ${new Date(p.NgayXoa).toLocaleString('vi-VN')}` : ''}
                      {p.NguoiXoa ? ` · ${p.NguoiXoa}` : ''}
                    </span>
                  ) : (
                    <span className="text-emerald-700">Hiệu lực</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {!p.DaXoa &&
                    (hoiHuy === p.PhieuID ? (
                      <span className="whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => huy.mutate(p.PhieuID)}
                          disabled={huy.isPending}
                          className="rounded bg-red-600 px-2 py-1 text-white"
                        >
                          Huỷ thật
                        </button>{' '}
                        <button type="button" onClick={() => setHoiHuy(null)} className="rounded border px-2 py-1">
                          Thôi
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setHoiHuy(p.PhieuID)} className="text-red-600 hover:underline">
                        Huỷ phiếu
                      </button>
                    ))}
                </td>
              </tr>,
              mo === p.PhieuID && (
                <tr key={`ct-${p.PhieuID}`} className="bg-gray-50">
                  <td colSpan={10} className="px-6 py-2">
                    {chiTiet.length === 0 ? (
                      <span className="text-gray-400">Phiếu này chưa trừ vào đơn nào (toàn bộ là trả dư).</span>
                    ) : (
                      <table className="text-xs">
                        <tbody>
                          {chiTiet.map((c) => (
                            <tr key={c.DonHangID}>
                              <td className="pr-4">{c.ordernumber || c.DonHangID}</td>
                              <td className="pr-4">{c.ngayMua ? new Date(c.ngayMua).toLocaleDateString('vi-VN') : '-'}</td>
                              <td className="pr-4">{c.username}</td>
                              <td className="pr-4 text-right">phải trả {soVn(c.NCC_TongPhaiTra)}</td>
                              <td className="text-right font-semibold">trả {soVn(c.SoTien)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
