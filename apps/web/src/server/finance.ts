import 'server-only';
import { db } from './db';

/**
 * Finance math (spec §18), all integer cents, derived from the ledger:
 * gross = revenue − refunds − direct production costs − payment fees − affiliate commissions − domain/API costs
 * net   = gross − operating expenses (hosting, software, advertising, support).
 * Ledger sign convention: REVENUE and TAX positive; REFUND, FEE, EXPENSE, COMMISSION, PAYOUT negative.
 */
const DIRECT = new Set(['DOMAINS', 'SOCIAL_API', 'AI_COMPUTE', 'STORAGE', 'EMAIL', 'AFFILIATE']);

export async function financeSummary(days: number) {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db().financialTransaction.groupBy({ by: ['type', 'category'], where: { occurredAt: { gte: since } }, _sum: { amountCents: true } });
  const sum = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).reduce((s, r) => s + (r._sum.amountCents ?? 0), 0);
  const revenue = sum((r) => r.type === 'REVENUE');
  const refunds = -sum((r) => r.type === 'REFUND');
  const fees = -sum((r) => r.type === 'FEE');
  const commissions = -sum((r) => r.type === 'COMMISSION');
  const tax = sum((r) => r.type === 'TAX');
  const directCosts = -sum((r) => r.type === 'EXPENSE' && !!r.category && DIRECT.has(r.category));
  const opex = -sum((r) => r.type === 'EXPENSE' && (!r.category || !DIRECT.has(r.category)));
  const grossProfit = revenue - refunds - fees - commissions - directCosts;
  const netProfit = grossProfit - opex;
  const ledgerNet = sum((r) => r.type !== 'TAX' && r.type !== 'PAYOUT') + opex; // everything except tax/payouts, before opex
  const subs = await db().subscription.findMany({ where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, include: { price: true } });
  const mrr = subs.reduce((s, x) => s + (x.price.interval === 'MONTH' ? x.price.amountCents : x.price.interval === 'YEAR' ? Math.round(x.price.amountCents / 12) : 0), 0);
  const byProduct = await db().$queryRaw<Array<{ name: string; cents: number; orders: number }>>`
    SELECT p.name, COALESCE(SUM(t."amountCents"),0)::int AS cents, COUNT(DISTINCT t."orderId")::int AS orders
    FROM financial_transactions t JOIN products p ON p.id = t."productId"
    WHERE t.type = 'REVENUE' AND t."occurredAt" >= ${since}
    GROUP BY p.name ORDER BY cents DESC`;
  return { revenue, refunds, fees, commissions, tax, directCosts, opex, grossProfit, netProfit, mrr, byProduct, ledgerNet, reconciled: ledgerNet === revenue - refunds - fees - commissions - directCosts };
}
