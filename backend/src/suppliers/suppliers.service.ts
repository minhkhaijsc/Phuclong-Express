import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { SystemLogsService } from '../system-logs/system-logs.service';

export interface NhaCungCap {
  NhaCungCapID: number;
  TenNhaCungCap: string;
  GhiChu: string | null;
  DaAn: boolean;
  NgayTao: Date;
  NguoiTao: string | null;
}

export interface TaoNhaCungCapDto {
  tenNhaCungCap: string;
  ghiChu?: string | null;
}

export interface SuaNhaCungCapDto extends TaoNhaCungCapDto {
  daAn?: boolean;
}

/**
 * Danh mục nhà cung cấp (`tbNhaCungCap`).
 *
 * Dùng truy vấn tham số thẳng chứ không viết stored procedure mới: lược đồ này
 * đầy SP sinh ra từ bản ASP cũ, thêm SP nữa thì lại thêm một chỗ phải sửa hai
 * nơi mỗi lần đổi cột. Bảng mới thì không có ràng buộc tương thích đó.
 */
@Injectable()
export class SuppliersService {
  constructor(
    @Inject('SEQUELIZE') private readonly sequelize: Sequelize,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  /**
   * Danh sách nhà cung cấp.
   *
   * Mặc định BỎ nhà cung cấp đã ẩn — cùng quy ước với `getQuocGia`. Ô chọn khi
   * nhập đơn thì không nên hiện NCC đã ngừng, nhưng Ô LỌC của trang công nợ
   * phải trả thì phải hiện, không thì không tra lại được nợ cũ của NCC đó.
   */
  async danhSach(tatCa = false): Promise<NhaCungCap[]> {
    const data = await this.sequelize.query<NhaCungCap>(
      `SELECT NhaCungCapID, TenNhaCungCap, GhiChu, DaAn, NgayTao, NguoiTao
       FROM   dbo.tbNhaCungCap
       ${tatCa ? '' : 'WHERE DaAn = 0'}
       ORDER  BY TenNhaCungCap`,
      { type: QueryTypes.SELECT },
    );
    return data;
  }

  async motCai(id: number): Promise<NhaCungCap> {
    const [ncc] = await this.sequelize.query<NhaCungCap>(
      `SELECT NhaCungCapID, TenNhaCungCap, GhiChu, DaAn, NgayTao, NguoiTao
       FROM   dbo.tbNhaCungCap WHERE NhaCungCapID = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!ncc) throw new NotFoundException(`Không có nhà cung cấp id ${id}`);
    return ncc;
  }

  /** Tên trống hoặc chỉ có khoảng trắng thì chặn ngay, đừng để thành một dòng rác. */
  private tenSach(ten: string | undefined): string {
    const t = String(ten ?? '').trim();
    if (!t) throw new BadRequestException('Tên nhà cung cấp không được để trống.');
    if (t.length > 200) throw new BadRequestException('Tên nhà cung cấp dài quá 200 ký tự.');
    return t;
  }

  async tao(dto: TaoNhaCungCapDto, nguoiTao: string): Promise<NhaCungCap> {
    const ten = this.tenSach(dto.tenNhaCungCap);
    await this.chanTrungTen(ten, null);

    const [ra] = await this.sequelize.query<{ NhaCungCapID: number }>(
      `INSERT INTO dbo.tbNhaCungCap (TenNhaCungCap, GhiChu, DaAn, NgayTao, NguoiTao)
       OUTPUT INSERTED.NhaCungCapID
       VALUES (:ten, :ghiChu, 0, GETDATE(), :nguoiTao)`,
      {
        replacements: { ten, ghiChu: dto.ghiChu ?? null, nguoiTao },
        type: QueryTypes.SELECT,
      },
    );

    await this.ghiNhatKy('ThemNhaCungCap', ra.NhaCungCapID, `Ten: ${ten}`, nguoiTao);
    return this.motCai(ra.NhaCungCapID);
  }

  async sua(id: number, dto: SuaNhaCungCapDto, nguoiSua: string): Promise<NhaCungCap> {
    const cu = await this.motCai(id);
    const ten = this.tenSach(dto.tenNhaCungCap);
    await this.chanTrungTen(ten, id);

    await this.sequelize.query(
      `UPDATE dbo.tbNhaCungCap
       SET    TenNhaCungCap = :ten, GhiChu = :ghiChu, DaAn = :daAn
       WHERE  NhaCungCapID = :id`,
      {
        replacements: {
          id,
          ten,
          ghiChu: dto.ghiChu ?? null,
          daAn: (dto.daAn ?? cu.DaAn) ? 1 : 0,
        },
        type: QueryTypes.UPDATE,
      },
    );

    await this.ghiNhatKy(
      'CapNhatNhaCungCap',
      id,
      `Ten: ${cu.TenNhaCungCap} -> ${ten}; DaAn: ${dto.daAn ?? cu.DaAn}`,
      nguoiSua,
    );
    return this.motCai(id);
  }

  /**
   * ẨN, không xoá.
   *
   * Xoá dòng NCC là mọi đơn cũ trỏ vào nó (`DON_HANG.NCC_ID`) mất tên nhà cung
   * cấp trong công nợ phải trả — đúng cái đã xảy ra với vai trò Admin ngày
   * 10/10/2026. Nên `DELETE /suppliers/:id` ở đây chỉ bật bit `DaAn`.
   */
  async an(id: number, nguoiAn: string): Promise<{ success: true; soDonDangDung: number }> {
    const ncc = await this.motCai(id);

    const [dem] = await this.sequelize.query<{ soDon: number }>(
      `SELECT COUNT(*) AS soDon FROM dbo.DON_HANG WHERE NCC_ID = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );

    await this.sequelize.query(
      `UPDATE dbo.tbNhaCungCap SET DaAn = 1 WHERE NhaCungCapID = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE },
    );

    await this.ghiNhatKy(
      'AnNhaCungCap',
      id,
      `Ten: ${ncc.TenNhaCungCap}; So don dang dung: ${dem?.soDon ?? 0}`,
      nguoiAn,
    );
    return { success: true, soDonDangDung: Number(dem?.soDon ?? 0) };
  }

  /**
   * Chỉ mục duy nhất trên `TenNhaCungCap` đã chặn trùng ở tầng CSDL, nhưng lỗi
   * nó ném ra là "Cannot insert duplicate key" — người dùng đọc không hiểu gì.
   * Kiểm ở đây để trả về câu nói được, còn chỉ mục giữ vai trò chốt cuối.
   */
  private async chanTrungTen(ten: string, boQuaId: number | null): Promise<void> {
    const [trung] = await this.sequelize.query<{ NhaCungCapID: number }>(
      `SELECT NhaCungCapID FROM dbo.tbNhaCungCap
       WHERE  TenNhaCungCap = :ten AND (:boQua IS NULL OR NhaCungCapID <> :boQua)`,
      { replacements: { ten, boQua: boQuaId }, type: QueryTypes.SELECT },
    );
    if (trung) {
      throw new BadRequestException(`Đã có nhà cung cấp tên "${ten}".`);
    }
  }

  private ghiNhatKy(hanhDong: string, id: number, noiDung: string, nguoiTao: string) {
    return this.systemLogsService.create({
      nguoiTao,
      nguon: `NhaCungCap:${hanhDong}`,
      hanhDong: 'Chinh sua',
      doiTuong: String(id),
      noiDung: `ID: ${id}; ${noiDung}`,
    });
  }
}
