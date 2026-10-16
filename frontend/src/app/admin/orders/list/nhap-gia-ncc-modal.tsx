'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { capNhatNccHangLoat, layNhaCungCap } from '@/lib/api';
import type { Order } from '@/types/order';
import { soNcc, tienCongNcc, tongPhaiTraNeuDu } from '@/lib/gia-ncc';

/**
 * NHẬP GIÁ NHÀ CUNG CẤP CHO CẢ MỘT ORDER NUMBER.
 *
 * Yêu cầu bên khách 16/10/2026: "em muốn nhập thông tin rate nhà cung cấp cho
 * 1 Order number gồm nhiều mã ĐH, hiện chỉ có thể ấn edit từng mã ĐH khá mất
 * thời gian, a xem giúp e có thể edit 1 loạt được không ạ?"
 *
 * Chia đúng theo cách dữ liệu nằm: nhà cung cấp, % công, tỷ giá, tracking là
 * chung cho cả lần đặt nên để một chỗ ở trên; ngoại tệ mỗi món một giá nên gõ
 * theo từng dòng ở bảng dưới.
 *
 * BA LUẬT, cả ba đều cố ý:
 *   1. Ô trống = GIỮ NGUYÊN, không phải xoá. Chỉ sửa tỷ giá thì để trống ba ô
 *      kia, giá nhà cung cấp đã nhập từ trước không việc gì.
 *   2. Bảng dưới hiện CẢ SỐ CŨ LẪN SỐ MỚI của Tổng phải trả. Màn hàng loạt mà
 *      không cho xem trước thì không ai dám bấm, hoặc tệ hơn là bấm rồi mới
 *      biết hỏng mấy chục đơn.
 *   3. Chưa đủ ngoại tệ/tỷ giá thì Tổng phải trả GIỮ NGUYÊN chứ không về 0 —
 *      cột đó khác null chính là dấu "đã nhập giá NCC" của trang công nợ phải
 *      trả, ghi 0 vào là đếm nhầm đơn chưa nhập thành đã nhập.
 *
 * Giá đang có lấy thẳng từ dòng danh sách đã nạp (máy chủ gắn sẵn các khoá
 * NCC_* cho người có quyền `giaNcc`), nên mở modal không phải gọi thêm API.
 * Máy chủ vẫn đọc lại giá mới nhất trước khi ghi — bảng này chỉ để xem trước.
 */

/** Dòng đơn kèm khối NCC mà máy chủ gắn thêm cho người có quyền. */
type DonKemNcc = Order & {
  NCC_ID?: number | null;
  NCC_NgoaiTe?: number | null;
  NCC_Cong?: number | null;
  NCC_TyGia?: number | null;
  NCC_TongPhaiTra?: number | null;
  NCC_Tracking?: string | null;
};

const tienVn = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Math.round(v).toLocaleString('vi-VN');

const ntVn = (v: number | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export default function NhapGiaNccModal({
  open,
  don,
  onClose,
  onSuccess,
}: {
  open: boolean;
  /** Đúng những dòng đang tích chọn ở danh sách. */
  don: DonKemNcc[];
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();

  const [nccId, setNccId] = useState('');
  const [cong, setCong] = useState('');
  const [tyGia, setTyGia] = useState('');
  const [tracking, setTracking] = useState('');
  const [tinhLai, setTinhLai] = useState(true);
  /** Ngoại tệ gõ riêng từng dòng, khoá là ID đơn. */
  const [ngoaiTe, setNgoaiTe] = useState<Record<number, string>>({});
  const [loi, setLoi] = useState('');

  const { data: dsNhaCungCap = [] } = useQuery({
    queryKey: ['nha-cung-cap'],
    queryFn: () => layNhaCungCap(false),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // Mở lại là về trạng thái sạch: giữ số của lần trước thì rất dễ áp nhầm tỷ
  // giá của order number cũ sang order number mới.
  useEffect(() => {
    if (!open) return;
    setLoi('');
    setNccId('');
    setCong('');
    setTyGia('');
    setTracking('');
    setTinhLai(true);
    setNgoaiTe(
      Object.fromEntries(
        don.map((d) => [
          d.id,
          d.NCC_NgoaiTe === null || d.NCC_NgoaiTe === undefined ? '' : String(d.NCC_NgoaiTe),
        ]),
      ),
    );
    // Chỉ chạy khi MỞ modal, không chạy mỗi lần danh sách nền tải lại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Bao nhiêu OrderNumber đang nằm trong mẻ này. */
  const soOrderNumber = useMemo(
    () => new Set(don.map((d) => d.orderNumber || '')).size,
    [don],
  );

  /** Bảng xem trước — đúng phép tính máy chủ sẽ làm. */
  const xemTruoc = useMemo(
    () =>
      don.map((d) => {
        const ntGo = ngoaiTe[d.id] ?? '';
        const nt = ntGo.trim() === '' ? d.NCC_NgoaiTe ?? null : soNcc(ntGo);
        const congMoi = cong.trim() === '' ? d.NCC_Cong ?? null : soNcc(cong);
        const tgMoi = tyGia.trim() === '' ? d.NCC_TyGia ?? null : soNcc(tyGia);
        const tinh = tinhLai ? tongPhaiTraNeuDu(nt, congMoi, tgMoi) : null;
        const cu = d.NCC_TongPhaiTra ?? null;
        return {
          don: d,
          tienCong: tienCongNcc(nt, congMoi),
          cu,
          moi: tinh ?? cu,
          doi: tinh !== null && tinh !== cu,
        };
      }),
    [don, ngoaiTe, cong, tyGia, tinhLai],
  );

  const tongPhaiTraMoi = xemTruoc.reduce((t, d) => t + (d.moi ?? 0), 0);

  const mut = useMutation({
    mutationFn: capNhatNccHangLoat,
    onSuccess: async (kq) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['cong-no-ncc'], refetchType: 'all' }),
      ]);
      const them = kq.khongThay.length
        ? ` — ${kq.khongThay.length} đơn không còn tìm thấy`
        : '';
      alert(
        `Đã ghi giá nhà cung cấp cho ${kq.capNhat} đơn` +
          (kq.khongDoi ? `, ${kq.khongDoi} đơn không có gì thay đổi` : '') +
          them,
      );
      onSuccess?.();
      onClose();
    },
    onError: (e: any) => {
      setLoi(
        e?.response?.data?.message ||
          e?.message ||
          'Không ghi được. Thử lại hoặc báo kỹ thuật.',
      );
    },
  });

  if (!open) return null;

  const goc = (d: DonKemNcc) =>
    d.NCC_NgoaiTe === null || d.NCC_NgoaiTe === undefined ? '' : String(d.NCC_NgoaiTe);

  const gui = () => {
    setLoi('');
    const coOChung =
      nccId.trim() !== '' ||
      cong.trim() !== '' ||
      tyGia.trim() !== '' ||
      tracking.trim() !== '';
    const coSuaNgoaiTe = don.some((d) => (ngoaiTe[d.id] ?? '').trim() !== goc(d));
    if (!coOChung && !coSuaNgoaiTe) {
      setLoi('Chưa nhập gì cả — điền ít nhất một ô rồi mới ghi được.');
      return;
    }

    mut.mutate({
      dong: don.map((d) => {
        const v = (ngoaiTe[d.id] ?? '').trim();
        return { id: d.id, ...(v === '' ? {} : { ngoaiTe: Number(v) }) };
      }),
      ...(nccId.trim() === '' ? {} : { nccId: Number(nccId) }),
      ...(cong.trim() === '' ? {} : { cong: Number(cong) }),
      ...(tyGia.trim() === '' ? {} : { tyGia: Number(tyGia) }),
      ...(tracking.trim() === '' ? {} : { tracking: tracking.trim() }),
      tinhLaiTongPhaiTra: tinhLai,
    });
  };

  const o =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500';
  const nhan = 'mb-1 block text-sm font-medium text-gray-700';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-6 w-full max-w-5xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Nhập giá nhà cung cấp — {don.length} mã ĐH
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {soOrderNumber === 1 ? (
                <>OrderNumber {don[0]?.orderNumber || '—'}</>
              ) : (
                <span className="text-amber-700">
                  Đang chọn {soOrderNumber} OrderNumber khác nhau — kiểm lại trước khi ghi.
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          {loi && <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{loi}</div>}

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h4 className="text-sm font-semibold text-gray-900">Áp cho cả {don.length} đơn</h4>
              <span className="text-xs text-gray-500">Ô để trống = giữ nguyên giá trị cũ</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <label className={nhan}>Nhà cung cấp</label>
                <select value={nccId} onChange={(e) => setNccId(e.target.value)} className={o}>
                  <option value="">— Giữ nguyên —</option>
                  {dsNhaCungCap.map((n) => (
                    <option key={n.NhaCungCapID} value={n.NhaCungCapID}>
                      {n.TenNhaCungCap}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={nhan}>% Công</label>
                <input
                  type="number"
                  step="0.01"
                  value={cong}
                  onChange={(e) => setCong(e.target.value)}
                  placeholder="3 nghĩa là 3%"
                  className={o}
                />
              </div>
              <div>
                <label className={nhan}>Tỷ giá</label>
                <input
                  type="number"
                  step="0.01"
                  value={tyGia}
                  onChange={(e) => setTyGia(e.target.value)}
                  placeholder={don[0]?.tyGia ? `Bán khách: ${don[0].tyGia}` : ''}
                  className={o}
                />
              </div>
              <div className="md:col-span-2">
                <label className={nhan}>Tracking</label>
                <input
                  type="text"
                  maxLength={100}
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="Để trống nếu mỗi đơn một tracking"
                  className={o}
                />
              </div>
              <div className="flex items-end md:col-span-2">
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={tinhLai}
                    onChange={(e) => setTinhLai(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    Tính lại Tổng phải trả = (Ngoại tệ + %Công) × Tỷ giá
                    <span className="block text-xs text-gray-500">
                      Bỏ tích nếu tổng phải trả đã gõ tay theo hoá đơn NCC.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">Ngoại tệ từng đơn</h4>
            <button
              type="button"
              onClick={() =>
                setNgoaiTe(
                  Object.fromEntries(
                    don.map((d) => [
                      d.id,
                      d.giaSauOffUsd ? String(Math.round(d.giaSauOffUsd * 100) / 100) : '',
                    ]),
                  ),
                )
              }
              className="text-xs text-cyan-700 underline"
            >
              Điền theo Giá sau off của từng đơn
            </button>
          </div>

          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Mã ĐH</th>
                  <th className="px-3 py-2 text-left">Màu / Size</th>
                  <th className="px-3 py-2 text-right">Giá sau off</th>
                  <th className="px-3 py-2 text-right">Ngoại tệ NCC</th>
                  <th className="px-3 py-2 text-right">Tiền công</th>
                  <th className="px-3 py-2 text-right">Phải trả cũ</th>
                  <th className="px-3 py-2 text-right">Sau khi ghi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {xemTruoc.map((d) => (
                  <tr key={d.don.id} className={d.doi ? 'bg-cyan-50/40' : ''}>
                    <td className="px-3 py-2 font-medium text-gray-900">{d.don.id}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-gray-600">
                      {[d.don.color, d.don.size].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {ntVn(d.don.giaSauOffUsd)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={ngoaiTe[d.don.id] ?? ''}
                        onChange={(e) =>
                          setNgoaiTe((t) => ({ ...t, [d.don.id]: e.target.value }))
                        }
                        className="w-28 rounded border border-gray-200 px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {d.tienCong > 0 ? ntVn(d.tienCong) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">{tienVn(d.cu)}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        d.doi ? 'text-cyan-800' : 'text-gray-400'
                      }`}
                    >
                      {tienVn(d.moi)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-gray-900">
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-right">
                    Tổng phải trả sau khi ghi
                  </td>
                  <td className="px-3 py-2 text-right">{tienVn(tongPhaiTraMoi)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            onClick={gui}
            disabled={mut.isPending}
            className="rounded-lg bg-cyan-600 px-5 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {mut.isPending ? 'Đang ghi...' : `Ghi cho ${don.length} đơn`}
          </button>
        </div>
      </div>
    </div>
  );
}
