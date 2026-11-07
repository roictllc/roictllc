import { storageFromEnv } from '@roi/product-engine/storage';
import { loadBundle, resolveSitePath } from '@roi/product-engine/websites';
import { contentType } from '@roi/site-generator/hosting';
import { db } from '@/server/db';
import { appUrl } from '@/server/env';

/**
 * ROI multi-tenant host (spec Product 5 fallback host): the proxy rewrites requests for a customer's verified domain
 * here. Serves the live version's static files with a strict site CSP. Billing rules: a site past its grace period
 * (or suspended) shows a placeholder; data is kept (spec "past_due → 7-day grace → suspended placeholder").
 */
const SITE_CSP = (api: string) => `default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'none'; connect-src 'none'; form-action ${api}; frame-ancestors 'self'; base-uri 'self'; object-src 'none'`;

const placeholder = (name: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${name.replace(/[<>&"]/g, '')}</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a"><main style="text-align:center;padding:24px"><h1 style="margin:0 0 8px">${name.replace(/[<>&"]/g, '')}</h1><p>This website is temporarily unavailable. Please check back soon.</p></main></body></html>`;

export async function GET(_: Request, { params }: { params: Promise<{ host: string; path?: string[] }> }) {
  const { host, path = [] } = await params;
  const domain = await db().domain.findUnique({ where: { name: host.toLowerCase() }, include: { website: { include: { deployments: { where: { status: 'LIVE' }, take: 1, include: { version: true } } } } } });
  const verified = !!(domain?.verification as { verifiedAt?: string } | null)?.verifiedAt || domain?.status === 'ACTIVE';
  const site = domain?.website;
  if (!domain || !verified || !site) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  const sub = site.subscriptionId ? await db().subscription.findUnique({ where: { id: site.subscriptionId } }) : null;
  const pastGrace = sub?.status === 'PAST_DUE' && sub.graceUntil && sub.graceUntil.getTime() < Date.now();
  const ended = !sub || ['CANCELED', 'UNPAID', 'SUSPENDED'].includes(sub.status) && (!sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() < Date.now());
  const live = site.deployments[0]?.version;
  if (site.status === 'SUSPENDED' || pastGrace || ended || !live) return new Response(placeholder(site.name), { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '3600', 'Cache-Control': 'no-store' } });
  const storage = storageFromEnv();
  if (!storage) return new Response('Storage awaiting configuration', { status: 503 });
  const bundle = await loadBundle(storage, live.bundleKey);
  const r = resolveSitePath(bundle.files, `/${path.join('/')}${path.length && !path.at(-1)!.includes('.') ? '/' : ''}`);
  if (!r.file) return new Response('Not found', { status: 404 });
  return new Response(bundle.files[r.file], {
    status: r.status,
    headers: { 'Content-Type': contentType(r.file), 'Cache-Control': r.file.endsWith('.html') ? 'public, max-age=60' : 'public, max-age=3600', 'Content-Security-Policy': SITE_CSP(new URL(appUrl()).origin), 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Strict-Transport-Security': 'max-age=31536000' },
  });
}
