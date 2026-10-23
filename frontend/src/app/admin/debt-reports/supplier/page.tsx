'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { layCongNoNcc, layNhaCungCap, laySoDuNcc, traNccTheoDon, type DongCongNoNcc } from '@/lib/api';
import { OTien, SoPhieu, TraGop } from '@/app/components/ncc/thanh-toan-ncc';
import { useQuyen } from '@/hooks/use-quyen';
import { downloadDataAsExcel } from '@/lib/excel-download';

/**
 * CHI TIẾT CÔNG NỢ PHẢI TRẢ NHÀ CUNG CẤP — Kế toán, Giám đốc, Admin.
 *
 * Yêu cầu bên khách 12/10/2026: "Thiết kế thêm giúp em 1 trang chi tiết công nợ
 * phải trả cho NCC, quyền kế toán, GD dc xem". Mua hàng KHÔNG có quyền này, dù
 * họ xem được khối NCC trên từng đơn — hai câu yêu cầu khác nhau nên hai quyền
 * khác nhau (`giaNcc` và `congNoNcc`).
 *
 * SỐ LIỆU ĐỌC TỪ ĐƠN HÀNG, không phải từ một sổ riêng: phía nhà cung cấp chưa
 * có sổ nào, số phải trả nằm trên chính dòng đơn. Vì vậy trang này hiện luôn
 * số đơn CHƯA NHẬP giá NCC — không có con số đó thì người xem tưởng tổng phải
 * trả đã là toàn bộ, trong khi có thể mới nhập được một phần.
 *
 * THANH TOÁN NCC (23/10/2026): "có thể lựa chọn thanh toán theo đơn hàng, hoặc
 * k theo đơn hàng". Theo đơn = tick dòng ở bảng chi tiết + số tiền từng dòng;
 * không theo đơn = khối "Thanh toán gộp", tự trừ đơn cũ nhất của NCC đó.
 */
const soVn = (v: number | null | undefined) => (v ?? 0).toLocaleString('vi-VN');

const homNay = () => new Date().toISOString().slice(0, 10);
const dauThang = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function TrangCongNoNcc() {
  const { xemCongNoNcc, dangNap } = useQuyen();

  const [tuNgay, setTuNgay] = useState(dauThang);
  const [denNgay, setDenNgay] = useState(homNay);
  const [nccId, setNccId] = useState('');
  const [trangThai, setTrangThai] = useState<'' | 'con-no' | 'da-tra'>('');
  const [page, setPage] = useState(1);

  /** Đơn đang tick để trả theo đơn: mã đơn → số tiền trả. */
  const [chon, setChon] = useState<Map<number, number>>(new Map());
  const [nccDangChon, setNccDangChon] = useState<number | null>(null);
  const [ngayTra, setNgayTra] = useState(homNay);
  const [ghiChuTra, setGhiChuTra] = useState('');
  const [thongBao, setThongBao] = useState<{ loai: 'ok' | 'loi'; noiDung: string } | null>(null);
  /** Tăng mỗi lần ghi/huỷ phiếu để mọi khối nạp lại. */
  const [phienBan, setPhienBan] = useState(0);

  const loc = {
    tuNgay,
    denNgay,
    nccId: nccId ? Number(nccId) : undefined,
    trangThai: trangThai || undefined,
    page,
    limit: 100,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['cong-no-ncc', loc, phienBan],
    queryFn: () => layCongNoNcc(loc),
    enabled: xemCongNoNcc,
  });

  // Ô lọc lấy CẢ nhà cung cấp đã ẩn, không thì không tra lại được nợ cũ của họ.
  const { data: dsNcc = [] } = useQuery({
    queryKey: ['nha-cung-cap', true],
    queryFn: () => layNhaCungCap(true),
    enabled: xemCongNoNcc,
  });

  const { data: soDu = [] } = useQuery({
    queryKey: ['so-du-ncc', phienBan],
    queryFn: laySoDuNcc,
    enabled: xemCongNoNcc,
  });

  const conNoDon = (r: DongCongNoNcc) => Math.max(0, (r.NCC_TongPhaiTra ?? 0) - (r.NCC_DaTra ?? 0));

  /**
   * Tick một đơn. Mặc định trả ĐỦ phần còn nợ — đa số lần trả là trả hết, gõ
   * lại từng số là việc thừa; trả một phần thì sửa ô số tiền.
   *
   * Chỉ tick được đơn CÙNG một NCC: một phiếu là một lần chuyển tiền cho một
   * nhà cung cấp (máy chủ cũng chặn).
   */
  const tick = (r: DongCongNoNcc) => {
    const m = new Map(chon);
    if (m.has(r.ID)) {
      m.delete(r.ID);
      if (m.size === 0) setNccDangChon(null);
    } else {
      m.set(r.ID, Math.round(conNoDon(r)));
      setNccDangChon(r.NCC_ID);
    }
    setChon(m);
  };

  const boChon = () => { setChon(new Map()); setNccDangChon(null); };
  const tongChon = [...chon.values()].reduce((a, b) => a + b, 0);

  const traTheoDon = useMutation({
    mutationFn: () =>
      traNccTheoDon({
        ngayTra,
        ghiChu: ghiChuTra || undefined,
        dong: [...chon.entries()].map(([donHangId, soTien]) => ({ donHangId, soTien })),
      }),
    onSuccess: (kq) => {
      setThongBao({ loai: 'ok', noiDung: `Đã ghi phiếu #${kq.phieuId}: ${soVn(kq.soTien)}đ cho ${kq.soDon} đơn.` });
      boChon();
      setGhiChuTra('');
      setPhienBan((v) => v + 1);
    },
    onError: (e: any) =>
      setThongBao({ loai: 'loi', noiDung: e?.response?.data?.message || 'Không ghi được thanh toán' }),
  });

  const xuatExcel = () => {
    const rows = data?.chiTiet?.data ?? [];
    if (!rows.length) return;
    downloadDataAsExcel(
      [
        [
          'Mã ĐH', 'OrderNumber', 'Ngày mua', 'Khách', 'Nhà cung cấp', 'Website',
          'Tuyến', 'Ngoại tệ', '% Công', 'Tỷ giá', 'Tổng phải trả (VNĐ)',
          'Tổng thu khách (VNĐ)', 'Lãi/Lỗ (VNĐ)', 'Đã trả NCC (VNĐ)', 'Còn nợ NCC (VNĐ)',
          'Tracking NCC', 'Trạng thái',
        ],
        ...rows.map((r) => [
          r.ID,
          r.ordernumber || '',
          r.ngayMua ? new Date(r.ngayMua) : null,
          r.username || '',
          r.TenNhaCungCap || '',
          r.WebsiteName || '',
          r.TenQuocGia || '',
          r.NCC_NgoaiTe ?? 0,
          r.NCC_Cong ?? 0,
          r.NCC_TyGia ?? 0,
          Math.round(r.NCC_TongPhaiTra ?? 0),
          Math.round(r.tongtienVND ?? 0),
          Math.round(r.NCC_LaiLo ?? 0),
          Math.round(r.NCC_DaTra ?? 0),
          Math.round(conNoDon(r)),
          r.NCC_Tracking || '',
          r.trangthaiOrder || '',
        ]),
      ],
      `CongNoPhaiTraNCC_${tuNgay}_${denNgay}.xlsx`,
      // Không truyền textColumns — xem ghi chú ở /admin/orders/list.
      undefined,
      undefined,
      undefined,
      'Cong no phai tra NCC',
    );
  };

  if (dangNap) return <div className="p-6 text-sm text-gray-500">Đang kiểm quyền…</div>;

  if (!xemCongNoNcc) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-base font-semibold text-amber-900">Không có quyền</h2>
        <p className="mt-1 text-sm text-amber-800">
          Trang công nợ phải trả nhà cung cấp chỉ mở cho Kế toán, Giám đốc và Admin.
        </p>
      </div>
    );
  }

  const t = data?.tongHop;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Công nợ phải trả nhà cung cấp</h1>
        <p className="text-xs text-gray-500">
          Lọc theo ngày mua hàng. Chỉ tính những đơn ĐÃ nhập giá nhà cung cấp.
        </p>
      </div>

      {/* Bộ lọc */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Từ ngày</label>
          <input
            type="date"
            value={tuNgay}
            onChange={(e) => { setTuNgay(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Đến ngày</label>
          <input
            type="date"
            value={denNgay}
            onChange={(e) => { setDenNgay(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Nhà cung cấp</label>
          <select
            value={nccId}
            onChange={(e) => { setNccId(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">Tất cả</option>
            {dsNcc.map((n) => (
              <option key={n.NhaCungCapID} value={n.NhaCungCapID}>
                {n.TenNhaCungCap}{n.DaAn ? ' (đã ẩn)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Thanh toán NCC</label>
          <select
            value={trangThai}
            onChange={(e) => { setTrangThai(e.target.value as '' | 'con-no' | 'da-tra'); setPage(1); }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">Tất cả</option>
            <option value="con-no">Còn nợ NCC</option>
            <option value="da-tra">Đã trả đủ NCC</option>
          </select>
        </div>
        <button
          type="button"
          onClick={xuatExcel}
          disabled={!data?.chiTiet?.data?.length}
          className="rounded-lg bg-[#14264b] px-3 py-2 text-sm font-medium text-white hover:bg-[#1e3a6e] disabled:opacity-50"
        >
          Xuất Excel
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          Không tải được số liệu: {(error as Error).message}
        </div>
      )}

      {/* Tổng hợp */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          { nhan: 'Số đơn có giá NCC', gt: soVn(t?.soDon) },
          { nhan: 'Tổng phải trả (VNĐ)', gt: soVn(t?.tongPhaiTra) },
          { nhan: 'Đã trả NCC (VNĐ)', gt: soVn(t?.daTra), mau: 'text-emerald-700' },
          {
            nhan: 'Còn phải trả (VNĐ)',
            gt: soVn((t?.tongPhaiTra ?? 0) - (t?.daTra ?? 0)),
            mau: 'text-amber-700',
          },
          { nhan: 'Tổng thu khách (VNĐ)', gt: soVn(t?.tongThuKhach) },
          {
            nhan: 'Lãi / Lỗ (VNĐ)',
            gt: soVn(t?.laiLo),
            mau: (t?.laiLo ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700',
          },
        ].map((o) => (
          <div key={o.nhan} className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {o.nhan}
            </p>
            <p className={`mt-1 text-lg font-bold ${o.mau ?? 'text-gray-800'}`}>{o.gt}</p>
          </div>
        ))}
      </div>

      {(data?.soDonChuaNhap ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Trong khoảng này còn <b>{soVn(data?.soDonChuaNhap)}</b> đơn chưa ai nhập giá nhà
          cung cấp, nên con số phải trả ở trên chưa phải toàn bộ.
        </div>
      )}

      {/* Gộp theo nhà cung cấp */}
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <div className="border-b border-gray-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-gray-700">Theo nhà cung cấp</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Nhà cung cấp</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Số đơn</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Ngoại tệ</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Tiền công</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Phải trả</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Đã trả</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Còn nợ</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Thu khách</th>
              <th className="px-4 py-2.5 text-right font-semibold text-gray-500">Lãi/Lỗ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">Đang tải…</td></tr>
            )}
            {!isLoading && (data?.theoNcc?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  Chưa có đơn nào nhập giá nhà cung cấp trong khoảng này.
                </td>
              </tr>
            )}
            {(data?.theoNcc ?? []).map((r) => (
              <tr key={r.NCC_ID ?? 'chua-ro'}>
                <td className="px-4 py-2.5 font-medium">
                  {r.TenNhaCungCap || <span className="text-gray-400">Chưa chọn NCC</span>}
                </td>
                <td className="px-4 py-2.5 text-right">{soVn(r.soDon)}</td>
                <td className="px-4 py-2.5 text-right">{soVn(r.tongNgoaiTe)}</td>
                <td className="px-4 py-2.5 text-right">{soVn(r.tongCong)}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{soVn(r.tongPhaiTra)}</td>
                <td className="px-4 py-2.5 text-right text-emerald-700">{soVn(r.daTra)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-amber-700">{soVn(r.tongPhaiTra - r.daTra)}</td>
                <td className="px-4 py-2.5 text-right">{soVn(r.tongThuKhach)}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${r.laiLo < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {soVn(r.laiLo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Không theo đơn: trả gộp, tự trừ đơn cũ nhất của NCC đó */}
      <TraGop
        key={nccId}
        dsNcc={dsNcc}
        soDu={soDu}
        nccMacDinh={nccId}
        onXong={() => setPhienBan((v) => v + 1)}
      />

      {/* Theo đơn: tick dòng ở bảng dưới, rồi ghi ở thanh này */}
      {chon.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-end gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
          <div className="text-sm text-emerald-900">
            Đã tick <b>{chon.size}</b> đơn
            {nccDangChon !== null && (
              <> của <b>{dsNcc.find((n) => n.NhaCungCapID === nccDangChon)?.TenNhaCungCap ?? nccDangChon}</b></>
            )}{' '}
            — tổng <b>{soVn(tongChon)}đ</b>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-emerald-800">Ngày thanh toán</label>
            <input
              type="date"
              value={ngayTra}
              onChange={(e) => setNgayTra(e.target.value)}
              className="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-emerald-800">Ghi chú</label>
            <input
              value={ghiChuTra}
              onChange={(e) => setGhiChuTra(e.target.value)}
              placeholder="vd: CK Vietcombank 23/10"
              className="w-full rounded-lg border border-emerald-200 px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => { setThongBao(null); traTheoDon.mutate(); }}
            disabled={traTheoDon.isPending || tongChon <= 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {traTheoDon.isPending ? 'Đang ghi…' : 'Ghi đã thanh toán'}
          </button>
          <button type="button" onClick={boChon} className="rounded-lg border border-emerald-300 px-3 py-2 text-sm text-emerald-800">
            Bỏ chọn
          </button>
        </div>
      )}
      {thongBao && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${thongBao.loai === 'ok' ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'border border-red-200 bg-red-50 text-red-700'}`}
        >
          {thongBao.noiDung}
        </div>
      )}

      {/* Chi tiết từng đơn */}
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-gray-700">
            Chi tiết từng đơn ({soVn(data?.chiTiet?.total)})
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
            >
              Trước
            </button>
            <span className="text-gray-500">
              {page}/{Math.max(1, Math.ceil((data?.chiTiet?.total ?? 0) / 100))}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil((data?.chiTiet?.total ?? 0) / 100)}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
        <table className="min-w-full divide-y divide-gray-100 text-xs">
          <thead className="bg-gray-50">
            <tr>
              {['Trả', 'Mã ĐH', 'Ngày mua', 'Khách', 'Nhà cung cấp', 'Tuyến', 'Ngoại tệ', '% Công', 'Tỷ giá', 'Phải trả', 'Đã trả', 'Còn nợ', 'Thu khách', 'Lãi/Lỗ', 'Tracking NCC', 'Trạng thái'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(data?.chiTiet?.data ?? []).map((r) => {
              const no = conNoDon(r);
              const daDu = no < 1;
              const khacNcc = nccDangChon !== null && nccDangChon !== r.NCC_ID;
              const dangChon = chon.has(r.ID);
              return (
              <tr key={r.ID} className={dangChon ? 'bg-emerald-50/60' : ''}>
                <td className="px-3 py-2">
                  {daDu ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Đã trả</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={dangChon}
                        disabled={khacNcc || r.NCC_ID === null}
                        title={khacNcc ? 'Mỗi lần ghi chỉ cho một nhà cung cấp' : 'Tick để ghi đã thanh toán'}
                        onChange={() => tick(r)}
                      />
                      {dangChon && (
                        <OTien
                          giaTri={chon.get(r.ID) ?? 0}
                          doi={(n) => setChon(new Map(chon).set(r.ID, n))}
                          className="w-28"
                        />
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">{r.ordernumber || r.ID}</td>
                <td className="px-3 py-2">
                  {r.ngayMua ? new Date(r.ngayMua).toLocaleDateString('vi-VN') : '-'}
                </td>
                <td className="px-3 py-2">{r.username || '-'}</td>
                <td className="px-3 py-2">{r.TenNhaCungCap || '-'}</td>
                <td className="px-3 py-2">{r.TenQuocGia || '-'}</td>
                <td className="px-3 py-2 text-right">
                  {soVn(r.NCC_NgoaiTe)} {r.loaitien || ''}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.NCC_Cong === null || r.NCC_Cong === undefined ? '-' : `${soVn(r.NCC_Cong)}%`}
                </td>
                <td className="px-3 py-2 text-right">{soVn(r.NCC_TyGia)}</td>
                <td className="px-3 py-2 text-right font-semibold">{soVn(r.NCC_TongPhaiTra)}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{r.NCC_DaTra ? soVn(r.NCC_DaTra) : '-'}</td>
                <td className={`px-3 py-2 text-right font-semibold ${daDu ? 'text-gray-300' : 'text-amber-700'}`}>{soVn(no)}</td>
                <td className="px-3 py-2 text-right">{soVn(r.tongtienVND)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${(r.NCC_LaiLo ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {soVn(r.NCC_LaiLo)}
                </td>
                <td className="px-3 py-2">{r.NCC_Tracking || '-'}</td>
                <td className="px-3 py-2">{r.trangthaiOrder || '-'}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SoPhieu
        nccId={nccId ? Number(nccId) : undefined}
        tuNgay={tuNgay}
        denNgay={denNgay}
        phienBan={phienBan}
        onDoi={() => setPhienBan((v) => v + 1)}
      />
    </div>
  );
}
