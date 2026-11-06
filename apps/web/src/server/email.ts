import 'server-only';
import { renderEmail } from '@roi/email-templates';
import { db } from './db';

/**
 * Email through Resend (spec §15). Without RESEND_API_KEY the message is NOT sent; it is logged with status
 * AWAITING_CONFIGURATION so nothing silently disappears. Suppressed addresses are never emailed.
 */
export async function sendEmail(to: string, template: string, vars: Record<string, string>, opts: { attachments?: Array<{ filename: string; content: string }>; unsubscribeUrl?: string } = {}) {
  const email = to.trim().toLowerCase();
  const suppressed = await db().emailSuppression.findUnique({ where: { email } });
  if (suppressed) {
    await db().notificationLog.create({ data: { channel: 'email', to: email, template, status: 'SUPPRESSED' } });
    return { ok: false, status: 'SUPPRESSED' as const };
  }
  const company = (await db().setting.findUnique({ where: { key: 'company' } }))?.value as { postalAddress?: string } | undefined;
  const rendered = renderEmail(template, vars, { unsubscribeUrl: opts.unsubscribeUrl, postalAddress: company?.postalAddress || undefined });
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await db().notificationLog.create({ data: { channel: 'email', to: email, template, status: 'AWAITING_CONFIGURATION', error: 'RESEND_API_KEY not set' } });
    return { ok: false, status: 'AWAITING_CONFIGURATION' as const };
  }
  const headers: Record<string, string> = {};
  if (rendered.kind === 'MARKETING' && opts.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${opts.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'ROI <hello@mail.roictllc.com>', to: [email], reply_to: process.env.EMAIL_REPLY_TO ?? 'roictllc@gmail.com',
        subject: rendered.subject, html: rendered.html, text: rendered.text, headers, attachments: opts.attachments,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    await db().notificationLog.create({ data: { channel: 'email', to: email, template, status: res.ok ? 'SENT' : 'FAILED', providerId: body.id, error: res.ok ? null : `HTTP ${res.status}` } });
    return { ok: res.ok, status: res.ok ? ('SENT' as const) : ('FAILED' as const) };
  } catch (e) {
    await db().notificationLog.create({ data: { channel: 'email', to: email, template, status: 'FAILED', error: (e as Error).name } });
    return { ok: false, status: 'FAILED' as const };
  }
}
