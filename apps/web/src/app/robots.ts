import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/seo';

/** Explicit AI-crawler rules (spec §7.1): public marketing content allowed, private areas disallowed. */
const PRIVATE = ['/dashboard', '/admin', '/affiliate', '/account', '/api/', '/checkout', '/ai-visibility/report/', '/login', '/register', '/reset-password', '/verify-email'];
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bingbot'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE }, ...AI_BOTS.map((ua) => ({ userAgent: ua, allow: '/', disallow: PRIVATE }))],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
