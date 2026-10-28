'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { XemDocx } from '@/app/components/hop-dong/xem-docx';
import { KhungKy } from '@/app/components/hop-dong/khung-ky';

interface ThongTin {
  soHopDong: string | null;
  tenMau: string;
  tenKhach: string;
  trangThai: 'cho-ky' | 'da-ky' | 'da-huy';
  ngayKy: string | null;
  tenNguoiKy: string | null;
  lyDoHuy: string | null;
  oKhachDien: { ten: string; nhan: string; giaTri: string }[];
  tenFile: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Trang khách mở từ link hợp đồng — KHÔNG cần đăng nhập (bên khách chốt "khách
 * có link là xem đc"). Đọc hợp đồng, điền ô còn thiếu, gõ họ tên, ký tay, bấm Ký.
 */
export default function KyHopDongPage() {
  const params = useParams<{ ma: string }>();
  const ma = String(params?.ma ?? '');
  const [tt, setTt] = useState<ThongTin | null>(null);
  const [loi, setLoi] = useState('');
  const [phienBan, setPhienBan] = useState(0);

  const [giaTri, setGiaTri] = useState<Record<string, string>>({});
  const [ten, setTen] = useState('');
  const [dongY, setDongY] = useState(false);
  const [chuKy, setChuKy] = useState<string | null>(null);
  const [dangKy, setDangKy] = useState(false);
  const [loiKy, setLoiKy] = useState('');

  const tai = useCallback(async () => {
    try {
      const { data } = await apiClient.get<ThongTin>(`/hop-dong-khach/${ma}`);
      setTt(data);
      setGiaTri(Object.fromEntries(data.oKhachDien.map((o) => [o.ten, o.giaTri || ''])));
      setTen((t) => t || data.tenKhach || '');
    } catch (e: any) {
      setLoi(e?.response?.data?.message || 'Không mở được hợp đồng.');
    }
  }, [ma]);

  useEffect(() => {
    tai();
  }, [tai]);

  const thieu = (tt?.oKhachDien ?? []).filter((o) => !String(giaTri[o.ten] ?? '').trim());
  const kyDuoc = !!chuKy && dongY && ten.trim().length >= 2 && thieu.length === 0 && !dangKy;

  const ky = async () => {
    if (!kyDuoc) return;
    setDangKy(true);
    setLoiKy('');
    try {
      await apiClient.post(`/hop-dong-khach/${ma}/ky`, {
        tenNguoiKy: ten.trim(),
        dongY,
        chuKy,
        duLieu: giaTri,
      });
      await tai();
      setPhienBan((v) => v + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setLoiKy(e?.response?.data?.message || 'Ký không thành công, thử lại.');
    } finally {
      setDangKy(false);
    }
  };

  if (loi) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-28">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-800">Không mở được hợp đồng</p>
          <p className="mt-2 text-slate-500">{loi}</p>
        </div>
      </div>
    );
  }

  if (!tt) {
    return <div className="px-4 pb-16 pt-28 text-center text-slate-500">Đang tải…</div>;
  }

  const linkTai = `${API_URL}/hop-dong-khach/${ma}/file?tai=1`;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-28">
      <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-wider text-slate-400">{tt.tenMau}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-800">Hợp đồng số {tt.soHopDong}</h1>
        <p className="mt-1 text-slate-600">Bên B: {tt.tenKhach}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {tt.trangThai === 'da-ky' && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              Đã ký bởi {tt.tenNguoiKy} lúc {tt.ngayKy ? new Date(tt.ngayKy).toLocaleString('vi-VN') : ''}
            </span>
          )}
          {tt.trangThai === 'cho-ky' && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">Chờ ký</span>
          )}
          {tt.trangThai === 'da-huy' && (
            <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
              Đã huỷ{tt.lyDoHuy ? `: ${tt.lyDoHuy}` : ''}
            </span>
          )}
          {tt.trangThai !== 'da-huy' && (
            <a href={linkTai} className="text-sm font-medium text-[#14264b] underline">
              Tải file Word
            </a>
          )}
        </div>
      </div>

      {tt.trangThai !== 'da-huy' && <XemDocx duongDan={`/hop-dong-khach/${ma}/file`} phienBan={phienBan} />}

      {tt.trangThai === 'cho-ky' && (
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">Ký hợp đồng</h2>

          {tt.oKhachDien.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {tt.oKhachDien.map((o) => (
                <label key={o.ten} className="block text-sm">
                  <span className="text-slate-600">{o.nhan}</span>
                  <input
                    value={giaTri[o.ten] ?? ''}
                    onChange={(e) => setGiaTri((g) => ({ ...g, [o.ten]: e.target.value }))}
                    maxLength={200}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-[#14264b] focus:outline-none"
                  />
                </label>
              ))}
            </div>
          )}

          <label className="mt-4 block text-sm">
            <span className="text-slate-600">Họ tên người ký</span>
            <input
              value={ten}
              onChange={(e) => setTen(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-[#14264b] focus:outline-none"
            />
          </label>

          <div className="mt-4">
            <span className="text-sm text-slate-600">Chữ ký</span>
            <div className="mt-1">
              <KhungKy onDoi={setChuKy} />
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={dongY} onChange={(e) => setDongY(e.target.checked)} className="mt-1" />
            <span>
              Tôi đã đọc và đồng ý toàn bộ nội dung hợp đồng trên. Chữ ký điện tử này có giá trị như chữ ký tay.
            </span>
          </label>

          {thieu.length > 0 && (
            <p className="mt-3 text-sm text-amber-700">Còn thiếu: {thieu.map((o) => o.nhan).join(', ')}.</p>
          )}
          {loiKy && <p className="mt-3 text-sm text-red-600">{loiKy}</p>}

          <button
            type="button"
            onClick={ky}
            disabled={!kyDuoc}
            className="mt-4 w-full cursor-pointer rounded-xl bg-[#14264b] px-4 py-3 font-semibold text-white hover:bg-[#1e3a6e] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {dangKy ? 'Đang ký…' : 'Ký hợp đồng'}
          </button>
        </div>
      )}
    </div>
  );
}
