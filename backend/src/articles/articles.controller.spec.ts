import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

describe('ArticlesController', () => {
  let controller: ArticlesController;
  let reflector: Reflector;

  const mockService = {
    getList: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    getById: jest.fn().mockResolvedValue({ Id: 1 }),
    create: jest.fn().mockResolvedValue({ Id: 1 }),
    update: jest.fn().mockResolvedValue({ Id: 1 }),
    remove: jest.fn().mockResolvedValue({ success: true }),
    preview: jest.fn().mockReturnValue({ slug: 'x', seo: { score: 0, checks: [] } }),
    getPublished: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 12 }),
    getBySlug: jest.fn().mockResolvedValue({ Id: 1 }),
    getRelated: jest.fn().mockResolvedValue([]),
    getSitemapEntries: jest.fn().mockResolvedValue([]),
  };

  /** Khách hàng đăng ký qua web không có dòng nào trong AspNetUserRoles */
  const customer = { user: { username: 'khach1', roles: [] } };
  const staff = { user: { username: 'nhanvien1', roles: ['admin'] } };
  /** Token cũ / lỗi đọc vai trò — phải bị từ chối, không được mở mặc định */
  const unknown = { user: { username: 'ai-do' } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [{ provide: ArticlesService, useValue: mockService }],
    }).compile();

    controller = module.get<ArticlesController>(ArticlesController);
    reflector = new Reflector();
  });

  afterEach(() => jest.clearAllMocks());

  describe('phân quyền soạn bài', () => {
    const adminCalls: [string, (req: any) => Promise<unknown>][] = [
      ['xem danh sách', (req) => controller.getList({} as any, req)],
      ['xem chi tiết', (req) => controller.getById(1, req)],
      ['tạo bài', (req) => controller.create({ title: 'a', content: 'b' } as any, req)],
      ['sửa bài', (req) => controller.update(1, {} as any, req)],
      ['xóa bài', (req) => controller.remove(1, req)],
      ['chấm điểm SEO', (req) => controller.seoPreview({ title: 'a', content: 'b' } as any, req)],
    ];

    it.each(adminCalls)('khách hàng KHÔNG được %s', async (_label, call) => {
      await expect(call(customer)).rejects.toThrow(ForbiddenException);
    });

    it.each(adminCalls)('token không rõ vai trò KHÔNG được %s', async (_label, call) => {
      await expect(call(unknown)).rejects.toThrow(ForbiddenException);
    });

    it.each(adminCalls)('nhân viên được %s', async (_label, call) => {
      await expect(call(staff)).resolves.toBeDefined();
    });

    it('ghi đúng người thao tác khi tạo bài', async () => {
      await controller.create({ title: 'a', content: 'b' } as any, staff);
      expect(mockService.create).toHaveBeenCalledWith(expect.anything(), 'nhanvien1');
    });
  });

  describe('đường dẫn công khai', () => {
    const publicHandlers = ['getPublished', 'getSitemap', 'getRelated', 'getBySlug'] as const;
    const guardedHandlers = ['getList', 'getById', 'create', 'update', 'remove', 'seoPreview'] as const;

    it.each(publicHandlers)('%s được đánh dấu @Public()', (name) => {
      const isPublic = reflector.get<boolean>(
        IS_PUBLIC_KEY,
        ArticlesController.prototype[name] as any,
      );
      expect(isPublic).toBe(true);
    });

    it.each(guardedHandlers)('%s KHÔNG được đánh dấu @Public()', (name) => {
      const isPublic = reflector.get<boolean>(
        IS_PUBLIC_KEY,
        ArticlesController.prototype[name] as any,
      );
      expect(isPublic).toBeFalsy();
    });

    it('đọc bài công khai không cần đăng nhập', async () => {
      await expect(controller.getBySlug('bai-viet')).resolves.toBeDefined();
      await expect(controller.getPublished({} as any)).resolves.toBeDefined();
    });
  });

  describe('thứ tự khai báo route', () => {
    // Nest khớp route theo thứ tự phương thức được khai báo trong class.
    // Thứ tự này dễ bị phá khi ai đó sắp xếp lại file, nên chốt lại bằng test.
    const declarationOrder = Object.getOwnPropertyNames(ArticlesController.prototype);
    const at = (name: string) => declarationOrder.indexOf(name);

    it('mọi phương thức đều có mặt', () => {
      for (const name of ['getPublished', 'getSitemap', 'getRelated', 'getBySlug', 'getById']) {
        expect(at(name)).toBeGreaterThan(-1);
      }
    });

    it('public/sitemap đứng trước public/:slug', () => {
      // Nếu ngược lại, /articles/public/sitemap sẽ bị hiểu là bài có slug "sitemap".
      expect(at('getSitemap')).toBeLessThan(at('getBySlug'));
    });

    it('public/:slug/related đứng trước public/:slug', () => {
      expect(at('getRelated')).toBeLessThan(at('getBySlug'));
    });

    it('các route public đứng trước route :id', () => {
      // ':id' bắt mọi đoạn đơn, nên nếu đứng trước thì /articles/public sẽ rơi vào nó.
      for (const name of ['getPublished', 'getSitemap', 'getRelated', 'getBySlug']) {
        expect(at(name)).toBeLessThan(at('getById'));
      }
    });

    it('đường dẫn khai báo đúng như mong đợi', () => {
      const path = (name: string) =>
        Reflect.getMetadata('path', (ArticlesController.prototype as any)[name]);
      expect(path('getPublished')).toBe('public');
      expect(path('getSitemap')).toBe('public/sitemap');
      expect(path('getRelated')).toBe('public/:slug/related');
      expect(path('getBySlug')).toBe('public/:slug');
      expect(path('getById')).toBe(':id');
    });
  });
});
