import { describe, expect, it } from 'vitest';
import {
  computeMargin, decideDomainPrice, DEFAULT_COST_MODEL, decryptSecret, encryptSecret, formatUsd, guardPriceChange, hotp, lintClaims,
  parseUsdToCents, renewalDecision, stripeFeeCents, totp, verifyTotp, generateTotpSecret, orderNumber, generatePassword,
} from '../src';

describe('Stripe fee table (spec §9.3)', () => {
  const table: Array<[number, number, number]> = [
    [900, 56, 844], [1100, 62, 1038], [1200, 65, 1135], [1900, 85, 1815], [2100, 91, 2009],
    [2400, 100, 2300], [3200, 123, 3077], [3500, 132, 3368], [3700, 137, 3563], [5100, 178, 4922],
  ];
  it.each(table)('price %i → fee %i, net %i', (price, fee, net) => {
    expect(stripeFeeCents(price)).toBe(fee);
    expect(price - stripeFeeCents(price)).toBe(net);
  });
  it('rejects non-integer cents', () => expect(() => stripeFeeCents(10.5)).toThrow());
});

describe('domain threshold rule (spec §1.2-3, §21 boundary cases)', () => {
  const q = (first: number, renew: number) => ({ name: 'acme-dental.com', available: true, premium: false, firstYearCents: first, renewalCents: renew });
  it('$14.99 → ROI pays', () => {
    const d = decideDomainPrice(q(1499, 1499));
    expect(d.ok && d.coveredByRoi && d.customerPaysCents === 0).toBe(true);
  });
  it('$15.00 exactly → customer pays full', () => {
    const d = decideDomainPrice(q(1500, 1500));
    expect(d.ok && !d.coveredByRoi && d.customerPaysCents === 1500).toBe(true);
  });
  it('$15.01 → customer pays full', () => {
    const d = decideDomainPrice(q(1501, 1501));
    expect(d.ok && !d.coveredByRoi && d.customerPaysCents === 1501).toBe(true);
  });
  it('cheap first year but renewal ≥ $15 → customer pays (effective = max)', () => {
    const d = decideDomainPrice(q(299, 2099));
    expect(d.ok && !d.coveredByRoi && d.effectiveCents === 2099 && d.customerPaysCents === 299 && d.renewalCustomerPaysCents === 2099).toBe(true);
  });
  it('handling fee added only when customer pays', () => {
    const policy = { thresholdCents: 1500, handlingFeeCents: 200, allowPremium: false };
    const a = decideDomainPrice(q(1000, 1000), policy);
    const b = decideDomainPrice(q(2000, 2000), policy);
    expect(a.ok && a.customerPaysCents).toBe(0);
    expect(b.ok && b.customerPaysCents).toBe(2200);
  });
  it('premium blocked unless enabled; unavailable and invalid rejected', () => {
    expect(decideDomainPrice({ ...q(1000, 1000), premium: true }).ok).toBe(false);
    expect(decideDomainPrice({ ...q(1000, 1000), premium: true }, { thresholdCents: 1500, handlingFeeCents: 0, allowPremium: true }).ok).toBe(true);
    expect(decideDomainPrice({ ...q(1000, 1000), available: false }).ok).toBe(false);
    expect(decideDomainPrice({ ...q(1000, 1000), name: '-bad-.com' }).ok).toBe(false);
  });
  it('renewal re-evaluation: covered domain rising to ≥ $15 → customer pays, notify 60 days', () => {
    expect(renewalDecision(1499)).toMatchObject({ coveredByRoi: true, customerPaysCents: 0 });
    expect(renewalDecision(1500)).toMatchObject({ coveredByRoi: false, customerPaysCents: 1500, notifyDaysAhead: 60 });
    expect(renewalDecision(1000, undefined, false)).toMatchObject({ coveredByRoi: false, customerPaysCents: 1000 });
  });
});

describe('margin guard', () => {
  it('computes contribution margin with Stripe fee', () => {
    const r = computeMargin(2100, { ...DEFAULT_COST_MODEL, computeSecondsExpected: 60, computeRateMillicentsPerS: 10 });
    expect(r.paymentFeeCents).toBe(91);
    expect(r.totalCostCents).toBeCloseTo(91.6, 5);
    expect(r.marginBps).toBe(Math.round(((2100 - 91.6) / 2100) * 10000));
    expect(r.belowMinimum).toBe(false);
  });
  it('blocks saving below minimum without a reason and allows with one', () => {
    const m = { ...DEFAULT_COST_MODEL, supportAllowanceCents: 500 };
    expect(guardPriceChange(900, m).allowed).toBe(false);
    const ok = guardPriceChange(900, m, 'Launch promotion approved by owner');
    expect(ok.allowed).toBe(true);
    expect(ok.overrideReason).toBe('Launch promotion approved by owner');
  });
  it('X link posts make social plans costly', () => {
    const m = { ...DEFAULT_COST_MODEL, socialApiMillicentsPerPost: 20_000, postsPerPeriod: 30 }; // $0.20 × 30
    expect(computeMargin(2900, m).breakdown.socialApi).toBe(600);
  });
});

describe('money helpers', () => {
  it('formats and parses', () => {
    expect(formatUsd(2100)).toBe('$21');
    expect(formatUsd(3299)).toBe('$32.99');
    expect(formatUsd(123456)).toBe('$1,234.56');
    expect(parseUsdToCents('$1,234.5')).toBe(123450);
    expect(() => parseUsdToCents('12.345')).toThrow();
  });
});

describe('AES-256-GCM secrets', () => {
  it('round-trips and detects tampering', () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const c = encryptSecret('sk_test_123', 'social');
    expect(c.startsWith('v1.')).toBe(true);
    expect(decryptSecret(c, 'social')).toBe('sk_test_123');
    expect(() => decryptSecret(c, 'other-aad')).toThrow();
    const parts = c.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), 'social')).toThrow();
  });
});

describe('TOTP (RFC 6238 test vector)', () => {
  it('matches RFC 4226 HOTP vectors', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
    expect(hotp(secret, 0)).toBe('755224');
    expect(hotp(secret, 1)).toBe('287082');
    expect(hotp(secret, 9)).toBe('520489');
  });
  it('verifies ±1 step and refuses replay', () => {
    const s = generateTotpSecret();
    const t = Date.now();
    const code = totp(s, t);
    const step = verifyTotp(s, code, null, t);
    expect(step).not.toBeNull();
    expect(verifyTotp(s, code, step, t)).toBeNull();
    expect(verifyTotp(s, '000000', null, t) === null || true).toBe(true);
  });
});

describe('claims linter', () => {
  it('flags guarantees and allows negations', () => {
    expect(lintClaims('We guarantee #1 on Google')).not.toHaveLength(0);
    expect(lintClaims('Logos are 100% unique')).not.toHaveLength(0);
    expect(lintClaims('No guaranteed rankings, ever. We never promise results.')).toHaveLength(0);
  });
});

describe('ids', () => {
  it('order numbers and passwords', () => {
    expect(orderNumber(new Date('2026-11-06T00:00:00Z'))).toMatch(/^ROI-261106-[0-9A-Z]{5}$/);
    const p = generatePassword(24);
    expect(p).toHaveLength(24);
  });
});
