/**
 * Transactional + marketing email templates (spec §15). Table-based, inline CSS, dark-mode safe.
 * Variables use {{name}}; values are HTML-escaped. Marketing mail must include postal address + unsubscribe (enforced).
 */
export interface EmailTemplateDef {
  slug: string;
  name: string;
  kind: 'TRANSACTIONAL' | 'MARKETING';
  subject: string;
  heading: string;
  body: string; // paragraphs separated by blank lines; may contain {{vars}}
  cta?: { label: string; url: string };
}

export const TEMPLATES: EmailTemplateDef[] = [
  { slug: 'welcome', name: 'Welcome', kind: 'TRANSACTIONAL', subject: 'Welcome to ROI, {{name}}', heading: 'Welcome to ROI', body: 'Your workspace for {{businessName}} is ready.\n\nFrom your dashboard you can order products, follow every job live and download your files.', cta: { label: 'Open your dashboard', url: '{{appUrl}}/dashboard' } },
  { slug: 'verify-email', name: 'Verify email', kind: 'TRANSACTIONAL', subject: 'Confirm your email for ROI', heading: 'Confirm your email', body: 'Click the button to confirm {{email}}. The link expires in 24 hours.\n\nIf you did not create an ROI account, ignore this email.', cta: { label: 'Confirm email', url: '{{link}}' } },
  { slug: 'password-reset', name: 'Password reset', kind: 'TRANSACTIONAL', subject: 'Reset your ROI password', heading: 'Reset your password', body: 'Someone asked to reset the password for {{email}}. The link expires in 30 minutes and works once.\n\nIf it was not you, ignore this email — your password stays the same.', cta: { label: 'Choose a new password', url: '{{link}}' } },
  { slug: 'order-confirmation', name: 'Order confirmation', kind: 'TRANSACTIONAL', subject: 'Order {{orderNumber}} confirmed', heading: 'Thank you — your order is confirmed', body: 'Order {{orderNumber}} for {{total}} is paid.\n\nWe have started working on it. You can follow progress live in your dashboard.', cta: { label: 'Track your order', url: '{{appUrl}}/dashboard/orders' } },
  { slug: 'processing-started', name: 'Processing started', kind: 'TRANSACTIONAL', subject: 'We are building your {{product}}', heading: 'Your {{product}} is in production', body: 'Our system has started on your {{product}}. Most jobs finish in a few minutes.' },
  { slug: 'deliverable-ready', name: 'Deliverable ready', kind: 'TRANSACTIONAL', subject: 'Your {{product}} is ready', heading: 'Your files are ready', body: 'Your {{product}} files passed our quality checks and are ready to download.\n\n{{fileList}}\n\nDownload links are private to your account.', cta: { label: 'Download your files', url: '{{link}}' } },
  { slug: 'failure-notice', name: 'Failure notice', kind: 'TRANSACTIONAL', subject: 'An issue with your {{product}}', heading: 'We hit a problem', body: 'Processing of your {{product}} did not pass our quality checks. A manager is reviewing it now.\n\n{{refundNote}}' },
  { slug: 'refund', name: 'Refund issued', kind: 'TRANSACTIONAL', subject: 'Refund of {{amount}} issued', heading: 'Your refund is on its way', body: 'We refunded {{amount}} for order {{orderNumber}}. Banks usually show it within 5–10 business days.' },
  { slug: 'subscription-confirmation', name: 'Subscription confirmation', kind: 'TRANSACTIONAL', subject: 'Your {{product}} subscription is active', heading: 'Subscription active', body: '{{product}} is active at {{price}}. Your next renewal is {{renewalDate}}.\n\nManage or cancel anytime from Billing.' },
  { slug: 'renewal-reminder', name: 'Renewal reminder', kind: 'TRANSACTIONAL', subject: 'Upcoming renewal on {{renewalDate}}', heading: 'Upcoming renewal', body: '{{product}} renews on {{renewalDate}} for {{price}}.' },
  { slug: 'payment-failed', name: 'Payment failed', kind: 'TRANSACTIONAL', subject: 'Action needed: payment failed', heading: 'We could not process your payment', body: 'Your payment for {{product}} failed. Please update your payment method within {{graceDays}} days to keep your service running.', cta: { label: 'Update payment method', url: '{{appUrl}}/dashboard/billing' } },
  { slug: 'website-live', name: 'Website live', kind: 'TRANSACTIONAL', subject: '{{domain}} is live', heading: 'Your website is live', body: '{{domain}} is published with SSL. Leads from your contact form arrive in your ROI inbox and by email.', cta: { label: 'Visit your site', url: 'https://{{domain}}' } },
  { slug: 'domain-notice', name: 'Domain notice', kind: 'TRANSACTIONAL', subject: 'About your domain {{domain}}', heading: 'Domain update', body: '{{message}}' },
  { slug: 'expiry-alert', name: 'SSL/domain expiry', kind: 'TRANSACTIONAL', subject: '{{what}} expires in {{days}} days', heading: 'Expiry alert', body: '{{what}} for {{domain}} expires on {{date}}. {{action}}' },
  { slug: 'social-published', name: 'Social post published', kind: 'TRANSACTIONAL', subject: 'Posted to {{platform}} at {{time}}', heading: 'New post published', body: 'ROI published your post to {{platform}} at {{time}}. Engagement will appear in your command center as the platform reports it.', cta: { label: 'Open command center', url: '{{appUrl}}/dashboard/social' } },
  { slug: 'social-failed', name: 'Social post failed', kind: 'TRANSACTIONAL', subject: 'A {{platform}} post could not be published', heading: 'Post not published', body: 'Reason: {{reason}}. ROI will retry automatically where possible.' },
  { slug: 'report-ready', name: 'Report ready', kind: 'TRANSACTIONAL', subject: 'Your {{report}} is ready', heading: '{{report}} ready', body: 'Your {{report}} for {{period}} is ready in your dashboard.', cta: { label: 'Read the report', url: '{{link}}' } },
  { slug: 'ticket-update', name: 'Ticket update', kind: 'TRANSACTIONAL', subject: 'Ticket #{{number}}: {{subject}}', heading: 'Support ticket updated', body: '{{message}}', cta: { label: 'View ticket', url: '{{appUrl}}/dashboard/support' } },
  { slug: 'ai-audit-ready', name: 'AI Visibility audit ready', kind: 'TRANSACTIONAL', subject: '{{businessName}} scored {{score}}/100 for AI visibility', heading: 'Your AI Visibility report', body: 'We checked how well AI assistants can understand {{businessName}}. Your score is {{score}}/100.\n\nThe report lists the fixes that matter most first.', cta: { label: 'See your report', url: '{{link}}' } },
  { slug: 'admin-alert', name: 'Admin alert', kind: 'TRANSACTIONAL', subject: '[ROI alert] {{title}}', heading: '{{title}}', body: '{{message}}' },
  { slug: 'newsletter', name: 'Newsletter', kind: 'MARKETING', subject: '{{subject}}', heading: '{{heading}}', body: '{{body}}' },
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fill = (s: string, v: Record<string, string>, escape: boolean) =>
  s.replace(/\{\{(\w+)\}\}/g, (_, k) => (v[k] === undefined ? '' : escape ? esc(v[k]) : v[k]));

export interface RenderOptions {
  unsubscribeUrl?: string;
  postalAddress?: string;
}

export function renderEmail(slug: string, vars: Record<string, string>, opts: RenderOptions = {}) {
  const t = TEMPLATES.find((x) => x.slug === slug);
  if (!t) throw new Error(`Unknown email template ${slug}`);
  if (t.kind === 'MARKETING' && (!opts.unsubscribeUrl || !opts.postalAddress)) {
    throw new Error('Marketing email requires unsubscribeUrl and postalAddress (spec §15)');
  }
  const v = { appUrl: process.env.APP_URL ?? 'https://roictllc.com', ...vars };
  const subject = fill(t.subject, v, false);
  const heading = fill(t.heading, v, true);
  const paragraphs = fill(t.body, v, true).split(/\n\n+/);
  const cta = t.cta ? { label: fill(t.cta.label, v, true), url: fill(t.cta.url, v, false) } : undefined;
  const footer = [
    'ROI LLC · Your Investment. Our Intelligence. Measurable Growth.',
    opts.postalAddress ? esc(opts.postalAddress) : '',
    opts.unsubscribeUrl ? `<a href="${esc(opts.unsubscribeUrl)}" style="color:#9AA8CC">Unsubscribe</a>` : '',
  ].filter(Boolean).join('<br>');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#04050D">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04050D"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0B1024;border:1px solid #233056;border-radius:16px">
<tr><td style="padding:28px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#00E5FF;letter-spacing:1px">ROI</td></tr>
<tr><td style="padding:16px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;color:#F2F6FF;font-weight:bold">${heading}</td></tr>
${paragraphs.map((p) => `<tr><td style="padding:12px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#C9D3EE">${p.replace(/\n/g, '<br>')}</td></tr>`).join('\n')}
${cta ? `<tr><td style="padding:24px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:#7B3FFF"><a href="${esc(cta.url)}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px">${cta.label}</a></td></tr></table></td></tr>` : ''}
<tr><td style="padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9AA8CC">${footer}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [heading, '', ...paragraphs.map((p) => p.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")), cta ? `\n${cta.label}: ${cta.url}` : '', '', 'ROI LLC', opts.postalAddress ?? '', opts.unsubscribeUrl ? `Unsubscribe: ${opts.unsubscribeUrl}` : ''].join('\n');
  return { subject, html, text, kind: t.kind };
}
