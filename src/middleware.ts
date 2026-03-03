import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/config';

const PUBLIC_FILE = /\.(.*)$/;
const MAYBE_LOCALE = /^[a-z]{2}(-[a-z]{2})?$/i;

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const bypassed =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    PUBLIC_FILE.test(pathname);

  let response: NextResponse;

  if (bypassed) {
    response = NextResponse.next();
  } else {
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0];

    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = `/${DEFAULT_LOCALE}`;
      response = NextResponse.redirect(url);
    } else if (!firstSegment || !isSupportedLocale(firstSegment)) {
      const url = request.nextUrl.clone();

      if (firstSegment && MAYBE_LOCALE.test(firstSegment)) {
        const remaining = segments.slice(1).join('/');
        url.pathname = remaining ? `/${DEFAULT_LOCALE}/${remaining}` : `/${DEFAULT_LOCALE}`;
      } else {
        url.pathname = `/${DEFAULT_LOCALE}${pathname}`;
      }

      url.search = search;
      response = NextResponse.redirect(url);
    } else {
      response = NextResponse.next();
    }
  }

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and api routes
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)',
  ],
};
