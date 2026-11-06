import { stripeFeeCents } from './money';

/** Cost model used by the margin guard (spec §9.3). All cents/millicents integers. */
export interface CostModel {
  feePercentBps: number;
  feeFixedCents: number;
  computeSecondsExpected: number;
  computeRateMillicentsPerS: number;
  storageMillicents: number;
  emailMillicents: number;
  domainCostCents: number;
  socialApiMillicentsPerPost: number;
  postsPerPeriod: number;
  supportAllowanceCents: number;
  refundAllowanceBps: number;
  minMarginBps: number;
}

export interface MarginResult {
  priceCents: number;
  paymentFeeCents: number;
  variableCostCents: number; // excludes payment fee
  totalCostCents: number;
  contributionCents: number;
  marginBps: number; // contribution / price, basis points
  minMarginBps: number;
  belowMinimum: boolean;
  breakdown: Record<string, number>;
}

export function computeMargin(priceCents: number, m: CostModel): MarginResult {
  if (!Number.isInteger(priceCents) || priceCents < 0) throw new Error('price must be non-negative integer cents');
  const paymentFeeCents = stripeFeeCents(priceCents, m.feePercentBps, m.feeFixedCents);
  const breakdown: Record<string, number> = {
    paymentFee: paymentFeeCents,
    compute: (m.computeSecondsExpected * m.computeRateMillicentsPerS) / 1000,
    storage: m.storageMillicents / 1000,
    email: m.emailMillicents / 1000,
    domain: m.domainCostCents,
    socialApi: (m.socialApiMillicentsPerPost * m.postsPerPeriod) / 1000,
    support: m.supportAllowanceCents,
    refundAllowance: (priceCents * m.refundAllowanceBps) / 10_000,
  };
  const variable = Object.entries(breakdown).filter(([k]) => k !== 'paymentFee').reduce((s, [, v]) => s + v, 0);
  const totalCostCents = Math.round((paymentFeeCents + variable) * 100) / 100;
  const contributionCents = Math.round((priceCents - totalCostCents) * 100) / 100;
  const marginBps = priceCents === 0 ? -10_000 : Math.round((contributionCents / priceCents) * 10_000);
  return {
    priceCents, paymentFeeCents, variableCostCents: Math.round(variable * 100) / 100, totalCostCents, contributionCents,
    marginBps, minMarginBps: m.minMarginBps, belowMinimum: marginBps < m.minMarginBps, breakdown,
  };
}

/** Saving a price below the minimum requires an override reason (≥ 10 chars), which is recorded. */
export function guardPriceChange(priceCents: number, m: CostModel, overrideReason?: string) {
  const r = computeMargin(priceCents, m);
  if (r.belowMinimum && (!overrideReason || overrideReason.trim().length < 10)) {
    return { allowed: false as const, result: r, error: `Margin ${(r.marginBps / 100).toFixed(1)}% is below the ${(m.minMarginBps / 100).toFixed(0)}% minimum. Enter an override reason to save.` };
  }
  return { allowed: true as const, result: r, overrideReason: r.belowMinimum ? overrideReason!.trim() : undefined };
}

export const DEFAULT_COST_MODEL: CostModel = {
  feePercentBps: 290, feeFixedCents: 30, computeSecondsExpected: 0, computeRateMillicentsPerS: 1, storageMillicents: 0, emailMillicents: 0,
  domainCostCents: 0, socialApiMillicentsPerPost: 0, postsPerPeriod: 0, supportAllowanceCents: 0, refundAllowanceBps: 0, minMarginBps: 4000,
};
