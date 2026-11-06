import 'server-only';
import { checkIntegration, INTEGRATIONS } from '@roi/integrations';
import { db } from './db';

/** Runs live health checks and stores status (spec §0.2, §24A). Database is checked with SELECT 1. */
export async function refreshIntegrations() {
  const results = [];
  for (const def of INTEGRATIONS) {
    let status: 'AWAITING_CONFIGURATION' | 'CONNECTED' | 'ERROR';
    let detail: string;
    let missing: string[];
    if (def.key === 'database') {
      try {
        await db().$queryRaw`SELECT 1`;
        status = 'CONNECTED';
        detail = 'SELECT 1 OK';
      } catch {
        status = 'ERROR';
        detail = 'Database unreachable';
      }
      missing = [];
    } else {
      const r = await checkIntegration(def);
      status = r.status;
      detail = r.detail;
      missing = r.missing;
    }
    await db().integration.upsert({
      where: { key: def.key },
      update: { status, missingEnv: missing, lastCheckAt: new Date(), lastError: status === 'CONNECTED' ? null : detail },
      create: { key: def.key, name: def.name, requiredEnv: def.requiredEnv, missingEnv: missing, unlocks: def.unlocks, ownerStep: def.ownerStep, status, lastCheckAt: new Date(), lastError: status === 'CONNECTED' ? null : detail },
    });
    results.push({ key: def.key, status, detail });
  }
  // Keep the checkout flag consistent with Stripe's real status.
  const stripe = results.find((r) => r.key === 'stripe');
  if (stripe && stripe.status !== 'CONNECTED') await db().featureFlag.updateMany({ where: { key: 'checkout', visibility: 'LIVE' }, data: { visibility: 'HIDDEN' } });
  return results;
}
