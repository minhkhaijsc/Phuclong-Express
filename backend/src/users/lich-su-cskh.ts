import type { Sequelize } from 'sequelize-typescript';
import type { Transaction } from 'sequelize';

/**
 * LỊCH SỬ gán CSKH phụ trách — bảng `tbLichSuCskh`, xem
 * `database/migrations/them-lich-su-cskh.sql` để biết vì sao có bảng này.
 *
 * Một dòng = "từ ngày TuNgay, khách thuộc CSKH". Một dòng công nợ ngày D thuộc
 * về dòng lịch sử có TuNgay <= D mới nhất.
 */
export const BANG_LICH_SU_CSKH = 'tbLichSuCskh';

/**
 * Ngày gán đầu tiên của một khách: trước đó không ai ghi khách thuộc ai, nên
 * toàn bộ quá khứ tính cho người được gán đầu tiên.
 */
export const NGAY_GAN_DAU = '19000101';

/**
 * Đồng bộ lịch sử với `AspNetUsers.CSKHPhuTrach`: khách nào có người phụ trách
 * hiện tại KHÁC dòng lịch sử mới nhất thì ghi thêm một dòng, hiệu lực từ hôm
 * nay (hoặc từ `NGAY_GAN_DAU` nếu là lần gán đầu).
 *
 * VÌ SAO ĐỒNG BỘ thay vì mỗi đường sửa tự ghi "cũ → mới": CSKHPhuTrach được ghi
 * từ năm chỗ (tạo user, sửa user, gán hàng loạt, nhập Excel tạo / sửa). Đồng bộ
 * so với chính cột đó thì chạy hai lần không sinh trùng, chạy thiếu một lần thì
 * lần sau tự bù — báo cáo gọi thêm một lượt cho tất cả trước khi đọc.
 *
 * Không dùng trigger trên AspNetUsers: Sequelize (và EF của hệ cũ) ghi bảng đó
 * bằng `OUTPUT INSERTED`, mà SQL Server cấm OUTPUT không INTO trên bảng có
 * trigger — gắn trigger là vỡ đường tạo / sửa user.
 *
 * @param khach danh sách mã khách vừa đổi; bỏ trống = đồng bộ tất cả.
 */
export async function dongBoLichSuCskh(
  sequelize: Sequelize,
  nguoiDoi: string,
  khach?: string[],
  transaction?: Transaction,
): Promise<number> {
  const ds = (khach ?? []).map((k) => String(k ?? '').trim()).filter(Boolean);
  if (khach && !ds.length) return 0;

  const [, soDong] = (await sequelize.query(
    `INSERT INTO dbo.${BANG_LICH_SU_CSKH} (UserName, CSKH, TuNgay, NguoiDoi)
     SELECT u.UserName,
            NULLIF(LTRIM(RTRIM(u.CSKHPhuTrach)), ''),
            CASE WHEN h.ID IS NULL THEN '${NGAY_GAN_DAU}' ELSE CAST(GETDATE() AS date) END,
            :nguoiDoi
       FROM dbo.AspNetUsers u
       OUTER APPLY (SELECT TOP 1 x.ID, x.CSKH
                      FROM dbo.${BANG_LICH_SU_CSKH} x
                     WHERE x.UserName = u.UserName
                     ORDER BY x.TuNgay DESC, x.ID DESC) h
      WHERE NOT EXISTS (SELECT 1 FROM dbo.AspNetUserRoles r WHERE r.UserId = u.Id)
        AND (:tatCa = 1 OR u.UserName IN (:ds))
        AND (
              (h.ID IS NULL AND ISNULL(LTRIM(RTRIM(u.CSKHPhuTrach)), '') <> '')
           OR (h.ID IS NOT NULL
               AND ISNULL(h.CSKH, '') <> ISNULL(LTRIM(RTRIM(u.CSKHPhuTrach)), ''))
            )`,
    {
      replacements: { nguoiDoi: nguoiDoi || 'system', tatCa: khach ? 0 : 1, ds: ds.length ? ds : [''] },
      transaction,
    },
  )) as [unknown, number];
  return Number(soDong) || 0;
}

/**
 * Ghi lịch sử sau khi một đường đã đổi CSKHPhuTrach — KHÔNG để lỗi ở đây làm
 * hỏng việc chính (đổi CSKH đã ghi rồi). Lỡ hụt thì lượt đồng bộ của báo cáo bù.
 */
export async function ghiLichSuCskhSau(
  sequelize: Sequelize,
  nguoiDoi: string,
  khach: string[],
): Promise<void> {
  try {
    await dongBoLichSuCskh(sequelize, nguoiDoi, khach);
  } catch (e: any) {
    console.error('[LichSuCskh]', e?.message ?? e);
  }
}
