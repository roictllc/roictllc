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

export function proxy(request: NextRequest) {
  const https = (process.env.APP_URL || (process.env.VERCEL_URL ? 'https://' : '')).startsWith('https://');
  const sessionCookie = https ? '__Host-roi_session' : 'roi_session';
  const csrfCookie = https ? '__Host-roi_csrf' : 'roi_csrf';
  const { pathname, search } = request.nextUrl;

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
    `frame-src ${turnstile} https://checkout.stripe.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://checkout.stripe.com https://billing.stripe.com`,
    `frame-ancestors 'none'`,
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
      source: '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|fonts/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
