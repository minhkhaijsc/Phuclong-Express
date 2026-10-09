'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiPackage, FiTrendingUp, FiMap, FiCreditCard, FiInfo } from 'react-icons/fi';
import { useAuth } from '@/hooks/use-auth-context';
import { getTongQuanKhach, getDanhSachKhachCoDuLieu } from '@/lib/api';
import { BarChartNgang } from '@/app/components/bieu-do/bar-chart-ngang';
import { BarChartThang } from '@/app/components/bieu-do/bar-chart-thang';

/**
 * TỔNG QUAN — màn chính khách hàng đăng nhập vào xem.
 *
 * Ba khối theo yêu cầu kinh doanh: sản lượng các tuyến, sản lượng tổng, công
 * nợ theo tháng — tất cả ở dạng sơ đồ để khách nhìn một cái là hiểu.
 *
 * KHÔNG có ô nhập username ở đây. Máy chủ lấy từ JWT; màn này chỉ hỏi "của
 * tôi". Ô chọn khách chỉ hiện với tài khoản Admin, để CSKH xem đúng thứ khách
 * đang thấy khi khách gọi lên hỏi.
 *
 * THƯỚC ĐO là KG — đây là cách bên vận hành hiểu chữ "sản lượng", và là thứ
 * khách trả tiền theo. Số kiện vẫn hiện nhưng chỉ là số phụ.
 *
 * Lấy được kg không đơn giản: cột `CONGNO.SanLuong` mới có từ 06/2026, trước
 * đó CSKH gõ kg vào ô ghi chú, lại dính vài dòng mất dấu thập phân. Toàn bộ
 * luật đọc nằm ở `backend/src/dashboard/san-luong-kg.ts`. Màn này chỉ cần biết
 * một điều: có `soDongThieuKg` dòng không đo được, và PHẢI nói ra con số đó.
 */

const MAU = {
  kg: '#14264b',
  phatSinh: '#dc2626',
  daTra: '#16a34a',
  duNo: '#f59e0b',
};

const tien = (v: number) => `${Math.round(v).toLocaleString('vi-VN')}đ`;
// Một chữ số lẻ là đủ: cân đến gram thì "1.729,18 kg" dài mà không ai dùng tới
// số thứ hai; hoá đơn vẫn tính trên số gốc, đây chỉ là chỗ nhìn tổng quan.
const kg = (v: number) => `${v.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg`;

const CHON_THANG = [
  { gt: 6, nhan: '6 tháng' },
  { gt: 12, nhan: '12 tháng' },
  { gt: 24, nhan: '24 tháng' },
];

export default function TongQuanPage() {
  const { user, isLoading: dangTaiAuth } = useAuth();
  const laAdmin = user?.roles?.includes('Admin') ?? false;

  const [soThang, setSoThang] = useState(12);
  /** Chỉ Admin dùng: xem hộ màn của một khách khác. */
  const [khachXemHo, setKhachXemHo] = useState('');

  const q = useQuery({
    queryKey: ['tong-quan-khach', soThang, khachXemHo],
    queryFn: () => getTongQuanKhach(soThang, khachXemHo || undefined),
    enabled: !dangTaiAuth && Boolean(user?.username),
  });

  const dsKhach = useQuery({
    queryKey: ['khach-co-du-lieu'],
    queryFn: () => getDanhSachKhachCoDuLieu(),
    enabled: laAdmin,
  });

  const d = q.data;
  const sl = d?.soLieu;

  const duLieuTuyen = useMemo(
    () => (d?.theoTuyen ?? []).map((t) => ({ nhan: t.tenQuocGia, giaTri: t.soKg })),
    [d?.theoTuyen],
  );


  const duNo = sl?.duNo ?? 0;
  const traTruoc = duNo < 0;

  if (dangTaiAuth) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-400">Đang tải…</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#14264b]">Tổng quan</h1>
          <p className="text-sm text-gray-500 mt-1">
            Mã khách: <span className="font-semibold">{d?.khach ?? user?.username}</span>
            {sl?.lanGuiGanNhat && (
              <>
                {' · '}Lần gửi gần nhất:{' '}
                {new Date(sl.lanGuiGanNhat).toLocaleDateString('vi-VN')}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {laAdmin && (
            <select
              value={khachXemHo}
              onChange={(e) => setKhachXemHo(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm bg-amber-50 border-amber-300"
              title="Chỉ Admin thấy ô này — xem màn của một khách khác"
            >
              <option value="">— Màn của tôi —</option>
              {/*
                Nhãn ghi NGÀY GẦN NHẤT, không ghi số kiện: danh sách này đếm 12
                tháng tính từ hôm nay, còn ô số trên màn đếm từ đầu tháng của 12
                tháng trước — hai cửa sổ lệch nhau ~3 tuần nên hai con số không
                bao giờ khớp (HP646: 7.084 ở đây mà 6.357 ở ô số). Hai số đá
                nhau ngay cạnh nhau thì người dùng mất lòng tin vào cả màn.
              */}
              {(dsKhach.data ?? []).map((k) => (
                <option key={k.khach} value={k.khach}>
                  {k.khach}
                  {k.lanCuoi ? ` — ${new Date(k.lanCuoi).toLocaleDateString('vi-VN')}` : ''}
                </option>
              ))}
            </select>
          )}
          <div className="inline-flex rounded border overflow-hidden">
            {CHON_THANG.map((c) => (
              <button
                key={c.gt}
                onClick={() => setSoThang(c.gt)}
                className={`px-3 py-1.5 text-sm ${
                  soThang === c.gt ? 'bg-[#14264b] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {c.nhan}
              </button>
            ))}
          </div>
        </div>
      </div>

      {q.isError && (
        <div className="mb-6 p-4 rounded border border-red-200 bg-red-50 text-sm text-red-700">
          Không tải được số liệu. Thử lại sau hoặc liên hệ nhân viên phụ trách.
        </div>
      )}

      {/* ---- Bốn ô số ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <OSo
          nhan={`Sản lượng (${soThang} tháng)`}
          giaTri={q.isLoading ? '…' : kg(sl?.soKg ?? 0)}
          phu={sl ? `${sl.soKien.toLocaleString('vi-VN')} kiện` : undefined}
          icon={<FiPackage />}
        />
        <OSo
          nhan="Sản lượng 30 ngày gần nhất"
          giaTri={q.isLoading ? '…' : kg(sl?.soKg30Ngay ?? 0)}
          icon={<FiTrendingUp />}
        />
        <OSo
          nhan="Tuyến đang dùng"
          giaTri={q.isLoading ? '…' : String(sl?.soTuyen ?? 0)}
          icon={<FiMap />}
        />
        {/*
          Số dư ÂM nghĩa là khách đã trả nhiều hơn phát sinh (HP3028 đang âm
          12,9 tr). Đổi hẳn nhãn và màu theo dấu, chứ hiện "Dư nợ: -12.906.335đ"
          thì khách đọc không hiểu mình đang nợ hay không.
        */}
        <OSo
          nhan={traTruoc ? 'Số dư trả trước' : 'Dư nợ hiện tại'}
          giaTri={q.isLoading ? '…' : tien(Math.abs(duNo))}
          phu={traTruoc ? 'Khách đang dư có' : duNo > 0 ? 'Cần thanh toán' : 'Đã cân đối'}
          icon={<FiCreditCard />}
          mau={traTruoc ? 'text-green-600' : duNo > 0 ? 'text-red-600' : 'text-gray-700'}
        />
      </div>

      {/*
        `items-start`: không có nó thì lưới kéo hai thẻ cao bằng nhau, mà thẻ
        tuyến chỉ cao theo số tuyến (khách 2 tuyến thì ~160px) — kết quả là một
        mảng trắng to bằng nửa thẻ.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-start">
        <Khoi
          tieuDe="Sản lượng theo tuyến"
          moTa={`Số kg mỗi tuyến trong ${soThang} tháng gần nhất`}
        >
          <BarChartNgang
            data={duLieuTuyen}
            valueFormatter={kg}
            hienTyTrong
            loading={q.isLoading}
            emptyMessage="Chưa có hàng nào được cân trong khoảng này"
          />
        </Khoi>

        <Khoi tieuDe="Sản lượng tổng theo tháng" moTa="Tổng số kg từng tháng">
          <BarChartThang
            data={(d?.theoThang ?? []) as any}
            cot={[{ key: 'soKg', nhan: 'Sản lượng', mau: MAU.kg }]}
            dinhDang={kg}
            hienSoTrenCot
            dangTai={q.isLoading}
          />
          {/*
            Nói thẳng khi có dòng không đo được, thay vì lặng lẽ cộng thiếu.
            Toàn hệ có 9,3% dòng cân không ghi kg ở đâu cả.
          */}
          {!!sl?.soDongThieuKg && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600">
              <FiInfo className="mt-0.5 shrink-0" />
              {sl.soDongThieuKg} dòng cân chưa ghi số kg nên không tính vào tổng. Cần đối
              chiếu thì xem bảng cân đối công nợ hoặc báo nhân viên phụ trách.
            </p>
          )}
        </Khoi>
      </div>

      {/* ---- Công nợ theo tháng ---- */}
      <Khoi
        tieuDe="Công nợ theo tháng"
        moTa="Cột: phát sinh và đã trả trong tháng. Đường: số còn lại cuối mỗi tháng (trục phải)"
      >
        <BarChartThang
          data={(d?.theoThang ?? []) as any}
          cot={[
            { key: 'phatSinh', nhan: 'Phát sinh', mau: MAU.phatSinh },
            { key: 'daTra', nhan: 'Đã trả', mau: MAU.daTra },
          ]}
          duong={{ key: 'duNoCuoiThang', nhan: 'Còn lại cuối tháng', mau: MAU.duNo }}
          dinhDang={tien}
          height={320}
          dangTai={q.isLoading}
        />
        {sl && !q.isLoading && (
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm text-gray-600">
            <span>
              Tổng phát sinh từ đầu: <strong>{tien(sl.tongPhatSinh)}</strong>
            </span>
            <span>
              Tổng đã trả: <strong>{tien(sl.tongDaTra)}</strong>
            </span>
            <span>
              {traTruoc ? 'Dư có' : 'Còn lại'}:{' '}
              <strong className={traTruoc ? 'text-green-600' : duNo > 0 ? 'text-red-600' : ''}>
                {tien(Math.abs(duNo))}
              </strong>
            </span>
          </div>
        )}
        {/*
          Đường lũy kế tính từ TRƯỚC khoảng đang xem, nên đổi 12 -> 6 tháng
          không làm đường tụt về 0. Nói rõ để khách không tưởng số bị sai.
        */}
        <p className="mt-2 text-xs text-gray-400">
          Số còn lại đã tính cả nợ phát sinh trước khoảng thời gian đang xem.
        </p>
      </Khoi>
    </div>
  );
}

function OSo({
  nhan,
  giaTri,
  phu,
  icon,
  mau = 'text-[#14264b]',
}: {
  nhan: string;
  giaTri: string;
  phu?: string;
  icon: React.ReactNode;
  mau?: string;
}) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 uppercase tracking-wide">{nhan}</p>
          <p className={`text-2xl font-bold mt-1 ${mau}`}>{giaTri}</p>
          {phu && <p className="text-xs text-gray-400 mt-0.5">{phu}</p>}
        </div>
        <span className="text-gray-300 text-xl shrink-0 ml-2">{icon}</span>
      </div>
    </div>
  );
}

function Khoi({
  tieuDe,
  moTa,
  children,
}: {
  tieuDe: string;
  moTa?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-lg border p-4">
      <h2 className="font-semibold text-[#14264b]">{tieuDe}</h2>
      {moTa && <p className="text-xs text-gray-500 mb-3">{moTa}</p>}
      {children}
    </section>
  );
}
