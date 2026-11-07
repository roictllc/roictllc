import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { db } from '@roi/database';
import { buildWebsiteVersion, localStorage, publishWebsiteVersion, resolveSitePath } from '@roi/product-engine';
import { cloudflarePages, pagesAssetHash } from '@roi/site-generator';
import { makeCustomer } from './helpers';

/** Product 5 (spec §12): versions, provider protocol, publishing + rollback, multi-tenant serving, TLS gate. */
const dir = mkdtempSync(path.join(tmpdir(), 'roi-sites-'));
process.env.LOCAL_STORAGE_DIR = dir;
const storage = localStorage(dir);

const input = (name: string) => ({
  businessName: name, industry: 'dentist', description: `${name} is a family dental practice offering cleanings, fillings and emergency visits for all ages.`,
  services: [{ name: 'Cleanings', description: 'Gentle cleanings and checkups for the whole family.' }, { name: 'Emergency visits', description: 'Same-day help for tooth pain and injuries.' }],
  phone: '(813) 555-0142', email: 'hello@example.com', city: 'Tampa', state: 'FL', serviceAreas: [], colors: ['#0B5FFF'], design: 'clean' as const, ctaGoal: 'call' as const, social: {}, testimonials: [],
});

describe('Websites', () => {
  it('builds immutable versions: first save, unchanged save, edit', async () => {
    const { ws, user } = await makeCustomer('site');
    const a = await buildWebsiteVersion(db(), storage, { workspaceId: ws.id, input: input('Bayview Dental'), actorId: user.id, apiOrigin: 'https://roi.example' });
    expect(a.ok && a.version.version).toBe(1);
    if (!a.ok) return;
    expect(a.ms).toBeLessThan(5000);
    const same = await buildWebsiteVersion(db(), storage, { workspaceId: ws.id, websiteId: a.websiteId, input: input('Bayview Dental'), actorId: user.id, apiOrigin: 'https://roi.example' });
    expect(same.ok && same.unchanged).toBe(true);
    const edited = await buildWebsiteVersion(db(), storage, { workspaceId: ws.id, websiteId: a.websiteId, input: { ...input('Bayview Dental'), tagline: 'Gentle care since 1998' }, actorId: user.id, apiOrigin: 'https://roi.example' });
    expect(edited.ok && edited.version.version).toBe(2);
    expect((await db().website.findUniqueOrThrow({ where: { id: a.websiteId } })).status).toBe('PREVIEW');
  });

  it('maps request paths to bundle files', () => {
    const files = { 'index.html': 'h', 'about/index.html': 'a', 'styles.css': 'c', '404.html': 'n' };
    expect(resolveSitePath(files, '/')).toEqual({ file: 'index.html', status: 200 });
    expect(resolveSitePath(files, '/about/')).toEqual({ file: 'about/index.html', status: 200 });
    expect(resolveSitePath(files, '/about')).toEqual({ file: 'about/index.html', status: 200 });
    expect(resolveSitePath(files, '/../../etc/passwd')).toEqual({ file: '404.html', status: 404 });
  });

  it('Cloudflare Pages direct upload: hashes, JWT calls without account prefix, manifest with leading slashes', async () => {
    const calls: Array<{ url: string; auth: string; body: unknown }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      calls.push({ url, auth, body: init.body instanceof FormData ? Object.fromEntries(init.body) : init.body ? JSON.parse(String(init.body)) : null });
      const ok = (result: unknown) => new Response(JSON.stringify({ success: true, result }), { status: 200 });
      if (url.endsWith('/pages/projects/roi-test-1') && !init.method) return new Response(JSON.stringify({ success: false, errors: [{ code: 8000007, message: 'not found' }] }), { status: 404 });
      if (url.endsWith('/upload-token')) return ok({ jwt: 'JWT123' });
      if (url.endsWith('/check-missing')) return ok([(calls.at(-1)!.body as { hashes: string[] }).hashes[0]]);
      if (url.endsWith('/deployments')) return ok({ id: 'dep_1', url: 'https://abc.roi-test-1.pages.dev' });
      return ok({});
    }) as unknown as typeof fetch;
    const cf = cloudflarePages({ accountId: 'acct', apiToken: 'TOKEN', fetchImpl: fake });
    const r = await cf.deploy({ websiteId: 'w1', projectName: 'roi-test-1' }, { 'index.html': '<h1>Hi</h1>', 'styles.css': 'body{}' });
    expect(r.providerDeploymentId).toBe('dep_1');
    const paths = calls.map((c) => c.url.replace('https://api.cloudflare.com/client/v4', ''));
    expect(paths).toEqual(['/accounts/acct/pages/projects/roi-test-1', '/accounts/acct/pages/projects', '/accounts/acct/pages/projects/roi-test-1/upload-token', '/pages/assets/check-missing', '/pages/assets/upload', '/pages/assets/upsert-hashes', '/accounts/acct/pages/projects/roi-test-1/deployments']);
    expect(calls.filter((c) => c.url.includes('/pages/assets/')).every((c) => c.auth === 'Bearer JWT123')).toBe(true);
    expect(calls.find((c) => c.url.endsWith('/deployments'))!.auth).toBe('Bearer TOKEN');
    const upload = calls.find((c) => c.url.endsWith('/upload'))!.body as Array<{ key: string; base64: boolean }>;
    expect(upload).toHaveLength(1); // only the missing asset is uploaded
    const manifest = JSON.parse((calls.at(-1)!.body as { manifest: string }).manifest);
    expect(Object.keys(manifest).sort()).toEqual(['/index.html', '/styles.css']);
    expect(manifest['/index.html']).toBe(pagesAssetHash(Buffer.from('<h1>Hi</h1>'), 'index.html'));
    expect(manifest['/index.html']).toMatch(/^[0-9a-f]{32}$/);
    expect(pagesAssetHash(Buffer.from('x'), 'a.html')).not.toBe(pagesAssetHash(Buffer.from('x'), 'a.css'));
  });

  it('publishes on the ROI host, rolls back, serves by verified domain, and gates TLS', async () => {
    process.env.ROI_SITE_HOST_TARGET = 'sites.roi.example';
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    const { ws, user } = await makeCustomer('host');
    const v1 = await buildWebsiteVersion(db(), storage, { workspaceId: ws.id, input: input('Harbor Smiles'), actorId: user.id, apiOrigin: 'https://roi.example' });
    if (!v1.ok) throw new Error('build failed');
    const v2 = await buildWebsiteVersion(db(), storage, { workspaceId: ws.id, websiteId: v1.websiteId, input: { ...input('Harbor Smiles'), tagline: 'Version two' }, actorId: user.id, apiOrigin: 'https://roi.example' });
    if (!v2.ok) throw new Error('build failed');
    const price = await db().productPrice.findFirstOrThrow({ where: { plan: { product: { slug: 'landing-page-hosting' } } } });
    const sub = await db().subscription.create({ data: { workspaceId: ws.id, priceId: price.id, stripeSubscriptionId: `sub_${Date.now()}`, status: 'ACTIVE', currentPeriodStart: new Date() } });
    await db().website.update({ where: { id: v1.websiteId }, data: { subscriptionId: sub.id } });
    const name = `harbor-${Date.now()}.example`;
    await db().domain.create({ data: { name, workspaceId: ws.id, websiteId: v1.websiteId, status: 'EXTERNAL', external: true, verification: { txtName: `_roi-verify.${name}`, txtValue: 'x' } } });

    const { GET: tls } = await import('../../apps/web/src/app/api/sites/tls-allowed/route');
    const { GET: serve } = await import('../../apps/web/src/app/site-host/[host]/[[...path]]/route');
    expect((await tls(new Request(`http://x/api/sites/tls-allowed?domain=${name}`))).status).toBe(404); // not verified, not live

    const p2 = await publishWebsiteVersion(db(), storage, { websiteId: v1.websiteId });
    expect(p2).toMatchObject({ provider: 'roi-host', version: 2 });
    expect((await tls(new Request(`http://x/api/sites/tls-allowed?domain=${name}`))).status).toBe(404); // still unverified
    await db().domain.update({ where: { name }, data: { verification: { txtName: 'x', txtValue: 'x', verifiedAt: new Date().toISOString() } } });
    expect((await tls(new Request(`http://x/api/sites/tls-allowed?domain=${name}`))).status).toBe(200);
    expect((await tls(new Request('http://x/api/sites/tls-allowed?domain=random.example'))).status).toBe(404);

    const home = await serve(new Request(`https://${name}/`), { params: Promise.resolve({ host: name, path: [] }) });
    expect(home.status).toBe(200);
    expect(home.headers.get('content-security-policy')).toContain("script-src 'none'");
    expect(await home.text()).toContain('Version two');

    await publishWebsiteVersion(db(), storage, { websiteId: v1.websiteId, versionId: v1.version.id }); // rollback
    const deps = await db().websiteDeployment.findMany({ where: { websiteId: v1.websiteId }, include: { version: true } });
    expect(deps.filter((d) => d.status === 'LIVE').map((d) => d.version?.version)).toEqual([1]);
    expect(deps.filter((d) => d.status === 'SUPERSEDED')).toHaveLength(1);
    expect(await (await serve(new Request(`https://${name}/`), { params: Promise.resolve({ host: name, path: [] }) })).text()).not.toContain('Version two');

    await db().subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE', graceUntil: new Date(Date.now() - 1000) } });
    const placeholder = await serve(new Request(`https://${name}/`), { params: Promise.resolve({ host: name, path: [] }) });
    expect(placeholder.status).toBe(503);
    expect(await placeholder.text()).toContain('temporarily unavailable');
  });
});
