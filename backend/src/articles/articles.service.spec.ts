import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ArticlesService, slugify, analyzeSeo } from './articles.service';

describe('ArticlesService', () => {
  let service: ArticlesService;

  const mockSequelize = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: 'SEQUELIZE', useValue: mockSequelize },
      ],
    }).compile();

    service = module.get<ArticlesService>(ArticlesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('slugify', () => {
    it('bo dau tieng Viet', () => {
      expect(slugify('Bảng giá vận chuyển 2026')).toBe('bang-gia-van-chuyen-2026');
    });

    it('doi chu d gach ngang', () => {
      expect(slugify('Đơn hàng đi Đà Nẵng')).toBe('don-hang-di-da-nang');
    });

    it('bo dau cau va gop dau gach thua', () => {
      expect(slugify('Giá ship?? Bao nhiêu -- vậy!')).toBe('gia-ship-bao-nhieu-vay');
    });

    it('khong de lai gach o dau/cuoi', () => {
      expect(slugify('  --- Tin tức ---  ')).toBe('tin-tuc');
    });
  });

  describe('analyzeSeo', () => {
    const goodArticle = {
      title: 'Bảng giá vận chuyển hàng đi Mỹ mới nhất năm 2026',
      slug: 'bang-gia-van-chuyen-hang-di-my-2026',
      focusKeyword: 'vận chuyển hàng đi Mỹ',
      metaTitle: 'Bảng giá vận chuyển hàng đi Mỹ mới nhất 2026',
      metaDescription:
        'Cập nhật bảng giá vận chuyển hàng đi Mỹ năm 2026 của Phúc Long Express: cước theo cân nặng, thời gian giao, các mặt hàng nhận và không nhận vận chuyển.',
      thumbnail: '/uploads/bang-gia.jpg',
      content:
        '<p>Dịch vụ vận chuyển hàng đi Mỹ của Phúc Long Express. </p><h2>Cước phí</h2>' +
        `<p>${'nội dung chi tiết '.repeat(400)}</p>` +
        '<img src="/a.jpg" alt="bảng giá" />',
    };

    it('bai lam day du dat diem cao', () => {
      const { score, checks } = analyzeSeo(goodArticle);
      expect(score).toBeGreaterThanOrEqual(90);
      expect(checks.every((c) => c.status !== 'error')).toBe(true);
    });

    it('bao loi khi thieu tieu de va mo ta SEO', () => {
      const { checks } = analyzeSeo({ title: '', content: '<p>ngắn</p>' });
      const byKey = Object.fromEntries(checks.map((c) => [c.key, c]));
      expect(byKey.metaTitle.status).toBe('error');
      expect(byKey.metaDescription.status).toBe('error');
    });

    it('canh bao khi bai qua ngan', () => {
      const { checks } = analyzeSeo({ ...goodArticle, content: '<p>chỉ vài từ thôi</p>' });
      const wordCount = checks.find((c) => c.key === 'wordCount');
      expect(wordCount?.status).toBe('error');
    });

    it('bat loi tu khoa khong co trong tieu de', () => {
      const { checks } = analyzeSeo({ ...goodArticle, focusKeyword: 'gửi hàng đi Nhật' });
      expect(checks.find((c) => c.key === 'kwInTitle')?.status).toBe('error');
    });

    it('bat anh thieu mo ta alt', () => {
      const { checks } = analyzeSeo({
        ...goodArticle,
        content: `${goodArticle.content}<img src="/b.jpg">`,
      });
      const imgAlt = checks.find((c) => c.key === 'imgAlt');
      expect(imgAlt?.status).toBe('error');
      expect(imgAlt?.message).toContain('1/2');
    });

    it('canh bao khi chua dat tu khoa chinh', () => {
      const { checks } = analyzeSeo({ ...goodArticle, focusKeyword: '' });
      expect(checks.find((c) => c.key === 'focusKeyword')?.status).toBe('warning');
    });
  });

  describe('create', () => {
    it('tu sinh slug tu tieu de khi de trong', async () => {
      mockSequelize.query
        .mockResolvedValueOnce([])                       // kiem tra slug trung -> khong trung
        .mockResolvedValueOnce([{ Id: 7 }])              // INSERT ... OUTPUT
        .mockResolvedValueOnce([{ Id: 7, Title: 'Tin mới', Slug: 'tin-moi' }]); // getById

      await service.create(
        { title: 'Tin mới', content: '<p>xin chào</p>' } as any,
        'nhanvien1',
      );

      const insertCall = mockSequelize.query.mock.calls[1];
      expect(insertCall[1].replacements.slug).toBe('tin-moi');
      expect(insertCall[1].replacements.createdBy).toBe('nhanvien1');
      // Khong bam dang thi phai la ban nhap
      expect(insertCall[1].replacements.published).toBe(0);
    });

    it('them hau to khi slug da ton tai', async () => {
      mockSequelize.query
        .mockResolvedValueOnce([{ Id: 1 }])   // 'tin-moi' da co
        .mockResolvedValueOnce([])            // 'tin-moi-2' con trong
        .mockResolvedValueOnce([{ Id: 8 }])
        .mockResolvedValueOnce([{ Id: 8 }]);

      await service.create({ title: 'Tin mới', content: '<p>x</p>' } as any, 'nv');

      expect(mockSequelize.query.mock.calls[2][1].replacements.slug).toBe('tin-moi-2');
    });

    it('lay tac gia tu nguoi dang nhap khi khong nhap tay', async () => {
      mockSequelize.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ Id: 9 }])
        .mockResolvedValueOnce([{ Id: 9 }]);

      await service.create({ title: 'A', content: 'B' } as any, 'quang');

      expect(mockSequelize.query.mock.calls[1][1].replacements.author).toBe('quang');
    });

    it('tu cat doan tom tat tu noi dung khi de trong', async () => {
      mockSequelize.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ Id: 10 }])
        .mockResolvedValueOnce([{ Id: 10 }]);

      await service.create(
        { title: 'A', content: '<p>Phúc Long Express nhận vận chuyển hàng đi Mỹ.</p>' } as any,
        'nv',
      );

      expect(mockSequelize.query.mock.calls[1][1].replacements.excerpt).toBe(
        'Phúc Long Express nhận vận chuyển hàng đi Mỹ.',
      );
    });
  });

  describe('getBySlug', () => {
    it('bao khong tim thay khi bai chua dang', async () => {
      mockSequelize.query.mockResolvedValueOnce([]);
      await expect(service.getBySlug('khong-co')).rejects.toThrow(NotFoundException);
    });

    it('dien san the SEO tu tieu de/tom tat khi de trong', async () => {
      mockSequelize.query
        .mockResolvedValueOnce([
          {
            Id: 3, Title: 'Tiêu đề bài', Slug: 'tieu-de-bai', Excerpt: 'Tóm tắt bài',
            Thumbnail: '/t.jpg', MetaTitle: null, MetaDescription: null,
            OgTitle: null, OgDescription: null, OgImage: null, CanonicalUrl: null, Noindex: 0,
          },
        ])
        .mockResolvedValueOnce([]); // tang luot xem

      const result = await service.getBySlug('tieu-de-bai');

      expect(result.seo.metaTitle).toBe('Tiêu đề bài');
      expect(result.seo.metaDescription).toBe('Tóm tắt bài');
      expect(result.seo.ogImage).toBe('/t.jpg');
      expect(result.seo.noindex).toBe(false);
    });
  });

  describe('update', () => {
    it('bao khong tim thay khi bai da bi xoa', async () => {
      mockSequelize.query.mockResolvedValueOnce([]);
      await expect(service.update(1, { title: 'x' } as any, 'nv')).rejects.toThrow(NotFoundException);
    });

    it('giu nguyen slug cu khi chi sua noi dung', async () => {
      mockSequelize.query
        .mockResolvedValueOnce([{ Id: 1, Title: 'Cũ', Slug: 'cu', Content: 'x', Published: 1 }])
        .mockResolvedValueOnce([])                 // UPDATE
        .mockResolvedValueOnce([{ Id: 1 }]);       // getById

      await service.update(1, { content: '<p>mới</p>' } as any, 'nv');

      expect(mockSequelize.query.mock.calls[1][1].replacements.slug).toBe('cu');
      expect(mockSequelize.query.mock.calls[1][1].replacements.hasTitle).toBe(0);
      expect(mockSequelize.query.mock.calls[1][1].replacements.hasContent).toBe(1);
    });

    it('doi slug khi nguoi viet sua duong dan', async () => {
      mockSequelize.query
        .mockResolvedValueOnce([{ Id: 1, Title: 'Cũ', Slug: 'cu', Content: 'x', Published: 0 }])
        .mockResolvedValueOnce([])                 // slug moi con trong
        .mockResolvedValueOnce([])                 // UPDATE
        .mockResolvedValueOnce([{ Id: 1 }]);

      await service.update(1, { slug: 'Đường dẫn mới' } as any, 'nv');

      expect(mockSequelize.query.mock.calls[2][1].replacements.slug).toBe('duong-dan-moi');
    });
  });

  describe('remove', () => {
    it('bao khong tim thay khi bai khong ton tai', async () => {
      mockSequelize.query.mockResolvedValueOnce([]);
      await expect(service.remove(99, 'nv')).rejects.toThrow(NotFoundException);
    });
  });
});
