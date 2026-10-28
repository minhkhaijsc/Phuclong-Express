'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiCopy, FiDownload, FiFileText, FiPlus, FiTrash2, FiUpload, FiX } from 'react-icons/fi';
import apiClient from '@/lib/api-client';
import { useQuyen } from '@/hooks/use-quyen';

/**
 * HỢP ĐỒNG KHÁCH — yêu cầu bên khách 28/10/2026: up hợp đồng mẫu, chọn khách,
 * web tự điền tên khách và sinh link cho khách xem + ký online.
 * Máy chủ: backend/src/hop-dong/. Quyền `hopDong`: Admin, CSKH, Kế toán.
 */

interface Mau {
  MauID: number;
  Ten: string;
  TenFile: string;
  CacO: string[];
  NguoiTao: string | null;
  NgayTao: string;
}

interface HopDong {
  HopDongID: number;
  MaLink: string;
  UserName: string;
  SoHopDong: string | null;
  TrangThai: 'cho-ky' | 'da-ky' | 'da-huy';
  NguoiTao: string | null;
  NgayTao: string;
  LanXemDau: string | null;
  NgayKy: string | null;
  TenNguoiKy: string | null;
  IpKy: string | null;
  LyDoHuy: string | null;
  TenMau: string;
  tenKhach: string;
}

/** Nhãn dễ đọc cho các ô hay dùng — khớp NHAN_O ở backend/src/hop-dong/docx-mau.ts. */
const NHAN_O: Record<string, string> = {
  SoHopDong: 'Số hợp đồng (để trống = tự sinh)',
  Ngay: 'Ngày lập',
  Thang: 'Tháng lập',
  Nam: 'Năm lập',
  TenKhach: 'Tên khách (Bên B)',
  DiaChi: 'Địa chỉ',
  SoDienThoai: 'Số điện thoại',
  Email: 'Email',
  SoCCCD: 'Số CCCD/Hộ chiếu',
  NgayCapCCCD: 'Ngày cấp CCCD',
  NoiCapCCCD: 'Nơi cấp CCCD',
  MaSoThue: 'Mã số thuế',
  HieuLucTu: 'Hiệu lực từ ngày',
  HieuLucDen: 'Hiệu lực đến ngày',
};

/** Ô hệ thống tự điền lúc khách ký — không hiện cho người tạo gõ. */
const O_LUC_KY = ['TenNguoiKy', 'XacNhanKy'];
const laOAnh = (o: string) => /^ChuKy/i.test(o);

const ngay = (s?: string | null) => (s ? new Date(s).toLocaleString('vi-VN') : '');
const linkCua = (ma: string) => (typeof window === 'undefined' ? '' : `${window.location.origin}/hop-dong/${ma}`);
const loiCua = (e: any, macDinh: string) => e?.response?.data?.message || macDinh;

async function taiFile(duongDan: string, tenMacDinh: string) {
  const r = await apiClient.get<Blob>(duongDan, { responseType: 'blob' });
  const cd = String(r.headers['content-disposition'] ?? '');
  const ten = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cd)?.[1] ?? '') || tenMacDinh;
  const url = URL.createObjectURL(r.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = ten;
  a.click();
  URL.revokeObjectURL(url);
}

function NutChep({ text }: { text: string }) {
  const [da, setDa] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDa(true);
          setTimeout(() => setDa(false), 1500);
        } catch {
          /* trình duyệt chặn clipboard — người dùng tự bôi đen */
        }
      }}
      className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
    >
      <FiCopy className="h-3.5 w-3.5" />
      {da ? 'Đã chép' : 'Chép link'}
    </button>
  );
}

export default function HopDongAdminPage() {
  const { co, dangNap } = useQuyen();
  const [tab, setTab] = useState<'hop-dong' | 'mau'>('hop-dong');
  const [mau, setMau] = useState<Mau[]>([]);
  const [loiMau, setLoiMau] = useState('');

  const taiMau = useCallback(async () => {
    try {
      const { data } = await apiClient.get<Mau[]>('/hop-dong/mau');
      setMau(data);
      setLoiMau('');
    } catch (e) {
      setLoiMau(loiCua(e, 'Không tải được danh sách mẫu.'));
    }
  }, []);

  useEffect(() => {
    if (co('hopDong')) taiMau();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dangNap]);

  if (!dangNap && !co('hopDong')) {
    return <div className="p-6 text-slate-500">Bạn không có quyền tạo hợp đồng.</div>;
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#14264b] text-white">
            <FiFileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Hợp đồng khách</h1>
            <p className="text-sm text-slate-500">Tạo hợp đồng từ mẫu, gửi link cho khách xem và ký online</p>
          </div>
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ['hop-dong', 'Hợp đồng'],
              ['mau', `Mẫu (${mau.length})`],
            ] as const
          ).map(([k, nhan]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium ${
                tab === k ? 'bg-[#14264b] text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {nhan}
            </button>
          ))}
        </div>
      </div>

      {loiMau && <p className="text-sm text-red-600">{loiMau}</p>}
      {tab === 'hop-dong' ? <TabHopDong mau={mau} moTabMau={() => setTab('mau')} /> : <TabMau mau={mau} taiLai={taiMau} />}
    </div>
  );
}

// ------------------------------------------------------------------ HỢP ĐỒNG

function TabHopDong({ mau, moTabMau }: { mau: Mau[]; moTabMau: () => void }) {
  const [moTao, setMoTao] = useState(false);
  const [ds, setDs] = useState<HopDong[]>([]);
  const [tong, setTong] = useState(0);
  const [tim, setTim] = useState('');
  const [trangThai, setTrangThai] = useState('');
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState('');
  const [vuaTao, setVuaTao] = useState<{ maLink: string; soHopDong: string } | null>(null);

  const taiDs = useCallback(async () => {
    setDangTai(true);
    try {
      const { data } = await apiClient.get<{ data: HopDong[]; total: number }>('/hop-dong', {
        params: { userName: tim || undefined, trangThai: trangThai || undefined, limit: 100 },
      });
      setDs(data.data);
      setTong(data.total);
      setLoi('');
    } catch (e) {
      setLoi(loiCua(e, 'Không tải được danh sách hợp đồng.'));
    } finally {
      setDangTai(false);
    }
  }, [tim, trangThai]);

  useEffect(() => {
    taiDs();
    // Chỉ tự tải khi đổi trạng thái; ô tìm thì bấm Tìm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trangThai]);

  const huy = async (h: HopDong) => {
    const lyDo = window.prompt(`Huỷ hợp đồng ${h.SoHopDong}? Link sẽ không mở được nữa.\nLý do:`);
    if (lyDo === null) return;
    try {
      await apiClient.post(`/hop-dong/${h.HopDongID}/huy`, { lyDo });
      taiDs();
    } catch (e) {
      setLoi(loiCua(e, 'Huỷ không được.'));
    }
  };

  return (
    <div className="space-y-4">
      {vuaTao && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-emerald-800">Đã tạo hợp đồng {vuaTao.soHopDong}. Gửi link này cho khách:</p>
            <p className="mt-1 break-all font-mono text-sm text-emerald-900">{linkCua(vuaTao.maLink)}</p>
          </div>
          <NutChep text={linkCua(vuaTao.maLink)} />
          <button type="button" onClick={() => setVuaTao(null)} className="cursor-pointer text-emerald-700">
            <FiX />
          </button>
        </div>
      )}

      {moTao ? (
        <FormTao
          mau={mau}
          dong={() => setMoTao(false)}
          xong={(r) => {
            setMoTao(false);
            setVuaTao(r);
            taiDs();
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => (mau.length ? setMoTao(true) : moTabMau())}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#14264b] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a6e]"
          >
            <FiPlus className="h-4 w-4" />
            {mau.length ? 'Tạo hợp đồng' : 'Up mẫu hợp đồng trước'}
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
            <input
              value={tim}
              onChange={(e) => setTim(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && taiDs()}
              placeholder="Tài khoản khách / số HĐ"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={trangThai}
              onChange={(e) => setTrangThai(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Mọi trạng thái</option>
              <option value="cho-ky">Chờ ký</option>
              <option value="da-ky">Đã ký</option>
              <option value="da-huy">Đã huỷ</option>
            </select>
            <button
              type="button"
              onClick={taiDs}
              className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Tìm
            </button>
          </div>
        </div>
      )}

      {loi && <p className="text-sm text-red-600">{loi}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Số HĐ</th>
              <th className="px-4 py-3">Khách</th>
              <th className="px-4 py-3">Mẫu</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Tạo</th>
              <th className="px-4 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ds.map((h) => (
              <tr key={h.HopDongID} className="align-top">
                <td className="px-4 py-3 font-medium text-slate-800">{h.SoHopDong}</td>
                <td className="px-4 py-3">
                  <div className="text-slate-800">{h.tenKhach}</div>
                  <div className="text-xs text-slate-500">{h.UserName}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{h.TenMau}</td>
                <td className="px-4 py-3">
                  {h.TrangThai === 'da-ky' && (
                    <div>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Đã ký</span>
                      <div className="mt-1 text-xs text-slate-500">
                        {h.TenNguoiKy} · {ngay(h.NgayKy)}
                        {h.IpKy ? ` · IP ${h.IpKy}` : ''}
                      </div>
                    </div>
                  )}
                  {h.TrangThai === 'cho-ky' && (
                    <div>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Chờ ký</span>
                      <div className="mt-1 text-xs text-slate-500">
                        {h.LanXemDau ? `Khách đã mở ${ngay(h.LanXemDau)}` : 'Khách chưa mở link'}
                      </div>
                    </div>
                  )}
                  {h.TrangThai === 'da-huy' && (
                    <div>
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Đã huỷ</span>
                      {h.LyDoHuy && <div className="mt-1 text-xs text-slate-500">{h.LyDoHuy}</div>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {ngay(h.NgayTao)}
                  <div>{h.NguoiTao}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {h.TrangThai !== 'da-huy' && <NutChep text={linkCua(h.MaLink)} />}
                    <button
                      type="button"
                      onClick={() => taiFile(`/hop-dong/${h.HopDongID}/file`, `HopDong_${h.UserName}.docx`)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      <FiDownload className="h-3.5 w-3.5" />
                      Tải
                    </button>
                    {h.TrangThai === 'cho-ky' && (
                      <button
                        type="button"
                        onClick={() => huy(h)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <FiX className="h-3.5 w-3.5" />
                        Huỷ
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!ds.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {dangTai ? 'Đang tải…' : 'Chưa có hợp đồng nào.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {tong > ds.length && <p className="text-xs text-slate-500">Đang hiện {ds.length}/{tong} hợp đồng mới nhất.</p>}
    </div>
  );
}

function FormTao({
  mau,
  dong,
  xong,
}: {
  mau: Mau[];
  dong: () => void;
  xong: (r: { maLink: string; soHopDong: string }) => void;
}) {
  const [mauId, setMauId] = useState<number>(mau[0]?.MauID ?? 0);
  const [userName, setUserName] = useState('');
  const [khach, setKhach] = useState<string | null>(null);
  const [anLienHe, setAnLienHe] = useState(false);
  const [duLieu, setDuLieu] = useState<Record<string, string>>({});
  const [khachDien, setKhachDien] = useState<Record<string, boolean>>({});
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);

  const mauChon = mau.find((m) => m.MauID === mauId);
  const cacO = useMemo(
    () => (mauChon?.CacO ?? []).filter((o) => !laOAnh(o) && !O_LUC_KY.includes(o)),
    [mauChon],
  );

  // Ô trống mặc định để khách tự điền lúc ký (CCCD… nhân viên thường không có).
  useEffect(() => {
    setKhachDien(Object.fromEntries(cacO.map((o) => [o, o !== 'SoHopDong' && !String(duLieu[o] ?? '').trim()])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacO, khach]);

  const layKhach = async () => {
    const u = userName.trim();
    if (!u) return;
    setLoi('');
    try {
      const { data } = await apiClient.get<{ userName: string; duLieu: Record<string, string>; anLienHe: boolean }>(
        `/hop-dong/goi-y/${encodeURIComponent(u)}`,
      );
      setKhach(data.userName);
      setUserName(data.userName);
      setDuLieu(data.duLieu);
      setAnLienHe(data.anLienHe);
    } catch (e) {
      setKhach(null);
      setLoi(loiCua(e, 'Không tìm thấy khách.'));
    }
  };

  const tao = async () => {
    if (!khach || !mauId) return;
    setDang(true);
    setLoi('');
    try {
      const giuLai = Object.fromEntries(cacO.map((o) => [o, duLieu[o] ?? '']));
      const { data } = await apiClient.post<{ maLink: string; soHopDong: string }>('/hop-dong', {
        mauId,
        userName: khach,
        duLieu: giuLai,
        oKhachDien: cacO.filter((o) => khachDien[o]),
      });
      xong(data);
    } catch (e) {
      setLoi(loiCua(e, 'Tạo hợp đồng không được.'));
    } finally {
      setDang(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Tạo hợp đồng</h2>
        <button type="button" onClick={dong} className="cursor-pointer text-slate-400 hover:text-slate-600">
          <FiX />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-slate-600">Mẫu hợp đồng</span>
          <select
            value={mauId}
            onChange={(e) => setMauId(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {mau.map((m) => (
              <option key={m.MauID} value={m.MauID}>
                {m.Ten}
              </option>
            ))}
          </select>
        </label>
        <div className="text-sm">
          <span className="text-slate-600">Tài khoản khách</span>
          <div className="mt-1 flex gap-2">
            <input
              value={userName}
              onChange={(e) => {
                setUserName(e.target.value);
                setKhach(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && layKhach()}
              placeholder="vd HP1343"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <button
              type="button"
              onClick={layKhach}
              className="shrink-0 cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
            >
              Lấy thông tin
            </button>
          </div>
        </div>
      </div>

      {khach && (
        <>
          <p className="mt-5 text-sm text-slate-500">
            Kiểm lại từng ô. Tick <b>Khách tự điền</b> cho ô bạn chưa có (CCCD…) — khách sẽ điền lúc ký.
            {anLienHe && ' Số điện thoại/email của khách này bạn không được xem nên để trống.'}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {cacO.map((o) => (
              <div key={o} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">{NHAN_O[o] ?? o}</span>
                  {o !== 'SoHopDong' && (
                    <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={!!khachDien[o]}
                        onChange={(e) => setKhachDien((k) => ({ ...k, [o]: e.target.checked }))}
                      />
                      Khách tự điền
                    </label>
                  )}
                </div>
                <input
                  value={duLieu[o] ?? ''}
                  onChange={(e) => setDuLieu((d) => ({ ...d, [o]: e.target.value }))}
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
            ))}
          </div>
        </>
      )}

      {loi && <p className="mt-3 text-sm text-red-600">{loi}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={tao}
          disabled={!khach || dang}
          className="cursor-pointer rounded-xl bg-[#14264b] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a6e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {dang ? 'Đang tạo…' : 'Tạo link hợp đồng'}
        </button>
        <button
          type="button"
          onClick={dong}
          className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Huỷ
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ MẪU

function TabMau({ mau, taiLai }: { mau: Mau[]; taiLai: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [ten, setTen] = useState('');
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [bao, setBao] = useState('');

  const up = async () => {
    if (!file) return;
    setDang(true);
    setLoi('');
    setBao('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('ten', ten);
      const { data } = await apiClient.post<{ ten: string; cacO: string[] }>('/hop-dong/mau', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBao(`Đã thêm mẫu "${data.ten}" với ${data.cacO.length} ô: ${data.cacO.join(', ')}`);
      setFile(null);
      setTen('');
      taiLai();
    } catch (e) {
      setLoi(loiCua(e, 'Up mẫu không được.'));
    } finally {
      setDang(false);
    }
  };

  const xoa = async (m: Mau) => {
    if (!window.confirm(`Xoá mẫu "${m.Ten}"? Hợp đồng đã tạo từ mẫu này vẫn giữ nguyên.`)) return;
    try {
      await apiClient.post(`/hop-dong/mau/${m.MauID}/xoa`);
      taiLai();
    } catch (e) {
      setLoi(loiCua(e, 'Xoá không được.'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-800">Thêm mẫu hợp đồng</h2>
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          <p>
            Mở file Word, chỗ nào cần điền thì gõ tên ô trong ngoặc nhọn, vd <code>{'{TenKhach}'}</code>, rồi lưu
            .docx và up lên.
          </p>
          <p className="text-xs text-slate-500">
            Ô có sẵn: {'{SoHopDong} {Ngay} {Thang} {Nam} {TenKhach} {DiaChi} {SoDienThoai} {Email} {SoCCCD} {NgayCapCCCD} {NoiCapCCCD} {MaSoThue} {HieuLucTu} {HieuLucDen}'}
            . Chỗ ký của khách: <code>{'{ChuKyBenB}'}</code>, <code>{'{TenNguoiKy}'}</code>, <code>{'{XacNhanKy}'}</code>{' '}
            (tự điền lúc khách ký). Tên ô khác do bạn đặt cũng được — sẽ hiện ra ô để gõ lúc tạo hợp đồng.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="text-slate-600">Tên mẫu</span>
            <input
              value={ten}
              onChange={(e) => setTen(e.target.value)}
              placeholder="vd Hợp đồng vận chuyển hàng nhập"
              className="mt-1 block w-72 rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">File Word (.docx)</span>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block text-sm"
            />
          </label>
          <button
            type="button"
            onClick={up}
            disabled={!file || dang}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#14264b] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a6e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiUpload className="h-4 w-4" />
            {dang ? 'Đang up…' : 'Up mẫu'}
          </button>
        </div>
        {bao && <p className="mt-3 text-sm text-emerald-700">{bao}</p>}
        {loi && <p className="mt-3 text-sm text-red-600">{loi}</p>}
      </div>

      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {mau.map((m) => (
          <div key={m.MauID} className="flex flex-wrap items-start gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-800">{m.Ten}</p>
              <p className="text-xs text-slate-500">
                {m.TenFile} · {m.NguoiTao} · {ngay(m.NgayTao)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Ô: {m.CacO.join(', ')}</p>
            </div>
            <button
              type="button"
              onClick={() => taiFile(`/hop-dong/mau/${m.MauID}/file`, m.TenFile)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              <FiDownload className="h-3.5 w-3.5" />
              Tải mẫu
            </button>
            <button
              type="button"
              onClick={() => xoa(m)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <FiTrash2 className="h-3.5 w-3.5" />
              Xoá
            </button>
          </div>
        ))}
        {!mau.length && <p className="px-5 py-8 text-center text-sm text-slate-400">Chưa có mẫu nào.</p>}
      </div>
    </div>
  );
}
