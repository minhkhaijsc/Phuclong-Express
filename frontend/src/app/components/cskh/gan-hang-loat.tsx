'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FiDownload, FiUpload, FiX } from 'react-icons/fi';
import { ganCskhHangLoat, type DongGanCskh, type KetQuaDatTuoiNoHangLoat } from '@/lib/api';
import { downloadDataAsExcel, readExcelSheetNames, readExcelSheetRows } from '@/lib/excel-download';

/**
 * Gán CSKH phụ trách HÀNG LOẠT bằng file Excel — yêu cầu bên khách 23/10/2026:
 * "gán danh sách khách theo mỗi nv sales phụ trách chính".
 *
 * Lúc làm, cả 943 mã khách đều chưa gán; bấm từng người trên màn chi tiết là
 * cả buổi. Đi theo đúng mẫu "Đặt tuổi nợ hàng loạt": file mẫu đổ sẵn danh sách,
 * người làm chỉ sửa cột thứ hai rồi tải lên. Dòng nào sai thì báo riêng dòng
 * đó, phần còn lại vẫn ghi.
 *
 * Chỉ Admin / Trưởng phòng / Phó phòng thấy hộp này (`phanKhachCskh`) — máy
 * chủ cũng chặn y như vậy.
 */

const TIEU_DE = ['Mã khách', 'CSKH phụ trách', 'Họ tên khách (chỉ để tra)'];

export function GanCskhHangLoat({
  danhSach,
  dsCskh,
  onXong,
  onDong,
}: {
  danhSach: { UserName: string; HoTen?: string | null; CSKHPhuTrach: string | null }[];
  dsCskh: { username: string; hoTen: string }[];
  onXong: () => void;
  onDong: () => void;
}) {
  const oFile = useRef<HTMLInputElement>(null);
  const [tenFile, setTenFile] = useState('');
  const [dong, setDong] = useState<DongGanCskh[]>([]);
  const [loiDoc, setLoiDoc] = useState('');
  const [ketQua, setKetQua] = useState<KetQuaDatTuoiNoHangLoat | null>(null);

  const taiMau = () => {
    downloadDataAsExcel(
      [
        TIEU_DE,
        ...danhSach.map((u) => [
          String(u.UserName ?? '').trim(),
          String(u.CSKHPhuTrach ?? '').trim(),
          u.HoTen ?? '',
        ]),
      ],
      `GanCSKH_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`,
      undefined,
      undefined,
      // Mã khách để dạng CHỮ: mã toàn số thì Excel tự đổi thành số và cắt số 0 đầu.
      ['Mã khách'],
    );
  };

  const docFile = async (f: File) => {
    setLoiDoc('');
    setKetQua(null);
    setDong([]);
    setTenFile(f.name);
    try {
      const sheets = await readExcelSheetNames(f);
      if (!sheets.length) {
        setLoiDoc('File không có sheet nào.');
        return;
      }
      const rows = await readExcelSheetRows(f, sheets[0]);
      // Dòng 1 là tiêu đề. Chỉ đọc hai cột đầu; cột họ tên chỉ để người làm tra.
      const duLieu = rows
        .slice(1)
        .filter((r) => String(r?.[0] ?? '').trim() !== '')
        .map((r) => ({
          khach: String(r[0] ?? '').trim(),
          cskh: String(r[1] ?? '').trim(),
        }));
      if (!duLieu.length) {
        setLoiDoc('Không có dòng dữ liệu nào (dòng 1 là tiêu đề).');
        return;
      }
      setDong(duLieu);
    } catch {
      setLoiDoc('Không đọc được file. Cần file .xlsx.');
    }
  };

  const ghi = useMutation({
    mutationFn: () => ganCskhHangLoat(dong),
    onSuccess: (kq) => {
      setKetQua(kq);
      if (kq.soDaGhi > 0) onXong();
    },
    onError: (e: any) => setLoiDoc(e?.response?.data?.message || 'Ghi không được'),
  });

  const soDaGan = dong.filter((d) => d.cskh !== '').length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-semibold text-[#14264b]">Gán CSKH phụ trách hàng loạt</div>
        <button onClick={onDong} className="rounded p-1 text-slate-400 hover:bg-slate-100" title="Đóng">
          <FiX size={16} />
        </button>
      </div>

      <ol className="mb-3 list-inside list-decimal space-y-1 text-sm text-slate-600">
        <li>Tải file mẫu — đã có sẵn mọi mã khách và CSKH đang phụ trách.</li>
        <li>
          Điền cột <strong>CSKH phụ trách</strong> bằng <strong>tên đăng nhập</strong> của sales. Để trống =
          chưa gán (sales nào cũng xem được liên hệ của khách đó).
        </li>
        <li>Tải file lên rồi bấm Ghi.</li>
      </ol>

      {dsCskh.length > 0 && (
        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Tên đăng nhập hợp lệ:{' '}
          {dsCskh.map((c, i) => (
            <span key={c.username}>
              {i > 0 ? ' · ' : ''}
              <code className="text-slate-700">{c.username}</code>
              {c.hoTen && c.hoTen !== c.username ? ` (${c.hoTen})` : ''}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={taiMau}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          <FiDownload size={14} /> Tải file mẫu ({danhSach.length} mã)
        </button>

        <input
          ref={oFile}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) docFile(f);
            // Xoá giá trị để chọn LẠI CÙNG MỘT FILE vẫn kích hoạt onChange.
            e.target.value = '';
          }}
        />
        <button
          onClick={() => oFile.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          <FiUpload size={14} /> Chọn file
        </button>

        {tenFile ? <span className="text-sm text-slate-500">{tenFile}</span> : null}
      </div>

      {loiDoc ? <div className="mt-3 text-sm text-red-600">{loiDoc}</div> : null}

      {dong.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2 text-sm">
            <span>
              Đọc được <strong>{dong.length}</strong> dòng — <strong>{soDaGan}</strong> dòng có CSKH,{' '}
              {dong.length - soDaGan} dòng để trống
            </span>
            <button
              onClick={() => ghi.mutate()}
              disabled={ghi.isPending}
              className="rounded-lg bg-[#14264b] px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {ghi.isPending ? 'Đang ghi…' : `Ghi ${dong.length} dòng`}
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {dong.slice(0, 50).map((d, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-1.5 text-slate-700">{d.khach}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600">
                      {d.cskh === '' ? <span className="text-slate-300">(chưa gán)</span> : d.cskh}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dong.length > 50 && (
              <div className="px-3 py-2 text-xs text-slate-500">… còn {dong.length - 50} dòng nữa</div>
            )}
          </div>
        </div>
      )}

      {ketQua && (
        <div className="mt-4 space-y-2 text-sm">
          <div className="text-emerald-700">
            Đã ghi <strong>{ketQua.soDaGhi}</strong> mã khách
            {ketQua.soKhongDoi > 0 ? ` · ${ketQua.soKhongDoi} dòng giữ nguyên vì không đổi` : ''}
          </div>
          {ketQua.loi.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="mb-1 font-medium text-red-700">
                {ketQua.loi.length} dòng không ghi được — những dòng còn lại vẫn đã ghi:
              </div>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto text-red-600">
                {ketQua.loi.map((l, i) => (
                  <li key={i}>
                    Dòng {l.dong}
                    {l.khach ? ` (${l.khach})` : ''}: {l.lyDo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
