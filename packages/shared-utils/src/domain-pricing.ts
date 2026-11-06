/**
 * Domain rule (spec §1.2-3, §14):
 *  effective = max(first-year, renewal).
 *  effective < threshold ($15.00 default)  → ROI pays registration and renewals while the qualifying subscription is active.
 *  effective ≥ threshold ($15.00 included) → customer pays the FULL price (+ optional handling fee), no partial credit,
 *                                            before registration and at every annual renewal.
 *  Premium/aftermarket and ICANN-restricted names are blocked unless the admin enables them.
 */
export interface DomainQuoteInput {
  name: string;
  available: boolean;
  firstYearCents: number;
  renewalCents: number;
  premium: boolean;
  restricted?: boolean;
}

export interface DomainPolicy {
  thresholdCents: number; // default 1500
  handlingFeeCents: number; // default 0
  allowPremium: boolean; // default false
}

export const DEFAULT_DOMAIN_POLICY: DomainPolicy = { thresholdCents: 1500, handlingFeeCents: 0, allowPremium: false };

export type DomainDecision =
  | { ok: false; reason: 'UNAVAILABLE' | 'PREMIUM_BLOCKED' | 'RESTRICTED' | 'INVALID_NAME'; message: string }
  | {
      ok: true;
      effectiveCents: number;
      coveredByRoi: boolean;
      customerPaysCents: number; // 0 when covered
      roiPaysCents: number; // registration cost ROI absorbs (0 when customer pays)
      renewalCustomerPaysCents: number;
      message: string;
    };

const DOMAIN_RE = /^(?=.{4,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{2,63})+$/;

export function decideDomainPrice(q: DomainQuoteInput, policy: DomainPolicy = DEFAULT_DOMAIN_POLICY): DomainDecision {
  const name = q.name.trim().toLowerCase();
  if (!DOMAIN_RE.test(name)) return { ok: false, reason: 'INVALID_NAME', message: 'That is not a valid domain name.' };
  if (!q.available) return { ok: false, reason: 'UNAVAILABLE', message: `${name} is not available.` };
  if (q.restricted) return { ok: false, reason: 'RESTRICTED', message: `${name} uses a restricted extension that needs manual review.` };
  if (q.premium && !policy.allowPremium) return { ok: false, reason: 'PREMIUM_BLOCKED', message: `${name} is a premium domain and is not offered.` };
  for (const v of [q.firstYearCents, q.renewalCents]) if (!Number.isInteger(v) || v < 0) throw new Error('Registrar prices must be integer cents');

  const effectiveCents = Math.max(q.firstYearCents, q.renewalCents);
  const coveredByRoi = effectiveCents < policy.thresholdCents;
  if (coveredByRoi) {
    return {
      ok: true, effectiveCents, coveredByRoi, customerPaysCents: 0, roiPaysCents: q.firstYearCents, renewalCustomerPaysCents: 0,
      message: `Included: ROI covers ${name} while your website subscription is active.`,
    };
  }
  const customerPaysCents = q.firstYearCents + policy.handlingFeeCents;
  return {
    ok: true, effectiveCents, coveredByRoi, customerPaysCents, roiPaysCents: 0,
    renewalCustomerPaysCents: q.renewalCents + policy.handlingFeeCents,
    message: `${name} costs $${(effectiveCents / 100).toFixed(2)}/year or more, so it is paid in full by you at registration and at each annual renewal.`,
  };
}

/** Renewal-time re-evaluation: a covered domain whose renewal price rose to ≥ threshold must be paid by the customer (notify 60 days ahead). */
export function renewalDecision(renewalCents: number, policy: DomainPolicy = DEFAULT_DOMAIN_POLICY, subscriptionActive = true) {
  if (!subscriptionActive) return { coveredByRoi: false, customerPaysCents: renewalCents + policy.handlingFeeCents, notifyDaysAhead: 30 };
  const covered = renewalCents < policy.thresholdCents;
  return { coveredByRoi: covered, customerPaysCents: covered ? 0 : renewalCents + policy.handlingFeeCents, notifyDaysAhead: covered ? 0 : 60 };
}
