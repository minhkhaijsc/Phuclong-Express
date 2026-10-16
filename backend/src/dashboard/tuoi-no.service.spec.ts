import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TuoiNoService } from './tuoi-no.service';
import { SystemLogsService } from '../system-logs/system-logs.service';

/**
 * Báo cáo Tuổi nợ, sau khi thêm tuổi nợ riêng từng khách (16/10/2026).
 *
 * Phần tính nằm trong SQL nên không chạy được ở đây; cái kiểm được là HÌNH DẠNG
 * câu lệnh và phần chuyển dữ liệu về cho màn hình. Mấy chỗ dưới đây đều là chỗ
 * sửa một chữ là báo cáo sai tiền mà không ai thấy.
 */
describe('TuoiNoService', () => {
  let service: TuoiNoService;
  const mockSequelize = { query: jest.fn() };
  const mockLogs = { create: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TuoiNoService,
        { provide: 'SEQUELIZE', useValue: mockSequelize },
        { provide: SystemLogsService, useValue: mockLogs },
      ],
    }).compile();
    service = module.get<TuoiNoService>(TuoiNoService);
  });

  afterEach(() => jest.clearAllMocks());

  const traVe = (rows: any[]) => mockSequelize.query.mockResolvedValueOnce(rows);
  const sqlLanDau = () => mockSequelize.query.mock.calls[0][0] as string;

  describe('chia nhóm', () => {
    it('khách KHÔNG có tuổi nợ thì đếm từ ngày ghi nợ — ISNULL(TuoiNo, 0)', async () => {
      traVe([{}]);
      await service.tongHop();
      expect(sqlLanDau()).toContain('DATEDIFF(day, n.NgayGhiNo, GETDATE()) - ISNULL(h.TuoiNo, 0)');
    });

    it('khách CÓ tuổi nợ mà chưa tới hạn thì KHÔNG nằm trong nhóm "dưới 30 ngày"', async () => {
      // Nhét vào nhóm 0-30 là báo cáo "đang nợ" một khoản còn trong hạn.
      traVe([{}]);
      await service.tongHop();
      expect(sqlLanDau()).toContain('WHEN TuoiNo IS NOT NULL AND soNgay <= 0 THEN 0');
    });

    it('ba nhóm quá hạn: ≤30, 31–60, >60', async () => {
      traVe([{}]);
      await service.tongHop();
      const sql = sqlLanDau();
      expect(sql).toContain('WHEN soNgay <= 30 THEN 1');
      expect(sql).toContain('WHEN soNgay <= 60 THEN 2');
      expect(sql).toContain('ELSE 3');
      // Bốn nhóm cũ đã bỏ — còn sót là màn hình cộng thiếu.
      expect(sql).not.toContain('BETWEEN 61 AND 90');
    });

    it('chỉ lấy tuổi nợ hợp lệ, bỏ số âm', async () => {
      traVe([{}]);
      await service.tongHop();
      expect(sqlLanDau()).toContain('WHERE TuoiNo IS NOT NULL AND TuoiNo >= 0');
    });

    it('nối AspNetUsers bằng LEFT JOIN', async () => {
      // 5 trong 895 mã khách trên sổ công nợ không còn tài khoản. JOIN thường
      // là 5 mã đó biến mất khỏi báo cáo cùng với tiền của họ.
      traVe([{}]);
      await service.tongHop();
      expect(sqlLanDau()).toContain('LEFT JOIN HanNo h ON h.UserName = n.UserName');
    });

    it('bỏ những dòng còn dưới 1đ — bụi của phép khấu trừ float', async () => {
      traVe([{}]);
      await service.tongHop();
      expect(sqlLanDau()).toContain('WHERE conLai >= 1');
    });
  });

  describe('tongHop', () => {
    it('trả đủ cả ô "chưa tới hạn" — thiếu nó là bốn nhóm cộng không ra tổng', async () => {
      traVe([
        {
          soKhachConNo: 167,
          tongConNo: 449386484,
          chuaToiHan: 363573,
          n0_30: 390051386,
          n31_60: 14548172,
          tren60: 44423353,
        },
      ]);
      const kq = await service.tongHop();
      expect(kq.chuaToiHan + kq.n0_30 + kq.n31_60 + kq.tren60).toBe(kq.tongConNo);
    });

    it('không có dòng nào thì trả 0, không trả NaN', async () => {
      traVe([]);
      expect(await service.tongHop()).toEqual({
        soKhachConNo: 0,
        tongConNo: 0,
        chuaToiHan: 0,
        n0_30: 0,
        n31_60: 0,
        tren60: 0,
      });
    });
  });

  describe('danhSach', () => {
    const dong = (ghiDe: Record<string, unknown> = {}) => ({
      khach: 'SANG_UK  ',
      tuoiNo: 30,
      tong: 7109496,
      chuaToiHan: 0,
      n0_30: 3911600,
      n31_60: 0,
      tren60: 3197896,
      soNgayCuNhat: 235,
      soNgayQuaHan: 205,
      lanCuoi: '2026-02-23T00:00:00.000Z',
      ...ghiDe,
    });

    it('sắp theo số ngày QUÁ HẠN, không theo tuổi thật', async () => {
      // Khách được nợ 60 ngày mà mới nợ 50 ngày thì vẫn đúng hẹn — không có lý
      // do gì đứng trên khách không được nợ ngày nào mà đã trễ 40 ngày.
      traVe([dong()]);
      await service.danhSach('gia');
      expect(sqlLanDau()).toContain('ORDER BY soNgayQuaHan DESC, tong DESC');
    });

    it('sắp theo tiền khi chọn "nợ nhiều nhất"', async () => {
      traVe([dong()]);
      await service.danhSach('tien');
      expect(sqlLanDau()).toContain('ORDER BY tong DESC');
    });

    it('trả cả tuổi nợ lẫn số ngày quá hạn cho màn hình', async () => {
      traVe([dong()]);
      const [d] = await service.danhSach();
      expect(d.tuoiNo).toBe(30);
      expect(d.soNgayCuNhat).toBe(235);
      expect(d.soNgayQuaHan).toBe(205);
    });

    it('khách chưa đặt tuổi nợ thì trả null, KHÔNG trả 0', async () => {
      // 0 nghĩa là phải trả ngay, hôm sau đã quá hạn — khác hẳn "chưa thoả thuận".
      traVe([dong({ tuoiNo: null })]);
      const [d] = await service.danhSach();
      expect(d.tuoiNo).toBeNull();
    });

    it('tuổi nợ 0 vẫn là 0, không bị hiểu thành chưa đặt', async () => {
      traVe([dong({ tuoiNo: 0 })]);
      const [d] = await service.danhSach();
      expect(d.tuoiNo).toBe(0);
    });

    it('số ngày quá hạn âm nghĩa là chưa khoản nào tới hạn', async () => {
      traVe([dong({ tuoiNo: 1000, soNgayQuaHan: -257, chuaToiHan: 363573 })]);
      const [d] = await service.danhSach();
      expect(d.soNgayQuaHan).toBe(-257);
      expect(d.chuaToiHan).toBe(363573);
    });

    it('giới hạn số dòng truyền bằng tham số', async () => {
      traVe([]);
      await service.danhSach('gia', 50);
      expect(mockSequelize.query.mock.calls[0][1].replacements.gioiHan).toBe(50);
    });
  });

  describe('chiTiet', () => {
    it('không gọi CSDL khi chưa chọn khách', async () => {
      expect(await service.chiTiet('   ')).toEqual([]);
      expect(mockSequelize.query).not.toHaveBeenCalled();
    });

    it('BIND tên khách, không nối chuỗi', async () => {
      traVe([]);
      await service.chiTiet("HP' OR 1=1 --");
      const [sql, opts] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain(':khach');
      expect(sql).not.toContain('OR 1=1');
      expect(opts.replacements.khach).toBe("HP' OR 1=1 --");
    });

    it('trả hạn trả khi khách có tuổi nợ', async () => {
      traVe([
        {
          ngay: '2026-08-01T00:00:00.000Z',
          noiDung: 'Đơn 26016',
          conLai: 1500000,
          soNgay: 76,
          soNgayQuaHan: 46,
          hanTra: '2026-08-31T00:00:00.000Z',
        },
      ]);
      const [d] = await service.chiTiet('SANG_UK');
      expect(d.hanTra).toBe('2026-08-31');
      expect(d.soNgayQuaHan).toBe(46);
    });

    it('khách không có tuổi nợ thì không có hạn trả, quá hạn = tuổi thật', async () => {
      traVe([
        { ngay: '2026-08-01T00:00:00.000Z', noiDung: '', conLai: 1500000, soNgay: 76, soNgayQuaHan: 76, hanTra: null },
      ]);
      const [d] = await service.chiTiet('HP142');
      expect(d.hanTra).toBeNull();
      expect(d.soNgayQuaHan).toBe(76);
    });

    it('bỏ dòng còn dưới 1đ', async () => {
      traVe([
        { ngay: '2025-01-20T00:00:00.000Z', noiDung: 'bụi', conLai: 0.0000001, soNgay: 266, soNgayQuaHan: 266, hanTra: null },
        { ngay: '2026-08-01T00:00:00.000Z', noiDung: 'thật', conLai: 1500000, soNgay: 76, soNgayQuaHan: 76, hanTra: null },
      ]);
      const kq = await service.chiTiet('HP142');
      expect(kq).toHaveLength(1);
      expect(kq[0].noiDung).toBe('thật');
    });
  });

  describe('datTuoiNo', () => {
    const ghiXong = (soDong = 1) => mockSequelize.query.mockResolvedValueOnce([{ soDong }]);

    it('ghi số ngày và trả lại giá trị đã chuẩn hoá', async () => {
      ghiXong();
      const kq = await service.datTuoiNo('SANG_UK', '45', 'KETOANDIEP');

      const [sql, opts] = mockSequelize.query.mock.calls[0];
      expect(sql).toContain('UPDATE dbo.AspNetUsers SET TuoiNo = :tuoiNo');
      expect(opts.replacements).toEqual({ tuoiNo: 45, khach: 'SANG_UK' });
      expect(kq).toEqual({ khach: 'SANG_UK', tuoiNo: 45 });
    });

    it('để trống là XOÁ thoả thuận -> ghi NULL', async () => {
      ghiXong();
      const kq = await service.datTuoiNo('SANG_UK', '', 'KETOANDIEP');
      expect(mockSequelize.query.mock.calls[0][1].replacements.tuoiNo).toBeNull();
      expect(kq.tuoiNo).toBeNull();
    });

    it('0 vẫn ghi 0, không thành NULL', async () => {
      ghiXong();
      await service.datTuoiNo('SANG_UK', 0, 'KETOANDIEP');
      expect(mockSequelize.query.mock.calls[0][1].replacements.tuoiNo).toBe(0);
    });

    it('cắt khoảng trắng quanh tên khách', async () => {
      // Màn hình lấy tên từ bảng, mà cột UserName bên sổ công nợ có đuôi trắng.
      ghiXong();
      await service.datTuoiNo('  SANG_UK  ', 30);
      expect(mockSequelize.query.mock.calls[0][1].replacements.khach).toBe('SANG_UK');
    });

    it('gõ sai mã khách thì báo không có, không im lặng báo thành công', async () => {
      ghiXong(0);
      await expect(service.datTuoiNo('KHONGCO', 30)).rejects.toThrow(NotFoundException);
    });

    it('thiếu tên khách thì chặn, không đụng CSDL', async () => {
      await expect(service.datTuoiNo('   ', 30)).rejects.toThrow(BadRequestException);
      expect(mockSequelize.query).not.toHaveBeenCalled();
    });

    it('số âm thì chặn trước khi ghi', async () => {
      await expect(service.datTuoiNo('SANG_UK', -5)).rejects.toThrow(BadRequestException);
      expect(mockSequelize.query).not.toHaveBeenCalled();
    });

    it('ghi nhật ký ai đặt và đặt bao nhiêu', async () => {
      // Con số này quyết định khách bị gọi đòi nợ lúc nào — phải truy được.
      ghiXong();
      await service.datTuoiNo('SANG_UK', 45, 'KETOANDIEP');
      expect(mockLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({ nguoiTao: 'KETOANDIEP', doiTuong: 'SANG_UK', noiDung: 'TuoiNo: 45' }),
      );
    });

    it('nhật ký hỏng thì vẫn coi như đã ghi xong — không bắt người dùng làm lại', async () => {
      ghiXong();
      mockLogs.create.mockRejectedValueOnce(new Error('tbSystemLogs die'));
      await expect(service.datTuoiNo('SANG_UK', 45)).resolves.toEqual({ khach: 'SANG_UK', tuoiNo: 45 });
    });
  });
});
