import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Danh sách các route cần bảo mật
  const protectedRoutes = [
    '/tong-quan',
    '/dat-hang',
    '/danh-sach-don-hang',
    '/danh-sach-tracking',
    '/sua-tracking',
    '/thong-tin-lo-hang',
    '/chuyen-khoan',
    '/bao-cao-cong-no',
    '/hoi-dap',
    '/dot-hang-user',
    '/shipper-detail',
    '/thong-tin-dot-hang',
    '/thong-tin-ship-hang',
    '/sua-don-hang',
    '/yeu-cau-ship-hang-liet-ke',
  ];

  // Chỉ thực hiện kiểm tra nếu route nằm trong danh sách bảo vệ
  const isProtectedRoute = protectedRoutes.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  );

  if (isProtectedRoute) {
    const accessToken = request.cookies.get('accessToken')?.value;
    const authHeader = request.headers.get('authorization');

    if (!accessToken && !authHeader?.startsWith('Bearer ')) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

// FIX: Chỉ định chính xác các route cần chạy middleware
// Loại bỏ hoàn toàn các folder hệ thống của Next.js
export const config = {
  matcher: [
    '/tong-quan/:path*',
    '/dat-hang/:path*',
    '/danh-sach-don-hang/:path*',
    '/danh-sach-tracking/:path*',
    '/sua-tracking/:path*',
    '/thong-tin-lo-hang/:path*',
    '/chuyen-khoan/:path*',
    '/bao-cao-cong-no/:path*',
    '/hoi-dap/:path*',
    '/dot-hang-user/:path*',
    '/shipper-detail/:path*',
    '/thong-tin-dot-hang/:path*',
    '/thong-tin-ship-hang/:path*',
    '/sua-don-hang/:path*',
    '/yeu-cau-ship-hang-liet-ke/:path*',
  ],
};