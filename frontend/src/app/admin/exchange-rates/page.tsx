'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiTrendingUp, FiEdit2, FiCheck, FiX, FiRefreshCw, FiClock, FiEdit3 } from 'react-icons/fi';
import apiClient from '@/lib/api-client';
import { useQuyen } from '@/hooks/use-quyen';

interface ExchangeRate {
  Name: string;
  TyGiaVND: number;
  CongShipVeVN: number;
}

interface ExchangeRateHistory {
  Id: number;
  Name: string;
  TyGiaVND: number;
  CongShipVeVN: number;
  NguoiCapNhat: string | null;
  NgayCapNhat: string;
}

type BulkEdits = Record<string, { tyGiaVND: string; congShipVeVN: string }>;

export default function ExchangeRatesPage() {
  /** Kho chỉ được XEM tỷ giá (quyền `xemTyGia`), nút sửa chỉ hiện khi sửa được danh mục. */
  const { co } = useQuyen();
  const suaDuoc = co('danhMuc.sua');
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Single-row edit state
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editTyGiaVND, setEditTyGiaVND] = useState('');
  const [editCongShipVeVN, setEditCongShipVeVN] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Bulk edit state
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkEdits, setBulkEdits] = useState<BulkEdits>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');

  // History modal state
  const [historyName, setHistoryName] = useState<string | null>(null);
  const [history, setHistory] = useState<ExchangeRateHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchRates = useCallback(async () => {
    setError('');
    try {
      const { data } = await apiClient.get<{ data: ExchangeRate[] }>('/exchange-rates');
      setRates(data.data || []);
    } catch (err) {
      console.error('Failed to fetch exchange rates:', err);
      setError('Không thể tải danh sách tỷ giá');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  // Single-row edit
  const startEdit = (rate: ExchangeRate) => {
    setEditingName(rate.Name);
    setEditTyGiaVND(rate.TyGiaVND?.toString() || '');
    setEditCongShipVeVN(rate.CongShipVeVN?.toString() || '');
    setEditError('');
  };

  const cancelEdit = () => {
    setEditingName(null);
    setEditTyGiaVND('');
    setEditCongShipVeVN('');
    setEditError('');
  };

  const handleSave = async () => {
    if (!editingName) return;
    const tyGia = parseFloat(editTyGiaVND);
    const congShip = parseFloat(editCongShipVeVN);
    if (isNaN(tyGia)) { setEditError('Tỷ giá phải là kiểu số'); return; }
    if (isNaN(congShip)) { setEditError('Công ship về VN phải là kiểu số'); return; }
    setSaving(true);
    setEditError('');
    try {
      await apiClient.put(`/exchange-rates/${editingName}`, {
        name: editingName,
        tyGiaVND: tyGia,
        congShipVeVN: congShip,
      });
      setRates(prev =>
        prev.map(r => r.Name === editingName ? { ...r, TyGiaVND: tyGia, CongShipVeVN: congShip } : r),
      );
      cancelEdit();
    } catch (err) {
      console.error('Failed to update exchange rate:', err);
      setEditError('Cập nhật thất bại, vui lòng thử lại');
    } finally {
      setSaving(false);
    }
  };

  // Bulk edit
  const enterBulkMode = () => {
    const initial: BulkEdits = {};
    for (const r of rates) {
      initial[r.Name] = {
        tyGiaVND: r.TyGiaVND?.toString() || '',
        congShipVeVN: r.CongShipVeVN?.toString() || '',
      };
    }
    setBulkEdits(initial);
    setBulkError('');
    setBulkMode(true);
  };

  const cancelBulkMode = () => {
    setBulkMode(false);
    setBulkEdits({});
    setBulkError('');
  };

  const updateBulkField = (name: string, field: 'tyGiaVND' | 'congShipVeVN', value: string) => {
    setBulkEdits(prev => ({ ...prev, [name]: { ...prev[name], [field]: value } }));
  };

  const handleSaveAll = async () => {
    // Validate all
    for (const [name, vals] of Object.entries(bulkEdits)) {
      if (isNaN(parseFloat(vals.tyGiaVND))) {
        setBulkError(`Tỷ giá của ${name} phải là kiểu số`);
        return;
      }
      if (isNaN(parseFloat(vals.congShipVeVN))) {
        setBulkError(`Công ship của ${name} phải là kiểu số`);
        return;
      }
    }

    setBulkSaving(true);
    setBulkError('');

    const results = await Promise.allSettled(
      rates.map(r => {
        const e = bulkEdits[r.Name];
        if (!e) return Promise.resolve(null);
        return apiClient.put(`/exchange-rates/${r.Name}`, {
          name: r.Name,
          tyGiaVND: parseFloat(e.tyGiaVND),
          congShipVeVN: parseFloat(e.congShipVeVN),
        });
      }),
    );

    const failed = rates.filter((_, i) => results[i].status === 'rejected');

    if (failed.length === 0) {
      setRates(prev =>
        prev.map(r => {
          const e = bulkEdits[r.Name];
          if (!e) return r;
          return { ...r, TyGiaVND: parseFloat(e.tyGiaVND), CongShipVeVN: parseFloat(e.congShipVeVN) };
        }),
      );
      cancelBulkMode();
    } else {
      // Partial success: update successful rows, keep mode open for failed ones
      const failedNames = new Set(failed.map(r => r.Name));
      setRates(prev =>
        prev.map(r => {
          if (failedNames.has(r.Name)) return r;
          const e = bulkEdits[r.Name];
          if (!e) return r;
          return { ...r, TyGiaVND: parseFloat(e.tyGiaVND), CongShipVeVN: parseFloat(e.congShipVeVN) };
        }),
      );
      setBulkError(`Lỗi khi lưu: ${failed.map(r => r.Name).join(', ')}. Vui lòng thử lại.`);
    }

    setBulkSaving(false);
  };

  // History
  const openHistory = async (name: string) => {
    setHistoryName(name);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const { data } = await apiClient.get<{ data: ExchangeRateHistory[] }>(`/exchange-rates/${name}/history`);
      setHistory(data.data || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => setHistoryName(null);

  const formatNumber = (num: number) => {
    if (!num && num !== 0) return '—';
    return num.toLocaleString('vi-VN');
  };

  const formatDateTime = (iso: string) => {
    // API trả về wall-clock giờ VN (gắn hậu tố Z). Format theo UTC để giữ nguyên
    // chữ số giờ VN, không bị dịch theo múi giờ trình duyệt.
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#14264b]/10">
            <FiTrendingUp className="h-5 w-5 text-[#14264b]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Danh mục tỷ giá</h1>
            {!loading && (
              <p className="text-sm text-slate-500">
                Tổng <span className="font-semibold text-slate-700">{rates.length}</span> loại tiền
              </p>
            )}
          </div>
        </div>

        {/* Bulk edit toggle */}
        {suaDuoc && !loading && rates.length > 0 && !editingName && (
          bulkMode ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveAll}
                disabled={bulkSaving}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#14264b] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3a6e] disabled:opacity-60"
              >
                {bulkSaving ? <FiRefreshCw className="h-4 w-4 animate-spin" /> : <FiCheck className="h-4 w-4" />}
                Lưu tất cả
              </button>
              <button
                onClick={cancelBulkMode}
                disabled={bulkSaving}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                <FiX className="h-4 w-4" />
                Huỷ
              </button>
            </div>
          ) : (
            <button
              onClick={enterBulkMode}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            >
              <FiEdit3 className="h-4 w-4" />
              Sửa tất cả
            </button>
          )
        )}
      </div>

      {/* Errors */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
          {error}
        </div>
      )}
      {editError && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-500" />
          {editError}
        </div>
      )}
      {bulkError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
          {bulkError}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-32 animate-pulse rounded bg-slate-100 ml-8" />
                <div className="h-4 w-28 animate-pulse rounded bg-slate-100 ml-8" />
                <div className="h-6 w-14 animate-pulse rounded bg-slate-100 ml-auto" />
              </div>
            ))}
          </div>
        ) : rates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <FiTrendingUp className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">Chưa có dữ liệu tỷ giá</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Loại tiền
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Tỷ giá VND
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Công ship về VN
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rates.map(rate => (
                <tr
                  key={rate.Name}
                  className={`group transition-colors ${bulkMode ? 'bg-blue-50/30' : 'hover:bg-[#14264b]/5'}`}
                >
                  {/* Loại tiền */}
                  <td className="px-6 py-3">
                    <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {rate.Name}
                    </span>
                  </td>

                  {/* Tỷ giá VND */}
                  <td className="px-6 py-3 text-right">
                    {bulkMode ? (
                      <input
                        type="text"
                        value={bulkEdits[rate.Name]?.tyGiaVND ?? ''}
                        onChange={e => updateBulkField(rate.Name, 'tyGiaVND', e.target.value)}
                        disabled={bulkSaving}
                        className="w-36 rounded-lg border border-[#14264b]/40 px-3 py-1.5 text-right text-sm text-slate-800 focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20 disabled:opacity-60"
                      />
                    ) : editingName === rate.Name ? (
                      <input
                        type="text"
                        value={editTyGiaVND}
                        onChange={e => setEditTyGiaVND(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') cancelEdit(); }}
                        autoFocus
                        className="w-36 rounded-lg border border-[#14264b] px-3 py-1.5 text-right text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#14264b]/20"
                      />
                    ) : (
                      <span className="font-medium tabular-nums text-slate-800">
                        {formatNumber(rate.TyGiaVND)}
                      </span>
                    )}
                  </td>

                  {/* Công ship về VN */}
                  <td className="px-6 py-3 text-right">
                    {bulkMode ? (
                      <input
                        type="text"
                        value={bulkEdits[rate.Name]?.congShipVeVN ?? ''}
                        onChange={e => updateBulkField(rate.Name, 'congShipVeVN', e.target.value)}
                        disabled={bulkSaving}
                        className="w-36 rounded-lg border border-[#14264b]/40 px-3 py-1.5 text-right text-sm text-slate-800 focus:border-[#14264b] focus:outline-none focus:ring-2 focus:ring-[#14264b]/20 disabled:opacity-60"
                      />
                    ) : editingName === rate.Name ? (
                      <input
                        type="text"
                        value={editCongShipVeVN}
                        onChange={e => setEditCongShipVeVN(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') cancelEdit(); }}
                        className="w-36 rounded-lg border border-[#14264b] px-3 py-1.5 text-right text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#14264b]/20"
                      />
                    ) : (
                      <span className="font-medium tabular-nums text-slate-800">
                        {formatNumber(rate.CongShipVeVN)}
                      </span>
                    )}
                  </td>

                  {/* Thao tác */}
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      {bulkMode ? (
                        <span className="text-xs text-slate-400 italic">—</span>
                      ) : editingName === rate.Name ? (
                        <>
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            {saving ? <FiRefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FiCheck className="h-3.5 w-3.5" />}
                            Lưu
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
                          >
                            <FiX className="h-3.5 w-3.5" />
                            Huỷ
                          </button>
                        </>
                      ) : (
                        <>
                          {suaDuoc && <button
                            onClick={() => startEdit(rate)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                          >
                            <FiEdit2 className="h-3.5 w-3.5" />
                            Sửa
                          </button>}
                          <button
                            onClick={() => openHistory(rate.Name)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <FiClock className="h-3.5 w-3.5" />
                            Lịch sử
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* History modal */}
      {historyName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeHistory}>
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <FiClock className="h-4 w-4 text-slate-500" />
                <span className="font-semibold text-slate-800">
                  Lịch sử tỷ giá — <span className="text-[#14264b]">{historyName}</span>
                </span>
              </div>
              <button onClick={closeHistory} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <FiRefreshCw className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">Chưa có lịch sử thay đổi</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50/90">
                    <tr className="border-b border-slate-100">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Ngày</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Tỷ giá VND</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Công ship VN</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Người sửa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {history.map((h, i) => (
                      <tr key={h.Id} className={i === 0 ? 'bg-[#14264b]/5' : 'hover:bg-slate-50'}>
                        <td className="px-5 py-2.5 text-slate-600">{formatDateTime(h.NgayCapNhat)}</td>
                        <td className="px-5 py-2.5 text-right font-medium tabular-nums text-slate-800">{formatNumber(h.TyGiaVND)}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{formatNumber(h.CongShipVeVN)}</td>
                        <td className="px-5 py-2.5 text-slate-500">{h.NguoiCapNhat || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
