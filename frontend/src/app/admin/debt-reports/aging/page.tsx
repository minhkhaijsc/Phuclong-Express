'use client';

export const dynamic = 'force-dynamic';

import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiAlertCircle, FiClock, FiUpload, FiUsers } from 'react-icons/fi';
import {
  datTuoiNo,
  getTuoiNoChiTiet,
  getTuoiNoDanhSach,
  getTuoiNoTongHop,
  type TuoiNoDong,
} from '@/lib/api';
import { useQuyen } from '@/hooks/use-quyen';
import { NhapTuoiNoHangLoat } from '@/app/components/tuoi-no/nhap-hang-loat';

/**
 * Báo cáo TUỔI NỢ.
 *
 * PLE đã có 9 màn báo cáo công nợ, nhưng tất cả chỉ hiện SỐ DƯ — không màn nào
 * trả lời được "ai nợ LÂU nhất". Màn này chia nợ theo tuổi để thấy khoản nào
 * đang già đi, vì nợ càng già càng khó đòi.
 *
 * Tiền thu được khấu vào khoản nợ CŨ TRƯỚC (FIFO), đúng cách kế toán vẫn làm.
 *
 * TỪ 16/10/2026 mỗi khách có thể có TUỔI NỢ riêng — số ngày được phép nợ, đặt ở
 * màn chi tiết tài khoản. Khách có tuổi nợ thì ba nhóm dưới đây đếm theo số
 * ngày QUÁ HẠN; khách chưa đặt thì đếm thẳng từ ngày ghi nợ như trước.
 *
 * Ô "Chưa tới hạn" là bắt buộc, không phải trang trí: khoản của khách có tuổi
 * nợ mà chưa tới hạn thì không nằm trong nhóm nào cả. Bỏ ô đó đi là ba nhóm
 * cộng lại không ra tổng còn nợ, kế toán đối chiếu không khớp.
 *
 * ĐẶT TUỔI NỢ NGAY TẠI ĐÂY, không bắt sang màn tài khoản: người đặt là KẾ TOÁN,
 * mà kế toán không mở được danh sách tài khoản khách (đúng yêu cầu bên khách
 * 10/10). Bấm vào ô Tuổi nợ của từng dòng là sửa được tại chỗ.
 */

const tien = (v: number) => (Math.round(v) || 0).toLocaleString('vi-VN') + 'đ';
const tienNgan = (v: number) => {
  const n = Math.round(v) || 0;
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + ' tỷ';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr';
  return n.toLocaleString('vi-VN');
};

/** Một chỗ duy nhất định nghĩa tên và màu của bốn nhóm — dùng lại ở 3 nơi. */
const NHOM = [
  { khoa: 'chuaToiHan', nhan: 'Chưa tới hạn', mau: 'bg-slate-400' },
  { khoa: 'n0_30', nhan: 'Quá hạn ≤ 30 ngày', mau: 'bg-emerald-500' },
  { khoa: 'n31_60', nhan: 'Quá hạn 31-60 ngày', mau: 'bg-amber-400' },
  { khoa: 'tren60', nhan: 'Quá hạn > 60 ngày', mau: 'bg-red-600' },
] as const;

function O({ nhan, giaTri, phu, mau }: { nhan: string; giaTri: string; phu?: string; mau: string }) {
  return (
    <div className={`rounded-xl border p-4 ${mau}`}>
      <div className="text-sm text-gray-600">{nhan}</div>
      <div className="mt-1 text-2xl font-bold">{giaTri}</div>
      {phu ? <div className="mt-0.5 text-xs text-gray-500">{phu}</div> : null}
    </div>
  );
}

export default function TuoiNoPage() {
  const [sapTheo, setSapTheo] = useState<'gia' | 'tien'>('gia');
  const [dangMo, setDangMo] = useState<string | null>(null);
  /**
   * Vẽ hết 164 khách một lượt thành trang dài hơn 15.000px — cuộn mỏi tay mà
   * phần đáng xem chỉ nằm ở đầu. Hiện 30 dòng trước, ai cần thì bấm xem thêm.
   */
  const [soDongHien, setSoDongHien] = useState(30);

  /** Ai được đặt tuổi nợ: Admin, Kế toán, CSKH, Mua hàng. Kho thì không. */
  const { co } = useQuyen();
  const coDatTuoiNo = co('duyetCongNo');
  const [dangSua, setDangSua] = useState<string | null>(null);
  const [moNhap, setMoNhap] = useState(false);
  const [oNhap, setONhap] = useState('');
  const [loiDat, setLoiDat] = useState('');

  const qc = useQueryClient();

  /** Nạp lại cả ba truy vấn — đổi tuổi nợ là đổi cả cách chia nhóm. */
  const napLai = () => {
    qc.invalidateQueries({ queryKey: ['tuoi-no-tong-hop'] });
    qc.invalidateQueries({ queryKey: ['tuoi-no-danh-sach'] });
    qc.invalidateQueries({ queryKey: ['tuoi-no-chi-tiet'] });
  };
  const datMut = useMutation({
    mutationFn: ({ khach, tuoiNo }: { khach: string; tuoiNo: number | null }) =>
      datTuoiNo(khach, tuoiNo),
    onSuccess: () => {
      setDangSua(null);
      setLoiDat('');
      napLai();
    },
    onError: (e: any) => setLoiDat(e?.response?.data?.message || 'Không lưu được'),
  });

  const batDauSua = (d: TuoiNoDong) => {
    setDangSua(d.khach);
    setONhap(d.tuoiNo === null ? '' : String(d.tuoiNo));
    setLoiDat('');
  };

  const luuTuoiNo = (khach: string) => {
    const v = oNhap.trim();
    // Để trống = xoá thoả thuận, quay về đếm từ ngày ghi nợ.
    datMut.mutate({ khach: khach.trim(), tuoiNo: v === '' ? null : Number(v) });
  };

  const tongHop = useQuery({ queryKey: ['tuoi-no-tong-hop'], queryFn: getTuoiNoTongHop });
  const danhSach = useQuery({
    queryKey: ['tuoi-no-danh-sach', sapTheo],
    queryFn: () => getTuoiNoDanhSach(sapTheo, 200),
  });
  const chiTiet = useQuery({
    queryKey: ['tuoi-no-chi-tiet', dangMo],
    queryFn: () => getTuoiNoChiTiet(dangMo as string),
    enabled: !!dangMo,
  });

  const t = tongHop.data;
  const quaHan = t ? t.n0_30 + t.n31_60 + t.tren60 : 0;
  const tyLeGia = t && t.tongConNo > 0 ? Math.round((t.tren60 / t.tongConNo) * 100) : 0;

  /** Thanh chia tỷ lệ bốn nhóm của một khách. */
  const Thanh = ({ d }: { d: TuoiNoDong }) => (
    <div
      className="flex h-2 w-28 overflow-hidden rounded bg-gray-100"
      title={NHOM.map((n) => `${n.nhan}: ${tien(d[n.khoa])}`).join('\n')}
    >
      {NHOM.map((n) => (
        <div
          key={n.khoa}
          className={n.mau}
          style={{ width: `${d.tong > 0 ? (d[n.khoa] / d.tong) * 100 : 0}%` }}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#14264b]">Tuổi nợ</h1>
        <p className="mt-1 text-sm text-gray-500">
          Công nợ còn lại chia theo thời gian. Khách có đặt tuổi nợ thì tính theo số ngày quá hạn;
          khách chưa đặt thì tính từ ngày ghi nợ. Tiền thu được khấu vào khoản nợ cũ trước, nên nợ
          già không bị che bởi phát sinh mới.
        </p>
        {coDatTuoiNo && (
          <p className="mt-1 text-sm text-gray-400">
            Bấm vào ô <strong className="font-medium text-gray-500">Tuổi nợ</strong> của từng khách
            để đặt số ngày được nợ, hoặc dùng <strong className="font-medium text-gray-500">Đặt
            hàng loạt</strong> để nhập bằng Excel. Để trống nghĩa là chưa có thoả thuận; gõ{' '}
            <code>0</code> nghĩa là phải trả ngay.
          </p>
        )}
      </div>

      {tongHop.isLoading ? (
        <div className="p-6 text-sm text-gray-500">Đang tải…</div>
      ) : tongHop.error ? (
        <div className="p-6 text-sm text-red-600">{(tongHop.error as Error).message}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <O
              nhan="Tổng còn nợ"
              giaTri={tien(t?.tongConNo ?? 0)}
              phu={`${t?.soKhachConNo ?? 0} khách`}
              mau="border-gray-200 bg-white text-[#14264b]"
            />
            <O
              nhan="Đang quá hạn"
              giaTri={tien(quaHan)}
              phu="Đã tới hạn mà chưa trả"
              mau="border-amber-200 bg-amber-50 text-amber-700"
            />
            <O
              nhan="Quá hạn trên 60 ngày"
              giaTri={tien(t?.tren60 ?? 0)}
              phu={`${tyLeGia}% tổng nợ — khó đòi nhất`}
              mau="border-red-300 bg-red-50 text-red-700"
            />
            <O
              nhan="Chưa tới hạn"
              giaTri={tien(t?.chuaToiHan ?? 0)}
              phu="Còn trong tuổi nợ đã thoả thuận"
              mau="border-slate-200 bg-slate-50 text-slate-600"
            />
          </div>

          {/* Dải phân bố bốn nhóm trên toàn bộ công nợ. */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 font-medium text-[#14264b]">Phân bố theo tuổi nợ</div>
            <div className="flex h-7 overflow-hidden rounded">
              {NHOM.map((n) => (
                <div
                  key={n.khoa}
                  className={n.mau}
                  style={{ width: `${t && t.tongConNo > 0 ? ((t[n.khoa] ?? 0) / t.tongConNo) * 100 : 0}%` }}
                  title={`${n.nhan}: ${tien(t?.[n.khoa] ?? 0)}`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
              {NHOM.map((n) => (
                <span key={n.khoa} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2.5 w-3 rounded-sm ${n.mau}`} />
                  {n.nhan}: <strong>{tienNgan(t?.[n.khoa] ?? 0)}</strong>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {coDatTuoiNo && moNhap && (
        <NhapTuoiNoHangLoat
          danhSach={danhSach.data ?? []}
          onXong={napLai}
          onDong={() => setMoNhap(false)}
        />
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="font-medium text-[#14264b]">Khách còn nợ</div>
          <div className="flex items-center gap-2">
          {coDatTuoiNo && !moNhap && (
            <button
              onClick={() => setMoNhap(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              <FiUpload size={14} />
              Đặt hàng loạt
            </button>
          )}
          <div className="flex gap-1 rounded-lg border border-gray-300 p-0.5">
            {([
              ['gia', 'Quá hạn lâu nhất', <FiClock key="a" size={14} />],
              ['tien', 'Nợ nhiều nhất', <FiAlertCircle key="b" size={14} />],
            ] as const).map(([k, nhan, icon]) => (
              <button
                key={k}
                onClick={() => {
                  setSapTheo(k);
                  setSoDongHien(30);
                }}
                className={
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ' +
                  (sapTheo === k ? 'bg-[#14264b] text-white' : 'text-gray-600 hover:bg-gray-50')
                }
              >
                {icon}
                {nhan}
              </button>
            ))}
          </div>
          </div>
        </div>

        {danhSach.isLoading ? (
          <div className="p-6 text-sm text-gray-500">Đang tải…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="p-3">Khách</th>
                  <th className="p-3 text-center">Tuổi nợ</th>
                  <th className="p-3 text-right">Còn nợ</th>
                  <th className="p-3 text-center">Phân bố</th>
                  <th className="p-3 text-right">Quá hạn</th>
                  <th className="p-3 text-right">Trên 60 ngày</th>
                  <th className="p-3 text-right">Phát sinh cuối</th>
                </tr>
              </thead>
              <tbody>
                {(danhSach.data ?? []).slice(0, soDongHien).map((d) => (
                  // Fragment phải có key: nó là phần tử gốc của mỗi vòng lặp,
                  // đặt key ở <tr> bên trong thì React vẫn cảnh báo thiếu key.
                  <Fragment key={d.khach}>
                    <tr
                      onClick={() => setDangMo(dangMo === d.khach ? null : d.khach)}
                      className="cursor-pointer border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="p-3 font-medium text-gray-800">{d.khach.trim()}</td>
                      {/* Chưa đặt KHÁC 0 ngày: 0 là phải trả ngay. */}
                      <td
                        className="p-3 text-center text-gray-600"
                        // Ô này tự nuốt cú bấm — không thì bấm vào là bung
                        // luôn bảng chi tiết bên dưới.
                        onClick={(e) => e.stopPropagation()}
                      >
                        {dangSua === d.khach ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                autoFocus
                                placeholder="—"
                                value={oNhap}
                                onChange={(e) => setONhap(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') luuTuoiNo(d.khach);
                                  if (e.key === 'Escape') setDangSua(null);
                                }}
                                className="w-16 rounded border border-gray-300 px-1.5 py-1 text-center text-sm focus:border-[#14264b] focus:outline-none"
                              />
                              <button
                                onClick={() => luuTuoiNo(d.khach)}
                                disabled={datMut.isPending}
                                className="rounded bg-[#14264b] px-2 py-1 text-xs text-white disabled:opacity-50"
                              >
                                Lưu
                              </button>
                              <button
                                onClick={() => {
                                  setDangSua(null);
                                  setLoiDat('');
                                }}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
                              >
                                Huỷ
                              </button>
                            </div>
                            {loiDat ? <span className="text-xs text-red-600">{loiDat}</span> : null}
                          </div>
                        ) : coDatTuoiNo ? (
                          <button
                            onClick={() => batDauSua(d)}
                            title="Bấm để đặt số ngày được nợ"
                            className="rounded px-2 py-1 hover:bg-gray-100"
                          >
                            {d.tuoiNo === null ? (
                              <span className="text-gray-300">—</span>
                            ) : (
                              `${d.tuoiNo} ngày`
                            )}
                          </button>
                        ) : d.tuoiNo === null ? (
                          <span className="text-gray-300" title="Chưa đặt — tính từ ngày ghi nợ">
                            —
                          </span>
                        ) : (
                          `${d.tuoiNo} ngày`
                        )}
                      </td>
                      <td className="p-3 text-right font-medium">{tien(d.tong)}</td>
                      <td className="p-3">
                        <div className="flex justify-center">
                          <Thanh d={d} />
                        </div>
                      </td>
                      <td
                        className={
                          'p-3 text-right ' +
                          (d.soNgayQuaHan > 60
                            ? 'font-medium text-red-600'
                            : d.soNgayQuaHan > 0
                              ? 'text-gray-700'
                              : 'text-gray-400')
                        }
                        title={`Khoản cũ nhất: ${d.soNgayCuNhat} ngày kể từ ngày ghi nợ`}
                      >
                        {d.soNgayQuaHan > 0 ? `${d.soNgayQuaHan} ngày` : 'Chưa tới hạn'}
                      </td>
                      <td className="p-3 text-right text-red-600">
                        {d.tren60 > 0 ? tien(d.tren60) : '—'}
                      </td>
                      <td className="p-3 text-right text-gray-500">
                        {d.lanCuoi ? new Date(d.lanCuoi).toLocaleDateString('vi-VN') : '—'}
                      </td>
                    </tr>
                    {dangMo === d.khach && (
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="p-4">
                          {chiTiet.isLoading ? (
                            <span className="text-sm text-gray-500">Đang tải chi tiết…</span>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-gray-500">
                                  <th className="py-1">Ngày ghi nợ</th>
                                  <th className="py-1">Nội dung</th>
                                  <th className="py-1 text-right">Còn lại</th>
                                  <th className="py-1 text-right">Hạn trả</th>
                                  <th className="py-1 text-right">Quá hạn</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(chiTiet.data ?? []).map((c, i) => (
                                  <tr key={i} className="border-t border-gray-200">
                                    <td className="py-1.5">
                                      {c.ngay.split('-').reverse().join('/')}
                                    </td>
                                    <td className="py-1.5 text-gray-600">{c.noiDung || '—'}</td>
                                    <td className="py-1.5 text-right">{tien(c.conLai)}</td>
                                    <td className="py-1.5 text-right text-gray-500">
                                      {c.hanTra ? c.hanTra.split('-').reverse().join('/') : '—'}
                                    </td>
                                    <td
                                      className={
                                        'py-1.5 text-right ' +
                                        (c.soNgayQuaHan > 60
                                          ? 'font-medium text-red-600'
                                          : c.soNgayQuaHan > 0
                                            ? 'text-gray-700'
                                            : 'text-gray-400')
                                      }
                                      title={`Tuổi thật: ${c.soNgay} ngày`}
                                    >
                                      {c.soNgayQuaHan > 0
                                        ? `${c.soNgayQuaHan} ngày`
                                        : 'Chưa tới hạn'}
                                    </td>
                                  </tr>
                                ))}
                                {!(chiTiet.data ?? []).length && (
                                  <tr>
                                    <td colSpan={5} className="py-2 text-gray-500">
                                      Không có khoản nào.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!(danhSach.data ?? []).length && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-gray-500">
                      <FiUsers className="mx-auto mb-2" size={20} />
                      Không có khách nào còn nợ.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {(danhSach.data ?? []).length > soDongHien && (
              <div className="border-t p-3 text-center">
                <button
                  onClick={() => setSoDongHien((n) => n + 50)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Xem thêm — còn {(danhSach.data ?? []).length - soDongHien} khách
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
