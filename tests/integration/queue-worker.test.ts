import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { db } from '@roi/database';
import { claim, enqueue, fail, sweepStuck, backoffSeconds, signatureHandler, localStorage, complete } from '@roi/product-engine';
import { makeCustomer, makeOrder } from './helpers';

describe('PostgreSQL queue (spec §10)', () => {
  it('enqueue is idempotent and concurrent claims never return the same job', async () => {
    const { ws } = await makeCustomer('q');
    const keys = Array.from({ length: 6 }, (_, i) => `test-q-${ws.id}-${i}`);
    for (const k of keys) await enqueue(db(), { type: 'test.noop', payload: {}, idempotencyKey: k, workspaceId: ws.id });
    await enqueue(db(), { type: 'test.noop', payload: {}, idempotencyKey: keys[0], workspaceId: ws.id });
    expect(await db().automationJob.count({ where: { idempotencyKey: { in: keys } } })).toBe(6);
    const claims = await Promise.all(Array.from({ length: 6 }, (_, i) => claim(db(), `w${i}`, ['test.noop'], 60, { 'test.noop': 10 })));
    const ids = claims.filter(Boolean).map((c) => c!.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(6);
  });
  it('retries with exponential backoff, then dead-letters', async () => {
    const j = await enqueue(db(), { type: 'test.fail', payload: {}, idempotencyKey: `fail-${Date.now()}`, maxAttempts: 2 });
    const c1 = await claim(db(), 'w', ['test.fail']);
    expect(c1!.id).toBe(j.id);
    expect(await fail(db(), c1!, 'boom')).toBe(false);
    const after = await db().automationJob.findUniqueOrThrow({ where: { id: j.id } });
    expect(after.status).toBe('PENDING');
    expect(after.runAt.getTime()).toBeGreaterThan(Date.now() + (backoffSeconds(1) - 2) * 1000);
    await db().automationJob.update({ where: { id: j.id }, data: { runAt: new Date() } });
    const c2 = await claim(db(), 'w', ['test.fail']);
    expect(await fail(db(), c2!, 'boom again')).toBe(true);
    expect((await db().automationJob.findUniqueOrThrow({ where: { id: j.id } })).status).toBe('DEAD');
  });
  it('sweeper re-queues jobs whose lease expired', async () => {
    const j = await enqueue(db(), { type: 'test.stuck', payload: {}, idempotencyKey: `stuck-${Date.now()}` });
    await claim(db(), 'crashed', ['test.stuck'], 1);
    await db().$executeRaw`UPDATE automation_jobs SET "leaseUntil" = now() - interval '1 minute' WHERE id = ${j.id}`;
    await sweepStuck(db());
    expect((await db().automationJob.findUniqueOrThrow({ where: { id: j.id } })).status).toBe('PENDING');
  });
});

describe('worker delivers Product 8 end-to-end with real files', () => {
  it('order → job → validated deliverables → order COMPLETED → cost recorded', async () => {
    const { user, ws } = await makeCustomer('sig');
    const inputs = { templateSlug: 'classic-left', company: { name: 'Acme', website: 'https://acme.example', colors: ['#00E5FF'], logoUrl: 'https://assets.roictllc.com/x/logo.png', logoWidth: 600, logoHeight: 300 }, employees: [{ name: 'Ann', email: 'ann@acme.example' }, { name: 'Bo', email: 'bo@acme.example', phone: '(813) 555-0100' }] };
    const order = await makeOrder(ws.id, user.id, 'email-signature-suite', inputs);
    await db().order.update({ where: { id: order.id }, data: { status: 'PROCESSING' } });
    const job = await enqueue(db(), { type: 'product.email-signature-suite', payload: {}, idempotencyKey: `${order.items[0].id}:deliver`, workspaceId: ws.id, orderItemId: order.items[0].id });
    const claimed = await claim(db(), 'test-worker', ['product.email-signature-suite']);
    expect(claimed!.id).toBe(job.id);
    const dir = mkdtempSync(path.join(tmpdir(), 'roi-store-'));
    const storage = localStorage(dir);
    const r = await signatureHandler({ db: db(), storage, jobId: job.id, workspaceId: ws.id, orderItemId: order.items[0].id, payload: {}, computeRateMillicentsPerS: 1 });
    await complete(db(), job.id, r, r.costMillicents);
    const files = await db().generatedDeliverable.findMany({ where: { orderItemId: order.items[0].id } });
    expect(files.map((f) => f.kind).sort()).toEqual(['signature-gallery', 'signature-zip']);
    for (const f of files) expect(existsSync(path.join(dir, 'private', f.storageKey))).toBe(true);
    expect((await db().order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('COMPLETED');
    expect(await db().productionCost.count({ where: { orderItemId: order.items[0].id } })).toBe(1);
    expect(await db().automationStep.count({ where: { jobId: job.id, status: 'COMPLETED' } })).toBe(3);
  });
});
