import { CATALOG } from '../../product-engine/src/catalog';
import { formatUsd } from '../../shared-utils/src/money';

/** Builds the public knowledge base for the built-in assistant from the catalog and policies (no invented facts). */
export function ROI_KNOWLEDGE(): Array<{ title: string; url: string; content: string }> {
  const docs = CATALOG.map((p) => {
    const prices = p.plans
      .map((pl) => `${pl.name}: ${pl.amountCents === null ? (p.kind === 'QUOTE' ? 'custom quote' : 'priced per item') : pl.amountCents === 0 ? 'free' : formatUsd(pl.amountCents) + (pl.interval === 'MONTH' ? ' per month' : pl.interval === 'YEAR' ? ' per year' : ' one-time')}${pl.published === false ? ' (pricing being finalized)' : ''}`)
      .join('. ');
    return {
      title: p.name,
      url: `/products/${p.slug}`,
      content: [p.answerFirst, p.longDescription, `Pricing: ${prices}.`, p.honesty ?? '', ...p.faq.map((f) => `${f.q} ${f.a}`)].filter(Boolean).join('\n\n'),
    };
  });
  docs.push(
    {
      title: 'Refund policy', url: '/legal/refund-policy',
      content: 'Digital goods that were delivered and downloaded are final unless defective.\n\nIf an automated product (Animated GIF Logo, Logo Revival, Logo Generator) fails our quality checks and cannot be fixed within 24 hours, ROI refunds you in full automatically.\n\nSubscriptions can be refunded within the refund window if your website was never published. Domain registration fees are not refundable once the domain is registered.',
    },
    {
      title: 'Domains', url: '/products/landing-page-hosting',
      content: 'ROI pays for your domain while your website subscription is active when the domain’s yearly price — the higher of the first-year and renewal price — is under $15.00.\n\nIf the price is $15.00 or more, you pay the full price at registration and at every annual renewal. You are always the legal owner (registrant) of your domain.',
    },
    {
      title: 'Account and security', url: '/faq',
      content: 'You can reset your password from the sign-in page. Staff accounts use two-factor authentication.\n\nYou can export or delete your data from Settings → Privacy in your dashboard.',
    },
    {
      title: 'Contact', url: '/contact',
      content: 'Email roictllc@gmail.com or use the contact form at roictllc.com/contact. Signed-in customers can open a support ticket from the dashboard.',
    },
  );
  return docs;
}
