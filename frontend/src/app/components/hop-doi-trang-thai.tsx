'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FiAlertTriangle, FiLock } from 'react-icons/fi';
import { datTrangThaiKhach, type KhachKemTrangThai, type TrangThaiKhach } from '@/lib/api';

/**
 * Hộp đổi trạng thái một mã.
 *
 * Dùng ở HAI chỗ, nên ở đây chứ không nằm trong màn nào:
 *   • `/admin/khach-ngung-giao-dich` — CSKH đóng mã khách đã nghỉ.
 *   • `/admin/users` — admin khoá tài khoản nhân viên nghỉ việc, thay cho xoá.
 *
 * Chỗ thứ hai mới thêm, sau khi admin không xoá được hai tài khoản kế toán:
 * backend chặn xoá (tài khoản còn dính dữ liệu) và khuyên "đóng mã", nhưng màn
 * nhắc đóng mã chỉ liệt kê tài khoản KHÔNG có vai trò, nên tài khoản nhân viên
 * không bao giờ hiện ở đó — khuyên xong rồi bỏ người ta ở đường cùng.
 */

const tien = (v: number) => `${Math.round(v).toLocaleString('vi-VN')}đ`;
const ngay = (s: string | null) => (s ? new Date(s).toLocaleDateString('vi-VN') : '—');

/** Dưới mức này coi là bụi làm tròn, không phải nợ. Khớp NGUONG_CON_NO ở backend. */
export const NGUONG_CON_NO = 1000;

export function HopDoiTrangThai({
  khach,
  dong,
  xong,
}: {
  khach: KhachKemTrangThai;
  dong: () => void;
  xong: () => void;
}) {
  const [tt, setTt] = useState<TrangThaiKhach>(khach.trangThai ?? 'dong-ma');
  const [lyDo, setLyDo] = useState(khach.lyDoTrangThai ?? '');
  const [loi, setLoi] = useState('');

  const luu = useMutation({
    mutationFn: () => datTrangThaiKhach(khach.id, tt, lyDo),
    onSuccess: xong,
    onError: (e: any) => {
      // Hiện đúng câu máy chủ trả về (vd "Đóng mã phải ghi lý do") thay vì một
      // câu chung — câu của máy chủ nói rõ phải làm gì.
      setLoi(e?.response?.data?.message || 'Không lưu được, thử lại sau');
    },
  });

  const canNo = khach.duNo >= NGUONG_CON_NO;
  const nv = khach.laNhanVien;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-bold text-slate-800">
          Đổi trạng thái — {khach.userName}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {khach.hoTen || 'Chưa có họ tên'}
          {nv && <span className="font-medium text-slate-600"> · tài khoản nhân viên</span>}
          {' · '}Giao dịch cuối {ngay(khach.lanGiaoDichCuoi)}
          {khach.soNgayNghi !== null && ` (${khach.soNgayNghi} ngày trước)`}
        </p>

        {/*
          Cảnh báo nợ ĐẶT TRƯỚC ô chọn, không đặt sau: đọc từ trên xuống thì
          phải biết khách còn nợ TRƯỚC khi quyết định đóng mã.
        */}
        {canNo && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Mã này còn nợ <strong>{tien(khach.duNo)}</strong>. Đóng mã không xoá nợ — nên gọi thu
              trước.
            </span>
          </div>
        )}

        {/*
          Đóng mã CHẶN ĐĂNG NHẬP. Phải nói ra ở đây: trước đây nó chỉ là cái
          nhãn để bỏ mã khỏi danh sách việc cần làm, giờ người giữ mật khẩu
          không vào được nữa — khác hẳn về hệ quả, không được để ai bấm mà
          không biết.
        */}
        {tt === 'dong-ma' && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <FiLock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Đóng mã thì <strong>{khach.userName}</strong> không đăng nhập được nữa. Dữ liệu cũ
              vẫn tra được, và mở lại bằng cách đổi sang trạng thái khác.
            </span>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {(
            [
              {
                gt: 'dong-ma',
                nhan: nv ? 'Đã đóng mã (khoá đăng nhập)' : 'Đã đóng mã',
                moTa: nv
                  ? 'Nhân viên nghỉ việc. Dùng cái này thay cho xoá.'
                  : 'Khách ngừng hẳn. Bỏ khỏi danh sách việc cần làm.',
              },
              {
                gt: 'tam-nghi',
                nhan: 'Tạm nghỉ',
                moTa: 'Nghỉ tạm thời, sẽ quay lại. Vẫn đăng nhập được.',
              },
              {
                gt: 'hoat-dong',
                nhan: 'Vẫn hoạt động',
                moTa: 'Đã xem, mã này vẫn dùng — đừng nhắc nữa.',
              },
            ] as const
          ).map((o) => (
            <label
              key={o.gt}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
                tt === o.gt ? 'border-[#14264b] bg-[#14264b]/5' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="tt"
                checked={tt === o.gt}
                onChange={() => setTt(o.gt)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">{o.nhan}</span>
                <span className="block text-xs text-slate-500">{o.moTa}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700">
            Lý do {tt === 'dong-ma' && <span className="text-red-500">*</span>}
          </label>
          <textarea
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={
              tt === 'dong-ma'
                ? nv
                  ? 'Vd: nghỉ việc từ 09/2026'
                  : 'Vd: đã gọi, khách nghỉ bán hàng online'
                : 'Không bắt buộc'
            }
            className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:border-[#14264b] focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            Ghi lại người chốt và thời điểm, để sau này tra được vì sao mã bị đóng.
          </p>
        </div>

        {loi && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loi}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={dong}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            Huỷ
          </button>
          <button
            onClick={() => {
              setLoi('');
              luu.mutate();
            }}
            disabled={luu.isPending}
            className="rounded-xl bg-[#14264b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3db8e4] disabled:opacity-50 cursor-pointer"
          >
            {luu.isPending ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
