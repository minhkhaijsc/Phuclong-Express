'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FiAlertTriangle, FiCheck, FiLock, FiSearch, FiTrash2, FiX } from 'react-icons/fi';
import {
  datTrangThaiKhach,
  getKiemKeTaiKhoan,
  timNhanhTaiKhoan,
  xuLyTaiKhoan,
  type KiemKeTaiKhoan,
  type MucKiemKe,
} from '@/lib/api';

/**
 * Hộp "Xoá tài khoản" — kiểm kê trước, quyết sau.
 *
 * VÌ SAO KHÔNG DÙNG `confirm()`: `AspNetUsers` không có khoá ngoại nào trỏ về,
 * mọi bảng khác nhớ tài khoản bằng CHUỖI UserName. Xoá một mã là để lại hàng
 * chục nghìn dòng trỏ vào chỗ không còn gì — CSDL không hề cản, không báo lỗi,
 * và không dựng lại được. Một câu "Bạn có chắc không?" không hề nói ra điều đó.
 *
 * Nên hộp này hỏi theo đúng thứ tự người ta cần biết:
 *   1. Tài khoản này đang giữ những gì — con số thật, từng bảng.
 *   2. Dữ liệu ấy chuyển cho ai, hay cố ý để nguyên.
 *   3. Rồi mới tới: đóng mã hay xoá hẳn.
 *
 * HAI NHÓM DỮ LIỆU CHỌN RIÊNG, cố ý. "Dữ liệu của mã" (công nợ, kiện, đơn) mà
 * chuyển đi là gộp mã này vào mã khác. "Đầu việc đã nhập" (ai tạo dòng nào) mà
 * chuyển đi là bàn giao cho nhân viên khác. Gộp chung một ô chọn thì một lần
 * bàn giao cho người mới sẽ kéo luôn công nợ của khách sang tài khoản nhân viên.
 */

const tien = (v: number) => `${Math.round(v).toLocaleString('vi-VN')}đ`;
const ngay = (s: string | null) => (s ? new Date(s).toLocaleDateString('vi-VN') : '—');
const soNgay = (s: string | null) =>
  s ? Math.floor((Date.now() - new Date(s).getTime()) / 86400000) : null;

/** Khớp NGUONG_CON_NO ở backend — dưới mức này là bụi làm tròn của cột float. */
const NGUONG_CON_NO = 1000;

type Xong = () => void;

// ----------------------------------------------------------------
// Ô chọn mã nhận
// ----------------------------------------------------------------

/**
 * Gõ để tìm, bấm để chọn. Giá trị CHỈ được đặt khi người dùng chọn đúng một mục
 * có thật — gõ dở dang không bao giờ trở thành mã nhận.
 */
function OChonMa({
  nhom,
  giaTri,
  datGiaTri,
  tuKhoaBanDau,
}: {
  nhom: 'khach' | 'nhap';
  giaTri: string | null;
  datGiaTri: (v: string | null) => void;
  tuKhoaBanDau?: string;
}) {
  const [go, setGo] = useState('');
  const [mo, setMo] = useState(false);
  const [chon, setChon] = useState(0);
  const boc = useRef<HTMLDivElement>(null);

  const ds = useQuery({
    queryKey: ['tim-nhanh', nhom, go],
    queryFn: () => timNhanhTaiKhoan(go, nhom),
    enabled: mo && go.trim().length >= 2,
  });
  const muc = ds.data ?? [];

  useEffect(() => {
    const ngoai = (e: MouseEvent) => {
      if (boc.current && !boc.current.contains(e.target as Node)) setMo(false);
    };
    document.addEventListener('mousedown', ngoai);
    return () => document.removeEventListener('mousedown', ngoai);
  }, []);

  if (giaTri) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
        <FiCheck className="h-4 w-4 shrink-0 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-800">{giaTri}</span>
        <button
          onClick={() => {
            datGiaTri(null);
            setGo('');
          }}
          className="ml-auto rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
          aria-label="Bỏ chọn mã nhận"
        >
          <FiX className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={boc} className="relative mt-2">
      <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={go}
        onChange={(e) => {
          setGo(e.target.value);
          setMo(true);
          setChon(0);
        }}
        onFocus={() => setMo(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setChon((i) => Math.min(muc.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setChon((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter' && muc[chon]) { e.preventDefault(); datGiaTri(muc[chon].userName); setMo(false); }
          else if (e.key === 'Escape') setMo(false);
        }}
        placeholder={tuKhoaBanDau ?? (nhom === 'nhap' ? 'Gõ mã nhân viên nhận…' : 'Gõ mã khách nhận…')}
        className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-[#14264b] focus:outline-none"
      />
      {mo && go.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {ds.isPending && <p className="px-3 py-2 text-sm text-slate-400">Đang tìm…</p>}
          {!ds.isPending && muc.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-400">
              Không có mã {nhom === 'nhap' ? 'nhân viên' : 'khách'} nào khớp
            </p>
          )}
          {muc.map((m, i) => (
            <button
              key={m.userName}
              onMouseEnter={() => setChon(i)}
              onClick={() => { datGiaTri(m.userName); setMo(false); }}
              className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm cursor-pointer ${
                i === chon ? 'bg-[#14264b]/5' : ''
              }`}
            >
              <span className="font-medium text-slate-800">{m.userName}</span>
              <span className="truncate text-xs text-slate-500">{m.hoTen || '—'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Khối kiểm kê
// ----------------------------------------------------------------

function BangMuc({ muc }: { muc: MucKiemKe[] }) {
  return (
    <ul className="mt-1.5 space-y-1">
      {muc.map((m) => (
        <li key={`${m.bang}.${m.cot}`} className="flex items-baseline gap-2 text-sm">
          <span className="min-w-[3.5rem] text-right font-semibold tabular-nums text-slate-800">
            {m.so.toLocaleString('vi-VN')}
          </span>
          <span className="text-slate-600">{m.nhan}</span>
        </li>
      ))}
    </ul>
  );
}

/** Một nhóm: tiêu đề + danh sách + hai lựa chọn chuyển / để nguyên. */
function KhoiNhom({
  tieuDe,
  moTa,
  muc,
  tong,
  nhom,
  dich,
  datDich,
  seXoa,
}: {
  tieuDe: string;
  moTa: string;
  muc: MucKiemKe[];
  tong: number;
  nhom: 'khach' | 'nhap';
  dich: string | null;
  datDich: (v: string | null) => void;
  seXoa: boolean;
}) {
  const [chuyen, setChuyen] = useState(false);
  const gop = muc.some((m) => m.canhBaoGop);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-800">
        {tieuDe} <span className="font-normal text-slate-400">· {tong.toLocaleString('vi-VN')} dòng</span>
      </p>
      <p className="text-xs text-slate-500">{moTa}</p>
      <BangMuc muc={muc} />

      <div className="mt-3 space-y-1.5">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            name={`xl-${nhom}`}
            checked={chuyen}
            onChange={() => setChuyen(true)}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-slate-800">Chuyển sang mã khác</span>
            <span className="block text-xs text-slate-500">
              {nhom === 'khach'
                ? 'Gộp toàn bộ dữ liệu trên vào một mã khách khác.'
                : 'Bàn giao đầu việc cho một tài khoản nội bộ khác.'}
            </span>
          </span>
        </label>
        {chuyen && (
          <div className="pl-6">
            <OChonMa nhom={nhom} giaTri={dich} datGiaTri={datDich} />
            {gop && dich && (
              <p className="mt-1.5 text-xs text-amber-700">
                Có dòng chốt kỳ công nợ: gộp xong thì một kỳ sẽ có hai dòng (của mã cũ và mã mới).
                Báo cáo công nợ theo kỳ cần biết điều này.
              </p>
            )}
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            name={`xl-${nhom}`}
            checked={!chuyen}
            onChange={() => {
              setChuyen(false);
              datDich(null);
            }}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-slate-800">Để nguyên</span>
            <span className="block text-xs text-slate-500">
              {seXoa ? (
                <span className="text-red-600">
                  {tong.toLocaleString('vi-VN')} dòng sẽ trỏ vào một mã không còn tồn tại.
                </span>
              ) : (
                'Không đụng tới dữ liệu này.'
              )}
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Hộp chính
// ----------------------------------------------------------------

export function HopXoaTaiKhoan({
  id,
  dong,
  xong,
}: {
  id: string;
  dong: () => void;
  xong: Xong;
}) {
  const kk = useQuery<KiemKeTaiKhoan>({
    queryKey: ['kiem-ke-tai-khoan', id],
    queryFn: () => getKiemKeTaiKhoan(id),
  });

  const [dichKhach, setDichKhach] = useState<string | null>(null);
  const [dichNhap, setDichNhap] = useState<string | null>(null);
  const [xoaHan, setXoaHan] = useState(false);
  const [lyDo, setLyDo] = useState('');
  const [xacNhan, setXacNhan] = useState('');
  const [loi, setLoi] = useState('');

  const d = kk.data;

  const chay = useMutation({
    mutationFn: async () => {
      if (!d) return;
      const coChuyen = Boolean(dichKhach || dichNhap);
      if (coChuyen || xoaHan) {
        await xuLyTaiKhoan(id, {
          chuyenKhachSang: dichKhach ?? undefined,
          chuyenNhapSang: dichNhap ?? undefined,
          xoaTaiKhoan: xoaHan,
          lyDo,
          xacNhan: xoaHan ? xacNhan : undefined,
        });
      }
      // Không xoá thì mã vẫn còn — đóng lại để nó không đăng nhập được nữa và
      // biến khỏi danh sách việc cần làm của CSKH.
      if (!xoaHan) await datTrangThaiKhach(id, 'dong-ma', lyDo);
    },
    onSuccess: xong,
    onError: (e: any) => setLoi(e?.response?.data?.message || 'Không thực hiện được, thử lại sau'),
  });

  const canNo = d ? Math.abs(d.duNo) >= NGUONG_CON_NO : false;
  const chanVaiTien = Boolean(d && canNo && xoaHan && !dichKhach);
  const thieuXacNhan = xoaHan && xacNhan.trim().toLowerCase() !== (d?.userName ?? '').toLowerCase();
  const chuaDuDieuKien = !lyDo.trim() || thieuXacNhan || chanVaiTien;
  const moCoi = xoaHan
    ? (dichKhach ? 0 : (d?.tongKhach ?? 0)) + (dichNhap ? 0 : (d?.tongNhap ?? 0))
    : 0;
  const nghi = soNgay(d?.lanGiaoDichCuoi ?? null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-6 w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
        {kk.isPending && (
          <>
            <h2 className="text-base font-bold text-slate-800">Đang kiểm kê dữ liệu…</h2>
            <p className="mt-1 text-sm text-slate-500">
              Đếm mọi dòng còn trỏ tới tài khoản này, trên 14 bảng. Mất vài giây.
            </p>
            <div className="mt-4 h-24 animate-pulse rounded-xl bg-slate-100" />
          </>
        )}

        {kk.isError && (
          <>
            <h2 className="text-base font-bold text-slate-800">Không kiểm kê được</h2>
            <p className="mt-1 text-sm text-red-600">
              {(kk.error as any)?.response?.data?.message || 'Thử lại sau.'}
            </p>
            <div className="mt-4 flex justify-end">
              <button onClick={dong} className="rounded-xl border border-slate-200 px-4 py-2 text-sm cursor-pointer">
                Đóng
              </button>
            </div>
          </>
        )}

        {d && (
          <>
            <h2 className="text-base font-bold text-slate-800">Xoá tài khoản — {d.userName}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {d.hoTen || 'Chưa có họ tên'}
              {d.laNhanVien ? ` · tài khoản nhân viên (${d.vaiTro.join(', ')})` : ' · mã khách'}
              {' · '}Giao dịch cuối {ngay(d.lanGiaoDichCuoi)}
              {nghi !== null && ` (${nghi} ngày trước)`}
            </p>

            {canNo && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {d.duNo > 0 ? (
                    <>Mã này <strong>còn nợ {tien(d.duNo)}</strong>.</>
                  ) : (
                    <>Mã này <strong>đang dư trả trước {tien(-d.duNo)}</strong>.</>
                  )}{' '}
                  Xoá mã đi thì không còn ai để đối chiếu, mà dòng công nợ vẫn nằm đó — chốt nợ
                  xong, hoặc chuyển sang mã khác, rồi mới xoá được.
                </span>
              </div>
            )}

            {d.tongKhach + d.tongNhap === 0 ? (
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                Tài khoản này <strong>chưa dính dòng dữ liệu nào</strong>. Xoá đi không để lại gì.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Tài khoản này đang giữ
                </p>
                {d.tongKhach > 0 && (
                  <KhoiNhom
                    tieuDe="Dữ liệu của mã"
                    moTa="Công nợ, kiện hàng, đơn… đứng tên mã này."
                    muc={d.khach}
                    tong={d.tongKhach}
                    nhom="khach"
                    dich={dichKhach}
                    datDich={setDichKhach}
                    seXoa={xoaHan}
                  />
                )}
                {d.tongNhap > 0 && (
                  <KhoiNhom
                    tieuDe="Đầu việc đã nhập"
                    moTa="Những dòng do tài khoản này tạo ra hoặc sửa."
                    muc={d.nhap}
                    tong={d.tongNhap}
                    nhom="nhap"
                    dich={dichNhap}
                    datDich={setDichNhap}
                    seXoa={xoaHan}
                  />
                )}
              </div>
            )}

            {d.nhatKy > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                Ngoài ra có {d.nhatKy.toLocaleString('vi-VN')} dòng nhật ký hệ thống —
                luôn giữ nguyên, để sau này còn tra được ai đã làm gì.
              </p>
            )}

            {/* ---- Rồi tài khoản thì sao ---- */}
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Rồi tài khoản thì sao
            </p>
            <div className="mt-1.5 space-y-2">
              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${
                  !xoaHan ? 'border-[#14264b] bg-[#14264b]/5' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input type="radio" name="sophan" checked={!xoaHan} onChange={() => setXoaHan(false)} className="mt-0.5" />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <FiLock className="h-3.5 w-3.5" /> Đóng mã, giữ tài khoản
                  </span>
                  <span className="block text-xs text-slate-500">
                    Không đăng nhập được nữa, nhưng dữ liệu cũ vẫn tra được và mở lại được. Hầu hết
                    trường hợp nên chọn cái này.
                  </span>
                </span>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${
                  xoaHan ? 'border-red-300 bg-red-50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input type="radio" name="sophan" checked={xoaHan} onChange={() => setXoaHan(true)} className="mt-0.5" />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <FiTrash2 className="h-3.5 w-3.5" /> Xoá hẳn khỏi hệ thống
                  </span>
                  <span className="block text-xs text-slate-500">
                    Không lùi lại được. Vai trò và phiên đăng nhập cũng bị dọn theo.
                  </span>
                </span>
              </label>
            </div>

            {xoaHan && moCoi > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{moCoi.toLocaleString('vi-VN')} dòng</strong> sẽ trỏ vào mã {d.userName} —
                  một mã không còn tồn tại. Không có cách nào dựng lại.
                </span>
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700">
                Lý do <span className="text-red-500">*</span>
              </label>
              <textarea
                value={lyDo}
                onChange={(e) => setLyDo(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={d.laNhanVien ? 'Vd: nghỉ việc từ 09/2026, bàn giao cho Hương' : 'Vd: đã gọi, khách nghỉ bán hàng online'}
                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:border-[#14264b] focus:outline-none"
              />
            </div>

            {xoaHan && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-slate-700">
                  Gõ lại <span className="font-mono font-bold">{d.userName}</span> để xác nhận
                </label>
                <input
                  value={xacNhan}
                  onChange={(e) => setXacNhan(e.target.value)}
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:border-red-400 focus:outline-none"
                />
              </div>
            )}

            {loi && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loi}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={dong}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Huỷ
              </button>
              <button
                onClick={() => { setLoi(''); chay.mutate(); }}
                disabled={chuaDuDieuKien || chay.isPending}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer ${
                  xoaHan ? 'bg-red-600 hover:bg-red-700' : 'bg-[#14264b] hover:bg-[#3db8e4]'
                }`}
              >
                {chay.isPending ? 'Đang chạy…' : xoaHan ? 'Xoá hẳn' : 'Đóng mã'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
