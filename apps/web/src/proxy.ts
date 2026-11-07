import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge of the app (Next 16 "proxy", formerly middleware): per-request CSP nonce (strict CSP, spec §6),
 * CSRF double-submit cookie bootstrap, request IDs, and a cheap auth redirect for private areas
 * (real authorization happens in the service layer).
 */
const PRIVATE = /^\/(dashboard|admin|affiliate|account)(\/|$)/;

function b64(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function isAppHost(host: string) {
  const app = (() => {
    try {
      return new URL(process.env.APP_URL || 'http://localhost').hostname.toLowerCase();
    } catch {
      return 'localhost';
    }
  })();
  const vercel = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean).map((h) => h!.toLowerCase());
  return host === app || host === `www.${app}` || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app') || vercel.includes(host) || (process.env.ALLOWED_ORIGINS ?? '').split(',').map((h) => h.trim().replace(/^https?:\/\//, '')).includes(host);
}

export function proxy(request: NextRequest) {
  const https = (process.env.APP_URL || (process.env.VERCEL_URL ? 'https://' : '')).startsWith('https://');
  const sessionCookie = https ? '__Host-roi_session' : 'roi_session';
  const csrfCookie = https ? '__Host-roi_csrf' : 'roi_csrf';
  const { pathname, search } = request.nextUrl;

  // Customer websites on their own domains (ROI multi-tenant host, spec Product 5): any Host that is not the app is
  // served from the site's live bundle by /site-host. The app's CSP/cookies do not apply there.
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  if (host && !isAppHost(host) && !pathname.startsWith('/_next/')) {
    const url = request.nextUrl.clone();
    url.pathname = `/site-host/${host}${pathname}`;
    return NextResponse.rewrite(url);
  }
  if (pathname.startsWith('/site-host/')) return new NextResponse('Not found', { status: 404 });

  if (PRIVATE.test(pathname) && !pathname.startsWith('/account/reset') && !request.cookies.get(sessionCookie)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const nonce = b64(crypto.getRandomValues(new Uint8Array(16)));
  const dev = process.env.NODE_ENV === 'development';
  const turnstile = 'https://challenges.cloudflare.com';
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${turnstile}${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' blob: data: https://assets.roictllc.com`,
    `font-src 'self'`,
    `connect-src 'self' https://*.r2.cloudflarestorage.com${dev ? ' ws:' : ''}`,
    `frame-src 'self' ${turnstile} https://checkout.stripe.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://checkout.stripe.com https://billing.stripe.com`,
    pathname.startsWith('/site-preview/') ? `frame-ancestors 'self'` : `frame-ancestors 'none'`,
    `manifest-src 'self'`,
    https ? 'upgrade-insecure-requests' : '',
  ].filter(Boolean).join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-pathname', pathname);
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  requestHeaders.set('x-request-id', requestId);

  let csrf = request.cookies.get(csrfCookie)?.value;
  const mintCsrf = !csrf;
  if (!csrf) {
    csrf = b64(crypto.getRandomValues(new Uint8Array(24))).replace(/[+/=]/g, '');
    requestHeaders.set('x-csrf-bootstrap', csrf);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-request-id', requestId);
  if (PRIVATE.test(pathname) || process.env.PREVIEW_NOINDEX === '1') response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (mintCsrf) response.cookies.set(csrfCookie, csrf, { httpOnly: true, secure: https, sameSite: 'lax', path: '/' });
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|fonts/).*)', // robots/sitemap/llms included: customer domains serve their own
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
