'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FiDownload, FiUpload, FiX } from 'react-icons/fi';
import {
  datTuoiNoHangLoat,
  type DongDatTuoiNo,
  type KetQuaDatTuoiNoHangLoat,
  type TuoiNoDong,
} from '@/lib/api';
import { downloadDataAsExcel, readExcelSheetNames, readExcelSheetRows } from '@/lib/excel-download';

/**
 * Đặt tuổi nợ HÀNG LOẠT bằng file Excel.
 *
 * Vì sao không dùng màn "Nhập Excel" của TÀI KHOẢN như bên khách hình dung:
 * phần nhập đó ghi vào những cột KHÔNG TỒN TẠI trong CSDL (`ho_ten`,
 * `vung_mien`, `dia_chi`… trong khi bảng tên là `HoTen`, `VungMien`, `DiaChi`),
 * nên mọi dòng đều rơi vào `catch` và bị đếm là lỗi — màn đó chưa bao giờ chạy
 * được. Thêm một cột nữa vào đó là thêm vào chỗ hỏng.
 *
 * File mẫu ĐỔ SẴN danh sách khách đang còn nợ kèm tuổi nợ hiện tại, nên kế toán
 * chỉ việc sửa cột thứ hai rồi tải lên — không phải gõ lại mã khách, cũng không
 * gõ nhầm.
 */

const TIEU_DE = ['Mã khách', 'Tuổi nợ (ngày)'];

export function NhapTuoiNoHangLoat({
  danhSach,
  onXong,
  onDong,
}: {
  danhSach: TuoiNoDong[];
  onXong: () => void;
  onDong: () => void;
}) {
  const oFile = useRef<HTMLInputElement>(null);
  const [tenFile, setTenFile] = useState('');
  const [dong, setDong] = useState<DongDatTuoiNo[]>([]);
  const [loiDoc, setLoiDoc] = useState('');
  const [ketQua, setKetQua] = useState<KetQuaDatTuoiNoHangLoat | null>(null);

  const taiMau = () => {
    downloadDataAsExcel(
      [
        TIEU_DE,
        ...danhSach.map((d) => [d.khach.trim(), d.tuoiNo === null ? '' : d.tuoiNo]),
      ],
      `TuoiNo_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`,
      undefined,
      undefined,
      // Mã khách phải để dạng CHỮ: có mã toàn số, Excel tự đổi thành số rồi cắt
      // mất số 0 đứng đầu.
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
      // Dòng 1 là tiêu đề. Bỏ nốt những dòng trống hoàn toàn ở cuối file.
      const duLieu = rows
        .slice(1)
        .filter((r) => String(r?.[0] ?? '').trim() !== '')
        .map((r) => ({
          khach: String(r[0] ?? '').trim(),
          tuoiNo: (r[1] ?? '') as string | number,
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
    mutationFn: () => datTuoiNoHangLoat(dong),
    onSuccess: (kq) => {
      setKetQua(kq);
      if (kq.soDaGhi > 0) onXong();
    },
    onError: (e: any) => setLoiDoc(e?.response?.data?.message || 'Ghi không được'),
  });

  const soTrong = dong.filter((d) => String(d.tuoiNo ?? '').trim() === '').length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-medium text-[#14264b]">Đặt tuổi nợ hàng loạt</div>
        <button onClick={onDong} className="rounded p-1 text-gray-400 hover:bg-gray-100" title="Đóng">
          <FiX size={16} />
        </button>
      </div>

      <ol className="mb-4 list-inside list-decimal space-y-1 text-sm text-gray-600">
        <li>Tải file mẫu — đã có sẵn mã khách đang còn nợ và tuổi nợ hiện tại.</li>
        <li>Sửa cột <strong>Tuổi nợ (ngày)</strong>. Để trống = chưa có thoả thuận; <code>0</code> = phải trả ngay.</li>
        <li>Tải file lên rồi bấm Ghi.</li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={taiMau}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          <FiDownload size={14} /> Tải file mẫu ({danhSach.length} khách)
        </button>

        <input
          ref={oFile}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) docFile(f);
            // Xoá giá trị để chọn LẠI CÙNG MỘT FILE vẫn kích hoạt onChange —
            // kế toán sửa file rồi chọn lại chính nó là chuyện thường.
            e.target.value = '';
          }}
        />
        <button
          onClick={() => oFile.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          <FiUpload size={14} /> Chọn file
        </button>

        {tenFile ? <span className="text-sm text-gray-500">{tenFile}</span> : null}
      </div>

      {loiDoc ? <div className="mt-3 text-sm text-red-600">{loiDoc}</div> : null}

      {dong.length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50 px-3 py-2 text-sm">
            <span>
              Đọc được <strong>{dong.length}</strong> dòng
              {soTrong > 0 ? ` — ${soTrong} dòng để trống (sẽ xoá thoả thuận)` : ''}
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
                    <td className="px-3 py-1.5 text-gray-700">{d.khach}</td>
                    <td className="px-3 py-1.5 text-right text-gray-600">
                      {String(d.tuoiNo ?? '').trim() === '' ? (
                        <span className="text-gray-300">(để trống)</span>
                      ) : (
                        String(d.tuoiNo)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dong.length > 50 && (
              <div className="px-3 py-2 text-xs text-gray-500">… còn {dong.length - 50} dòng nữa</div>
            )}
          </div>
        </div>
      )}

      {ketQua && (
        <div className="mt-4 space-y-2 text-sm">
          <div className="text-emerald-700">
            Đã ghi <strong>{ketQua.soDaGhi}</strong> mã khách
            {ketQua.soKhongDoi > 0 ? ` · ${ketQua.soKhongDoi} dòng giữ nguyên vì giá trị không đổi` : ''}
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
