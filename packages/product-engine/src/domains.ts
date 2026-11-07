import type { PrismaClient } from '@roi/database';
import { registrarFromEnv, type RegistrantContact, type RegistrarProvider } from '../../integrations/src/registrar';
import { decideDomainPrice, DEFAULT_DOMAIN_POLICY, type DomainPolicy } from '../../shared-utils/src/domain-pricing';
import type { Handler } from './handlers';
import { log, step } from './queue';
import { sendEmailFromWorker } from './notify';
import { buildWebsiteVersion } from './websites';

/**
 * Domain registration (spec §14). Price rule: effective = max(first year, renewal); under $15 ROI pays (recorded as a
 * DOMAINS business expense), otherwise the customer pays the full price first. The customer is the registrant; ROI
 * manages DNS. The price is re-checked right before buying, so a price change never surprises either side.
 */
export async function domainPolicy(db: PrismaClient): Promise<DomainPolicy> {
  const s = await db.setting.findUnique({ where: { key: 'domain.policy' } });
  return { ...DEFAULT_DOMAIN_POLICY, ...((s?.value as Partial<DomainPolicy>) ?? {}) };
}

export function dnsRecordsFor(domain: string, target: { kind: 'roi-host'; ip?: string; host: string } | { kind: 'cloudflare-pages'; host: string }) {
  const apex = domain.split('.').length === 2;
  const recs: Array<{ type: 'A' | 'CNAME' | 'ALIAS'; name: string; content: string }> = [];
  if (target.kind === 'roi-host' && target.ip) recs.push({ type: 'A', name: '', content: target.ip });
  else recs.push({ type: 'ALIAS', name: '', content: target.host });
  if (apex) recs.push({ type: 'CNAME', name: 'www', content: target.host });
  return recs;
}

export const domainRegisterHandler: Handler = async (ctx) => {
  const p = ctx.payload as { domainId: string; contact: RegistrantContact };
  const registrar: RegistrarProvider | null = registrarFromEnv();
  if (!registrar) throw new Error('AWAITING_CONFIGURATION: registrar credentials missing');
  const d = await ctx.db.domain.findFirstOrThrow({ where: { id: p.domainId, workspaceId: ctx.workspaceId }, include: { website: true, workspace: { include: { owner: true } } } });
  if (d.status === 'ACTIVE') return { deliverables: 0, costMillicents: 0 };
  const policy = await domainPolicy(ctx.db);
  const quote = await step(ctx.db, ctx.jobId, 'requote', { domain: d.name }, () => registrar.search(d.name));
  const decision = decideDomainPrice(quote, policy);
  if (!decision.ok) throw new Error(`Cannot register ${d.name}: ${decision.message}`);
  if (decision.coveredByRoi !== d.coveredByRoi) {
    await ctx.db.domain.update({ where: { id: d.id }, data: { status: 'QUOTED' } });
    await sendEmailFromWorker(ctx.db, d.workspace.owner.email, 'domain-notice', { domain: d.name, message: 'The registry price changed before we could register it. Please search again to see the new price.' });
    throw new Error('Price category changed since the quote');
  }
  const dry = await step(ctx.db, ctx.jobId, 'dry-run', null, () => registrar.register(d.name, { costCents: quote.firstYearCents, idempotencyKey: `dry-${d.id}`, dryRun: true }));
  if (!dry.ok) throw new Error(`Registrar pre-flight failed: ${dry.message ?? 'unknown'}`);
  const reg = await step(ctx.db, ctx.jobId, 'register', { costCents: quote.firstYearCents }, () => registrar.register(d.name, { costCents: quote.firstYearCents, idempotencyKey: `reg-${d.id}` }));
  if (!reg.ok) throw new Error(`Registration failed: ${reg.message ?? 'unknown'}`);
  const contacts = await step(ctx.db, ctx.jobId, 'registrant', null, () => registrar.setContacts(d.name, p.contact));
  const target = process.env.ROI_SITE_HOST_IP ? { kind: 'roi-host' as const, ip: process.env.ROI_SITE_HOST_IP, host: process.env.ROI_SITE_HOST_TARGET ?? '' } : { kind: 'roi-host' as const, host: process.env.ROI_SITE_HOST_TARGET ?? '' };
  const pagesHost = d.website?.hostingProvider === 'cloudflare-pages' ? `${(d.website.design as { projectName?: string }).projectName}.pages.dev` : null;
  const records = dnsRecordsFor(d.name, pagesHost ? { kind: 'cloudflare-pages', host: pagesHost } : target);
  const dns = await step(ctx.db, ctx.jobId, 'dns', { records }, () => registrar.setRecords(d.name, records));
  const now = new Date();
  await ctx.db.$transaction(async (tx) => {
    await tx.domain.update({ where: { id: d.id }, data: { status: 'ACTIVE', registrar: registrar.name, registeredAt: now, expiresAt: new Date(now.getTime() + 365 * 86_400_000), verification: { ...(d.verification as object), verifiedAt: now.toISOString(), registrantSet: contacts.ok, registrarRequestId: reg.requestId ?? null, sandbox: registrar.sandbox } } });
    for (const r of records) await tx.dnsRecord.create({ data: { domainId: d.id, type: r.type, name: r.name, content: r.content } });
    if (d.coveredByRoi) {
      await tx.businessExpense.upsert({ where: { sourceType_sourceId: { sourceType: 'domain_registration', sourceId: d.id } }, update: {}, create: { category: 'DOMAINS', amountCents: quote.firstYearCents, incurredOn: now, vendor: registrar.name, memo: `${d.name} (ROI-covered)`, automatic: true, sourceType: 'domain_registration', sourceId: d.id } });
      await tx.financialTransaction.upsert({ where: { sourceType_sourceId_type: { sourceType: 'domain_registration', sourceId: d.id, type: 'EXPENSE' } }, update: {}, create: { type: 'EXPENSE', amountCents: -quote.firstYearCents, occurredAt: now, workspaceId: ctx.workspaceId, category: 'DOMAINS', sourceType: 'domain_registration', sourceId: d.id } });
    }
    await tx.domainRenewal.create({ data: { domainId: d.id, dueOn: new Date(now.getTime() + 365 * 86_400_000), amountCents: quote.renewalCents, coveredByRoi: d.coveredByRoi, status: 'SCHEDULED' } });
  });
  if (!contacts.ok) await log(ctx.db, ctx.jobId, 'warn', 'Registrant contact update needs manual follow-up', { message: contacts.message });
  if (!dns.ok) await log(ctx.db, ctx.jobId, 'warn', 'DNS records need manual follow-up', { message: dns.message });
  // Rebuild the site with its new domain (canonical URLs) and republish when it is live.
  if (d.website && ctx.storage) {
    const input = (d.website.content as { input?: object }).input;
    if (input) {
      const r = await buildWebsiteVersion(ctx.db, ctx.storage, { workspaceId: ctx.workspaceId, websiteId: d.website.id, input: input as never, actorId: d.workspace.ownerId, apiOrigin: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''), notes: `Domain ${d.name} registered` });
      if (r.ok && !r.unchanged && d.website.status === 'LIVE') await ctx.db.automationJob.create({ data: { type: 'website.publish', lane: 'paid', priority: 20, workspaceId: ctx.workspaceId, payload: { websiteId: d.website.id, versionId: r.version.id }, idempotencyKey: `publish:${d.website.id}:${r.version.id}:registered`, maxAttempts: 3 } });
    }
  }
  await sendEmailFromWorker(ctx.db, d.workspace.owner.email, 'domain-notice', { domain: d.name, message: `${d.name} is registered to you${d.coveredByRoi ? ' and ROI pays the yearly fee while your website subscription is active' : ''}. Your website will appear there as soon as DNS updates (usually minutes, up to a few hours).` });
  return { deliverables: 0, costMillicents: 0 };
};

export const DOMAIN_HANDLERS: Record<string, Handler> = { 'domain.register': domainRegisterHandler };
