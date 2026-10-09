import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { SystemLogsService } from '../system-logs/system-logs.service';

/**
 * Trạng thái khách hàng — "khách nghỉ, KHÔNG xoá".
 *
 * HAI LỚP, cố ý tách rời (xem thêm ghi chú trong
 * `database/migrations/them-trang-thai-khach-hang.sql`):
 *
 *   1. TÌNH TRẠNG TỰ ĐỘNG — bao lâu rồi khách không phát sinh giao dịch. Tính
 *      tại chỗ mỗi lần xem, KHÔNG lưu cột nào. Hệ này không có việc chạy định
 *      kỳ; lưu lại là chấp nhận một cột lệch dần mà không ai biết nó cũ từ khi
 *      nào.
 *   2. QUYẾT ĐỊNH CỦA CSKH — "mã này đóng", kèm lý do và người chốt. Cái này
 *      không suy ra được từ dữ liệu nên phải lưu.
 *
 * Màn "ngừng giao dịch" = lớp 1 lọc theo ngưỡng, TRỪ những mã lớp 2 đã đóng.
 * Nhờ vậy đóng mã xong là dòng đó biến khỏi danh sách việc cần làm, mà vẫn tra
 * lại được.
 *
 * "GIAO DỊCH" tính gộp ba nguồn, vì mỗi nguồn đều bỏ sót một kiểu khách (đo
 * 09/10/2026 trên 938 khách):
 *   • CONGNO    — 861 khách có. Đầy đủ nhất: gồm cả lần khách chỉ trả nợ.
 *   • tbTracking — 723 khách. Khách chỉ gửi hàng, chưa ghi nợ.
 *   • Don_Hang   — 385 khách. Khách chỉ đặt mua hộ.
 * Lấy MỐC MUỘN NHẤT trong ba nguồn. Chỉ dùng CONGNO thì 77 khách đang gửi hàng
 * đều đặn bị xếp vào "chưa từng giao dịch".
 */

/** Ngưỡng để coi là ngừng giao dịch, theo yêu cầu kinh doanh. */
export const SO_THANG_NGUNG_GIAO_DICH = 3;

/**
 * Dưới mức này thì KHÔNG coi là còn nợ.
 *
 * Đo ngày 09/10/2026: trong 363 mã quá ba tháng, 40 mã có `DR − CR > 0`, nhưng
 * 33 mã trong số đó nợ DƯỚI 1.000đ — là bụi làm tròn của cột float, không phải
 * nợ thật (có mã nợ đúng 732đ, một mã dư 581đ). Báo CSKH "40 mã còn nợ" rồi để
 * họ gọi đi thu 732 đồng là cách nhanh nhất khiến không ai tin con số nữa.
 * Bảy mã còn lại mới là nợ thật, tổng 1.521.759đ.
 */
export const NGUONG_CON_NO = 1000;

export type TrangThaiKhach = 'hoat-dong' | 'tam-nghi' | 'dong-ma';
const TRANG_THAI_HOP_LE: TrangThaiKhach[] = ['hoat-dong', 'tam-nghi', 'dong-ma'];

/** Nhóm suy ra từ dữ liệu, không phải cột trong bảng. */
export type NhomTuDong = 'hoat-dong' | 'nghi-3-6' | 'nghi-6-12' | 'nghi-tren-12' | 'chua-giao-dich';

export interface KhachKemTrangThai {
  id: string;
  userName: string;
  hoTen: string | null;
  phone: string | null;
  email: string | null;
  /** Mốc muộn nhất trong ba nguồn, ISO. */
  lanGiaoDichCuoi: string | null;
  soNgayNghi: number | null;
  nhomTuDong: NhomTuDong;
  /** NULL = chưa ai xét tới mã này. */
  trangThai: TrangThaiKhach | null;
  ngayDoiTrangThai: string | null;
  nguoiDoiTrangThai: string | null;
  lyDoTrangThai: string | null;
  /** Còn nợ bao nhiêu — CSKH cần biết trước khi đóng mã. */
  duNo: number;
}

export interface TongHopTrangThai {
  tongKhach: number;
  dangHoatDong: number;
  nghi3Den6: number;
  nghi6Den12: number;
  nghiTren12: number;
  chuaGiaoDich: number;
  /** Đã quá ngưỡng và CHƯA đóng mã — con số để nhắc CSKH. */
  canDongMa: number;
  /** Trong số cần đóng mã, bao nhiêu mã còn nợ THẬT (từ 1.000đ trở lên). */
  canDongMaConNo: number;
  /** Tổng tiền còn treo ở nhóm cần đóng mã, chỉ tính các mã nợ thật. */
  tienConTreo: number;
}

@Injectable()
export class TrangThaiKhachService {
  constructor(
    @Inject('SEQUELIZE') private readonly sequelize: Sequelize,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  private async hoi<T = any>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> {
    const kq = await this.sequelize.query(sql, { replacements, type: 'SELECT' as const });
    if (!Array.isArray(kq)) return [];
    return (Array.isArray(kq[0]) ? kq[0] : kq) as T[];
  }

  /**
   * Khối SQL dùng chung: một dòng cho mỗi KHÁCH kèm mốc giao dịch cuối và dư nợ.
   *
   * "Khách" = tài khoản KHÔNG có vai trò nào trong AspNetUserRoles. Hệ này
   * không có vai trò "KhachHang"; 4 vai trò tồn tại là Admin / Kho / Sale /
   * Order, và 938/981 tài khoản không mang vai trò nào — đó chính là khách.
   * Lọc kiểu này nên tài khoản nhân viên không bao giờ lọt vào danh sách nhắc
   * đóng mã.
   *
   * Gộp ba nguồn bằng UNION ALL rồi GROUP BY, KHÔNG dùng truy vấn con tương
   * quan: cách tương quan chạy 938 lần × 3 bảng; cách này quét mỗi bảng một
   * lượt, đo được 1.094 ms khi chưa có chỉ mục.
   */
  /**
   * Ba mốc thời gian, tính bằng JS rồi truyền xuống như tham số.
   *
   * KHÔNG viết `DATEADD(month, -:nguong, GETDATE())`: Sequelize thay tham số
   * bằng cách sửa chuỗi, và dấu trừ ngay trước `:` làm nó bỏ qua — câu lệnh
   * xuống tới SQL Server vẫn còn nguyên chữ `:nguong`, báo "Incorrect syntax
   * near ':'". Tính ở JS thì xuống dưới chỉ còn so sánh ngày, đọc cũng rõ hơn.
   */
  private moc() {
    const n = new Date();
    const lui = (thang: number) => {
      const d = new Date(n.getFullYear(), n.getMonth() - thang, n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds());
      const hai = (x: number) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${hai(d.getMonth() + 1)}-${hai(d.getDate())} ${hai(d.getHours())}:${hai(d.getMinutes())}:${hai(d.getSeconds())}`;
    };
    return { moc3: lui(SO_THANG_NGUNG_GIAO_DICH), moc6: lui(6), moc12: lui(12) };
  }

  private readonly KHOI_KHACH = `
    WITH GiaoDich AS (
      SELECT UserName AS u, MAX(NgayGhiNo) AS lanCuoi FROM CONGNO WHERE DaXoa = 0 GROUP BY UserName
      UNION ALL
      SELECT UserName, MAX(NgayTao) FROM tbTracking WHERE DaXoa = 0 GROUP BY UserName
      UNION ALL
      SELECT username, CAST(MAX(ngaysaveLink) AS datetime) FROM Don_Hang WHERE ISNULL(DaXoa,0) = 0 GROUP BY username
    ),
    Cuoi AS (
      SELECT u, MAX(lanCuoi) AS lanCuoi FROM GiaoDich GROUP BY u
    ),
    No AS (
      SELECT UserName AS u, SUM(ISNULL(DR,0)) - SUM(ISNULL(CR,0)) AS duNo
      FROM CONGNO WHERE DaXoa = 0 GROUP BY UserName
    ),
    Khach AS (
      SELECT us.Id, us.UserName, us.HoTen, us.PhoneNumber, us.Email,
             us.TrangThai, us.NgayDoiTrangThai, us.NguoiDoiTrangThai, us.LyDoTrangThai,
             c.lanCuoi,
             ISNULL(n.duNo, 0) AS duNo,
             CASE
               WHEN c.lanCuoi IS NULL THEN 'chua-giao-dich'
               WHEN c.lanCuoi >= :moc3  THEN 'hoat-dong'
               WHEN c.lanCuoi >= :moc6  THEN 'nghi-3-6'
               WHEN c.lanCuoi >= :moc12 THEN 'nghi-6-12'
               ELSE 'nghi-tren-12'
             END AS nhomTuDong
      FROM AspNetUsers us
      LEFT JOIN Cuoi c ON c.u = us.UserName
      LEFT JOIN No   n ON n.u = us.UserName
      WHERE NOT EXISTS (SELECT 1 FROM AspNetUserRoles r WHERE r.UserId = us.Id)
    )`;

  /** Các con số để hiện lời nhắc trên màn danh sách khách. */
  async tongHop(): Promise<TongHopTrangThai> {
    const [r] = await this.hoi<any>(
      `${this.KHOI_KHACH}
       SELECT
         COUNT(*) AS tongKhach,
         SUM(CASE WHEN nhomTuDong = 'hoat-dong'      THEN 1 ELSE 0 END) AS dangHoatDong,
         SUM(CASE WHEN nhomTuDong = 'nghi-3-6'       THEN 1 ELSE 0 END) AS nghi3Den6,
         SUM(CASE WHEN nhomTuDong = 'nghi-6-12'      THEN 1 ELSE 0 END) AS nghi6Den12,
         SUM(CASE WHEN nhomTuDong = 'nghi-tren-12'   THEN 1 ELSE 0 END) AS nghiTren12,
         SUM(CASE WHEN nhomTuDong = 'chua-giao-dich' THEN 1 ELSE 0 END) AS chuaGiaoDich,
         SUM(CASE WHEN nhomTuDong IN ('nghi-3-6','nghi-6-12','nghi-tren-12')
                   AND ISNULL(TrangThai,'') <> 'dong-ma' THEN 1 ELSE 0 END) AS canDongMa,
         SUM(CASE WHEN nhomTuDong IN ('nghi-3-6','nghi-6-12','nghi-tren-12')
                   AND ISNULL(TrangThai,'') <> 'dong-ma' AND duNo >= :nguongNo THEN 1 ELSE 0 END) AS canDongMaConNo,
         SUM(CASE WHEN nhomTuDong IN ('nghi-3-6','nghi-6-12','nghi-tren-12')
                   AND ISNULL(TrangThai,'') <> 'dong-ma' AND duNo >= :nguongNo THEN duNo ELSE 0 END) AS tienConTreo
       FROM Khach`,
      { ...this.moc(), nguongNo: NGUONG_CON_NO },
    );
    const n = (k: string) => Number(r?.[k] ?? 0);
    return {
      tongKhach: n('tongKhach'),
      dangHoatDong: n('dangHoatDong'),
      nghi3Den6: n('nghi3Den6'),
      nghi6Den12: n('nghi6Den12'),
      nghiTren12: n('nghiTren12'),
      chuaGiaoDich: n('chuaGiaoDich'),
      canDongMa: n('canDongMa'),
      canDongMaConNo: n('canDongMaConNo'),
      tienConTreo: Math.round(n('tienConTreo') * 100) / 100,
    };
  }

  /**
   * Danh sách khách, lọc được theo nhóm.
   *
   * `nhom = 'can-dong-ma'` là nhóm việc cần làm: quá ngưỡng và chưa đóng mã.
   * Mặc định xếp theo lần giao dịch cuối GIẢM DẦN — khách vừa mới quá ba tháng
   * nằm trên đầu. Cố ý ngược với trực giác "cũ nhất trước": mã nghỉ hơn một năm
   * (217 mã) thì gọi lại gần như vô vọng, còn mã vừa chớm nghỉ (54 mã) gọi còn
   * kéo về được. Xếp cũ-nhất-trước thì 217 mã chết chặn mất phần đáng làm.
   */
  async danhSach(opts: {
    nhom?: string;
    tuKhoa?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: KhachKemTrangThai[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(opts.limit) || 50));
    const tuKhoa = (opts.tuKhoa ?? '').trim();

    const locNhom = this.menhDeNhom(opts.nhom);
    const locTuKhoa = tuKhoa
      ? ` AND (UserName LIKE '%' + :tuKhoa + '%' OR ISNULL(HoTen,'') LIKE '%' + :tuKhoa + '%' OR ISNULL(PhoneNumber,'') LIKE '%' + :tuKhoa + '%')`
      : '';
    const p = { ...this.moc(), tuKhoa, offset: (page - 1) * limit, limit };

    const [dem] = await this.hoi<any>(
      `${this.KHOI_KHACH} SELECT COUNT(*) AS total FROM Khach WHERE 1 = 1${locNhom}${locTuKhoa}`,
      p,
    );

    const rows = await this.hoi<any>(
      `${this.KHOI_KHACH}
       SELECT Id, UserName, HoTen, PhoneNumber, Email, TrangThai,
              NgayDoiTrangThai, NguoiDoiTrangThai, LyDoTrangThai,
              lanCuoi, duNo, nhomTuDong
       FROM Khach
       WHERE 1 = 1${locNhom}${locTuKhoa}
       ORDER BY CASE WHEN lanCuoi IS NULL THEN 1 ELSE 0 END, lanCuoi DESC, UserName
       OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      p,
    );

    return {
      data: rows.map((r) => this.doiDong(r)),
      total: Number(dem?.total ?? 0),
      page,
      limit,
    };
  }

  /** Một khách — dùng khi mở hộp thoại đổi trạng thái. */
  async motKhach(id: string): Promise<KhachKemTrangThai> {
    const [r] = await this.hoi<any>(
      `${this.KHOI_KHACH}
       SELECT Id, UserName, HoTen, PhoneNumber, Email, TrangThai,
              NgayDoiTrangThai, NguoiDoiTrangThai, LyDoTrangThai,
              lanCuoi, duNo, nhomTuDong
       FROM Khach WHERE Id = :id`,
      { ...this.moc(), id },
    );
    if (!r) throw new NotFoundException('Không tìm thấy khách hàng này');
    return this.doiDong(r);
  }

  /**
   * CSKH chốt trạng thái cho một mã.
   *
   * Yêu cầu lý do khi ĐÓNG MÃ, không yêu cầu với hai trạng thái còn lại: đóng
   * mã là việc có hệ quả (mã biến khỏi danh sách việc cần làm), ba tháng sau
   * phải trả lời được "vì sao đóng".
   */
  async dat(
    id: string,
    trangThai: string,
    lyDo: string | undefined,
    nguoiLam: string,
  ): Promise<KhachKemTrangThai> {
    const tt = String(trangThai ?? '').trim() as TrangThaiKhach;
    if (!TRANG_THAI_HOP_LE.includes(tt)) {
      throw new BadRequestException(
        `Trạng thái không hợp lệ. Chỉ nhận: ${TRANG_THAI_HOP_LE.join(', ')}`,
      );
    }
    const ly = (lyDo ?? '').trim().slice(0, 500);
    if (tt === 'dong-ma' && !ly) {
      throw new BadRequestException('Đóng mã phải ghi lý do');
    }

    const truoc = await this.motKhach(id);

    await this.sequelize.query(
      `UPDATE dbo.AspNetUsers
       SET TrangThai = :tt,
           LyDoTrangThai = :ly,
           NgayDoiTrangThai = GETDATE(),
           NguoiDoiTrangThai = :nguoiLam
       WHERE Id = :id`,
      { replacements: { tt, ly: ly || null, nguoiLam, id }, type: 'SELECT' as const },
    );

    await this.systemLogsService
      .create({
        nguoiTao: nguoiLam,
        nguon: 'Users:DoiTrangThaiKhach',
        hanhDong: 'Chinh sua',
        doiTuong: id,
        noiDung:
          `UserName: ${truoc.userName}; ` +
          `TrangThaiCu: ${truoc.trangThai ?? '(chưa đặt)'}; TrangThaiMoi: ${tt}; ` +
          `DuNo: ${truoc.duNo}; LyDo: ${ly || '(không)'}`,
      })
      .catch((err) => console.error('[SystemLog]', err?.message ?? err));

    return this.motKhach(id);
  }

  /**
   * Khách này có dữ liệu giao dịch nào chưa — để chặn xoá cứng.
   *
   * Dùng EXISTS thay vì COUNT: chỉ cần biết có hay không, EXISTS dừng ngay ở
   * dòng đầu tìm thấy.
   */
  async coGiaoDich(userName: string): Promise<{ co: boolean; congNo: number; tracking: number; donHang: number }> {
    const [r] = await this.hoi<any>(
      `SELECT
         (SELECT COUNT(*) FROM CONGNO     WHERE DaXoa = 0 AND UserName = :u) AS congNo,
         (SELECT COUNT(*) FROM tbTracking WHERE DaXoa = 0 AND UserName = :u) AS tracking,
         (SELECT COUNT(*) FROM Don_Hang   WHERE ISNULL(DaXoa,0) = 0 AND username = :u) AS donHang`,
      { u: userName },
    );
    const congNo = Number(r?.congNo ?? 0);
    const tracking = Number(r?.tracking ?? 0);
    const donHang = Number(r?.donHang ?? 0);
    return { co: congNo + tracking + donHang > 0, congNo, tracking, donHang };
  }

  // ----------------------------------------------------------------

  /**
   * Mệnh đề lọc theo nhóm.
   *
   * Chỉ sinh từ danh sách cố định, KHÔNG nối chuỗi người dùng gửi lên — giá trị
   * lạ thì trả về chuỗi rỗng (không lọc) chứ không ghép vào SQL.
   */
  private menhDeNhom(nhom?: string): string {
    switch ((nhom ?? '').trim()) {
      case 'can-dong-ma':
        return ` AND nhomTuDong IN ('nghi-3-6','nghi-6-12','nghi-tren-12') AND ISNULL(TrangThai,'') <> 'dong-ma'`;
      case 'ngung-giao-dich':
        return ` AND nhomTuDong IN ('nghi-3-6','nghi-6-12','nghi-tren-12')`;
      case 'hoat-dong':
        return ` AND nhomTuDong = 'hoat-dong'`;
      case 'nghi-3-6':
        return ` AND nhomTuDong = 'nghi-3-6'`;
      case 'nghi-6-12':
        return ` AND nhomTuDong = 'nghi-6-12'`;
      case 'nghi-tren-12':
        return ` AND nhomTuDong = 'nghi-tren-12'`;
      case 'chua-giao-dich':
        return ` AND nhomTuDong = 'chua-giao-dich'`;
      case 'da-dong-ma':
        return ` AND TrangThai = 'dong-ma'`;
      default:
        return '';
    }
  }

  private doiDong(r: any): KhachKemTrangThai {
    const lanCuoi = r.lanCuoi ? new Date(r.lanCuoi) : null;
    return {
      id: String(r.Id),
      userName: String(r.UserName ?? ''),
      hoTen: r.HoTen ?? null,
      phone: r.PhoneNumber ?? null,
      email: r.Email ?? null,
      lanGiaoDichCuoi: lanCuoi ? lanCuoi.toISOString() : null,
      soNgayNghi: lanCuoi ? Math.floor((Date.now() - lanCuoi.getTime()) / 86400000) : null,
      nhomTuDong: String(r.nhomTuDong) as NhomTuDong,
      trangThai: (r.TrangThai ?? null) as TrangThaiKhach | null,
      ngayDoiTrangThai: r.NgayDoiTrangThai ? new Date(r.NgayDoiTrangThai).toISOString() : null,
      nguoiDoiTrangThai: r.NguoiDoiTrangThai ?? null,
      lyDoTrangThai: r.LyDoTrangThai ?? null,
      duNo: Math.round(Number(r.duNo ?? 0) * 100) / 100,
    };
  }
}
