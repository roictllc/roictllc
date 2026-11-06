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

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    '@roi/database', '@roi/shared-utils', '@roi/shared-types', '@roi/validation', '@roi/product-engine', '@roi/integrations',
    '@roi/email-templates', '@roi/seo-engine', '@roi/assistant', '@roi/site-generator', '@roi/logo-engine', '@roi/design-tokens',
  ],
  serverExternalPackages: ['@node-rs/argon2', 'pg', 'sharp', '@resvg/resvg-js'],
  typescript: { ignoreBuildErrors: false },
  images: { formats: ['image/avif', 'image/webp'] },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/(dashboard|admin|affiliate)/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default config;
