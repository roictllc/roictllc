import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@roi/database';
import { porkbun } from '@roi/integrations';
import { buildWebsiteVersion, domainRegisterHandler, enqueue, localStorage } from '@roi/product-engine';
import { makeCustomer } from './helpers';

/** Spec §14: registrar adapter + registration job with the $15 rule (Porkbun API mocked). */
const FUTURE = new Date(Date.now() + 365 * 86_400_000);
const storage = localStorage(mkdtempSync(path.join(tmpdir(), 'roi-dom-')));

function fakePorkbun(prices: { first: string; renewal: string }, log: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }>) {
  return (async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : {};
    log.push({ url, body, headers: (init.headers ?? {}) as Record<string, string> });
    const ok = (j: object) => new Response(JSON.stringify({ status: 'SUCCESS', ...j }), { status: 200 });
    if (url.includes('/domain/checkDomain/')) return ok({ response: { avail: 'yes', price: prices.first, premium: 'no', additional: { renewal: { price: prices.renewal } } } });
    if (url.includes('/getRegistrationRequirements/')) return new Response(JSON.stringify({ status: 'SUCCESS', apiRegisterable: true }), { status: 200 });
    if (url.includes('/domain/create/')) return ok(body.dryRun ? { wouldSucceed: true } : { requestId: 'req_1' });
    return ok({});
  }) as unknown as typeof fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('Registrar (Porkbun)', () => {
  it('parses quotes, flags restricted TLDs, caps API registrations at $100 and sends idempotency keys', async () => {
    const log: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
    const pb = porkbun({ apiKey: 'pk1_sb_x', secretKey: 'sk1_sb_y', fetchImpl: fakePorkbun({ first: '10.37', renewal: '11.08' }, log) });
    expect(pb.sandbox).toBe(true);
    const q = await pb.search('BayviewDental.com');
    expect(q).toMatchObject({ name: 'bayviewdental.com', available: true, firstYearCents: 1037, renewalCents: 1108, premium: false, restricted: false });
    expect((await pb.search('bayview.us')).restricted).toBe(true);
    expect((await pb.register('x.com', { costCents: 10_001, idempotencyKey: 'k' })).ok).toBe(false);
    await pb.register('x.com', { costCents: 1037, idempotencyKey: 'reg-123' });
    const create = log.find((l) => l.url.endsWith('/domain/create/x.com'))!;
    expect(create.headers['Idempotency-Key']).toBe('reg-123');
    expect(create.body).toMatchObject({ cost: 1037, agreeToTerms: 'yes', apikey: 'pk1_sb_x' });
  });
});

describe('domain.register job', () => {
  async function setup(name: string) {
    const { ws, user } = await makeCustomer('dom');
    const built = await buildWebsiteVersion(db(), storage, { workspaceId: ws.id, input: { businessName: 'Bayview Dental', industry: 'dentist', description: 'Bayview Dental is a family practice in Tampa with gentle cleanings and emergency care.', services: [{ name: 'Cleanings', description: 'Gentle cleanings for all ages.' }], phone: '(813) 555-0142', email: 'hi@example.com', city: 'Tampa', state: 'FL', serviceAreas: [], colors: ['#0B5FFF'], design: 'clean', ctaGoal: 'call', social: {}, testimonials: [] } as never, actorId: user.id, apiOrigin: 'https://roi.example' });
    if (!built.ok) throw new Error('build');
    await db().website.update({ where: { id: built.websiteId }, data: { status: 'LIVE' } });
    const d = await db().domain.create({ data: { name, workspaceId: ws.id, websiteId: built.websiteId, status: 'REGISTERING', coveredByRoi: true, verification: {} } });
    const contact = { firstName: 'Dana', lastName: 'Rivera', email: user.email, phone: '+1.8135550142', address1: '1 Main St', city: 'Tampa', state: 'FL', zip: '33602', country: 'US' };
    const job = await enqueue(db(), { type: 'domain.register', payload: { domainId: d.id, contact }, idempotencyKey: `dr-${d.id}`, workspaceId: ws.id, runAt: FUTURE });
    return { ws, d, websiteId: built.websiteId, ctx: { db: db(), storage, jobId: job.id, workspaceId: ws.id, orderItemId: null, payload: { domainId: d.id, contact }, computeRateMillicentsPerS: 1 } };
  }

  it('registers a covered domain: DNS, ROI expense, renewal, site rebuilt and republished', async () => {
    process.env.REGISTRAR_API_KEY = 'pk1_sb_x';
    process.env.REGISTRAR_API_SECRET = 'sk1_sb_y';
    process.env.ROI_SITE_HOST_IP = '203.0.113.10';
    process.env.ROI_SITE_HOST_TARGET = 'sites.roi.example';
    const log: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
    vi.stubGlobal('fetch', fakePorkbun({ first: '10.37', renewal: '11.08' }, log));
    const name = `bayview-${Date.now()}.com`;
    const { d, websiteId, ctx } = await setup(name);
    await domainRegisterHandler(ctx);
    const after = await db().domain.findUniqueOrThrow({ where: { id: d.id }, include: { dnsRecords: true, renewals: true } });
    expect(after.status).toBe('ACTIVE');
    expect(after.dnsRecords.map((r) => `${r.type} ${r.name} ${r.content}`).sort()).toEqual(['A  203.0.113.10', 'CNAME www sites.roi.example']);
    expect(after.renewals[0]).toMatchObject({ amountCents: 1108, coveredByRoi: true, status: 'SCHEDULED' });
    expect(await db().businessExpense.findUnique({ where: { sourceType_sourceId: { sourceType: 'domain_registration', sourceId: d.id } } })).toMatchObject({ category: 'DOMAINS', amountCents: 1037 });
    expect(log.filter((l) => l.url.includes('/domain/create/')).map((l) => l.body.dryRun ?? false)).toEqual([true, false]);
    expect(log.some((l) => l.url.includes('/domain/updateContacts/'))).toBe(true);
    const versions = await db().websiteVersion.count({ where: { websiteId } });
    expect(versions).toBe(2); // rebuilt with the domain as canonical
    expect(await db().automationJob.count({ where: { type: 'website.publish', payload: { path: ['websiteId'], equals: websiteId } } })).toBe(1);
  });

  it('stops when the price moved into the customer-pays category before purchase', async () => {
    vi.stubGlobal('fetch', fakePorkbun({ first: '10.37', renewal: '16.00' }, []));
    const { d, ctx } = await setup(`pricey-${Date.now()}.com`);
    await expect(domainRegisterHandler(ctx)).rejects.toThrow(/Price category changed/);
    expect((await db().domain.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('QUOTED');
  });
});
