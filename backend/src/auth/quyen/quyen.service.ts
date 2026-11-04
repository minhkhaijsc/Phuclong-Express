import { Injectable } from '@nestjs/common';
import {
  BANG_QUYEN,
  BO_PHAN,
  BO_PHAN_TP_TAO_NHAN_VIEN,
  BoPhan,
  CAP,
  CAP_XEM_DASHBOARD,
  Cap,
  HanhDong,
  LE_CUA_CAP,
  LE_CUA_KHACH,
  MaQuyen,
  MIEN_CUA_KHACH,
  Mien,
  QUYEN_LE,
  QuyenLe,
  VAI_TRO_CU,
  laBoPhan,
  laCap,
} from './bo-phan';

/** Những gì một tài khoản được làm, đã tính xong. */
export interface QuyenCuaToi {
  /** Bộ phận sau khi đã quy đổi vai trò cũ. */
  boPhan: BoPhan[];
  cap: Cap[];
  /** Không mang vai trò nào → khách hàng. */
  laKhach: boolean;
  /** `muaHang.xem`, `congNo.sua`, `giaNcc`… */
  quyen: MaQuyen[];
}

@Injectable()
export class QuyenService {
  /**
   * Quy đổi danh sách vai trò thô trong AspNetUserRoles thành bộ phận + cấp.
   *
   * Vai trò lạ (không phải bộ phận, không phải cấp, không có trong bảng quy đổi
   * cũ) bị bỏ qua chứ không coi là khách: một tài khoản có vai trò rác vẫn là
   * nhân viên, chỉ là chưa được gán bộ phận — và khi đó `quyen` rỗng nên không
   * làm được gì ngoài việc riêng.
   */
  phanTich(vaiTroTho: readonly string[]): {
    boPhan: BoPhan[];
    cap: Cap[];
    laKhach: boolean;
  } {
    const boPhan = new Set<BoPhan>();
    const cap = new Set<Cap>();

    for (const v of vaiTroTho ?? []) {
      const ten = String(v ?? '').trim();
      if (!ten) continue;
      if (laBoPhan(ten)) {
        boPhan.add(ten);
        continue;
      }
      if (laCap(ten)) {
        cap.add(ten);
        continue;
      }
      const cu = VAI_TRO_CU[ten];
      if (cu) boPhan.add(cu);
    }

    // 'user' là vai trò giả mà auth.service gán cho tài khoản tự đăng ký — nó
    // không có trong AspNetUserRoles nên không tới được đây, nhưng nếu có thì
    // cũng đã bị bỏ ở trên vì không khớp bộ phận nào.
    return {
      boPhan: [...boPhan],
      cap: [...cap],
      laKhach: boPhan.size === 0 && cap.size === 0,
    };
  }

  /** Tính toàn bộ quyền từ danh sách vai trò thô. */
  tinh(vaiTroTho: readonly string[]): QuyenCuaToi {
    const { boPhan, cap, laKhach } = this.phanTich(vaiTroTho);
    const quyen = new Set<MaQuyen>();

    if (laKhach) {
      for (const [mien, q] of Object.entries(MIEN_CUA_KHACH)) {
        if (q?.xem) quyen.add(`${mien as Mien}.xem`);
        if (q?.sua) quyen.add(`${mien as Mien}.sua`);
      }
      for (const l of LE_CUA_KHACH) quyen.add(l);
      // Khách xem được danh mục (trang tạo đơn nạp tỷ giá) — giữ như cũ.
      if (quyen.has(`${'danhMuc' as Mien}.xem`)) quyen.add(QUYEN_LE.xemTyGia);
      return { boPhan, cap, laKhach, quyen: [...quyen] };
    }

    for (const bp of boPhan) {
      const mo = BANG_QUYEN[bp];
      for (const [mien, q] of Object.entries(mo.mien)) {
        if (q?.xem) quyen.add(`${mien as Mien}.xem`);
        if (q?.sua) quyen.add(`${mien as Mien}.sua`);
      }
      for (const l of mo.le ?? []) quyen.add(l);
    }

    // Cấp Trưởng phòng / Giám đốc mở Dashboard, bất kể bộ phận nào.
    if (cap.some((c) => CAP_XEM_DASHBOARD.includes(c))) {
      quyen.add(`${'dashboard' as Mien}.xem`);
    }

    // Quyền lẻ của cấp — Giám đốc xem được giá NCC và công nợ phải trả, kể cả
    // khi bộ phận của người đó không có hai quyền đó.
    for (const c of cap) {
      for (const l of LE_CUA_CAP[c] ?? []) quyen.add(l);
    }

    // Trưởng phòng / Giám đốc của bộ phận xem được liên hệ khách thì xem được
    // của MỌI khách và được phân khách cho sales (yêu cầu 23/10/2026, "trừ
    // TP,PP"). Điều kiện `xemLienHeKhach` là bắt buộc: KETOAN cũng mang cấp
    // Trưởng phòng, cấp trơn theo cấp là kế toán đọc được hết số điện thoại.
    if (
      cap.some((c) => CAP_XEM_DASHBOARD.includes(c)) &&
      quyen.has(QUYEN_LE.xemLienHeKhach)
    ) {
      quyen.add(QUYEN_LE.xemLienHeMoiKhach);
      quyen.add(QUYEN_LE.phanKhachCskh);
    }

    // Trưởng phòng CSKH tạo được nhân viên CSKH (04/11/2026). Phạm vi — chỉ
    // bộ phận của mình, không cấp — chặn ở TaoTaiKhoanService.kiemTra.
    if (
      cap.includes(CAP.TruongPhong) &&
      boPhan.some((b) => BO_PHAN_TP_TAO_NHAN_VIEN.includes(b))
    ) {
      quyen.add(QUYEN_LE.taoNhanVien);
    }

    // Xem được danh mục là xem được tỷ giá — tỷ giá nằm trong danh mục.
    if (quyen.has(`${'danhMuc' as Mien}.xem`)) quyen.add(QUYEN_LE.xemTyGia);

    // Việc cá nhân thì ai đăng nhập cũng làm được.
    quyen.add('rieng.xem');
    quyen.add('rieng.sua');

    return { boPhan, cap, laKhach, quyen: [...quyen] };
  }

  /** Có quyền này không. */
  co(q: QuyenCuaToi, ma: MaQuyen): boolean {
    return q.quyen.includes(ma);
  }

  coMien(q: QuyenCuaToi, mien: Mien, hanhDong: HanhDong): boolean {
    return q.quyen.includes(`${mien}.${hanhDong}` as MaQuyen);
  }

  laAdmin(q: QuyenCuaToi): boolean {
    return q.boPhan.includes(BO_PHAN.Admin);
  }

  /** Dùng cho thông báo lỗi: "Bộ phận Kho không có quyền sửa Quản lý công nợ". */
  tenBoPhan(q: QuyenCuaToi): string {
    if (q.laKhach) return 'Khách hàng';
    const ten = q.boPhan.map((b) => BANG_QUYEN[b].nhan);
    const capTen = q.cap.map((c) => (c === CAP.TruongPhong ? 'Trưởng phòng' : 'Giám đốc'));
    return [...ten, ...capTen].join(' + ') || 'Chưa gán bộ phận';
  }
}

export { QUYEN_LE };
export type { QuyenLe };
