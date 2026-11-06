/** Money is integer cents everywhere (spec §5.3). Small API costs use millicents (1/1000 cent). */
export type Cents = number;

export function assertCents(n: number, label = 'amount'): Cents {
  if (!Number.isInteger(n)) throw new Error(`${label} must be integer cents, got ${n}`);
  return n;
}

export function formatUsd(cents: Cents, opts: { showZeroCents?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = rem === 0 && !opts.showZeroCents ? `$${dollars.toLocaleString('en-US')}` : `$${dollars.toLocaleString('en-US')}.${String(rem).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

export function parseUsdToCents(input: string): Cents {
  const s = input.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Invalid USD amount');
  const [d, c = ''] = s.split('.');
  return Number(d) * 100 + Number(c.padEnd(2, '0'));
}

/**
 * Stripe US online card fee (spec §0.5 / §9.3): percentage (basis points) + fixed cents,
 * rounded half-up to the cent as Stripe does per charge.
 */
export function stripeFeeCents(amountCents: Cents, percentBps = 290, fixedCents = 30): Cents {
  assertCents(amountCents);
  if (amountCents <= 0) return 0;
  return Math.round((amountCents * percentBps) / 10_000) + fixedCents;
}

export const millicentsToCents = (m: number): number => m / 1000;
export const centsToMillicents = (c: number): number => Math.round(c * 1000);
