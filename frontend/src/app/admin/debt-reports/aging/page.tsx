'use client';

export const dynamic = 'force-dynamic';

import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiAlertCircle, FiClock, FiUsers } from 'react-icons/fi';
import {
  getTuoiNoChiTiet,
  getTuoiNoDanhSach,
  getTuoiNoTongHop,
  type TuoiNoDong,
} from '@/lib/api';

/**
 * Báo cáo TUỔI NỢ.
 *
 * PLE đã có 9 màn báo cáo công nợ, nhưng tất cả chỉ hiện SỐ DƯ — không màn nào
 * trả lời được "ai nợ LÂU nhất". Màn này chia nợ theo tuổi để thấy khoản nào
 * đang già đi, vì nợ càng già càng khó đòi.
 *
 * Tiền thu được khấu vào khoản nợ CŨ TRƯỚC (FIFO), đúng cách kế toán vẫn làm.
 */

const tien = (v: number) => (Math.round(v) || 0).toLocaleString('vi-VN') + 'đ';
const tienNgan = (v: number) => {
  const n = Math.round(v) || 0;
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + ' tỷ';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr';
  return n.toLocaleString('vi-VN');
};

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
  const tyLeGia = t && t.tongConNo > 0 ? Math.round((t.tren90 / t.tongConNo) * 100) : 0;

  /** Thanh chia tỷ lệ bốn nhóm tuổi của một khách. */
  const Thanh = ({ d }: { d: TuoiNoDong }) => {
    const p = (v: number) => (d.tong > 0 ? (v / d.tong) * 100 : 0);
    return (
      <div className="flex h-2 w-28 overflow-hidden rounded bg-gray-100" title="0-30 / 31-60 / 61-90 / >90 ngày">
        <div className="bg-emerald-500" style={{ width: `${p(d.n0_30)}%` }} />
        <div className="bg-amber-400" style={{ width: `${p(d.n31_60)}%` }} />
        <div className="bg-orange-500" style={{ width: `${p(d.n61_90)}%` }} />
        <div className="bg-red-600" style={{ width: `${p(d.tren90)}%` }} />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#14264b]">Tuổi nợ</h1>
        <p className="mt-1 text-sm text-gray-500">
          Công nợ còn lại chia theo thời gian. Tiền thu được khấu vào khoản nợ cũ trước, nên nợ già
          không bị che bởi phát sinh mới.
        </p>
      </div>

      {tongHop.isLoading ? (
        <div className="p-6 text-sm text-gray-500">Đang tải…</div>
      ) : tongHop.error ? (
        <div className="p-6 text-sm text-red-600">{(tongHop.error as Error).message}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <O
              nhan="Tổng còn nợ"
              giaTri={tien(t?.tongConNo ?? 0)}
              phu={`${t?.soKhachConNo ?? 0} khách`}
              mau="border-gray-200 bg-white text-[#14264b]"
            />
            <O
              nhan="Quá 90 ngày"
              giaTri={tien(t?.tren90 ?? 0)}
              phu={`${tyLeGia}% tổng nợ — khó đòi nhất`}
              mau="border-red-300 bg-red-50 text-red-700"
            />
            <O
              nhan="Trong 30 ngày"
              giaTri={tien(t?.n0_30 ?? 0)}
              phu="Nợ mới, bình thường"
              mau="border-emerald-200 bg-emerald-50 text-emerald-700"
            />
          </div>

          {/* Dải phân bố bốn nhóm tuổi trên toàn bộ công nợ. */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 font-medium text-[#14264b]">Phân bố theo tuổi nợ</div>
            <div className="flex h-7 overflow-hidden rounded">
              {[
                { nhan: '0-30 ngày', v: t?.n0_30 ?? 0, mau: 'bg-emerald-500' },
                { nhan: '31-60 ngày', v: t?.n31_60 ?? 0, mau: 'bg-amber-400' },
                { nhan: '61-90 ngày', v: t?.n61_90 ?? 0, mau: 'bg-orange-500' },
                { nhan: 'Trên 90 ngày', v: t?.tren90 ?? 0, mau: 'bg-red-600' },
              ].map((x) => (
                <div
                  key={x.nhan}
                  className={x.mau}
                  style={{ width: `${t && t.tongConNo > 0 ? (x.v / t.tongConNo) * 100 : 0}%` }}
                  title={`${x.nhan}: ${tien(x.v)}`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
              {[
                { nhan: '0-30 ngày', v: t?.n0_30 ?? 0, mau: 'bg-emerald-500' },
                { nhan: '31-60 ngày', v: t?.n31_60 ?? 0, mau: 'bg-amber-400' },
                { nhan: '61-90 ngày', v: t?.n61_90 ?? 0, mau: 'bg-orange-500' },
                { nhan: 'Trên 90 ngày', v: t?.tren90 ?? 0, mau: 'bg-red-600' },
              ].map((x) => (
                <span key={x.nhan} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2.5 w-3 rounded-sm ${x.mau}`} />
                  {x.nhan}: <strong>{tienNgan(x.v)}</strong>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="font-medium text-[#14264b]">Khách còn nợ</div>
          <div className="flex gap-1 rounded-lg border border-gray-300 p-0.5">
            {([
              ['gia', 'Nợ già nhất', <FiClock key="a" size={14} />],
              ['tien', 'Nợ nhiều nhất', <FiAlertCircle key="b" size={14} />],
            ] as const).map(([k, nhan, icon]) => (
              <button
                key={k}
                onClick={() => setSapTheo(k)}
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

        {danhSach.isLoading ? (
          <div className="p-6 text-sm text-gray-500">Đang tải…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="p-3">Khách</th>
                  <th className="p-3 text-right">Còn nợ</th>
                  <th className="p-3 text-center">Phân bố tuổi</th>
                  <th className="p-3 text-right">Khoản cũ nhất</th>
                  <th className="p-3 text-right">Quá 90 ngày</th>
                  <th className="p-3 text-right">Phát sinh cuối</th>
                </tr>
              </thead>
              <tbody>
                {(danhSach.data ?? []).map((d) => (
                  // Fragment phải có key: nó là phần tử gốc của mỗi vòng lặp,
                  // đặt key ở <tr> bên trong thì React vẫn cảnh báo thiếu key.
                  <Fragment key={d.khach}>
                    <tr
                      onClick={() => setDangMo(dangMo === d.khach ? null : d.khach)}
                      className="cursor-pointer border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="p-3 font-medium text-gray-800">{d.khach.trim()}</td>
                      <td className="p-3 text-right font-medium">{tien(d.tong)}</td>
                      <td className="p-3">
                        <div className="flex justify-center">
                          <Thanh d={d} />
                        </div>
                      </td>
                      <td
                        className={
                          'p-3 text-right ' + (d.soNgayCuNhat > 90 ? 'font-medium text-red-600' : '')
                        }
                      >
                        {d.soNgayCuNhat} ngày
                      </td>
                      <td className="p-3 text-right text-red-600">
                        {d.tren90 > 0 ? tien(d.tren90) : '—'}
                      </td>
                      <td className="p-3 text-right text-gray-500">
                        {d.lanCuoi ? new Date(d.lanCuoi).toLocaleDateString('vi-VN') : '—'}
                      </td>
                    </tr>
                    {dangMo === d.khach && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="p-4">
                          {chiTiet.isLoading ? (
                            <span className="text-sm text-gray-500">Đang tải chi tiết…</span>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-gray-500">
                                  <th className="py-1">Ngày ghi nợ</th>
                                  <th className="py-1">Nội dung</th>
                                  <th className="py-1 text-right">Còn lại</th>
                                  <th className="py-1 text-right">Tuổi</th>
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
                                    <td
                                      className={
                                        'py-1.5 text-right ' +
                                        (c.soNgay > 90 ? 'font-medium text-red-600' : 'text-gray-500')
                                      }
                                    >
                                      {c.soNgay} ngày
                                    </td>
                                  </tr>
                                ))}
                                {!(chiTiet.data ?? []).length && (
                                  <tr>
                                    <td colSpan={4} className="py-2 text-gray-500">
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
                    <td colSpan={6} className="p-6 text-center text-gray-500">
                      <FiUsers className="mx-auto mb-2" size={20} />
                      Không có khách nào còn nợ.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
