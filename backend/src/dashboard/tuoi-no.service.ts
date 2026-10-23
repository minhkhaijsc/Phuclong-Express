import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { chuanHoaTuoiNo } from '../users/tuoi-no-khach';

/**
 * Báo cáo TUỔI NỢ.
 *
 * PLE đã có 9 màn báo cáo công nợ, nhưng không màn nào trả lời được "ai nợ LÂU
 * nhất" — tất cả chỉ hiện số dư, không hiện thời gian. Khảo sát 07/10/2026:
 * 165 khách còn nợ, tổng 450.270.501đ, trong đó có khoản 17,8 triệu đã 67 ngày
 * không phát sinh gì.
 *
 * CÁCH TÍNH TUỔI: khấu trừ tiền thu (CR) vào các khoản nợ (DR) theo thứ tự CŨ
 * TRƯỚC (FIFO). Đây là chỗ dễ làm sai nhất:
 *
 *   Nếu chỉ lấy số dư cuối rồi gán cho ngày ghi nợ gần nhất, thì một khách nợ
 *   từ 6 tháng trước nhưng tháng này có phát sinh mới sẽ hiện là "nợ 0-30 ngày"
 *   — nợ già bị giấu mất, đúng cái mà báo cáo này sinh ra để phát hiện.
 *
 * FIFO là cách kế toán vẫn dùng: tiền trả về thì trừ vào hoá đơn cũ nhất trước.
 *
 * CHỖ DỄ SAI NHẤT, ĐÃ TRẢ GIÁ MỘT LẦN: sổ công nợ này ghi BÚT TOÁN ĐẢO bằng
 * `DR` ÂM, không phải bằng `CR` — 1.943 dòng, tổng −7,44 tỷ, nội dung kiểu
 * "Cancel đơn hàng 26016", "Mass Received đơn hàng 24395".
 *
 * Bản đầu tiên lọc `DR > 0` nên vứt hết các bút toán đảo và thổi tổng nợ từ
 * 449 triệu lên 7,8 tỷ — gấp 17 lần. Vì vậy phải tính theo BIẾN ĐỘNG RÒNG của
 * từng dòng (`DR - CR`): dương là phát sinh nợ (có tuổi), âm là khoản giảm trừ
 * (khấu vào nợ cũ nhất trước).
 *
 * ---------------------------------------------------------------------------
 * TUỔI NỢ RIÊNG TỪNG KHÁCH (yêu cầu bên khách 16/10/2026)
 *
 *   "nếu ko co tuoi nợ thì cứ tính từ ngày up công nơ, chia ra, dưới 30 ngày,
 *    trên 30 ngày duoi 60 ngay, và trên 60 ngày. còn khách nào có tuổi nợ, thì
 *    phần mềm nó tự tính căn cứ vào tuổi nơ, ko dua vào ngày up cong no"
 *
 * `AspNetUsers.TuoiNo` là số ngày khách được phép nợ. Từ đó sinh ra MỘT con số
 * duy nhất để chia nhóm, gọi là `soNgay`:
 *
 *   • Khách KHÔNG có tuổi nợ  → `soNgay` = tuổi thật, đếm từ ngày ghi nợ.
 *   • Khách CÓ tuổi nợ        → `soNgay` = tuổi thật − tuổi nợ = số ngày QUÁ HẠN.
 *     Chưa tới hạn (`soNgay <= 0`) thì KHÔNG phải nợ quá hạn — xếp riêng một ô
 *     "Chưa tới hạn", không nhét vào nhóm "dưới 30 ngày".
 *
 * Phải có ô "Chưa tới hạn" thì bốn con số mới cộng lại đúng bằng tổng còn nợ.
 * Bỏ nó đi là tiền biến mất khỏi báo cáo, kế toán đối chiếu không ra.
 *
 * Ba nhóm quá hạn theo đúng lời bên khách: ≤30, 31–60, >60. Bản trước chia bốn
 * nhóm (thêm 61–90 và >90) — đã gộp hai nhóm cuối lại thành ">60".
 */

/** Chia nhóm theo `soNgay`. Giữ cùng một bộ số ở cả SQL lẫn TypeScript. */
export const MOC_NGAY = { ba_muoi: 30, sau_muoi: 60 } as const;

export interface DongTuoiNo {
  khach: string;
  tong: number;
  /** Số ngày khách được phép nợ. `null` = không có thoả thuận. */
  tuoiNo: number | null;
  /** Khoản chưa tới hạn trả — chỉ khách CÓ tuổi nợ mới có phần này. */
  chuaToiHan: number;
  n0_30: number;
  n31_60: number;
  tren60: number;
  /** Tuổi thật (tính từ ngày ghi nợ) của khoản chưa trả CŨ NHẤT. */
  soNgayCuNhat: number;
  /**
   * Số ngày quá hạn nhiều nhất. Bằng `soNgayCuNhat` với khách không có tuổi nợ;
   * âm hoặc 0 nghĩa là chưa khoản nào tới hạn.
   */
  soNgayQuaHan: number;
  /** Lần cuối có phát sinh bất kỳ (nợ hoặc thu). */
  lanCuoi: string | null;
}

export interface TongHopTuoiNo {
  soKhachConNo: number;
  tongConNo: number;
  chuaToiHan: number;
  /**
   * Phần nợ của khách CHƯA ĐẶT tuổi nợ. Phần này vẫn nằm trong ba nhóm tuổi
   * (đếm từ ngày ghi nợ), nhưng KHÔNG được gọi là "quá hạn": chưa có thoả
   * thuận thì chưa có hạn mà quá.
   *
   * Thiếu con số này, màn hình lấy cả ba nhóm làm "đang quá hạn" — đúng cái
   * kế toán bắt được 23/10/2026: 0/985 khách có tuổi nợ, nên "đang quá hạn"
   * bằng y tổng còn nợ.
   */
  chuaDatTuoiNo: number;
  n0_30: number;
  n31_60: number;
  tren60: number;
}

/** Một dòng trong file Excel đặt tuổi nợ hàng loạt. */
export interface DongDatHangLoat {
  khach: string;
  /** Số ngày, hoặc rỗng/null để xoá thoả thuận. */
  tuoiNo: unknown;
}

export interface KetQuaDatHangLoat {
  /** Số khách thật sự đổi giá trị. */
  soDaGhi: number;
  /** Dòng hợp lệ nhưng giá trị y như cũ — không ghi lại làm gì. */
  soKhongDoi: number;
  loi: { dong: number; khach: string; lyDo: string }[];
}

/** Trần số dòng một lần nhập. Nhiều hơn thì chia file. */
export const SO_DONG_TOI_DA = 2000;

export interface DongChiTietTuoiNo {
  ngay: string;
  noiDung: string;
  conLai: number;
  /** Tuổi thật, đếm từ ngày ghi nợ. */
  soNgay: number;
  /** Số ngày quá hạn. Bằng `soNgay` khi khách không có tuổi nợ. */
  soNgayQuaHan: number;
  /** Hạn phải trả (`yyyy-mm-dd`). `null` khi khách không có tuổi nợ. */
  hanTra: string | null;
}

@Injectable()
export class TuoiNoService {
  constructor(
    @Inject('SEQUELIZE') private readonly sequelize: Sequelize,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  /**
   * Khấu trừ FIFO, trả về phần CHƯA TRẢ của từng dòng nợ kèm tuổi và nhóm.
   *
   * `luyKeNo` là tổng nợ cộng dồn tới dòng đó. So với tổng đã thu:
   *   luyKeNo - tongThu <= 0        -> dòng này đã trả hết
   *   luyKeNo - tongThu >= DR       -> dòng này chưa trả đồng nào
   *   ở giữa                        -> trả một phần
   *
   * `nhom`: 0 chưa tới hạn · 1 quá hạn ≤30 · 2 quá hạn 31–60 · 3 quá hạn >60.
   *
   * Nối `AspNetUsers` bằng LEFT JOIN, không phải JOIN: 5 trong 895 mã khách
   * trên sổ công nợ không còn tài khoản tương ứng. JOIN thường là 5 mã đó biến
   * mất khỏi báo cáo cùng với tiền của họ.
   *
   * Bỏ qua khách có số dư <= 1.000đ: lẻ do làm tròn, đưa vào chỉ làm nhiễu.
   *
   * Và bỏ cả những DÒNG còn dưới 1đ. Phép khấu trừ FIFO chạy trên kiểu `float`
   * nên để lại bụi: 51 dòng còn sót tổng cộng 11,8đ trên toàn sổ. Tiền thì
   * không đáng kể, nhưng TUỔI thì sai hẳn — khách HP142 trả hết từ lâu, còn
   * đúng 0,0000001đ ở một dòng 266 ngày trước, là màn hình ghi "khoản cũ nhất
   * 266 ngày" trong khi cả cột tiền nằm ở nhóm 0-30.
   */
  private readonly SQL_FIFO = `
    WITH ChuyenDong AS (
      SELECT c.UserName, c.NgayGhiNo, c.CongNo_ID,
             ISNULL(c.DR,0) - ISNULL(c.CR,0) AS bien
      FROM CONGNO c WHERE c.DaXoa = 0
    ),
    TongGiam AS (
      SELECT UserName, SUM(CASE WHEN bien < 0 THEN -bien ELSE 0 END) AS tongGiam
      FROM ChuyenDong GROUP BY UserName
    ),
    HanNo AS (
      SELECT UserName, TuoiNo
      FROM dbo.AspNetUsers
      WHERE TuoiNo IS NOT NULL AND TuoiNo >= 0
    ),
    No AS (
      SELECT d.UserName, d.NgayGhiNo, d.bien AS DR,
             SUM(d.bien) OVER (
               PARTITION BY d.UserName ORDER BY d.NgayGhiNo, d.CongNo_ID
               ROWS UNBOUNDED PRECEDING
             ) AS luyKeNo
      FROM ChuyenDong d
      WHERE d.bien > 0
    ),
    ChuaTra AS (
      SELECT n.UserName, n.NgayGhiNo, h.TuoiNo,
             DATEDIFF(day, n.NgayGhiNo, GETDATE()) AS tuoiThat,
             DATEDIFF(day, n.NgayGhiNo, GETDATE()) - ISNULL(h.TuoiNo, 0) AS soNgay,
             CASE
               WHEN n.luyKeNo - ISNULL(g.tongGiam,0) <= 0 THEN 0
               WHEN n.luyKeNo - ISNULL(g.tongGiam,0) >= n.DR THEN n.DR
               ELSE n.luyKeNo - ISNULL(g.tongGiam,0)
             END AS conLai
      FROM No n
      LEFT JOIN TongGiam g ON g.UserName = n.UserName
      LEFT JOIN HanNo h ON h.UserName = n.UserName
    ),
    PhanNhom AS (
      SELECT UserName, NgayGhiNo, TuoiNo, tuoiThat, soNgay, conLai,
             CASE
               WHEN TuoiNo IS NOT NULL AND soNgay <= 0 THEN 0
               WHEN soNgay <= ${MOC_NGAY.ba_muoi} THEN 1
               WHEN soNgay <= ${MOC_NGAY.sau_muoi} THEN 2
               ELSE 3
             END AS nhom
      FROM ChuaTra
    )`;

  private async hoi<T = any>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> {
    const kq = await this.sequelize.query(sql, { replacements, type: 'SELECT' as const });
    if (!Array.isArray(kq)) return [];
    return (Array.isArray(kq[0]) ? kq[0] : kq) as T[];
  }

  /** Tổng hợp theo nhóm tuổi — mấy ô đầu màn. */
  async tongHop(): Promise<TongHopTuoiNo> {
    const [r] = await this.hoi<any>(`
      ${this.SQL_FIFO}
      , TheoKhach AS (
        SELECT UserName,
               SUM(conLai) AS tong,
               SUM(CASE WHEN nhom = 0 THEN conLai ELSE 0 END) AS chuaToiHan,
               SUM(CASE WHEN nhom = 1 THEN conLai ELSE 0 END) AS n0_30,
               SUM(CASE WHEN nhom = 2 THEN conLai ELSE 0 END) AS n31_60,
               SUM(CASE WHEN nhom = 3 THEN conLai ELSE 0 END) AS tren60,
               SUM(CASE WHEN TuoiNo IS NULL THEN conLai ELSE 0 END) AS chuaDatTuoiNo
        FROM PhanNhom WHERE conLai >= 1
        GROUP BY UserName
      )
      SELECT COUNT(*) AS soKhachConNo,
             SUM(tong) AS tongConNo,
             SUM(chuaToiHan) AS chuaToiHan,
             SUM(chuaDatTuoiNo) AS chuaDatTuoiNo,
             SUM(n0_30) AS n0_30, SUM(n31_60) AS n31_60, SUM(tren60) AS tren60
      FROM TheoKhach WHERE tong > 1000`);

    return {
      soKhachConNo: Number(r?.soKhachConNo ?? 0),
      tongConNo: Number(r?.tongConNo ?? 0),
      chuaToiHan: Number(r?.chuaToiHan ?? 0),
      chuaDatTuoiNo: Number(r?.chuaDatTuoiNo ?? 0),
      n0_30: Number(r?.n0_30 ?? 0),
      n31_60: Number(r?.n31_60 ?? 0),
      tren60: Number(r?.tren60 ?? 0),
    };
  }

  /**
   * Danh sách khách còn nợ.
   *
   * `sapTheo`:
   *   'gia'  (mặc định) — QUÁ HẠN lâu nhất lên đầu, đó là tiền khó đòi nhất
   *   'tien' — nợ to nhất lên đầu
   *
   * Sắp theo số ngày QUÁ HẠN chứ không theo tuổi thật: khách được nợ 60 ngày mà
   * mới nợ 50 ngày thì vẫn đang đúng hẹn, không có lý do gì đứng trên khách
   * không được nợ ngày nào mà đã trễ 40 ngày.
   */
  async danhSach(sapTheo: 'gia' | 'tien' = 'gia', gioiHan = 200): Promise<DongTuoiNo[]> {
    const thuTu = sapTheo === 'tien' ? 'tong DESC' : 'soNgayQuaHan DESC, tong DESC';
    const rows = await this.hoi<any>(`
      ${this.SQL_FIFO}
      , PhatSinh AS (
        SELECT UserName, MAX(NgayGhiNo) AS lanCuoi FROM CONGNO WHERE DaXoa = 0 GROUP BY UserName
      )
      SELECT TOP (:gioiHan)
             c.UserName AS khach,
             MAX(c.TuoiNo) AS tuoiNo,
             SUM(c.conLai) AS tong,
             SUM(CASE WHEN c.nhom = 0 THEN c.conLai ELSE 0 END) AS chuaToiHan,
             SUM(CASE WHEN c.nhom = 1 THEN c.conLai ELSE 0 END) AS n0_30,
             SUM(CASE WHEN c.nhom = 2 THEN c.conLai ELSE 0 END) AS n31_60,
             SUM(CASE WHEN c.nhom = 3 THEN c.conLai ELSE 0 END) AS tren60,
             MAX(c.tuoiThat) AS soNgayCuNhat,
             MAX(c.soNgay) AS soNgayQuaHan,
             MAX(p.lanCuoi) AS lanCuoi
      FROM PhanNhom c
      LEFT JOIN PhatSinh p ON p.UserName = c.UserName
      WHERE c.conLai >= 1
      GROUP BY c.UserName
      HAVING SUM(c.conLai) > 1000
      ORDER BY ${thuTu}`,
      { gioiHan },
    );

    return rows.map((r) => ({
      khach: String(r.khach ?? ''),
      tuoiNo: r.tuoiNo === null || r.tuoiNo === undefined ? null : Number(r.tuoiNo),
      tong: Number(r.tong ?? 0),
      chuaToiHan: Number(r.chuaToiHan ?? 0),
      n0_30: Number(r.n0_30 ?? 0),
      n31_60: Number(r.n31_60 ?? 0),
      tren60: Number(r.tren60 ?? 0),
      soNgayCuNhat: Number(r.soNgayCuNhat ?? 0),
      soNgayQuaHan: Number(r.soNgayQuaHan ?? 0),
      lanCuoi: r.lanCuoi ? new Date(r.lanCuoi).toISOString() : null,
    }));
  }

  /**
   * Đặt tuổi nợ cho một khách, NGAY TRÊN MÀN BÁO CÁO.
   *
   * Vì sao không bắt vào màn tài khoản mà sửa: người cần đặt là KẾ TOÁN, mà kế
   * toán không có miền `taiKhoan` — họ không mở được danh sách tài khoản khách
   * (đúng yêu cầu bên khách 10/10: "các bộ phận còn lại không được xem danh
   * sách tài khoản khách hàng"). Mở cả miền đó cho kế toán chỉ để sửa một ô là
   * nới rộng hơn hẳn mức cần, nên đặt thẳng ở màn họ đang làm việc.
   *
   * Đường này gắn quyền `duyetCongNo` — Admin, Kế toán, CSKH, Mua hàng có; Kho
   * và Kho SG thì KHÔNG: họ ghi được dòng công nợ nhưng tuổi nợ là thoả thuận
   * thương mại, không phải việc của kho.
   *
   * GHI NHẬT KÝ: đây là con số quyết định khách bị gọi đòi nợ lúc nào, phải
   * truy được ai đặt và đặt lúc nào.
   */
  async datTuoiNo(
    khach: string,
    tuoiNo: unknown,
    nguoiSua = 'system',
  ): Promise<{ khach: string; tuoiNo: number | null }> {
    const ten = String(khach ?? '').trim();
    if (!ten) throw new BadRequestException('Thiếu tên khách.');

    const giaTri = chuanHoaTuoiNo(tuoiNo);

    // Cập nhật rồi ĐẾM số dòng đã đụng bằng @@ROWCOUNT trong cùng một lượt,
    // thay vì SELECT trước rồi UPDATE sau: tên khách gõ sai thì phải báo "không
    // có mã này", chứ không lặng lẽ báo thành công trong khi chẳng ghi gì.
    const [kq] = await this.hoi<{ soDong: number }>(
      `SET NOCOUNT ON;
       UPDATE dbo.AspNetUsers SET TuoiNo = :tuoiNo WHERE UserName = :khach;
       SELECT @@ROWCOUNT AS soDong;`,
      { tuoiNo: giaTri, khach: ten },
    );

    if (!Number(kq?.soDong)) {
      throw new NotFoundException(`Không có mã khách "${ten}".`);
    }

    await this.systemLogsService
      .create({
        nguoiTao: nguoiSua,
        nguon: 'TuoiNo:DatTuoiNo',
        hanhDong: 'Chinh sua',
        doiTuong: ten,
        noiDung: `TuoiNo: ${giaTri === null ? '(bo trong)' : giaTri}`,
      })
      .catch((err) => console.error('[SystemLog]', err?.message ?? err));

    return { khach: ten, tuoiNo: giaTri };
  }

  /**
   * Đặt tuổi nợ cho NHIỀU khách một lượt — từ file Excel kế toán tải lên.
   *
   * Vì sao không dùng màn "Nhập Excel" của TÀI KHOẢN: phần nhập đó ghi vào
   * những cột KHÔNG TỒN TẠI (`ho_ten`, `vung_mien`, `dia_chi`… trong khi bảng
   * tên là `HoTen`, `VungMien`, `DiaChi`), nên mọi dòng đều rơi vào `catch` và
   * bị đếm là lỗi — tức là màn đó chưa bao giờ chạy được. Thêm một cột nữa vào
   * đó là thêm vào chỗ hỏng.
   *
   * MỘT DÒNG HỎNG KHÔNG CHẶN CẢ FILE: dòng nào sai thì báo riêng dòng đó, phần
   * còn lại vẫn ghi. Kế toán sửa vài dòng rồi nhập lại, chứ không phải dò lại
   * từ đầu.
   *
   * Lấy nguyên danh sách tài khoản về rồi tra trong bộ nhớ, không ghép `IN
   * (...)` theo số dòng: bảng chỉ có ~985 dòng, mà ghép thì 2000 dòng Excel là
   * 2000 tham số, chạm trần 2100 tham số của SQL Server.
   */
  async datTuoiNoHangLoat(
    dong: DongDatHangLoat[],
    nguoiSua = 'system',
  ): Promise<KetQuaDatHangLoat> {
    const ds = Array.isArray(dong) ? dong : [];
    if (!ds.length) throw new BadRequestException('Không có dòng nào để ghi.');
    if (ds.length > SO_DONG_TOI_DA) {
      throw new BadRequestException(`Mỗi lần chỉ nhập tối đa ${SO_DONG_TOI_DA} dòng.`);
    }

    const dangCo = await this.hoi<{ UserName: string; TuoiNo: number | null }>(
      `SELECT UserName, TuoiNo FROM dbo.AspNetUsers`,
    );
    const bang = new Map<string, number | null>();
    for (const u of dangCo) {
      bang.set(String(u.UserName).trim().toUpperCase(), u.TuoiNo === null ? null : Number(u.TuoiNo));
    }

    const loi: { dong: number; khach: string; lyDo: string }[] = [];
    const daGap = new Map<string, number>();
    const canGhi: { khach: string; tuoiNo: number | null }[] = [];
    let soKhongDoi = 0;

    ds.forEach((d, i) => {
      // Dòng 1 là tiêu đề, nên dòng dữ liệu thứ i nằm ở dòng Excel i + 2.
      const soDong = i + 2;
      const ten = String(d?.khach ?? '').trim();
      if (!ten) {
        loi.push({ dong: soDong, khach: '', lyDo: 'Thiếu mã khách' });
        return;
      }

      const khoa = ten.toUpperCase();
      const lanTruoc = daGap.get(khoa);
      if (lanTruoc) {
        loi.push({ dong: soDong, khach: ten, lyDo: `Trùng với dòng ${lanTruoc}` });
        return;
      }
      daGap.set(khoa, soDong);

      if (!bang.has(khoa)) {
        loi.push({ dong: soDong, khach: ten, lyDo: 'Không có mã khách này' });
        return;
      }

      let giaTri: number | null;
      try {
        giaTri = chuanHoaTuoiNo(d?.tuoiNo);
      } catch (e: any) {
        loi.push({ dong: soDong, khach: ten, lyDo: e?.message ?? 'Giá trị không hợp lệ' });
        return;
      }

      if (bang.get(khoa) === giaTri) {
        soKhongDoi++;
        return;
      }
      canGhi.push({ khach: ten, tuoiNo: giaTri });
    });

    for (const g of canGhi) {
      await this.sequelize.query(
        `UPDATE dbo.AspNetUsers SET TuoiNo = :tuoiNo WHERE UserName = :khach`,
        { replacements: { tuoiNo: g.tuoiNo, khach: g.khach } },
      );
    }

    if (canGhi.length) {
      await this.systemLogsService
        .create({
          nguoiTao: nguoiSua,
          nguon: 'TuoiNo:DatHangLoat',
          hanhDong: 'Chinh sua',
          doiTuong: '',
          // Ghi trọn danh sách: cột NoiDung là nvarchar(max), và sau này cần
          // truy "ai đặt khách X thành 45 ngày" thì phải có ở đây.
          noiDung:
            `${canGhi.length} ma khach; ` +
            canGhi.map((g) => `${g.khach}=${g.tuoiNo === null ? '(bo trong)' : g.tuoiNo}`).join(', '),
        })
        .catch((err) => console.error('[SystemLog]', err?.message ?? err));
    }

    return { soDaGhi: canGhi.length, soKhongDoi, loi };
  }

  /** Chi tiết các khoản còn nợ của MỘT khách — bấm từ danh sách vào. */
  async chiTiet(khach: string): Promise<DongChiTietTuoiNo[]> {
    if (!khach || !khach.trim()) return [];
    const rows = await this.hoi<any>(`
      WITH ChuyenDong AS (
        SELECT c.CongNo_ID, c.UserName, c.NgayGhiNo, c.NoiDung,
               ISNULL(c.DR,0) - ISNULL(c.CR,0) AS bien
        FROM CONGNO c WHERE c.DaXoa = 0 AND c.UserName = :khach
      ),
      TongGiam AS (
        SELECT SUM(CASE WHEN bien < 0 THEN -bien ELSE 0 END) AS tongGiam FROM ChuyenDong
      ),
      No AS (
        SELECT d.NgayGhiNo, d.NoiDung, d.bien AS DR,
               SUM(d.bien) OVER (ORDER BY d.NgayGhiNo, d.CongNo_ID ROWS UNBOUNDED PRECEDING) AS luyKeNo
        FROM ChuyenDong d WHERE d.bien > 0
      ),
      Han AS (
        SELECT MAX(TuoiNo) AS TuoiNo FROM dbo.AspNetUsers
        WHERE UserName = :khach AND TuoiNo IS NOT NULL AND TuoiNo >= 0
      )
      SELECT n.NgayGhiNo AS ngay, n.NoiDung AS noiDung,
             CASE
               WHEN n.luyKeNo - ISNULL(g.tongGiam,0) <= 0 THEN 0
               WHEN n.luyKeNo - ISNULL(g.tongGiam,0) >= n.DR THEN n.DR
               ELSE n.luyKeNo - ISNULL(g.tongGiam,0)
             END AS conLai,
             DATEDIFF(day, n.NgayGhiNo, GETDATE()) AS soNgay,
             DATEDIFF(day, n.NgayGhiNo, GETDATE()) - ISNULL(h.TuoiNo, 0) AS soNgayQuaHan,
             CASE WHEN h.TuoiNo IS NULL THEN NULL
                  ELSE DATEADD(day, h.TuoiNo, n.NgayGhiNo) END AS hanTra
      FROM No n CROSS JOIN TongGiam g CROSS JOIN Han h
      ORDER BY n.NgayGhiNo`,
      { khach: khach.trim() },
    );
    return rows
      .filter((r) => Number(r.conLai) >= 1)
      .map((r) => ({
        ngay: r.ngay ? new Date(r.ngay).toISOString().slice(0, 10) : '',
        noiDung: String(r.noiDung ?? ''),
        conLai: Number(r.conLai ?? 0),
        soNgay: Number(r.soNgay ?? 0),
        soNgayQuaHan: Number(r.soNgayQuaHan ?? 0),
        hanTra: r.hanTra ? new Date(r.hanTra).toISOString().slice(0, 10) : null,
      }));
  }
}
