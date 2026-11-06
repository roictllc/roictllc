import { lintClaims } from '@roi/shared-utils';
import { db } from '@/server/db';
import { rateLimit } from '@/server/rate-limit';
import { requestMeta } from '@/server/request';
import { sendEmail } from '@/server/email';

/**
 * Contact form endpoint for ROI-generated customer websites (spec Product 5): Turnstile when configured,
 * per-IP and per-site rate limits, honeypot + simple spam scoring, lead saved to the inbox and emailed to the owner.
 * Cross-origin by design (customer domains); accepts only form posts and redirects only to the site's own hosts.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await db().website.findUnique({ where: { id }, include: { workspace: { include: { owner: true } }, domains: true } });
  if (!site || site.status === 'SUSPENDED' || site.archivedAt) return new Response('Not found', { status: 404 });
  const { ip } = await requestMeta();
  const [byIp, bySite] = await Promise.all([rateLimit(`lead:ip:${ip}`, 5, 3600), rateLimit(`lead:site:${id}`, 60, 3600)]);
  if (!byIp.ok || !bySite.ok) return new Response('Too many messages — please call instead.', { status: 429 });
  const form = await req.formData().catch(() => null);
  if (!form) return new Response('Bad request', { status: 400 });
  const field = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max);
  const name = field('name', 80);
  const email = field('email', 160);
  const phone = field('phone', 30);
  const message = field('message', 4000);
  const allowed = new Set([...site.domains.map((d) => d.name), site.liveUrl ? new URL(site.liveUrl).host : '', site.previewUrl ? new URL(site.previewUrl).host : ''].filter(Boolean));
  const redirect = field('redirect', 300);
  const safeRedirect = (() => {
    try {
      return redirect && allowed.has(new URL(redirect).host) ? redirect : null;
    } catch {
      return null;
    }
  })();
  if (field('website', 200)) return safeRedirect ? Response.redirect(safeRedirect, 303) : new Response('Thank you.', { status: 200 }); // honeypot
  if (!name || !message || (!email && !phone)) return new Response('Please include your name, a message, and an email or phone.', { status: 400 });
  if (process.env.TURNSTILE_SECRET_KEY) {
    const token = String(form.get('cf-turnstile-response') ?? '');
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token }) })
      .then((x) => x.json())
      .catch(() => ({ success: false }));
    if (!(r as { success?: boolean }).success) return new Response('Security check failed.', { status: 400 });
  }
  const links = (message.match(/https?:\/\//g) ?? []).length;
  const spamScore = Math.min(1, links * 0.3 + (/\b(viagra|casino|crypto|seo services|backlinks)\b/i.test(message) ? 0.6 : 0) + (lintClaims(message).length ? 0.1 : 0));
  await db().websiteLead.create({ data: { websiteId: id, name, email: email || null, phone: phone || null, message, ip, spamScore } });
  if (spamScore < 0.6) await sendEmail(site.workspace.owner.email, 'admin-alert', { title: `New lead from ${site.name}`, message: `${name}${email ? ` <${email}>` : ''}${phone ? ` · ${phone}` : ''}\n\n${message}` });
  return safeRedirect ? Response.redirect(safeRedirect, 303) : new Response('Thank you — your message was sent.', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
