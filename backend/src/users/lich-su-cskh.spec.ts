import { dongBoLichSuCskh, ghiLichSuCskhSau, NGAY_GAN_DAU } from './lich-su-cskh';

/**
 * Lịch sử gán CSKH — chỗ quyết định doanh số của khách chuyển CSKH giữa kỳ
 * thuộc về ai. Sai ở đây thì báo cáo vẫn ra số đẹp, chỉ là của nhầm người.
 */
describe('lich-su-cskh', () => {
  const sq = { query: jest.fn() };
  afterEach(() => jest.clearAllMocks());

  it('chỉ ghi khi CSKH hiện tại KHÁC dòng lịch sử mới nhất — chạy lại không sinh trùng', async () => {
    sq.query.mockResolvedValue([[], 0]);
    await dongBoLichSuCskh(sq as any, 'ADMIN', ['HP1']);
    const [sql, opts] = sq.query.mock.calls[0];
    expect(sql).toContain('ORDER BY x.TuNgay DESC, x.ID DESC');
    expect(sql).toContain("ISNULL(h.CSKH, '') <> ISNULL(LTRIM(RTRIM(u.CSKHPhuTrach)), '')");
    expect(opts.replacements).toMatchObject({ nguoiDoi: 'ADMIN', tatCa: 0, ds: ['HP1'] });
  });

  it('lần gán đầu lấy từ đầu, các lần sau hiệu lực từ HÔM NAY (theo ngày, không theo giờ)', async () => {
    sq.query.mockResolvedValue([[], 0]);
    await dongBoLichSuCskh(sq as any, 'ADMIN');
    const [sql] = sq.query.mock.calls[0];
    expect(sql).toContain(`CASE WHEN h.ID IS NULL THEN '${NGAY_GAN_DAU}' ELSE CAST(GETDATE() AS date) END`);
  });

  it('bỏ qua tài khoản nhân viên', async () => {
    sq.query.mockResolvedValue([[], 0]);
    await dongBoLichSuCskh(sq as any, 'ADMIN');
    expect(sq.query.mock.calls[0][0]).toContain('NOT EXISTS (SELECT 1 FROM dbo.AspNetUserRoles');
  });

  it('không truyền danh sách = đồng bộ tất cả; danh sách rỗng thì không chạy gì', async () => {
    sq.query.mockResolvedValue([[], 0]);
    await dongBoLichSuCskh(sq as any, 'X');
    expect(sq.query.mock.calls[0][1].replacements.tatCa).toBe(1);
    sq.query.mockClear();
    expect(await dongBoLichSuCskh(sq as any, 'X', ['', '  '])).toBe(0);
    expect(sq.query).not.toHaveBeenCalled();
  });

  it('ghi sau khi đổi CSKH: lỗi không làm hỏng việc chính', async () => {
    sq.query.mockRejectedValue(new Error('mat ket noi'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(ghiLichSuCskhSau(sq as any, 'X', ['HP1'])).resolves.toBeUndefined();
    err.mockRestore();
  });
});
