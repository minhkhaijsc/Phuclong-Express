'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import {
  getDebtManagementList,
  getDebtReportUsers,
  getBankAccounts,
  getBatchesByUsername,
  getQuocGia,
  getQuocGiaTatCa,
  createDebt,
  updateDebt,
  deleteDebt,
  approveDebt,
  DebtManagementItem,
  BatchItem,
  UpdateDebtParams,
} from '@/lib/api';
import { useCurrentUser } from '@/hooks/use-auth';
import { useAuth } from '@/hooks/use-auth-context';
import { useLocalStorageHistory } from '@/hooks/use-localstorage-history';

const DEBT_MANAGEMENT_ALLOWED_ROLES = ['admin', 'order', 'sale'];

const NOI_DUNG_HISTORY_KEY = 'debt-management:noi-dung-history';
const NOI_DUNG_HISTORY_MAX = 50;
const NOI_DUNG_SUGGESTIONS_WHEN_EMPTY = 10;
import {
  FiUpload,
  FiDownload,
  FiFilter,
  FiEdit2,
  FiTrash2,
  FiCheck,
  FiX,
  FiCalendar,
  FiUser,
  FiCreditCard,
  FiFileText,
  FiChevronDown,
  FiChevronUp,
  FiLoader,
} from 'react-icons/fi';
import { downloadDataAsExcel } from '@/lib/excel-download';

/**
 * Tính tổng sản lượng (kg) từ chuỗi nhiều số cách nhau bằng dấu cách.
 * Chỉ chấp nhận chữ số, dấu cách và dấu chấm (thập phân).
 * Ví dụ: "12.5 3 4.2" -> 19.7. Token không hợp lệ bị bỏ qua. Làm tròn 2 chữ số thập phân.
 */
const parseSanLuongTotal = (raw: string): number => {
  if (!raw) return 0;
  const total = raw
    .trim()
    .split(/\s+/)
    .map((t) => parseFloat(t))
    .filter((n) => !isNaN(n))
    .reduce((sum, n) => sum + n, 0);
  return Math.round(total * 10000) / 10000;
};

/**
 * Debt Management Page
 *
 * Converted from admin/ManageCongNo.aspx
 * Features:
 * - Filter panel: username, status, date range, bank account
 * - Data table with debt records
 * - Add/Edit/Delete/Approve operations
 * - Pagination
 *
 * UI/UX: Professional enterprise admin dashboard with cyan theme
 */
export default function DebtManagementPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const hasDebtAccess = (authUser?.roles ?? []).some((role) =>
    DEBT_MANAGEMENT_ALLOWED_ROLES.includes(role.toLowerCase())
  );

  // Chỉ role admin/order/sale được thao tác công nợ; role khác bị đá về trang chủ admin.
  useEffect(() => {
    if (!authLoading && !hasDebtAccess) {
      router.replace('/admin');
    }
  }, [authLoading, hasDebtAccess, router]);

  const getTodayFormatted = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  /**
   * Hôm nay dạng yyyy-MM-dd — đúng dạng ô <input type="date"> yêu cầu.
   * Lấy theo giờ địa phương chứ không dùng toISOString(): buổi tối ở Việt Nam
   * thì giờ UTC đã sang ngày hôm trước, lô hàng sẽ lệch một ngày.
   */
  const homNayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /** yyyy-MM-dd -> dd/MM/yyyy, để ghép vào Nội dung cho người đọc. */
  const ngayVN = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || '';
  };

  /**
   * Ngày của một lô hàng, dạng yyyy-MM-dd.
   * Cắt thẳng phần ngày trong chuỗi máy chủ trả về, KHÔNG đưa qua new Date():
   * "2026-09-05T00:00:00.000Z" đổi sang giờ Việt Nam sẽ thành 05/09 hay 04/09
   * tuỳ máy, mà ở đây chỉ cần đúng con số ngày đã lưu.
   */
  const ngayCuaLo = (b: { NgayLoHang?: string }) => {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(b?.NgayLoHang ?? ''));
    return m ? m[1] : '';
  };

  // Filter state
  const [filters, setFilters] = useState({
    page: 1,
    limit: 200,
    username: '',
    status: -1,
    loaiPhatSinh: '' as string | null,
    bankAccount: '',
    fromDate: '',
    toDate: '',
    // Lọc theo tuyến; chuỗi rỗng = không lọc, khớp cách các bộ lọc khác đang làm.
    quocGiaId: '' as string,
  });

  // Form state for adding/editing debt inline on the page
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newDebt, setNewDebt] = useState({
    username: '',
    noiDung: '',
    ngay: getTodayFormatted(),
    dr: 0,
    cr: 0,
    ghiChu: '',
    loHangId: undefined as number | undefined,
    loHangText: homNayISO() as string,
    loaiPhatSinh: 2,
    bankAccount: '' as string,
    sanLuongInput: '', // Chuỗi nhập sản lượng (kg), nhiều số cách nhau bằng dấu cách. Chỉ dùng khi loaiPhatSinh === 8
    quocGiaId: undefined as number | undefined,
  });

  // UI State
  const [showFilters, setShowFilters] = useState(true);
  const [usernameInput, setUsernameInput] = useState('');
  const [showUsernameDropdown, setShowUsernameDropdown] = useState(false);
  const [activeUsernameIndex, setActiveUsernameIndex] = useState(0);
  const [filterUsernameInput, setFilterUsernameInput] = useState('');
  const [showFilterUsernameDropdown, setShowFilterUsernameDropdown] = useState(false);
  const [activeFilterUsernameIndex, setActiveFilterUsernameIndex] = useState(0);
  const [showNoiDungDropdown, setShowNoiDungDropdown] = useState(false);
  const [activeNoiDungIndex, setActiveNoiDungIndex] = useState(0);

  const { history: noiDungHistory, addEntry: addNoiDungHistory } = useLocalStorageHistory(
    NOI_DUNG_HISTORY_KEY,
    NOI_DUNG_HISTORY_MAX,
  );

  // Date input refs for flatpickr
  const fromDateRef = useRef<HTMLInputElement>(null);
  const toDateRef = useRef<HTMLInputElement>(null);
  const formDateRef = useRef<HTMLInputElement>(null);

  // Refs/state cho thanh scroll ngang TỰ VẼ ghim ở đáy (không dùng scrollbar OS vì hay bị ép mỏng).
  // Vị trí thumb cập nhật trực tiếp qua DOM ref (không setState) để tránh re-render cả bảng -> không lag.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startX: number; startScroll: number } | null>(null);
  const [tableScrollSize, setTableScrollSize] = useState({ scroll: 0, client: 0 });

  // Đặt vị trí thumb theo scrollLeft hiện tại (ghi thẳng style, không qua React)
  const updateThumbPosition = useCallback(() => {
    const el = tableScrollRef.current;
    const thumb = thumbRef.current;
    if (!el || !thumb || el.scrollWidth <= 0) return;
    thumb.style.left = `${(el.scrollLeft / el.scrollWidth) * 100}%`;
  }, []);

  const resetDebtForm = () => {
    setNewDebt({
      username: '',
      noiDung: '',
      ngay: getTodayFormatted(),
      dr: 0,
      cr: 0,
      ghiChu: '',
      loHangId: undefined,
      loHangText: homNayISO(),
      loaiPhatSinh: 2,
      bankAccount: '',
      sanLuongInput: '',
      quocGiaId: undefined,
    });
    setUsernameInput('');
    setEditingId(null);
    // Cho phép Nội dung tự điền trở lại: nếu vừa sửa một dòng cũ xong mới thêm
    // dòng mới, cờ này còn bật thì ô Nội dung nằm im, CSKH lại phải gõ tay.
    setNoiDungTuGo(false);
    setErrorMessage(null);
  };

  const getMutationErrorMessage = (error: unknown, fallback: string) => {
    if (typeof error === 'object' && error !== null && 'response' in error) {
      const response = (error as { response?: { data?: { message?: string } } }).response;
      return response?.data?.message || fallback;
    }

    return fallback;
  };

  const handleFilterChange = useCallback((key: keyof typeof filters, value: string | number | null) => {
    // Convert "-1" to null for loaiPhatSinh filter
    if (key === 'loaiPhatSinh' && value === '-1') {
      setFilters((prev) => ({ ...prev, [key]: null, page: 1 }));
    } else {
      setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
    }
  }, []);

  // Initialize flatpickr for filter date inputs
  useEffect(() => {
    if (fromDateRef.current && toDateRef.current) {
      const fpFrom = flatpickr(fromDateRef.current, {
        dateFormat: 'd/m/Y',
        onChange: (dates) => {
          if (dates[0]) {
            const d = dates[0];
            const formatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            handleFilterChange('fromDate', formatted);
          }
        },
      });
      const fpTo = flatpickr(toDateRef.current, {
        dateFormat: 'd/m/Y',
        onChange: (dates) => {
          if (dates[0]) {
            const d = dates[0];
            const formatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            handleFilterChange('toDate', formatted);
          }
        },
      });
      return () => {
        fpFrom.destroy();
        fpTo.destroy();
      };
    }
  }, [handleFilterChange]);

  // Initialize flatpickr for inline form date input
  useEffect(() => {
    if (formDateRef.current) {
      const fp = flatpickr(formDateRef.current, {
        dateFormat: 'd/m/Y',
        defaultDate: newDebt.ngay ? newDebt.ngay : undefined,
        onChange: (dates) => {
          if (dates[0]) {
            const d = dates[0];
            const formatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            setNewDebt((prev) => ({ ...prev, ngay: formatted }));
          }
        },
      });
      return () => {
        fp.destroy();
      };
    }
  }, [newDebt.ngay]);

  // Fetch debt list
  const { data, isLoading, error } = useQuery({
    queryKey: ['debt-management', filters],
    queryFn: () => getDebtManagementList(filters),
    enabled: hasDebtAccess,
  });

  // Đo bề rộng nội dung/khung của bảng để biết khi nào cần thanh scroll ngang ghim.
  // Theo dõi cả thay đổi dữ liệu lẫn resize cửa sổ/khung bảng.
  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const measure = () => {
      setTableScrollSize({ scroll: el.scrollWidth, client: el.clientWidth });
      updateThumbPosition();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [data]);

  // Bảng cuộn (bằng trackpad/shift+wheel) -> chỉ ghi lại vị trí thumb qua DOM (không setState)
  const handleTableScroll = () => updateThumbPosition();

  // Kéo thumb -> đổi scrollLeft của bảng. Dùng pointer events + listener trên window để kéo mượt ra ngoài thumb.
  const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!tableScrollRef.current) return;
    dragStateRef.current = { startX: e.clientX, startScroll: tableScrollRef.current.scrollLeft };

    const trackWidth = tableScrollSize.client;
    const maxScroll = tableScrollSize.scroll - tableScrollSize.client;
    if (trackWidth <= 0 || maxScroll <= 0) return;
    const scrollPerPx = tableScrollSize.scroll / trackWidth; // px chuột -> px nội dung

    const onMove = (ev: PointerEvent) => {
      if (!dragStateRef.current || !tableScrollRef.current) return;
      const dx = ev.clientX - dragStateRef.current.startX;
      const next = Math.min(maxScroll, Math.max(0, dragStateRef.current.startScroll + dx * scrollPerPx));
      tableScrollRef.current.scrollLeft = next; // 'scroll' event sẽ tự gọi updateThumbPosition
    };
    const onUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Fetch users for dropdown
  const { data: users } = useQuery({
    queryKey: ['debt-report-users'],
    queryFn: getDebtReportUsers,
  });

  const filteredUsernames = useMemo(() => {
    const search = usernameInput.trim().toLowerCase();
    return (users || [])
      .filter((user) => !search || user.UserName.toLowerCase().includes(search))
      .slice(0, 50);
  }, [users, usernameInput]);

  const filteredNoiDungSuggestions = useMemo(() => {
    const search = newDebt.noiDung.trim().toLowerCase();
    if (!search) return noiDungHistory.slice(0, NOI_DUNG_SUGGESTIONS_WHEN_EMPTY);
    return noiDungHistory.filter((v) => v.toLowerCase().includes(search));
  }, [noiDungHistory, newDebt.noiDung]);

  const filteredFilterUsernames = useMemo(() => {
    const search = filterUsernameInput.trim().toLowerCase();
    return (users || [])
      .filter((user) => !search || user.UserName.toLowerCase().includes(search))
      .slice(0, 50);
  }, [users, filterUsernameInput]);

  const handleUsernameInputChange = (value: string) => {
    setUsernameInput(value);
    setShowUsernameDropdown(true);
    setActiveUsernameIndex(0);

    if (!value || value !== newDebt.username) {
      // Giữ nguyên ngày lô hàng khi đổi User: ngày là chung cho mọi khách, bắt
      // CSKH chọn lại mỗi lần đổi khách chỉ tổ mất công. Chỉ bỏ mã lô vì mã lô
      // là của riêng từng khách — hiệu ứng bên dưới tự tìm lại theo khách mới.
      setNewDebt((prev) => ({ ...prev, username: '', loHangId: undefined }));
    }
  };

  const handleUsernameSelect = (value: string) => {
    setUsernameInput(value);
    setNewDebt((prev) => ({ ...prev, username: value, loHangId: undefined }));
    setShowUsernameDropdown(false);
    setActiveUsernameIndex(0);
    setErrorMessage(null);
  };

  const handleUsernameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;

    event.preventDefault();
    if (event.key === 'ArrowDown') {
      setShowUsernameDropdown(true);
      if (filteredUsernames.length > 0) {
        setActiveUsernameIndex((prev) => (prev + 1) % filteredUsernames.length);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      setShowUsernameDropdown(true);
      if (filteredUsernames.length > 0) {
        setActiveUsernameIndex((prev) => (prev - 1 + filteredUsernames.length) % filteredUsernames.length);
      }
      return;
    }

    const activeUsername = filteredUsernames[activeUsernameIndex]?.UserName;
    if (activeUsername) {
      handleUsernameSelect(activeUsername);
    } else if (!usernameInput.trim()) {
      handleUsernameSelect('');
    }
  };

  /**
   * Người dùng tự gõ Nội dung thì ngừng tự điền, để khỏi ghi đè chữ họ vừa viết.
   */
  const [noiDungTuGo, setNoiDungTuGo] = useState(false);


  const handleNoiDungInputChange = (value: string) => {
    setNoiDungTuGo(value.trim() !== '');
    setNewDebt((prev) => ({ ...prev, noiDung: value }));
    setShowNoiDungDropdown(true);
    setActiveNoiDungIndex(0);
  };

  const handleNoiDungSelect = (value: string) => {
    setNewDebt((prev) => ({ ...prev, noiDung: value }));
    setShowNoiDungDropdown(false);
    setActiveNoiDungIndex(0);
  };

  const handleNoiDungKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showNoiDungDropdown || filteredNoiDungSuggestions.length === 0) return;
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) return;

    if (event.key === 'Escape') {
      setShowNoiDungDropdown(false);
      return;
    }

    event.preventDefault();
    if (event.key === 'ArrowDown') {
      setActiveNoiDungIndex((prev) => (prev + 1) % filteredNoiDungSuggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      setActiveNoiDungIndex(
        (prev) => (prev - 1 + filteredNoiDungSuggestions.length) % filteredNoiDungSuggestions.length,
      );
      return;
    }

    const active = filteredNoiDungSuggestions[activeNoiDungIndex];
    if (active) handleNoiDungSelect(active);
  };

  const handleFilterUsernameInputChange = (value: string) => {
    setFilterUsernameInput(value);
    setShowFilterUsernameDropdown(true);
    setActiveFilterUsernameIndex(0);

    if (!value) {
      handleFilterChange('username', '');
    }
  };

  const handleFilterUsernameSelect = (value: string) => {
    setFilterUsernameInput(value);
    handleFilterChange('username', value);
    setShowFilterUsernameDropdown(false);
    setActiveFilterUsernameIndex(0);
  };

  const handleFilterUsernameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;

    event.preventDefault();
    if (event.key === 'ArrowDown') {
      setShowFilterUsernameDropdown(true);
      if (filteredFilterUsernames.length > 0) {
        setActiveFilterUsernameIndex((prev) => (prev + 1) % filteredFilterUsernames.length);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      setShowFilterUsernameDropdown(true);
      if (filteredFilterUsernames.length > 0) {
        setActiveFilterUsernameIndex((prev) => (prev - 1 + filteredFilterUsernames.length) % filteredFilterUsernames.length);
      }
      return;
    }

    const activeUsername = filteredFilterUsernames[activeFilterUsernameIndex]?.UserName;
    if (activeUsername) {
      handleFilterUsernameSelect(activeUsername);
    } else if (!filterUsernameInput.trim()) {
      handleFilterUsernameSelect('');
    }
  };

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: getBankAccounts,
  });

  /**
   * Hai danh sách tuyến, cố ý khác nhau:
   *  - `countries`    dùng cho ô NHẬP: bỏ tuyến đã ngừng, CSKH không chọn nhầm.
   *  - `countriesLoc` dùng cho ô LỌC: đủ cả tuyến đã ngừng, để còn tra ra được
   *                   công nợ cũ thuộc tuyến đó (Pháp, Bồ Đào Nha vẫn còn dòng
   *                   thật tháng 7–8).
   */
  const { data: countries } = useQuery({
    queryKey: ['quoc-gia'],
    queryFn: getQuocGia,
  });
  const { data: countriesLoc } = useQuery({
    queryKey: ['quoc-gia', 'tat-ca'],
    queryFn: getQuocGiaTatCa,
  });

  // Fetch batches when username changes
  const { data: batches } = useQuery({
    queryKey: ['batches', newDebt.username],
    queryFn: () => getBatchesByUsername(newDebt.username),
    enabled: !!newDebt.username,
  });

  /**
   * Đổi User xong thì tìm lại mã lô theo ngày đang chọn.
   *
   * Ngày lô giữ nguyên khi đổi khách, nhưng mã lô (LoHang_ID) là của riêng từng
   * khách nên phải dò lại trong danh sách lô của khách mới. Khách mới có lô đúng
   * ngày đó thì gắn, không có thì thôi — vẫn lưu được, chỉ là không kèm mã lô.
   */
  useEffect(() => {
    if (!newDebt.loHangText) return;
    const khop = batches?.find((b: BatchItem) => ngayCuaLo(b) === newDebt.loHangText);
    setNewDebt((prev) =>
      prev.loHangId === khop?.LoHang_ID ? prev : { ...prev, loHangId: khop?.LoHang_ID },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches, newDebt.loHangText]);

  /**
   * Nội dung = Tuyến + ngày lô hàng (dd/MM/yyyy).
   *
   * Chỉ tự điền khi đã chọn ĐỦ cả Tuyến lẫn ngày lô. Thiếu một trong hai thì để
   * trống, vì nhiều phát sinh (ck công nợ...) không dính lô hàng nào cả.
   * Vẫn sửa đè được — gõ vào ô là hệ thống thôi tự điền. Xoá trắng ô Nội dung
   * thì nó tự điền trở lại.
   */
  useEffect(() => {
    if (noiDungTuGo) return;
    const tenTuyen = (countries?.find((c) => c.QuocGiaID === newDebt.quocGiaId)?.TenQuocGia ?? '').trim();
    const ngayLo = ngayVN(newDebt.loHangText).trim();

    // Chỉ điền khi CÓ ĐỦ CẢ HAI. Ô Lô hàng mặc định là hôm nay, nên nếu chỉ cần
    // một trong hai là điền thì mở form ra đã thấy sẵn ngày trong ô Nội dung —
    // trong khi phần lớn phát sinh (ví dụ "ck công nợ") chẳng liên quan lô hàng
    // nào. Chưa chọn Tuyến thì để trống, CSKH tự gõ.
    // Chỉ loại "Cân Kg" mới ghép Nội dung từ Tuyến + ngày lô. Loại khác thì hai
    // ô đó còn không hiện, nên để trống cho CSKH tự gõ.
    const goiY = newDebt.loaiPhatSinh === 8 && tenTuyen && ngayLo ? `${tenTuyen} - ${ngayLo}` : '';
    setNewDebt((prev) => (prev.noiDung === goiY ? prev : { ...prev, noiDung: goiY }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDebt.quocGiaId, newDebt.loHangText, newDebt.loaiPhatSinh, countries, noiDungTuGo]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createDebt,
    onSuccess: (result, variables) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['debt-management'] });
        setErrorMessage(null);
        addNoiDungHistory(variables.noiDung);
      } else {
        setErrorMessage(result.message || 'Thêm mới thất bại');
      }
    },
    onError: (error: unknown) => {
      setErrorMessage(getMutationErrorMessage(error, 'Thêm mới thất bại'));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateDebtParams }) => updateDebt(id, data),
    onSuccess: (result, variables) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['debt-management'] });
        if (variables.data.noiDung) addNoiDungHistory(variables.data.noiDung);
        resetDebtForm();
      } else {
        setErrorMessage(result.message || 'Cập nhật thất bại');
      }
    },
    onError: (error: unknown) => {
      setErrorMessage(getMutationErrorMessage(error, 'Cập nhật thất bại'));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteDebt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debt-management'] });
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: approveDebt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debt-management'] });
    },
  });

  const loaiPhatSinhMap: Record<number, string> = {
    1: 'Phí mua hàng',
    2: 'Phát sinh khác',
    3: 'Phí ship từ nước ngoài về',
    4: 'Phí ship trong nước',
    5: 'Đặt cọc',
    6: 'Phí ship về VN lô hàng',
    7: 'Thuế hải quan lô hàng',
    8: 'Cân Kg',
  };

  const getLoaiPhatSinhLabel = (item: DebtManagementItem): string =>
    item.LoaiPhatSinhText || (item.LoaiPhatSinh != null ? loaiPhatSinhMap[item.LoaiPhatSinh] || '' : '');

  const buildExcelRows = (items: DebtManagementItem[]) => {
    const headers = [
      'CongNo_ID', 'User Name', 'Order number', 'Tuyến', 'Lô hàng', 'Nội Dung', 'Ngày phát sinh',
      'Phát sinh nợ', 'Phát sinh có', 'Ghi Chú', 'Loại phát sinh', 'Sản lượng (kg)',
      'Trạng thái', 'Người tạo', 'Người cập nhật cuối', 'Ngày cập nhật cuối',
    ];
    const rows = items.map((item) => [
      item.CongNo_ID,
      item.UserName || '',
      item.OrderNumber || '',
      item.Tuyen || '',
      item.TenLoHang || '',
      item.NoiDung || '',
      item.NgayGhiNo ? new Date(item.NgayGhiNo).toLocaleDateString('vi-VN') : '',
      item.DR ?? 0,
      item.CR ?? 0,
      item.GhiChu || '',
      getLoaiPhatSinhLabel(item),
      // Số thô (không format) để Excel SUM được; rỗng nếu không phải Cân Kg
      item.LoaiPhatSinh === 8 && item.SanLuong != null ? item.SanLuong : '',
      item.Status ? 'Approved' : 'Pending',
      item.NguoiTao || '',
      item.NguoiCapNhatCuoi || '',
      item.NgayCapNhatCuoi ? new Date(item.NgayCapNhatCuoi).toLocaleDateString('vi-VN') : '',
    ]);
    return [headers, ...rows];
  };

  const handleExportCurrentPage = () => {
    if (!data?.data?.length) return;
    downloadDataAsExcel(
      buildExcelRows(data.data),
      `QuanLyCongNo_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`,
      { 'Sản lượng (kg)': 4 },
    );
  };

  const exportAllMutation = useMutation({
    mutationFn: () => getDebtManagementList({ ...filters, page: 1, limit: 10000 }),
    onSuccess: (result) => {
      downloadDataAsExcel(
        buildExcelRows(result.data),
        `QuanLyCongNo_BoLoc_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`,
        { 'Sản lượng (kg)': 4 },
      );
    },
    onError: (err: Error) => {
      setErrorMessage('Export thất bại: ' + err.message);
    },
  });

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const totalPages = Math.ceil((data?.total || 0) / filters.limit);

  // Calculate summary stats
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quản lý công nợ</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý và theo dõi công nợ khách hàng</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCurrentPage}
            disabled={!data?.data?.length}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-colors duration-200 font-medium shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiDownload className="w-4 h-4" />
            <span className="hidden sm:inline">Xuất ra excel 1 trang</span>
          </button>
          <button
            onClick={() => exportAllMutation.mutate()}
            disabled={exportAllMutation.isPending || !data?.data?.length}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white rounded-xl hover:bg-cyan-400 transition-colors duration-200 font-medium shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiDownload className="w-4 h-4" />
            <span className="hidden sm:inline">
              {exportAllMutation.isPending ? 'Đang xuất...' : 'Xuất ra excel theo bộ lọc'}
            </span>
          </button>
          <Link
            href="/admin/debt-management/import"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#14264b] text-white rounded-xl hover:bg-cyan-400 transition-colors duration-200 font-medium shadow-sm cursor-pointer"
          >
            <FiUpload className="w-4 h-4" />
            <span className="hidden sm:inline">Import Excel</span>
          </Link>
        </div>
      </div>

      {/* Inline Add/Edit Form */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-visible">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {editingId ? 'Sửa công nợ' : 'Thêm công nợ mới'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {editingId ? 'Cập nhật thông tin công nợ' : 'Nhập thông tin công nợ'}
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="mx-4 mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-600">{errorMessage}</p>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newDebt.username || usernameInput !== newDebt.username) {
                setErrorMessage('Vui lòng chọn User từ danh sách');
                setShowUsernameDropdown(true);
                return;
              }

              if (newDebt.loaiPhatSinh === 8 && !newDebt.quocGiaId) {
                setErrorMessage('Vui lòng chọn Tuyến cho loại phát sinh Cân Kg');
                return;
              }

              // Tổng sản lượng (kg) từ chuỗi nhập nhiều số, chỉ áp dụng cho loại "Cân Kg"
              const sanLuongTotal =
                newDebt.loaiPhatSinh === 8 ? parseSanLuongTotal(newDebt.sanLuongInput) : undefined;

              if (editingId) {
                updateMutation.mutate({
                  id: editingId,
                  data: {
                    username: newDebt.username,
                    noiDung: newDebt.noiDung,
                    dr: newDebt.dr,
                    cr: newDebt.cr,
                    ghiChu: newDebt.ghiChu,
                    loaiPhatSinh: newDebt.loaiPhatSinh,
                    sanLuong: sanLuongTotal,
                    quocGiaId: newDebt.quocGiaId,
                    updatedBy: currentUser?.username || 'admin',
                  },
                });
              } else {
                createMutation.mutate({
                  ...newDebt,
                  sanLuong: sanLuongTotal,
                });
              }
            }}
            className="p-4 space-y-3"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <FiUser className="w-3.5 h-3.5 text-[#14264b]" />
                  User <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => handleUsernameInputChange(e.target.value)}
                    onKeyDown={handleUsernameKeyDown}
                    onFocus={() => setShowUsernameDropdown(true)}
                    onBlur={() => setTimeout(() => setShowUsernameDropdown(false), 100)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all bg-white cursor-pointer appearance-none"
                    placeholder="Nhập User"
                    autoComplete="off"
                    required
                  />
                  <FiChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  {showUsernameDropdown && (
                    <div
                      onMouseDown={(e) => e.preventDefault()}
                      className="absolute left-0 top-full z-[100] mt-1 max-h-56 w-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg"
                    >
                      {filteredUsernames.map((user, index) => (
                        <button
                          key={user.Id}
                          type="button"
                          className={`w-full px-3 py-1.5 text-left hover:bg-[#14264b]/5 ${index === activeUsernameIndex ? 'bg-[#14264b]/10 font-medium text-[#14264b]' : 'text-slate-700'}`}
                          onClick={() => handleUsernameSelect(user.UserName)}
                        >
                          {user.UserName}
                        </button>
                      ))}
                      {filteredUsernames.length === 0 && (
                        <div className="px-3 py-1.5 text-slate-400">Không có user phù hợp</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1 lg:col-span-2">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <FiFileText className="w-3.5 h-3.5 text-[#14264b]" />
                  Nội dung <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newDebt.noiDung}
                    onChange={(e) => handleNoiDungInputChange(e.target.value)}
                    onKeyDown={handleNoiDungKeyDown}
                    onFocus={() => setShowNoiDungDropdown(true)}
                    onBlur={() => setTimeout(() => setShowNoiDungDropdown(false), 150)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all"
                    required
                    autoComplete="off"
                    placeholder="Nhập nội dung công nợ"
                  />
                  {showNoiDungDropdown && filteredNoiDungSuggestions.length > 0 && (
                    <div
                      onMouseDown={(e) => e.preventDefault()}
                      className="absolute left-0 top-full z-[100] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg"
                    >
                      {filteredNoiDungSuggestions.map((suggestion, index) => (
                        <button
                          key={suggestion}
                          type="button"
                          className={`w-full px-3 py-1.5 text-left hover:bg-[#14264b]/5 ${index === activeNoiDungIndex ? 'bg-[#14264b]/10 font-medium text-[#14264b]' : 'text-slate-700'}`}
                          onClick={() => handleNoiDungSelect(suggestion)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <FiCalendar className="w-3.5 h-3.5 text-[#14264b]" />
                  Ngày <span className="text-red-500">*</span>
                </label>
                <input
                  ref={formDateRef}
                  type="text"
                  value={newDebt.ngay}
                  onChange={(e) => setNewDebt({ ...newDebt, ngay: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all"
                  placeholder="dd/mm/yyyy"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Loại phát sinh</label>
                <div className="relative">
                  <select
                    value={newDebt.loaiPhatSinh}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      // Không phải "Cân Kg" thì dọn sạch Tuyến + Lô hàng: hai ô đó
                      // ẩn đi, mà còn giá trị thì vẫn bị gửi lên và nối "Lô hàng:
                      // <ngày>" vào Ghi chú — đúng thứ vận hành báo là thừa.
                      const laCanKg = value === 8;
                      setNewDebt({
                        ...newDebt,
                        loaiPhatSinh: value,
                        cr: laCanKg ? 0 : newDebt.cr,
                        quocGiaId: laCanKg ? newDebt.quocGiaId : undefined,
                        loHangText: laCanKg ? newDebt.loHangText || homNayISO() : '',
                        loHangId: laCanKg ? newDebt.loHangId : undefined,
                        sanLuongInput: laCanKg ? newDebt.sanLuongInput : '',
                      });
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all bg-white cursor-pointer appearance-none"
                  >
                    <option value={2}>Phí mua hàng và phát sinh khác</option>
                    <option value={8}>Cân Kg</option>
                  </select>
                  <FiChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Sản lượng (kg) — chỉ hiện khi loại phát sinh là "Cân Kg" (8).
                  Nhập nhiều số cách nhau bằng dấu cách (vd: 12.5 3 4.2) → tự cộng ra tổng. */}
              {newDebt.loaiPhatSinh === 8 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Sản lượng (kg) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={newDebt.sanLuongInput}
                    onChange={(e) =>
                      // Chỉ cho phép chữ số, dấu cách và dấu chấm — loại bỏ ký tự khác ngay khi gõ
                      setNewDebt({ ...newDebt, sanLuongInput: e.target.value.replace(/[^\d.\s]/g, '') })
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all"
                    placeholder="Nhập nhiều số cách nhau bằng dấu cách, vd: 12.5 3 4.2"
                  />
                  <p className="text-xs text-slate-500">
                    Tổng:{' '}
                    <span className="font-semibold text-[#14264b]">
                      {parseSanLuongTotal(newDebt.sanLuongInput).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })} kg
                    </span>
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Tài khoản</label>
                <div className="relative">
                  <select
                    value={newDebt.bankAccount}
                    onChange={(e) => setNewDebt({ ...newDebt, bankAccount: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all bg-white cursor-pointer appearance-none"
                  >
                    <option value="">--Chọn tài khoản--</option>
                    {bankAccounts?.map((bank) => (
                      <option key={bank.ID} value={bank.TenTaiKhoanNganHang || ''}>
                        {bank.TenTaiKhoanNganHang}
                      </option>
                    ))}
                  </select>
                  <FiChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Tuyến và Lô hàng CHỈ hiện với loại phát sinh "Cân Kg".
                  Vận hành: "nếu chọn Cân Kg thì mới phải nhập tuyến và lô hàng,
                  chọn phát sinh khác thì sẽ biến mất, không cần điền 2 cái ấy".
                  Trước đây luôn hiện, mà ô Lô hàng mặc định hôm nay nên mọi phát
                  sinh — kể cả "ck công nợ" — đều bị nối thêm "Lô hàng: <ngày>"
                  vào Ghi chú, chẳng liên quan gì. */}
              {newDebt.loaiPhatSinh === 8 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Tuyến <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={newDebt.quocGiaId ?? ''}
                    onChange={(e) => setNewDebt({ ...newDebt, quocGiaId: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all bg-white cursor-pointer appearance-none"
                  >
                    <option value="">--Chọn tuyến--</option>
                    {countries?.map((country) => (
                      <option key={country.QuocGiaID} value={country.QuocGiaID}>
                        {country.TenQuocGia}
                      </option>
                    ))}
                  </select>
                  <FiChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              )}

              {/* Lô hàng = NGÀY. Vận hành gọi lô theo ngày chứ không theo tên, nên
                  ô này là lịch chọn ngày, mặc định hôm nay, khác ngày thì CSKH tự chọn.
                  Ngày trùng ngày một lô có thật của khách thì gắn luôn mã lô. */}
              {newDebt.loaiPhatSinh === 8 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Lô hàng</label>
                <input
                  type="date"
                  value={newDebt.loHangText}
                  onChange={(e) => {
                    const ngay = e.target.value;
                    const khop = batches?.find((b: BatchItem) => ngayCuaLo(b) === ngay);
                    setNewDebt({ ...newDebt, loHangText: ngay, loHangId: khop?.LoHang_ID });
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all"
                />
              </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Tiền Nợ (DR)</label>
                <input
                  type="number"
                  value={newDebt.dr === 0 ? '' : newDebt.dr}
                  onChange={(e) => setNewDebt({ ...newDebt, dr: e.target.value === '' ? 0 : Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all"
                  placeholder="0"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Tiền Có (CR)</label>
                <input
                  type="number"
                  value={newDebt.cr === 0 ? '' : newDebt.cr}
                  onChange={(e) => setNewDebt({ ...newDebt, cr: e.target.value === '' ? 0 : Number(e.target.value) })}
                  disabled={newDebt.loaiPhatSinh === 8}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  placeholder={newDebt.loaiPhatSinh === 8 ? 'Không áp dụng cho Cân Kg' : '0'}
                />
              </div>

              <div className="space-y-1 md:col-span-2 xl:col-span-3">
                <label className="text-xs font-medium text-slate-700">Ghi chú</label>
                <textarea
                  value={newDebt.ghiChu}
                  onChange={(e) => setNewDebt({ ...newDebt, ghiChu: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all resize-none"
                  rows={2}
                  placeholder="Nhập ghi chú (nếu có)"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={resetDebtForm}
                className="px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-[#14264b] to-cyan-400 rounded-lg hover:from-[#4bb3dd] hover:to-cyan-300 transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                {(createMutation.isPending || updateMutation.isPending) && <FiLoader className="w-3.5 h-3.5 animate-spin" />}
                {editingId ? 'Cập nhật' : 'Lưu'}
              </button>
            </div>
          </form>
        </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible">
        {/* Filter Header */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#14264b]/10 rounded-lg">
              <FiFilter className="w-4 h-4 text-[#14264b]" />
            </div>
            <span className="font-semibold text-slate-700">Bộ lọc</span>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {Object.values(filters).filter(v => v !== '' && v !== -1 && v !== 0).length} active
            </span>
          </div>
          {showFilters ? (
            <FiChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <FiChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {/* Filter Content */}
        {showFilters && (
          <div className="px-4 pb-4 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 pt-4">
              <div className="relative space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <FiUser className="w-3.5 h-3.5" />
                  User
                </label>
                <input
                  type="text"
                  value={filterUsernameInput}
                  onChange={(e) => handleFilterUsernameInputChange(e.target.value)}
                  onKeyDown={handleFilterUsernameKeyDown}
                  onFocus={() => setShowFilterUsernameDropdown(true)}
                  onBlur={() => setTimeout(() => setShowFilterUsernameDropdown(false), 100)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all bg-white"
                  placeholder="Nhập User"
                  autoComplete="off"
                />
                {showFilterUsernameDropdown && (
                  <div
                    onMouseDown={(e) => e.preventDefault()}
                    className="absolute left-0 top-full z-[100] mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
                  >
                    <button
                      type="button"
                      className="w-full px-3 py-1.5 text-left text-slate-500 hover:bg-slate-50"
                      onClick={() => handleFilterUsernameSelect('')}
                    >
                      --Tất cả User--
                    </button>
                    {filteredFilterUsernames.map((user, index) => (
                      <button
                        key={user.Id}
                        type="button"
                        className={`w-full px-3 py-1.5 text-left hover:bg-[#14264b]/5 ${index === activeFilterUsernameIndex ? 'bg-[#14264b]/10 font-medium text-[#14264b]' : 'text-slate-700'}`}
                        onClick={() => handleFilterUsernameSelect(user.UserName)}
                      >
                        {user.UserName}
                      </button>
                    ))}
                    {filteredFilterUsernames.length === 0 && (
                      <div className="px-3 py-1.5 text-slate-400">Không có user phù hợp</div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Trạng thái</label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all bg-white cursor-pointer"
                >
                  <option value={-1}>Tất cả</option>
                  <option value={1}>Approved</option>
                  <option value={0}>Pending</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <FiCreditCard className="w-3.5 h-3.5" />
                  Ngân hàng
                </label>
                <select
                  value={filters.bankAccount}
                  onChange={(e) => handleFilterChange('bankAccount', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all bg-white cursor-pointer"
                >
                  <option value="">--Tất cả tài khoản--</option>
                  {bankAccounts?.map((bank) => (
                    <option key={bank.ID} value={bank.GhiChu || ''}>
                      {bank.TenTaiKhoanNganHang}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <FiCalendar className="w-3.5 h-3.5" />
                  Từ ngày
                </label>
                <input
                  ref={fromDateRef}
                  type="text"
                  value={filters.fromDate}
                  onChange={(e) => handleFilterChange('fromDate', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all"
                  placeholder="dd/mm/yyyy"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <FiCalendar className="w-3.5 h-3.5" />
                  Đến ngày
                </label>
                <input
                  ref={toDateRef}
                  type="text"
                  value={filters.toDate}
                  onChange={(e) => handleFilterChange('toDate', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all"
                  placeholder="dd/mm/yyyy"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Loại phát sinh</label>
                <select
                  value={filters.loaiPhatSinh ?? ''}
                  onChange={(e) => handleFilterChange('loaiPhatSinh', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 transition-all bg-white cursor-pointer"
                >
                  <option value="-1">Tất cả loại phát sinh</option>
                  <option value="1,2,3,4,5,6,7">Phí mua hàng và phát sinh khác</option>
                  <option value="8">Cân Kg</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Tuyến</label>
                <select
                  value={filters.quocGiaId}
                  onChange={(e) => handleFilterChange('quocGiaId', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-[#14264b] focus:ring-2 focus:ring-[#14264b]/20 outline-none transition-all bg-white"
                >
                  <option value="">Tất cả tuyến</option>
                  {/* Ô LỌC dùng danh sách đủ, kể cả tuyến đã ngừng — không thì
                      công nợ cũ của Pháp / Bồ Đào Nha lọc không ra. */}
                  {countriesLoc?.map((c) => (
                    <option key={c.QuocGiaID} value={c.QuocGiaID}>
                      {c.TenQuocGia}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <FiLoader className="w-8 h-8 text-[#14264b] animate-spin" />
            <span className="ml-3 text-slate-500">Đang tải dữ liệu...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 bg-red-50 rounded-full mb-4">
              <FiX className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-red-600 font-medium">Lỗi tải dữ liệu</p>
            <p className="text-sm text-slate-500 mt-1">{String(error)}</p>
          </div>
        ) : (
          <>
            <div ref={tableScrollRef} onScroll={handleTableScroll} className="overflow-x-auto rounded-t-2xl">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Order / Tuyến</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nội dung / Ghi chú</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ngày</th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Nợ (DR)</th>
                    <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Có (CR)</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Loại phát sinh / SL (kg)</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Trạng thái / Cập nhật</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data?.data?.map((item: DebtManagementItem) => (
                    <tr key={item.CongNo_ID} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3.5 text-sm text-slate-600 font-mono">{item.CongNo_ID}</td>
                      <td className="px-4 py-3.5 text-sm font-medium text-slate-800">{item.UserName}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                        <div className="flex flex-col leading-tight">
                          <span className="font-mono">{item.OrderNumber || '-'}</span>
                          {item.Tuyen && <span className="text-xs text-slate-400">{item.Tuyen}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600 max-w-[250px]">
                        <div className="flex flex-col leading-tight">
                          <span className="break-words whitespace-normal">{item.NoiDung}</span>
                          {item.GhiChu && (
                            <span className="text-xs text-slate-400 break-words whitespace-normal">{item.GhiChu}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">
                        {item.NgayGhiNo ? new Date(item.NgayGhiNo).toLocaleDateString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-right font-mono text-orange-600">
                        {item.DR ? item.DR.toLocaleString('vi-VN') : '0'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-right font-mono text-[#14264b]">
                        {item.CR ? item.CR.toLocaleString('vi-VN') : '0'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">
                        <div className="flex flex-col leading-tight">
                          <span>{getLoaiPhatSinhLabel(item) || '-'}</span>
                          {item.LoaiPhatSinh === 8 && item.SanLuong != null && (
                            <span className="text-xs text-slate-400 font-mono">
                              {item.SanLuong.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 4 })} kg
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex flex-col items-center gap-1 leading-tight">
                          {item.Status ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                              Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 text-xs font-medium rounded-full">
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                              Pending
                            </span>
                          )}
                          {(item.NguoiCapNhatCuoi || item.NgayCapNhatCuoi) && (
                            <span className="text-xs text-slate-400 whitespace-nowrap">
                              {item.NguoiCapNhatCuoi || ''}
                              {item.NguoiCapNhatCuoi && item.NgayCapNhatCuoi ? ' · ' : ''}
                              {item.NgayCapNhatCuoi ? new Date(item.NgayCapNhatCuoi).toLocaleDateString('vi-VN') : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!item.Status && (
                            <button
                              onClick={() => approveMutation.mutate(item.CongNo_ID)}
                              disabled={approveMutation.isPending}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="Duyệt"
                            >
                              <FiCheck className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingId(item.CongNo_ID);
                              setNewDebt({
                                username: item.UserName || '',
                                noiDung: item.NoiDung || '',
                                ngay: item.NgayGhiNo ? (() => { const d = new Date(item.NgayGhiNo); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; })() : getTodayFormatted(),
                                dr: item.DR || 0,
                                cr: item.CR || 0,
                                ghiChu: item.GhiChu || '',
                                loHangId: item.LoHangID,
                                // Không suy ngược được ngày lô từ dòng đã lưu, để trống.
                                loHangText: '',
                                loaiPhatSinh: item.LoaiPhatSinh ?? 2,
                                bankAccount: '',
                                sanLuongInput: item.SanLuong != null ? String(item.SanLuong) : '',
                                quocGiaId: item.QuocGiaID ?? undefined,
                              });
                              setUsernameInput(item.UserName || '');
                              // Giữ nguyên Nội dung đã lưu. Thiếu dòng này thì hiệu ứng
                              // tự điền coi như người dùng chưa gõ gì và ghi đè nội dung
                              // cũ bằng mỗi tên tuyến — mở ra xem thôi cũng mất dữ liệu.
                              // Muốn nó tự điền lại thì xoá trắng ô Nội dung.
                              setNoiDungTuGo(true);
                              setErrorMessage(null);
                            }}
                            className="p-1.5 text-[#14264b] hover:bg-[#14264b]/5 rounded-lg transition-colors cursor-pointer"
                            title="Sửa"
                          >
                            <FiEdit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Bạn có chắc chắn muốn xóa?')) {
                                deleteMutation.mutate(item.CongNo_ID);
                              }
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Xóa"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Thanh scroll ngang TỰ VẼ, ghim ở đáy — chỉ hiện khi bảng tràn chiều ngang.
                Kéo thumb để cuộn bảng mà không cần kéo xuống cuối trang. */}
            {tableScrollSize.scroll > tableScrollSize.client && (
              <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-sm">
                <div className="relative h-3.5 w-full rounded-full bg-slate-200">
                  <div
                    ref={thumbRef}
                    onPointerDown={handleThumbPointerDown}
                    className="absolute top-0 left-0 h-3.5 rounded-full bg-slate-400 hover:bg-slate-500 active:bg-slate-600 cursor-grab active:cursor-grabbing"
                    style={{
                      width: `${Math.max(8, (tableScrollSize.client / tableScrollSize.scroll) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Empty State */}
            {(!data?.data || data.data.length === 0) && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-4 bg-slate-100 rounded-full mb-4">
                  <FiFileText className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium">Không có dữ liệu</p>
                <p className="text-sm text-slate-400 mt-1">Thử thay đổi bộ lọc để xem kết quả khác</p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-4 border-t border-slate-100">
                <p className="text-sm text-slate-500">
                  Trang <span className="font-medium text-slate-700">{filters.page}</span> / {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(filters.page - 1)}
                    disabled={filters.page <= 1}
                    className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    Trước
                  </button>
                  <button
                    onClick={() => handlePageChange(filters.page + 1)}
                    disabled={filters.page >= totalPages}
                    className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
