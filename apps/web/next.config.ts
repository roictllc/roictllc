import path from 'node:path';
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

// ROI's own security headers apply only to ROI hosts; customer domains served by the ROI host send their own
// (a customer's site must never inherit ROI's HSTS includeSubDomains/preload).
const appHostname = (() => {
  try {
    return new URL(process.env.APP_URL || 'http://localhost').hostname;
  } catch {
    return 'localhost';
  }
})();
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const APP_HOSTS = `(${[appHostname, `www.${appHostname}`, 'localhost', '127.0.0.1', ...[process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean) as string[]].map(reEsc).join('|')}|.*\\.vercel\\.app)`;

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  // Customer sites use directory URLs (/services/x/); the app must not redirect them away from their canonical form.
  skipTrailingSlashRedirect: true,
  reactStrictMode: true,
  transpilePackages: [
    '@roi/database', '@roi/shared-utils', '@roi/shared-types', '@roi/validation', '@roi/product-engine', '@roi/integrations',
    '@roi/email-templates', '@roi/seo-engine', '@roi/assistant', '@roi/site-generator', '@roi/logo-engine', '@roi/design-tokens',
  ],
  serverExternalPackages: ['@node-rs/argon2', 'pg', 'sharp', '@resvg/resvg-js', '@napi-rs/canvas', 'archiver'],
  typescript: { ignoreBuildErrors: false },
  images: { formats: ['image/avif', 'image/webp'] },
  async headers() {
    return [
      { source: '/((?!site-preview/|site-host/).*)', has: [{ type: 'host', value: APP_HOSTS }], headers: securityHeaders },
      // Customer-site previews are framed by the dashboard (same origin only); live customer sites send their own headers.
      { source: '/site-preview/:path*', headers: [...securityHeaders.filter((h) => h.key !== 'X-Frame-Options'), { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/(dashboard|admin|affiliate)/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default config;
