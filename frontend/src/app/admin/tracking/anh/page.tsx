'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiCamera,
  FiCheck,
  FiCopy,
  FiFolder,
  FiImage,
  FiPause,
  FiRefreshCw,
  FiUpload,
} from 'react-icons/fi';
import {
  docFileKeoTha,
  khopTenFile,
  loiDeDoc,
  taiAnhLen,
  thuNhoAnh,
  type KetQuaKhop,
} from '@/lib/anh-tracking';
import { KhungXemAnh } from '@/app/components/tracking/xem-anh-tracking';

/**
 * Up ảnh tracking theo thư mục.
 *
 * Kho chụp ảnh hàng, đặt tên ảnh = số tracking (nhiều ảnh thì thêm đuôi _1, _2),
 * rồi up cả thư mục. Ảnh tự gắn vào tracking cùng số; ai tra tracking đó (trang
 * chủ, danh sách của khách, trang quản trị) đều xem được.
 *
 * Ảnh có thể ít hơn số tracking — tracking nào không có ảnh thì thôi.
 * Ảnh không tìm thấy tracking thì liệt kê ra để kho kiểm lại tên.
 */

type TrangThai = 'cho' | 'dang' | 'xong' | 'loi' | 'bo';
type Buoc = 'chon' | 'kiem' | 'xem' | 'tai' | 'xong';
type Loc = 'tat-ca' | 'khop' | 'khong-khop' | 'loi';

interface DongAnh {
  stt: number;
  file: File;
  ten: string;
  khop?: KetQuaKhop;
  /** Trùng tên với một file khác trong lần chọn này — chỉ lấy file đầu. */
  trungTrongLo: boolean;
  trangThai: TrangThai;
  loi?: string;
  thayThe?: number;
}

const DUOI_ANH = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i;
const SONG_SONG = 3;

const btnPrimary =
  'inline-flex items-center gap-2 rounded-xl bg-[#14264b] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm shadow-cyan-300/40 cursor-pointer';
const btnSecondary =
  'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';

const seDuocTai = (d: DongAnh) => !!d.khop?.tracking.length && !d.trungTrongLo;

export default function UpAnhTrackingPage() {
  const [buoc, setBuoc] = useState<Buoc>('chon');
  const [dong, setDong] = useState<DongAnh[]>([]);
  const [boQua, setBoQua] = useState(0);
  const [loc, setLoc] = useState<Loc>('tat-ca');
  const [keo, setKeo] = useState(false);
  const [loiKhop, setLoiKhop] = useState('');
  const [xem, setXem] = useState<{ src: string; ten: string } | null>(null);
  const [daChep, setDaChep] = useState(false);
  const dungRef = useRef(false);
  const thuMucRef = useRef<HTMLInputElement>(null);
  const nhieuAnhRef = useRef<HTMLInputElement>(null);

  // React không có thuộc tính webkitdirectory — gắn tay.
  useEffect(() => {
    thuMucRef.current?.setAttribute('webkitdirectory', '');
    thuMucRef.current?.setAttribute('directory', '');
  }, [buoc]);

  // Đang tải mà đóng tab thì hỏi lại.
  useEffect(() => {
    if (buoc !== 'tai') return;
    const chan = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', chan);
    return () => window.removeEventListener('beforeunload', chan);
  }, [buoc]);

  // Ảnh xem thử dùng object URL — nhớ thu hồi.
  useEffect(() => () => { if (xem) URL.revokeObjectURL(xem.src); }, [xem]);

  const nhanFile = async (files: File[]) => {
    const anh = files.filter((f) => DUOI_ANH.test(f.name));
    setBoQua(files.length - anh.length);
    setLoiKhop('');
    if (!anh.length) {
      setLoiKhop(files.length ? 'Không có file ảnh nào trong thứ vừa chọn.' : '');
      return;
    }
    anh.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const daGap = new Set<string>();
    const ds: DongAnh[] = anh.map((file, stt) => {
      const khoa = file.name.trim().toLowerCase();
      const trung = daGap.has(khoa);
      daGap.add(khoa);
      return { stt, file, ten: file.name, trungTrongLo: trung, trangThai: trung ? 'bo' : 'cho' };
    });
    setDong(ds);
    setBuoc('kiem');
    try {
      const kq = await khopTenFile(ds.map((d) => d.ten));
      setDong(ds.map((d, i) => {
        const khop = kq[i];
        const bo = d.trungTrongLo || !khop?.tracking.length;
        return { ...d, khop, trangThai: bo ? 'bo' : 'cho' };
      }));
      setLoc('tat-ca');
      setBuoc('xem');
    } catch (e) {
      setLoiKhop(`Không kiểm tra được tên ảnh: ${loiDeDoc(e)}`);
      setBuoc('chon');
    }
  };

  const chonLai = () => {
    setDong([]);
    setBoQua(0);
    setLoiKhop('');
    setBuoc('chon');
  };

  const taiLen = async (chiLoi = false) => {
    dungRef.current = false;
    const hangDoi = dong.filter((d) => seDuocTai(d) && (chiLoi ? d.trangThai === 'loi' : d.trangThai === 'cho'));
    if (!hangDoi.length) return;
    setBuoc('tai');
    setLoc(chiLoi ? 'loi' : 'tat-ca');

    const capNhat = (stt: number, thay: Partial<DongAnh>) =>
      setDong((cu) => cu.map((d) => (d.stt === stt ? { ...d, ...thay } : d)));

    let i = 0;
    const tho = async () => {
      while (i < hangDoi.length && !dungRef.current) {
        const d = hangDoi[i++];
        capNhat(d.stt, { trangThai: 'dang', loi: undefined });
        try {
          const blob = await thuNhoAnh(d.file);
          const kq = await taiAnhLen(blob, d.ten);
          capNhat(d.stt, { trangThai: 'xong', thayThe: kq.thayThe });
        } catch (e) {
          capNhat(d.stt, { trangThai: 'loi', loi: loiDeDoc(e) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SONG_SONG, hangDoi.length) }, tho));
    setBuoc('xong');
  };

  const dem = useMemo(() => {
    const khop = dong.filter(seDuocTai);
    const trackingIds = new Set(khop.flatMap((d) => d.khop!.tracking.map((t) => t.TrackingID)));
    const xong = dong.filter((d) => d.trangThai === 'xong');
    return {
      tong: dong.length,
      khop: khop.length,
      soTracking: trackingIds.size,
      khongKhop: dong.filter((d) => d.khop && !d.khop.tracking.length).length,
      trungTrongLo: dong.filter((d) => d.trungTrongLo).length,
      seThay: khop.filter((d) => d.khop!.trungTen).length,
      boDuoi: khop.filter((d) => d.khop!.boDuoi).length,
      nhieuDong: khop.filter((d) => d.khop!.tracking.length > 1).length,
      xong: xong.length,
      trackingXong: new Set(xong.flatMap((d) => d.khop!.tracking.map((t) => t.TrackingID))).size,
      daThay: xong.reduce((s, d) => s + (d.thayThe ?? 0), 0),
      loi: dong.filter((d) => d.trangThai === 'loi').length,
      dangCho: dong.filter((d) => d.trangThai === 'cho' || d.trangThai === 'dang').length,
    };
  }, [dong]);

  const hienThi = dong.filter((d) =>
    loc === 'khop' ? seDuocTai(d)
      : loc === 'khong-khop' ? !seDuocTai(d)
        : loc === 'loi' ? d.trangThai === 'loi'
          : true,
  );

  const chepKhongKhop = async () => {
    const ten = dong.filter((d) => d.khop && !d.khop.tracking.length).map((d) => d.ten).join('\n');
    try {
      await navigator.clipboard.writeText(ten);
      setDaChep(true);
      setTimeout(() => setDaChep(false), 2000);
    } catch {
      alert(ten);
    }
  };

  const phanTram = dem.khop ? Math.round(((dem.xong + dem.loi) / dem.khop) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">UP ẢNH TRACKING</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Up cả thư mục ảnh — tên ảnh là số tracking, ảnh tự gắn vào đúng tracking
          </p>
        </div>
        <Link
          href="/admin/tracking"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <FiArrowLeft className="h-4 w-4" /> Danh sách tracking
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 text-sm">
        <Link href="/admin/tracking" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100">
          Danh sách tracking
        </Link>
        <Link href="/admin/tracking/import" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100">
          Thêm mới tracking bằng excel
        </Link>
        <Link href="/admin/tracking/import?m=1" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100">
          Chỉnh sửa tracking bằng excel
        </Link>
        <span className="rounded-lg bg-[#14264b] px-3 py-1.5 text-white">Up ảnh tracking</span>
      </div>

      {/* Bước 1: chọn thư mục */}
      {(buoc === 'chon' || buoc === 'kiem') && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div
            onDragOver={(e) => { e.preventDefault(); setKeo(true); }}
            onDragLeave={() => setKeo(false)}
            onDrop={(e) => {
              e.preventDefault();
              setKeo(false);
              if (buoc === 'kiem') return;
              docFileKeoTha(e.dataTransfer).then(nhanFile).catch((err) => setLoiKhop(loiDeDoc(err)));
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-12 text-center transition-colors ${keo ? 'border-[#eb7325] bg-orange-50' : 'border-slate-200 bg-slate-50'}`}
          >
            {buoc === 'kiem' ? (
              <>
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#14264b] border-t-transparent" />
                <span className="text-sm font-medium text-slate-700">Đang đối chiếu {dong.length} ảnh với tracking…</span>
              </>
            ) : (
              <>
                <FiCamera className="h-9 w-9 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Kéo thả thư mục ảnh vào đây</span>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => thuMucRef.current?.click()} className={btnPrimary}>
                    <FiFolder className="h-4 w-4" /> Chọn thư mục ảnh
                  </button>
                  <button type="button" onClick={() => nhieuAnhRef.current?.click()} className={btnSecondary}>
                    <FiImage className="h-4 w-4" /> Chọn từng ảnh
                  </button>
                </div>
                <input
                  ref={thuMucRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; nhanFile(f); }}
                />
                <input
                  ref={nhieuAnhRef}
                  type="file"
                  multiple
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; nhanFile(f); }}
                />
              </>
            )}
          </div>

          {loiKhop && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <FiAlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {loiKhop}
            </div>
          )}

          <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="mb-1 font-medium text-slate-700">Cách đặt tên ảnh</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>Tên ảnh = số tracking: <code className="rounded bg-white px-1">1Z999AA10123456784.jpg</code></li>
              <li>Một tracking nhiều ảnh thì thêm đuôi: <code className="rounded bg-white px-1">…784_1.jpg</code>, <code className="rounded bg-white px-1">…784_2.jpg</code></li>
              <li>Up lại ảnh cùng tên sẽ <b>thay</b> ảnh cũ, không bị nhân đôi.</li>
              <li>Ảnh ít hơn số tracking cũng được; ảnh không tìm thấy tracking sẽ được liệt kê để kiểm lại.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Bước 2–4: xem trước, đang tải, xong */}
      {(buoc === 'xem' || buoc === 'tai' || buoc === 'xong') && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          {/* Tóm tắt */}
          <div className="mb-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">Ảnh đã chọn</div>
              <div className="text-lg font-bold text-slate-800">{dem.tong}</div>
              {boQua > 0 && <div className="text-xs text-slate-400">bỏ qua {boQua} file không phải ảnh</div>}
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2">
              <div className="text-xs text-emerald-600">Khớp tracking</div>
              <div className="text-lg font-bold text-emerald-700">{dem.khop} ảnh</div>
              <div className="text-xs text-emerald-600">vào {dem.soTracking} tracking</div>
            </div>
            <div className={`rounded-lg px-3 py-2 ${dem.khongKhop ? 'bg-amber-50' : 'bg-slate-50'}`}>
              <div className={`text-xs ${dem.khongKhop ? 'text-amber-700' : 'text-slate-500'}`}>Không có tracking</div>
              <div className={`text-lg font-bold ${dem.khongKhop ? 'text-amber-700' : 'text-slate-800'}`}>{dem.khongKhop}</div>
              {dem.khongKhop > 0 && (
                <button type="button" onClick={chepKhongKhop} className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline cursor-pointer">
                  <FiCopy className="h-3 w-3" /> {daChep ? 'Đã chép' : 'Chép danh sách tên'}
                </button>
              )}
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">Sẽ thay ảnh cũ cùng tên</div>
              <div className="text-lg font-bold text-slate-800">{dem.seThay}</div>
            </div>
          </div>

          {(dem.trungTrongLo > 0 || dem.nhieuDong > 0) && buoc === 'xem' && (
            <div className="mb-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {dem.trungTrongLo > 0 && (
                <p>
                  <FiAlertTriangle className="mr-1 inline h-4 w-4" />
                  {dem.trungTrongLo} ảnh trùng tên với ảnh khác trong thư mục (khác thư mục con) — chỉ lấy ảnh đầu tiên.
                </p>
              )}
              {dem.nhieuDong > 0 && (
                <p>
                  <FiAlertTriangle className="mr-1 inline h-4 w-4" />
                  {dem.nhieuDong} ảnh khớp số tracking đang có nhiều dòng — ảnh gắn vào tất cả các dòng đó.
                </p>
              )}
            </div>
          )}

          {/* Tiến độ */}
          {(buoc === 'tai' || buoc === 'xong') && (
            <div className="mb-4">
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium text-slate-700">
                  {buoc === 'tai'
                    ? `Đang tải ${dem.xong + dem.loi}/${dem.khop} ảnh…`
                    : `Đã gắn ${dem.xong} ảnh vào ${dem.trackingXong} tracking`}
                  {dem.daThay > 0 && <span className="text-slate-500"> (thay {dem.daThay} ảnh cũ)</span>}
                </span>
                {dem.loi > 0 && <span className="font-medium text-rose-600">{dem.loi} lỗi</span>}
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all ${dem.loi ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${phanTram}%` }}
                />
              </div>
            </div>
          )}

          {/* Lọc */}
          <div className="mb-2 flex flex-wrap gap-1.5 text-sm">
            {([
              ['tat-ca', `Tất cả (${dem.tong})`],
              ['khop', `Khớp (${dem.khop})`],
              ['khong-khop', `Không tải (${dem.tong - dem.khop})`],
              ...(dem.loi ? [['loi', `Lỗi (${dem.loi})`]] : []),
            ] as [Loc, string][]).map(([k, nhan]) => (
              <button
                key={k}
                type="button"
                onClick={() => setLoc(k)}
                className={`rounded-lg px-3 py-1 cursor-pointer ${loc === k ? 'bg-[#14264b] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {nhan}
              </button>
            ))}
          </div>

          <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Tên ảnh</th>
                  <th className="px-3 py-2">Tracking</th>
                  <th className="px-3 py-2">Khách</th>
                  <th className="px-3 py-2">Ghi chú</th>
                  <th className="px-3 py-2 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {hienThi.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Không có ảnh nào</td></tr>
                )}
                {hienThi.map((d) => {
                  const k = d.khop;
                  const coTracking = !!k?.tracking.length;
                  const ghiChu: string[] = [];
                  if (d.trungTrongLo) ghiChu.push('Trùng tên ảnh khác trong thư mục — bỏ qua');
                  else if (k && !coTracking) ghiChu.push('Không có tracking này trong hệ thống');
                  if (k?.boDuoi && coTracking) ghiChu.push('Khớp sau khi bỏ đuôi số');
                  if (k?.nhieuMa && coTracking) ghiChu.push('Tracking này có nhiều mã, khớp 1 mã');
                  if (k?.tracking && k.tracking.length > 1) ghiChu.push(`Gắn cho ${k.tracking.length} dòng cùng số`);
                  if (k?.trungTen && !d.trungTrongLo) ghiChu.push('Thay ảnh cũ cùng tên');
                  else if (k?.soAnhDaCo && coTracking && !d.trungTrongLo) ghiChu.push(`Đã có ${k.soAnhDaCo} ảnh`);
                  if (d.loi) ghiChu.push(d.loi);
                  return (
                    <tr key={d.stt} className={`border-b border-slate-100 ${d.trangThai === 'loi' ? 'bg-rose-50' : !coTracking || d.trungTrongLo ? 'bg-amber-50/50' : ''}`}>
                      <td className="max-w-[260px] px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => setXem({ src: URL.createObjectURL(d.file), ten: d.ten })}
                          className="block max-w-full truncate text-left font-mono text-xs text-[#14264b] hover:underline cursor-pointer"
                          title="Xem ảnh"
                        >
                          {d.ten}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-slate-800">
                        {coTracking ? (
                          k!.tracking.length === 1 ? (
                            <Link href={`/admin/tracking/${k!.tracking[0].TrackingID}`} target="_blank" className="hover:underline">
                              {k!.soTracking}
                            </Link>
                          ) : k!.soTracking
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-600">
                        {coTracking
                          ? k!.tracking.map((t) => `${t.UserName ?? '?'}${t.TinhTrang ? ` · ${t.TinhTrang}` : ''}`).join(', ')
                          : ''}
                      </td>
                      <td className={`px-3 py-1.5 text-xs ${d.trangThai === 'loi' ? 'text-rose-700' : !coTracking || d.trungTrongLo ? 'text-amber-700' : 'text-slate-500'}`}>
                        {ghiChu.join(' · ')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs">
                        {d.trangThai === 'xong' && <span className="inline-flex items-center gap-1 font-medium text-emerald-600"><FiCheck className="h-3.5 w-3.5" /> Đã gắn</span>}
                        {d.trangThai === 'dang' && <span className="animate-pulse text-[#14264b]">Đang tải…</span>}
                        {d.trangThai === 'loi' && <span className="font-medium text-rose-600">Lỗi</span>}
                        {d.trangThai === 'cho' && <span className="text-slate-500">{buoc === 'xong' ? 'Chưa tải' : 'Chờ tải'}</span>}
                        {d.trangThai === 'bo' && <span className="text-slate-400">Bỏ qua</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {buoc === 'xem' && (
              <>
                <button type="button" onClick={chonLai} className={btnSecondary}>
                  <FiArrowLeft className="h-4 w-4" /> Chọn lại
                </button>
                <button type="button" onClick={() => taiLen()} disabled={!dem.khop} className={btnPrimary}>
                  <FiUpload className="h-4 w-4" /> Tải lên {dem.khop} ảnh
                </button>
              </>
            )}
            {buoc === 'tai' && (
              <button type="button" onClick={() => { dungRef.current = true; }} className={btnSecondary}>
                <FiPause className="h-4 w-4" /> Dừng
              </button>
            )}
            {buoc === 'xong' && (
              <>
                {dem.loi > 0 && (
                  <button type="button" onClick={() => taiLen(true)} className={btnSecondary}>
                    <FiRefreshCw className="h-4 w-4" /> Thử lại {dem.loi} ảnh lỗi
                  </button>
                )}
                {dem.dangCho > 0 && (
                  <button type="button" onClick={() => taiLen()} className={btnSecondary}>
                    <FiUpload className="h-4 w-4" /> Tải tiếp {dem.dangCho} ảnh
                  </button>
                )}
                <button type="button" onClick={chonLai} className={btnSecondary}>
                  <FiFolder className="h-4 w-4" /> Up thư mục khác
                </button>
                <Link href="/admin/tracking" className={btnPrimary}>
                  <FiCheck className="h-4 w-4" /> Xong
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {xem && <KhungXemAnh anh={[xem]} onDong={() => setXem(null)} />}
    </div>
  );
}
