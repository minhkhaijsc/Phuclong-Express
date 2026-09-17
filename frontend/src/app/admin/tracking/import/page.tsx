'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  FiArrowLeft,
  FiCheck,
  FiChevronRight,
  FiDownload,
  FiFile,
  FiUpload,
  FiX,
} from 'react-icons/fi';
import apiClient from '@/lib/api-client';

/**
 * Tracking Excel Import page
 *
 * Converted from admin/Tracking_Import.aspx.
 *   ?m=1 → edit-existing mode (lookup by TrackingNumber, choose columns to update)
 *   otherwise → create new tracking rows
 *
 * Flow: pick file → pick sheet → preview/validate → commit → done.
 */

type Step = 'select-file' | 'choose-sheet' | 'preview' | 'finished';

interface PreviewRow {
  excelRowIndex: number;
  trackingNumber: string;
  tenQuocGia: string;
  username: string;
  orderNumber: string;
  ngayDatHang: string;
  tenNhaVanChuyen: string;
  tinhTrang: string;
  ghiChu: string;
  kien: string;
  mawb: string;
  hawb: string;
  ghiChuLoHang: string;
  errors: string[];
}

interface ImportResult {
  rows: PreviewRow[];
  errorCount: number;
  imported: number;
  committed: boolean;
}

const EDIT_COLUMNS = [
  { idx: 0, label: 'Quốc gia' },
  { idx: 1, label: 'Khách hàng' },
  { idx: 2, label: 'Order number' },
  { idx: 3, label: 'Ngày đặt hàng' },
  { idx: 4, label: 'Nhà vận chuyển' },
  { idx: 5, label: 'Tình trạng' },
  { idx: 6, label: 'Ghi chú' },
  { idx: 7, label: 'Kiện' },
  { idx: 8, label: 'Mawb' },
  { idx: 9, label: 'Hawb' },
  { idx: 10, label: 'Ghi chú lô hàng' },
];

const PREVIEW_COLS: { key: keyof PreviewRow; label: string }[] = [
  { key: 'excelRowIndex', label: 'Row' },
  { key: 'trackingNumber', label: 'Số tracking' },
  { key: 'tenQuocGia', label: 'Quốc gia' },
  { key: 'username', label: 'Khách hàng' },
  { key: 'orderNumber', label: 'Order number' },
  { key: 'ngayDatHang', label: 'Ngày đặt hàng' },
  { key: 'tenNhaVanChuyen', label: 'Nhà vận chuyển' },
  { key: 'tinhTrang', label: 'Tình trạng' },
  { key: 'ghiChu', label: 'Ghi chú' },
  { key: 'kien', label: 'Kiện' },
  { key: 'mawb', label: 'Mawb' },
  { key: 'hawb', label: 'Hawb' },
  { key: 'ghiChuLoHang', label: 'Ghi chú lô hàng' },
];

const btnPrimary =
  'inline-flex items-center gap-2 rounded-xl bg-[#14264b] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm shadow-cyan-300/40';
const btnSecondary =
  'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50';

async function postSheets(file: File): Promise<{ sheets: string[] }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiClient.post<{ sheets: string[] }>(
    '/tracking/import/sheets',
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return res.data;
}

async function postImport(args: {
  file: File;
  sheetName: string;
  mode: '0' | '1';
  editColumns: number[];
  commit: boolean;
}): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', args.file);
  fd.append('sheetName', args.sheetName);
  fd.append('mode', args.mode);
  fd.append('commit', args.commit ? 'true' : 'false');
  if (args.editColumns.length > 0) {
    fd.append('editColumns', args.editColumns.join(','));
  }
  const res = await apiClient.post<ImportResult>('/tracking/import', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export default function TrackingImportPage() {
  const search = useSearchParams();
  const editMode = search?.get('m') === '1';
  const mode: '0' | '1' = editMode ? '1' : '0';
  const title = editMode ? 'CHỈNH SỬA TRACKING' : 'THÊM MỚI TRACKING';

  const [step, setStep] = useState<Step>('select-file');
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState('');
  const [editColumns, setEditColumns] = useState<number[]>([5]); // default = Tình trạng (matches legacy)
  const [preview, setPreview] = useState<ImportResult | null>(null);

  const sheetsMutation = useMutation({
    mutationFn: (f: File) => postSheets(f),
    onSuccess: (data) => {
      setSheets(data.sheets);
      setSheetName(data.sheets[0] || '');
      setStep('choose-sheet');
    },
    onError: (err) => alert(`Lỗi đọc file: ${(err as Error).message}`),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      postImport({ file: file!, sheetName, mode, editColumns, commit: false }),
    onSuccess: (data) => {
      setPreview(data);
      setStep('preview');
    },
    onError: (err) => alert(`Lỗi kiểm tra dữ liệu: ${(err as Error).message}`),
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      postImport({ file: file!, sheetName, mode, editColumns, commit: true }),
    onSuccess: (data) => {
      setPreview(data);
      setStep('finished');
    },
    onError: (err) => alert(`Lỗi import: ${(err as Error).message}`),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      alert('Vui lòng chọn file .xlsx');
      return;
    }
    setFile(f);
    sheetsMutation.mutate(f);
  };

  const toggleEditColumn = (idx: number) =>
    setEditColumns((prev) =>
      prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx],
    );

  const reset = () => {
    setStep('select-file');
    setFile(null);
    setSheets([]);
    setSheetName('');
    setEditColumns([5]);
    setPreview(null);
  };

  const errorCount = preview?.errorCount ?? 0;
  const totalRows = preview?.rows.length ?? 0;
  const validRows = totalRows - errorCount;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-bold ${editMode ? 'text-rose-600' : 'text-slate-900'}`}>
            {title}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Nhập dữ liệu tracking từ file Excel (.xlsx)
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
        <Link
          href="/admin/tracking/import"
          className={`rounded-lg px-3 py-1.5 ${!editMode ? 'bg-[#14264b] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Thêm mới tracking bằng excel
        </Link>
        <Link
          href="/admin/tracking/import?m=1"
          className={`rounded-lg px-3 py-1.5 ${editMode ? 'bg-[#14264b] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Chỉnh sửa tracking bằng excel
        </Link>
        <Link href="/admin/tracking/anh" className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100">
          Up ảnh tracking
        </Link>
      </div>

      {/* Step 1: File upload */}
      {step === 'select-file' && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-700">
            <span className="rounded-full bg-[#14264b] px-2 py-0.5 text-xs font-semibold text-white">Bước 1</span>
            <span className="font-medium">Upload file Excel</span>
          </div>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 transition-colors hover:border-[#14264b] hover:bg-slate-100">
            <FiUpload className="h-8 w-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              {sheetsMutation.isPending ? 'Đang đọc file...' : 'Chọn file .xlsx'}
            </span>
            <span className="text-xs text-slate-500">
              Hoặc kéo và thả file vào đây
            </span>
            <input
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              className="hidden"
              disabled={sheetsMutation.isPending}
            />
          </label>
          <div className="mt-3 flex justify-end">
            <a
              href="/ImportTrackingTemplate.xlsx"
              download
              className="inline-flex items-center gap-2 text-sm text-[#14264b] hover:underline"
            >
              <FiDownload className="h-4 w-4" /> Tải về mẫu dữ liệu Excel
            </a>
          </div>
        </div>
      )}

      {/* Step 2: Choose sheet */}
      {step === 'choose-sheet' && file && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-700">
            <span className="rounded-full bg-[#14264b] px-2 py-0.5 text-xs font-semibold text-white">Bước 2</span>
            <span className="font-medium">Chọn sheet</span>
          </div>
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <FiFile className="h-4 w-4" />
            <span className="truncate">{file.name}</span>
          </div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Sheet chứa dữ liệu</label>
          <select
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20"
          >
            {sheets.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {editMode && (
            <>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Chọn cột muốn chỉnh sửa
              </label>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {EDIT_COLUMNS.map((c) => (
                  <label
                    key={c.idx}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={editColumns.includes(c.idx)}
                      onChange={() => toggleEditColumn(c.idx)}
                      className="h-4 w-4 rounded border-slate-300 accent-[#14264b]"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={reset} className={btnSecondary}>
              <FiArrowLeft className="h-4 w-4" /> Lui lại
            </button>
            <button
              onClick={() => previewMutation.mutate()}
              disabled={!sheetName || previewMutation.isPending}
              className={btnPrimary}
            >
              {previewMutation.isPending ? 'Đang kiểm tra...' : 'Tiếp tục'}
              <FiChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview/validate */}
      {step === 'preview' && preview && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-700">
            <span className="rounded-full bg-[#14264b] px-2 py-0.5 text-xs font-semibold text-white">Bước 3</span>
            <span className="font-medium">Kiểm tra dữ liệu</span>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">Tổng số dòng</div>
              <div className="text-lg font-bold text-slate-800">{totalRows}</div>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2">
              <div className="text-xs text-emerald-600">Hợp lệ</div>
              <div className="text-lg font-bold text-emerald-700">{validRows}</div>
            </div>
            <div className="rounded-lg bg-rose-50 px-3 py-2">
              <div className="text-xs text-rose-600">Lỗi</div>
              <div className="text-lg font-bold text-rose-700">{errorCount}</div>
            </div>
          </div>

          {totalRows === 0 ? (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Không tìm thấy dữ liệu nào trong sheet này.
            </div>
          ) : (
            <div className="max-h-[500px] overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200">
                    {PREVIEW_COLS.map((c) => (
                      <th key={c.key} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-600">
                        {c.label}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-600">
                      Lỗi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => {
                    const bad = r.errors.length > 0;
                    return (
                      <tr key={r.excelRowIndex} className={`border-b border-slate-100 ${bad ? 'bg-rose-50' : ''}`}>
                        {PREVIEW_COLS.map((c) => (
                          <td key={c.key} className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                            {String(r[c.key] ?? '')}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-rose-700">
                          {r.errors.join('; ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setStep('choose-sheet')} className={btnSecondary}>
              <FiArrowLeft className="h-4 w-4" /> Lui lại
            </button>
            <button
              onClick={() => commitMutation.mutate()}
              disabled={commitMutation.isPending || validRows === 0}
              className={btnPrimary}
            >
              <FiCheck className="h-4 w-4" />
              {commitMutation.isPending ? 'Đang import...' : `Đồng ý thực hiện (${validRows} dòng)`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Finished */}
      {step === 'finished' && preview && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-700">
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white">Bước 4</span>
            <span className="font-medium">Hoàn tất</span>
          </div>
          <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Đã import thành công <b>{preview.imported}</b> dòng dữ liệu.
            {preview.errorCount > 0 && (
              <span className="ml-2 text-rose-700">
                ({preview.errorCount} dòng bị bỏ qua do lỗi)
              </span>
            )}
          </div>
          {preview.errorCount > 0 && (
            <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-slate-600">Xem các dòng lỗi đã bỏ qua</summary>
              <ul className="mt-2 list-inside list-disc space-y-1 text-rose-700">
                {preview.rows
                  .filter((r) => r.errors.length > 0)
                  .map((r) => (
                    <li key={r.excelRowIndex}>
                      Dòng {r.excelRowIndex}: {r.errors.join('; ')}
                    </li>
                  ))}
              </ul>
            </details>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={reset} className={btnSecondary}>
              <FiUpload className="h-4 w-4" /> Import tiếp
            </button>
            <Link href="/admin/tracking/anh" className={btnSecondary}>
              <FiUpload className="h-4 w-4" /> Up ảnh cho tracking
            </Link>
            <Link href="/admin/tracking" className={btnPrimary}>
              <FiX className="h-4 w-4" /> Kết thúc
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
