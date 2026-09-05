/**
 * Kiểm tra cú pháp T-SQL của mọi câu lệnh mà ArticlesService sinh ra.
 *
 * Máy phát triển không có SQL Server, nên thay vì chạy thật thì bắt lại từng
 * câu lệnh qua sequelize giả, thay các tham số :name bằng giá trị mẫu rồi
 * đưa qua parser T-SQL. Bắt được lỗi cú pháp mà không cần cơ sở dữ liệu.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Parser } from 'node-sql-parser';
import { ArticlesService } from './articles.service';

const parser = new Parser();

/** Thay :param bằng giá trị mẫu để parser đọc được (parser không hiểu placeholder) */
function inlineParams(sql: string, replacements: Record<string, unknown> = {}): string {
  return sql.replace(/:(\w+)/g, (_m, name) => {
    const v = replacements[name];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    return `'${String(v).replace(/'/g, "''")}'`;
  });
}

describe('ArticlesService — cú pháp T-SQL', () => {
  let service: ArticlesService;
  const captured: { sql: string; replacements: Record<string, unknown> }[] = [];

  const mockSequelize = {
    query: jest.fn((sql: string, opts: any) => {
      captured.push({ sql, replacements: opts?.replacements ?? {} });
      // Câu kiểm tra slug trùng phải trả về rỗng, nếu không ensureUniqueSlug
      // sẽ quay 50 vòng rồi báo lỗi.
      if (/SELECT TOP 1 Id FROM Articles/i.test(sql)) return Promise.resolve([]);
      return Promise.resolve([{ Id: 1, Slug: 'bai-viet', Title: 'T', Content: 'C', Published: 1 }]);
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ArticlesService, { provide: 'SEQUELIZE', useValue: mockSequelize }],
    }).compile();
    service = module.get<ArticlesService>(ArticlesService);

    // Gọi hết các đường đi để thu thập mọi câu lệnh
    await service.getList('tìm', 'tin-tuc', 1, 2, 20);
    await service.getList(undefined, undefined, undefined, 1, 20);
    await service.getById(1);
    await service.create(
      {
        title: 'Bài mới', content: '<p>x</p>', excerpt: 'tóm tắt', thumbnail: '/a.jpg',
        author: 'nv', articleType: 'tin-tuc', published: true, metaTitle: 'mt',
        metaDescription: 'md', focusKeyword: 'kw', canonicalUrl: 'https://x.vn',
        ogTitle: 'ot', ogDescription: 'od', ogImage: '/o.jpg', noindex: false,
      } as any,
      'nhanvien',
    );
    await service.update(1, { title: 'Sửa', content: '<p>y</p>', published: true } as any, 'nv');
    await service.update(1, { slug: 'duong-dan-khac' } as any, 'nv');
    await service.remove(1, 'nv');
    await service.getPublished('tin-tuc', 'tìm', 1, 12);
    await service.getPublished(undefined, undefined, 1, 12);
    await service.getBySlug('bai-viet');
    await service.getRelated('bai-viet', 'tin-tuc', 4);
    await service.getSitemapEntries();
  });

  it('thu được đầy đủ câu lệnh', () => {
    expect(captured.length).toBeGreaterThanOrEqual(15);
  });

  it('mọi câu lệnh đều đúng cú pháp T-SQL', () => {
    const loi: string[] = [];
    for (const { sql, replacements } of captured) {
      // node-sql-parser không hỗ trợ mệnh đề OUTPUT (ngay cả ví dụ chuẩn của
      // Microsoft cũng không đọc được), nên bỏ qua ở đây và kiểm riêng bên dưới.
      if (/\bOUTPUT\b/i.test(sql)) continue;
      const day = inlineParams(sql, replacements);
      try {
        parser.astify(day, { database: 'transactsql' });
      } catch (e: any) {
        loi.push(`${e.message}\n--- câu lệnh ---\n${day}\n`);
      }
    }
    expect(loi).toEqual([]);
  });

  it('câu lệnh có OUTPUT đặt đúng vị trí theo tài liệu SQL Server', () => {
    const cauOutput = captured.filter((c) => /\bOUTPUT\b/i.test(c.sql));
    expect(cauOutput.length).toBeGreaterThan(0);

    for (const { sql } of cauOutput) {
      const phang = sql.replace(/\s+/g, ' ').trim();
      if (/^INSERT/i.test(phang)) {
        // INSERT INTO t (cột…) OUTPUT … VALUES (…)
        expect(phang).toMatch(/^INSERT INTO \w+ \(.+\) OUTPUT INSERTED\.\w+ VALUES \(/i);
      } else {
        // UPDATE t SET … OUTPUT … WHERE …
        expect(phang).toMatch(/^UPDATE \w+ SET .+ OUTPUT INSERTED\.\w+ WHERE /i);
      }
    }
  });

  it('không còn tham số nào bị bỏ sót (mọi :name đều được truyền)', () => {
    const thieu: string[] = [];
    for (const { sql, replacements } of captured) {
      const names = [...sql.matchAll(/:(\w+)/g)].map((m) => m[1]);
      for (const n of new Set(names)) {
        if (!(n in replacements)) thieu.push(`${n} — trong: ${sql.slice(0, 70).trim()}…`);
      }
    }
    expect(thieu).toEqual([]);
  });

  it('câu lệnh phân trang nào cũng có ORDER BY (SQL Server bắt buộc với OFFSET)', () => {
    for (const { sql } of captured) {
      if (/OFFSET/i.test(sql)) expect(sql).toMatch(/ORDER\s+BY/i);
    }
  });
});
