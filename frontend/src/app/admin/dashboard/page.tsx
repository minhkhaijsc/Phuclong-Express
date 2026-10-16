'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiUsers, FiDollarSign, FiPackage, FiShoppingBag } from 'react-icons/fi';
import { KPICard } from '@/app/components/admin';
import { useQuyen } from '@/hooks/use-quyen';
import {
  getVanHanhSoLieu,
  getVanHanhTheoNgay,
  getVanHanhTheoTuyen,
  getVanHanhTopKhach,
  getDashboardNewCustomers,
  getDashboardRevenue,
  getDashboardOutputDaily,
  getVanHanhTuyen,
  getDashboardOutputByRoute,
} from '@/lib/api';
import { downloadDataAsExcel } from '@/lib/excel-download';
import { FiDownload } from 'react-icons/fi';
import { DateRangeFilter } from './components/date-range-filter';
import { TabVanHanh } from './components/tab-van-hanh';
import { DailyTrendChart } from './components/daily-trend-chart';
import { StaffOutputTable } from './components/staff-output-table';
import { RouteOutputTable } from './components/route-output-table';

/** Khoảng mặc định: đầu→cuối tháng hiện tại (dd/MM/yyyy). */
const getDefaultRange = () => {
  const now = new Date();
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return {
    fromDate: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
    toDate: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

const fmtMoney = (v: number) => (v ?? 0).toLocaleString('vi-VN');
const fmtKg = (v: number) =>
  (v ?? 0).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const sumBy = <T,>(rows: T[] | undefined, key: keyof T): number =>
  (rows || []).reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

export default function DashboardPage() {
  /**
   * XÉT THEO QUYỀN, KHÔNG XÉT VAI TRÒ THÔ.
   *
   * Trước đây dòng này là `user?.roles?.includes('Admin')` rồi `router.replace
   * ('/login')` nếu không phải Admin. Ngày 15/10/2026 bên khách cho Kế toán và
   * MKT xem Dashboard: máy chủ đã mở, mục menu đã hiện, nhưng mở ra thì trang
   * tự đá về trang chủ — vì cái chốt Admin này còn nguyên. Tức là hai bộ phận
   * kia nhìn như được cấp quyền mà thực tế chưa vào được.
   *
   * `dashboard.xem` là đúng mã mà máy chủ đòi (@MienQuyen('dashboard') trên cả
   * DashboardController), nên hai bên không còn lệch nhau nữa; thêm bộ phận
   * sau này chỉ sửa BANG_QUYEN, không phải sửa trang.
   *
   * Và KHÔNG điều hướng nữa: đá về /login khi người ta ĐANG đăng nhập là vòng
   * tròn — /login lại đẩy tiếp ra trang chủ, người dùng không hiểu vừa xảy ra
   * chuyện gì. Hiện hẳn một ô "Không có quyền" như màn Sản lượng khách hàng.
   */
  const { co, dangNap } = useQuyen();
  const xemDuoc = co('dashboard.xem');

  const [draft, setDraft] = useState(getDefaultRange);
  const [applied, setApplied] = useState(draft);

  /**
   * Hai tab vì hai người đọc khác nhau.
   *
   * Vận hành cần biết HÔM NAY phải làm gì (kiện chưa có chủ, chưa có ảnh); quản
   * lý cần biết xu hướng kinh doanh. Gộp một màn thì ai cũng phải lọc qua thứ
   * không liên quan.
   */
  const [tab, setTab] = useState<'van-hanh' | 'kinh-doanh'>('van-hanh');
  const [quocGiaId, setQuocGiaId] = useState<number | undefined>();
  const [khach, setKhach] = useState('');
  const [khachDaApDung, setKhachDaApDung] = useState('');

  // Chỉ nạp danh sách tuyến CÓ dữ liệu — 10/13 nước trong danh mục chưa từng có
  // kiện nào, đổ hết vào ô lọc chỉ làm người dùng chọn nhầm rồi thấy trống.
  const tuyen = useQuery({ queryKey: ['vh-tuyen'], queryFn: getVanHanhTuyen, enabled: xemDuoc });

  const newCustomers = useQuery({
    queryKey: ['dashboard-new-customers', applied],
    queryFn: () => getDashboardNewCustomers(applied.fromDate, applied.toDate),
    enabled: xemDuoc,
  });
  const revenue = useQuery({
    queryKey: ['dashboard-revenue', applied],
    queryFn: () => getDashboardRevenue(applied.fromDate, applied.toDate),
    enabled: xemDuoc,
  });
  const output = useQuery({
    queryKey: ['dashboard-output-daily', applied],
    queryFn: () => getDashboardOutputDaily(applied.fromDate, applied.toDate),
    enabled: xemDuoc,
  });
  const totals = useMemo(
    () => ({
      khMoi: sumBy(newCustomers.data, 'soKHMoi'),
      doanhThu: sumBy(revenue.data, 'doanhThu'),
      soDon: sumBy(revenue.data, 'soDon'),
      sanLuong: sumBy(output.data, 'sanLuongKg'),
    }),
    [newCustomers.data, revenue.data, output.data],
  );

  /**
   * Xuất Excel đúng dữ liệu ĐANG XEM: theo tab, theo khoảng ngày và bộ lọc hiện
   * tại. Xuất cả một đống không theo bộ lọc thì người ta phải lọc lại bằng tay
   * trong Excel — mất hẳn ý nghĩa của mấy ô lọc trên màn.
   */
  const [dangXuat, setDangXuat] = useState(false);
  /**
   * Cộng dồn số thực trong JS đẻ ra đuôi rác: 2814.5082999999977.
   * Trên màn hình không thấy vì có bộ định dạng, nhưng vào Excel thì hiện
   * nguyên con — kế toán nhìn tưởng số liệu bẩn. Làm tròn 4 chữ số, đúng bằng
   * mức mà bảng trên màn đang hiển thị.
   */
  const lamTron4 = (v: number) => Math.round((v + Number.EPSILON) * 10000) / 10000;

  const xuatExcel = async () => {
    setDangXuat(true);
    try {
      const ky = `${applied.fromDate.replace(/\//g, '-')}_${applied.toDate.replace(/\//g, '-')}`;

      if (tab === 'kinh-doanh') {
        const rows: (string | number)[][] = [
          ['BÁO CÁO KINH DOANH', ''],
          ['Kỳ', `${applied.fromDate} - ${applied.toDate}`],
          [],
          ['Chỉ số', 'Giá trị'],
          ['Tổng KH mới', totals.khMoi],
          ['Tổng doanh thu (đ)', totals.doanhThu],
          ['Đơn hoàn tất', totals.soDon],
          ['Tổng sản lượng (kg)', lamTron4(totals.sanLuong)],
          [],
          ['CHI TIẾT THEO NGÀY'],
          ['Ngày', 'KH mới', 'Doanh thu (đ)', 'Sản lượng (kg)'],
        ];
        // Gộp ba chuỗi theo ngày vào một bảng — mỗi ngày một dòng, dễ đọc hơn
        // là ba bảng rời.
        const ngay = new Set<string>([
          ...(newCustomers.data ?? []).map((x) => x.ngay),
          ...(revenue.data ?? []).map((x) => x.ngay),
          ...(output.data ?? []).map((x) => x.ngay),
        ]);
        for (const n of [...ngay].sort()) {
          rows.push([
            n,
            (newCustomers.data ?? []).find((x) => x.ngay === n)?.soKHMoi ?? 0,
            (revenue.data ?? []).find((x) => x.ngay === n)?.doanhThu ?? 0,
            lamTron4((output.data ?? []).find((x) => x.ngay === n)?.sanLuongKg ?? 0),
          ]);
        }
        // Tổng theo tuyến: gọi lại API thay vì đọc cache của bảng trên màn —
        // người dùng có thể bấm Xuất trước khi bảng đó kịp tải xong.
        const theoTuyen = await getDashboardOutputByRoute(applied.fromDate, applied.toDate);
        rows.push([], ['SẢN LƯỢNG THEO TUYẾN'], ['Tuyến', 'Tháng', 'Số đơn', 'Sản lượng (kg)']);
        for (const t of theoTuyen) rows.push([t.tenTuyen, t.thang, t.soDon, lamTron4(t.sanLuongKg)]);
        rows.push([
          'Tổng tất cả tuyến',
          '',
          theoTuyen.reduce((a, t) => a + t.soDon, 0),
          lamTron4(theoTuyen.reduce((a, t) => a + t.sanLuongKg, 0)),
        ]);

        downloadDataAsExcel(rows, `Dashboard_KinhDoanh_${ky}.xlsx`);
      } else {
        // Tab vận hành: gọi lại API để lấy ĐỦ dữ liệu theo bộ lọc, không lấy từ
        // cache của biểu đồ (biểu đồ có thể đang hiện bản rút gọn).
        const [so, theoNgay, theoTuyen, topKhach] = await Promise.all([
          getVanHanhSoLieu(applied.fromDate, applied.toDate, quocGiaId, khachDaApDung || undefined),
          getVanHanhTheoNgay(applied.fromDate, applied.toDate, quocGiaId, khachDaApDung || undefined),
          getVanHanhTheoTuyen(applied.fromDate, applied.toDate, khachDaApDung || undefined),
          getVanHanhTopKhach(applied.fromDate, applied.toDate, quocGiaId, 100),
        ]);
        const rows: (string | number)[][] = [
          ['BÁO CÁO VẬN HÀNH', ''],
          ['Kỳ', `${applied.fromDate} - ${applied.toDate}`],
          ['Tuyến', quocGiaId ? String(quocGiaId) : 'Tất cả'],
          ['Khách hàng', khachDaApDung || 'Tất cả'],
          [],
          ['Chỉ số', 'Giá trị'],
          ['Kiện trong kỳ', so.kienTrongKy],
          ['Số khách', so.soKhach],
          ['Kiện chưa khớp được chủ', so.kienChuaCoChu],
          ['Tỷ lệ chưa có chủ (%)', so.tyLeChuaCoChu],
          ['Kiện chưa có ảnh', so.kienChuaCoAnh],
          [],
          ['KIỆN VỀ THEO NGÀY'],
          ['Ngày', 'Số kiện', 'Chưa có chủ'],
          ...theoNgay.map((x) => [x.ngay, x.soKien, x.chuaCoChu]),
          [],
          ['THEO TUYẾN'],
          ['Tuyến', 'Số kiện'],
          ...theoTuyen.map((x) => [x.tenQuocGia, x.soKien]),
          [],
          ['KHÁCH NHIỀU KIỆN NHẤT'],
          ['Khách', 'Số kiện', 'Lần gần nhất'],
          ...topKhach.map((x) => [
            x.khach,
            x.soKien,
            x.lanCuoi ? new Date(x.lanCuoi).toLocaleDateString('vi-VN') : '',
          ]),
        ];
        downloadDataAsExcel(rows, `Dashboard_VanHanh_${ky}.xlsx`);
      }
    } finally {
      setDangXuat(false);
    }
  };

  // Ẩn trước, hiện sau: `co()` trả false trong lúc còn nạp quyền, nên phải chờ
  // `dangNap` xong mới được kết luận là không có quyền.
  if (dangNap) {
    return <div className="p-6 text-sm text-gray-500">Đang kiểm quyền…</div>;
  }
  if (!xemDuoc) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-base font-semibold text-amber-900">Không có quyền</h2>
        <p className="mt-1 text-sm text-amber-800">
          Trang này nằm trong Dashboard, chỉ mở cho Admin, Kế toán, MKT, Trưởng phòng và Giám đốc.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-bold text-[#14264b]">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {tab === 'van-hanh'
            ? 'Hàng về, kiện chưa khớp chủ, kiện chưa có ảnh — việc cần xử lý'
            : 'KH mới, doanh thu, sản lượng · sản lượng nhân viên theo tháng'}
        </p>
        </div>
        <button
          onClick={xuatExcel}
          disabled={dangXuat}
          className="flex items-center gap-2 rounded-lg bg-[#14264b] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <FiDownload size={16} />
          {dangXuat ? 'Đang xuất…' : `Xuất Excel ${tab === 'van-hanh' ? 'vận hành' : 'kinh doanh'}`}
        </button>
      </div>

      {/* Bốn số tổng đặt TRÊN tab, không nằm trong tab nào.
          Trước đó tôi để chúng trong tab Kinh doanh và để tab Vận hành làm mặc
          định — người dùng mở dashboard ra là không thấy mấy số vẫn xem hằng
          ngày nữa. Đây là thứ họ nhìn đầu tiên, không nên bắt bấm thêm một nhịp. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Tổng KH mới" value={totals.khMoi.toLocaleString('vi-VN')} icon={<FiUsers size={28} />} />
        <KPICard label="Tổng doanh thu" value={fmtMoney(totals.doanhThu)} unit="₫" icon={<FiDollarSign size={28} />} />
        <KPICard label="Đơn hoàn tất" value={totals.soDon.toLocaleString('vi-VN')} icon={<FiShoppingBag size={28} />} />
        <KPICard label="Tổng sản lượng" value={fmtKg(totals.sanLuong)} unit="kg" icon={<FiPackage size={28} />} />
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {([
          ['van-hanh', 'Vận hành'],
          ['kinh-doanh', 'Kinh doanh'],
        ] as const).map(([k, nhan]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={
              'px-4 py-2 text-sm font-medium -mb-px border-b-2 ' +
              (tab === k
                ? 'border-[#14264b] text-[#14264b]'
                : 'border-transparent text-gray-500 hover:text-gray-700')
            }
          >
            {nhan}
          </button>
        ))}
      </div>

      <DateRangeFilter
        fromDate={draft.fromDate}
        toDate={draft.toDate}
        onChange={setDraft}
        onSearch={() => {
          setApplied(draft);
          setKhachDaApDung(khach);
        }}
      />

      {tab === 'van-hanh' && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Tuyến</label>
            <select
              value={quocGiaId ?? ''}
              onChange={(e) => setQuocGiaId(e.target.value ? Number(e.target.value) : undefined)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Tất cả tuyến</option>
              {(tuyen.data ?? []).map((t) => (
                <option key={t.quocGiaId ?? 0} value={t.quocGiaId ?? 0}>
                  {t.tenQuocGia} ({t.soKien.toLocaleString('vi-VN')})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Khách hàng</label>
            <input
              value={khach}
              onChange={(e) => setKhach(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setKhachDaApDung(khach);
              }}
              placeholder="Mã khách, vd HP2668"
              className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={() => setKhachDaApDung(khach)}
            className="rounded-lg bg-[#14264b] px-4 py-2 text-sm font-medium text-white"
          >
            Lọc
          </button>
          {(quocGiaId || khachDaApDung) && (
            <button
              onClick={() => {
                setQuocGiaId(undefined);
                setKhach('');
                setKhachDaApDung('');
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
            >
              Bỏ lọc
            </button>
          )}
        </div>
      )}

      {tab === 'van-hanh' && (
        <TabVanHanh
          fromDate={applied.fromDate}
          toDate={applied.toDate}
          quocGiaId={quocGiaId}
          khach={khachDaApDung || undefined}
        />
      )}

      {tab === 'kinh-doanh' && (
        <>

      {/* Biểu đồ theo ngày */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DailyTrendChart
          title="Khách hàng mới / ngày"
          data={newCustomers.data || []}
          loading={newCustomers.isLoading}
          series={[{ key: 'soKHMoi', label: 'KH mới', color: '#2563eb' }]}
        />
        <DailyTrendChart
          title="Doanh thu / ngày (đơn hoàn tất)"
          data={revenue.data || []}
          loading={revenue.isLoading}
          series={[{ key: 'doanhThu', label: 'Doanh thu', color: '#16a34a' }]}
          valueFormatter={fmtMoney}
        />
        <DailyTrendChart
          title="Sản lượng (kg) / ngày"
          data={output.data || []}
          loading={output.isLoading}
          series={[{ key: 'sanLuongKg', label: 'Sản lượng', color: '#d97706' }]}
          valueFormatter={fmtKg}
        />
      </div>

      {/* Tổng theo tuyến trước, rồi mới tới chi tiết từng nhân viên — đọc từ
          khái quát xuống chi tiết, và tuyến là thứ được hỏi tới nhiều hơn. */}
      <RouteOutputTable fromDate={applied.fromDate} toDate={applied.toDate} />
      <StaffOutputTable fromDate={applied.fromDate} toDate={applied.toDate} />
        </>
      )}
    </div>
  );
}
