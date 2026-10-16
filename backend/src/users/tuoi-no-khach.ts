import { BadRequestException } from '@nestjs/common';

/**
 * Ô "Tuổi nợ" của khách — số ngày được phép nợ.
 *
 * Để riêng một tệp vì có HAI đường ghi vào cột này: màn chi tiết tài khoản
 * (`users.service`) và màn báo cáo Tuổi nợ (`dashboard/tuoi-no.service`). Hai
 * đường phải chuẩn hoá y như nhau, nếu không thì cùng một ô mà nhập chỗ này ra
 * khác chỗ kia.
 */

/** Trần của ô "Tuổi nợ" — 10 năm. Quá số này gần như chắc chắn là gõ nhầm. */
export const TUOI_NO_TOI_DA = 3650;

/**
 * Chuẩn hoá trước khi ghi.
 *
 * Màn sửa gửi lên CHUỖI RỖNG khi người dùng xoá trắng ô. Để nguyên là Sequelize
 * ném `''` vào cột `int` và cả câu UPDATE vỡ — người dùng chỉ thấy "Cập nhật
 * thất bại" mà không hiểu vì sao. Rỗng nghĩa là KHÔNG CÓ thoả thuận, tức NULL,
 * KHÔNG phải 0: `0` nghĩa là phải trả ngay, hôm sau đã tính quá hạn.
 */
export const chuanHoaTuoiNo = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new BadRequestException('Tuổi nợ phải là số ngày nguyên.');
  }
  if (n < 0) {
    throw new BadRequestException('Tuổi nợ không được là số âm.');
  }
  if (n > TUOI_NO_TOI_DA) {
    throw new BadRequestException(`Tuổi nợ tối đa ${TUOI_NO_TOI_DA} ngày.`);
  }
  return n;
};
