/**
 * Ảnh hàng gắn vào tracking — gọi API và thu nhỏ ảnh ngay trên trình duyệt.
 *
 * Thu nhỏ trước khi gửi: ảnh điện thoại 4–8MB một tấm, thư mục vài trăm tấm là
 * hàng GB đẩy qua mạng văn phòng. Thu về cạnh dài 1600px còn ~300KB, nhanh hơn
 * chục lần. Máy chủ vẫn xử lý lại (xoay theo EXIF, giới hạn cỡ) nên ảnh nào
 * trình duyệt không thu nhỏ được thì gửi nguyên bản vẫn đúng.
 */
import apiClient from '@/lib/api-client';

export interface TrackingKhop {
  TrackingID: number;
  UserName: string | null;
  TinhTrang: string | null;
}

export interface KetQuaKhop {
  tenFile: string;
  laAnh: boolean;
  soTracking: string | null;
  boDuoi: boolean;
  tracking: TrackingKhop[];
  soAnhDaCo: number;
  trungTen: boolean;
}

export interface AnhTracking {
  AnhTrackingID: number;
  TrackingID: number;
  LinkHinh: string;
  TenFileGoc: string | null;
  NguoiTao: string | null;
  NgayTao: string;
}

export interface KetQuaTaiLen {
  tenFile: string;
  soTracking: string;
  trackingIds: number[];
  linkHinh: string;
  thayThe: number;
}

/** Lấy câu báo lỗi tiếng Việt từ máy chủ thay vì "Request failed with status code 400". */
export function loiDeDoc(e: unknown): string {
  const r = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(r)) return r.join('; ');
  if (typeof r === 'string' && r) return r;
  const m = (e as Error)?.message ?? '';
  if (/timeout/i.test(m)) return 'Mạng chậm, quá thời gian chờ';
  if (/Network Error/i.test(m)) return 'Mất kết nối mạng';
  return m || 'Lỗi không rõ';
}

/** Máy chủ nhận tối đa 2000 tên mỗi lần — thư mục lớn hơn thì chia lô. */
export async function khopTenFile(tenFile: string[]): Promise<KetQuaKhop[]> {
  const ra: KetQuaKhop[] = [];
  for (let i = 0; i < tenFile.length; i += 2000) {
    const res = await apiClient.post<KetQuaKhop[]>('/tracking/anh/khop', { tenFile: tenFile.slice(i, i + 2000) });
    ra.push(...res.data);
  }
  return ra;
}

export async function taiAnhLen(anh: Blob, tenFileGoc: string): Promise<KetQuaTaiLen> {
  const fd = new FormData();
  fd.append('file', anh, tenFileGoc);
  fd.append('tenFileGoc', tenFileGoc);
  const res = await apiClient.post<KetQuaTaiLen>('/tracking/anh/tai-len', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return res.data;
}

export async function layAnhTracking(trackingId: number): Promise<AnhTracking[]> {
  const res = await apiClient.get<AnhTracking[]>(`/tracking/${trackingId}/anh`);
  return res.data;
}

export async function xoaAnhTracking(anhTrackingId: number): Promise<void> {
  await apiClient.delete(`/tracking/anh/${anhTrackingId}`);
}

const CANH_DAI = 1600;

/**
 * Thu nhỏ ảnh về JPEG cạnh dài 1600px, đã xoay đúng chiều.
 * Trình duyệt không đọc được (vd HEIC trên Chrome) thì trả nguyên file để máy
 * chủ tự xử lý / tự báo lỗi.
 */
export async function thuNhoAnh(file: File): Promise<Blob> {
  // Ảnh đã nhỏ sẵn thì khỏi vẽ lại — tránh làm mờ thêm.
  if (file.size < 400 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const tiLe = Math.min(1, CANH_DAI / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * tiLe));
    const h = Math.max(1, Math.round(bmp.height * tiLe));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff'; // PNG nền trong suốt → trắng thay vì đen
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/**
 * Đọc hết file trong thứ kéo-thả vào (kể cả thư mục lồng nhau).
 * Phải lấy entry NGAY trong sự kiện drop — ra khỏi hàm là trình duyệt thu hồi.
 */
export async function docFileKeoTha(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items ?? [])
    .map((it) => (it.kind === 'file' ? it.webkitGetAsEntry?.() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return Array.from(dt.files ?? []);

  const ra: File[] = [];
  const di = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      ra.push(await new Promise<File>((ok, loi) => (e as FileSystemFileEntry).file(ok, loi)));
      return;
    }
    if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      // readEntries trả từng mẻ (Chrome ~100 mục), phải đọc tới khi rỗng.
      for (;;) {
        const me = await new Promise<FileSystemEntry[]>((ok, loi) => reader.readEntries(ok, loi));
        if (!me.length) break;
        for (const con of me) await di(con);
      }
    }
  };
  for (const e of entries) await di(e);
  return ra;
}
