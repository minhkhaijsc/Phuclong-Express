import { tongPhaiTraGoiY } from './ncc-don-hang';

/**
 * NHẬP GIÁ NHÀ CUNG CẤP CHO NHIỀU DÒNG ĐƠN MỘT LƯỢT.
 *
 * Yêu cầu bên khách 16/10/2026: "em muốn nhập thông tin rate nhà cung cấp cho
 * 1 Order number gồm nhiều mã ĐH, hiện chỉ có thể ấn edit từng mã ĐH khá mất
 * thời gian, a xem giúp e có thể edit 1 loạt được không ạ?"
 *
 * Một OrderNumber là MỘT lần đặt của khách nhưng nằm thành NHIỀU dòng DON_HANG
 * — mỗi màu/size một dòng (ảnh chụp họ gửi: order 6103975945 có 8 mã ĐH). Nhà
 * cung cấp, % công và tỷ giá thì chung cho cả lần đặt, chỉ NGOẠI TỆ là riêng
 * từng dòng vì mỗi món một giá. Nên khối nhập chia đúng làm hai: bốn ô dùng
 * chung, còn ngoại tệ gõ theo từng dòng.
 *
 * LUẬT XUYÊN SUỐT CẢ TỆP: Ô ĐỂ TRỐNG = GIỮ NGUYÊN, không phải = xoá.
 * `undefined` và `null` đều là "không đụng tới". Màn hàng loạt mà hiểu ô trống
 * là lệnh xoá thì một lần bấm nhầm xoá sạch giá nhập của vài chục đơn, trong
 * khi muốn xoá thì mở đúng đơn đó ra sửa vẫn được. Đổi luật này là hỏng cả
 * tính an toàn của màn hình, đừng đổi.
 *
 * Tách khỏi `orders.service.ts` (đã hơn 2.600 dòng) vì toàn bộ phần dưới đây
 * là phép tính thuần, không chạm CSDL, nên kiểm được bằng unit test thật.
 */

/** Giá NCC đang có trên một dòng đơn, đọc thẳng từ DON_HANG. */
export interface GiaNccTrenDon {
  ID: number;
  NCC_ID: number | null;
  NCC_NgoaiTe: number | null;
  NCC_Cong: number | null;
  NCC_TyGia: number | null;
  NCC_TongPhaiTra: number | null;
  NCC_Tracking: string | null;
}

/** Một dòng người dùng chọn, kèm ngoại tệ gõ riêng cho dòng đó (nếu có). */
export interface DongChon {
  id: number;
  ngoaiTe?: number | null;
}

export interface ThanNccHangLoat {
  dong: DongChon[];
  nccId?: number | null;
  cong?: number | null;
  tyGia?: number | null;
  tracking?: string | null;
  /** Mặc định bật. Tắt khi chỉ muốn sửa tracking mà không đụng tới số tiền. */
  tinhLaiTongPhaiTra?: boolean;
}

export interface KetQuaTinh {
  /** Giá trị CUỐI CÙNG để ghi — chỉ gồm những dòng thật sự đổi. */
  apDung: GiaNccTrenDon[];
  /** Có trong danh sách chọn nhưng mọi ô đều y như cũ. */
  khongDoi: number[];
  /** Gửi lên nhưng không tìm thấy trong CSDL (đã xoá, hoặc ID lạ). */
  khongThay: number[];
}

const so = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Ô trống (undefined hoặc null) thì lấy giá trị cũ. Xem LUẬT ở đầu tệp. */
const chon = <T>(moi: T | null | undefined, cu: T): T =>
  moi === undefined || moi === null ? cu : moi;

/**
 * Tổng phải trả tính lại từ ba ô kia, hoặc `null` khi CHƯA ĐỦ DỮ KIỆN.
 *
 * Thiếu ngoại tệ hay thiếu tỷ giá thì trả null chứ KHÔNG trả 0. `NCC_TongPhaiTra`
 * khác null chính là dấu "đơn này đã nhập giá NCC" mà trang Công nợ phải trả
 * NCC dựa vào (`NCC_TongPhaiTra IS NOT NULL`). Ghi 0 vào đó là đơn chưa nhập
 * bỗng đếm thành đã nhập, tổng phải trả nhìn như đã đủ trong khi còn thiếu, và
 * cột Lãi/Lỗ hiện lãi đúng bằng tiền thu khách.
 */
export const tongPhaiTraTuDong = (d: GiaNccTrenDon): number | null => {
  const nt = so(d.NCC_NgoaiTe);
  const tg = so(d.NCC_TyGia);
  if (nt === null || nt <= 0 || tg === null || tg <= 0) return null;
  return tongPhaiTraGoiY(nt, d.NCC_Cong ?? 0, tg);
};

/** Hai dòng giống nhau từng ô hay không — để khỏi ghi và khỏi ghi nhật ký thừa. */
const giongNhau = (a: GiaNccTrenDon, b: GiaNccTrenDon): boolean =>
  a.NCC_ID === b.NCC_ID &&
  a.NCC_NgoaiTe === b.NCC_NgoaiTe &&
  a.NCC_Cong === b.NCC_Cong &&
  a.NCC_TyGia === b.NCC_TyGia &&
  a.NCC_TongPhaiTra === b.NCC_TongPhaiTra &&
  (a.NCC_Tracking || null) === (b.NCC_Tracking || null);

/**
 * Trộn ô dùng chung + ngoại tệ từng dòng vào giá đang có, ra danh sách cần ghi.
 *
 * `hienCo` là những dòng ĐỌC ĐƯỢC từ CSDL ngay trước khi ghi, không phải dữ
 * liệu màn hình gửi lên: màn danh sách có thể đã mở từ sáng, mà trong lúc đó
 * người khác sửa giá rồi.
 */
export const tinhNccHangLoat = (
  hienCo: GiaNccTrenDon[],
  than: ThanNccHangLoat,
): KetQuaTinh => {
  const theoId = new Map(hienCo.map((d) => [Number(d.ID), d]));
  const tinhLai = than.tinhLaiTongPhaiTra !== false;

  const apDung: GiaNccTrenDon[] = [];
  const khongDoi: number[] = [];
  const khongThay: number[] = [];

  const tracking =
    than.tracking === undefined || than.tracking === null
      ? null
      : String(than.tracking).trim().slice(0, 100) || null;

  // Bỏ ID trùng, lần gõ sau thắng: trùng thì ghi hai lần cùng một đơn và để
  // lại hai dòng nhật ký y hệt nhau, nhìn như có người sửa hai lượt.
  const dong = [...new Map((than.dong || []).map((d) => [Number(d.id), d])).values()];

  for (const d of dong) {
    const id = Number(d.id);
    const cu = theoId.get(id);
    if (!cu) {
      khongThay.push(id);
      continue;
    }

    const moi: GiaNccTrenDon = {
      ID: id,
      NCC_ID: chon(so(than.nccId), cu.NCC_ID),
      NCC_NgoaiTe: chon(so(d.ngoaiTe), cu.NCC_NgoaiTe),
      NCC_Cong: chon(so(than.cong), cu.NCC_Cong),
      NCC_TyGia: chon(so(than.tyGia), cu.NCC_TyGia),
      // Đặt tạm bằng giá trị cũ, tính lại ngay dưới đây.
      NCC_TongPhaiTra: cu.NCC_TongPhaiTra,
      NCC_Tracking: chon(tracking, cu.NCC_Tracking),
    };

    if (tinhLai) {
      // Tính được thì lấy số mới; chưa đủ dữ kiện thì GIỮ số cũ, không về null
      // — đơn đã nhập tay từ trước không bị màn hàng loạt xoá mất.
      const tu = tongPhaiTraTuDong(moi);
      if (tu !== null) moi.NCC_TongPhaiTra = tu;
    }

    if (giongNhau(cu, moi)) khongDoi.push(id);
    else apDung.push(moi);
  }

  return { apDung, khongDoi, khongThay };
};
