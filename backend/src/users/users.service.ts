import { BadRequestException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { User, UserModel } from './entities/user.entity';
import { chuanHoaTuoiNo } from './tuoi-no-khach';
import { SystemLogsService } from '../system-logs/system-logs.service';
import Excel from 'exceljs';
import bcrypt from 'bcrypt';

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

  /**
   * Validate import data from Excel
   */
  async validateImportData(
    file: Express.Multer.File,
    sheetName: string,
    mode: string,
    editableColumns: number[],
  ): Promise<{ data: any[]; errors: string[]; successCount: number; errorCount: number }> {
    const errors: string[] = [];
    const userData: any[] = [];

    try {
      const workbook = new Excel.Workbook();
      await workbook.xlsx.load(file.buffer as any);
      const worksheet = workbook.getWorksheet(sheetName);

      if (!worksheet) {
        errors.push('Sheet not found');
        return { data: [], errors, successCount: 0, errorCount: 0 };
      }

      // Get existing usernames
      const [existingUsers]: any[] = await this.sequelize.query(`
        SELECT UserName FROM dbo.AspNetUsers
      `);
      const existingUsernames = new Set(existingUsers.map((u: any) => u.UserName));

      const headerRow = worksheet.getRow(1);
      const startRow = 2;

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber < startRow) return;
        if (!row.getCell(1).value) return;

        const rowData: any = {
          excelRowIndex: rowNumber,
          username: String(row.getCell(1).value || ''),
          password: String(row.getCell(2).value || ''),
          hoTen: String(row.getCell(3).value || ''),
          vungMien: String(row.getCell(4).value || ''),
          diaChi: String(row.getCell(5).value || ''),
          tinhThanh: String(row.getCell(6).value || ''),
          phoneNumber: String(row.getCell(7).value || ''),
          email: String(row.getCell(8).value || ''),
          soTaiKhoan: String(row.getCell(9).value || ''),
          hinhThucNhanHang: String(row.getCell(10).value || ''),
          khachBuon: String(row.getCell(11).value || ''),
          linkTaiKhoanMang: String(row.getCell(12).value || ''),
          error: false,
        };

        // Validate username
        if (!rowData.username) {
          errors.push(`Dòng <b>${rowNumber}</b>: thiếu <b>UserName</b>`);
          rowData.error = true;
        } else if (mode === 'edit') {
          if (!existingUsernames.has(rowData.username)) {
            errors.push(`Dòng <b>${rowNumber}</b>: User <b>${rowData.username}</b> không có trong danh mục`);
            rowData.error = true;
          }
        } else {
          if (existingUsernames.has(rowData.username)) {
            errors.push(`Dòng <b>${rowNumber}</b>: User <b>${rowData.username}</b> đã có trong danh mục`);
            rowData.error = true;
          }
        }

        // Validate password for create mode
        if (mode !== 'edit' && !rowData.password) {
          errors.push(`Dòng <b>${rowNumber}</b>: thiếu <b>Password</b>`);
          rowData.error = true;
        }

        // Validate hoTen for create mode
        if (mode !== 'edit' && !rowData.hoTen) {
          errors.push(`Dòng <b>${rowNumber}</b>: thiếu <b>HoTen</b>`);
          rowData.error = true;
        }

        userData.push(rowData);
      });

      const errorCount = userData.filter(d => d.error).length;
      return {
        data: userData,
        errors,
        successCount: userData.length - errorCount,
        errorCount,
      };
    } catch (error) {
      console.error('Error validating import data:', error.message);
      errors.push('Có lỗi trong quá trình đọc file Excel');
      return { data: [], errors, successCount: 0, errorCount: 0 };
    }
  }

  /**
   * Execute import from Excel
   */
  async executeImport(
    file: Express.Multer.File,
    sheetName: string,
    mode: string,
    editableColumns: number[],
  ): Promise<{ successCount: number; errorCount: number }> {
    let successCount = 0;
    let errorCount = 0;

    try {
      const workbook = new Excel.Workbook();
      await workbook.xlsx.load(file.buffer as any);
      const worksheet = workbook.getWorksheet(sheetName);

      if (!worksheet) {
        return { successCount: 0, errorCount: 0 };
      }

      // Get existing usernames
      const [existingUsers]: any[] = await this.sequelize.query(`
        SELECT Id, UserName FROM dbo.AspNetUsers
      `);
      const userMap = new Map(existingUsers.map((u: any) => [u.UserName, u.Id]));

      const columnFields = ['hoTen', 'vungMien', 'diaChi', 'tinhThanh', 'phoneNumber', 'email', 'soTaiKhoan', 'hinhThucNhanHang', 'khachBuon', 'linkTaiKhoanMang'];

      // Collect rows first
      const rows: any[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber < 2) return;
        if (!row.getCell(1).value) return;

        rows.push({
          rowNumber,
          username: String(row.getCell(1).value || ''),
          password: String(row.getCell(2).value || ''),
          hoTen: String(row.getCell(3).value || ''),
          vungMien: String(row.getCell(4).value || ''),
          diaChi: String(row.getCell(5).value || ''),
          tinhThanh: String(row.getCell(6).value || ''),
          phoneNumber: String(row.getCell(7).value || ''),
          email: String(row.getCell(8).value || ''),
          soTaiKhoan: String(row.getCell(9).value || ''),
          hinhThucNhanHang: String(row.getCell(10).value || ''),
          khachBuon: String(row.getCell(11).value || '').toLowerCase() === 'true',
          linkTaiKhoanMang: String(row.getCell(12).value || ''),
        });
      });

      // Process rows outside callback
      for (const rowData of rows) {
        const { username, password, hoTen, vungMien, diaChi, tinhThanh, phoneNumber, email, soTaiKhoan, hinhThucNhanHang, khachBuon, linkTaiKhoanMang } = rowData;

        try {
          if (mode === 'edit') {
            const userId = userMap.get(username);
            if (userId) {
              let updateFields = '';
              if (editableColumns.includes(0)) updateFields += `ho_ten = N'${hoTen}', `;
              if (editableColumns.includes(1)) updateFields += `vung_mien = N'${vungMien}', `;
              if (editableColumns.includes(2)) updateFields += `dia_chi = N'${diaChi}', `;
              if (editableColumns.includes(3)) updateFields += `tinh_thanh = N'${tinhThanh}', `;
              if (editableColumns.includes(4)) updateFields += `PhoneNumber = '${phoneNumber}', `;
              if (editableColumns.includes(5)) updateFields += `Email = '${email}', `;
              if (editableColumns.includes(6)) updateFields += `so_tai_khoan = N'${soTaiKhoan}', `;
              if (editableColumns.includes(7)) updateFields += `hinh_thuc_nhan_hang = N'${hinhThucNhanHang}', `;
              if (editableColumns.includes(8)) updateFields += `khach_buon = ${khachBuon ? 1 : 0}, `;
              if (editableColumns.includes(9)) updateFields += `link_tai_khoan_mang = N'${linkTaiKhoanMang}', `;

              if (updateFields) {
                updateFields = updateFields.slice(0, -2);
                await this.sequelize.query(`
                  UPDATE dbo.AspNetUsers SET ${updateFields} WHERE Id = '${userId}'
                `);
              }
              successCount++;
            }
          } else {
            const passwordHash = await bcrypt.hash(password, 10);
            const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            await this.sequelize.query(`
              INSERT INTO dbo.AspNetUsers (Id, UserName, Email, PasswordHash, ho_ten, dia_chi, tinh_thanh, so_tai_khoan, hinh_thuc_nhan_hang, khach_buon, link_tai_khoan_mang, vung_mien)
              VALUES ('${id}', N'${username}', N'${email}', '${passwordHash}', N'${hoTen}', N'${diaChi}', N'${tinhThanh}', N'${soTaiKhoan}', N'${hinhThucNhanHang}', ${khachBuon ? 1 : 0}, N'${linkTaiKhoanMang}', N'${vungMien}')
            `);
            successCount++;
          }
        } catch (err) {
          console.error(`Error importing user ${username}:`, err);
          errorCount++;
        }
      }

      return { successCount, errorCount };
    } catch (error) {
      console.error('Error executing import:', error.message);
      return { successCount: 0, errorCount: 0 };
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
