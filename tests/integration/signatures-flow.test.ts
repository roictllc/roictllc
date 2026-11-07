import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { db } from '@roi/database';
import { enqueue, ingestLogoUpload, localStorage, renderSignature, signatureHandler } from '@roi/product-engine';
import { signDraft, verifyDraft } from '@/server/drafts';
import { makeCustomer, planFor } from './helpers';

/** Jobs here are run by calling handlers directly; scheduling them far ahead keeps other tests' claim() calls away. */
const FUTURE = new Date(Date.now() + 365 * 86_400_000);

/** Product 8 order flow (spec §12): signed drafts, safe links, static-logo publishing, full paid suite. */
const storage = localStorage(mkdtempSync(path.join(tmpdir(), 'roi-sig-')));

describe('Email Signature Suite flow', () => {
  it('signed drafts only verify unchanged, for the same workspace, before expiry', () => {
    const t = signDraft({ a: 1 }, 'ws1');
    expect(verifyDraft(t, 'ws1')).toEqual({ a: 1 });
    expect(verifyDraft(t, 'ws2')).toBeNull();
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ d: { a: 2 }, w: 'ws1', e: 9e9 })).toString('base64url');
    expect(verifyDraft(`${forged}.${sig}`, 'ws1')).toBeNull();
    expect(verifyDraft(`${body}.${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`, 'ws1')).toBeNull(); // always a different signature
    expect(verifyDraft(signDraft({ a: 1 }, 'ws1', -1), 'ws1')).toBeNull();
  });

  it('drops javascript: and data: links from signatures', () => {
    const { html } = renderSignature('banner', { name: 'Acme', colors: ['#0B5FFF'], website: 'javascript:alert(1)', bannerText: 'Go', bannerUrl: 'data:text/html,x', social: { x: 'javascript:alert(2)', linkedin: 'https://linkedin.com/company/acme' } }, { name: 'Dana', email: 'dana@acme.test', extraLink: 'javascript:alert(3)' });
    expect(html).not.toMatch(/javascript:|data:text/i);
    expect(html).toContain('https://linkedin.com/company/acme');
  });

  it('publishes the uploaded static logo and delivers a linted suite for every employee', async () => {
    const { ws, user } = await makeCustomer('sig');
    const logo = await sharp({ create: { width: 600, height: 240, channels: 4, background: '#0B5FFF' } }).png().toBuffer();
    const { asset } = await ingestLogoUpload(db(), storage, { workspaceId: ws.id, buf: logo, purpose: 'email-signature-suite', minSide: 64 });
    const inputs = {
      company: { name: 'Bayview Dental', website: 'https://bayview.example', colors: ['#0B5FFF', '#111827'], logoAssetId: asset.id, useAnimatedLogo: true, social: { linkedin: 'https://linkedin.com/company/bayview' } },
      templateSlug: 'classic-left',
      employees: [{ name: 'Dana Rivera', title: 'Owner', email: 'dana@bayview.example', phone: '(813) 555-0142' }, { name: 'Sam Lee', email: 'sam@bayview.example' }],
      utm: true,
    };
    const { product, plan, price } = await planFor('email-signature-suite');
    const order = await db().order.create({
      data: { orderNumber: `T-${Date.now()}`, workspaceId: ws.id, userId: user.id, status: 'PROCESSING', subtotalCents: price.amountCents, totalCents: price.amountCents, items: { create: { productId: product.id, planId: plan.id, priceId: price.id, unitAmountCents: price.amountCents, status: 'PROCESSING', idempotencyKey: `oi_${Date.now()}`, input: { create: { formVersion: 1, data: inputs } } } } },
      include: { items: true },
    });
    const item = order.items[0];
    const job = await enqueue(db(), { type: 'product.email-signature-suite', payload: { orderItemId: item.id }, idempotencyKey: `sig-${item.id}`, workspaceId: ws.id, orderItemId: item.id, runAt: FUTURE });
    await signatureHandler({ db: db(), storage, jobId: job.id, workspaceId: ws.id, orderItemId: item.id, payload: {}, computeRateMillicentsPerS: 1 });
    const files = await db().generatedDeliverable.findMany({ where: { workspaceId: ws.id } });
    const logoFile = files.find((f) => f.kind === 'signature-logo')!;
    expect(logoFile.publicUrl).toBeTruthy();
    const zip = files.find((f) => f.kind === 'signature-zip')!;
    const p = path.join(mkdtempSync(path.join(tmpdir(), 'roi-sigzip-')), 's.zip');
    writeFileSync(p, await storage.get('private', zip.storageKey));
    const listing = execFileSync('unzip', ['-Z1', p]).toString();
    for (const n of ['signatures/dana-rivera.html', 'signatures/dana-rivera.txt', 'signatures/sam-lee.html', 'gallery.html', 'install-guides/gmail.txt', 'install-guides/outlook.txt']) expect(listing).toContain(n);
    const dana = execFileSync('unzip', ['-p', p, 'signatures/dana-rivera.html']).toString();
    expect(dana).toContain(logoFile.publicUrl!);
    expect(dana).toContain('utm_source=email-signature');
    expect((await db().orderItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('COMPLETED');
  });
});
