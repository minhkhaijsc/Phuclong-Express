/**
 * Ảnh tracking: đọc số tracking từ tên file, khớp, lưu, thay ảnh trùng tên.
 *
 * Máy phát triển không có SQL Server — sequelize giả đóng vai bảng tbTracking /
 * tbAnhTracking trong bộ nhớ, và mọi câu lệnh bắt được đều đưa qua parser T-SQL.
 */
import { BadRequestException } from '@nestjs/common';
import { Parser } from 'node-sql-parser';
import { AnhTrackingService } from './anh-tracking.service';
import { laTenAnh, ungVienTracking } from './anh-tracking.helper';

describe('ungVienTracking — tên file ra số tracking', () => {
  it('tên nguyên văn luôn đứng đầu', () => {
    expect(ungVienTracking('1Z999AA10123456784.jpg')).toEqual([
      '1Z999AA10123456784',
    ]);
    expect(ungVienTracking('ABC-1234-56.JPG')[0]).toBe('ABC-1234-56');
  });

  it('bỏ đuôi đánh số của kho và của Windows', () => {
    expect(ungVienTracking('TBA123456789_1.jpg')).toEqual([
      'TBA123456789_1',
      'TBA123456789',
    ]);
    expect(ungVienTracking('TBA123456789-2.png')).toEqual([
      'TBA123456789-2',
      'TBA123456789',
    ]);
    expect(ungVienTracking('TBA123456789 (3).jpeg')).toEqual([
      'TBA123456789 (3)',
      'TBA123456789',
    ]);
    expect(ungVienTracking('TBA123456789_2 (1).jpg')).toEqual([
      'TBA123456789_2 (1)',
      'TBA123456789_2',
      'TBA123456789',
    ]);
  });

  it('bỏ đường dẫn thư mục và khoảng trắng thừa', () => {
    expect(ungVienTracking('anh 17-9/con/ 9400111202555842 .jpg')).toEqual([
      '9400111202555842',
    ]);
    expect(ungVienTracking('C:\\anh\\9400111202555842.jpg')).toEqual([
      '9400111202555842',
    ]);
  });

  it('bỏ đuôi không được ra ứng viên quá ngắn; tên nguyên văn thì luôn giữ', () => {
    expect(ungVienTracking('12.jpg')).toEqual(['12']);
    expect(ungVienTracking('ABCD_1.jpg')).toEqual(['ABCD_1', 'ABCD']);
    expect(ungVienTracking('ABC_1.jpg')).toEqual(['ABC_1']);
  });

  it('nhận ra file ảnh, bỏ qua file rác của hệ điều hành', () => {
    expect(laTenAnh('a/b/X123.JPG')).toBe(true);
    expect(laTenAnh('X123.heic')).toBe(true);
    expect(laTenAnh('Thumbs.db')).toBe(false);
    expect(laTenAnh('.DS_Store')).toBe(false);
    expect(laTenAnh('desktop.ini')).toBe(false);
    expect(laTenAnh('ds.xlsx')).toBe(false);
  });
});

// ---------------------------------------------------------------------------

type Tracking = {
  TrackingID: number;
  TrackingNumber: string;
  UserName: string;
  TinhTrang: string;
  DaXoa: 0 | 1;
};
type Anh = {
  AnhTrackingID: number;
  TrackingID: number;
  LinkHinh: string;
  TenFileGoc: string;
  NguoiTao: string;
  NgayTao: string;
  DaXoa: 0 | 1;
};

function taoDb(opts: { thieuBang?: boolean } = {}) {
  const tracking: Tracking[] = [
    {
      TrackingID: 1,
      TrackingNumber: 'TBA111111111',
      UserName: 'khach1',
      TinhTrang: 'InVN',
      DaXoa: 0,
    },
    {
      TrackingID: 2,
      TrackingNumber: 'ABC-12',
      UserName: 'khach2',
      TinhTrang: 'Received',
      DaXoa: 0,
    },
    {
      TrackingID: 3,
      TrackingNumber: 'ABC',
      UserName: 'khach3',
      TinhTrang: 'Received',
      DaXoa: 0,
    },
    // Cùng số, hai dòng (hai khách gom chung) — ảnh gắn cho cả hai.
    {
      TrackingID: 4,
      TrackingNumber: 'DUP999999',
      UserName: 'khach4',
      TinhTrang: 'InVN',
      DaXoa: 0,
    },
    {
      TrackingID: 5,
      TrackingNumber: 'dup999999 ',
      UserName: 'khach5',
      TinhTrang: 'InVN',
      DaXoa: 0,
    },
    // Đã xoá — không được khớp.
    {
      TrackingID: 6,
      TrackingNumber: 'DELETED0001',
      UserName: 'khach6',
      TinhTrang: 'InVN',
      DaXoa: 1,
    },
    // Một ô chứa HAI mã, ngăn bằng xuống dòng: kho dán cả mã hãng nước ngoài
    // lẫn mã nội địa. 11.400 đơn thật đang như vậy.
    {
      TrackingID: 7,
      TrackingNumber: '1Z6F857YYW87631219\n92612909858661571682792670',
      UserName: 'khach7',
      TinhTrang: 'InTransit',
      DaXoa: 0,
    },
    // Ô lẫn chữ ghi tay của kho.
    {
      TrackingID: 8,
      TrackingNumber: '417047905744\nSCAN TRACK DUOI ',
      UserName: 'khach8',
      TinhTrang: 'InTransit',
      DaXoa: 0,
    },
  ];
  const anh: Anh[] = [];
  const logs: any[] = [];
  /** Đếm số lần quét bảng lấy ô nhiều mã — để biết bộ nhớ đệm có ăn không. */
  const demNhieuMa = { n: 0 };
  const sql: { sql: string; replacements: Record<string, unknown> }[] = [];
  let seq = 100;

  const loiThieuBang = () => {
    throw new Error("Invalid object name 'dbo.tbAnhTracking'.");
  };
  const eq = (a: string, b: unknown) =>
    a.trim().toLowerCase() === String(b).trim().toLowerCase();

  const query = jest.fn(async (q: string, o: any = {}) => {
    const r = o.replacements ?? {};
    sql.push({ sql: q, replacements: r });
    const s = q.replace(/\s+/g, ' ');

    if (/FROM dbo\.tbTracking WHERE DaXoa = 0 AND TrackingNumber IN/.test(s)) {
      return tracking.filter(
        (t) =>
          !t.DaXoa && (r.ds as string[]).some((d) => eq(t.TrackingNumber, d)),
      );
    }
    if (/AND \(TrackingNumber LIKE/.test(s)) {
      demNhieuMa.n++;
      return tracking.filter((t) => !t.DaXoa && /[\s,;/]/.test(t.TrackingNumber));
    }
    if (/SELECT TOP 1 UserName FROM dbo\.tbTracking/.test(s)) {
      return tracking
        .filter((t) => !t.DaXoa && t.TrackingID === r.trackingId)
        .map((t) => ({ UserName: t.UserName }));
    }
    if (/tbAnhTracking/.test(s) && opts.thieuBang) loiThieuBang();
    if (
      /^SELECT TrackingID, TenFileGoc FROM dbo\.tbAnhTracking/.test(s.trim())
    ) {
      return anh.filter(
        (a) => !a.DaXoa && (r.ids as number[]).includes(a.TrackingID),
      );
    }
    if (/SELECT TrackingID, COUNT\(\*\) AS SoAnh/.test(s)) {
      const m = new Map<number, number>();
      for (const a of anh)
        if (!a.DaXoa && (r.ids as number[]).includes(a.TrackingID))
          m.set(a.TrackingID, (m.get(a.TrackingID) ?? 0) + 1);
      return [...m].map(([TrackingID, SoAnh]) => ({ TrackingID, SoAnh }));
    }
    if (/SELECT AnhTrackingID, TrackingID, LinkHinh/.test(s)) {
      return anh
        .filter((a) => !a.DaXoa && a.TrackingID === r.trackingId)
        .sort(
          (x, y) =>
            x.TenFileGoc.localeCompare(y.TenFileGoc) ||
            x.AnhTrackingID - y.AnhTrackingID,
        );
    }
    if (
      /^UPDATE dbo\.tbAnhTracking .* WHERE TrackingID = :trackingId/.test(
        s.trim(),
      )
    ) {
      const bi = anh.filter(
        (a) =>
          !a.DaXoa && a.TrackingID === r.trackingId && eq(a.TenFileGoc, r.ten),
      );
      bi.forEach((a) => (a.DaXoa = 1));
      return bi.map((a) => ({ AnhTrackingID: a.AnhTrackingID }));
    }
    if (
      /^UPDATE dbo\.tbAnhTracking .* WHERE AnhTrackingID = :anhTrackingId/.test(
        s.trim(),
      )
    ) {
      const bi = anh.filter(
        (a) => !a.DaXoa && a.AnhTrackingID === r.anhTrackingId,
      );
      bi.forEach((a) => (a.DaXoa = 1));
      return bi.map(({ TrackingID, LinkHinh, TenFileGoc }) => ({
        TrackingID,
        LinkHinh,
        TenFileGoc,
      }));
    }
    if (/^INSERT INTO dbo\.tbAnhTracking/.test(s.trim())) {
      if (r.linkHinh === 'HONG') throw new Error('mất kết nối');
      const a: Anh = {
        AnhTrackingID: ++seq,
        TrackingID: r.trackingId as number,
        LinkHinh: r.linkHinh as string,
        TenFileGoc: r.ten as string,
        NguoiTao: r.nguoiTao as string,
        NgayTao: '2026-09-17',
        DaXoa: 0,
      };
      anh.push(a);
      return [{ AnhTrackingID: a.AnhTrackingID }];
    }
    throw new Error(`Câu lệnh lạ trong test: ${s.slice(0, 80)}`);
  });

  const sequelize = {
    query,
    transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) =>
      fn({ id: 'tx' }),
    ),
  };
  const systemLogs = {
    create: jest.fn(async (l: unknown, t?: unknown) =>
      logs.push({ ...(l as object), t }),
    ),
  };
  let dem = 0;
  const upload = {
    luuAnhHang: jest.fn(async () => ({
      linkHinh: `/imgLink/202609/anh-${++dem}.jpg`,
    })),
    xoaFile: jest.fn(),
  };
  const service = new AnhTrackingService(
    sequelize as any,
    systemLogs as any,
    upload as any,
  );
  return { service, tracking, anh, logs, sql, upload, sequelize, demNhieuMa };
}

const file = (ten = 'x.jpg') => ({
  buffer: Buffer.from('anh'),
  originalname: ten,
  size: 3,
});

describe('AnhTrackingService', () => {
  it('khớp: tên nguyên văn thắng bỏ đuôi, không phân biệt hoa thường, bỏ qua tracking đã xoá', async () => {
    const { service } = taoDb();
    const kq = await service.khopTenFile([
      'tba111111111.JPG',
      'TBA111111111_2.jpg',
      'ABC-12.jpg',
      'KHONGCO123.jpg',
      'DELETED0001.jpg',
      'Thumbs.db',
      'DUP999999.jpg',
    ]);
    const theoTen = Object.fromEntries(kq.map((k) => [k.tenFile, k]));

    expect(theoTen['tba111111111.JPG']).toMatchObject({
      soTracking: 'TBA111111111',
      boDuoi: false,
    });
    expect(theoTen['TBA111111111_2.jpg']).toMatchObject({
      soTracking: 'TBA111111111',
      boDuoi: true,
    });
    // "ABC-12" có thật → khớp chính nó, KHÔNG bị cắt thành "ABC".
    expect(theoTen['ABC-12.jpg'].tracking.map((t) => t.TrackingID)).toEqual([
      2,
    ]);
    expect(theoTen['KHONGCO123.jpg']).toMatchObject({
      soTracking: null,
      tracking: [],
    });
    expect(theoTen['DELETED0001.jpg'].tracking).toEqual([]);
    expect(theoTen['Thumbs.db']).toMatchObject({ laAnh: false, tracking: [] });
    expect(
      theoTen['DUP999999.jpg'].tracking.map((t) => t.TrackingID).sort(),
    ).toEqual([4, 5]);
  });

  it('lưu ảnh, up lại cùng tên thì THAY ảnh cũ chứ không nhân đôi', async () => {
    const { service, anh, logs } = taoDb();
    const a = await service.luuAnh(
      file(),
      'thu-muc/TBA111111111_1.jpg',
      'kho01',
    );
    expect(a).toMatchObject({
      soTracking: 'TBA111111111',
      trackingIds: [1],
      thayThe: 0,
      tenFile: 'TBA111111111_1.jpg',
    });
    await service.luuAnh(file(), 'TBA111111111_2.jpg', 'kho01');

    const truoc = await service.khopTenFile([
      'TBA111111111_1.jpg',
      'TBA111111111_3.jpg',
    ]);
    expect(truoc[0]).toMatchObject({ soAnhDaCo: 2, trungTen: true });
    expect(truoc[1]).toMatchObject({ soAnhDaCo: 2, trungTen: false });

    const b = await service.luuAnh(file(), 'tba111111111_1.JPG', 'kho02');
    expect(b.thayThe).toBe(1);
    expect(anh.filter((x) => !x.DaXoa)).toHaveLength(2);
    expect((await service.layAnh(1)).map((x) => x.LinkHinh)).toEqual([
      '/imgLink/202609/anh-3.jpg',
      '/imgLink/202609/anh-2.jpg',
    ]);

    // Mỗi lần lưu một dòng nhật ký, nằm trong giao dịch; lần thay ghi rõ ảnh cũ.
    expect(logs).toHaveLength(3);
    expect(logs.every((l) => l.t)).toBe(true);
    expect(logs[2]).toMatchObject({
      nguon: 'Tracking_Anh:ThemAnh',
      hanhDong: 'Chinh sua',
      doiTuong: '1',
    });
    expect(logs[2].noiDung).toMatch(/Thay anh cu: 101/);
  });

  it('một số tracking nhiều dòng thì gắn ảnh cho tất cả', async () => {
    const { service, anh } = taoDb();
    const r = await service.luuAnh(file(), 'DUP999999.jpg', 'kho01');
    expect(r.trackingIds.sort()).toEqual([4, 5]);
    expect(anh.map((a) => a.TrackingID).sort()).toEqual([4, 5]);
    // Cùng MỘT file ảnh cho cả hai dòng — không lưu hai lần.
    expect(new Set(anh.map((a) => a.LinkHinh)).size).toBe(1);
  });

  it('từ chối: không có tracking, không phải ảnh, thiếu file — và không ghi ảnh ra đĩa', async () => {
    const { service, upload } = taoDb();
    await expect(
      service.luuAnh(file(), 'KHONGCO123.jpg', 'kho'),
    ).rejects.toThrow('Không có tracking "KHONGCO123"');
    await expect(service.luuAnh(file(), 'ds.xlsx', 'kho')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.luuAnh(undefined, 'TBA111111111.jpg', 'kho'),
    ).rejects.toThrow('Chưa có file ảnh');
    expect(upload.luuAnhHang).not.toHaveBeenCalled();
  });

  it('lưu cơ sở dữ liệu hỏng thì gỡ file vừa ghi', async () => {
    const { service, upload } = taoDb();
    upload.luuAnhHang.mockResolvedValueOnce({ linkHinh: 'HONG' });
    await expect(
      service.luuAnh(file(), 'TBA111111111.jpg', 'kho'),
    ).rejects.toThrow('mất kết nối');
    expect(upload.xoaFile).toHaveBeenCalledWith('HONG');
  });

  it('xoá mềm ảnh, ghi nhật ký; xoá lần hai báo không còn', async () => {
    const { service, anh, logs } = taoDb();
    await service.luuAnh(file(), 'TBA111111111.jpg', 'kho');
    const id = anh[0].AnhTrackingID;
    await expect(service.xoaAnh(id, 'quanly')).resolves.toEqual({
      TrackingID: 1,
    });
    expect(anh[0].DaXoa).toBe(1);
    expect(logs.at(-1)).toMatchObject({
      nguon: 'Tracking_Anh:XoaAnh',
      hanhDong: 'Xoa',
      nguoiTao: 'quanly',
    });
    await expect(service.xoaAnh(id, 'quanly')).rejects.toThrow(
      'Ảnh không còn tồn tại',
    );
  });

  it('đếm ảnh cho trang danh sách', async () => {
    const { service } = taoDb();
    await service.luuAnh(file(), 'TBA111111111_1.jpg', 'kho');
    await service.luuAnh(file(), 'TBA111111111_2.jpg', 'kho');
    await service.luuAnh(file(), 'ABC.jpg', 'kho');
    const m = await service.demAnh([1, 2, 3, 0, NaN]);
    expect([m.get(1), m.get(2), m.get(3)]).toEqual([2, undefined, 1]);
  });

  it('bảng chưa tạo: đọc trả rỗng (danh sách/tra cứu không chết), lưu thì báo rõ phải chạy migration', async () => {
    const { service, upload } = taoDb({ thieuBang: true });
    await expect(service.layAnh(1)).resolves.toEqual([]);
    await expect(service.demAnh([1])).resolves.toEqual(new Map());
    const k = await service.khopTenFile(['TBA111111111.jpg']);
    expect(k[0].soTracking).toBe('TBA111111111');
    await expect(
      service.luuAnh(file(), 'TBA111111111.jpg', 'kho'),
    ).rejects.toThrow('create-anh-tracking-table.sql');
    expect(upload.xoaFile).toHaveBeenCalled();
  });

  it('chủ tracking: có / không có', async () => {
    const { service } = taoDb();
    await expect(service.chuTracking(1)).resolves.toBe('khach1');
    await expect(service.chuTracking(6)).resolves.toBeUndefined();
  });

  it('ô tracking chứa nhiều mã: ảnh đặt tên theo mã nào cũng khớp', async () => {
    const { service } = taoDb();
    const kq = await service.khopTenFile([
      '1Z6F857YYW87631219.jpg', // mã thứ nhất — trước đây báo "không có tracking"
      '92612909858661571682792670.jpg', // mã thứ hai
      '1Z6F857YYW87631219_2.jpg', // ảnh thứ hai của cùng đơn
      'SCAN.jpg', // chữ ghi tay trong ô, KHÔNG được khớp
      'TRACK.jpg',
    ]);
    const theoTen = Object.fromEntries(kq.map((k) => [k.tenFile, k]));
    expect(theoTen['1Z6F857YYW87631219.jpg']).toMatchObject({
      soTracking: '1Z6F857YYW87631219',
      nhieuMa: true,
    });
    expect(theoTen['1Z6F857YYW87631219.jpg'].tracking.map((t) => t.TrackingID)).toEqual([7]);
    expect(theoTen['92612909858661571682792670.jpg'].tracking.map((t) => t.TrackingID)).toEqual([7]);
    expect(theoTen['1Z6F857YYW87631219_2.jpg']).toMatchObject({ nhieuMa: true, boDuoi: true });
    expect(theoTen['SCAN.jpg'].tracking).toEqual([]);
    expect(theoTen['TRACK.jpg'].tracking).toEqual([]);
  });

  it('khớp bằng dấu bằng vẫn được ưu tiên, khớp hết thì khỏi quét bảng lớn', async () => {
    const { service, demNhieuMa } = taoDb();
    const kq = await service.khopTenFile(['TBA111111111.jpg', 'ABC-12.jpg']);
    expect(kq.every((k) => k.tracking.length === 1 && !k.nhieuMa)).toBe(true);
    expect(demNhieuMa.n).toBe(0);
  });

  it('chỉ quét bảng lớn một lần rồi dùng lại bộ nhớ đệm', async () => {
    const { service, demNhieuMa } = taoDb();
    for (let i = 0; i < 5; i++) await service.khopTenFile(['1Z6F857YYW87631219.jpg']);
    expect(demNhieuMa.n).toBe(1);
  });

  it('lưu được ảnh cho đơn có ô nhiều mã', async () => {
    const { service, anh } = taoDb();
    const r = await service.luuAnh(file(), '1Z6F857YYW87631219.jpg', 'kho01');
    expect(r).toMatchObject({ trackingIds: [7], soTracking: '1Z6F857YYW87631219' });
    expect(anh.map((a) => a.TrackingID)).toEqual([7]);
  });

  it('mọi câu lệnh đúng cú pháp T-SQL, không sót tham số', async () => {
    const { service, sql } = taoDb();
    await service.khopTenFile(['TBA111111111_1.jpg']);
    await service.luuAnh(file(), 'TBA111111111_1.jpg', 'kho');
    await service.luuAnh(file(), 'TBA111111111_1.jpg', 'kho');
    await service.layAnh(1);
    await service.demAnh([1, 2]);
    await service.chuTracking(1);
    await service.xoaAnh(101, 'kho').catch(() => undefined);

    const parser = new Parser();
    const loi: string[] = [];
    for (const { sql: q, replacements } of sql) {
      const ten = [...q.matchAll(/:(\w+)/g)].map((m) => m[1]);
      for (const n of ten)
        if (!(n in replacements))
          loi.push(`thiếu :${n} trong ${q.slice(0, 60)}`);

      const phang = q.replace(/\s+/g, ' ').trim();
      if (/\bOUTPUT\b/i.test(phang)) {
        // node-sql-parser không đọc được OUTPUT — kiểm vị trí theo tài liệu SQL Server.
        const dung =
          /^INSERT INTO [\w.]+ \(.+\) OUTPUT INSERTED\.\w+(, INSERTED\.\w+)* VALUES \(/i.test(
            phang,
          ) ||
          /^UPDATE [\w.]+ SET .+ OUTPUT INSERTED\.\w+(, INSERTED\.\w+)* WHERE /i.test(
            phang,
          );
        if (!dung) loi.push(`OUTPUT sai chỗ: ${phang}`);
        continue;
      }
      const day = q.replace(/:(\w+)/g, (_m, n) => {
        const v = replacements[n];
        if (Array.isArray(v))
          return v
            .map((x) => (typeof x === 'number' ? x : `N'${x}'`))
            .join(', ');
        return typeof v === 'number' ? String(v) : `N'${String(v)}'`;
      });
      try {
        parser.astify(day, { database: 'transactsql' });
      } catch (e: any) {
        loi.push(`${e.message}\n${day}`);
      }
    }
    expect(sql.length).toBeGreaterThanOrEqual(10);
    expect(loi).toEqual([]);
  });
});

describe('AnhTrackingController.taiLen — lỗi từng ảnh nằm trong thân 200', () => {
  // IIS trên server thay thân mọi 4xx bằng trang HTML, nên câu báo lỗi phải đi
  // trong thân 200 thì trang up ảnh mới hiện được.
  const { AnhTrackingController } = require('./anh-tracking.controller');
  const nv = { user: { username: 'kho01', roles: ['Admin'] } };

  it('ảnh không có tracking → { ok: false, loi } chứ không ném', async () => {
    const { service } = taoDb();
    const c = new AnhTrackingController(service);
    await expect(c.taiLen(file(), { tenFileGoc: 'KHONGCO123.jpg' }, nv)).resolves.toEqual({
      ok: false,
      loi: 'Không có tracking "KHONGCO123" trong hệ thống.',
    });
  });

  it('thành công → ok: true kèm kết quả', async () => {
    const { service } = taoDb();
    const c = new AnhTrackingController(service);
    await expect(c.taiLen(file(), { tenFileGoc: 'TBA111111111.jpg' }, nv)).resolves.toMatchObject({
      ok: true,
      soTracking: 'TBA111111111',
      trackingIds: [1],
    });
  });

  it('khách (không vai trò) vẫn bị chặn bằng 403, lỗi hệ thống vẫn ném', async () => {
    const { service, upload } = taoDb();
    const c = new AnhTrackingController(service);
    await expect(c.taiLen(file(), { tenFileGoc: 'TBA111111111.jpg' }, { user: { username: 'k', roles: [] } })).rejects.toThrow('Chỉ nhân viên');
    upload.luuAnhHang.mockRejectedValueOnce(new Error('đĩa đầy'));
    await expect(c.taiLen(file(), { tenFileGoc: 'TBA111111111.jpg' }, nv)).rejects.toThrow('đĩa đầy');
  });
});
