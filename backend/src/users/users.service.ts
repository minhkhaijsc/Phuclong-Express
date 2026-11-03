import { BadRequestException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { User, UserModel } from './entities/user.entity';
import { chuanHoaTuoiNo } from './tuoi-no-khach';
import { SystemLogsService } from '../system-logs/system-logs.service';
import Excel from 'exceljs';
import bcrypt from 'bcrypt';
import * as crypto from 'crypto';

/**
 * Users Service
 *
 * Handles user CRUD operations using Sequelize.
 */
/** Giá trị lọc đặc biệt: những mã chưa gán CSKH nào. */
export const CHUA_GAN = '(chua-gan)';

/** Trần số dòng một lần gán hàng loạt. Nhiều hơn thì chia file. */
export const SO_DONG_GAN_TOI_DA = 2000;

// Cùng một ô nhưng có hai đường ghi (màn tài khoản và màn báo cáo Tuổi nợ),
// nên phần chuẩn hoá để riêng `tuoi-no-khach.ts`. Vẫn xuất lại ở đây cho
// những chỗ đang nhập từ `users.service`.
export { TUOI_NO_TOI_DA, chuanHoaTuoiNo } from './tuoi-no-khach';

@Injectable()
export class UsersService {
  private userModel: typeof User;

  constructor(
    @Inject('SEQUELIZE') private sequelize: Sequelize,
    private readonly systemLogsService: SystemLogsService,
  ) {
    if (!sequelize.models.User) {
      UserModel(sequelize);
    }
    this.userModel = sequelize.models.User as typeof User;
  }

  /**
   * Danh sách tài khoản, lọc theo từ khoá và theo CSKH phụ trách.
   *
   * Hai mệnh đề lọc đều BIND tham số. Bản trước nối thẳng `keyword` vào chuỗi
   * SQL — gõ một dấu nháy đơn vào ô tìm kiếm là câu lệnh vỡ, và gõ khéo hơn thì
   * đọc được cả bảng khác. Dạng `(:x IS NULL OR ...)` phục vụ mọi tổ hợp lọc
   * bằng một câu lệnh, không còn chỗ nào ghép chuỗi.
   *
   * `cskh = '(chua-gan)'` là lối riêng để lọc ra những mã CHƯA ai nhận — đó mới
   * là danh sách việc cần làm của CSKH, chứ không phải danh sách khách của họ.
   */
  async findAll(keyword?: string, cskh?: string): Promise<User[]> {
    const tuKhoa = keyword?.trim() ? `%${keyword.trim()}%` : null;
    const loc = cskh?.trim() || null;

    const [data] = await this.sequelize.query(
      `SELECT Id, UserName, Email, PhoneNumber,
              HoTen, DiaChi, TinhThanh, SoTaiKhoan,
              HinhThucNhanHang, KhachBuon, LinkTaiKhoanMang, VungMien,
              CSKHPhuTrach, TuoiNo
         FROM dbo.AspNetUsers
        WHERE (:tuKhoa IS NULL OR UserName LIKE :tuKhoa)
          AND (:loc IS NULL
               OR (:loc = '${CHUA_GAN}' AND CSKHPhuTrach IS NULL)
               OR CSKHPhuTrach = :loc)
        ORDER BY UserName`,
      { replacements: { tuKhoa, loc } },
    );
    return data as User[];
  }

  /**
   * Danh sách CSKH để đổ vào ô chọn "CSKH phụ trách".
   *
   * Chỉ lấy người ĐANG LÀM: tài khoản đã đóng mã thì không nên hiện ra để gán
   * thêm khách mới. Mã khách cũ vẫn giữ nguyên tên người đã nghỉ — màn hình
   * hiện nguyên tên đăng nhập chứ không xoá, vì xoá là mất dấu ai từng phụ trách.
   */
  async danhSachCskh(): Promise<{ username: string; hoTen: string }[]> {
    const [data] = await this.sequelize.query(
      `SELECT u.UserName AS username, ISNULL(u.HoTen, u.UserName) AS hoTen
         FROM dbo.AspNetUsers u
         JOIN dbo.AspNetUserRoles ur ON ur.UserId = u.Id
         JOIN dbo.AspNetRoles r ON r.Id = ur.RoleId
        WHERE r.Name = 'CSKH'
          AND ISNULL(u.TrangThai, '') <> 'dong-ma'
        ORDER BY u.UserName`,
    );
    return data as { username: string; hoTen: string }[];
  }

  /**
   * Gán CSKH phụ trách cho NHIỀU khách một lượt — từ file Excel hai cột (mã
   * khách, CSKH phụ trách).
   *
   * Yêu cầu bên khách 23/10/2026: "gán danh sách khách theo mỗi nv sales phụ
   * trách chính". Lúc làm, 943/943 mã khách đều chưa gán — bấm từng người trên
   * màn chi tiết là cả buổi, nên có đường này.
   *
   * Theo đúng mẫu `datTuoiNoHangLoat`: MỘT DÒNG HỎNG KHÔNG CHẶN CẢ FILE. Dòng
   * nào sai thì báo riêng dòng đó (kèm số dòng Excel), phần còn lại vẫn ghi.
   *
   * Chỉ nhận:
   *   • mã khách có thật và là KHÁCH (không vai trò) — gán CSKH cho tài khoản
   *     nhân viên là vô nghĩa, và lẫn vào thì làm rối luật che liên hệ
   *   • CSKH đang làm (cùng danh sách ô chọn trên màn chi tiết). Ô để trống =
   *     bỏ gán, trả khách về "chưa gán".
   */
  async ganCskhHangLoat(
    dong: { khach?: unknown; cskh?: unknown }[],
    nguoiSua = 'system',
  ): Promise<{
    soDaGhi: number;
    soKhongDoi: number;
    loi: { dong: number; khach: string; lyDo: string }[];
  }> {
    const ds = Array.isArray(dong) ? dong : [];
    if (!ds.length) throw new BadRequestException('Không có dòng nào để ghi.');
    if (ds.length > SO_DONG_GAN_TOI_DA) {
      throw new BadRequestException(`Mỗi lần chỉ nhập tối đa ${SO_DONG_GAN_TOI_DA} dòng.`);
    }

    const [khachRows] = await this.sequelize.query(
      `SELECT u.UserName, u.CSKHPhuTrach,
              CASE WHEN EXISTS (SELECT 1 FROM dbo.AspNetUserRoles r WHERE r.UserId = u.Id)
                   THEN 1 ELSE 0 END AS laNhanVien
         FROM dbo.AspNetUsers u`,
    );
    const bang = new Map<string, { ten: string; phuTrach: string | null; laNhanVien: boolean }>();
    for (const r of khachRows as any[]) {
      const ten = String(r.UserName ?? '').trim();
      bang.set(ten.toUpperCase(), {
        ten,
        phuTrach: String(r.CSKHPhuTrach ?? '').trim() || null,
        laNhanVien: Number(r.laNhanVien) === 1,
      });
    }
    const cskh = new Map<string, string>();
    for (const c of await this.danhSachCskh()) {
      const ten = String(c.username ?? '').trim();
      cskh.set(ten.toUpperCase(), ten);
    }

    const loi: { dong: number; khach: string; lyDo: string }[] = [];
    const daGap = new Map<string, number>();
    const canGhi: { khach: string; cskh: string | null }[] = [];
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

      const k = bang.get(khoa);
      if (!k) {
        loi.push({ dong: soDong, khach: ten, lyDo: 'Không có mã khách này' });
        return;
      }
      const goCskh = String(d?.cskh ?? '').trim();
      if (k.laNhanVien) {
        // File mẫu đổ nguyên danh sách User, có cả nhân viên. Dòng nhân viên để
        // trống thì bỏ qua lặng lẽ; chỉ báo lỗi khi ai đó cố gán CSKH cho nó.
        if (goCskh) {
          loi.push({ dong: soDong, khach: ten, lyDo: 'Đây là tài khoản nhân viên, không phải khách' });
        } else {
          soKhongDoi++;
        }
        return;
      }

      let moi: string | null = null;
      if (goCskh) {
        const that = cskh.get(goCskh.toUpperCase());
        if (!that) {
          loi.push({
            dong: soDong,
            khach: ten,
            lyDo: `"${goCskh}" không phải CSKH đang làm (gõ đúng tên đăng nhập, vd CSKHMAILINH)`,
          });
          return;
        }
        moi = that;
      }

      if ((k.phuTrach ?? '').toUpperCase() === (moi ?? '').toUpperCase()) {
        soKhongDoi++;
        return;
      }
      canGhi.push({ khach: k.ten, cskh: moi });
    });

    for (const g of canGhi) {
      await this.sequelize.query(
        `UPDATE dbo.AspNetUsers SET CSKHPhuTrach = :cskh WHERE UserName = :khach`,
        { replacements: { cskh: g.cskh, khach: g.khach } },
      );
    }

    if (canGhi.length) {
      await this.systemLogsService
        .create({
          nguoiTao: nguoiSua,
          nguon: 'CSKHPhuTrach:GanHangLoat',
          hanhDong: 'Chinh sua',
          doiTuong: '',
          // Ghi trọn danh sách: sau này cần truy "ai chuyển khách X sang sales Y".
          noiDung:
            `${canGhi.length} ma khach; ` +
            canGhi.map((g) => `${g.khach}=${g.cskh ?? '(bo gan)'}`).join(', '),
        })
        .catch((err) => console.error('[SystemLog]', err?.message ?? err));
    }

    return { soDaGhi: canGhi.length, soKhongDoi, loi };
  }

  /**
   * Find user by ID
   */
  async findOne(id: number): Promise<User> {
    const user = await this.userModel.findByPk(id);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  /**
   * Find user by string ID
   */
  async findByStringId(id: string): Promise<User> {
    const user = await this.userModel.findByPk(id);

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.userModel.findOne({ where: { username } });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ where: { email } });
  }

  /**
   * Create new user
   */
  async create(userData: Partial<User>, nguoiTao = 'system'): Promise<User> {
    const user = await this.userModel.create(userData as any);
    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'CreateNewUser',
      hanhDong: 'Them moi',
      doiTuong: '',
      noiDung: `UserName: ${userData.UserName || ''}; HoTen: ${userData.HoTen || ''}; DiaChi: ${userData.DiaChi || ''}; TinhThanh: ${userData.TinhThanh || ''}; PhoneNumber: ${userData.PhoneNumber || ''}; Email: ${userData.Email || ''}; SoTaiKhoan: ${userData.SoTaiKhoan || ''}; HinhThucNhanHang: ${userData.HinhThucNhanHang || ''}; KhachBuon: ${userData.KhachBuon || false}; LinkTaiKhoanMang: ${userData.LinkTaiKhoanMang || ''}; VungMien: ${userData.VungMien || ''}`,
    });
    return user;
  }

  /**
   * Update user
   */
  async update(id: string, userData: Partial<User>, nguoiTao = 'system'): Promise<User> {
    const user = await this.findByStringId(id);
    // Chỉ đụng tới khi màn hình CÓ gửi ô này lên: không có khoá thì nghĩa là
    // người dùng đang sửa thứ khác, ghi đè null vào đây là xoá mất thoả thuận.
    const duLieu =
      'TuoiNo' in userData
        ? { ...userData, TuoiNo: chuanHoaTuoiNo((userData as { TuoiNo?: unknown }).TuoiNo) }
        : userData;
    const updated = await user.update(duLieu);
    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'UpdateUser',
      hanhDong: 'Chinh sua',
      doiTuong: id,
      noiDung: `UserName: ${user.UserName}; Fields: ${Object.keys(userData).join(', ')}`,
    }).catch((err) => console.error('[SystemLog]', err?.message ?? err));
    return updated;
  }

  /**
   * Delete user
   */
  async remove(id: string, nguoiTao = 'system'): Promise<void> {
    const user = await this.findByStringId(id);
    await user.destroy();
    await this.systemLogsService.create({
      nguoiTao,
      nguon: 'DeleteUser',
      hanhDong: 'Xoa',
      doiTuong: id,
      noiDung: `UserName: ${user.UserName}`,
    }).catch((err) => console.error('[SystemLog]', err?.message ?? err));
  }

  /**
   * Clear all data for a specific user (ClearDuLieuUser)
   */
  async clearUserData(username: string, nguoiTao?: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.sequelize.query(
        `EXEC SP_ClearDuLieuTheoUser @UserName = :username`,
        { replacements: { username } }
      );

      await this.systemLogsService.create({
        nguoiTao: nguoiTao || 'system',
        nguon: 'ClearDuLieuUser:ClearDuLieuTheoUser',
        hanhDong: 'Xoa',
        doiTuong: '',
        noiDung: `UserName: ${username}`,
      });

      return { success: true, message: 'Đã clear dữ liệu thành công' };
    } catch (error) {
      console.error('Error clearing user data:', error.message);
      return { success: false, message: 'Có lỗi trong quá trình thao tác' };
    }
  }

  /**
   * Get sheets from Excel file
   */
  async getExcelSheets(file: Express.Multer.File): Promise<{ sheets: string[] }> {
    try {
      const workbook = new Excel.Workbook();
      await workbook.xlsx.load(file.buffer as any);
      const sheets = workbook.worksheets.map(ws => ws.name);
      return { sheets };
    } catch (error) {
      console.error('Error reading Excel sheets:', error.message);
      return { sheets: [] };
    }
  }

  // ---------------- NHẬP USER BẰNG EXCEL ----------------
  //
  // Viết lại 03/11/2026. Bản trước ghi vào các cột `ho_ten`, `dia_chi`… KHÔNG
  // CÓ trong AspNetUsers (cột thật là HoTen, DiaChi…), nên dòng nào cũng lỗi rồi
  // bị đếm lặng lẽ — trên hệ mới chưa từng nhập được user nào bằng Excel. Kèm
  // theo: ghép chuỗi thẳng vào SQL (tên có dấu nháy là vỡ câu lệnh), và đọc
  // `editableColumns` (chuỗi JSON từ form) bằng `.includes(số)` trên CHUỖI.
  //
  // Cột 13 = CSKH phụ trách, BẮT BUỘC khi thêm mới — cùng luật với màn tạo
  // user (03/11/2026: "bắt buộc CSKH gán tên vào user thì mới tạo được").

  /** Cột sửa được ở chế độ 'edit', theo đúng thứ tự ô tick trên web. */
  private static readonly COT_SUA: { cot: string; truong: string }[] = [
    { cot: 'HoTen', truong: 'hoTen' },
    { cot: 'VungMien', truong: 'vungMien' },
    { cot: 'DiaChi', truong: 'diaChi' },
    { cot: 'TinhThanh', truong: 'tinhThanh' },
    { cot: 'PhoneNumber', truong: 'phoneNumber' },
    { cot: 'Email', truong: 'email' },
    { cot: 'SoTaiKhoan', truong: 'soTaiKhoan' },
    { cot: 'HinhThucNhanHang', truong: 'hinhThucNhanHang' },
    { cot: 'KhachBuon', truong: 'khachBuon' },
    { cot: 'LinkTaiKhoanMang', truong: 'linkTaiKhoanMang' },
    { cot: 'CSKHPhuTrach', truong: 'cskhPhuTrach' },
  ];
  private static readonly SUA_CSKH = 10;

  /** `editableColumns` tới từ form dạng chuỗi JSON "[0,5]" — đổi về mảng số. */
  docCotSua(v: unknown): number[] {
    let a: unknown = v;
    if (typeof v === 'string') {
      try {
        a = JSON.parse(v);
      } catch {
        a = [];
      }
    }
    return Array.isArray(a) ? a.map(Number).filter((n) => Number.isInteger(n)) : [];
  }

  private async docDongImport(file: Express.Multer.File, sheetName: string): Promise<any[] | null> {
    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(file.buffer as any);
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) return null;
    const o = (row: Excel.Row, i: number) => {
      const v: any = row.getCell(i).value;
      const t = v && typeof v === 'object' ? (v.text ?? v.result ?? '') : (v ?? '');
      return String(t).trim();
    };
    const dong: any[] = [];
    ws.eachRow((row, n) => {
      if (n < 2 || !o(row, 1)) return;
      dong.push({
        excelRowIndex: n,
        username: o(row, 1),
        password: o(row, 2),
        hoTen: o(row, 3),
        vungMien: o(row, 4),
        diaChi: o(row, 5),
        tinhThanh: o(row, 6),
        phoneNumber: o(row, 7),
        email: o(row, 8),
        soTaiKhoan: o(row, 9),
        hinhThucNhanHang: o(row, 10),
        khachBuon: o(row, 11),
        linkTaiKhoanMang: o(row, 12),
        cskhPhuTrach: o(row, 13),
        error: false,
      });
    });
    return dong;
  }

  /** Kiểm từng dòng, đánh dấu `error` và trả danh sách lỗi (HTML như bản cũ). */
  async kiemTraImport(dong: any[], mode: string, cotSua: number[]): Promise<string[]> {
    const errors: string[] = [];
    const [users]: any[] = await this.sequelize.query(`SELECT UserName, Email FROM dbo.AspNetUsers`);
    const daCo = new Set(users.map((u: any) => String(u.UserName).toLowerCase()));
    const emailCua = new Map<string, string>();
    for (const u of users) if (u.Email) emailCua.set(String(u.Email).toLowerCase(), u.UserName);
    const cskh = new Set((await this.danhSachCskh()).map((c) => c.username.toLowerCase()));
    const trongFile = new Set<string>();
    const emailTrongFile = new Set<string>();
    const loi = (d: any, msg: string) => {
      errors.push(`Dòng <b>${d.excelRowIndex}</b>: ${msg}`);
      d.error = true;
    };

    for (const d of dong) {
      const ten = d.username.toLowerCase();
      if (mode === 'edit') {
        if (!daCo.has(ten)) loi(d, `User <b>${d.username}</b> không có trong danh mục`);
        if (cotSua.includes(UsersService.SUA_CSKH) && !cskh.has(d.cskhPhuTrach.toLowerCase())) {
          loi(d, d.cskhPhuTrach ? `<b>${d.cskhPhuTrach}</b> không phải CSKH đang làm` : 'thiếu <b>CSKH phụ trách</b>');
        }
        continue;
      }
      if (daCo.has(ten)) loi(d, `User <b>${d.username}</b> đã có trong danh mục`);
      if (trongFile.has(ten)) loi(d, `User <b>${d.username}</b> bị lặp trong file`);
      trongFile.add(ten);
      if (!d.password) loi(d, 'thiếu <b>Password</b>');
      if (!d.hoTen) loi(d, 'thiếu <b>HoTen</b>');
      if (!d.cskhPhuTrach) loi(d, 'thiếu <b>CSKH phụ trách</b> (cột 13)');
      else if (!cskh.has(d.cskhPhuTrach.toLowerCase())) loi(d, `<b>${d.cskhPhuTrach}</b> không phải CSKH đang làm`);
      if (d.email) {
        const e = d.email.toLowerCase();
        if (emailCua.has(e)) loi(d, `Email <b>${d.email}</b> đã dùng cho tài khoản ${emailCua.get(e)}`);
        if (emailTrongFile.has(e)) loi(d, `Email <b>${d.email}</b> bị lặp trong file`);
        emailTrongFile.add(e);
      }
    }
    return errors;
  }

  async validateImportData(
    file: Express.Multer.File,
    sheetName: string,
    mode: string,
    editableColumns: unknown,
  ): Promise<{ data: any[]; errors: string[]; successCount: number; errorCount: number }> {
    try {
      const dong = await this.docDongImport(file, sheetName);
      if (!dong) return { data: [], errors: ['Sheet not found'], successCount: 0, errorCount: 0 };
      const errors = await this.kiemTraImport(dong, mode, this.docCotSua(editableColumns));
      const errorCount = dong.filter((d) => d.error).length;
      return { data: dong, errors, successCount: dong.length - errorCount, errorCount };
    } catch (error) {
      console.error('Error validating import data:', error.message);
      return { data: [], errors: ['Có lỗi trong quá trình đọc file Excel'], successCount: 0, errorCount: 0 };
    }
  }

  /**
   * Ghi. KIỂM LẠI từ đầu chứ không tin bước xem trước (giữa hai bước có thể đã
   * có người tạo trùng mã), và BỎ QUA dòng lỗi thay vì cố ghi.
   */
  async executeImport(
    file: Express.Multer.File,
    sheetName: string,
    mode: string,
    editableColumns: unknown,
    nguoiLam = 'system',
  ): Promise<{ successCount: number; errorCount: number }> {
    let successCount = 0;
    let errorCount = 0;
    try {
      const dong = await this.docDongImport(file, sheetName);
      if (!dong) return { successCount: 0, errorCount: 0 };
      const cotSua = this.docCotSua(editableColumns);
      await this.kiemTraImport(dong, mode, cotSua);

      for (const d of dong) {
        if (d.error) {
          errorCount++;
          continue;
        }
        const khachBuon = ['true', '1', 'x', 'có', 'co'].includes(String(d.khachBuon).toLowerCase());
        try {
          if (mode === 'edit') {
            const sua = UsersService.COT_SUA.filter((_, i) => cotSua.includes(i));
            if (!sua.length) {
              successCount++;
              continue;
            }
            const thay: Record<string, unknown> = { u: d.username };
            const set = sua.map(({ cot, truong }) => {
              thay[truong] = truong === 'khachBuon' ? (khachBuon ? 1 : 0) : d[truong] || null;
              return `${cot} = :${truong}`;
            });
            await this.sequelize.query(`UPDATE dbo.AspNetUsers SET ${set.join(', ')} WHERE UserName = :u`, {
              replacements: thay,
            });
            await this.systemLogsService
              .create({
                nguoiTao: nguoiLam,
                nguon: 'ListUser_Import:EditUser',
                hanhDong: 'Sua',
                doiTuong: d.username,
                noiDung: `UserName: ${d.username}; Cot: ${sua.map((x) => x.cot).join(',')}`,
              })
              .catch(() => undefined);
          } else {
            const passwordHash = await bcrypt.hash(d.password, 10);
            await this.sequelize.query(
              `INSERT INTO dbo.AspNetUsers
                 (Id, UserName, Email, EmailConfirmed, PasswordHash, PhoneNumber, PhoneNumberConfirmed,
                  TwoFactorEnabled, LockoutEnabled, AccessFailedCount,
                  HoTen, DiaChi, TinhThanh, SoTaiKhoan, HinhThucNhanHang, KhachBuon,
                  LinkTaiKhoanMang, VungMien, CSKHPhuTrach, NgayTao)
               VALUES
                 (:id, :username, :email, 0, :hash, :phone, 0,
                  0, 0, 0,
                  :hoTen, :diaChi, :tinhThanh, :soTaiKhoan, :hinhThuc, :khachBuon,
                  :link, :vungMien, :cskh, GETDATE())`,
              {
                replacements: {
                  id: crypto.randomUUID(),
                  username: d.username,
                  // Như màn tạo user: để trống email thì đặt email giữ chỗ theo mã.
                  email: d.email || `${d.username}@example.com`,
                  hash: passwordHash,
                  phone: d.phoneNumber || null,
                  hoTen: d.hoTen,
                  diaChi: d.diaChi || null,
                  tinhThanh: d.tinhThanh || null,
                  soTaiKhoan: d.soTaiKhoan || null,
                  hinhThuc: d.hinhThucNhanHang || null,
                  khachBuon: khachBuon ? 1 : 0,
                  link: d.linkTaiKhoanMang || null,
                  vungMien: d.vungMien || null,
                  cskh: d.cskhPhuTrach,
                },
              },
            );
            await this.systemLogsService
              .create({
                nguoiTao: nguoiLam,
                nguon: 'ListUser_Import:CreateUser',
                hanhDong: 'Them moi',
                doiTuong: d.username,
                noiDung: `UserName: ${d.username}; HoTen: ${d.hoTen}; CSKH: ${d.cskhPhuTrach}`,
              })
              .catch(() => undefined);
          }
          successCount++;
        } catch (err: any) {
          console.error(`Error importing user ${d.username}:`, err?.message ?? err);
          errorCount++;
        }
      }
      return { successCount, errorCount };
    } catch (error) {
      console.error('Error executing import:', error.message);
      return { successCount, errorCount };
    }
  }

  /**
   * Get roles for a user
   */
  async getUserRoles(userId: string): Promise<{ name: string }[]> {
    try {
      const [roles]: any[] = await this.sequelize.query(`
        SELECT r.Name
        FROM dbo.AspNetUserRoles ur
        JOIN dbo.AspNetRoles r ON ur.RoleId = r.Id
        WHERE ur.UserId = '${userId}'
      `);
      return roles || [];
    } catch (error) {
      console.error('Error getting user roles:', error.message);
      return [];
    }
  }

  /**
   * Add role to user
   */
  async addRoleToUser(userId: string, roleName: string, nguoiTao = 'system'): Promise<{ success: boolean; message: string }> {
    try {
      // Get role ID
      const [roles]: any[] = await this.sequelize.query(`
        SELECT Id FROM dbo.AspNetRoles WHERE Name = '${roleName}'
      `);

      if (!roles || roles.length === 0) {
        return { success: false, message: 'Role not found' };
      }

      const roleId = roles[0].Id;

      // Check if user already has this role
      const [existing]: any[] = await this.sequelize.query(`
        SELECT * FROM dbo.AspNetUserRoles WHERE UserId = '${userId}' AND RoleId = '${roleId}'
      `);

      if (existing && existing.length > 0) {
        return { success: false, message: 'User already has this role' };
      }

      // Add role
      await this.sequelize.query(`
        INSERT INTO dbo.AspNetUserRoles (UserId, RoleId) VALUES ('${userId}', '${roleId}')
      `);

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'AddRoleToUser',
        hanhDong: 'Chinh sua',
        doiTuong: userId,
        noiDung: `UserId: ${userId}; RoleName: ${roleName}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return { success: true, message: 'Role added successfully' };
    } catch (error) {
      console.error('Error adding role to user:', error.message);
      return { success: false, message: 'Có lỗi trong quá trình thao tác' };
    }
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(userId: string, roleName: string, nguoiTao = 'system'): Promise<{ success: boolean; message: string }> {
    try {
      // Get role ID
      const [roles]: any[] = await this.sequelize.query(`
        SELECT Id FROM dbo.AspNetRoles WHERE Name = '${roleName}'
      `);

      if (!roles || roles.length === 0) {
        return { success: false, message: 'Role not found' };
      }

      const roleId = roles[0].Id;

      // Remove role
      await this.sequelize.query(`
        DELETE FROM dbo.AspNetUserRoles WHERE UserId = '${userId}' AND RoleId = '${roleId}'
      `);

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'RemoveRoleFromUser',
        hanhDong: 'Xoa',
        doiTuong: userId,
        noiDung: `UserId: ${userId}; RoleName: ${roleName}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return { success: true, message: 'Role removed successfully' };
    } catch (error) {
      console.error('Error removing role from user:', error.message);
      return { success: false, message: 'Có lỗi trong quá trình thao tác' };
    }
  }

  /**
   * Reset user password
   */
  async resetPassword(userId: string, newPassword: string, nguoiTao = 'system'): Promise<{ success: boolean; message: string }> {
    try {
      const passwordHash = await bcrypt.hash(newPassword, 10);

      await this.sequelize.query(`
        UPDATE dbo.AspNetUsers SET PasswordHash = '${passwordHash}' WHERE Id = '${userId}'
      `);

      await this.systemLogsService.create({
        nguoiTao,
        nguon: 'ResetPassword',
        hanhDong: 'Chinh sua',
        doiTuong: userId,
        noiDung: `UserId: ${userId}`,
      }).catch((err) => console.error('[SystemLog]', err?.message ?? err));

      return { success: true, message: 'Reset mật khẩu thành công' };
    } catch (error) {
      console.error('Error resetting password:', error.message);
      return { success: false, message: 'Có lỗi trong quá trình thao tác' };
    }
  }
}
