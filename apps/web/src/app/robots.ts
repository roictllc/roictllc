import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/seo';

/** Explicit AI-crawler rules (spec §7.1): public marketing content allowed, private areas disallowed. */
/** Rendered per request so the preview flag set at runtime always applies. */
export const dynamic = 'force-dynamic';

const PRIVATE = ['/dashboard', '/admin', '/affiliate', '/account', '/api/', '/checkout', '/ai-visibility/report/', '/login', '/register', '/reset-password', '/verify-email'];
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bingbot'];

export default function robots(): MetadataRoute.Robots {
  if (process.env.PREVIEW_NOINDEX === '1') return { rules: [{ userAgent: '*', disallow: '/' }] }; // private preview host
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE }, ...AI_BOTS.map((ua) => ({ userAgent: ua, allow: '/', disallow: PRIVATE }))],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
