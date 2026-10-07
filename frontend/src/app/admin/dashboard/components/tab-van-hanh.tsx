'use client';

import { useQuery } from '@tanstack/react-query';
import { FiAlertTriangle, FiCamera, FiPackage, FiUsers } from 'react-icons/fi';
import {
  getVanHanhCanhBao,
  getVanHanhSoLieu,
  getVanHanhTheoNgay,
  getVanHanhTheoTuyen,
  getVanHanhTopKhach,
} from '@/lib/api';

/**
 * Tab VẬN HÀNH — việc phải làm, không phải số để ngắm.
 *
 * Hai con số đặt lên đầu vì chúng là việc tồn: kiện chưa khớp được chủ, và kiện
 * chưa có tấm ảnh nào. Cả hai đo trên tbTracking — mảng chiếm ~93% khối lượng
 * mà dashboard cũ không hề chạm tới.
 */

const so = (v: number | null | undefined) => (v ?? 0).toLocaleString('vi-VN');

/** Ngày dạng yyyy-MM-dd -> dd/MM. */
const ngayNgan = (s: string) => {
  const [, m, d] = s.split('-');
  return d && m ? `${d}/${m}` : s;
};

function The({
  nhan,
  giaTri,
  phu,
  icon,
  canhBao,
}: {
  nhan: string;
  giaTri: string;
  phu?: string;
  icon: React.ReactNode;
  canhBao?: boolean;
}) {
  return (
    <div
      className={
        'rounded-xl border p-4 ' +
        (canhBao ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white')
      }
    >
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className={canhBao ? 'text-amber-600' : 'text-[#14264b]'}>{icon}</span>
        {nhan}
      </div>
      <div className={'mt-1 text-2xl font-bold ' + (canhBao ? 'text-amber-700' : 'text-[#14264b]')}>
        {giaTri}
      </div>
      {phu ? <div className="mt-0.5 text-xs text-gray-500">{phu}</div> : null}
    </div>
  );
}

export function TabVanHanh({
  fromDate,
  toDate,
  quocGiaId,
  khach,
}: {
  fromDate?: string;
  toDate?: string;
  quocGiaId?: number;
  khach?: string;
}) {
  const khoa = [fromDate, toDate, quocGiaId, khach];

  const soLieu = useQuery({
    queryKey: ['vh-so-lieu', ...khoa],
    queryFn: () => getVanHanhSoLieu(fromDate, toDate, quocGiaId, khach),
  });
  const theoNgay = useQuery({
    queryKey: ['vh-theo-ngay', ...khoa],
    queryFn: () => getVanHanhTheoNgay(fromDate, toDate, quocGiaId, khach),
  });
  const theoTuyen = useQuery({
    queryKey: ['vh-theo-tuyen', fromDate, toDate, khach],
    queryFn: () => getVanHanhTheoTuyen(fromDate, toDate, khach),
  });
  const topKhach = useQuery({
    queryKey: ['vh-top-khach', fromDate, toDate, quocGiaId],
    queryFn: () => getVanHanhTopKhach(fromDate, toDate, quocGiaId, 10),
  });
  const canhBao = useQuery({ queryKey: ['vh-canh-bao'], queryFn: getVanHanhCanhBao });

  const d = soLieu.data;
  const tyLeCoAnh =
    d && d.kienTrongKy > 0
      ? Math.round(((d.kienTrongKy - d.kienChuaCoAnh) / d.kienTrongKy) * 100)
      : 0;

  const caoNhat = Math.max(1, ...(theoNgay.data ?? []).map((x) => x.soKien));

  return (
    <div className="space-y-5">
      {/* Cảnh báo chất lượng dữ liệu — hiện thẳng, không giấu. Số xấu mà đúng
          còn hơn dashboard đẹp mà giấu mất việc phải sửa. */}
      {(canhBao.data ?? []).length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 font-medium text-amber-800">
            <FiAlertTriangle /> Lưu ý về dữ liệu
          </div>
          <ul className="space-y-1.5">
            {(canhBao.data ?? []).map((c) => (
              <li key={c.muc} className="text-sm text-amber-900">
                <span className="font-medium">{c.muc}.</span> {c.noiDung}
              </li>
            ))}
          </ul>
        </div>
      )}

      {soLieu.isLoading ? (
        <div className="p-6 text-sm text-gray-500">Đang tải…</div>
      ) : soLieu.error ? (
        <div className="p-6 text-sm text-red-600">{(soLieu.error as Error).message}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <The
            nhan="Kiện trong kỳ"
            giaTri={so(d?.kienTrongKy)}
            phu={`${so(d?.soKhach)} khách · 7 ngày qua: ${so(d?.kien7Ngay)}`}
            icon={<FiPackage />}
          />
          {/* Không dùng thẻ "hôm nay": hàng về theo đợt nên nó hiện 0 gần như
              mọi hôm, trông như hỏng. */}
          <The
            nhan="Lần nhập gần nhất"
            giaTri={d?.ngayNhapGanNhat ? ngayNgan(d.ngayNhapGanNhat) : '—'}
            phu={
              d?.ngayNhapGanNhat
                ? `${so(d.kienLanGanNhat)} kiện · ${d.soNgayTuLanNhap === 0 ? 'hôm nay' : `${d.soNgayTuLanNhap} ngày trước`}`
                : 'Chưa có dữ liệu trong kỳ'
            }
            icon={<FiPackage />}
          />
          <The
            nhan="Kiện chưa khớp được chủ"
            giaTri={so(d?.kienChuaCoChu)}
            phu={`${d?.tyLeChuaCoChu ?? 0}% số kiện trong kỳ — cần gán khách`}
            icon={<FiUsers />}
            canhBao={(d?.tyLeChuaCoChu ?? 0) > 5}
          />
          <The
            nhan="Kiện chưa có ảnh"
            giaTri={so(d?.kienChuaCoAnh)}
            phu={`Mới có ảnh ${tyLeCoAnh}% số kiện`}
            icon={<FiCamera />}
            canhBao={tyLeCoAnh < 80}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Kiện về theo ngày, tách phần chưa có chủ để nhìn ra xu hướng. */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
          <div className="mb-3 font-medium text-[#14264b]">Kiện về theo ngày</div>
          {theoNgay.isLoading ? (
            <div className="text-sm text-gray-500">Đang tải…</div>
          ) : !(theoNgay.data ?? []).length ? (
            <div className="text-sm text-gray-500">Không có kiện nào trong kỳ đã chọn.</div>
          ) : (
            <div className="space-y-1.5">
              {(theoNgay.data ?? []).map((x) => (
                <div key={x.ngay} className="flex items-center gap-2 text-xs">
                  <span className="w-12 shrink-0 text-gray-500">{ngayNgan(x.ngay)}</span>
                  <div className="flex h-5 flex-1 overflow-hidden rounded bg-gray-100">
                    <div
                      className="bg-[#14264b]"
                      style={{ width: `${((x.soKien - x.chuaCoChu) / caoNhat) * 100}%` }}
                      title={`${so(x.soKien - x.chuaCoChu)} kiện đã có chủ`}
                    />
                    <div
                      className="bg-amber-400"
                      style={{ width: `${(x.chuaCoChu / caoNhat) * 100}%` }}
                      title={`${so(x.chuaCoChu)} kiện chưa có chủ`}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right font-medium text-gray-700">
                    {so(x.soKien)}
                  </span>
                </div>
              ))}
              <div className="pt-2 text-xs text-gray-500">
                <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#14264b]" /> đã có chủ
                <span className="ml-3 mr-1 inline-block h-2 w-3 rounded-sm bg-amber-400" /> chưa có chủ
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 font-medium text-[#14264b]">Theo tuyến</div>
          {theoTuyen.isLoading ? (
            <div className="text-sm text-gray-500">Đang tải…</div>
          ) : (
            <ul className="space-y-2">
              {(theoTuyen.data ?? []).map((x) => (
                <li key={String(x.quocGiaId)} className="flex justify-between text-sm">
                  <span className="text-gray-700">{x.tenQuocGia}</span>
                  <span className="font-medium text-[#14264b]">{so(x.soKien)}</span>
                </li>
              ))}
              {!(theoTuyen.data ?? []).length && (
                <li className="text-sm text-gray-500">Không có dữ liệu.</li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-1 font-medium text-[#14264b]">Khách nhiều kiện nhất</div>
        <div className="mb-3 text-xs text-gray-500">
          Đã loại tài khoản gom hàng chưa có chủ — nếu tính vào thì nó đứng đầu bảng mà nó không
          phải khách.
        </div>
        {topKhach.isLoading ? (
          <div className="text-sm text-gray-500">Đang tải…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-gray-500">
                <th className="py-2">Khách</th>
                <th className="py-2 text-right">Số kiện</th>
                <th className="py-2 text-right">Lần gần nhất</th>
              </tr>
            </thead>
            <tbody>
              {(topKhach.data ?? []).map((x) => (
                <tr key={x.khach} className="border-b last:border-0">
                  <td className="py-2 font-medium text-gray-800">{x.khach}</td>
                  <td className="py-2 text-right">{so(x.soKien)}</td>
                  <td className="py-2 text-right text-gray-500">
                    {x.lanCuoi ? new Date(x.lanCuoi).toLocaleDateString('vi-VN') : '—'}
                  </td>
                </tr>
              ))}
              {!(topKhach.data ?? []).length && (
                <tr>
                  <td colSpan={3} className="py-3 text-gray-500">
                    Không có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
