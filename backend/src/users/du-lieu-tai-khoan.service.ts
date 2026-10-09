import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { SystemLogsService } from '../system-logs/system-logs.service';
import {
  BANG_NHAT_KY,
  BANG_PHU_IDENTITY,
  COT_THAM_CHIEU,
  NhomDuLieu,
  tenAnToan,
} from './du-lieu-tai-khoan';

/**
 * Kiểm kê dữ liệu của một tài khoản, rồi chuyển / xoá có kiểm soát.
 *
 * Màn: admin/users — hộp "Xoá tài khoản".
 *
 * VÌ SAO KHÔNG CHO XOÁ THẲNG: `AspNetUsers` không có khoá ngoại nào trỏ về, mọi
 * bảng khác nhớ tài khoản bằng CHUỖI UserName. CSDL sẽ vui vẻ cho xoá và để lại
 * hàng chục nghìn dòng trỏ vào một mã không còn tồn tại — không báo lỗi, không
 * dựng lại được.
 *
 * NÊN LUỒNG LÀ: kiểm kê → người dùng nhìn thấy con số → chọn chuyển đi đâu (hoặc
 * cố ý không chuyển) → chọn đóng mã hay xoá hẳn → ghi nhật ký đầy đủ.
 *
 * Hai nhóm dữ liệu được chuyển RIÊNG vì chúng khác bản chất:
 *   • 'khach' — dữ liệu thuộc về mã. Chuyển = gộp mã này vào mã khác.
 *   • 'nhap'  — dấu vết ai đã nhập. Chuyển = bàn giao đầu việc cho người khác.
 * Gộp chung một ô chọn thì một lần bàn giao cho nhân viên mới sẽ kéo luôn công
 * nợ của khách sang tài khoản nhân viên đó.
 */

export interface MucKiemKe {
  bang: string;
  cot: string;
  nhan: string;
  so: number;
  canhBaoGop?: boolean;
}

export interface KiemKeTaiKhoan {
  id: string;
  userName: string;
  hoTen: string | null;
  vaiTro: string[];
  laNhanVien: boolean;
  /** Âm = khách trả trước. */
  duNo: number;
  lanGiaoDichCuoi: string | null;
  /** Chỉ các mục có số lớn hơn 0. */
  khach: MucKiemKe[];
  nhap: MucKiemKe[];
  tongKhach: number;
  tongNhap: number;
  /** Nhật ký hệ thống — chỉ để biết, không bao giờ bị chuyển hay xoá. */
  nhatKy: number;
}

export interface YeuCauXuLy {
  /** Mã nhận dữ liệu thuộc về tài khoản này. Bỏ trống = để nguyên. */
  chuyenKhachSang?: string;
  /** Mã nhận dấu vết "người nhập". Bỏ trống = để nguyên. */
  chuyenNhapSang?: string;
  /** true = xoá hẳn dòng trong AspNetUsers. */
  xoaTaiKhoan?: boolean;
  lyDo?: string;
  /** Khi xoá hẳn, phải gõ lại đúng UserName. */
  xacNhan?: string;
}

export interface KetQuaXuLy {
  daChuyen: { bang: string; cot: string; nhom: NhomDuLieu; so: number }[];
  tongDaChuyen: number;
  /** Số dòng cố ý để lại, trỏ vào một mã không còn tồn tại. */
  conMoCoi: number;
  daXoaTaiKhoan: boolean;
  /** Vai trò / claim / đăng nhập đã dọn kèm. */
  daDonBangPhu: number;
}

/** Dưới mức này coi là bụi làm tròn của cột float, không phải nợ. */
const NGUONG_CON_NO = 1000;

@Injectable()
export class DuLieuTaiKhoanService {
  constructor(
    @Inject('SEQUELIZE') private readonly sequelize: Sequelize,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  private async hoi<T = any>(sql: string, replacements: Record<string, unknown> = {}, transaction?: any): Promise<T[]> {
    const kq = await this.sequelize.query(sql, {
      replacements,
      transaction,
      type: 'SELECT' as const,
    });
    if (!Array.isArray(kq)) return [];
    return (Array.isArray(kq[0]) ? kq[0] : kq) as T[];
  }

  // ----------------------------------------------------------------
  // KIỂM KÊ
  // ----------------------------------------------------------------

  /**
   * Đếm mọi dòng còn trỏ tới tài khoản.
   *
   * CỐ Ý không lọc `DaXoa = 0`: dòng đã xoá mềm vẫn trỏ vào UserName, xoá tài
   * khoản là chúng cũng mồ côi theo. Người đọc cần thấy con số thật của hậu quả,
   * còn "mã này còn dùng không" thì đã có dư nợ và mốc giao dịch cuối trả lời.
   *
   * Đo trên prod 09/10/2026: 376 ms – 2,1 giây cho một tài khoản. Chấp nhận được
   * cho một hộp thoại mở theo yêu cầu, nên dùng COUNT chứ không EXISTS — con số
   * mới là thứ giúp người ta quyết định.
   */
  async kiemKe(id: string): Promise<KiemKeTaiKhoan> {
    const [tk] = await this.hoi<any>(
      `SELECT Id, UserName, HoTen FROM AspNetUsers WHERE Id = :id`,
      { id },
    );
    if (!tk) throw new NotFoundException('Không tìm thấy tài khoản này');
    const u = String(tk.UserName ?? '');

    const dem = COT_THAM_CHIEU.map(
      (c, i) =>
        `(SELECT COUNT(*) FROM ${tenAnToan(c.bang)} WHERE ${tenAnToan(c.cot)} = :u) AS c${i}`,
    );
    dem.push(
      `(SELECT COUNT(*) FROM ${tenAnToan(BANG_NHAT_KY.bang)} WHERE ${tenAnToan(BANG_NHAT_KY.cot)} = :u) AS nhatKy`,
    );
    dem.push(
      `(SELECT SUM(ISNULL(DR,0)) - SUM(ISNULL(CR,0)) FROM CONGNO WHERE DaXoa = 0 AND UserName = :u) AS duNo`,
    );
    // Mốc muộn nhất trong ba nguồn — giống cách màn trạng thái tính, để hai nơi
    // không nói hai ngày khác nhau về cùng một mã.
    dem.push(`(SELECT MAX(x.d) FROM (
        SELECT MAX(NgayGhiNo) AS d FROM CONGNO     WHERE DaXoa = 0 AND UserName = :u
        UNION ALL SELECT MAX(NgayTao)              FROM tbTracking WHERE DaXoa = 0 AND UserName = :u
        UNION ALL SELECT CAST(MAX(ngaysaveLink) AS datetime) FROM DON_HANG WHERE ISNULL(DaXoa,0) = 0 AND username = :u
      ) x) AS lanCuoi`);

    const [r] = await this.hoi<any>(`SELECT ${dem.join(', ')}`, { u });

    const vaiTro = (
      await this.hoi<any>(
        `SELECT r.Name FROM AspNetUserRoles ur JOIN AspNetRoles r ON r.Id = ur.RoleId WHERE ur.UserId = :id`,
        { id },
      )
    ).map((x) => String(x.Name));

    const muc = (nhom: NhomDuLieu): MucKiemKe[] =>
      COT_THAM_CHIEU.map((c, i) => ({ ...c, so: Number(r?.[`c${i}`] ?? 0) }))
        .filter((m) => m.nhom === nhom && m.so > 0)
        .map(({ bang, cot, nhan, so, canhBaoGop }) => ({ bang, cot, nhan, so, canhBaoGop }))
        .sort((a, b) => b.so - a.so);

    const khach = muc('khach');
    const nhap = muc('nhap');
    const lanCuoi = r?.lanCuoi ? new Date(r.lanCuoi) : null;

    return {
      id: String(tk.Id),
      userName: u,
      hoTen: tk.HoTen ?? null,
      vaiTro,
      laNhanVien: vaiTro.length > 0,
      duNo: Math.round(Number(r?.duNo ?? 0) * 100) / 100,
      lanGiaoDichCuoi: lanCuoi ? lanCuoi.toISOString() : null,
      khach,
      nhap,
      tongKhach: khach.reduce((s, m) => s + m.so, 0),
      tongNhap: nhap.reduce((s, m) => s + m.so, 0),
      nhatKy: Number(r?.nhatKy ?? 0),
    };
  }

  /**
   * Gợi ý mã nhận cho ô "chuyển sang".
   *
   * Đường riêng chứ không dùng lại `GET /users?keyword=`: đường kia trả về cả
   * 981 tài khoản kèm email và điện thoại, gõ mỗi chữ là đẩy từng ấy dữ liệu cá
   * nhân xuống trình duyệt. Ở đây chỉ cần mã, tên, và có phải nhân viên không.
   */
  async timNhanh(tuKhoa: string, nhom?: NhomDuLieu): Promise<{ userName: string; hoTen: string | null; laNhanVien: boolean }[]> {
    const q = (tuKhoa ?? '').trim();
    if (q.length < 2) return [];
    // Gợi ý mã nhận ĐÚNG LOẠI: bàn giao đầu việc thì chỉ nên hiện tài khoản nội
    // bộ, còn gộp mã khách thì chỉ hiện khách. Chọn nhầm loại là chuyển công nợ
    // của khách sang một tài khoản nhân viên.
    const locVaiTro =
      nhom === 'nhap'
        ? ' AND EXISTS (SELECT 1 FROM AspNetUserRoles r WHERE r.UserId = u.Id)'
        : nhom === 'khach'
          ? ' AND NOT EXISTS (SELECT 1 FROM AspNetUserRoles r WHERE r.UserId = u.Id)'
          : '';
    return (
      await this.hoi<any>(
        `SELECT TOP 20 u.UserName, u.HoTen,
                CASE WHEN EXISTS (SELECT 1 FROM AspNetUserRoles r WHERE r.UserId = u.Id) THEN 1 ELSE 0 END AS nv
         FROM AspNetUsers u
         WHERE (u.UserName LIKE '%' + :q + '%' OR ISNULL(u.HoTen,'') LIKE '%' + :q + '%')${locVaiTro}
         ORDER BY CASE WHEN u.UserName = :q THEN 0 WHEN u.UserName LIKE :q + '%' THEN 1 ELSE 2 END, u.UserName`,
        { q },
      )
    ).map((r) => ({
      userName: String(r.UserName),
      hoTen: r.HoTen ?? null,
      laNhanVien: Number(r.nv) === 1,
    }));
  }

  // ----------------------------------------------------------------
  // CHUYỂN / XOÁ
  // ----------------------------------------------------------------

  async xuLy(id: string, yc: YeuCauXuLy, nguoiLam: string): Promise<KetQuaXuLy> {
    const kk = await this.kiemKe(id);
    const lyDo = (yc.lyDo ?? '').trim().slice(0, 500);
    const xoa = yc.xoaTaiKhoan === true;

    if (!lyDo) {
      throw new BadRequestException('Phải ghi lý do — ba tháng sau còn phải trả lời được vì sao.');
    }

    const dich: Partial<Record<NhomDuLieu, string>> = {};
    if ((yc.chuyenKhachSang ?? '').trim()) {
      dich.khach = await this.kiemMaNhan(yc.chuyenKhachSang!.trim(), kk.userName);
    }
    if ((yc.chuyenNhapSang ?? '').trim()) {
      dich.nhap = await this.kiemMaNhan(yc.chuyenNhapSang!.trim(), kk.userName);
    }

    if (!xoa && !dich.khach && !dich.nhap) {
      throw new BadRequestException('Không có gì để làm: chưa chọn chuyển đi đâu, cũng không xoá.');
    }

    if (xoa) await this.kiemTruocKhiXoa(kk, dich, yc, nguoiLam);

    // ------------------------------------------------------------
    // Một giao dịch cho TẤT CẢ: chuyển nửa chừng rồi hỏng là tệ hơn cả không
    // chuyển — dữ liệu nằm rải trên hai mã, không biết đường nào mà lần.
    // ------------------------------------------------------------
    const daChuyen: KetQuaXuLy['daChuyen'] = [];
    let daDonBangPhu = 0;

    await this.sequelize.transaction(async (t) => {
      for (const c of COT_THAM_CHIEU) {
        const moi = dich[c.nhom];
        if (!moi) continue;
        const [kq] = await this.hoi<any>(
          `UPDATE ${tenAnToan(c.bang)} SET ${tenAnToan(c.cot)} = :moi WHERE ${tenAnToan(c.cot)} = :cu;
           SELECT @@ROWCOUNT AS so`,
          { moi, cu: kk.userName },
          t,
        );
        const so = Number(kq?.so ?? 0);
        if (so > 0) daChuyen.push({ bang: c.bang, cot: c.cot, nhom: c.nhom, so });
      }

      if (xoa) {
        for (const b of BANG_PHU_IDENTITY) {
          const [kq] = await this.hoi<any>(
            `DELETE FROM ${tenAnToan(b.bang)} WHERE ${tenAnToan(b.cot)} = :id;
             SELECT @@ROWCOUNT AS so`,
            { id: kk.id },
            t,
          );
          daDonBangPhu += Number(kq?.so ?? 0);
        }
        await this.hoi(`DELETE FROM AspNetUsers WHERE Id = :id`, { id: kk.id }, t);
      }
    });

    const tongDaChuyen = daChuyen.reduce((s, x) => s + x.so, 0);
    const conMoCoi = xoa
      ? (dich.khach ? 0 : kk.tongKhach) + (dich.nhap ? 0 : kk.tongNhap)
      : 0;

    await this.ghiNhatKy(kk, dich, { xoa, lyDo, tongDaChuyen, conMoCoi, daDonBangPhu }, nguoiLam);

    return {
      daChuyen,
      tongDaChuyen,
      conMoCoi,
      daXoaTaiKhoan: xoa,
      daDonBangPhu,
    };
  }

  /** Mã nhận phải có thật và khác mã nguồn. */
  private async kiemMaNhan(ma: string, nguon: string): Promise<string> {
    if (ma.toLowerCase() === nguon.toLowerCase()) {
      throw new BadRequestException('Mã nhận trùng với mã đang xử lý.');
    }
    const [r] = await this.hoi<any>(`SELECT UserName FROM AspNetUsers WHERE UserName = :ma`, { ma });
    if (!r) throw new BadRequestException(`Không có tài khoản nào tên "${ma}".`);
    return String(r.UserName);
  }

  /**
   * Bốn chốt chặn trước khi xoá hẳn.
   *
   * Đều là những thứ người bấm KHÔNG nhìn thấy trên màn: tiền của khách, tài
   * khoản quản trị cuối cùng, và chuyện tự xoá chính mình.
   */
  private async kiemTruocKhiXoa(
    kk: KiemKeTaiKhoan,
    dich: Partial<Record<NhomDuLieu, string>>,
    yc: YeuCauXuLy,
    nguoiLam: string,
  ): Promise<void> {
    // 1. Gõ lại mã — chặn lần bấm nhầm dòng.
    if ((yc.xacNhan ?? '').trim().toLowerCase() !== kk.userName.toLowerCase()) {
      throw new BadRequestException(`Phải gõ đúng mã "${kk.userName}" để xác nhận xoá.`);
    }

    // 2. Không tự xoá mình — mất luôn đường vào để sửa sai.
    if (kk.userName.toLowerCase() === String(nguoiLam ?? '').toLowerCase()) {
      throw new BadRequestException('Không xoá được chính tài khoản đang đăng nhập.');
    }

    // 3. Còn nợ thì phải chuyển đi hoặc chốt trước. Đây là chỗ duy nhất tôi
    //    KHÔNG để người dùng tự quyết: số dư là tiền của khách, xoá mã đi thì
    //    không còn ai để đối chiếu, mà dòng công nợ vẫn nằm đó.
    if (Math.abs(kk.duNo) >= NGUONG_CON_NO && !dich.khach) {
      const chu = kk.duNo > 0 ? `còn nợ ${this.tien(kk.duNo)}` : `đang dư trả trước ${this.tien(-kk.duNo)}`;
      throw new BadRequestException(
        `Mã ${kk.userName} ${chu}. Chốt nợ xong, hoặc chuyển dữ liệu sang mã khác, rồi mới xoá được.`,
      );
    }

    // 4. Không xoá tài khoản quản trị cuối cùng.
    if (kk.vaiTro.includes('Admin')) {
      const [r] = await this.hoi<any>(
        `SELECT COUNT(*) AS so FROM AspNetUserRoles ur
          JOIN AspNetRoles r ON r.Id = ur.RoleId
         WHERE r.Name = 'Admin' AND ur.UserId <> :id`,
        { id: kk.id },
      );
      if (Number(r?.so ?? 0) === 0) {
        throw new BadRequestException('Đây là tài khoản Admin cuối cùng — xoá là không ai vào quản trị được nữa.');
      }
    }
  }

  private tien(v: number): string {
    return `${Math.round(v).toLocaleString('vi-VN')}đ`;
  }

  /**
   * Nhật ký phải đủ để DỰNG LẠI việc đã làm: mã nào, chuyển sang đâu, bao nhiêu
   * dòng, còn bỏ lại bao nhiêu, vì sao. Ghi bằng tên mã (không phải Id) vì sau
   * khi xoá thì Id không tra ngược được nữa.
   */
  private async ghiNhatKy(
    kk: KiemKeTaiKhoan,
    dich: Partial<Record<NhomDuLieu, string>>,
    kq: { xoa: boolean; lyDo: string; tongDaChuyen: number; conMoCoi: number; daDonBangPhu: number },
    nguoiLam: string,
  ): Promise<void> {
    await this.systemLogsService
      .create({
        nguoiTao: nguoiLam,
        nguon: kq.xoa ? 'Users:ChuyenVaXoaTaiKhoan' : 'Users:ChuyenDuLieuTaiKhoan',
        hanhDong: kq.xoa ? 'Xoa' : 'Chinh sua',
        doiTuong: kk.id,
        noiDung:
          `UserName: ${kk.userName}; HoTen: ${kk.hoTen ?? ''}; VaiTro: ${kk.vaiTro.join('/') || '(khong)'}; ` +
          `DuNo: ${kk.duNo}; ` +
          `ChuyenDuLieuKhachSang: ${dich.khach ?? '(khong chuyen)'}; ` +
          `ChuyenDauViecSang: ${dich.nhap ?? '(khong chuyen)'}; ` +
          `SoDongDaChuyen: ${kq.tongDaChuyen}; SoDongBoLaiMoCoi: ${kq.conMoCoi}; ` +
          `DaXoaTaiKhoan: ${kq.xoa}; DonBangPhuIdentity: ${kq.daDonBangPhu}; ` +
          `LyDo: ${kq.lyDo}`,
      })
      .catch((err) => console.error('[SystemLog]', err?.message ?? err));
  }
}
